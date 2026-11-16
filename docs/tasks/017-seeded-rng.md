# [Задача 017] Переработка рандома для поддержки сидов (Seeded PRNG)

> **Статус:** Спроектировано (Ожидает реализации)

## 1. Цели и контекст

Сейчас [`src/utils/rng.js`](../../src/utils/rng.js) напрямую использует недетерминированный `Math.random()`. Из-за этого невозможно повторить забег с теми же случайными исходами, воспроизвести конкретную генерацию подземелья или продолжить забег с идентичной последовательностью случайных чисел после перезагрузки страницы.

**Цели задачи:**

1. Заменить `Math.random()` в игровом рандоме на детерминированный 32-битный генератор псевдослучайных чисел (`Mulberry32`) с инкапсуляцией в класс `PRNG`.
2. Сделать игру на 100% повторяемой при одинаковом начальном сиде (`seed`) и одинаковой последовательности действий игрока.
3. Сохранять начальное зерно забега (`seed`) и текущее внутреннее состояние генератора (`rngState`) в систему сохранений ([`src/engine/systems/save.js`](../../src/engine/systems/save.js)).
4. Добавить возможность задать сид перед началом забега на экране выбора класса и отображать сид текущего забега в окне «Персонаж» и на экране завершения забега.

**Границы задачи (Non-Goals):**

* В рамках этой задачи генерация мира и бои используют единый последовательный поток из `RNG` (переход на вычисляемые контекстные сиды комнат выполняется в [Задаче 018](018-scoped-world-generation-seeds.md)).
* Запись и воспроизведение реплеев в эту задачу не входят ([Задача 019](019-replay-recording-and-storage.md) и [Задача 020](020-replay-player.md)).

---

## 2. Архитектура и контракты

### 2.1. Детерминированный генератор (`src/utils/rng.js`)

1. **Нормализация и хеширование сида (`normalizeSeed(input)`):**
   * Если `input === undefined || input === null || input === ""`: генерируется случайное беззнаковое 32-битное число `uint32` в диапазоне `[1, 4294967295]` (через `Math.random()` только в момент создания нового сида).
   * Если передана строка из цифр (например, `"284910421"`) или число: приводится к `uint32` через `(Number(input) >>> 0) || 1`.
   * Если передана произвольная строка (например, `"my-run-1"`): хешируется детерминированным алгоритмом `FNV-1a` (32-bit) в беззнаковое число `uint32` (`>>> 0`, при `0` заменяется на `1`).

2. **Класс `PRNG` (алгоритм `Mulberry32`):**

   ```javascript
   export class PRNG {
       constructor(seed = 1) {
           this.initialSeed = normalizeSeed(seed);
           this.state = this.initialSeed;
       }

       getState() {
           return this.state >>> 0;
       }

       setState(state) {
           this.state = (Number(state) >>> 0) || 1;
       }

       nextFloat() {
           let t = (this.state += 0x6D2B79F5);
           t = Math.imul(t ^ (t >>> 15), t | 1);
           t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
           this.state = this.state >>> 0;
           return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
       }

       range(min, max) {
           return Math.floor(this.nextFloat() * (max - min + 1)) + min;
       }

       chance(percent) {
           return this.nextFloat() * 100 < percent;
       }

       spread(base, variance = 0.2) {
           const delta = Math.max(1, Math.round(base * variance));
           return this.range(base - delta, base + delta);
       }

       choice(arr) {
           if (!arr || arr.length === 0) return null;
           return arr[Math.floor(this.nextFloat() * arr.length)];
       }

       weightedChoice(items) {
           const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
           let roll = this.nextFloat() * totalWeight;
           for (const item of items) {
               roll -= (item.weight || 1);
               if (roll <= 0) return item;
           }
           return items[items.length - 1];
       }

       shuffle(arr) {
           const copy = [...arr];
           for (let i = copy.length - 1; i > 0; i--) {
               const j = Math.floor(this.nextFloat() * (i + 1));
               [copy[i], copy[j]] = [copy[j], copy[i]];
           }
           return copy;
       }
   }
   ```

3. **Фасад `RNG` для обратной совместимости вызовов:**
   * Статический класс `RNG` делегирует все методы (`range`, `chance`, `spread`, `choice`, `weightedChoice`, `shuffle`) активному внутреннему экземпляру `PRNG`.
   * Добавляются методы управления состоянием:
     * `RNG.setSeed(seed)` — инициализирует генератор новым сидом и возвращает нормализованный `uint32` сид.
     * `RNG.getSeed()` — возвращает `initialSeed`.
     * `RNG.getState()` — возвращает текущее числовое состояние `state >>> 0`.
     * `RNG.setState(state)` — восстанавливает текущее состояние генератора (используется при `loadGame`).

---

### 2.2. Состояние игры и персистентность (`src/engine/game.js`, `src/engine/systems/save.js`)

1. **Поля в `Game`:**
   * `this.seed = null` — начальное зерно текущего забега (`uint32`).
   * В `startRun(classKey, customSeed = null)`:
     * Вызывается `this.seed = RNG.setSeed(customSeed)`.
     * Только после установки сида создаётся `Player` и вызывается `this.generateFloorMap()`.

2. **Сериализация и загрузка в `save.js`:**
   * В `serializeState(game)` добавляются поля:
     * `seed: game.seed || RNG.getSeed()`
     * `rngState: RNG.getState()`
   * В `loadGame(game, slotKeyOrJson)`:
     * Если в загружаемом JSON присутствуют `data.seed` и `data.rngState`, вызываются `game.seed = RNG.setSeed(data.seed)` и `RNG.setState(data.rngState)`.
     * **Fallback для старых сохранений:** если `data.seed` отсутствует, генерируется новый сид `game.seed = RNG.setSeed(null)`.

---

### 2.3. Пользовательский интерфейс (`src/ui/screens/menu.js`, `src/ui/modals.js`)

1. **Экран выбора класса (`renderClassSelectScreen` в `src/ui/screens/menu.js`):**
   * Над списком классов добавляется компактная панель ввода зерна:
     * Текстовое поле `<input type="text" placeholder="Случайный сид (или введите свой)">`.
     * При клике на выбранный класс значение поля (если оно не пустое) передаётся вторым аргументом в `game.startRun(cls.id, seedInput.value.trim())`.
2. **Окно персонажа (`openCharacterModal` в `src/ui/modals.js`):**
   * В верхней информационной панели выводится строка `🎲 Сид забега: <game.seed>` с компактной кнопкой копирования сида в буфер обмена (`navigator.clipboard?.writeText(String(game.seed))`).
3. **Экран завершения забега (`renderEndScreen` в `src/ui/screens/menu.js`):**
   * В итоговой сводке выводится строка `🎲 Сид забега: <game.seed>`.

---

## 3. Обработка краевых случаев

* **Пустой или некорректный ввод сида:** пробельные строки `""` и `"   "` трактуются как отсутствие пользовательского сида и генерируют случайный `uint32`.
* **Нулевое состояние в битовых операциях:** если хеш или входное число дают `0`, `normalizeSeed` и `setState` принудительно выставляют `1`, исключая вырожденные циклы.
* **Генерация аудио (`src/utils/audio.js`):** белый шум в Web Audio API (`Math.random() * 2 - 1` в `audio.js:801`) остаётся на нативном `Math.random()`, чтобы включение/выключение звука (`Mute`) никогда не сдвигало состояние игрового `RNG`.
* **Симулятор баланса (`scripts/simulate-balance.js`):** продолжает работать без изменений, так как фасады `RNG.*` сохраняют прежние сигнатуры.

---

## 4. Пошаговый план реализации

1. [ ] **Шаг 1: Реализация `PRNG` и `normalizeSeed` в [`src/utils/rng.js`](../../src/utils/rng.js)**
   * Реализовать `normalizeSeed(input)` (числа, числовые строки, `FNV-1a` для текста, генерация случайного `uint32` при пустом входе).
   * Реализовать класс `PRNG` на алгоритме `Mulberry32` и обновить статический фасад `RNG` (`setSeed`, `getSeed`, `getState`, `setState`).
2. [ ] **Шаг 2: Интеграция сида в [`src/engine/game.js`](../../src/engine/game.js) и [`src/engine/systems/save.js`](../../src/engine/systems/save.js)**
   * Добавить `this.seed` в конструктор `Game` и параметр `customSeed = null` в `startRun(classKey, customSeed = null)`.
   * Сохранять и восстанавливать `seed` и `rngState` в `serializeState()` и `loadGame()`.
3. [ ] **Шаг 3: Поле ввода и отображение сида в UI ([`src/ui/screens/menu.js`](../../src/ui/screens/menu.js), [`src/ui/modals.js`](../../src/ui/modals.js))**
   * Добавить поле ввода сида на экран выбора класса.
   * Отобразить `game.seed` и кнопку копирования в модальном окне «👤 Персонаж» и на экране итогов забега (`VICTORY` / `GAMEOVER`).

---

## 5. Верификация

1. Проверить синтаксис изменённых модулей через `node --check`.
2. Проверить в браузере ([`src/index.html`](../../src/index.html)):
   * Запустить забег за Странника с явно введённым сидом `123456789`: зафиксировать карту 1-го этажа, врагов в первой комнате и урон от первых 3 атак.
   * Начать новый забег за Странника с тем же сидом `123456789` и повторить те же шаги: карта, враги, их намерения, урон и дроп должны совпасть 1 в 1.
   * Посреди этажа обновить страницу (`F5`), продолжить забег из автосохранения и убедиться, что дальнейшие случайные исходы идентичны непрерывному прохождению без `F5`.
   * Проверить отображение и копирование сида в окне «👤 Персонаж» и на экране гибели/победы.
