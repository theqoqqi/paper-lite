# [RFC 003] Незначительные комнаты («Коридор») и микро-события

## 1. Резюме решений

* **Проблема:** Все комнаты подземелья являются плотными боевыми или ключевыми энкаунтерами, которые увеличивают счётчик глубины `this.room` и разгоняют характеристики врагов. Не хватает атмосферных проходных залов с мелкими находками или рисками.
* **Решение:**
  * Вводится новый тип незначительных комнат `corridor` (`🕯️ Коридор`).
  * На каждом этаже сверх основной квоты (`10 + floor * 2`) генерируется `3 + floor` комнат типа `corridor` (суммарно `13 + floor * 3` комнат на этаж).
  * Комнаты `corridor` распределяются случайно из общего пула свободных клеток (включая тупики), за исключением стартовой комнаты `start`, первой боевой комнаты `firstRoom` и комнаты босса `bossRoom`.
  * Комнаты `corridor` **не учитываются** в счётчике `this.room` (не усиливают врагов и не увеличивают бюджет спавна) и не входят в счётчик зачистки основных комнат в саммари сохранений.
  * Первый вход в `corridor` даёт стандартный `+1 EN` за открытие новой клетки и открывает отдельный экран осмотра (`state = "CORRIDOR"`) в 1 клик.
  * Разделены понятия **комнаты/окружения** (`corridorRooms`) и **исходов/эффектов** (`corridorOutcomes`): комната задает атмосферу и список допустимых `outcomeIds`, а конкретный исход определяется случайно при входе.
  * Исходы: ~40% пустой атмосферный переход, ~45% небольшая находка (золото, лечение, опыт, энергия, бонус к следующей атаке), ~15% мелкая ловушка (`-2..3 HP` вплоть до летального исхода или `-1 EN`).

---

## 2. Контракты и структуры данных

### Тип комнаты в `DungeonGenerator` и `renderMapScreen`

```javascript
// В roomTypes (src/game-ui.js):
corridor: { icon: "🕯️", name: "Коридор" }
```

### Справочники окружений и исходов в `GAME_DATA` (`src/game-data.js`)

```javascript
// 1. Тематические локации коридоров
corridorRooms: [
    {
        id: "dusty_passage",
        title: "Пыльный переход",
        desc: "Под сапогами хрустит вековая каменная крошка. Вдоль стен тянутся потухшие факелы — здесь давно никого не было.",
        outcomeIds: ["empty_dust", "find_pouch", "trap_wire"],
    },
    {
        id: "flooded_tunnel",
        title: "Затопленный тоннель",
        desc: "Вода доходит до щиколоток. В темноте гулко разносится звук тяжелых капель с потолка.",
        outcomeIds: ["empty_water", "find_water_gold", "find_moss_heal", "trap_leeches"],
    },
    {
        id: "abandoned_guardpost",
        title: "Заброшенный караул",
        desc: "Разбитые оружейные стойки и опрокинутый стол свидетельствуют о спешном бегстве прежнего гарнизона.",
        outcomeIds: ["empty_dust", "find_whetstone", "find_pouch", "trap_crossbow"],
    },
    {
        id: "collapsed_gallery",
        title: "Обрушенная галерея",
        desc: "Часть свода обвалилась, открыв проход среди массивных базальтовых глыб.",
        outcomeIds: ["empty_rubble", "find_crystal_en", "find_scroll_xp", "trap_falling_rock"],
    },
    {
        id: "forgotten_crypt",
        title: "Забытый склеп",
        desc: "Каменные саркофаги покрыты толстым слоем вековой паутины. Воздух пропитан запахом мирры и могильного тлена.",
        outcomeIds: ["empty_crypt", "find_silver_coins", "find_embalming_herbs", "trap_crypt_curse"],
    },
    {
        id: "old_mine_shaft",
        title: "Старая штольня",
        desc: "Гнилые деревянные крепи скрипят под давлением породы. По ржавым рельсам когда-то возили руду.",
        outcomeIds: ["empty_rubble", "find_gold_nugget", "find_miner_ration", "trap_toxic_gas"],
    },
    {
        id: "underground_shrine",
        title: "Оскверненное святилище",
        desc: "Обезглавленная статуя забытого божества возвышается над треснувшим алтарным камнем.",
        outcomeIds: ["empty_shrine", "find_offering_coins", "find_shrine_blessing", "trap_shrine_curse"],
    },
    {
        id: "fungal_grotto",
        title: "Грибной грот",
        desc: "Стены и пол покрыты мерцающей колонией фосфоресцирующих грибов, наполняющих воздух едкими спорами.",
        outcomeIds: ["empty_grotto", "find_glow_cap_heal", "find_mind_spores_xp", "trap_spore_cloud"],
    },
    {
        id: "pillaged_caravan",
        title: "Останки каравана",
        desc: "Разбитая повозка и истлевшие дорожные сундуки. Сюда когда-то проникли контрабандисты или исследователи глубин.",
        outcomeIds: ["empty_dust", "find_caravan_purse", "find_cured_meat", "trap_chest_needle"],
    },
    {
        id: "rat_burrow",
        title: "Крысиное логово",
        desc: "Узкий проход усеян обглоданными костями и ветошью. В темноте слышится нервный шорох десятков лапок.",
        outcomeIds: ["empty_rat_nest", "find_gnawed_pouch", "find_sharpening_stone", "trap_rat_swarm"],
    },
    {
        id: "ancient_library_niche",
        title: "Архивная ниша",
        desc: "Сгнившие полки и фрагменты пергаментов. Знания прежней эпохи почти полностью обратились в труху.",
        outcomeIds: ["empty_library", "find_intact_treatise", "find_crystal_fragment", "trap_unstable_rune"],
    },
    {
        id: "damp_cistern",
        title: "Сырая цистерна",
        desc: "Огромный каменный резервуар, где скапливаются грунтовые воды. Капли монотонно отбивают похоронный ритм.",
        outcomeIds: ["empty_water", "find_cistern_gold", "find_purified_water", "trap_rusted_chain"],
    },
],

// 2. Реестр возможных эффектов и находок
corridorOutcomes: {
    empty_dust: {
        id: "empty_dust",
        text: "В помещении царит мертвая тишина. Ничего ценного не обнаружено.",
        kind: "none",
        tone: "neutral",
    },
    empty_water: {
        id: "empty_water",
        text: "Кроме холодной затхлой воды и скользких камней, здесь ничего нет.",
        kind: "none",
        tone: "neutral",
    },
    empty_rubble: {
        id: "empty_rubble",
        text: "Под завалами камней пусто, путь свободен.",
        kind: "none",
        tone: "neutral",
    },
    empty_crypt: {
        id: "empty_crypt",
        text: "Саркофаги давно вскрыты и разграблены мародерами прошлого. В склепе пусто.",
        kind: "none",
        tone: "neutral",
    },
    empty_shrine: {
        id: "empty_shrine",
        text: "Алтарь расколот и пуст, божества покинули эти мрачные своды.",
        kind: "none",
        tone: "neutral",
    },
    empty_grotto: {
        id: "empty_grotto",
        text: "Кроме мерцающей плесени и влажного мха, в гроте ничего полезного нет.",
        kind: "none",
        tone: "neutral",
    },
    empty_rat_nest: {
        id: "empty_rat_nest",
        text: "Крысы разбежались по щелям, оставив лишь кучу мусора и грязной соломы.",
        kind: "none",
        tone: "neutral",
    },
    empty_library: {
        id: "empty_library",
        text: "Книги давно истлели в пыль от сырости. Прочесть ничего невозможно.",
        kind: "none",
        tone: "neutral",
    },
    find_pouch: {
        id: "find_pouch",
        text: "В трещине каменной кладки найден забытый истлевший кошелек.",
        kind: "gold",
        min: 2,
        max: 5,
        tone: "positive",
    },
    find_water_gold: {
        id: "find_water_gold",
        text: "На дне тоннеля сквозь мутную воду тускло блеснули старые монеты.",
        kind: "gold",
        min: 2,
        max: 4,
        tone: "positive",
    },
    find_silver_coins: {
        id: "find_silver_coins",
        text: "Среди праха в погребальной нише сохранились потускневшие серебряные монеты.",
        kind: "gold",
        min: 3,
        max: 6,
        tone: "positive",
    },
    find_gold_nugget: {
        id: "find_gold_nugget",
        text: "В брошенной вагонетке среди пустой породы блеснул неочищенный золотой самородок.",
        kind: "gold",
        min: 3,
        max: 5,
        tone: "positive",
    },
    find_offering_coins: {
        id: "find_offering_coins",
        text: "В складках каменной мантии статуи припрятаны подношения паломников.",
        kind: "gold",
        min: 2,
        max: 4,
        tone: "positive",
    },
    find_caravan_purse: {
        id: "find_caravan_purse",
        text: "Под двойным дном разбитого ящика спрятан кожаный мешочек с монетами.",
        kind: "gold",
        min: 3,
        max: 6,
        tone: "positive",
    },
    find_gnawed_pouch: {
        id: "find_gnawed_pouch",
        text: "Среди крысиного гнезда найден надкусанный кошелек с уцелевшим золотом.",
        kind: "gold",
        min: 2,
        max: 4,
        tone: "positive",
    },
    find_cistern_gold: {
        id: "find_cistern_gold",
        text: "В углублении водостока скопились смытые потоками древние монеты.",
        kind: "gold",
        min: 2,
        max: 5,
        tone: "positive",
    },
    find_moss_heal: {
        id: "find_moss_heal",
        text: "На влажных камнях растет целебный светящийся мох. Вы прикладываете его к ранам.",
        kind: "heal",
        min: 3,
        max: 5,
        tone: "positive",
    },
    find_embalming_herbs: {
        id: "find_embalming_herbs",
        text: "В запечатанном глиняном сосуде уцелели консервирующие бальзамы. Вы используете их для перевязки.",
        kind: "heal",
        min: 3,
        max: 6,
        tone: "positive",
    },
    find_miner_ration: {
        id: "find_miner_ration",
        text: "В герметичном жестяном котелке шахтеров обнаружился сухой паек. Нехитрый перекус придает сил.",
        kind: "heal",
        min: 2,
        max: 4,
        tone: "positive",
    },
    find_glow_cap_heal: {
        id: "find_glow_cap_heal",
        text: "Вы срезаете шляпку светящегося гриба со сладковатым соком, залечивающим ссадины.",
        kind: "heal",
        min: 3,
        max: 5,
        tone: "positive",
    },
    find_cured_meat: {
        id: "find_cured_meat",
        text: "Среди тюков уцелел просмоленный сверток с вяленым мясом. Питательный обед возвращает силы.",
        kind: "heal",
        min: 4,
        max: 6,
        tone: "positive",
    },
    find_purified_water: {
        id: "find_purified_water",
        text: "Из трещины в гранитной плите бьет чистый подземный ключ. Глоток студеной воды восстанавливает силы.",
        kind: "heal",
        min: 3,
        max: 5,
        tone: "positive",
    },
    find_whetstone: {
        id: "find_whetstone",
        text: "Среди обломков уцелел точильный брусок. Вы подправляете лезвие перед боем.",
        kind: "concentrate",
        value: 3,
        tone: "positive",
    },
    find_shrine_blessing: {
        id: "find_shrine_blessing",
        text: "Слабый отблеск благословения на мгновение озаряет клинок, наполняя решимостью.",
        kind: "concentrate",
        value: 4,
        tone: "positive",
    },
    find_sharpening_stone: {
        id: "find_sharpening_stone",
        text: "Среди хлама нашелся отменный кремниевый оселок. Вы забираете его для заточки оружия.",
        kind: "concentrate",
        value: 3,
        tone: "positive",
    },
    find_scroll_xp: {
        id: "find_scroll_xp",
        text: "В щели свода спрятан клочок тактической схемы древних воинов.",
        kind: "xp",
        min: 4,
        max: 8,
        tone: "positive",
    },
    find_mind_spores_xp: {
        id: "find_mind_spores_xp",
        text: "Тонкий аромат синих спор обостряет восприятие и проясняет боевую память.",
        kind: "xp",
        min: 5,
        max: 9,
        tone: "positive",
    },
    find_intact_treatise: {
        id: "find_intact_treatise",
        text: "В металлическом футляре уцелел свиток с боевыми наставлениями древних мастеров.",
        kind: "xp",
        min: 6,
        max: 10,
        tone: "positive",
    },
    find_crystal_en: {
        id: "find_crystal_en",
        text: "Осколок эфирного кристалла в стене отдает мягким теплом, снимая усталость.",
        kind: "en",
        value: 1,
        tone: "positive",
    },
    find_crystal_fragment: {
        id: "find_crystal_fragment",
        text: "В книжном переплете был укрыт накопительный кристалл, сохранивший искру энергии.",
        kind: "en",
        value: 1,
        tone: "positive",
    },
    trap_wire: {
        id: "trap_wire",
        text: "Вы задеваете ржавую проволоку — из стены со свистом вылетает отравленный дротик!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_crossbow: {
        id: "trap_crossbow",
        text: "Под ногой проседает плита — щелкает старый станковый самострел!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_falling_rock: {
        id: "trap_falling_rock",
        text: "От вибрации шагов с потолка срывается острый каменный осколок!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_leeches: {
        id: "trap_leeches",
        text: "Из ила поднимаются подземные пиявки и прокусывают сапоги, вытягивая силы!",
        kind: "trap_en",
        value: 1,
        tone: "negative",
    },
    trap_crypt_curse: {
        id: "trap_crypt_curse",
        text: "При попытке осмотра саркофага вспыхивает могильное пламя, высасывая душевные силы!",
        kind: "trap_en",
        value: 1,
        tone: "negative",
    },
    trap_toxic_gas: {
        id: "trap_toxic_gas",
        text: "Вы наступаете на карман скопившегося рудничного газа — ядовитый смрад обжигает легкие!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_shrine_curse: {
        id: "trap_shrine_curse",
        text: "Остаточная защитная печать алтаря бьет разрядом темной магии в грудь!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_spore_cloud: {
        id: "trap_spore_cloud",
        text: "Неосторожный шаг взрывает созревший гриб-дождевик — облако едких спор душит и ослабляет!",
        kind: "trap_en",
        value: 1,
        tone: "negative",
    },
    trap_chest_needle: {
        id: "trap_chest_needle",
        text: "Замок сундука оснащен защитной иглой — палец пронзает острая боль от яда!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_rat_swarm: {
        id: "trap_rat_swarm",
        text: "Стая голодных крыс внезапно бросается из темноты, расцарапывая ноги острыми зубами!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_unstable_rune: {
        id: "trap_unstable_rune",
        text: "Прикосновение к пергаменту активирует угасающую руну защиты — резкая вспышка обжигает руки!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
    trap_rusted_chain: {
        id: "trap_rusted_chain",
        text: "Под ногой лопается ржавая решетка стока — вы больно ударяетесь ногой о железный обод!",
        kind: "trap_hp",
        min: 2,
        max: 3,
        tone: "negative",
    },
}
```

### Состояние осмотра коридора в `Game` (`src/game-engine.js`)

```javascript
// Сохраняется в serializeState() и восстанавливается в loadGame():
this.currentCorridorResult = {
    title: "Пыльный переход",
    desc: "Под сапогами хрустит вековая каменная крошка...",
    effectText: "Находка: +4 💰 Золота",
    tone: "positive", // "neutral" | "positive" | "negative"
};
```

---

## 3. Обработка краевых случаев и отказов

* **Выбор сцены и исхода при генерации/входе:** При входе в неисследованный коридор игра выбирает случайную локацию из `GAME_DATA.corridorRooms`, а затем выбирает случайный `outcomeId` из массива `outcomeIds` этой локации. Сформированный результат сохраняется в `this.currentCorridorResult`.
* **Смертельный урон от ловушки (`trap_hp`):** Урон снижает `this.player.hp = Math.max(0, this.player.hp - dmg)`. Если `this.player.hp <= 0`, на экране коридора отображается сообщение о гибели, а нажатие кнопки переводит игру в `GAMEOVER` с вызовом `calculateSouls()`.
* **Набор уровня от находки опыта (`xp`):** При выходе с экрана коридора вызывается `checkLevelUpOrFinishRoom()`. Если полученного опыта хватило на новый уровень, открывается экран выбора перка `LEVELUP`, после чего комната штатно завершается (`cleared = true`).
* **Повторный визит (бэктрекинг):** Если `roomObj.cleared === true`, повторный переход в клетку `corridor` оставляет игрока в состоянии `MAP` без повторного открытия экрана и без начисления эффектов.
* **Перезагрузка страницы (F5):** Эффект комнаты применяется один раз в момент входа (`enterCurrentRoomContent`), а сформированный `currentCorridorResult` сериализуется в `autosave`. Перезагрузка страницы на экране `CORRIDOR` не позволяет перебросить исход и не дублирует награду/урон.
* **Подсчёт комнат (`this.room`):**
  * В `moveToRoom`: `this.room = Object.values(this.dungeonRooms).filter(r => r.visited && r.type !== "corridor").length;`
  * В `getSlotSummary`: учитываются только комнаты с `r.type !== "corridor"`.

---

## 4. Пошаговый план реализации

1. [x] **Шаг 1: Раздельные справочники комнат и исходов в `src/game-data.js`**
   * Добавить `GAME_DATA.corridorRooms` (список тематических локаций с полями `id`, `title`, `desc`, `outcomeIds`).
   * Добавить `GAME_DATA.corridorOutcomes` (реестр эффектов с полями `id`, `text`, `kind`, `min`/`max`/`value`, `tone`).

2. [x] **Шаг 2: Генерация комнат `corridor` в `src/dungeon-generator.js`**
   * Увеличить общее число генерируемых клеток этажа: `const majorCount = 10 + floor * 2; const corridorCount = 3 + floor; const targetCount = majorCount + corridorCount;`.
   * При распределении типов из `pool` назначать `corridorCount` комнатам тип `"corridor"`.

3. [x] **Шаг 3: Логика обработки, применение исходов и персистентность в `src/game-engine.js`**
   * Добавить поле `this.currentCorridorResult = null` в конструктор, `serializeState()` и `loadGame()`.
   * Исключить `r.type === "corridor"` из расчёта `this.room` в `moveToRoom()` и из счётчика комнат в `getSlotSummary()`.
   * В `enterCurrentRoomContent()` добавить ветку `roomObj.type === "corridor"`: если `!roomObj.cleared`, разыграть сцену в `triggerCorridorRoom()`, иначе оставить `this.state = "MAP"`.
   * Реализовать `triggerCorridorRoom()`: выбор случайной комнаты из `corridorRooms`, выбор исхода из её `outcomeIds`, применение эффекта (`gold`, `heal`, `xp`, `en`, `concentrate`, `trap_hp`, `trap_en`), сохранение описания в `currentCorridorResult`.
   * Реализовать `leaveCorridorRoom()`: если `this.player.hp <= 0`, вызвать `calculateSouls()` и перейти в `GAMEOVER`, иначе сбросить `currentCorridorResult` и вызвать `checkLevelUpOrFinishRoom()`.

4. [x] **Шаг 4: Экран осмотра и карта в `src/game-ui.js`**
   * Добавить `corridor: { icon: "🕯️", name: "Коридор" }` в словарь `roomTypes` в `renderMapScreen()`.
   * Подключить состояние `"CORRIDOR"` в `render()` и массив активных состояний в `renderGlobalNav()`.
   * Реализовать `renderCorridorScreen()` с отображением заголовка локации, описания сцены, плашки результата (нейтральной, зелёной или красной) и кнопки перехода.

---

## 5. Стратегия ручной верификации

* Проверка синтаксиса всех изменённых файлов: `node -c src/game-data.js`, `node -c src/dungeon-generator.js`, `node -c src/game-engine.js`, `node -c src/game-ui.js`.
* Открытие `src/index.html` в браузере:
  * Проверка генерации этажа (`Object.values(game.dungeonRooms)` в консоли): наличие ровно `10 + floor * 2` основных комнат и `3 + floor` комнат типа `"corridor"`.
  * Разведка и вход в комнату `🕯️ Коридор`: проверка начисления `+1 EN`, открытия экрана `CORRIDOR` с текстом локации и эффектом из её пула, неизменности `game.room` и корректного возврата на карту.
  * Повторный вход в пройденный коридор: мгновенное перемещение по карте без открытия экрана.
  * Проверка летального исхода в коридоре при `hp <= 2` и срабатывании ловушки `trap_hp`.
