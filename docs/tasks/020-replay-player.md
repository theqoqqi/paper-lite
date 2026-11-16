# [Задача 020] Внедрение воспроизведения реплеев и плавающего плеера

> **Статус:** Реализовано

## 1. Цели и контекст

На базе детерминированного PRNG ([Задача 017](017-seeded-rng.md)), контекстных сидов мира ([Задача 018](018-scoped-world-generation-seeds.md)) и системы записи реплеев ([Задача 019](019-replay-recording-and-storage.md)) необходимо реализовать визуальное воспроизведение сохранённых и импортированных реплеев прямо в интерфейсе игры.

**Цели задачи:**

1. Реализовать движок пошагового воспроизведения реплея (`ReplayPlayer`) с поддержкой асинхронных боевых очередей (`isProcessingTurn`).
2. Создать плавающую верхнюю панель управления плеером с кнопками: **`[Скрыть]`**, **`[Старт / Пауза / Продолжить]`**, **`[Шаг вперед]`**, **`[Настройки (скорость 1x / 2x / 4x / 8x)]`** и выходом из режима просмотра.
3. Масштабировать как задержку между действиями плеера, так и внутренние боевые таймеры/анимации (`battle.js`) пропорционально выбранной скорости.
4. Полностью изолировать режим просмотра (`game.isReplayMode = true`) от реальных сохранений (`autosave`), мета-прогресса (`roguelite_meta_v4`) и случайных кликов по игровым кнопкам.

---

## 2. Архитектура и контракты

### 2.1. Изоляция режима реплея (`game.isReplayMode`)

1. **Флаги в `Game` (`src/engine/game.js`):**
   * `this.isReplayMode = false` — признак активного просмотра реплея.
   * `this.replaySpeed = 1` — текущий множитель скорости (`1`, `2`, `4`, `8`).
   * `this.scaleDelay(ms)`:

     ```javascript
     scaleDelay(ms) {
         if (!this.isReplayMode || this.replaySpeed <= 1) return ms;
         return Math.max(16, Math.round(ms / this.replaySpeed));
     }
     ```

2. **Защита пользовательских данных во время `isReplayMode === true`:**
   * `saveGame()` и `saveMeta()` немедленно выходят (`if (game.isReplayMode) return null;`), не затрагивая `localStorage`.
   * `recordAction()` игнорирует все вызовы (`if (this.isReplayMode) return;`), не создавая дубликатов реплея.
   * Перед стартом просмотра реплея текущее состояние игры в оперативной памяти сохраняется в `this._preReplayBackup = { state: this.state, hasPlayer: Boolean(this.player), snapshot: this.player ? this.serializeState() : null }`.
   * При выходе из реплея `isReplayMode` сбрасывается в `false`, `loadMeta()` перезагружает реальную мету игрока из `localStorage`, и восстанавливается состояние до запуска реплея (или главное меню).

---

### 2.2. Диспетчер воспроизведения (`applyReplayAction(game, action, render)`)

В [`src/engine/systems/replay.js`](../../src/engine/systems/replay.js) реализуется функция `applyReplayAction(game, action, render)`, отображающая тип действия `action.t` обратно в вызов соответствующего метода `Game`:

| `action.t` | Вызов в `Game` |
| :--- | :--- |
| `"move"` | `game.moveToRoom(action.p.x, action.p.y)` |
| `"scout_start"` | `game.scoutSurroundings()` |
| `"scout_action"` | `game.resolveScoutAction(action.p)` |
| `"scout_finish"` | `game.finishScoutSession()` |
| `"target"` | `game.selectTarget(action.p)` |
| `"skill"` | `game.playerAction(action.p, render)` |
| `"potion"` | `game.usePotion(action.p, render)` |
| `"equip_accept"` | `game.resolveEquipChoice()` |
| `"equip_salvage"` | `game.resolveSalvageChoice()` |
| `"artifact_choice"` | `game.resolvePendingArtifact(action.p)` |
| `"battle_proceed"` | `game.proceedAfterBattle()` |
| `"perk"` | `game.choosePerk(action.p)` |
| `"event_option"` | `game.resolveEventOption(action.p)` |
| `"event_proceed"` | `game.proceedAfterEventRewards()` |
| `"campfire"` | `game.resolveCampfire(action.p)` |
| `"corridor_leave"` | `game.leaveCorridorRoom()` |
| `"fountain_choice"` | `game.resolveFountainChoice(action.p)` |
| `"fountain_leave"` | `game.leaveFountainRoom()` |
| `"shop_buy"` | `game.buyShopOffer(action.p)` |
| `"shop_reroll"` | `game.rerollShop()` |
| `"shop_leave"` | `game.leaveShop()` |
| `"shop_reenter"` | `game.reenterShop()` |
| `"descend_floor"` | `game.descendToNextFloor()` |
| `"abyss_open"` | `game.openAbyssChoice()` |
| `"abyss_enter"` | `game.enterAbyssFromChoice()` |
| `"abyss_map"` | `game.returnFromAbyssChoiceToMap()` |
| `"abyss_victory"` | `game.finishVictoryFromAbyssChoice()` |

---

### 2.3. Цикл воспроизведения и масштабирование таймеров

1. **Масштабирование таймеров боя (`src/engine/systems/battle.js`):**
   * Задержки в `executeEnemyTurn` (`380`, `420`, `550` мс) и `handlePotentialBattleEnd` (`550` мс) оборачиваются в `game.scaleDelay(delay)`.
   * Базовая пауза плеера между действиями игрока составляет `BASE_STEP_DELAY = 700` мс и масштабируется через `game.scaleDelay(700)` (`700` мс на `1x`, `350` мс на `2x`, `175` мс на `4x`, `88` мс на `8x`).

2. **Асинхронный контроллер плеера:**
   * Хранит:
     * `replay` — загруженный объект реплея;
     * `currentStep = 0` — индекс следующего действия в `replay.actions`;
     * `isPlaying = false` — статус автовоспроизведения;
     * `isCollapsed = false` — свёрнута ли плавающая панель.
   * **Ожидание завершения хода (`waitForIdle()`):**
     Перед выполнением очередного шага плеер ждёт, пока `game.isProcessingTurn === false`.
   * **Кнопка «Шаг вперед» (`stepForward()`):**
     * Если плеер не на паузе — ставит на паузу (`isPlaying = false`).
     * Если `game.isProcessingTurn === true` — дожидается окончания анимации текущего хода.
     * Выполняет ровно одно действие `replay.actions[currentStep]`, увеличивает `currentStep++` и вызывает `render()`.
   * **Перезапуск по окончании:**
     * Когда `currentStep >= replay.actions.length`, кнопка старта меняется на `🔄 Сначала`, которая заново загружает `replay.initialState` и сбрасывает `currentStep = 0`.

---

### 2.4. Плавающая панель плеера и блокировка ручного ввода

1. **Плавающая панель (`renderReplayFloatingBar(render)` в `src/ui/components.js`):**
   * Размещается поверх нижней части окна (`position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%); max-width: 480px; z-index: 200`), не затрагивая нижнюю панель навигации.
   * **В развёрнутом виде содержит один ряд кнопок:**
     * `[Скрыть]` — сворачивает панель в правый нижний угол в компактный бейдж `[🎬 ${currentStep}/${totalSteps}]`.
     * `[✖]` — выход из просмотра реплея.
     * `[▶️ Старт / ⏸️ Пауза / ▶️ Продолжить]` (или `🔄 Сначала`, если дошли до конца).
     * `[⏭️ Шаг вперед]` (активна, пока `currentStep < totalSteps` и `!game.isProcessingTurn`).
     * `[⚙️${speed}x]` — открывает попап с прогрессом `Шаг N / M` и выбором скорости (`1x`, `2x`, `4x`, `8x`).
2. **Блокировка кликов по игровому полю в режиме реплея:**
   * В `DOMContentLoaded` (`src/main.js`) на `#screen-container` навешивается перехватчик кликов в фазе `capture`, который блокирует нажатия на игровые кнопки, но разрешает скролл лога боя.
   * Нижняя панель навигации (`#global-nav`) остаётся нетронутой; в окне «👤 Персонаж» во время реплея кнопки употребления/выбрасывания зелий отключены.

---

## 3. Обработка краевых случаев

* **Запуск реплея во время незаконченного собственного забега:**
  * Благодаря `isReplayMode = true` автосохранение в `localStorage` не затирается, а при закрытии плеера игрок возвращается ровно в то состояние, откуда открыл окно реплеев.
* **Быстрое переключение скорости или нажатие «Пауза» посреди хода врагов:**
  * Текущий ход врагов корректно доигрывает свои `setTimeout`, после чего цикл плеера останавливается перед следующим действием игрока без потери синхронизации.
* **Реплей с `0` действий (игрок только начал забег и сразу вышел):**
  * Плеер загружает `initialState`, показывает `Шаг 0 / 0`, кнопка «Шаг вперед» неактивна.

---

## 4. Пошаговый план реализации

1. [x] **Шаг 1: Режим `isReplayMode` и масштабирование таймеров ([`src/engine/game.js`](../../src/engine/game.js), [`src/engine/systems/battle.js`](../../src/engine/systems/battle.js), [`src/engine/systems/save.js`](../../src/engine/systems/save.js))**
   * Добавить `isReplayMode`, `replaySpeed` и `scaleDelay(ms)` в `Game`.
   * Заблокировать запись в `localStorage` (`saveGame`, `saveMeta`, `recordAction`) при `isReplayMode === true`.
   * Применить `game.scaleDelay(...)` к боевым таймерам в `battle.js`.
2. [x] **Шаг 2: Контроллер `ReplayPlayer` и `applyReplayAction` ([`src/engine/systems/replay.js`](../../src/engine/systems/replay.js))**
   * Реализовать диспетчер `applyReplayAction(game, action, render)` для всех типов действий.
   * Реализовать контроллер управления воспроизведением (`startPlayback`, `pausePlayback`, `resumePlayback`, `stepForward`, `setSpeed`, `stopPlayback`).
3. [x] **Шаг 3: Плавающая панель плеера и интеграция в UI ([`src/ui/components.js`](../../src/ui/components.js), [`src/ui/modals.js`](../../src/ui/modals.js), [`src/main.js`](../../src/main.js), [`src/index.html`](../../src/index.html))**
   * Добавить плавающую панель с кнопками `[Скрыть]`, `[Старт/Пауза/Продолжить]`, `[Шаг вперед]`, `[Скорость]` и выходом.
   * В окне «🎬 Реплеи» (`openReplayManagerModal`) добавить кнопку «▶️ Смотреть» для каждого реплея.
   * Заблокировать клики по игровым кнопкам внутри `#screen-container` при активном `isReplayMode`.

---

## 5. Верификация

1. Проверить синтаксис всех изменённых файлов через `node --check`.
2. Проверить в браузере ([`src/index.html`](../../src/index.html)):
   * Записать забег с несколькими боями, выбором наград, лавкой, разведкой и повышением уровня.
   * Открыть «🎬 Реплеи» и нажать «▶️ Смотреть»: убедиться, что партия воспроизводится с точностью до каждой единицы урона, крита, полученного предмета и конечного HP/золота.
   * Проверить кнопки плавающей панели: сворачивание/разворачивание (`[Скрыть]`), паузу и продолжение, пошаговое выполнение через `[Шаг вперед]` (в том числе в бою), переключение скоростей `1x / 2x / 4x / 8x`.
   * Проверить, что во время просмотра можно открыть окно «👤 Персонаж» и изучить экипировку/перки, а случайные клики по карте и скиллам в бою заблокированы.
   * Выйти из просмотра реплея и убедиться, что реальный `autosave` и количество Душ в Алтаре не изменились.
