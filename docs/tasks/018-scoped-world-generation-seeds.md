# [Задача 018] Внедрение вычисляемых контекстных сидов в генерацию мира

> **Статус:** Спроектировано (Ожидает реализации после [Задачи 017](017-seeded-rng.md))

## 1. Цели и контекст

При использовании единого сквозного генератора случайных чисел ([Задача 017](017-seeded-rng.md)) любое лишнее действие игрока — дополнительный удар в бою, разведка на карте или обновление витрины в лавке — сдвигает глобальный счётчик PRNG, из-за чего в следующих комнатах меняются враги, события и награды. Кроме того, бюджет врагов в [`src/engine/systems/battle.js`](../../src/engine/systems/battle.js) зависит от порядкового номера посещённой комнаты (`game.room`), поэтому обход этажа по разным маршрутам порождает разных врагов в одних и тех же координатах.

**Цели задачи:**

1. Перевести генерацию этажей, комнат, магазинов, событий, наград и боёв на **вычисляемые контекстные сиды** (`Scoped / Hash-based PRNG`) через детерминированную функцию смешивания `mixSeed(baseSeed, ...params)`.
2. Привязать бюджет спавна врагов в обычных комнатах к BFS-дистанции клетки от входа на этаж (`room.distance`) вместо счётчика шагов `game.room`.
3. Обеспечить инвариант: **мир с одним и тем же сидом (`game.seed`) генерируется на 100% одинаково независимо от маршрута игрока, числа ходов в боях, разведок и рероллов лавки**.

**Границы задачи (Non-Goals):**

* В рамках этой задачи не добавляются запись и воспроизведение реплеев ([Задача 019](019-replay-recording-and-storage.md) и [Задача 020](020-replay-player.md)).

---

## 2. Архитектура и контракты

### 2.1. Функция смешивания сидов (`src/utils/rng.js`)

1. **`mixSeed(...inputs)`:**
   * Принимает произвольный список аргументов (числа и строки) и детерминированно возвращает 32-битное беззнаковое число `uint32` (`!== 0`).
   * Исключает пространственные коллизии координат (`mixSeed(seed, 1, 2) !== mixSeed(seed, 2, 1)`), а также корректно обрабатывает отрицательные координаты клеток (`-2, -1`).

   ```javascript
   export function mixSeed(...inputs) {
       let h = 0x811c9dc5;
       for (const item of inputs) {
           if (typeof item === "string") {
               for (let i = 0; i < item.length; i++) {
                   h ^= item.charCodeAt(i);
                   h = Math.imul(h, 0x01000193);
               }
           } else {
               const n = (Number(item) | 0);
               h ^= n & 0xff;
               h = Math.imul(h, 0x01000193);
               h ^= (n >>> 8) & 0xff;
               h = Math.imul(h, 0x01000193);
               h ^= (n >>> 16) & 0xff;
               h = Math.imul(h, 0x01000193);
               h ^= (n >>> 24) & 0xff;
               h = Math.imul(h, 0x01000193);
           }
       }
       let res = h >>> 0;
       res ^= res >>> 16;
       res = Math.imul(res, 0x85ebca6b) >>> 0;
       res ^= res >>> 13;
       res = Math.imul(res, 0xc2b2ae35) >>> 0;
       res ^= res >>> 16;
       return (res >>> 0) || 1;
   }
   ```

2. **Контекстное переключение `RNG.useScope(...scopeParts)`:**
   * Переключает активный генератор `RNG` на сид `mixSeed(game.seed, ...scopeParts)` (либо выполняет колбэк `RNG.withScope(scopeSeed, fn)` и/или устанавливает текущий контекстный стрим до смены контекста).

---

### 2.2. Таблица контекстных сидов по подсистемам

Каждая подсистема перед выполнением случайных выборок инициализирует `RNG` своим изолированным сидом от базового `game.seed`:

| Подсистема / Действие | Файл | Формула контекстного сида |
| :--- | :--- | :--- |
| Генерация сетки этажа | `src/engine/dungeon-generator.js` | `mixSeed(game.seed, floor, "floor_map")` |
| Спавн врагов в комнате (`setupBattle`) | `src/engine/systems/battle.js` | `mixSeed(game.seed, floor, x, y, "spawn", mode)` |
| Боевые броски внутри боя (урон, криты, враги) | `src/engine/systems/battle.js` | `mixSeed(game.seed, floor, x, y, "combat")` (инициализируется на старте боя в комнате) |
| Награды после победы в бою (`checkBattleEnd`) | `src/engine/systems/battle.js` | `mixSeed(game.seed, floor, x, y, "battle_loot")` |
| Выбор и разрешение события (`EVENT`) | `src/engine/game.js`, `encounter.js` | `mixSeed(game.seed, floor, x, y, "event", optionId | | "init")` |
| Незначительная комната (`CORRIDOR`) | `src/engine/systems/encounter.js` | `mixSeed(game.seed, floor, x, y, "corridor")` |
| Костёр (варка отвара `brew`) | `src/engine/systems/encounter.js` | `mixSeed(game.seed, floor, x, y, "campfire_brew")` |
| Лавка торговца и рероллы (`setupShop`) | `src/engine/systems/shop.js` | `mixSeed(game.seed, floor, x, y, "shop", shopRerollCount)` |
| Вылазка разведки (`resolveScoutAction`) | `src/engine/game.js` | `mixSeed(game.seed, floor, x, y, "scout", actionId)` |
| Выбор перков при повышении уровня (`LEVELUP`) | `src/engine/systems/encounter.js` | `mixSeed(game.seed, game.player.level, "levelup")` |

---

### 2.3. Фиксация дистанции комнат и бюджета врагов

1. **Сохранение BFS-дистанции в `DungeonGenerator.generate(floor, seed)` (`src/engine/dungeon-generator.js`):**
   * В `dungeon-generator.js` массив `distances[room.id]` уже вычисляется при поиске тупиков для босса (строки 96–112).
   * Каждому объекту комнаты в `rooms` присваивается поле `distance: distances[r.id] || 1`.

2. **Расчёт бюджета в `setupBattle` (`src/engine/systems/battle.js`):**
   * Вместо `game.room` используется дистанция текущей клетки `roomDist = currentRoomObj?.distance || 1`:

     ```javascript
     let budget = isAbyss
         ? Math.min(12, 7 + abyssDepth + Math.floor(roomDist / 3))
         : Math.min(7, 2 + Math.floor(roomDist / 2) + floor);
     ```

   * Благодаря этому состав пака врагов в клетке `(x, y)` зависит исключительно от сида забега, номера этажа и положения комнаты на графе карты.

3. **Счётчик рероллов лавки (`shopRerollCount`):**
   * В `game` (и в `serializeState` / `loadGame`) добавляется целочисленное поле `shopRerollCount = 0`.
   * При первом входе в лавку на этаже `shopRerollCount = 0`.
   * В `rerollShop(game)` перед вызовом `setupShop(game)` выполняется `game.shopRerollCount = (game.shopRerollCount || 0) + 1`.

---

## 3. Обработка краевых случаев

* **Отрицательные координаты клеток (`x < 0`, `y < 0`):** побитовая упаковка `(Number(item) | 0)` в `mixSeed` сохраняет все 32 бита знакового целого, поэтому `(-1, 0)` и `(1, 0)` дают полностью различные хеши.
* **Перезагрузка страницы (`F5`) посреди боя или лавки:**
  * В `save.js` сохраняются `rngState` (текущее положение боевого генератора посреди боя) и `shopRerollCount`.
  * Если игрок обновил страницу посреди боя, `loadGame` восстанавливает `rngState` без сброса боевого генератора в начало боя.
* **Бой из события (Мимик в сундуке `chest_open`, Элита на арене `arena_fight` / в саркофаге `sarcophagus_fight` / в гнезде `nest_hunt`):**
  * Передача параметра `mode` (`"normal"`, `"elite"`, `"mimic"`, `"boss"`) в `mixSeed(game.seed, floor, x, y, "spawn", mode)` гарантирует детерминированный спавн врага внутри события.

---

## 4. Пошаговый план реализации

1. [ ] **Шаг 1: Хеширование контекстных сидов в [`src/utils/rng.js`](../../src/utils/rng.js)**
   * Добавить функцию `mixSeed(...inputs)` и метод установки контекстного сида `RNG.setScopedSeed(baseSeed, ...scopeParts)`.
2. [ ] **Шаг 2: Сохранение `distance` комнат в [`src/engine/dungeon-generator.js`](../../src/engine/dungeon-generator.js)**
   * Инициализировать генератор этажа через `RNG.setScopedSeed(game.seed, floor, "floor_map")`.
   * Записывать `room.distance = distances[room.id] || 1` в каждую сгенерированную комнату.
3. [ ] **Шаг 3: Перевод комнат, лавки, событий и боёв на контекстные сиды ([`src/engine/game.js`](../../src/engine/game.js), [`src/engine/systems/battle.js`](../../src/engine/systems/battle.js), [`src/engine/systems/shop.js`](../../src/engine/systems/shop.js), [`src/engine/systems/encounter.js`](../../src/engine/systems/encounter.js), [`src/engine/systems/save.js`](../../src/engine/systems/save.js))**
   * Заменить в `setupBattle` использование `game.room` в формуле бюджета на `currentRoom.distance`.
   * Подключить контекстные сиды для спавна, боя, наград, лавки (с `shopRerollCount`), событий, коридоров, костра, разведки и выбора перков при повышении уровня.
   * Добавить `shopRerollCount` в `serializeState()` и `loadGame()`.

---

## 5. Верификация

1. Проверить синтаксис всех изменённых файлов через `node --check`.
2. Проверить в браузере ([`src/index.html`](../../src/index.html)) инварианты независимости комнат на фиксированном сиде (например, `777777`):
   * **Тест маршрута:** в первом прохождении пойти из `(0, 0)` сразу в комнату `A`, зафиксировать список врагов и их мутации. Во втором прохождении с тем же сидом сначала зачистить две другие ветки (или провести разведку) и затем прийти в комнату `A` — враги и их характеристики в комнате `A` должны быть абсолютно теми же.
   * **Тест лавки и рероллов:** зайти в лавку, сделать 2 реролла, зафиксировать товары на витрине и войти в соседнюю комнату боя. Повторить забег с тем же сидом без рероллов лавки — содержимое соседней комнаты боя не должно измениться.
   * **Тест переходов между этажами:** убедиться, что планировка 2-го этажа при одинаковом `seed` одинакова независимо от того, сколько комнат было посещено на 1-м этаже.
