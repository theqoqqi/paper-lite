# [Задача 019] Внедрение поддержки записи и хранения реплеев

> **Статус:** Спроектировано (Ожидает реализации после [Задачи 018](018-scoped-world-generation-seeds.md))

## 1. Цели и контекст

После перевода игры на детерминированный PRNG ([Задача 017](017-seeded-rng.md)) и контекстные сиды генерации мира ([Задача 018](018-scoped-world-generation-seeds.md)) любая партия однозначно определяется начальным состоянием (`initialState`) и упорядоченным списком действий игрока (`actions[]`).

Однако сейчас в UI игры есть места, где состояние `game` мутируется напрямую из обработчиков `onClick` в обход методов движка (выбор цели в бою, переход на следующий этаж, повторный вход в лавку, закрытие наград события, развилка Бездны).

**Цели задачи:**

1. Инкапсулировать 100% пользовательских переходов состояния в методы класса `Game`, чтобы ни одно игровое действие не происходило в обход движка.
2. Создать систему записи и хранения реплеев (`src/engine/systems/replay.js`) отдельно от слотов сохранений.
3. Поддержать запись реплея как с самого старта забега, так и с середины игры (при загрузке ручного слота или импорте JSON-сейва).
4. Хранить до **100 последних реплеев** в `localStorage` и добавить отдельное модальное окно «🎬 Реплеи» (в главном меню и меню настроек) с просмотром метаданных, экспортом/импортом JSON и удалением.

**Границы задачи (Non-Goals):**

* Плеер и визуальное воспроизведение реплеев реализуются в следующей задаче ([Задача 020](020-replay-player.md)).

---

## 2. Архитектура и контракты

### 2.1. Формат реплея и ключи `localStorage` (`src/engine/systems/replay.js`)

* **Ключи хранилища:**
  * `roguelite_active_replay` — текущая записываемая сессия активного забега.
  * `roguelite_replay_history` — массив завершённых (или прерванных) реплеев, максимум `MAX_REPLAY_HISTORY = 100` (при добавлении 101-го самый старый вытесняется; при `QuotaExceededError` старые записи удаляются в цикле до успешной записи).

* **Структура объекта реплея:**

  ```json
  {
    "id": "rep_1763230000000_284910421",
    "version": 1,
    "seed": 284910421,
    "classId": "wanderer",
    "className": "Странник",
    "startedAt": 1763230000000,
    "updatedAt": 1763230095000,
    "finishedAt": 1763230095000,
    "outcome": "VICTORY",
    "reachedFloor": 4,
    "initialState": { /* распарсенный объект serializeState(game) в момент начала записи */ },
    "actions": [
      { "seq": 0, "t": "move", "p": { "x": 0, "y": -1 } },
      { "seq": 1, "t": "target", "p": 1 },
      { "seq": 2, "t": "skill", "p": "fast" }
    ]
  }
  ```

* Возможные значения `outcome`: `"IN_PROGRESS"`, `"VICTORY"`, `"GAMEOVER"`, `"INTERRUPTED"`.

---

### 2.2. Жизненный цикл записи реплея

1. **Старт нового забега (`game.startRun(classKey, customSeed)`):**
   * Если в `roguelite_active_replay` осталась незавершённая запись с `actions.length > 0`, она переносится в `roguelite_replay_history` со статусом `outcome = "INTERRUPTED"`.
   * Создаётся новый объект `activeReplay`, где `initialState = JSON.parse(game.serializeState())`, `actions = []`, и сохраняется в `roguelite_active_replay`.

2. **Продолжение из `autosave` (`game.loadGame("autosave")`):**
   * Загружается `roguelite_active_replay`.
   * Если активный реплей существует и его `seed === game.seed`, запись продолжается в него со следующего `seq = activeReplay.actions.length`.
   * Если `roguelite_active_replay` отсутствует или не соответствует загруженному состоянию, автоматически стартует новая запись, где `initialState = JSON.parse(game.serializeState())`.

3. **Загрузка ручного слота (`slot1..3`) или импорт JSON-сейва:**
   * Предыдущий `activeReplay` (если в нём `actions.length > 0`) архивируется в `roguelite_replay_history` со статусом `"INTERRUPTED"`.
   * Сразу создаётся новый `activeReplay`, где `initialState` — только что загруженное состояние игры. Благодаря этому реплей, начатый посреди игры, всегда корректно воспроизводится с момента начала его записи.

4. **Завершение забега (`game.finalizeRun(outcomeState)`):**
   * В `activeReplay` проставляются `outcome = outcomeState` (`"VICTORY"` или `"GAMEOVER"`), `finishedAt = Date.now()`, `reachedFloor = game.floor + 1`.
   * Запись переносится в начало массива `roguelite_replay_history`, а `roguelite_active_replay` очищается.

---

### 2.3. Полный реестр записываемых действий (`game.recordAction(type, payload)`)

Все переходы состояния в UI вызываются исключительно через методы `Game`. Запись действия выполняется **только при валидном срабатывании метода** (если действие отклонено проверкой ресурсов или кулдауна, в реплей оно не пишется):

| Метод в `Game` | Тип действия (`t`) | Параметры (`p`) | Описание |
| :--- | :--- | :--- | :--- |
| `moveToRoom(x, y)` | `"move"` | `{ x, y }` | Переход в соседнюю комнату на карте |
| `scoutSurroundings()` | `"scout_start"` | `null` | Нажатие кнопки «Разведать окружение» |
| `resolveScoutAction(actionId)` | `"scout_action"` | `actionId` | Выбор действия на экране разведки |
| `finishScoutSession()` | `"scout_finish"` | `null` | Выход с экрана результата разведки |
| `selectTarget(index)` *(новый)* | `"target"` | `index` | Смена выбранной цели в бою (только если `index !== selectedTargetIndex`) |
| `playerAction(skillKey, render)` | `"skill"` | `skillKey` | Применение боевого навыка (`fast`, `defend`, `pierce`, `whirlwind`, `heavy`, `concentrate`) |
| `usePotion(index, render)` | `"potion"` | `index` | Выпивание зелья из пояса |
| `resolveEquipChoice()` | `"equip_accept"` | `null` | Надеть найденную экипировку |
| `resolveSalvageChoice()` | `"equip_salvage"` | `null` | Разобрать найденную экипировку на золото |
| `resolvePendingArtifact(accept)` | `"artifact_choice"` | `Boolean(accept)` | Принять или отклонить проклятый артефакт |
| `proceedAfterBattle()` | `"battle_proceed"` | `null` | Нажатие «Продолжить» после победы в бою |
| `choosePerk(perkId)` | `"perk"` | `perkId` | Выбор перка при повышении уровня |
| `resolveEventOption(optionId)` | `"event_option"` | `optionId` | Выбор варианта в текстовом событии |
| `proceedAfterEventRewards()` *(новый)* | `"event_proceed"` | `null` | Закрытие экрана наград события |
| `resolveCampfire(choice)` | `"campfire"` | `choice` | Действие у костра (`heal`, `prepare`, `brew`, `meditate`) |
| `leaveCorridorRoom()` | `"corridor_leave"` | `null` | Выход из комнаты коридора |
| `resolveFountainChoice(drink)` | `"fountain_choice"` | `Boolean(drink)` | Выпить из фонтана или пройти мимо |
| `leaveFountainRoom()` | `"fountain_leave"` | `null` | Покинуть экран результата фонтана |
| `buyShopOffer(index)` | `"shop_buy"` | `index` | Покупка товара или услуги в лавке |
| `rerollShop()` | `"shop_reroll"` | `null` | Обновление товаров в лавке |
| `leaveShop()` *(новый)* | `"shop_leave"` | `null` | Выход из лавки на карту |
| `reenterShop()` *(новый)* | `"shop_reenter"` | `null` | Повторный вход в зачищенную лавку с карты |
| `descendToNextFloor()` *(новый)* | `"descend_floor"` | `null` | Спуск на следующий этаж после победы над боссом |
| `openAbyssChoice()` *(новый)* | `"abyss_open"` | `null` | Открытие развилки Бездны с клетки босса 4-го этажа |
| `enterAbyssFromChoice()` | `"abyss_enter"` | `null` | Выбор «Спуститься в Бездну (Этаж 5)» |
| `returnFromAbyssChoiceToMap()` *(новый)* | `"abyss_map"` | `null` | Возврат с экрана развилки Бездны на карту 4-го этажа |
| `finishVictoryFromAbyssChoice()` *(новый)* | `"abyss_victory"` | `null` | Завершение забега победой на развилке Бездны |

---

### 2.4. Модальное окно «🎬 Реплеи» (`src/ui/modals.js`, `src/ui/screens/menu.js`, `src/ui/components.js`)

1. **Точки входа:**
   * Кнопка «🎬 Реплеи» на главном экране (`renderMenuScreen` в `src/ui/screens/menu.js`).
   * Пункт «🎬 Реплеи» в выпадающем меню настроек (`createSettingsAnchor` в `src/ui/components.js`).
2. **Содержимое `openReplayManagerModal(render)`:**
   * Карточка текущего активного реплея (если запись идёт): класс, этаж, сид, число записанных действий (`actions.length`), кнопка «Скопировать JSON» и «Скачать .json».
   * Список сохранённых реплеев из истории (`до 100 записей`):
     * Заголовок: `[Победа / Поражение / Прерван] Класс — Этаж N (Ходов: M, Сид: X, Дата)`.
     * Кнопки: «📋 Копировать JSON», «⬇️ Скачать .json», «🗑️ Удалить».
   * Блок **«Импорт реплея»**: текстовое поле `<textarea>` + загрузка из `.json` файла (`<input type="file" accept=".json">`) с валидацией структуры (`initialState` и массив `actions`) и добавлением в историю реплеев.
   * Кнопка «Очистить всю историю реплеев».

---

## 3. Обработка краевых случаев

* **Дублирующиеся клики по уже выбранной цели в бою:** `selectTarget(idx)` игнорирует клик и не пишет действие в реплей, если `idx === game.selectedTargetIndex` или `game.isProcessingTurn === true`.
* **Нажатие кнопки «Назад» в браузере (`handlePopState` в `src/main.js`):**
  * В `handlePopState` выход из лавки заменяется на `game.leaveShop()`, а выход из `EVENT_REWARDS` — на `game.proceedAfterEventRewards()`, чтобы закрытие экранов системной кнопкой «Назад» также фиксировалось в реплее.
* **Переполнение `localStorage`:** при сохранении в `roguelite_replay_history` блок `try / catch (QuotaExceededError)` автоматически удаляет самые старые записи из хвоста истории до успешного сохранения.

---

## 4. Пошаговый план реализации

1. [ ] **Шаг 1: Создание модуля [`src/engine/systems/replay.js`](../../src/engine/systems/replay.js)**
   * Реализовать функции управления активным реплеем и историей (`startReplay`, `recordReplayAction`, `finalizeReplay`, `getReplayHistory`, `deleteReplay`, `clearReplayHistory`, `importReplayJson`, `exportReplayToFile`).
2. [ ] **Шаг 2: Унификация методов действий в [`src/engine/game.js`](../../src/engine/game.js) и UI-экранах**
   * Добавить методы `selectTarget`, `proceedAfterEventRewards`, `leaveShop`, `reenterShop`, `descendToNextFloor`, `openAbyssChoice`, `returnFromAbyssChoiceToMap`, `finishVictoryFromAbyssChoice`.
   * Встроить вызовы `this.recordAction(type, payload)` во все игровые методы `Game`.
   * Заменить прямые мутации `game.*` в [`src/ui/screens/battle.js`](../../src/ui/screens/battle.js), [`src/ui/screens/map.js`](../../src/ui/screens/map.js), [`src/ui/screens/rooms.js`](../../src/ui/screens/rooms.js), [`src/ui/screens/menu.js`](../../src/ui/screens/menu.js) и [`src/main.js`](../../src/main.js) на вызовы этих методов.
3. [ ] **Шаг 3: Модальное окно «🎬 Реплеи» ([`src/ui/modals.js`](../../src/ui/modals.js), [`src/ui/screens/menu.js`](../../src/ui/screens/menu.js), [`src/ui/components.js`](../../src/ui/components.js))**
   * Реализовать `openReplayManagerModal(render)` со списком истории (до 100 записей), экспортом в буфер/файл, импортом и удалением.
   * Подключить кнопки открытия окна в главном меню и в меню настроек.

---

## 5. Верификация

1. Проверить синтаксис всех изменённых файлов через `node --check`.
2. Проверить в браузере ([`src/index.html`](../../src/index.html)):
   * Начать забег, пройти 2–3 комнаты (бой со сменой целей и зельем, коридор, событие, лавка с покупкой и рероллом), открыть окно «🎬 Реплеи» и убедиться, что в активном реплее записан валидный `initialState` и точная последовательность `actions` со сквозным `seq: 0, 1, 2...`.
   * Завершить забег (гибелью или победой) и убедиться, что реплей перешёл в список истории со статусом `GAMEOVER` / `VICTORY`.
   * Сохранить игру в `Слот #1`, продолжить игру, затем загрузить `Слот #1` — проверить, что предыдущий реплей сохранился в истории как `INTERRUPTED`, а для загруженного слота начался новый реплей с `initialState` от точки загрузки.
   * Проверить скачивание `.json` файла реплея и его обратный импорт через окно «🎬 Реплеи».
