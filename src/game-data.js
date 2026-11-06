// ============================================================================
// GAME-DATA.JS — База данных: Классы, Навыки, Враги, Предметы, Перки, События
// ============================================================================

const GAME_DATA = {
    classes: {
        wanderer: {
            id: "wanderer", name: "Странник", hp: 18, atk: 3, def: 0, en: 4, crit: 15, cost: 0,
            desc: "Сбалансированный боец. На старте получает +10 Золота и Зелье Исцеления."
        },
        crusader: {
            id: "crusader", name: "Крестоносец", hp: 24, atk: 2, def: 1, en: 3, crit: 10, cost: 25,
            desc: "Глухая защита даёт на +4 больше Щита и возвращает врагам +3 урона Шипами."
        },
        assassin: {
            id: "assassin", name: "Ассасин Тени", hp: 14, atk: 4, def: 0, en: 5, crit: 25, cost: 40,
            desc: "Повышенный шанс крита (25%). В 1-й раунд боя все удары гарантированно Критические и пробивают DEF."
        },
        reaper: {
            id: "reaper", name: "Кровавый Жнец", hp: 25, atk: 3, def: 0, en: 4, crit: 15, cost: 55,
            desc: "Убийство любого врага лечит +3 HP. При нехватке Энергии может платить кровью (3 HP за 1 EN)."
        },
        arcanist: {
            id: "arcanist", name: "Арканист", hp: 15, atk: 2, def: 0, en: 6, crit: 15, cost: 70,
            desc: "Регенерирует +1 EN каждый раунд. Вихрь превращается в Огненный Залп (выше урон и пробитие DEF)."
        },
        engineer: {
            id: "engineer", name: "Инженер Кузни", hp: 18, atk: 3, def: 1, en: 4, crit: 15, cost: 85,
            desc: "На старте боя получает +5 Щита. В конце каждого раунда его Авто-турель наносит 3 чистого урона случайному врагу."
        }
    },

    skillsInfo: [
        {
            id: "fast", name: "⚔️ Быстрый удар", cost: "0 EN", cd: "Нет",
            desc: "Наносит [ATK + 1..4] физ. урона выбранной цели. Имеет бонус +10% к шансу Крита. При Крите восстанавливает +1 EN."
        },
        {
            id: "defend", name: "🛡️ Глухая защита", cost: "0 EN", cd: "2 хода",
            desc: "Даёт [4 + DEF] Щита, восстанавливает +1 EN и снимает 1 стак Кровотока. Нельзя использовать два хода подряд."
        },
        {
            id: "heavy", name: "💥 Тяжёлый выпад", cost: "1 EN", cd: "Нет",
            desc: "Мощный удар на [ATK × 1.4 + 2..6] физ. урона по выбранной цели."
        },
        {
            id: "pierce", name: "🗡️ Пробивающий удар", cost: "2 EN", cd: "2 хода",
            desc: "Наносит [ATK × 2 + 4] фиксированного ЧИСТОГО урона (полностью игнорирует DEF врага)."
        },
        {
            id: "whirlwind", name: "🌪️ Круговой вихрь", cost: "2 EN", cd: "2 хода",
            desc: "Атакует ВСЕХ врагов одновременно на [ATK + 2..5] урона (у Арканиста бьёт сильнее и сквозь DEF)."
        },
        {
            id: "concentrate", name: "🧘 Концентрация", cost: "0 EN", cd: "3 хода (макс. 2 за бой)",
            desc: "Восстанавливает +2 EN, лечит +3 HP и даёт бафф +3 ATK на следующий удар."
        }
    ],

    metaUpgrades: [
        { key: "hp", name: "Живучесть", desc: "+4 MAX HP на старте", max: 10, costs: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] },
        { key: "atk", name: "Сила крови", desc: "+1 ATK на старте", max: 8, costs: [15, 30, 45, 60, 75, 90, 105, 120] },
        { key: "def", name: "Каменная кожа", desc: "+1 DEF на старте", max: 4, costs: [30, 70, 130, 210] },
        { key: "en", name: "Запас дыхания", desc: "+1 MAX EN на старте", max: 3, costs: [25, 60, 110] },
        { key: "gold", name: "Кошель наследия", desc: "+8 Золота на старте", max: 5, costs: [8, 16, 24, 32, 40] },
        { key: "potions", name: "Пояс алхимика", desc: "+1 Слот зелий и случайное зелье на старте", max: 2, costs: [20, 50] }
    ],

    mutations: [
        { id: "armored", prefix: "Бронированный", hpBonus: 4, defBonus: 1, atkBonus: 0, xpBonus: 2 },
        { id: "furious", prefix: "Яростный", hpBonus: 2, defBonus: 0, atkBonus: 2, xpBonus: 2 },
        { id: "plagued", prefix: "Чумной", hpBonus: 3, defBonus: 0, atkBonus: 0, poisonOnHit: 1, xpBonus: 2 },
        { id: "spiked", prefix: "Шипастый", hpBonus: 3, defBonus: 0, atkBonus: 0, spikes: 2, xpBonus: 2 },
        { id: "regen", prefix: "Регенерирующий", hpBonus: 4, defBonus: 0, atkBonus: 0, regen: 3, xpBonus: 2 },
        { id: "bloodthirsty", prefix: "Кровожадный", hpBonus: 3, defBonus: 0, atkBonus: 1, bleedOnHit: 1, xpBonus: 2 },
        { id: "giant", prefix: "Гигантский", hpBonus: 10, defBonus: 0, atkBonus: 2, xpBonus: 3 }
    ],

    floors: [
        {
            id: 0, name: "Заброшенные Катакомбы",
            enemies: ["rat", "slime", "spiderling", "skeleton", "goblin", "bat", "zombie", "ghoul"],
            elite: ["centurion", "spiderQueen"], boss: "kingVort"
        },
        {
            id: 1, name: "Грибные Пещеры и Топи",
            enemies: ["sporeMushroom", "leech", "mosquito", "myconid", "witch", "crawler", "shambler", "bogTroll"],
            elite: ["hydra", "alchemist"], boss: "agaric"
        },
        {
            id: 2, name: "Кузня Железного Культа",
            enemies: ["drone", "fireImp", "slagSlime", "cultist", "crossbowman", "lavaElemental", "pyromancer", "ironGolem"],
            elite: ["inquisitor", "juggernaut"], boss: "vulkan"
        },
        {
            id: 3, name: "Цитадель Пустоты",
            enemies: ["voidHound", "voidShard", "eyeOfTerror", "astralBlade", "mindFlayer", "shadowWeaver", "darkKnight", "riftArchon"],
            elite: ["valkyrie", "chronosDemon"], boss: "malkor"
        }
    ],

    enemies: {
        // Этаж 1
        rat: { name: "Пещерная Крыса", weight: 1, hp: 7, def: 0, xp: 2, pattern: [{ type: "attack", val: 3, text: "Укус" }] },
        slime: { name: "Кислотный Слизень", weight: 1, hp: 9, def: 0, xp: 2, pattern: [{ type: "attackPoison", val: 2, poison: 1, text: "Кислотный плевок (+Яд)" }, { type: "heal", val: 3, text: "Слияние (+3 HP)" }] },
        spiderling: { name: "Паучок Склепа", weight: 1, hp: 7, def: 0, xp: 2, pattern: [{ type: "attackPoison", val: 2, poison: 1, text: "Ядовитый укус" }, { type: "attack", val: 4, text: "Прыжок" }] },
        skeleton: { name: "Скелет-Мечник", weight: 2, hp: 13, def: 1, xp: 3, pattern: [{ type: "attack", val: 4, text: "Рубящий удар" }, { type: "defendAttack", val: 3, shield: 4, text: "Блок щитом и выпад" }] },
        goblin: { name: "Гоблин-Мародёр", weight: 2, hp: 11, def: 0, xp: 3, pattern: [{ type: "attack", val: 4, text: "Бросок кинжала" }, { type: "attackBleed", val: 5, bleed: 1, text: "Рваный порез (+Кровь)" }] },
        bat: { name: "Кровавый Нетопырь", weight: 2, hp: 10, def: 0, xp: 3, pattern: [{ type: "vampire", val: 4, text: "Вампирский укус" }] },
        zombie: { name: "Чумной Зомби", weight: 2, hp: 16, def: 0, xp: 3, pattern: [{ type: "charge", val: 0, text: "Тяжёлый замах..." }, { type: "attackPoison", val: 7, poison: 1, text: "Гнилой захват (+Яд)" }] },
        ghoul: { name: "Склепный Гуль", weight: 3, hp: 19, def: 1, xp: 5, pattern: [{ type: "attackBleed", val: 4, bleed: 1, text: "Удар когтями (+Кровь)" }, { type: "charge", val: 0, text: "Готовит прыжок!" }, { type: "attack", val: 8, text: "Бешеный разрыв" }] },

        // Этаж 2
        sporeMushroom: { name: "Споровый Гриб", weight: 1, hp: 12, def: 0, xp: 3, pattern: [{ type: "attackPoison", val: 3, poison: 2, text: "Выброс спор (+Яд 2)" }] },
        leech: { name: "Болотный Пиявочник", weight: 1, hp: 13, def: 0, xp: 3, pattern: [{ type: "attackBleed", val: 4, bleed: 2, text: "Присоска (+Кровь 2)" }] },
        mosquito: { name: "Гигантский Москит", weight: 1, hp: 11, def: 0, xp: 3, pattern: [{ type: "vampire", val: 5, text: "Высасывание крови" }] },
        myconid: { name: "Миконид-Страж", weight: 2, hp: 20, def: 1, xp: 6, pattern: [{ type: "attack", val: 6, text: "Удар дубиной" }, { type: "shieldHeal", val: 3, shield: 5, text: "Зарастание (+5 Щит, +3 HP)" }] },
        witch: { name: "Топяная Ведьма", weight: 2, hp: 16, def: 0, xp: 6, pattern: [{ type: "attackPoison", val: 5, poison: 2, text: "Проклятие трясины (+Яд 2)" }, { type: "attack", val: 8, text: "Взрыв болотного газа" }] },
        crawler: { name: "Панцирный Ползун", weight: 2, hp: 19, def: 2, xp: 6, pattern: [{ type: "defendAttack", val: 6, shield: 4, text: "Таран клешнями (+4 Щит)" }] },
        shambler: { name: "Гнилой Шаркун", weight: 2, hp: 23, def: 1, xp: 6, pattern: [{ type: "attack", val: 7, text: "Тяжёлая плеть" }, { type: "attackPoison", val: 5, poison: 2, text: "Облако миазмов (+Яд 2)" }] },
        bogTroll: { name: "Тролль Трясины", weight: 3, hp: 30, def: 1, xp: 8, pattern: [{ type: "vampire", val: 7, text: "Удар бревном (+Реген)" }, { type: "heal", val: 5, text: "Рёв тролля (+5 HP)" }, { type: "attack", val: 11, text: "Сокрушение черепа" }] },

        // Этаж 3
        drone: { name: "Заводной Дрон", weight: 1, hp: 15, def: 2, xp: 5, pattern: [{ type: "pierce", val: 5, text: "Лазерный луч (Чистый)" }, { type: "charge", val: 0, text: "Нагрев ядра!" }, { type: "attack", val: 10, text: "Взрывной разряд" }] },
        fireImp: { name: "Огненный Бес", weight: 1, hp: 17, def: 0, xp: 5, pattern: [{ type: "attack", val: 7, text: "Огненный шар" }] },
        slagSlime: { name: "Шлаковый Слизень", weight: 1, hp: 19, def: 2, xp: 5, pattern: [{ type: "attackBleed", val: 6, bleed: 2, text: "Брызги расплава (+Ожог)" }, { type: "shieldHeal", val: 3, shield: 5, text: "Затвердевание (+5 Щит)" }] },
        cultist: { name: "Культист Пламени", weight: 2, hp: 26, def: 1, xp: 8, pattern: [{ type: "attack", val: 8, text: "Пламенный клинок" }, { type: "attackBleed", val: 9, bleed: 2, text: "Раскалённый цеп (+Кровь 2)" }] },
        crossbowman: { name: "Стальной Арбалетчик", weight: 2, hp: 24, def: 2, xp: 8, pattern: [{ type: "attack", val: 11, text: "Тяжёлый болт" }, { type: "shieldHeal", val: 0, shield: 6, text: "Перезарядка за щитом (+6 Щит)" }] },
        lavaElemental: { name: "Лавовый Элементаль", weight: 2, hp: 28, def: 1, xp: 8, spikes: 2, pattern: [{ type: "attack", val: 8, text: "Волна магмы" }] },
        pyromancer: { name: "Геомант Кузни", weight: 2, hp: 24, def: 1, xp: 8, pattern: [{ type: "drainEn", val: 7, text: "Выжигание маны (-1 EN)" }, { type: "attack", val: 10, text: "Столп пламени" }] },
        ironGolem: { name: "Железный Голем", weight: 3, hp: 38, def: 3, xp: 11, pattern: [{ type: "attack", val: 9, text: "Удар молотом" }, { type: "shieldHeal", val: 0, shield: 8, text: "Паровой барьер (+8 Щит)" }, { type: "attack", val: 14, text: "Землетрясение" }] },

        // Этаж 4
        voidHound: { name: "Гончая Пустоты", weight: 1, hp: 22, def: 1, xp: 7, pattern: [{ type: "attackBleed", val: 8, bleed: 2, text: "Клыки Бездны (+Кровь 2)" }] },
        voidShard: { name: "Осколок Бездны", weight: 1, hp: 18, def: 3, xp: 7, pattern: [{ type: "drainEn", val: 6, text: "Пси-импульс (-1 EN)" }] },
        eyeOfTerror: { name: "Око Ужаса", weight: 1, hp: 20, def: 1, xp: 7, pattern: [{ type: "attackPoison", val: 7, poison: 3, text: "Луч распада (+Яд 3)" }] },
        astralBlade: { name: "Астральный Клинок", weight: 2, hp: 32, def: 2, xp: 11, pattern: [{ type: "attack", val: 11, text: "Двойной росчерк" }, { type: "defendAttack", val: 7, shield: 8, text: "Парирование (+8 Щит)" }] },
        mindFlayer: { name: "Пожиратель Разума", weight: 2, hp: 29, def: 1, xp: 11, pattern: [{ type: "drainEn", val: 8, text: "Ментальный взрыв (-1 EN)" }, { type: "vampire", val: 8, text: "Вытягивание жизни" }] },
        shadowWeaver: { name: "Ткач Теней", weight: 2, hp: 28, def: 1, xp: 11, pattern: [{ type: "attackBleed", val: 9, bleed: 2, text: "Нити тьмы (+Кровь 2)" }, { type: "attack", val: 11, text: "Теневое копьё" }] },
        darkKnight: { name: "Тёмный Рыцарь", weight: 3, hp: 42, def: 3, xp: 14, pattern: [{ type: "attackBleed", val: 11, bleed: 2, text: "Клеймор Бездны (+Кровь 2)" }, { type: "defendAttack", val: 7, shield: 10, text: "Тёмный барьер (+10 Щит)" }] },
        riftArchon: { name: "Архонт Разлома", weight: 3, hp: 46, def: 2, xp: 14, pattern: [{ type: "attack", val: 10, text: "Гравитационный пресс" }, { type: "shieldHeal", val: 0, shield: 8, text: "Сингулярность (+8 Щит)" }, { type: "attack", val: 17, text: "Сверхновая!" }] },

        // Специальные, Элита и Боссы
        mimic: { name: "Алчный Мимик", weight: 3, hp: 32, def: 2, xp: 10, isElite: true, pattern: [{ type: "attackBleed", val: 7, bleed: 2, text: "Капкан челюстей (+Кровь 2)" }, { type: "defendAttack", val: 6, shield: 6, text: "Захлопнуть крышку (+6 Щит)" }] },

        centurion: { name: "[ЭЛИТА] Костяной Центурион", weight: 3, hp: 30, def: 1, xp: 9, isElite: true, pattern: [{ type: "attack", val: 5, text: "Копьё легиона" }, { type: "defendAttack", val: 5, shield: 5, text: "Башенный щит (+5 Щит)" }, { type: "attack", val: 9, text: "Казнь" }] },
        spiderQueen: { name: "[ЭЛИТА] Паучья Матка", weight: 3, hp: 32, def: 0, xp: 9, isElite: true, pattern: [{ type: "drainEn", val: 4, text: "Кокон паутины (-1 EN)" }, { type: "attackPoison", val: 5, poison: 2, text: "Ядовитые жвалы (+Яд 2)" }, { type: "vampire", val: 6, text: "Поедание жертвы" }] },
        kingVort: { name: "[БОСС] Король Склепа Ворт", hp: 48, def: 1, xp: 16, isBoss: true, shield: 6, pattern: [{ type: "attack", val: 6, text: "Взмах скипетром" }, { type: "defendAttack", val: 5, shield: 6, text: "Костяной бастион (+6 Щит)" }, { type: "charge", val: 0, text: "Тёмный заряд!" }, { type: "attack", val: 11, text: "Удар Могильной Плиты" }] },

        hydra: { name: "[ЭЛИТА] Гидра Гниловодья", weight: 3, hp: 45, def: 1, xp: 14, isElite: true, pattern: [{ type: "attackPoison", val: 7, poison: 2, text: "Укус трёх голов (+Яд 2)" }, { type: "vampire", val: 7, text: "Регенерация плоти" }] },
        alchemist: { name: "[ЭЛИТА] Чумной Алхимик", weight: 3, hp: 38, def: 1, xp: 14, isElite: true, pattern: [{ type: "attackPoison", val: 6, poison: 2, text: "Колба с кислотой (+Яд 2)" }, { type: "shieldHeal", val: 4, shield: 6, text: "Мутаген (+6 Щит, +4 HP)" }, { type: "attack", val: 10, text: "Взрывная смесь" }] },
        agaric: { name: "[БОСС] Споровый Колосс Агарик", hp: 68, def: 2, xp: 24, isBoss: true, pattern: [{ type: "drainEn", val: 8, text: "Сейсмический топот (-1 EN)" }, { type: "defendAttack", val: 6, shield: 8, text: "Посев мицелия (+8 Щит)" }, { type: "attackPoison", val: 11, poison: 2, text: "Симбиотический взрыв (+Яд 2)" }] },

        inquisitor: { name: "[ЭЛИТА] Инквизитор Кузни", weight: 3, hp: 54, def: 2, xp: 20, isElite: true, pattern: [{ type: "attack", val: 9, text: "Раскалённое клеймо" }, { type: "attackBleed", val: 10, bleed: 2, text: "Серия ударов (+Кровь 2)" }, { type: "shieldHeal", val: 6, shield: 7, text: "Очищение огнём (+6 HP, +7 Щит)" }] },
        juggernaut: { name: "[ЭЛИТА] Паровой Джаггернаут", weight: 3, hp: 60, def: 3, xp: 20, isElite: true, pattern: [{ type: "attack", val: 10, text: "Паровой пресс" }, { type: "defendAttack", val: 8, shield: 8, text: "Бронеплита (+8 Щит)" }, { type: "attack", val: 14, text: "Полный ход" }] },
        vulkan: { name: "[БОСС] Архимеханик Вулкан", hp: 95, def: 2, xp: 35, isBoss: true, pattern: [{ type: "drainEn", val: 10, text: "Тесла-разряд (-1 EN)" }, { type: "defendAttack", val: 8, shield: 10, text: "Сборка защиты (+10 Щит)" }, { type: "attackBleed", val: 12, bleed: 2, text: "Раскалённая наковальня (+Кровь 2)" }, { type: "attack", val: 16, text: "Перегрузка реактора" }] },

        valkyrie: { name: "[ЭЛИТА] Валькирия Забвения", weight: 3, hp: 70, def: 2, xp: 28, isElite: true, pattern: [{ type: "attack", val: 12, text: "Пикирующее копьё" }, { type: "defendAttack", val: 8, shield: 12, text: "Крылья Тьмы (+12 Щит)" }, { type: "attack", val: 15, text: "Судный вихрь" }] },
        chronosDemon: { name: "[ЭЛИТА] Демон Хроноса", weight: 3, hp: 66, def: 2, xp: 28, isElite: true, pattern: [{ type: "attackPoison", val: 10, poison: 3, text: "Временной разлом (+Яд 3)" }, { type: "vampire", val: 10, text: "Откат времени" }, { type: "attack", val: 15, text: "Коллапс эпох" }] },
        malkor: { name: "[ФИНАЛЬНЫЙ БОСС] Владыка Малкор", hp: 135, def: 3, xp: 75, isBoss: true, shield: 15, pattern: [{ type: "attackBleed", val: 13, bleed: 3, text: "Копьё Рока (+Кровь 3)" }, { type: "defendAttack", val: 10, shield: 14, text: "Эгида Пустоты (+14 Щит)" }, { type: "drainEn", val: 12, text: "Пожирание звёзд (-1 EN)" }, { type: "attack", val: 19, text: "Аннигиляция" }] }
    },

    perks: [
        { id: "p1", name: "Тяжёлая рука", desc: "+1 ATK, Пробивающий удар наносит +4 урона." },
        { id: "p2", name: "Смертоносная точность", desc: "+12% к базовому шансу Критического удара." },
        { id: "p3", name: "Палач", desc: "+4 урона врагам с HP <= 50%." },
        { id: "p4", name: "Берсерк", desc: "+3 ATK, пока ваше HP <= 50%." },
        { id: "p5", name: "Закалённая сталь", desc: "+1 DEF до конца забега." },
        { id: "p6", name: "Рунический барьер", desc: "В начале каждого боя даёт +6 Щита." },
        { id: "p7", name: "Змеиное жало", desc: "Быстрый удар и Вихрь накладывают Яд (1)." },
        { id: "p8", name: "Зазубренная кромка", desc: "Тяжёлый выпад накладывает Кровоток (2)." },
        { id: "p9", name: "Глубокий вдох", desc: "+1 MAX EN, Концентрация лечит на +4 HP больше." },
        { id: "p10", name: "Кровь тролля", desc: "В конце каждого победного боя восстанавливает +4 HP." },
        { id: "p11", name: "Вампирский клык", desc: "Каждый Критический удар лечит +3 HP." },
        { id: "p12", name: "Шипастый доспех", desc: "Даёт постоянные Шипы (2)." },
        { id: "p13", name: "Первая кровь", desc: "В 1-м раунде боя ваши атаки наносят +5 урона." },
        { id: "p14", name: "Контратака", desc: "Глухая защита даёт дополнительно +3 Шипов на 1 ход." },
        { id: "p15", name: "Разрушитель щитов", desc: "Тяжёлый выпад и Пробивающий удар сначала полностью сносят Щит врага." },
        { id: "p16", name: "Катализатор чумы", desc: "Враги получают на +2 больше урона от Яда каждый раунд." },
        { id: "p17", name: "Кровавое пиршество", desc: "Убийство врага с Ядом или Кровотоком даёт +3 HP и +1 EN." },
        { id: "p18", name: "Боевой транс", desc: "Каждый 3-й раунд боя (3, 6, 9...) вы получаете +2 EN." },
        { id: "p19", name: "Железная воля", desc: "Любой удар врага на 8 и более урона снижается на -2." },
        { id: "p20", name: "Золотой удар", desc: "+1 ATK за каждые 15 Золота в кошельке (макс. +4 ATK)." },
        { id: "p21", name: "Мастер-алхимик", desc: "Зелья лечения восстанавливают +6 HP сверху." },
        { id: "p22", name: "Адреналин", desc: "Убийство любого врага мгновенно восстанавливает +1 EN." },
        { id: "p23", name: "Жизненная сила", desc: "Даёт +10 MAX HP." },
        { id: "p24", name: "Тактик", desc: "Снижает перезарядку Пробивающего удара и Вихря на 1 ход." },
        { id: "p25", name: "Охотник за головами", desc: "+5 XP и +8 Золота за победу над Элитой или Боссом." },
        { id: "p26", name: "Второе дыхание", desc: "Один раз за этаж спасает от смерти (оставляет 1 HP и даёт +12 Щита)." },
        { id: "p27", name: "Аура разложения", desc: "В начале каждого боя все враги получают Яд (2)." },
        { id: "p28", name: "Сытный привал", desc: "Отдых у костра восстанавливает на +25% больше HP и даёт +6 Золота." }
    ],

    items: {
        weapons: [
            // Обычные и Редкие (Тир 1)
            { id: "w1", name: "Ржавый Фальшион", type: "weapon", rarity: "Обычное", tier: 1, cost: 10, atk: 1, bleed: 1, desc: "+1 ATK, атаки вешают Кровоток (1)" },
            { id: "w2", name: "Пехотный Цеп", type: "weapon", rarity: "Обычное", tier: 1, cost: 13, atk: 2, desc: "+2 ATK" },
            { id: "w3", name: "Отравленный Стилет", type: "weapon", rarity: "Редкое", tier: 1, cost: 16, atk: 1, crit: 10, poison: 1, desc: "+1 ATK, +10% Крит, атаки вешают Яд (1)" },
            { id: "w4", name: "Алебарда Стража", type: "weapon", rarity: "Редкое", tier: 1, cost: 18, atk: 2, def: 1, desc: "+2 ATK, +1 DEF" },
            { id: "w5", name: "Рунический Клинок", type: "weapon", rarity: "Редкое", tier: 1, cost: 20, atk: 2, en: 1, desc: "+2 ATK, +1 MAX EN" },
            // Эпические и Легендарные (Тир 2)
            { id: "w6", name: "Клинок Палача", type: "weapon", rarity: "Эпическое", tier: 2, cost: 26, atk: 3, bleed: 2, desc: "+3 ATK, атаки вешают Кровоток (2)" },
            { id: "w7", name: "Клык Ехидны", type: "weapon", rarity: "Эпическое", tier: 2, cost: 28, atk: 3, poison: 2, desc: "+3 ATK, атаки вешают Яд (2)" },
            { id: "w8", name: "Молот Титана", type: "weapon", rarity: "Эпическое", tier: 2, cost: 32, atk: 5, desc: "+5 ATK" },
            { id: "w9", name: "Глефа Вихря", type: "weapon", rarity: "Легендарное", tier: 2, cost: 38, atk: 4, def: 1, crit: 10, desc: "+4 ATK, +1 DEF, +10% Крит" },
            { id: "w10", name: "Жнец Душ", type: "weapon", rarity: "Легендарное", tier: 2, cost: 44, atk: 4, vamp: 3, en: 1, desc: "+4 ATK, +1 MAX EN, убийство лечит +3 HP" }
        ],
        armors: [
            // Тир 1
            { id: "a1", name: "Стёганый Дублет", type: "armor", rarity: "Обычное", tier: 1, cost: 10, def: 0, hp: 6, desc: "+6 MAX HP" },
            { id: "a2", name: "Кожаная Кираса", type: "armor", rarity: "Обычное", tier: 1, cost: 14, def: 1, hp: 4, desc: "+1 DEF, +4 MAX HP" },
            { id: "a3", name: "Шипованный Доспех", type: "armor", rarity: "Редкое", tier: 1, cost: 17, def: 1, spikes: 2, desc: "+1 DEF, Шипы (2)" },
            { id: "a4", name: "Мантия Аколита", type: "armor", rarity: "Редкое", tier: 1, cost: 19, def: 0, hp: 5, en: 1, startShield: 4, desc: "+5 MAX HP, +1 EN, +4 Щита на старте боя" },
            { id: "a5", name: "Панцирь Стража", type: "armor", rarity: "Редкое", tier: 1, cost: 22, def: 2, hp: 3, desc: "+2 DEF, +3 MAX HP" },
            // Тир 2
            { id: "a6", name: "Мифриловая Кольчуга", type: "armor", rarity: "Эпическое", tier: 2, cost: 27, def: 2, hp: 8, desc: "+2 DEF, +8 MAX HP" },
            { id: "a7", name: "Доспех Железной Девы", type: "armor", rarity: "Эпическое", tier: 2, cost: 30, def: 2, hp: 4, spikes: 4, desc: "+2 DEF, +4 MAX HP, Шипы (4)" },
            { id: "a8", name: "Роба Архимага", type: "armor", rarity: "Эпическое", tier: 2, cost: 34, def: 1, hp: 6, en: 2, startShield: 7, desc: "+1 DEF, +6 HP, +2 EN, +7 Щита на старте" },
            { id: "a9", name: "Башенный Оплот", type: "armor", rarity: "Легендарное", tier: 2, cost: 40, def: 3, hp: 6, desc: "+3 DEF, +6 MAX HP" },
            { id: "a10", name: "Латы Бессмертного", type: "armor", rarity: "Легендарное", tier: 2, cost: 46, def: 2, hp: 14, spikes: 3, desc: "+2 DEF, +14 MAX HP, Шипы (3)" }
        ],
        artifacts: [
            { id: "art1", name: "Кольцо Вампира", type: "artifact", rarity: "Редкое", cost: 22, desc: "Убийство любого врага лечит +2 HP." },
            { id: "art2", name: "Песочные Часы", type: "artifact", rarity: "Редкое", cost: 20, desc: "В 1-м раунде каждого боя даёт +2 Энергии." },
            { id: "art3", name: "Точильный Камень", type: "artifact", rarity: "Эпическое", cost: 28, desc: "Все ваши атаки игнорируют 1 DEF врагов." },
            { id: "art4", name: "Философский Камень", type: "artifact", rarity: "Редкое", cost: 24, desc: "После каждого боя даёт +3 Золота и +2 XP." },
            { id: "art5", name: "Амулет Ярости", type: "artifact", rarity: "Эпическое", cost: 26, desc: "Даёт +1 ATK и +8% к шансу Крита." },
            { id: "art6", name: "Корона Короля Склепа", type: "artifact", rarity: "Эпическое", cost: 30, desc: "На старте боя даёт +6 Щита и накладывает Яд (1) на врагов." },
            { id: "art7", name: "Сердце Агарика", type: "artifact", rarity: "Легендарное", cost: 36, desc: "В конце каждого раунда боя лечит вам +2 HP." },
            { id: "art8", name: "Ядро Вулкана", type: "artifact", rarity: "Легендарное", cost: 38, desc: "В конце каждого раунда бьёт всех врагов на 3 чистого урона." },
            { id: "art9", name: "Кровавый Кубок", type: "artifact", rarity: "Редкое", cost: 25, desc: "Даёт +6 MAX HP и лечит +2 HP после каждого боя." },
            { id: "art10", name: "Книга Теней", type: "artifact", rarity: "Редкое", cost: 21, desc: "Концентрация дополнительно даёт +4 Щита." },
            { id: "art11", name: "Клевер Удачи", type: "artifact", rarity: "Редкое", cost: 23, desc: "+12% к шансу Крита." },
            { id: "art12", name: "Магнит Душ", type: "artifact", rarity: "Эпическое", cost: 27, desc: "Даёт +25% больше Опыта (XP) за всех врагов." }
        ],
        potions: [
            { id: "pot1", name: "Зелье Исцеления", type: "potion", cost: 6, canUseOnMap: true, desc: "Лечит +12 HP и снимает Яд/Кровоток." },
            { id: "pot2", name: "Эликсир Энергии", type: "potion", cost: 7, canUseOnMap: false, desc: "Даёт +3 EN и сбрасывает перезарядки навыков." },
            { id: "pot3", name: "Взрывная Колба", type: "potion", cost: 8, canUseOnMap: false, desc: "Наносит 11 чистого урона всем врагам." },
            { id: "pot4", name: "Каменный Отвар", type: "potion", cost: 6, canUseOnMap: false, desc: "Даёт +10 Щита в бою." },
            { id: "pot5", name: "Ядовитый Флакон", type: "potion", cost: 8, canUseOnMap: false, desc: "Накладывает Яд (4) и Кровоток (2) на всех врагов." },
            { id: "pot6", name: "Кровь Дракона", type: "potion", cost: 9, canUseOnMap: true, desc: "Лечит +8 HP и даёт +4 ATK на следующий удар." }
        ]
    },

    events: [
        {
            id: "altar", title: "Кровавый Алтарь",
            desc: "Древний каменный идол требует жертву в обмен на могущество.",
            options: [
                { id: "altar_hp", text: "Отдать 6 HP -> Получить +1 ATK до конца забега" },
                { id: "altar_gold", text: "Пожертвовать 12 Золота -> Получить случайный Артефакт" },
                { id: "leave", text: "Уйти" }
            ]
        },
        {
            id: "spring", title: "Источник Жизни",
            desc: "Вы находите чистый подземный родник со светящейся водой.",
            options: [
                { id: "spring_heal", text: "Испить до дна -> Полностью восстановить HP" },
                { id: "spring_max", text: "Закалить тело -> +5 MAX HP и +5 HP" }
            ]
        },
        {
            id: "smith", title: "Забытый Кузнец",
            desc: "Старый мастер у наковальни готов бесплатно помочь страннику.",
            options: [
                { id: "smith_atk", text: "Заточить оружие -> +1 к заточке оружия навсегда" },
                { id: "smith_def", text: "Укрепить броню -> +1 к укреплению брони навсегда" },
                { id: "smith_xp", text: "Потренироваться с ним -> +10 XP" }
            ]
        },
        {
            id: "stash", title: "Тайник Контрабандистов",
            desc: "За шатким камнем в стене спрятан старый ящик с припасами.",
            options: [
                { id: "stash_take", text: "Забрать припасы -> +10 Золота, Зелье и +5 HP" }
            ]
        },
        {
            id: "mimic_chest", title: "Золотой Сундук",
            desc: "Посреди пустого зала стоит подозрительно роскошный сундук.",
            options: [
                { id: "chest_open", text: "Открыть (50% Сокровище и Артефакт / 50% Бой с Мимиком!)" },
                { id: "leave", text: "Обойти стороной" }
            ]
        },
        {
            id: "library", title: "Библиотека Древних",
            desc: "Стеллажи с уцелевшими боевыми манускриптами.",
            options: [
                { id: "lib_xp", text: "Изучать свитки -> +12 XP" },
                { id: "lib_perk", text: "Кровавый ритуал знаний (-6 HP) -> Случайный Перк" }
            ]
        },
        {
            id: "gambler", title: "Азартный Бес",
            desc: "Мелкий демон предлагает сыграть в кости на 8 Золота.",
            options: [
                { id: "gamble_play", text: "Поставить 8G (50% выиграть 20G и Зелье)" },
                { id: "gamble_rob", text: "Ограбить беса (-4 HP от укуса, забрать +9G)" },
                { id: "leave", text: "Отказаться" }
            ]
        },
        {
            id: "alchemist_lab", title: "Брошенная Лаборатория",
            desc: "На столе булькают колбы с разноцветными реагентами.",
            options: [
                { id: "lab_potions", text: "Собрать зелья -> +1 Слот пояса и 2 случайных Зелья" },
                { id: "lab_mutagen", text: "Выпить мутаген -> +7 MAX HP, но -3 текущих HP" }
            ]
        },
        {
            id: "soul_trader", title: "Торговец Душами",
            desc: "Фигура в пустом капюшоне скупает жизненную силу.",
            options: [
                { id: "soul_sell_hp", text: "Отдать -5 MAX HP -> Получить +18 Золота и случайный Артефакт" },
                { id: "soul_buy_souls", text: "Отдать 12 Золота -> Получить +10 Очков Душ в мета-профиль" },
                { id: "leave", text: "Уйти" }
            ]
        },
        {
            id: "arena", title: "Врата Испытаний",
            desc: "Древняя арена обещает славу тем, кто выстоит против чемпиона.",
            options: [
                { id: "arena_fight", text: "Выйти на бой с Элитой (Бонус +10G сверху)" },
                { id: "leave", text: "Пройти мимо" }
            ]
        }
    ],

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
    },
};