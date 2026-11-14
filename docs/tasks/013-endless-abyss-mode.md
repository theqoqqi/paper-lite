# [Задача 013] Бесконечный режим истощения («Бездна»)

> **Статус:** Реализовано

## 1. Цели, контекст и границы (Context & Agreed Scope)

### 1.1. Контекст проблемы

Сейчас игра жёстко ограничена 4 этажами (`game.floor` от `0` до `3`):

* В [`finishRoom`](../../src/engine/systems/encounter.js) победа над боссом 4-го этажа (`game.floor === 3`, Владыка Малкор) немедленно начисляет Души через `calculateSouls()`, удаляет автосейв и завершает забег экраном `VICTORY`.
* В [`renderMapScreen`](../../src/ui/screens/map.js) обращение `GAME_DATA.floors[game.floor]` при `floor >= 4` приводит к ошибке чтения свойства у `undefined`.
* В [`battle.js`](../../src/engine/systems/battle.js) таблицы `FLOOR_HP_MULTIPLIERS`, `FLOOR_ATK_BONUSES`, `MUTATION_CHANCE_NORMAL`, `MUTATION_CHANCE_ELITE` и выбор этажа ограничены индексом `Math.min(3, ...)`.
* В [`dungeon-generator.js`](../../src/engine/dungeon-generator.js) количество комнат растёт линейно (`11 + floor * 2`), что на глубоких этажах раздувает карту.
* В [`encounter.js`](../../src/engine/systems/encounter.js) и [`battle.js`](../../src/engine/systems/battle.js) победа над боссом полностью восстанавливает `HP` и `EN`, Ярость Бездны включается только с 11-го раунда, а после сбора всех 36 перков экран `LEVELUP` полностью пропускается.

### 1.2. Что входит в скоуп

1. **Точка входа и жизненный цикл забега:** выбор после победы над Владыкой Малкором на 4-м этаже («Завершить победой» или «Войти в Бездну» на Этаж 5+). После спуска на 5-й этаж забег продолжается строго до гибели (`GAMEOVER`).
2. **Генерация этажей 5+ («Бесконечный штурм»):** 22 основные комнаты с полным удалением комнат «Коридор», 1 костром, 4 элитами, 1 лавкой, 1 фонтаном, 1 боссом и плотным потоком боёв; сохранение работы Проклятого Фонтана и Источника Затмения без потолка стаков.
3. **Хаос-пул и жёсткий скейлинг:** смешивание всех обычных врагов, всей элиты и всех 4 боссов с нормализацией их ранних статов к уровню 4-го этажа, экспоненциальным ростом `HP`, процентным ростом урона, 100% шансом привычных мутаций и увеличенным бюджетом вражеского отряда.
4. **Механики истощения:** отключение восстановления `HP` и `EN` после победы над боссом, активация Ярости Бездны с 1-го раунда, инфляция всех цен в Лавке (+40% за каждый этаж Бездны).
5. **Переполнение пула перков:** сохранение экрана `LEVELUP` с базовым бонусом `+3 MAX HP` и `+6 HP`, информационным текстом об изучении всех перков и кнопкой продолжения.
6. **Мета-прогрессия:** рекорд максимальной глубины на главном экране и экране конца забега, прогрессивный бонус Душ за этажи Бездны, а также эндгейм-уровни всех 6 веток Алтаря Душ (`DATA_META_UPGRADES`), открывающиеся после первой победы над Малкором.
7. **Симулятор и верификация:** адаптация [`scripts/simulate-balance.js`](../../scripts/simulate-balance.js) под 5+ этажи и ручная проверка в браузере (с соблюдением запрета на автотесты и TDD из [`AGENTS.md`](../../AGENTS.md)).

### 1.3. Явно вне скоупа (Non-goals)

* Глобальные модификаторы/пакты на этажи и смена биомов по кругу (`floor % 4`).
* Новые уникальные мутации Бездны (используются существующие 11 мутаций из `DATA_MUTATIONS`).
* Аркадный «босс-раш» без карты подземелья.
* Добровольный выход с победой после каждого босса на 5+ этажах.
* Новые классы, события, предметы или графические ассеты.

---

## 2. Архитектура и контракты данных (Architecture & Data Contracts)

### 2.1. Вход в Бездну, состояние `ABYSS_CHOICE` и завершение забега

Вводится константа порога бесконечного режима:

```javascript
export const ABYSS_START_FLOOR = 4; // 0..3 -> Этажи 1..4; 4+ -> Этаж 5+
```

Поток после убийства босса в [`finishRoom`](../../src/engine/systems/encounter.js):

1. Если `roomObj.type === "boss"`:
   * **Этажи 1–3 (`game.floor < 3`):** поведение не меняется — полное восстановление `HP` и `EN`, переход в `"MAP"`.
   * **Этаж 4 (`game.floor === 3`, Владыка Малкор):**
     * Статус `roomObj.cleared = true` фиксируется.
     * В мете немедленно отмечается факт победы над финальным боссом (`game.meta.malkorDefeated = true`), обновляется `bestFloor = Math.max(game.meta.bestFloor || 0, 4)` и вызывается `game.saveMeta()`.
     * Восстановление `HP` и `EN` на этом переходе **не** выполняется до выбора игрока (если игрок выберет победу — забег всё равно окончен; если войдёт в Бездну — переходит ровно с тем запасом, с которым пережил бой с Малкором).
     * **Души (`calculateSouls()`) не начисляются**, `autosave` **не** удаляется. Игра переходит в новое состояние `game.state = "ABYSS_CHOICE"`.
   * **Этажи 5+ (`game.floor >= ABYSS_START_FLOOR`):**
     * Ни `HP`, ни `EN` **не восстанавливаются**.
     * Обновляется рекорд глубины `bestFloor` при переходе / завершении.
     * Игра переходит в `"MAP"` (кнопка спуска появляется на карте в очищенной комнате босса при `game.floor >= ABYSS_START_FLOOR`).

Действия на экране `ABYSS_CHOICE`:

* **«Завершить победой и забрать Души»:** вызывает `game.finalizeRun("VICTORY")`, где выполняется `calculateSouls()`, фиксируется `bestFloor`, удаляется `roguelite_slot_autosave` и устанавливается `game.state = "VICTORY"`.
* **«Войти в Бездну (Этаж 5+)»:** устанавливает `game.enteredAbyss = true`, инкрементирует `game.floor++` (`4`), генерирует 5-й этаж через `game.generateFloorMap()`, переводит в `game.state = "MAP"` и сохраняет `autosave`.
* **Дальнейшая гибель (`GAMEOVER`):** в [`battle.js`](../../src/engine/systems/battle.js) и [`encounter.js`](../../src/engine/systems/encounter.js) вместо разрозненных вызовов `game.calculateSouls()` + смены `game.state` используется единый метод завершения забега (`finalizeRun("GAMEOVER")`), который обновляет `bestFloor` и один раз начисляет Души.

### 2.2. Виртуальный этаж Бездны и хаос-пул врагов

В [`src/data/enemies.js`](../../src/data/enemies.js) добавляются чистые хелперы без дублирования данных:

* `getEnemyNativeFloor(enemyKey)`: строит (мемоизируется один раз) отображение каждого `id` из `DATA_FLOORS[0..3]` (`enemies`, `elite`, `boss`) в индекс его родного этажа `0..3`. Для внеэтажных врагов (например, `mimic`) задаётся `nativeFloor = 2`.
* `getFloorMeta(floor)`:
  * Для `0 <= floor < DATA_FLOORS.length` возвращает `DATA_FLOORS[floor]`.
  * Для `floor >= ABYSS_START_FLOOR` возвращает хаос-метаданные:
    * `id: floor`
    * `name: "Бездна Истощения"`
    * `isAbyss: true`
    * `enemies`: объединённый массив всех `enemies` из `DATA_FLOORS` (40 видов)
    * `elite`: объединённый массив всех `elite` из `DATA_FLOORS` (12 видов)
    * `bosses`: массив всех 4 боссов `["kingVort", "agaric", "vulkan", "malkor"]`

В [`setupBattle`](../../src/engine/systems/battle.js):

* При `mode === "boss"` и `game.floor >= ABYSS_START_FLOOR` босс выбирается случайно через `RNG.choice(floorData.bosses)`.
* Бюджет обычного боя (`mode === "normal"`):
  * Этажи 1–4 (`floor <= 3`): без изменений `Math.min(7, 2 + Math.floor(game.room / 3) + game.floor)`.
  * Этажи 5+ (`floor >= ABYSS_START_FLOOR`): `abyssDepth = floor - 3`, верхняя граница бюджета расширяется до `Math.min(12, 7 + abyssDepth + Math.floor(game.room / 4))` (минимум 3 врага или отряд на полный бюджет, больше групп из 3–4 противников).
* При `mode === "elite"` на `floor >= ABYSS_START_FLOOR`: в дополнение к основному элитному врагу при глубине `abyssDepth >= 2` может добавляться рядовой соратник с вероятностью `Math.min(75, 25 * (abyssDepth - 1))%` (или усиление через бюджет), чтобы элитные комнаты оставались проверкой ресурса.
* Шанс мутации на `floor >= ABYSS_START_FLOOR`: **`100%`** для всех обычных и элитных врагов (боссы по-прежнему без CSS-мутаций из `DATA_MUTATIONS`, т.к. `createEnemyInstance` сохраняет условие `!e.isBoss`).

### 2.3. Нормализация тира и жёсткий скейлинг статов (`floor >= 4`)

На первых 4 этажах (`0..3`) базовые шаблоны в `DATA_ENEMIES` усиливаются от 1-го этажа к 4-му примерно в 2.8 раза по `HP` и на `+4..+7` по базовому урону шаблона поверх `FLOOR_HP_MULTIPLIERS = [1.0, 1.5, 2.15, 3.0]` и `FLOOR_ATK_BONUSES = [0, 2, 4, 7]`.

Для устранения просадок сложности при выпадении ранних врагов (`rat`, `slime`, `kingVort`) в хаос-пуле Бездны вводятся таблицы нормализации к базе 4-го этажа:

```javascript
const TIER_HP_NORMALIZE = [2.8, 2.0, 1.4, 1.0];
const TIER_ATK_NORMALIZE_SHIFT = [4, 3, 1, 0];
```

Для `floor >= ABYSS_START_FLOOR` (`abyssDepth = floor - 3 >= 1`) в [`createEnemyInstance`](../../src/engine/systems/battle.js):

1. **Нормализация XP:**
   `e.xp = Math.round((e.xp || 3) * TIER_HP_NORMALIZE[nativeFloor] * (1 + abyssDepth * 0.25))`
2. **Нормализация и экспоненциальный рост HP:**
   `abyssHpMult = FLOOR_HP_MULTIPLIERS[3] * TIER_HP_NORMALIZE[nativeFloor] * Math.pow(1.48, abyssDepth)`
   * Пример (от базы 4-го этажа): Этаж 5 (`abyssDepth = 1`) — `×4.44` к шаблону 4-го этажа (`voidHound` `22 → 98 HP`, `malkor` `135 → 599 HP`, нормализованный `kingVort` `48 * 2.8 * 4.44 ≈ 597 HP`); Этаж 6 — `×6.57`; Этаж 7 — `×9.73`.
3. **Нормализация и процентный рост урона + щита:**
   `abyssAtkMult = Math.pow(1.22, abyssDepth)` (Этаж 5 — `×1.22`, Этаж 6 — `×1.49`, Этаж 7 — `×1.82`).
   * В `createEnemyInstance` массив `e.pattern` глубоко клонируется на каждого экземпляра.
   * Для каждого шага паттерна с `pat.val > 0`:
     `pat.val = Math.round((pat.val + TIER_ATK_NORMALIZE_SHIFT[nativeFloor] + FLOOR_ATK_BONUSES[3]) * abyssAtkMult)`
   * Для `pat.shield > 0` и стартового `e.shield > 0`:
     масштабируются на `TIER_HP_NORMALIZE[nativeFloor] * Math.pow(1.18, abyssDepth)`, чтобы щиты ранних врагов и Короля Ворта соответствовали Малкору.
   * В `e.atkBonus` в этом режиме не добавляется базовый `FLOOR_ATK_BONUSES[3]` (чтобы не удваивать `+7`); там остаются только `fountainAtkBonus`, `eclipseAtkBonus` и `mut.atkBonus`.
   * Так как [`renderBattleScreen`](../../src/ui/screens/battle.js) вычисляет превью намерений по `nextPat.val + (en.atkBonus || 0) + enrageBonus`, пересчёт значений внутри клонированного `e.pattern` гарантирует точное отображение урона врага в UI без расхождения с движком.

### 2.4. Ярость Бездны с 1-го раунда

В [`battle.js`](../../src/engine/systems/battle.js) и [`ui/screens/battle.js`](../../src/ui/screens/battle.js) логика расчёта Ярости Бездны выносится в единый экспортный хелпер `getAbyssEnrageBonus(game)`:

```javascript
export function getAbyssEnrageBonus(game) {
    const turn = game.battleTurn || 1;
    if ((game.floor || 0) >= ABYSS_START_FLOOR) {
        return turn * 2;
    }
    return turn >= 11 ? (turn - 10) * 2 : 0;
}
```

* На этажах 1–4 поведение идентично текущему (старт с 11-го раунда).
* На 5+ этажах Ярость Бездны активна с 1-го раунда (`+2`, `+4`, `+6`... к атакам врагов), отображается в баннере боя с первого хода и учитывается в `previewVal` врагов.

### 2.5. Генератор этажа «Бесконечный штурм» (`dungeon-generator.js`)

В [`generateDungeon`](../../src/engine/dungeon-generator.js) при `floor >= ABYSS_START_FLOOR`:

* `majorCount = 22` (жёсткий потолок размера, 1 стартовая + 1 первая боевая + 20 комнат пула).
* `corridorCount = 0` — комнаты типа `"corridor"` на 5+ этажах не генерируются.
* Распределение пула (20 оставшихся комнат):
  * `boss`: `1` (самый дальний тупик)
  * `shop`: `1`
  * `fountain`: `1`
  * `campfire`: `1` (вместо 2 на 3–4 этажах)
  * `elite`: `4` (вместо 2)
  * Остальные `13` комнат: `85%` шанс `"battle"`, `15%` шанс `"event"` (~11 обычных боёв + 1 первая комната + 4 элиты + 1 босс ≈ 17 боевых комнат из 22).

### 2.6. Экономика и инфляция в Лавке (`shop.js`)

На `floor >= ABYSS_START_FLOOR` при формировании цен в [`setupShop`](../../src/engine/systems/shop.js):

* Коэффициент инфляции глубины: `abyssPriceMult = 1 + 0.4 * (game.floor - 3)` (Этаж 5 — `×1.4`, Этаж 6 — `×1.8`, Этаж 7 — `×2.2`...).
* Умножается (`Math.round(baseCost * abyssPriceMult)`) стоимость всех позиций лавки:
  * Лечение лекаря (`service_heal`, базовая цена `5G` за `+12 HP`).
  * Перековка оружия (`forge_weapon`) и брони (`forge_armor`).
  * Все выставленные в лавке товары (зелья, оружие, броня, артефакты).
  * Перезапуск витрины (`rerollCost` при инициализации комнаты магазина и шаг реролла на `floor >= 4`).

### 2.7. Переполнение пула перков (`LEVELUP`) и Проклятый Фонтан

* **Экран `LEVELUP` после сбора всех 36 перков:**
  * В [`checkLevelUpOrFinishRoom`](../../src/engine/systems/encounter.js) при повышении уровня игрока всегда начисляются базовые `+3 MAX HP` и `+6 HP` (`player.baseMaxHp += 3; player.heal(6);`), а `selectedPerkChoices = generatePerkChoices(game)`.
  * На `LEVELUP` переход выполняется **всегда** при получении уровня, даже если `selectedPerkChoices.length === 0`.
  * В [`renderLevelUpScreen`](../../src/ui/screens/rooms.js): если `game.selectedPerkChoices.length === 0`, вместо кнопок выбора перка выводится информационный блок («Все 36 перков уже изучены. Вы получили +3 MAX HP и +6 HP.») и кнопка «Продолжить», вызывающая завершение выбора (`game.confirmEmptyLevelUp()` / аналог `choosePerk(null)`), которая сбрасывает флаг звука и снова запускает `checkLevelUpOrFinishRoom()` для проверки следующего уровня или выхода из комнаты.
* **Фонтан и Источник Затмения:**
  * На 5+ этажах комната `fountain` генерируется как обычно; `fountainCursesCount` и `fountainEclipseCount` продолжают работать без верхнего ограничения, позволяя добровольно усиливать врагов ради увеличенного золота и XP (`+2` ATK и `+10%` HP за стак Затмения — или поверх нормализованного скейлинга Бездны).

### 2.8. Мета-прогрессия, расширение Алтаря Душ и формула Душ

1. **Поля `game.meta` (`roguelite_meta_v4`):**
   * Добавить в `defaultMeta` ([`src/engine/game.js`](../../src/engine/game.js)):
     * `malkorDefeated: false` — открывается после первой победы над Малкором.
     * `bestFloor: 0` — максимальный достигнутый (пройденный/достигнутый) этаж в формате `1..N` (`0` если забеги ещё не доходили или не сохранялись).
     * `bestClass: null` — название/id класса, поставившего `bestFloor`.
   * Для существующих сохранений при загрузке меты делать безопасное слияние `{ ...this.defaultMeta, ...parsed }`. Если у игрока уже открыты все 4 этажа в старых сейвах без `malkorDefeated`, обновление происходит при следующей победе над Малкором (или флаг выставляется при `ABYSS_CHOICE`).

2. **Расширение `DATA_META_UPGRADES` ([`src/data/classes.js`](../../src/data/classes.js)):**
   Каждая ветка получает `baseMax` (потолок до победы над Малкором) и расширенный `max` с эндгейм-стоимостями (открываются при `meta.malkorDefeated === true`):
   * `hp` (+4 MAX HP): `baseMax: 10`, `max: 14`, доп. цены `[90, 130, 180, 240]`
   * `atk` (+1 ATK): `baseMax: 8`, `max: 12`, доп. цены `[170, 230, 310, 400]`
   * `def` (+1 DEF): `baseMax: 4`, `max: 6`, доп. цены `[340, 520]`
   * `en` (+1 MAX EN): `baseMax: 3`, `max: 4`, доп. цена `[280]`
   * `gold` (+8 стартового золота): `baseMax: 5`, `max: 8`, доп. цены `[70, 110, 160]`
   * `potions` (+1 слот и стартовое зелье): `baseMax: 2`, `max: 3`, доп. цена `[160]`
   * Хелпер `getMetaUpgradeCap(upg, meta)` возвращает `meta.malkorDefeated ? upg.max : (upg.baseMax ?? upg.max)`.

3. **Прогрессивный бонус Душ в `calculateSouls(game)` ([`src/engine/systems/shop.js`](../../src/engine/systems/shop.js)):**
   * Базовая формула сохраняется: `Math.floor(totalRunXp * 0.8) + floor * 12 + Math.floor(gold / 5)`.
   * При `abyssDepth = Math.max(0, game.floor - 3)` (если игрок зашёл в Бездну и добрался до `5+` этажа) добавляется прогрессивная награда за глубину:
     `abyssSoulBonus = abyssDepth * 20 + abyssDepth * (abyssDepth + 1) * 4`
     * Этаж 5 (`abyssDepth = 1`): `+28` Душ
     * Этаж 6 (`abyssDepth = 2`): `+64` Душ
     * Этаж 7 (`abyssDepth = 3`): `+108` Душ
     * Этаж 10 (`abyssDepth = 6`): `+288` Душ

4. **UI меты ([`src/ui/screens/menu.js`](../../src/ui/screens/menu.js)):**
   * В `renderMenuScreen` отображать блок рекорда глубины (если `bestFloor > 0`: `🏆 Рекорд глубины: Этаж ${bestFloor}` + статус победы над Малкором).
   * В `renderMetaShopScreen` использовать `getMetaUpgradeCap(upg, game.meta)`: если игрок достиг `baseMax`, но `!game.meta.malkorDefeated`, кнопка показывает замок с пояснением `🔒 Победите Владыку Малкора`.
   * В `renderEndScreen` показывать достигнутый этаж (`Этаж ${game.floor + 1}`), пометку Бездны при `game.enteredAbyss`, итоговый бонус Душ и обновление рекорда.

---

## 3. Пограничные случаи и инварианты (Edge Cases & Invariants)

1. **Перезагрузка вкладки на развилке `ABYSS_CHOICE`:**
   * `saveGame("autosave")` удаляет слот только при `state === "VICTORY" || state === "GAMEOVER"`. Состояние `ABYSS_CHOICE` сохраняется штатно в `roguelite_slot_autosave`, и при перезапуске браузера игрок продолжит ровно на экране выбора.
   * `getSlotSummary` в [`save.js`](../../src/engine/systems/save.js) отображает слот со статусом `ABYSS_CHOICE` как активный (например, «Развилка после 4-го босса»).
2. **Исключение повторного начисления Душ:**
   * `calculateSouls()` вызывается строго один раз внутри `finalizeRun()`, либо на нажатии «Завершить победой» на `ABYSS_CHOICE`, либо при гибели в Бездне (`GAMEOVER`).
   * Повторный вызов `finalizeRun()` при уже установленном терминальном состоянии должен быть защищён ранним возвратом.
3. **Защита от краша на карте и в событиях при `floor >= 4`:**
   * Ни один модуль не должен обращаться к `GAME_DATA.floors[game.floor]` напрямую — только через `getFloorMeta(game.floor)`.
   * В [`renderMapScreen`](../../src/ui/screens/map.js) условие показа кнопки спуска с очищенного босса меняется с `game.floor < 3` на `game.floor !== 3` (на 1–3 этажах ведёт на 2–4 этажи; на 4-м этаже вход в 5-й идёт через `ABYSS_CHOICE`, а с 5-го этажа и глубже кнопка «⬇️ Спуститься на Этаж ${game.floor + 2} (Без восстановления)» снова активна).
   * В [`pickItemByRarity`](../../src/engine/systems/encounter.js) уже есть `Math.min(..., weightsByFloor.length - 1)`, поэтому пулы редкости предметов/зелий безопасно используют веса 4-го этажа.
4. **Несколько уровней за один бой (Multi-LevelUp) при исчерпании перков:**
   * Если на 6+ этаже игрок получил много XP и поднял 2 уровня подряд при `0` доступных перков, `checkLevelUpOrFinishRoom()` должен обработать оба `LEVELUP`-экрана по очереди, а не пропустить второй.
5. **Глобальная навигация (`renderGlobalNav`):**
   * В [`src/ui/components.js`](../../src/ui/components.js) состояние `"ABYSS_CHOICE"` не входит в список экранов с верхней навигацией (аналогично `"VICTORY"` и `"GAMEOVER"`), чтобы не оставлять ложных ссылок возврата на карту при нерешённом выборе.
6. **Сериализация в `save.js`:**
   * `serializeState()` и `loadGame()` обязаны сохранять и восстанавливать `game.enteredAbyss = Boolean(data.enteredAbyss)`.
   * Для ручных слотов (`slot1..slot3`), сохранённых до перехода, `enteredAbyss` по умолчанию `false` (или `game.floor >= ABYSS_START_FLOOR`).
   * В `loadGame()` при загрузке в `BATTLE` пересчёт урона уже сохранённых экземпляров `game.enemies` ложится прямо в сериализованные объекты `enemies` (`pattern`, `hp`, `atkBonus`), поэтому Ярость Бездны через `getAbyssEnrageBonus(game)` автоматически подхватится после загрузки с 1-го раунда.
7. **Математические границы и `clampHp` / округления:**
   * Цены Лавки в Бездне не могут быть `< 1`, `pat.val` при `pat.val > 0` остаётся `>= 1`, а `player.hp` при изменении `baseMaxHp` на «пустом» LevelUp всегда ограничивается `player.clampHp()`.
   * Если пул артефактов исчерпан (`40/40`), `grantRandomEquipment` уже выдаёт `+15G`, а `setupShop` просто формирует доступные слоты (оружие/броня/зелья/сервисы), не падая на пустом списке артефактов.

---

## 4. Пошаговый план реализации (Implementation Plan)

*(В соответствии с [`AGENTS.md`](../../AGENTS.md) автотесты и TDD-файлы не создаются.)*

1. **Данные и контракты этажей/меты (`src/data/enemies.js`, `src/data/classes.js`):**
   * В `src/data/enemies.js` вынести `ABYSS_START_FLOOR = 4`, реализовать `getEnemyNativeFloor(enemyKey)` и `getFloorMeta(floor)`.
   * В `src/data/classes.js` добавить `baseMax`, расширенные `max` и `costs` во все 6 записей `DATA_META_UPGRADES`, а также хелпер `getMetaUpgradeCap(upg, meta)`.
2. **Состояние игры и сейвы (`src/engine/game.js`, `src/engine/systems/save.js`):**
   * Обновить `defaultMeta` (`malkorDefeated`, `bestFloor`, `bestClass`), безопасную миграцию меты при загрузке и поле `this.enteredAbyss = false` в `Game`.
   * Добавить единый метод `finalizeRun(outcomeState)` (`VICTORY` / `GAMEOVER`), `enterAbyssFromChoice()`, и поддержку `enteredAbyss` + `ABYSS_START_FLOOR` в `save.js` (`serializeState`, `loadGame`, `getSlotSummary`).
3. **Генератор этажей и экономика (`src/engine/dungeon-generator.js`, `src/engine/systems/shop.js`):**
   * В `dungeon-generator.js` реализовать ветку `floor >= ABYSS_START_FLOOR` для схемы «Бесконечный штурм» (22 комнаты, `corridorCount = 0`, `campfiresCount = 1`, `elitesCount = 4`, соотношение боёв/событий `85/15`).
   * В `shop.js` добавить ценовую инфляцию `+40%` за каждый этаж Бездны, обновить `buyMetaUpgrade` на использование `getMetaUpgradeCap` и добавить `abyssSoulBonus` в `calculateSouls`.
4. **Боевая система и события (`src/engine/systems/battle.js`, `src/engine/systems/encounter.js`):**
   * В `battle.js` вынести `getAbyssEnrageBonus(game)`, заменить все прямые `battleTurn >= 11` вызовы, реализовать нормализацию тира + экспоненту HP (`×1.48^abyssDepth`) + процентный рост `pattern.val` (`×1.22^abyssDepth`) + 100% мутации + расширенный бюджет отряда до `10–12` и хаос-спавн врагов/боссов, перевести смерть на `finalizeRun("GAMEOVER")`.
   * В `encounter.js` обновить `finishRoom` (разделение `floor < 3`, `floor === 3 -> ABYSS_CHOICE`, `floor >= 4 -> MAP` без лечения HP/EN), разрешить вход на «пустой» `LEVELUP` в `checkLevelUpOrFinishRoom`, добавить метод подтверждения пустого левелапа и перевести смерть в событии на `finalizeRun("GAMEOVER")`.
5. **UI и роутинг (`src/main.js`, `src/ui/screens/map.js`, `src/ui/screens/battle.js`, `src/ui/screens/rooms.js`, `src/ui/screens/menu.js`):**
   * В `src/main.js` добавить маршрут `ABYSS_CHOICE` и подключить экран выбора.
   * В `map.js` заменить `GAME_DATA.floors[game.floor]` на `getFloorMeta(game.floor)` и обновить кнопку спуска после босса на 5+ этажах.
   * В `battle.js` использовать `getAbyssEnrageBonus(game)` для плашки Ярости Бездны и `previewVal`.
   * В `rooms.js` обновить `renderLevelUpScreen` для пустого `selectedPerkChoices`.
   * В `menu.js` реализовать `renderAbyssChoiceScreen`, вывести рекорд глубины в `renderMenuScreen` и `renderEndScreen`, поддержать `getMetaUpgradeCap` с пометкой блокировки в `renderMetaShopScreen`.
6. **Симулятор баланса (`scripts/simulate-balance.js`):**
   * Убедиться, что симулятор по-прежнему прогоняет 1–4 этажи без регрессий, и добавить опцию CLI (например, `--floor 5..8` или флаг `--abyss`) для прогона и оценки кривой сложности 5+ этажей.

---

## 5. Верификация и критерии приёмки (Verification & Definition of Done)

### 5.1. Автоматизированные безголовые проверки (без тест-раннеров)

1. Синтаксическая проверка всех затронутых ES-модулей:

   ```powershell
   node --check src/main.js
   node --check src/data/enemies.js
   node --check src/data/classes.js
   node --check src/engine/game.js
   node --check src/engine/dungeon-generator.js
   node --check src/engine/systems/battle.js
   node --check src/engine/systems/encounter.js
   node --check src/engine/systems/shop.js
   node --check src/engine/systems/save.js
   ```

2. Запуск безголового симулятора баланса (базовый прогон 1–4 этажей + добавленный прогон 5–7 этажей Бездны):

   ```powershell
   node scripts/simulate-balance.js --no-report
   ```

### 5.2. Ручная проверка в браузере (`src/index.html`)

1. **Развилка после 4-го босса (`ABYSS_CHOICE`):**
   * Победить Малкора на 4-м этаже → открывается `ABYSS_CHOICE`, `HP` и `EN` не сбрасываются заранее, перезагрузка страницы (`F5`) возвращает на этот же экран через `autosave`.
   * Ветка А («Завершить победой»): начисляются Души, `malkorDefeated = true`, `bestFloor >= 4`, автосейв удаляется, в Алтаре Душ разблокируются новые уровни всех 6 веток.
   * Ветка Б («Войти в Бездну»): старт 5-го этажа без восстановления `HP`/`EN`, Души ещё не начислены.
2. **Этажи 5+ («Бесконечный штурм»):**
   * На карте 5-го этажа ровно 22 основные комнаты, 0 комнат «Коридор», 1 костёр, 4 элиты, 1 лавка, 1 фонтан, 1 босс; заголовок отображает `Этаж 5: Бездна Истощения`.
   * Обычные, элитные враги и босс могут выпадать из любого тира (1–4 этажей), все обычные и элитные враги имеют мутацию (`100%`), HP/урон соответствуют нормализованному скейлу.
   * В бою с 1-го раунда активна плашка `🔥 Ярость Бездны (+2 к атакам врагов)`, превью намерений врага точно совпадает с фактическим базовым уроном (с учётом ±15% разброса).
   * Цены в Лавке (включая лечение `5G → 7G` на 5-м, `9G` на 6-м, перековка и товары) масштабированы на `×(1 + 0.4 * abyssDepth)`.
   * При сборе всех 36 перков получение нового уровня показывает экран `LEVELUP` с `+3 MAX HP / +6 HP` и кнопкой «Продолжить».
   * Победа над боссом 5-го этажа не лечит `HP` и не восстанавливает `EN`; на клетке босса активен спуск на Этаж 6.
   * При гибели в Бездне экран `GAMEOVER` один раз начисляет Души с прогрессивным бонусом глубины и обновляет рекорд в меню.
