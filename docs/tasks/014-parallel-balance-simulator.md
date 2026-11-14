# [Задача 014] Параллелизация, оптимизация и расширение симулятора баланса

> **Статус:** Реализовано

## 1. Цели, контекст и границы (Context & Agreed Scope)

### 1.1. Контекст проблемы

Сейчас автономный симулятор [`scripts/simulate-balance.js`](../../scripts/simulate-balance.js) непригоден для быстрых итераций баланса при расширении пула классов и предметов:

* **Однопоточное выполнение:** в `main()` весь пул сущностей (`~157` шт., при `--full` по `20` запусков × `6` стилей × `4` этажа × `CLASSES`) обсчитывается последовательно в одном потоке на машине с `24` логическими ядрами, что занимает более `2` минут за полный прогон.
* **Синхронный оверхед внутри симуляции:**
  * В [`battle.js`](../../src/engine/systems/battle.js) и [`game.js`](../../src/engine/game.js) на каждом ходу, применении зелья и старте забега вызывается `saveGame("autosave")`, который через [`save.js`](../../src/engine/systems/save.js) сериализует весь объект `game` в `JSON.stringify` впустую.
  * `game.startRun()` каждый раз генерирует 2D-карту подземелья через `DungeonGenerator.generate(this.floor)`, хотя линейный прогон `GAUNTLET_STEPS` карты не использует.
  * В `createEnemyInstance()` ([`battle.js`](../../src/engine/systems/battle.js)) шаблон врага на каждый спавн клонируется через `JSON.parse(JSON.stringify(template))`.
* **Неполный состав классов:** массив `CLASSES` ограничен тройкой `["wanderer", "assassin", "crusader"]` (`reaper`, `arcanist`, `engineer` не участвуют в оценке предметов и не имеют сравнительного прогона в симуляторе).

### 1.2. Что входит в скоуп

1. **Многопоточный пул воркеров (`node:worker_threads`):** распараллеливание расчёта `calculateFloorBaselines`, `evaluateFloorItem` и нового режима `--classes` без внешних npm-зависимостей.
2. **Оптимизация рантайма симуляции:**
   * Отключение холостых `saveGame` / `saveMeta` и лишней генерации 2D-карты в прогонах `GAUNTLET_STEPS`.
3. **Поддержка всех 6 классов:** расширение `CLASSES` в `scripts/simulate-balance.js` на `["wanderer", "crusader", "assassin", "reaper", "arcanist", "engineer"]` и сохранение поддержки новых классов при добавлении в `DATA_CLASSES`.
4. **Новый CLI-режим `--classes`:** сравнительный прогон всех классов в единой модели симулятора (`FLOOR_PROFILES` × `PLAYSTYLES` на `GAUNTLET_STEPS`) с выводом сводной таблицы силы классов рядом с их ценой разблокировки в Душах.
5. **Совместимость и детерминизм:** сохранение работы всех текущих CLI-флагов (`--full`, `--runs`, `--id`, `--category`, `--class`, `--floor`, `--abyss`, `--colorize`, `--no-report`) и побитовой идентичности метрик относительно однопоточного запуска.

### 1.3. Явно вне скоупа (Non-goals)

* Изменение числовых параметров баланса классов, предметов, перков, цен, правил дропа и кривой врагов (вынесено в Задачу `015`).
* Изменение эталонных матриц `EXPECTED_ROI_MATRIX` и `PERK_EXPECTED_PCT_BY_RARITY` (перекалибровка идёт в Задаче `015`).
* Изменение боевого движка [`battle.js`](../../src/engine/systems/battle.js) (от ручного клонирования в `createEnemyInstance` отказались после контрольного замера: выигрыш составил всего `~1.4s` / `4.7%` на `--full`, что не оправдывает риск утечки по ссылке при расширении `DATA_ENEMIES`).
* Внедрение тестовых раннеров (Jest, Vitest, `node:test`) и автотестов согласно запрету в [`AGENTS.md`](../../AGENTS.md).

---

## 2. Архитектура и контракты (Architecture & Contracts)

### 2.1. Однофайловая схема Main / Worker (`node:worker_threads`)

[`scripts/simulate-balance.js`](../../scripts/simulate-balance.js) остаётся единым ES-модулем (без npm и сборщиков), разделяя ответственность по `isMainThread`:

* **Главный поток (`isMainThread === true`):**
  * Разбирает CLI-аргументы, включая новый флаг `--workers <N>` и `--classes`.
  * При числе независимых задач `< 4` (например, `--id p35`), при `--workers 1`, `--colorize` или `--abyss` не спавнит пул воркеров и выполняется в основном потоке без накладных расходов на запуск V8-изолятов.
  * Иначе поднимает пул из `workerCount = Math.min(requestedWorkers, totalTasks)` воркеров (по умолчанию `requestedWorkers = Math.max(1, os.cpus().length - 1)`), передавая конфигурацию запуска через `workerData`.
  * Раздаёт задания из очереди (`work queue`, по 1 сущности или группе симуляций за раз), собирает результаты в индексированный массив для сохранения строго детерминированного порядка `sortByIdNatural` и пишет вывод в консоль и markdown-отчёты (`docs/balance-report.md`, `docs/items-and-perks-balance.md`).
* **Поток воркера (`isMainThread === false`):**
  * До импорта игровых модулей инициализирует локальные полифилы `global.localStorage`, `global.window`, синхронный `global.setTimeout` и `global.clearTimeout`.
  * Выполняет чистые вычисления (`runFloorSample` / `evaluateFloorItem` / прогон класса) с локальным состоянием `baselines` и возвращает сериализованный JSON-результат в главный поток через `parentPort.postMessage(...)`.
  * Не пишет в файлы отчётов и не печатает таблицы напрямую.

### 2.2. Изолированные оптимизации производительности

1. **Пропуск холостой сериализации и генерации карты в линейных прогонах:**
   * В `simulateFloorRun` и в расчёте `--classes` инстанс `game` после `game.init()` получает no-op заглушки `game.saveGame = () => null;` и `game.saveMeta = () => {};`.
   * Для прогонов по `GAUNTLET_STEPS` в `simulateFloorRun` `game.generateFloorMap` заменяется на no-op до вызова `game.startRun(classId)` (т.к. 2D-карта не используется, а генератор отнимает время на каждый забег). При необходимости `player.secondWindAvailable = true` выставляется явно (в `Player` конструкторе и так `true`).
   * Режим `--abyss` (`verifyAbyssContracts` и `simulateAbyssDeepRun`) **не** отключает `generateFloorMap()` там, где проверяется `DungeonGenerator`, и полностью сохраняет все проверки контрактов Бездны.

### 2.3. Контракт расширения `CLASSES` и режима `--classes`

* Массив `CLASSES` обновляется со статичной тройки до полного списка из `GAME_DATA.classes` (или `["wanderer", "crusader", "assassin", "reaper", "arcanist", "engineer"]`), с сохранением фильтрации `--class <id>`.
* Новый CLI-флаг `--classes`:
  * Прогоняет все активные классы на тех же `ACTIVE_FLOOR_PROFILES` (`Э1–Э4`) и `PLAYSTYLES` (`6` стилей), что и оценка предметов (`itemDef = null`).
  * Поддерживает `--runs <N>`, `--floor <K>`, `--class <id>`, `--workers <N>`.
  * Выводит в консоль сравнительную таблицу классов (в порядке возрастания цены в Душах):
    * `Класс`, `Цена (души)`, `Э1..Э4` (средние пройденные комнаты / % закрытия этажей среза), `Ср. Комн`, `Ср. Урон`, `Относ. сила к Страннику (×)`.
  * Не перезаписывает [`docs/balance-report.md`](../balance-report.md) и [`docs/items-and-perks-balance.md`](../items-and-perks-balance.md) (работает как отдельный диагностический отчёт в консоль).

---

## 3. Обработка краевых случаев и отказов (Edge Cases & Resilience)

1. **Побитовый детерминизм при многопоточности:**
   * В `simulateFloorRun` сид выставляется через `setSeed(getRoomSeed(playstyleId, classId, runIndex, sIdx))` внутри каждого шага и зависит строго от параметров шага, а не от глобальной истории ГПСЧ или порядка планировщика потоков.
   * Вычисление `baselines` должно завершаться до запуска очереди `itemPool`, чтобы каждый воркер получил идентичный слепок `baselines`.
2. **Аварийное завершение воркеров:**
   * При событии `error` или выходе воркера с ненулевым кодом до завершения очереди главный поток обязан логировать контекст ошибки, принудительно завершить все активные воркеры (`worker.terminate()`) и выйти с `process.exit(1)` без зависания промиса очереди.
3. **Сохранение скорости одиночных команд:**
   * При `--id <id>` (1 задача) или малом числе задач пул воркеров не запускается, чтобы не платить ~100–200 мс на старт дочерних V8-контекстов ради 1 элемента.
4. **Очистка глобального состояния при каждом запуске:**
   * `localStorage` в полифиле воркера изолирован от диска и между заданиями не хранит реальных сохранений; перед возвратом в основном потоке `restoreRandom()` корректно восстанавливает нативный `Math.random`.

---

## 4. Пошаговый план реализации (Implementation Plan)

*(Согласно [`AGENTS.md`](../../AGENTS.md) автотесты и TDD-файлы не создаются; проверка выполняется контрольными прогонами симулятора и вручную в браузере.)*

1. **Симуляторные no-op оптимизации ([`scripts/simulate-balance.js`](../../scripts/simulate-balance.js)):**
   * В `simulateFloorRun` заглушить `saveGame`, `saveMeta` и `generateFloorMap` (для `GAUNTLET_STEPS`), убедившись в сохранности `verifyAbyssContracts()`.
2. **Расширение `CLASSES` и режим `--classes` ([`scripts/simulate-balance.js`](../../scripts/simulate-balance.js)):**
   * Подключить все 6 классов в `CLASSES`.
   * Реализовать обработку `--classes` (сбор метрик по `FLOOR_PROFILES` и `PLAYSTYLES`, форматированный табличный вывод с ценами из `DATA_CLASSES` и коэффициентом силы относительно `wanderer`).
3. **Внедрение пула `node:worker_threads` ([`scripts/simulate-balance.js`](../../scripts/simulate-balance.js)):**
   * Добавить разбор `--workers <N>` и ветку `isMainThread` / `!isMainThread`.
   * Распараллелить расчёт `baselines`, основной цикл оценки `itemPool` и прогон `--classes` через динамическую очередь задач, сохраняя порядок вывода и корректную обработку ошибок воркеров.
4. **Контрольная проверка детерминизма, скорости и контрактов.**

---

## 5. Верификация и критерии приёмки (Verification & Definition of Done)

### 5.1. Синтаксическая и безголовая верификация

1. Проверка синтаксиса изменённого модуля:

   ```powershell
   node --check scripts/simulate-balance.js
   ```

2. Проверка побитового детерминизма (1 поток vs многопоточность):
   * Сравнить консольный вывод `node scripts/simulate-balance.js --category perks --workers 1 --no-report` и `node scripts/simulate-balance.js --category perks --workers 16 --no-report` — все `Δ%`, `ROI`, `VS` и `Ср.Комн` должны совпадать точно.
3. Проверка контрактов Бездны:
   * `node scripts/simulate-balance.js --abyss --no-report` — все ассерты `verifyAbyssContracts()` пройдены без ошибок.
4. Проверка режима классов:
   * `node scripts/simulate-balance.js --classes --no-report` — выводит таблицу по всем 6 классам в порядке цены с метриками `Э1–Э4`.
5. Проверка скорости полного прогона:
   * `node scripts/simulate-balance.js --full --no-report` — значительное ускорение относительно текущих `2+` минут (ориентир <= `15–25` секунд при 6 классах и 20 прогонах/стиль на 24-поточном CPU).

### 5.2. Ручная проверка в браузере (`src/index.html`)

* Не требуется: код в `src/` остался без изменений, правки ограничены [scripts/simulate-balance.js](../../scripts/simulate-balance.js).
