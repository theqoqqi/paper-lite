const DATA_MUTATIONS = [
    { id: "armored", prefix: "Бронированный", hpBonus: 4, defBonus: 1, atkBonus: 0, xpBonus: 2 },
    { id: "furious", prefix: "Яростный", hpBonus: 2, defBonus: 0, atkBonus: 2, xpBonus: 2 },
    { id: "plagued", prefix: "Чумной", hpBonus: 3, defBonus: 0, atkBonus: 0, poisonOnHit: 1, xpBonus: 2 },
    { id: "spiked", prefix: "Шипастый", hpBonus: 3, defBonus: 0, atkBonus: 0, spikes: 2, xpBonus: 2 },
    { id: "regen", prefix: "Регенерирующий", hpBonus: 4, defBonus: 0, atkBonus: 0, regen: 3, xpBonus: 2 },
    { id: "bloodthirsty", prefix: "Кровожадный", hpBonus: 3, defBonus: 0, atkBonus: 1, bleedOnHit: 1, xpBonus: 2 },
    { id: "giant", prefix: "Гигантский", hpBonus: 10, defBonus: 0, atkBonus: 2, xpBonus: 3 },
];

const DATA_FLOORS = [
    {
        id: 0,
        name: "Заброшенные Катакомбы",
        enemies: ["rat", "slime", "spiderling", "skeleton", "goblin", "bat", "zombie", "ghoul"],
        elite: ["centurion", "spiderQueen"],
        boss: "kingVort",
    },
    {
        id: 1,
        name: "Грибные Пещеры и Топи",
        enemies: ["sporeMushroom", "leech", "mosquito", "myconid", "witch", "crawler", "shambler", "bogTroll"],
        elite: ["hydra", "alchemist"],
        boss: "agaric",
    },
    {
        id: 2,
        name: "Кузня Железного Культа",
        enemies: ["drone", "fireImp", "slagSlime", "cultist", "crossbowman", "lavaElemental", "pyromancer", "ironGolem"],
        elite: ["inquisitor", "juggernaut"],
        boss: "vulkan",
    },
    {
        id: 3,
        name: "Цитадель Пустоты",
        enemies: ["voidHound", "voidShard", "eyeOfTerror", "astralBlade", "mindFlayer", "shadowWeaver", "darkKnight", "riftArchon"],
        elite: ["valkyrie", "chronosDemon"],
        boss: "malkor",
    },
];

const DATA_ENEMIES = {
    // Этаж 1
    rat: { name: "Пещерная Крыса", weight: 1, hp: 7, def: 0, xp: 2, pattern: [{ type: "attack", val: 3, text: "Укус" }] },
    slime: {
        name: "Кислотный Слизень",
        weight: 1,
        hp: 9,
        def: 0,
        xp: 2,
        pattern: [
            { type: "attackPoison", val: 2, poison: 1, text: "Кислотный плевок (+Яд)" },
            { type: "heal", val: 3, text: "Слияние (+3 HP)" },
        ],
    },
    spiderling: {
        name: "Паучок Склепа",
        weight: 1,
        hp: 7,
        def: 0,
        xp: 2,
        pattern: [
            { type: "attackPoison", val: 2, poison: 1, text: "Ядовитый укус" },
            { type: "attack", val: 4, text: "Прыжок" },
        ],
    },
    skeleton: {
        name: "Скелет-Мечник",
        weight: 2,
        hp: 13,
        def: 1,
        xp: 3,
        pattern: [
            { type: "attack", val: 4, text: "Рубящий удар" },
            { type: "defendAttack", val: 3, shield: 4, text: "Блок щитом и выпад" },
        ],
    },
    goblin: {
        name: "Гоблин-Мародёр",
        weight: 2,
        hp: 11,
        def: 0,
        xp: 3,
        pattern: [
            { type: "attack", val: 4, text: "Бросок кинжала" },
            { type: "attackBleed", val: 5, bleed: 1, text: "Рваный порез (+Кровь)" },
        ],
    },
    bat: { name: "Кровавый Нетопырь", weight: 2, hp: 10, def: 0, xp: 3, pattern: [{ type: "vampire", val: 4, text: "Вампирский укус" }] },
    zombie: {
        name: "Чумной Зомби",
        weight: 2,
        hp: 16,
        def: 0,
        xp: 3,
        pattern: [
            { type: "charge", val: 0, text: "Тяжёлый замах..." },
            { type: "attackPoison", val: 7, poison: 1, text: "Гнилой захват (+Яд)" },
        ],
    },
    ghoul: {
        name: "Склепный Гуль",
        weight: 3,
        hp: 19,
        def: 1,
        xp: 5,
        pattern: [
            { type: "attackBleed", val: 4, bleed: 1, text: "Удар когтями (+Кровь)" },
            { type: "charge", val: 0, text: "Готовит прыжок!" },
            { type: "attack", val: 8, text: "Бешеный разрыв" },
        ],
    },

    // Этаж 2
    sporeMushroom: { name: "Споровый Гриб", weight: 1, hp: 12, def: 0, xp: 3, pattern: [{ type: "attackPoison", val: 3, poison: 2, text: "Выброс спор (+Яд 2)" }] },
    leech: { name: "Болотный Пиявочник", weight: 1, hp: 13, def: 0, xp: 3, pattern: [{ type: "attackBleed", val: 4, bleed: 2, text: "Присоска (+Кровь 2)" }] },
    mosquito: { name: "Гигантский Москит", weight: 1, hp: 11, def: 0, xp: 3, pattern: [{ type: "vampire", val: 5, text: "Высасывание крови" }] },
    myconid: {
        name: "Миконид-Страж",
        weight: 2,
        hp: 20,
        def: 1,
        xp: 6,
        pattern: [
            { type: "attack", val: 6, text: "Удар дубиной" },
            { type: "shieldHeal", val: 3, shield: 5, text: "Зарастание (+5 Щит, +3 HP)" },
        ],
    },
    witch: {
        name: "Топяная Ведьма",
        weight: 2,
        hp: 16,
        def: 0,
        xp: 6,
        pattern: [
            { type: "attackPoison", val: 5, poison: 2, text: "Проклятие трясины (+Яд 2)" },
            { type: "attack", val: 8, text: "Взрыв болотного газа" },
        ],
    },
    crawler: {
        name: "Панцирный Ползун",
        weight: 2,
        hp: 19,
        def: 2,
        xp: 6,
        pattern: [
            { type: "defendAttack", val: 6, shield: 4, text: "Таран клешнями (+4 Щит)" },
        ],
    },
    shambler: {
        name: "Гнилой Шаркун",
        weight: 2,
        hp: 23,
        def: 1,
        xp: 6,
        pattern: [
            { type: "attack", val: 7, text: "Тяжёлая плеть" },
            { type: "attackPoison", val: 5, poison: 2, text: "Облако миазмов (+Яд 2)" },
        ],
    },
    bogTroll: {
        name: "Тролль Трясины",
        weight: 3,
        hp: 30,
        def: 1,
        xp: 8,
        pattern: [
            { type: "vampire", val: 7, text: "Удар бревном (+Реген)" },
            { type: "heal", val: 5, text: "Рёв тролля (+5 HP)" },
            { type: "attack", val: 11, text: "Сокрушение черепа" },
        ],
    },

    // Этаж 3
    drone: {
        name: "Заводной Дрон",
        weight: 1,
        hp: 15,
        def: 2,
        xp: 5,
        pattern: [
            { type: "pierce", val: 5, text: "Лазерный луч (Чистый)" },
            { type: "charge", val: 0, text: "Нагрев ядра!" },
            { type: "attack", val: 10, text: "Взрывной разряд" },
        ],
    },
    fireImp: { name: "Огненный Бес", weight: 1, hp: 17, def: 0, xp: 5, pattern: [{ type: "attack", val: 7, text: "Огненный шар" }] },
    slagSlime: {
        name: "Шлаковый Слизень",
        weight: 1,
        hp: 19,
        def: 2,
        xp: 5,
        pattern: [
            { type: "attackBleed", val: 6, bleed: 2, text: "Брызги расплава (+Ожог)" },
            { type: "shieldHeal", val: 3, shield: 5, text: "Затвердевание (+5 Щит)" },
        ],
    },
    cultist: {
        name: "Культист Пламени",
        weight: 2,
        hp: 26,
        def: 1,
        xp: 8,
        pattern: [
            { type: "attack", val: 8, text: "Пламенный клинок" },
            { type: "attackBleed", val: 9, bleed: 2, text: "Раскалённый цеп (+Кровь 2)" },
        ],
    },
    crossbowman: {
        name: "Стальной Арбалетчик",
        weight: 2,
        hp: 24,
        def: 2,
        xp: 8,
        pattern: [
            { type: "attack", val: 11, text: "Тяжёлый болт" },
            { type: "shieldHeal", val: 0, shield: 6, text: "Перезарядка за щитом (+6 Щит)" },
        ],
    },
    lavaElemental: { name: "Лавовый Элементаль", weight: 2, hp: 28, def: 1, xp: 8, spikes: 2, pattern: [{ type: "attack", val: 8, text: "Волна магмы" }] },
    pyromancer: {
        name: "Геомант Кузни",
        weight: 2,
        hp: 24,
        def: 1,
        xp: 8,
        pattern: [
            { type: "drainEn", val: 7, text: "Выжигание маны (-1 EN)" },
            { type: "attack", val: 10, text: "Столп пламени" },
        ],
    },
    ironGolem: {
        name: "Железный Голем",
        weight: 3,
        hp: 38,
        def: 3,
        xp: 11,
        pattern: [
            { type: "attack", val: 9, text: "Удар молотом" },
            { type: "shieldHeal", val: 0, shield: 8, text: "Паровой барьер (+8 Щит)" },
            { type: "attack", val: 14, text: "Землетрясение" },
        ],
    },

    // Этаж 4
    voidHound: {
        name: "Гончая Пустоты",
        weight: 1,
        hp: 22,
        def: 1,
        xp: 7,
        pattern: [
            { type: "attackBleed", val: 8, bleed: 2, text: "Клыки Бездны (+Кровь 2)" },
            
        ]
    },
    voidShard: {
        name: "Осколок Бездны",
        weight: 1,
        hp: 18,
        def: 3,
        xp: 7,
        pattern: [
            { type: "drainEn", val: 6, text: "Пси-импульс (-1 EN)" },
            
        ]
    },
    eyeOfTerror: {
        name: "Око Ужаса",
        weight: 1,
        hp: 20,
        def: 1,
        xp: 7,
        pattern: [
            { type: "attackPoison", val: 7, poison: 3, text: "Луч распада (+Яд 3)" },
        ]
    },
    astralBlade: {
        name: "Астральный Клинок",
        weight: 2,
        hp: 32,
        def: 2,
        xp: 11,
        pattern: [
            { type: "attack", val: 11, text: "Двойной росчерк" },
            { type: "defendAttack", val: 7, shield: 8, text: "Парирование (+8 Щит)" },
        ],
    },
    mindFlayer: {
        name: "Пожиратель Разума",
        weight: 2,
        hp: 29,
        def: 1,
        xp: 11,
        pattern: [
            { type: "drainEn", val: 8, text: "Ментальный взрыв (-1 EN)" },
            { type: "vampire", val: 8, text: "Вытягивание жизни" },
        ],
    },
    shadowWeaver: {
        name: "Ткач Теней",
        weight: 2,
        hp: 28,
        def: 1,
        xp: 11,
        pattern: [
            { type: "attackBleed", val: 9, bleed: 2, text: "Нити тьмы (+Кровь 2)" },
            { type: "attack", val: 11, text: "Теневое копьё" },
        ],
    },
    darkKnight: {
        name: "Тёмный Рыцарь",
        weight: 3,
        hp: 42,
        def: 3,
        xp: 14,
        pattern: [
            { type: "attackBleed", val: 11, bleed: 2, text: "Клеймор Бездны (+Кровь 2)" },
            { type: "defendAttack", val: 7, shield: 10, text: "Тёмный барьер (+10 Щит)" },
        ],
    },
    riftArchon: {
        name: "Архонт Разлома",
        weight: 3,
        hp: 46,
        def: 2,
        xp: 14,
        pattern: [
            { type: "attack", val: 10, text: "Гравитационный пресс" },
            { type: "shieldHeal", val: 0, shield: 8, text: "Сингулярность (+8 Щит)" },
            { type: "attack", val: 17, text: "Сверхновая!" },
        ],
    },

    // Специальные, Элита и Боссы
    mimic: {
        name: "Алчный Мимик",
        weight: 3,
        hp: 32,
        def: 2,
        xp: 10,
        isElite: true,
        pattern: [
            { type: "attackBleed", val: 7, bleed: 2, text: "Капкан челюстей (+Кровь 2)" },
            { type: "defendAttack", val: 6, shield: 6, text: "Захлопнуть крышку (+6 Щит)" },
        ],
    },

    centurion: {
        name: "[ЭЛИТА] Костяной Центурион",
        weight: 3,
        hp: 30,
        def: 1,
        xp: 9,
        isElite: true,
        pattern: [
            { type: "attack", val: 5, text: "Копьё легиона" },
            { type: "defendAttack", val: 5, shield: 5, text: "Башенный щит (+5 Щит)" },
            { type: "attack", val: 9, text: "Казнь" },
        ],
    },
    spiderQueen: {
        name: "[ЭЛИТА] Паучья Матка",
        weight: 3,
        hp: 32,
        def: 0,
        xp: 9,
        isElite: true,
        pattern: [
            { type: "drainEn", val: 4, text: "Кокон паутины (-1 EN)" },
            { type: "attackPoison", val: 5, poison: 2, text: "Ядовитые жвалы (+Яд 2)" },
            { type: "vampire", val: 6, text: "Поедание жертвы" },
        ],
    },
    kingVort: {
        name: "[БОСС] Король Склепа Ворт",
        hp: 48,
        def: 1,
        xp: 16,
        isBoss: true,
        shield: 6,
        pattern: [
            { type: "attack", val: 6, text: "Взмах скипетром" },
            { type: "defendAttack", val: 5, shield: 6, text: "Костяной бастион (+6 Щит)" },
            { type: "charge", val: 0, text: "Тёмный заряд!" },
            { type: "attack", val: 11, text: "Удар Могильной Плиты" },
        ],
    },

    hydra: {
        name: "[ЭЛИТА] Гидра Гниловодья",
        weight: 3,
        hp: 45,
        def: 1,
        xp: 14,
        isElite: true,
        pattern: [
            { type: "attackPoison", val: 7, poison: 2, text: "Укус трёх голов (+Яд 2)" },
            { type: "vampire", val: 7, text: "Регенерация плоти" },
        ],
    },
    alchemist: {
        name: "[ЭЛИТА] Чумной Алхимик",
        weight: 3,
        hp: 38,
        def: 1,
        xp: 14,
        isElite: true,
        pattern: [
            { type: "attackPoison", val: 6, poison: 2, text: "Колба с кислотой (+Яд 2)" },
            { type: "shieldHeal", val: 4, shield: 6, text: "Мутаген (+6 Щит, +4 HP)" },
            { type: "attack", val: 10, text: "Взрывная смесь" },
        ],
    },
    agaric: {
        name: "[БОСС] Споровый Колосс Агарик",
        hp: 68,
        def: 2,
        xp: 24,
        isBoss: true,
        pattern: [
            { type: "drainEn", val: 8, text: "Сейсмический топот (-1 EN)" },
            { type: "defendAttack", val: 6, shield: 8, text: "Посев мицелия (+8 Щит)" },
            { type: "attackPoison", val: 11, poison: 2, text: "Симбиотический взрыв (+Яд 2)" },
        ],
    },

    inquisitor: {
        name: "[ЭЛИТА] Инквизитор Кузни",
        weight: 3,
        hp: 54,
        def: 2,
        xp: 20,
        isElite: true,
        pattern: [
            { type: "attack", val: 9, text: "Раскалённое клеймо" },
            { type: "attackBleed", val: 10, bleed: 2, text: "Серия ударов (+Кровь 2)" },
            { type: "shieldHeal", val: 6, shield: 7, text: "Очищение огнём (+6 HP, +7 Щит)" },
        ],
    },
    juggernaut: {
        name: "[ЭЛИТА] Паровой Джаггернаут",
        weight: 3,
        hp: 60,
        def: 3,
        xp: 20,
        isElite: true,
        pattern: [
            { type: "attack", val: 10, text: "Паровой пресс" },
            { type: "defendAttack", val: 8, shield: 8, text: "Бронеплита (+8 Щит)" },
            { type: "attack", val: 14, text: "Полный ход" },
        ],
    },
    vulkan: {
        name: "[БОСС] Архимеханик Вулкан",
        hp: 95,
        def: 2,
        xp: 35,
        isBoss: true,
        pattern: [
            { type: "drainEn", val: 10, text: "Тесла-разряд (-1 EN)" },
            { type: "defendAttack", val: 8, shield: 10, text: "Сборка защиты (+10 Щит)" },
            { type: "attackBleed", val: 12, bleed: 2, text: "Раскалённая наковальня (+Кровь 2)" },
            { type: "attack", val: 16, text: "Перегрузка реактора" },
        ],
    },

    valkyrie: {
        name: "[ЭЛИТА] Валькирия Забвения",
        weight: 3,
        hp: 70,
        def: 2,
        xp: 28,
        isElite: true,
        pattern: [
            { type: "attack", val: 12, text: "Пикирующее копьё" },
            { type: "defendAttack", val: 8, shield: 12, text: "Крылья Тьмы (+12 Щит)" },
            { type: "attack", val: 15, text: "Судный вихрь" },
        ],
    },
    chronosDemon: {
        name: "[ЭЛИТА] Демон Хроноса",
        weight: 3,
        hp: 66,
        def: 2,
        xp: 28,
        isElite: true,
        pattern: [
            { type: "attackPoison", val: 10, poison: 3, text: "Временной разлом (+Яд 3)" },
            { type: "vampire", val: 10, text: "Откат времени" },
            { type: "attack", val: 15, text: "Коллапс эпох" },
        ],
    },
    malkor: {
        name: "[ФИНАЛЬНЫЙ БОСС] Владыка Малкор",
        hp: 135,
        def: 3,
        xp: 75,
        isBoss: true,
        shield: 15,
        pattern: [
            { type: "attackBleed", val: 13, bleed: 3, text: "Копьё Рока (+Кровь 3)" },
            { type: "defendAttack", val: 10, shield: 14, text: "Эгида Пустоты (+14 Щит)" },
            { type: "drainEn", val: 12, text: "Пожирание звёзд (-1 EN)" },
            { type: "attack", val: 19, text: "Аннигиляция" },
        ],
    },
};

