/**
 * scripts/simulate-balance.js
 * Автономный безголовый симулятор баланса предметов и перков в Node.js (no-npm).
 * 
 * Модель оценки:
 * - Единый стандартизированный полигон: полный срез этажа (обычный пак -> усиленный пак -> элита -> босс)
 *   с честным переносом здоровья, ресурсов и пост-боевых триггеров.
 * - Метрика эффективности: суммарный нанесённый урон врагам за срез (Total Damage Dealt),
 *   прогресс зачистки комнат (Rooms Cleared) и отдача на способность (Damage/Defense Per Cast).
 * - Группировка по факторам под контролем игрока: стили атак и ротации (Fast Spam, Execute, Pierce, Whirlwind, Tank, Smart).
 * 
 * Использование:
 *   node scripts/simulate-balance.js                  # Быстрый прогон всех 104 сущностей по всем 4 этажам
 *   node scripts/simulate-balance.js --full           # Глубокий аудит с увеличенной выборкой
 *   node scripts/simulate-balance.js --colorize       # Мгновенное обновление цветов в docs/items-and-perks-balance.md
 *   node scripts/simulate-balance.js --id p35         # Анализ конкретного перка / предмета
 *   node scripts/simulate-balance.js --category perks # Анализ только категории (perks/weapons/armors/artifacts/potions)
 *   node scripts/simulate-balance.js --class assassin # Анализ только по одному классу
 *   node scripts/simulate-balance.js --floor 2        # Анализ только одного стартового этажа (1..4)
 *   node scripts/simulate-balance.js --no-report      # Без записи в docs/balance-report.md
 */

// 1. Полифилы браузерного окружения
global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, val) { this._data[key] = String(val); },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = {}; },
};
global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
};
global.setTimeout = (fn) => {
    if (typeof fn === "function") fn();
    return 0;
};
global.clearTimeout = () => {};

// 2. Импорт систем игры
const { Game } = await import("../src/engine/game.js");
const BattleSystem = await import("../src/engine/systems/battle.js");
const { DATA_PERKS, DATA_ITEMS } = await import("../src/data/items.js");
const fs = await import("fs");
const path = await import("path");

// 2.1 Детерминированный генератор псевдослучайных чисел (Mulberry32)
function createMulberry32(seed) {
    let s = seed >>> 0;
    return function() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const origMathRandom = Math.random;
function setSeed(s) { Math.random = createMulberry32(s); }
function restoreRandom() { Math.random = origMathRandom; }

function getRoomSeed(styleId, classId, runIndex, stepIndex) {
    let hash = 1779033703 ^ (runIndex * 31 + stepIndex);
    const str = `${styleId}_${classId}_step${stepIndex}`;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
        hash = (hash << 13) | (hash >>> 19);
    }
    return hash >>> 0;
}

// 3. Разбор аргументов CLI
const args = process.argv.slice(2);
const isFullRun = args.includes("--full");
const isColorizeOnly = args.includes("--colorize") || args.includes("--colorize-only");
const targetIdArg = getArgValue(args, "--id");
const targetCatArg = getArgValue(args, "--category");
const targetClassArg = getArgValue(args, "--class");
const targetFloorArg = parseInt(getArgValue(args, "--floor"), 10);
const customRunsArg = parseInt(getArgValue(args, "--runs"), 10);
const skipReport = args.includes("--no-report");

const RUNS_PER_PLAYSTYLE = Number.isFinite(customRunsArg)
    ? customRunsArg
    : (isFullRun ? 20 : 8);

function getArgValue(argList, flag) {
    const idx = argList.indexOf(flag);
    return idx !== -1 && argList[idx + 1] ? argList[idx + 1] : null;
}

// 4. Длинная лестница боёв с плавным нарастанием силы врагов (Progression Gauntlet)
const GAUNTLET_STEPS = [
    // Этаж 0: Заброшенные Катакомбы (5 боёв: 3 normal + 1 elite + 1 boss)
    { name: "Склеп: Разминка", floor: 0, room: 2, mode: "normal" },
    { name: "Склеп: Основной зал", floor: 0, room: 2, mode: "normal" },
    { name: "Склеп: Усиленный пак", floor: 0, room: 4, mode: "normal" },
    { name: "Склеп: Элита", floor: 0, room: 7, mode: "elite" },
    { name: "Склеп: Босс Король Ворт", floor: 0, room: 9, mode: "boss" },

    // Этаж 1: Грибные Пещеры и Топи (7 боёв: 4 normal + 2 elite + 1 boss)
    { name: "Топи: Дозор болот", floor: 1, room: 2, mode: "normal" },
    { name: "Топи: Споровый пак", floor: 1, room: 4, mode: "normal" },
    { name: "Топи: Элита 1", floor: 1, room: 6, mode: "elite" },
    { name: "Топи: Глубокая трясина", floor: 1, room: 8, mode: "normal" },
    { name: "Топи: Засада чудовищ", floor: 1, room: 10, mode: "normal" },
    { name: "Топи: Элита 2", floor: 1, room: 11, mode: "elite" },
    { name: "Топи: Босс Агарик", floor: 1, room: 12, mode: "boss" },

    // Этаж 2: Кузня Железного Культа (8 боёв: 5 normal + 2 elite + 1 boss)
    { name: "Кузня: Патруль автоматонов", floor: 2, room: 2, mode: "normal" },
    { name: "Кузня: Шлаковый забой", floor: 2, room: 4, mode: "normal" },
    { name: "Кузня: Литейный зал", floor: 2, room: 6, mode: "normal" },
    { name: "Кузня: Элита 1", floor: 2, room: 7, mode: "elite" },
    { name: "Кузня: Огненный цех", floor: 2, room: 9, mode: "normal" },
    { name: "Кузня: Горнило культа", floor: 2, room: 11, mode: "normal" },
    { name: "Кузня: Элита 2", floor: 2, room: 12, mode: "elite" },
    { name: "Кузня: Босс Вулкан", floor: 2, room: 14, mode: "boss" },

    // Этаж 3: Цитадель Пустоты (9 боёв: 6 normal + 2 elite + 1 boss)
    { name: "Цитадель: Внешний рубеж", floor: 3, room: 2, mode: "normal" },
    { name: "Цитадель: Тени бездны", floor: 3, room: 4, mode: "normal" },
    { name: "Цитадель: Астральный дозор", floor: 3, room: 6, mode: "normal" },
    { name: "Цитадель: Элита 1", floor: 3, room: 8, mode: "elite" },
    { name: "Цитадель: Зал ритуалов", floor: 3, room: 10, mode: "normal" },
    { name: "Цитадель: Пустотный караул", floor: 3, room: 12, mode: "normal" },
    { name: "Цитадель: Сердце башни", floor: 3, room: 13, mode: "normal" },
    { name: "Цитадель: Элита 2", floor: 3, room: 14, mode: "elite" },
    { name: "Цитадель: Финальный Босс Малкор", floor: 3, room: 16, mode: "boss" },

    // Пост-гейм (Endless Abyss)
    { name: "Бездна: Волна 1", floor: 3, room: 18, mode: "normal", abyssTier: 1 },
    { name: "Бездна: Волна 2 (Элита)", floor: 3, room: 20, mode: "elite", abyssTier: 1 },
    { name: "Бездна: Волна 3 (Архи-Босс)", floor: 3, room: 22, mode: "boss", abyssTier: 1 },
    { name: "Бездна: Волна 4", floor: 3, room: 24, mode: "normal", abyssTier: 1 },
    { name: "Бездна: Волна 5", floor: 3, room: 26, mode: "normal", abyssTier: 2 },
    { name: "Бездна: Волна 6 (Элита)", floor: 3, room: 28, mode: "elite", abyssTier: 2 },
    { name: "Бездна: Волна 7 (Архи-Босс)", floor: 3, room: 30, mode: "boss", abyssTier: 2 },
    { name: "Бездна: Волна 8", floor: 3, room: 32, mode: "normal", abyssTier: 2 },
    { name: "Бездна: Волна 9", floor: 3, room: 34, mode: "normal", abyssTier: 3 },
    { name: "Бездна: Волна 10 (Элита)", floor: 3, room: 36, mode: "elite", abyssTier: 3 },
    { name: "Бездна: Волна 11 (Архи-Босс)", floor: 3, room: 38, mode: "boss", abyssTier: 3 },
    { name: "Бездна: Волна 12", floor: 3, room: 40, mode: "normal", abyssTier: 3 },
    { name: "Бездна: Волна 13", floor: 3, room: 42, mode: "normal", abyssTier: 4 },
    { name: "Бездна: Волна 14 (Элита)", floor: 3, room: 44, mode: "elite", abyssTier: 4 },
    { name: "Бездна: Волна 15 (Архи-Босс)", floor: 3, room: 46, mode: "boss", abyssTier: 4 },
];

const FLOOR_PROFILES = [
    {
        id: "f1",
        floorNum: 1,
        floor: 0,
        label: "Э1",
        name: "Этаж 1 (Склеп — голый старт)",
        startStepIndex: 0,
        bonusHp: 0,
        bonusAtk: 0,
        bonusDef: 0,
        bonusEn: 0,
        startLevel: 1,
    },
    {
        id: "f2",
        floorNum: 2,
        floor: 1,
        label: "Э2",
        name: "Этаж 2 (Топи — статовый затар)",
        startStepIndex: 5,
        bonusHp: 50,
        bonusAtk: 9,
        bonusDef: 3,
        bonusEn: 2,
        startLevel: 3,
    },
    {
        id: "f3",
        floorNum: 3,
        floor: 2,
        label: "Э3",
        name: "Этаж 3 (Кузня — статовый затар)",
        startStepIndex: 12,
        bonusHp: 128,
        bonusAtk: 21,
        bonusDef: 5,
        bonusEn: 3,
        startLevel: 5,
    },
    {
        id: "f4",
        floorNum: 4,
        floor: 3,
        label: "Э4",
        name: "Этаж 4 (Цитадель — статовый затар)",
        startStepIndex: 20,
        bonusHp: 265,
        bonusAtk: 35,
        bonusDef: 8,
        bonusEn: 4,
        startLevel: 7,
    },
];

const ACTIVE_FLOOR_PROFILES = FLOOR_PROFILES.filter(
    fp => !Number.isFinite(targetFloorArg) || fp.floorNum === targetFloorArg
);

const CLASSES = ["wanderer", "assassin", "crusader"].filter(c => !targetClassArg || targetClassArg === c);
const ALL_SKILLS = ["fast", "heavy", "pierce", "whirlwind", "defend", "concentrate"];

// Стили игры и профили атак (под контролем игрока)
const PLAYSTYLES = [
    { id: "smart", name: "Адаптивный (Smart)", desc: "Оптимальная адаптивная ротация" },
    { id: "fast_spam", name: "Fast Spam", desc: "Спам быстрых ударов (он-хиты, криты, яд)" },
    { id: "execute_focus", name: "Execution Focus", desc: "Приоритет добивания Казнью и экстра-ходов" },
    { id: "pierce_focus", name: "Pierce Focus", desc: "Приоритет Пробития против брони и щитов" },
    { id: "whirlwind_focus", name: "Whirlwind Focus", desc: "Приоритет АОЕ-зачистки Вихрем" },
    { id: "tank_focus", name: "Turtle / Tank", desc: "Поддержание Защиты и Концентрации, игра из-под блока" },
];

// 5. Логика ИИ выбора действий
function hasIncomingHeavyAttack(game) {
    return game.enemies.some(e => {
        if (e.currentHp <= 0) return false;
        const patList = e.pattern || [];
        const nextPat = patList[(e.patternIndex || 0) % patList.length];
        if (!nextPat) return false;
        return nextPat.type === "charge" || (nextPat.val && nextPat.val >= 7);
    });
}

function selectTarget(game) {
    const alive = game.enemies
        .map((e, idx) => ({ e, idx }))
        .filter(item => item.e.currentHp > 0);
    if (alive.length === 0) return 0;

    const p = game.player;
    let atkVal = p.getTotalAtk();
    if (p.hasArtifact("art18")) atkVal += 3;
    if (game.battleTurn === 1 && p.perks.includes("p13")) atkVal += 5;
    if (game.battleTurn === 1 && p.hasArtifact("art22")) atkVal += 4;
    // Добивание Казнью ради экстра-хода
    const killable = alive.find(item => {
        const eliteBonus = (p.perks.includes("p25") && (item.e.isElite || item.e.isBoss)) ? 3 : 0;
        const p15Bonus = (p.perks.includes("p15") && (item.e.shield > 0 || item.e.def >= 2)) ? 8 : 0;
        const art26Bonus = p.hasArtifact("art26") ? 10 : 0;
        const art34Bonus = (p.hasArtifact("art34") && item.e.poison > 0 && item.e.bleed > 0) ? 4 : 0;
        const execDmg = Math.round(2 + (atkVal + eliteBonus) * 0.5) + (p.perks.includes("p1") ? 4 : 0) + p15Bonus + art26Bonus + art34Bonus;
        return item.e.currentHp <= execDmg;
    });
    if (killable && p.cooldowns.heavy === 0 && BattleSystem.canAffordEn(game, 1)) {
        return killable.idx;
    }

    // Цель с замахом
    const charging = alive.find(item => {
        const patList = item.e.pattern || [];
        const nextPat = patList[(item.e.patternIndex || 0) % patList.length];
        return nextPat && (nextPat.type === "charge" || (nextPat.val && nextPat.val >= 7));
    });
    if (charging) return charging.idx;

    // Цель с минимальным HP
    alive.sort((a, b) => a.e.currentHp - b.e.currentHp);
    return alive[0].idx;
}

function tryUsePotions(game) {
    const p = game.player;
    if (!p.inventory.potions || p.inventory.potions.length === 0) return;
    const maxHp = p.getTotalMaxHp();
    const aliveEnemies = game.enemies.filter(e => e.currentHp > 0);
    if (aliveEnemies.length === 0) return;
    const totalAliveHp = aliveEnemies.reduce((s, e) => s + e.currentHp, 0);
    const incomingDmg = getIncomingDamage(game);
    const seriousFight = aliveEnemies.length >= 2
        || aliveEnemies.some(e => e.isElite || e.isBoss)
        || totalAliveHp >= 14 + (game.floor || 0) * 8
        || p.hp <= maxHp * 0.65
        || incomingDmg >= p.hp * 0.35;

    for (let i = p.inventory.potions.length - 1; i >= 0; i--) {
        const pot = p.inventory.potions[i];
        if (!pot) continue;
        const potKey = pot.baseId || pot.id;

        if (["pot1", "pot8"].includes(potKey)) {
            if (p.hp <= maxHp * 0.45 || p.poison >= 3 || p.bleed >= 3) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (potKey === "pot6") {
            if (p.hp <= maxHp * 0.55 || (p.battleAtk === 0 && (aliveEnemies.some(e => e.isElite || e.isBoss) || seriousFight) && p.hp <= maxHp - 4)) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (potKey === "pot4") {
            if (incomingDmg > p.shield && (incomingDmg >= 6 || p.hp <= maxHp * 0.60 || incomingDmg >= p.hp + p.shield)) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (potKey === "pot7") {
            const shouldStartBuff = p.battleSpikes === 0 && (aliveEnemies.length >= 2 || aliveEnemies.some(e => e.currentHp >= 14));
            if (shouldStartBuff || (incomingDmg > p.shield && p.hp <= maxHp * 0.55)) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (["pot3", "pot5"].includes(potKey)) {
            if (seriousFight) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (potKey === "pot9") {
            const worthAcid = aliveEnemies.some(e => e.shield >= 3 || e.def >= 2 || (e.currentHp >= 10 && (e.shield > 0 || e.def > 0)))
                || aliveEnemies.filter(e => e.shield > 0 || e.def > 0).length >= 2;
            if (worthAcid || seriousFight) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (potKey === "pot2") {
            if (totalAliveHp >= 10 && (p.en <= 1 || (p.cooldowns.heavy > 0 && p.cooldowns.pierce > 0 && p.en <= 2) || (incomingDmg > p.shield && p.hp <= maxHp * 0.55))) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (potKey === "pot10") {
            if (!p.forceCritNext && !(p.critBonusNext > 0) && seriousFight && aliveEnemies.some(e => e.currentHp >= 9)) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
    }
}

function getIncomingDamage(game) {
    const p = game.player;
    const totalDef = p.getTotalDef();
    const flatReduce = (p.hasArtifact("art18") ? 1 : 0)
        + (p.hasArtifact("art24") && p.hp <= p.getTotalMaxHp() / 2 ? 1 : 0);
    let total = 0;
    for (const e of game.enemies) {
        if (e.currentHp <= 0) continue;
        const patList = e.pattern || [];
        const nextPat = patList[(e.patternIndex || 0) % patList.length];
        if (!nextPat || !nextPat.val || nextPat.val <= 0) continue;
        total += Math.max(1, nextPat.val - totalDef - flatReduce);
    }
    return total;
}

function chooseAction(game, playstyleId) {
    const p = game.player;
    const target = game.enemies[game.selectedTargetIndex];
    const aliveCount = game.enemies.filter(e => e.currentHp > 0).length;

    let atkVal = p.getTotalAtk();
    if (p.hasArtifact("art18")) atkVal += 3;
    if (game.battleTurn === 1 && p.perks.includes("p13")) atkVal += 5;
    if (game.battleTurn === 1 && p.hasArtifact("art22")) atkVal += 4;
    if (target && p.perks.includes("p25") && (target.isElite || target.isBoss)) atkVal += 3;
    const p15Bonus = (target && p.perks.includes("p15") && (target.shield > 0 || target.def >= 2)) ? 8 : 0;
    const art26Bonus = p.hasArtifact("art26") ? 10 : 0;
    const art34Bonus = (target && p.hasArtifact("art34") && target.poison > 0 && target.bleed > 0) ? 4 : 0;
    const execDmg = Math.round(2 + atkVal * 0.5) + (p.perks.includes("p1") ? 4 : 0) + p15Bonus + art26Bonus + art34Bonus;

    const twoEnCost = p.perks.includes("p24") ? 1 : 2;
    const canDef = BattleSystem.canUseSkill(game, "defend", 0);
    const canExec = target && BattleSystem.canUseSkill(game, "heavy", 1);
    const canPrc = target && BattleSystem.canUseSkill(game, "pierce", twoEnCost);
    const canWhirl = aliveCount >= 1 && BattleSystem.canUseSkill(game, "whirlwind", twoEnCost);
    const canConc = BattleSystem.canUseSkill(game, "concentrate", 0);
    const heavyThreat = hasIncomingHeavyAttack(game);
    const maxHp = p.getTotalMaxHp();
    const lowHpThreshold = Math.max(8, Math.floor(maxHp * 0.34));
    const safeConcHp = Math.max(10, Math.floor(maxHp * 0.25));

    if ((p.forceCritNext || (p.critBonusNext || 0) > 0 || p.concentrateBonus >= 4) && target) {
        if (aliveCount >= 2 && canWhirl && playstyleId === "whirlwind_focus") return "whirlwind";
        if (canPrc && (playstyleId === "pierce_focus" || playstyleId === "smart")) return "pierce";
        return "fast";
    }

    if (playstyleId === "fast_spam") {
        if (p.hp <= lowHpThreshold && heavyThreat && canDef) return "defend";
        return "fast";
    }

    if (playstyleId === "execute_focus") {
        if (canExec && (target.currentHp <= execDmg || target.def >= 2 || target.shield > 0 || p.perks.includes("p1") || p.hasArtifact("art26"))) return "heavy";
        if (p.en < 1 && canConc) return "concentrate";
        return "fast";
    }

    if (playstyleId === "pierce_focus") {
        if (canPrc && (target.shield > 0 || target.def >= 1 || p.en >= twoEnCost)) return "pierce";
        if (p.en < twoEnCost && canConc && p.hp > safeConcHp) return "concentrate";
        return "fast";
    }

    if (playstyleId === "whirlwind_focus") {
        if (canWhirl) return "whirlwind";
        if (p.en < twoEnCost && canConc && aliveCount >= 2) return "concentrate";
        return "fast";
    }

    if (playstyleId === "tank_focus") {
        if (canDef) return "defend";
        if (canConc && p.hp < maxHp * 0.8) return "concentrate";
        if (target && target.currentHp <= execDmg && canExec) return "heavy";
        if (aliveCount >= 2 && canWhirl) return "whirlwind";
        return "fast";
    }

    // Default: Smart (Адаптивный)
    if ((heavyThreat || p.hp <= lowHpThreshold) && canDef) return "defend";
    if (target && target.currentHp <= execDmg && canExec) return "heavy";
    if (aliveCount >= 2 && canWhirl) return "whirlwind";
    if (target && (target.shield >= 4 || target.def >= 2) && canPrc) return "pierce";
    if (p.en <= 1 && canConc) return "concentrate";
    if (canPrc && target && target.currentHp > 10) return "pierce";
    if (canExec && target && (target.shield > 0 || target.def >= 2)) return "heavy";
    return "fast";
}

// 6. Выполнение полного среза этажа (Run Slice)
function createMetricsContainer() {
    const metrics = {
        totalDamageDealt: 0,
        roomsCleared: 0,
        turnsSurvived: 0,
        skillCasts: {},
        skillDamage: {},
        skillDefense: {},
    };
    for (const sk of ALL_SKILLS) {
        metrics.skillCasts[sk] = 0;
        metrics.skillDamage[sk] = 0;
        metrics.skillDefense[sk] = 0;
    }
    return metrics;
}

function simulateFloorRun(classId, itemDef, playstyleId, runIndex, metrics, floorProfile = FLOOR_PROFILES[0]) {
    const game = new Game();
    game.init();
    game.startRun(classId);

    if (floorProfile) {
        const p = game.player;
        p.baseMaxHp += floorProfile.bonusHp || 0;
        p.baseAtk += floorProfile.bonusAtk || 0;
        p.baseDef += floorProfile.bonusDef || 0;
        p.baseMaxEn += floorProfile.bonusEn || 0;
        p.level = floorProfile.startLevel || 1;
        p._simBaseForgeLvl = floorProfile.floor || 0;
        p.hp = p.getTotalMaxHp();
        p.en = p.getTotalMaxEn();
    }

    if (itemDef) {
        const p = game.player;
        if (itemDef.type === "perk") {
            p.addPerk(itemDef.id, floorProfile.floor || 0);
        } else if (itemDef.type === "artifact") {
            p.addArtifact(itemDef);
        } else if (itemDef.type === "weapon") {
            p.equipWeapon(itemDef);
        } else if (itemDef.type === "armor") {
            p.equipArmor(itemDef);
        } else if (itemDef.type === "potion") {
            p.potionSlots += 1;
            p.inventory.potions.push({ ...itemDef });
        }
    }

    let runDamage = 0;
    let roomsCleared = 0;
    let roomsSinceCampfire = 0;
    let totalTurns = 0;

    const startStep = floorProfile ? floorProfile.startStepIndex : 0;
    for (let sIdx = startStep; sIdx < GAUNTLET_STEPS.length; sIdx++) {
        const step = GAUNTLET_STEPS[sIdx];
        if (game.player.hp <= 0) break;

        game.floor = step.floor;
        game.room = step.room;
        const currentHp = game.player.hp;
        setSeed(getRoomSeed(playstyleId, classId, runIndex, sIdx));
        BattleSystem.setupBattle(game, step.mode);
        if (step.abyssTier) {
            const abyssHpScale = Math.pow(1.4, step.abyssTier);
            const abyssAtkBonus = step.abyssTier * 3;
            for (const en of game.enemies) {
                en.hp = Math.round(en.hp * abyssHpScale);
                en.currentHp = en.hp;
                en.atkBonus = (en.atkBonus || 0) + abyssAtkBonus;
            }
        }
        game.player.hp = Math.min(game.player.getTotalMaxHp(), currentHp);

        // Боевой цикл комнаты
        while (game.state === "BATTLE" && !game.battleFinished && game.player.hp > 0 && game.battleTurn <= 35) {
            // Фиксируем состояние ДО применения зелий и ударов, чтобы весь урон и хил зелий шел в копилку игрока
            const preH = game.enemies.reduce((s, e) => s + Math.max(0, e.currentHp), 0);
            const preS = game.enemies.reduce((s, e) => s + (e.shield || 0), 0);
            const preHp = game.player.hp;
            const preSh = game.player.shield;

            tryUsePotions(game);

            // Если зелье (например, Взрывная Колба) завершило бой или добило всех
            if (game.battleFinished || game.player.hp <= 0) {
                const postH = game.enemies.reduce((s, e) => s + Math.max(0, e.currentHp), 0);
                const postS = game.enemies.reduce((s, e) => s + (e.shield || 0), 0);
                const dealtDmg = Math.max(0, (preH - postH) + (preS - postS));
                runDamage += dealtDmg;
                totalTurns++;
                break;
            }

            game.selectedTargetIndex = selectTarget(game);
            BattleSystem.ensureValidTarget(game);

            const action = chooseAction(game, playstyleId);

            BattleSystem.playerAction(game, action);

            const postH = game.enemies.reduce((s, e) => s + Math.max(0, e.currentHp), 0);
            const postS = game.enemies.reduce((s, e) => s + (e.shield || 0), 0);
            const postHp = game.player.hp;
            const postSh = game.player.shield;

            const dealtDmg = Math.max(0, (preH - postH) + (preS - postS));
            const gainedDef = Math.max(0, postHp - preHp) + Math.max(0, postSh - preSh);

            runDamage += dealtDmg;
            totalTurns++;

            if (metrics && metrics.skillCasts[action] !== undefined) {
                metrics.skillCasts[action]++;
                metrics.skillDamage[action] += dealtDmg;
                metrics.skillDefense[action] += gainedDef;
            }
        }

        const roomWon = game.battleFinished && game.enemies.every(e => e.currentHp <= 0);
        if (roomWon) {
            roomsCleared++;
            roomsSinceCampfire++;
            roomsSinceCampfire = processIntermission(game, step, roomsSinceCampfire);
        } else {
            break;
        }
    }

    if (metrics) {
        metrics.totalDamageDealt += runDamage;
        metrics.roomsCleared += roomsCleared;
        metrics.turnsSurvived += totalTurns;
    }

    return { runDamage, roomsCleared, totalTurns };
}

function processIntermission(game, step, roomsSinceCampfire) {
    const p = game.player;
    if (p.hp <= 0) return roomsSinceCampfire;

    // 1. Сброс временных боевых статусов между комнатами
    p.poison = 0;
    p.bleed = 0;
    p.shield = 0;
    p.tempSpikes = 0;
    p.battleSpikes = 0;
    p.battleAtk = 0;
    p.battleBannerAtk = 0;
    p.damageReductionPct = 0;
    p.steelScaleUsed = false;
    p.forceCritNext = false;
    p.critBonusNext = 0;
    p.concentrateBonus = 0;
    p.en = Math.min(p.getTotalMaxEn(), p.en + 1);
    if (p.cooldowns) {
        for (const k in p.cooldowns) {
            p.cooldowns[k] = 0;
        }
    }

    // 2. Базовая передышка между комнатами (имитация коридорного отдыха: 20% Max HP, мин. 5 HP)
    p.heal(Math.max(5, Math.ceil(p.getTotalMaxHp() * 0.20)));

    // 3. Прокачка уровней от накопленного XP (Level Up)
    while (p.xp >= p.getRequiredXp()) {
        const req = p.getRequiredXp();
        p.xp -= req;
        p.level++;
        p.baseMaxHp += 3;
        p.heal(6);
    }

    // 4. Привал / Костер (каждые 3 комнаты или после босса)
    let nextCampfireCounter = roomsSinceCampfire;
    const isCampfire = step.mode === "boss" || roomsSinceCampfire >= 3;
    if (isCampfire) {
        const healPct = p.perks.includes("p28") ? 0.70 : 0.45;
        if (p.perks.includes("p28")) {
            p.gold += 8;
        }
        p.heal(Math.ceil(p.getTotalMaxHp() * healPct));
        p.en = p.getTotalMaxEn();
        nextCampfireCounter = 0;
    }

    // Имитация покупки зелья лечения/аптечки при ранении
    if (p.hp < p.getTotalMaxHp() * 0.55 && p.gold >= 6 && (p._lastHealRoom !== step.room)) {
        p._lastHealRoom = step.room;
        p.gold -= 6;
        p.heal(8);
    }

    // 5. Детерминированный псевдо-магазин (конвертация набранного золота в боевые параметры)
    const baseForgeLvl = p._simBaseForgeLvl || 0;
    while (true) {
        const upgradeStep = (p._simUpgradesDone || 0) % 2;
        const nextCost = upgradeStep === 0
            ? 14 + (p.weaponUpgradeLvl + baseForgeLvl) * 10
            : 14 + (p.armorUpgradeLvl + baseForgeLvl) * 10;
        if (p.gold < nextCost) break;

        p.gold -= nextCost;
        p._simUpgradesDone = (p._simUpgradesDone || 0) + 1;

        if (upgradeStep === 0) {
            p.weaponUpgradeLvl += 1;
        } else {
            p.armorUpgradeLvl += 1;
            p.heal(3);
        }
    }

    return nextCampfireCounter;
}

// 7. Расчёт базовых линий (по всем активным этажам)
function runFloorSample(itemDef, floorProfile, metricsA, metricsB = null) {
    let totalAllDamage = 0;
    let totalAllRooms = 0;
    let totalAllTurns = 0;
    let totalAllRuns = 0;
    const byPlaystyle = {};

    for (const style of PLAYSTYLES) {
        let styleDamage = 0;
        let styleRooms = 0;
        let styleRuns = 0;

        for (const cls of CLASSES) {
            for (let i = 0; i < RUNS_PER_PLAYSTYLE; i++) {
                const res = simulateFloorRun(cls, itemDef, style.id, i, metricsA, floorProfile);
                styleDamage += res.runDamage;
                styleRooms += res.roomsCleared;
                totalAllTurns += res.totalTurns;
                styleRuns++;

                if (metricsB) {
                    metricsB.totalDamageDealt += res.runDamage;
                    metricsB.roomsCleared += res.roomsCleared;
                    metricsB.turnsSurvived += res.totalTurns;
                }
            }
        }

        byPlaystyle[style.id] = {
            avgDamage: Math.round((styleDamage / styleRuns) * 10) / 10,
            avgRooms: Math.round((styleRooms / styleRuns) * 10) / 10,
        };

        totalAllDamage += styleDamage;
        totalAllRooms += styleRooms;
        totalAllRuns += styleRuns;
    }

    return {
        avgDamage: Math.round((totalAllDamage / totalAllRuns) * 10) / 10,
        avgRooms: Math.round((totalAllRooms / totalAllRuns) * 10) / 10,
        avgTurns: Math.round((totalAllTurns / totalAllRuns) * 10) / 10,
        byPlaystyle,
    };
}

function calcSkillMetrics(metricsObj) {
    const skillDpc = {};
    const skillEdpc = {};
    for (const sk of ALL_SKILLS) {
        skillDpc[sk] = metricsObj.skillCasts[sk] > 0
            ? Math.round((metricsObj.skillDamage[sk] / metricsObj.skillCasts[sk]) * 10) / 10
            : 0;
        skillEdpc[sk] = metricsObj.skillCasts[sk] > 0
            ? Math.round((metricsObj.skillDefense[sk] / metricsObj.skillCasts[sk]) * 10) / 10
            : 0;
    }
    return { skillDpc, skillEdpc };
}

function calculateFloorBaselines(activeFloors = ACTIVE_FLOOR_PROFILES) {
    console.log("⏳ Расчёт базовых линий прогрессии по этажам (без тестируемых предметов)...");
    const byFloor = {};
    const aggMetrics = createMetricsContainer();

    let sumRooms = 0;
    let sumDamage = 0;
    let sumTurns = 0;

    for (const fp of activeFloors) {
        const floorMetrics = createMetricsContainer();
        const sample = runFloorSample(null, fp, floorMetrics);

        for (const sk of ALL_SKILLS) {
            aggMetrics.skillCasts[sk] += floorMetrics.skillCasts[sk];
            aggMetrics.skillDamage[sk] += floorMetrics.skillDamage[sk];
            aggMetrics.skillDefense[sk] += floorMetrics.skillDefense[sk];
        }

        const { skillDpc, skillEdpc } = calcSkillMetrics(floorMetrics);
        byFloor[fp.id] = {
            profile: fp,
            ...sample,
            skillDpc,
            skillEdpc,
        };

        sumRooms += sample.avgRooms;
        sumDamage += sample.avgDamage;
        sumTurns += sample.avgTurns;

        const statsTag = `+${fp.bonusHp} HP, +${fp.bonusAtk} ATK, +${fp.bonusDef} DEF, +${fp.bonusEn} EN, Lvl ${fp.startLevel}`;
        console.log(`   [${fp.label} | ${statsTag}] Комнаты: ${sample.avgRooms}/${GAUNTLET_STEPS.length - fp.startStepIndex}.0, Урон: ${sample.avgDamage}, Ходы: ${sample.avgTurns}, DPC Fast: ${skillDpc.fast}`);
    }

    const { skillDpc, skillEdpc } = calcSkillMetrics(aggMetrics);
    const count = activeFloors.length || 1;
    return {
        avgRooms: Math.round((sumRooms / count) * 10) / 10,
        avgDamage: Math.round((sumDamage / count) * 10) / 10,
        avgTurns: Math.round((sumTurns / count) * 10) / 10,
        byFloor,
        skillDpc,
        skillEdpc,
    };
}

// 8. Оценка предмета по всем активным этажам
function evaluateFloorItem(itemDef, baselines, activeFloors = ACTIVE_FLOOR_PROFILES) {
    const aggMetrics = createMetricsContainer();
    const cost = itemDef.cost || null;
    const byFloor = {};

    const styleMultSum = {};
    const styleDeltaDmgSum = {};
    const styleDeltaRmsSum = {};
    const styleAvgDmgSum = {};
    for (const style of PLAYSTYLES) {
        styleMultSum[style.id] = 0;
        styleDeltaDmgSum[style.id] = 0;
        styleDeltaRmsSum[style.id] = 0;
        styleAvgDmgSum[style.id] = 0;
    }

    let sumAvgDamage = 0;
    let sumDeltaDamage = 0;
    let sumDeltaDamagePct = 0;
    let sumAvgRooms = 0;
    let sumDeltaRooms = 0;
    let sumDeltaRoomsPct = 0;
    let maxFloorStyleMult = 0;
    let maxFloorBestStyleDeltaRms = 0;

    for (const fp of activeFloors) {
        const base = baselines.byFloor[fp.id];
        const sample = runFloorSample(itemDef, fp, aggMetrics);

        const deltaDamage = Math.max(0, Math.round((sample.avgDamage - base.avgDamage) * 10) / 10);
        const deltaDamagePct = base.avgDamage > 0 ? Math.max(0, Math.round((deltaDamage / base.avgDamage) * 100)) : 0;
        const deltaRooms = Math.max(0, Math.round((sample.avgRooms - base.avgRooms) * 10) / 10);
        const deltaRoomsPct = base.avgRooms > 0 ? Math.max(0, Math.round((deltaRooms / base.avgRooms) * 100)) : 0;
        const roi = cost && cost > 0 ? Math.max(0, Math.round((deltaRoomsPct / cost) * 10) / 10) : null;

        for (const style of PLAYSTYLES) {
            const curS = sample.byPlaystyle[style.id];
            const baseS = base.byPlaystyle[style.id] || { avgDamage: 1, avgRooms: 1 };
            const sDeltaDmg = Math.max(0, curS.avgDamage - baseS.avgDamage);
            const sDeltaRms = Math.max(0, curS.avgRooms - baseS.avgRooms);
            const sMult = baseS.avgDamage > 0 ? Math.max(1.0, curS.avgDamage / baseS.avgDamage) : 1.0;

            styleMultSum[style.id] += sMult;
            styleDeltaDmgSum[style.id] += sDeltaDmg;
            styleDeltaRmsSum[style.id] += sDeltaRms;
            styleAvgDmgSum[style.id] += curS.avgDamage;

            if (sMult > maxFloorStyleMult) maxFloorStyleMult = sMult;
            if (sDeltaRms > maxFloorBestStyleDeltaRms) maxFloorBestStyleDeltaRms = sDeltaRms;
        }

        byFloor[fp.id] = {
            avgRooms: sample.avgRooms,
            deltaRooms,
            deltaRoomsPct,
            avgDamage: sample.avgDamage,
            deltaDamage,
            deltaDamagePct,
            roi,
        };

        sumAvgDamage += sample.avgDamage;
        sumDeltaDamage += deltaDamage;
        sumDeltaDamagePct += deltaDamagePct;
        sumAvgRooms += sample.avgRooms;
        sumDeltaRooms += deltaRooms;
        sumDeltaRoomsPct += deltaRoomsPct;
    }

    const floorCount = activeFloors.length || 1;
    const overallAvgDamage = Math.round((sumAvgDamage / floorCount) * 10) / 10;
    const deltaDmgVal = Math.round((sumDeltaDamage / floorCount) * 10) / 10;
    const deltaDmgPctVal = Math.round(sumDeltaDamagePct / floorCount);
    const overallAvgRooms = Math.round((sumAvgRooms / floorCount) * 10) / 10;
    const deltaRmsVal = Math.round((sumDeltaRooms / floorCount) * 10) / 10;
    const deltaRmsPctVal = Math.round(sumDeltaRoomsPct / floorCount);

    let bestPlaystyle = null;
    let maxStyleMult = 0;
    const styleBreakdown = {};
    for (const style of PLAYSTYLES) {
        const mult = Math.round((styleMultSum[style.id] / floorCount) * 100) / 100;
        const avgDmg = Math.round((styleAvgDmgSum[style.id] / floorCount) * 10) / 10;
        const deltaDmg = Math.round((styleDeltaDmgSum[style.id] / floorCount) * 10) / 10;
        const deltaRms = Math.round((styleDeltaRmsSum[style.id] / floorCount) * 10) / 10;
        styleBreakdown[style.id] = { avgDmg, deltaDmg, deltaRms, mult };

        if (mult > maxStyleMult) {
            maxStyleMult = mult;
            bestPlaystyle = {
                id: style.id,
                name: style.name,
                mult,
                deltaDmg,
                deltaRms,
                avgDmg,
            };
        }
    }

    // Расчёт Value Per Cast
    const itemDpc = {};
    const itemEdpc = {};
    const dpcDeltas = {};
    let bestSynergySkill = null;
    let maxSkillMult = 1.0;

    for (const sk of ALL_SKILLS) {
        const dpc = aggMetrics.skillCasts[sk] > 0
            ? Math.round((aggMetrics.skillDamage[sk] / aggMetrics.skillCasts[sk]) * 10) / 10
            : 0;
        const edpc = aggMetrics.skillCasts[sk] > 0
            ? Math.round((aggMetrics.skillDefense[sk] / aggMetrics.skillCasts[sk]) * 10) / 10
            : 0;

        itemDpc[sk] = dpc;
        itemEdpc[sk] = edpc;

        const baseVal = ["defend", "concentrate"].includes(sk) ? baselines.skillEdpc[sk] : baselines.skillDpc[sk];
        const curVal = ["defend", "concentrate"].includes(sk) ? edpc : dpc;
        dpcDeltas[sk] = Math.round((curVal - baseVal) * 10) / 10;

        if (baseVal > 0) {
            const mult = curVal / baseVal;
            if (mult > maxSkillMult && aggMetrics.skillCasts[sk] >= 10) {
                maxSkillMult = mult;
                bestSynergySkill = { skill: sk, mult: Math.round(mult * 100) / 100, delta: dpcDeltas[sk] };
            }
        }
    }

    const roi = cost && cost > 0
        ? Math.max(0, Math.round((deltaRmsPctVal / cost) * 10) / 10)
        : null;
    const targetRoi = cost && cost > 0
        ? getExpectedRoiPerG(itemDef.category, itemDef.rarity)
        : null;
    const expectedPct = getExpectedDeltaPct(itemDef);
    const valueScore = expectedPct > 0
        ? Math.max(0, Math.round((deltaRmsPctVal / expectedPct) * 100))
        : 0;

    const { verdict, icon } = classifyItemVerdict({
        cost,
        rarity: itemDef.rarity || null,
        deltaRmsPctVal,
        deltaRmsVal,
        valueScore,
        maxStyleMult,
        bestPlaystyle,
    });

    return {
        id: itemDef.id,
        name: itemDef.name,
        category: itemDef.category,
        rarity: itemDef.rarity || null,
        cost: itemDef.cost ?? null,
        desc: itemDef.desc || "",
        roi,
        targetRoi,
        valueScore,
        avgDamage: overallAvgDamage,
        deltaDamage: deltaDmgVal,
        deltaDamagePct: deltaDmgPctVal,
        avgRooms: overallAvgRooms,
        deltaRooms: deltaRmsVal,
        deltaRoomsPct: deltaRmsPctVal,
        byFloor,
        bestPlaystyle,
        styleBreakdown,
        itemDpc,
        itemEdpc,
        dpcDeltas,
        bestSynergySkill,
        verdict,
        icon,
    };
}

// 9. Естественная сортировка по ID и сбор пула сущностей
function sortByIdNatural(items) {
    return items.sort((a, b) => {
        const prefixA = a.id.replace(/[\d_]+/g, "");
        const prefixB = b.id.replace(/[\d_]+/g, "");
        if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
        const partsA = (a.id.match(/\d+/g) || []).map(Number);
        const partsB = (b.id.match(/\d+/g) || []).map(Number);
        const maxLen = Math.max(partsA.length, partsB.length);
        for (let i = 0; i < maxLen; i++) {
            const diff = (partsA[i] || 0) - (partsB[i] || 0);
            if (diff !== 0) return diff;
        }
        return 0;
    });
}

function buildItemPool() {
    const pool = [];
    DATA_PERKS.forEach(p => pool.push({ ...p, type: "perk", category: "perks", cost: null }));
    DATA_ITEMS.weapons.forEach(w => pool.push({ ...w, type: "weapon", category: "weapons" }));
    (DATA_ITEMS.armors || DATA_ITEMS.armor || []).forEach(a => pool.push({ ...a, type: "armor", category: "armors" }));
    DATA_ITEMS.artifacts.forEach(art => pool.push({ ...art, type: "artifact", category: "artifacts" }));
    DATA_ITEMS.potions.forEach(pot => pool.push({ ...pot, type: "potion", category: "potions" }));

    const filtered = pool.filter(item => {
        if (targetIdArg && item.id !== targetIdArg) return false;
        if (targetCatArg && item.category !== targetCatArg) return false;
        return true;
    });

    return sortByIdNatural(filtered);
}

// 10. Форматирование консольного вывода и Markdown
function formatConsoleRow(res, activeFloors = ACTIVE_FLOOR_PROFILES) {
    const dRms = `+${res.deltaRooms} (+${res.deltaRoomsPct}%)`;
    const rarityPad = formatShortRarity(res.rarity).padEnd(5);
    const costStr = res.cost !== null ? `${res.cost}G`.padEnd(6) : "—".padEnd(6);
    const roiStr = res.roi !== null ? `+${res.roi}`.padEnd(6) : "—".padEnd(6);
    const vsStr = `${res.valueScore}`.padEnd(4);
    const idPad = res.id.padEnd(5);
    const namePad = res.name.slice(0, 20).padEnd(21);
    const catPad = res.category.padEnd(9);
    const floorCols = activeFloors.map(fp => {
        const fRes = res.byFloor[fp.id];
        return (fRes ? `+${fRes.deltaRoomsPct}%` : "—").padEnd(6);
    }).join(" | ");
    const rmsPad = `${res.avgRooms} (${dRms})`.padEnd(18);
    const bestStylePad = res.bestPlaystyle ? `${res.bestPlaystyle.name} (x${res.bestPlaystyle.mult})`.slice(0, 23).padEnd(24) : "-".padEnd(24);
    const verdPad = `${res.icon} ${res.verdict}`;

    return `${idPad} | ${namePad} | ${catPad} | ${rarityPad} | ${costStr} | ${roiStr} | ${vsStr} | ${floorCols} | ${rmsPad} | ${bestStylePad} | ${verdPad}`;
}

function generateMarkdownReport(results, baselines, activeFloors = ACTIVE_FLOOR_PROFILES) {
    const reportPath = path.resolve("./docs/balance-report.md");
    let md = "";

    md += "# Автоматический отчёт баланса: Дальность комнат, этажные срезы и экономика\n\n";
    md += `* **Дата генерации:** ${new Date().toLocaleString("ru-RU")}\n`;
    md += `* **Конфигурация:** ${RUNS_PER_PLAYSTYLE} забегов на стиль, классы: ${CLASSES.join(", ")}, этажи: ${activeFloors.map(f => f.label).join(", ")}\n`;
    md += `* **Стандартный полигон:** ${GAUNTLET_STEPS.length}-шаговая лестница прогрессии (Склеп -> Топи -> Кузня -> Цитадель -> Бездна)\n`;
    md += `* **Средняя отдача способностей (DPC / EDPC):** Fast: **${baselines.skillDpc.fast}**, Heavy: **${baselines.skillDpc.heavy}**, Pierce: **${baselines.skillDpc.pierce}**, Whirl: **${baselines.skillDpc.whirlwind}**, Def: **${baselines.skillEdpc.defend}**, Conc: **${baselines.skillEdpc.concentrate}**\n\n`;

    md += "### Базовые линии по этажам (статовый затар, слоты пустые)\n\n";
    md += "| Этаж | Статовый затар | Уровень | Комнаты базы | Ср. урон | Ходов | DPC Fast | Heavy | Pierce | Whirl | EDPC Def | Conc |\n";
    md += "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n";
    for (const fp of activeFloors) {
        const b = baselines.byFloor[fp.id];
        const statsTag = fp.floor === 0
            ? "Голый старт (без бонусов)"
            : `+${fp.bonusHp} HP, +${fp.bonusAtk} ATK, +${fp.bonusDef} DEF, +${fp.bonusEn} EN`;
        const maxAvail = GAUNTLET_STEPS.length - fp.startStepIndex;
        md += `| **${fp.label}** (${fp.name.split(" (")[0]}) | ${statsTag} | ${fp.startLevel} | **${b.avgRooms} / ${maxAvail}.0** | ${b.avgDamage} | ${b.avgTurns} | ${b.skillDpc.fast} | ${b.skillDpc.heavy} | ${b.skillDpc.pierce} | ${b.skillDpc.whirlwind} | ${b.skillEdpc.defend} | ${b.skillEdpc.concentrate} |\n`;
    }
    md += "\n";

    md += "### Целевая матрица ROI (%/G) по категориям и редкости\n\n";
    md += "| Категория | Обычное | Редкое | Эпическое | Легендарное |\n";
    md += "| :--- | :---: | :---: | :---: | :---: |\n";
    md += `| **Оружие и Броня** (1.0x) | ${EXPECTED_ROI_MATRIX.weapons["Обычное"]} | ${EXPECTED_ROI_MATRIX.weapons["Редкое"]} | ${EXPECTED_ROI_MATRIX.weapons["Эпическое"]} | ${EXPECTED_ROI_MATRIX.weapons["Легендарное"]} |\n`;
    md += `| **Артефакты** (0.5x) | ${EXPECTED_ROI_MATRIX.artifacts["Обычное"]} | ${EXPECTED_ROI_MATRIX.artifacts["Редкое"]} | ${EXPECTED_ROI_MATRIX.artifacts["Эпическое"]} | ${EXPECTED_ROI_MATRIX.artifacts["Легендарное"]} |\n`;
    md += `| **Зелья (1 шт.)** (0.75x) | ${EXPECTED_ROI_MATRIX.potions["Обычное"]} | ${EXPECTED_ROI_MATRIX.potions["Редкое"]} | ${EXPECTED_ROI_MATRIX.potions["Эпическое"]} | ${EXPECTED_ROI_MATRIX.potions["Легендарное"]} |\n`;
    md += `| **Перки (Δ% эталон)** | +${PERK_EXPECTED_PCT_BY_RARITY["Обычное"]}% | +${PERK_EXPECTED_PCT_BY_RARITY["Редкое"]}% | +${PERK_EXPECTED_PCT_BY_RARITY["Эпическое"]}% | +${PERK_EXPECTED_PCT_BY_RARITY["Легендарное"]}% |\n\n`;

    const imbaList = results.filter(r => r.verdict === "Универсальная имба");
    const superRoiList = results.filter(r => r.verdict === "Сверхвыгодно (Высокий ROI)");
    const overpriceList = results.filter(r => r.verdict === "Оверпрайс / Ловушка");
    const synergyList = results.filter(r => r.verdict === "Сломанная синергия");
    const weakList = results.filter(r => r.verdict === "Слабо / Мусор");
    const lateScalingList = results.filter(r => {
        const f1 = r.byFloor.f1?.deltaRoomsPct ?? 0;
        const f4 = r.byFloor.f4?.deltaRoomsPct ?? 0;
        return r.byFloor.f1 && r.byFloor.f4 && (f4 - f1) >= 10;
    });

    md += "## 1. Сводка критических отклонений баланса\n\n";
    md += `* 🚨 **Универсальная имба (${imbaList.length}):** ${imbaList.map(r => `\`${r.id}\` **${r.name}** (+${r.deltaRoomsPct}% комнат, +${r.deltaRooms} комнат)`).join(", ") || "Нет"}\n`;
    md += `* 💎 **Сверхвыгодные предметы магазина (Высокий ROI, ${superRoiList.length}):** ${superRoiList.map(r => `\`${r.id}\` **${r.name}** (${r.cost}G, ROI: +${r.roi}, VS: ${r.valueScore})`).join(", ") || "Нет"}\n`;
    md += `* 💸 **Оверпрайс / Ловушки для игрока (${overpriceList.length}):** ${overpriceList.map(r => `\`${r.id}\` **${r.name}** (${r.cost}G, +${r.deltaRoomsPct}% комнат, VS: ${r.valueScore})`).join(", ") || "Нет"}\n`;
    md += `* ⚡ **Мощные синергии стилей (${synergyList.length}):** ${synergyList.map(r => `\`${r.id}\` **${r.name}** (${r.bestPlaystyle ? r.bestPlaystyle.name + " x" + r.bestPlaystyle.mult : ""})`).join(", ") || "Нет"}\n`;
    md += `* 📈 **Сильнее в лейте, чем на старте (Э4 ≥ Э1 + 10% п.п., ${lateScalingList.length}):** ${lateScalingList.map(r => `\`${r.id}\` ${r.name} (+${r.byFloor.f1.deltaRoomsPct}% → +${r.byFloor.f4.deltaRoomsPct}%)`).join(", ") || "Нет"}\n`;
    md += `* 💤 **Слабый / Мёртвый груз (${weakList.length}):** ${weakList.map(r => `\`${r.id}\` ${r.name} (+${r.deltaRoomsPct}% комнат)`).join(", ") || "Нет"}\n\n`;

    const categories = [
        { key: "perks", title: "Перки" },
        { key: "artifacts", title: "Артефакты" },
        { key: "weapons", title: "Оружие" },
        { key: "armors", title: "Броня" },
        { key: "potions", title: "Зелья" },
    ];

    const floorHeaders = activeFloors.map(fp => fp.label).join(" | ");
    const floorAligns = activeFloors.map(() => ":---:").join(" | ");

    for (const cat of categories) {
        const catResults = sortByIdNatural(results.filter(r => r.category === cat.key));
        if (catResults.length === 0) continue;

        md += `## 2. ${cat.title} (${catResults.length})\n\n`;
        md += `| ID | Название | Редкость | Цена | Эффект | ${floorHeaders} | Ср. Δ% | ROI (%/G) | VS | Лучший стиль | Вердикт |\n`;
        md += `| :--- | :--- | :---: | :---: | :--- | ${floorAligns} | :---: | :---: | :---: | :--- | :--- |\n`;

        for (const r of catResults) {
            const rarityStr = r.rarity || "—";
            const costStr = r.cost !== null ? `${r.cost}G` : "— *(LvlUp)*";
            const roiStr = r.roi !== null
                ? (r.targetRoi ? `**+${r.roi}** / ${r.targetRoi}` : `**+${r.roi}**`)
                : "—";
            const vsStr = `**${r.valueScore}**`;
            const floorCells = activeFloors.map(fp => {
                const fr = r.byFloor[fp.id];
                return fr ? `**+${fr.deltaRoomsPct}%** (+${fr.deltaRooms})` : "—";
            }).join(" | ");
            const dRmsStr = `+${r.deltaRoomsPct}% (+${r.deltaRooms})`;
            const styleStr = r.bestPlaystyle ? `**${r.bestPlaystyle.name}** (x${r.bestPlaystyle.mult})` : "-";
            const descEscaped = r.desc.replace(/\|/g, "\\|");

            md += `| \`${r.id}\` | **${r.name}** | ${rarityStr} | ${costStr} | ${descEscaped} | ${floorCells} | **${dRmsStr}** | ${roiStr} | ${vsStr} | ${styleStr} | ${r.icon} ${r.verdict} |\n`;
        }
        md += "\n";
    }

    md += "## 3. Матрица отдачи способностей (Damage & Defense Per Cast)\n\n";
    md += "| ID | Название | DPC Fast | DPC Heavy | DPC Pierce | DPC Whirlwind | EDPC Defend | EDPC Concentrate |\n";
    md += "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n";
    for (const r of sortByIdNatural(results)) {
        md += `| \`${r.id}\` | ${r.name} | ${r.itemDpc.fast} | ${r.itemDpc.heavy} | ${r.itemDpc.pierce} | ${r.itemDpc.whirlwind} | ${r.itemEdpc.defend} | ${r.itemEdpc.concentrate} |\n`;
    }
    md += "\n";

    fs.writeFileSync(reportPath, md, "utf8");
    console.log(`\n📄 Итоговый подробный отчёт сохранён в ${reportPath}`);
}

function hslToHex(h, s, l) {
    const normH = ((h % 360) + 360) % 360;
    const normS = s / 100;
    const normL = l / 100;
    const k = n => (n + normH / 30) % 12;
    const a = normS * Math.min(normL, 1 - normL);
    const f = n => normL - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

const PERK_EXPECTED_PCT = 20;
const PERK_EXPECTED_PCT_BY_RARITY = {
    "Обычное": 13,
    "Редкое": 20,
    "Эпическое": 28,
    "Легендарное": 36,
};
const DEFAULT_RARITY_BY_CATEGORY = {
    weapons: "Обычное",
    armors: "Обычное",
    artifacts: "Редкое",
    potions: "Обычное",
    perks: "Редкое",
};
const EXPECTED_ROI_MATRIX = {
    weapons: {
        "Обычное": 2.0,
        "Редкое": 2.2,
        "Эпическое": 2.4,
        "Легендарное": 2.6,
    },
    armors: {
        "Обычное": 2.0,
        "Редкое": 2.2,
        "Эпическое": 2.4,
        "Легендарное": 2.6,
    },
    artifacts: {
        "Обычное": 1.0,
        "Редкое": 1.1,
        "Эпическое": 1.2,
        "Легендарное": 1.3,
    },
    potions: {
        "Обычное": 1.5,
        "Редкое": 1.65,
        "Эпическое": 1.8,
        "Легендарное": 1.95,
    },
};

function calculateScoreHue(score) {
    if (score <= 100) {
        const t = Math.max(0, Math.min(1, (100 - score) / 100));
        return 135 + t * 85;
    }
    if (score <= 160) {
        const t = (score - 100) / 60;
        return 135 - t * 95;
    }
    if (score <= 215) {
        const t = (score - 160) / 55;
        return 40 - t * 40;
    }
    const t = Math.min(1, (score - 215) / 300);
    return 360 - t * 45;
}

function calculateRawPctHue(pct) {
    const normalizedScore = Math.max(0, Math.round((pct / 35) * 100));
    return calculateScoreHue(normalizedScore);
}

function calculateItemValueScore(id, pct, itemMetaMap) {
    const expected = getExpectedDeltaPct(itemMetaMap.get(id));
    return expected > 0 ? Math.max(0, Math.round((pct / expected) * 100)) : 0;
}

function parseReportMetrics(reportPath) {
    const metrics = new Map();
    if (!fs.existsSync(reportPath)) return metrics;

    const reportContent = fs.readFileSync(reportPath, "utf8");
    const floorColMap = new Map();
    let avgColIdx = -1;

    for (const line of reportContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|")) continue;
        const cols = trimmed.split("|").map(c => c.trim()).slice(1, -1);

        if (cols[0] === "ID" && cols.includes("Ср. Δ%")) {
            floorColMap.clear();
            for (const fp of FLOOR_PROFILES) {
                const idx = cols.indexOf(fp.label);
                if (idx !== -1) floorColMap.set(fp.id, idx);
            }
            avgColIdx = cols.indexOf("Ср. Δ%");
            continue;
        }
        if (trimmed.includes(":---")) continue;

        const idMatch = cols[0] ? cols[0].match(/`([a-z0-9_]+)`/) : null;
        if (idMatch && avgColIdx >= 0 && cols[avgColIdx]) {
            const id = idMatch[1];
            const avgMatch = cols[avgColIdx].match(/\+?([0-9.]+)%/);
            const avgPct = avgMatch ? parseFloat(avgMatch[1]) : 0;
            const byFloor = {};
            for (const [fId, colIdx] of floorColMap.entries()) {
                const fMatch = cols[colIdx] ? cols[colIdx].match(/\+?([0-9.]+)%/) : null;
                if (fMatch) byFloor[fId] = parseFloat(fMatch[1]);
            }
            metrics.set(id, { avgPct, byFloor });
        }
    }
    return metrics;
}

function colorizeAuditMarkdown(simResults = null) {
    const auditPath = path.resolve("./docs/items-and-perks-balance.md");
    const reportPath = path.resolve("./docs/balance-report.md");

    if (!fs.existsSync(auditPath)) {
        console.warn(`[colorize] Файл не найден: ${auditPath}`);
        return;
    }

    const itemMetaMap = new Map();
    DATA_PERKS.forEach(p => itemMetaMap.set(p.id, { id: p.id, cost: null, category: "perks", rarity: p.rarity || null }));
    DATA_ITEMS.weapons.forEach(w => itemMetaMap.set(w.id, { id: w.id, cost: w.cost, category: "weapons", rarity: w.rarity || null }));
    (DATA_ITEMS.armors || DATA_ITEMS.armor || []).forEach(a => itemMetaMap.set(a.id, { id: a.id, cost: a.cost, category: "armors", rarity: a.rarity || null }));
    DATA_ITEMS.artifacts.forEach(art => itemMetaMap.set(art.id, { id: art.id, cost: art.cost, category: "artifacts", rarity: art.rarity || null }));
    DATA_ITEMS.potions.forEach(pot => itemMetaMap.set(pot.id, { id: pot.id, cost: pot.cost, category: "potions", rarity: pot.rarity || null }));

    const metrics = new Map();

    if (Array.isArray(simResults) && simResults.length > 0) {
        for (const r of simResults) {
            const byFloor = {};
            for (const fp of FLOOR_PROFILES) {
                if (r.byFloor && r.byFloor[fp.id] !== undefined) {
                    byFloor[fp.id] = r.byFloor[fp.id].deltaRoomsPct || 0;
                }
            }
            metrics.set(r.id, { avgPct: r.deltaRoomsPct || 0, byFloor });
        }
    } else {
        for (const [k, v] of parseReportMetrics(reportPath).entries()) {
            metrics.set(k, v);
        }
    }

    const rawContent = fs.readFileSync(auditPath, "utf8");
    const lines = rawContent.split(/\r?\n/);

    let powerColIdx = -1;
    let rawColIdx = -1;
    let costColIdx = -1;
    let rarityColIdx = -1;
    let floorColIndices = [];
    let insertRawPos = -1;
    let insertFloorPos = -1;
    let modifiedCount = 0;
    const outputLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("|")) {
            const cols = trimmed.split("|").map(c => c.trim()).slice(1, -1);
            if (cols.includes("Оценка силы")) {
                insertRawPos = -1;
                insertFloorPos = -1;

                if (!cols.includes("Сырой прирост")) {
                    insertRawPos = cols.indexOf("Оценка силы");
                    cols.splice(insertRawPos, 0, "Сырой прирост");
                }
                if (!cols.includes(FLOOR_PROFILES[0].label)) {
                    insertFloorPos = cols.indexOf("Сырой прирост");
                    cols.splice(insertFloorPos, 0, ...FLOOR_PROFILES.map(fp => fp.label));
                }

                costColIdx = cols.indexOf("Цена");
                rawColIdx = cols.indexOf("Сырой прирост");
                powerColIdx = cols.indexOf("Оценка силы");
                const rarityIdx = cols.indexOf("Редкость");
                rarityColIdx = rarityIdx;
                floorColIndices = FLOOR_PROFILES.map(fp => ({
                    id: fp.id,
                    idx: cols.indexOf(fp.label),
                }));

                outputLines.push(`| ${cols.join(" | ")} |`);
                continue;
            }
            if (trimmed.includes(":---")) {
                if (insertRawPos >= 0) cols.splice(insertRawPos, 0, ":---:");
                if (insertFloorPos >= 0) cols.splice(insertFloorPos, 0, ...FLOOR_PROFILES.map(() => ":---:"));
                outputLines.push(`| ${cols.join(" | ")} |`);
                continue;
            }

            const idMatch = cols[0] ? cols[0].match(/`([a-z0-9_]+)`/) : null;
            if (idMatch && powerColIdx >= 0) {
                if (insertRawPos >= 0) cols.splice(insertRawPos, 0, "");
                if (insertFloorPos >= 0) cols.splice(insertFloorPos, 0, ...FLOOR_PROFILES.map(() => ""));

                const id = idMatch[1];
                const itemMeta = itemMetaMap.get(id);
                const cost = itemMeta ? itemMeta.cost : null;
                const fallbackPct = getExpectedDeltaPct(itemMeta);
                const entry = metrics.get(id);
                const pct = entry ? entry.avgPct : fallbackPct;
                const score = calculateItemValueScore(id, pct, itemMetaMap);

                const scoreHue = calculateScoreHue(score);
                const scoreHex = hslToHex(scoreHue, 85, 54);
                const rawHue = calculateRawPctHue(pct);
                const rawHex = hslToHex(rawHue, 85, 54);

                for (const fc of floorColIndices) {
                    if (fc.idx < 0) continue;
                    const fPct = entry && entry.byFloor[fc.id] !== undefined ? entry.byFloor[fc.id] : pct;
                    const fHex = hslToHex(calculateRawPctHue(fPct), 85, 54);
                    cols[fc.idx] = `<span style="color: ${fHex}">**+${fPct}%**</span>`;
                }

                cols[rawColIdx] = `<span style="color: ${rawHex}">**+${pct}%**</span>`;
                cols[powerColIdx] = `<span style="color: ${scoreHex}">**${score}**</span>`;

                if (rarityColIdx >= 0 && itemMeta && itemMeta.rarity) {
                    cols[rarityColIdx] = itemMeta.rarity;
                }
                if (costColIdx >= 0 && cost !== null && cost !== undefined) {
                    cols[costColIdx] = String(cost);
                }

                outputLines.push(`| ${cols.join(" | ")} |`);
                modifiedCount++;
                continue;
            }
        }

        outputLines.push(line);
    }

    let resultMd = outputLines.join("\n");

    const legendBlock = [
        "> **Шкала оценок эффективности (Две шкалы, 4 этажа Э1–Э4 + среднее):**",
        "> 1. **Э1–Э4 и Сырой прирост (растянутая шкала прироста дальности комнат от $+0\\%$ до $+180\\%+$):**  ",
        `>    <span style="color: ${hslToHex(calculateRawPctHue(0), 85, 54)}">**+0% (база)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(35), 85, 54)}">**+35% (норма)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(56), 85, 54)}">**+56% (сильно)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(75), 85, 54)}">**+75% (алый)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(125), 85, 54)}">**+125% (мощно)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(180), 85, 54)}">**+180%+ (пурпур)**</span>`,
        "> 2. **Оценка силы / Value Score (отношение среднего прироста к эталону категории и редкости, где 100 — точное попадание):**  ",
        `>    *Эталон 100: Оружие/Броня \`2.0 / 2.2 / 2.4 / 2.6 %/G\`, Артефакты \`1.0 / 1.1 / 1.2 / 1.3 %/G\`, Зелья (1 шт.) \`1.5 / 1.65 / 1.8 / 1.95 %/G\`, Перки \`+${PERK_EXPECTED_PCT_BY_RARITY["Обычное"]}% / +${PERK_EXPECTED_PCT_BY_RARITY["Редкое"]}% / +${PERK_EXPECTED_PCT_BY_RARITY["Эпическое"]}% / +${PERK_EXPECTED_PCT_BY_RARITY["Легендарное"]}%\`.*  `,
        `>    <span style="color: ${hslToHex(calculateScoreHue(0), 85, 54)}">**0 (мусор)**</span> $\\to$ <span style="color: ${hslToHex(calculateScoreHue(50), 85, 54)}">**50 (слабо)**</span> $\\to$ <span style="color: ${hslToHex(calculateScoreHue(100), 85, 54)}">**100 (идеал)**</span> $\\to$ <span style="color: ${hslToHex(calculateScoreHue(130), 85, 54)}">**130 (лайм)**</span> $\\to$ <span style="color: ${hslToHex(calculateScoreHue(160), 85, 54)}">**160 (янтарь)**</span> $\\to$ <span style="color: ${hslToHex(calculateScoreHue(215), 85, 54)}">**215 (алый)**</span> $\\to$ <span style="color: ${hslToHex(calculateScoreHue(350), 85, 54)}">**350 (малина)**</span> $\\to$ <span style="color: ${hslToHex(calculateScoreHue(500), 85, 54)}">**500+ (пурпур)**</span>`,
    ].join("\n");

    if (resultMd.includes("Шкала силы") || resultMd.includes("Цветовая шкала силы") || resultMd.includes("Шкала оценок эффективности")) {
        resultMd = resultMd.replace(/> \*\*(?:Шкала силы|Цветовая шкала силы|Шкала оценок эффективности)[\s\S]*?(?=\n\n|\n---)/, legendBlock);
    } else {
        resultMd = resultMd.replace(
            "Документ содержит полный перечень боевых перков, артефактов, оружия, брони и зелий с оценкой их текущего баланса и выделением потенциально имбовых механик.\n",
            `Документ содержит полный перечень боевых перков, артефактов, оружия, брони и зелий с оценкой их текущего баланса и выделением потенциально имбовых механик.\n\n${legendBlock}\n`
        );
    }

    fs.writeFileSync(auditPath, resultMd, "utf8");
    console.log(`🎨 Обновлены колонки Э1–Э4, Сырой прирост и Value Score (${modifiedCount} шт.) в ${auditPath}`);
}

function classifyItemVerdict({ cost, rarity, deltaRmsPctVal, deltaRmsVal, valueScore, maxStyleMult, bestPlaystyle }) {
    if (cost && cost > 0) {
        if ((valueScore >= 165 && deltaRmsPctVal >= 50) || deltaRmsPctVal >= 120) {
            return { verdict: "Универсальная имба", icon: "🚨" };
        }
        if (valueScore >= 140 && deltaRmsPctVal >= 20) {
            return { verdict: "Сверхвыгодно (Высокий ROI)", icon: "💎" };
        }
        if (deltaRmsPctVal <= 6 && deltaRmsVal <= 0.2) {
            return { verdict: "Слабо / Мусор", icon: "💤" };
        }
        if (valueScore <= 60) {
            return { verdict: "Оверпрайс / Ловушка", icon: "💸" };
        }
        if (bestPlaystyle && bestPlaystyle.deltaRms >= 2.0 && bestPlaystyle.deltaRms >= deltaRmsVal * 1.5 && maxStyleMult >= 1.65) {
            return { verdict: "Сломанная синергия", icon: "⚡" };
        }
        return { verdict: "Баланс", icon: "✅" };
    }

    if ((valueScore >= 165 && deltaRmsPctVal >= 45) || deltaRmsPctVal >= 75 || deltaRmsVal >= 2.5) {
        return { verdict: "Универсальная имба", icon: "🚨" };
    }
    if (deltaRmsPctVal <= 8 && deltaRmsVal <= 0.25) {
        return { verdict: "Слабо / Мусор", icon: "💤" };
    }
    if (rarity && valueScore <= 55) {
        return { verdict: "Слабо / Мусор", icon: "💤" };
    }
    if (bestPlaystyle && bestPlaystyle.deltaRms >= 2.0 && bestPlaystyle.deltaRms >= deltaRmsVal * 1.5 && maxStyleMult >= 1.65) {
        return { verdict: "Сломанная синергия", icon: "⚡" };
    }
    return { verdict: "Баланс", icon: "✅" };
}

function getExpectedDeltaPct(item) {
    if (!item || item.cost === null || item.cost === undefined) {
        return (item && item.rarity && PERK_EXPECTED_PCT_BY_RARITY[item.rarity]) || PERK_EXPECTED_PCT;
    }
    const targetRoi = getExpectedRoiPerG(item.category, item.rarity);
    return targetRoi ? item.cost * targetRoi : item.cost * 2.0;
}

function getExpectedRoiPerG(category, rarity) {
    const catTable = EXPECTED_ROI_MATRIX[category];
    if (!catTable) return null;
    const effectiveRarity = rarity || DEFAULT_RARITY_BY_CATEGORY[category] || "Обычное";
    return catTable[effectiveRarity] ?? Object.values(catTable)[0] ?? null;
}

function formatShortRarity(rarity) {
    if (!rarity) return "—";
    if (rarity === "Обычное") return "Обыч.";
    if (rarity === "Редкое") return "Редк.";
    if (rarity === "Эпическое") return "Эпик.";
    if (rarity === "Легендарное") return "Лег.";
    return rarity.slice(0, 5);
}

// 11. Точка входа
async function main() {
    if (isColorizeOnly) {
        console.log("==========================================================================================");
        console.log("🎨 Colorize Balance Audit — Paper-Lite (Hue Gradient Marker)");
        console.log("==========================================================================================\n");
        colorizeAuditMarkdown();
        return;
    }
    const startTime = Date.now();
    const activeFloors = ACTIVE_FLOOR_PROFILES;
    const isFilteredRun = Boolean(targetIdArg || targetCatArg || targetClassArg || Number.isFinite(targetFloorArg));

    console.log("==========================================================================================");
    console.log("🎮 Headless Balance Simulator — Paper-Lite (Multi-Floor Survival & Economy Progression)");
    console.log(`Параметры: запусков/стиль=${RUNS_PER_PLAYSTYLE}, классы=[${CLASSES.join(", ")}], этажи=[${activeFloors.map(f => f.label).join(", ")}], фильтр ID=${targetIdArg || "все"}`);
    console.log("==========================================================================================\n");

    const baselines = calculateFloorBaselines(activeFloors);
    const itemPool = buildItemPool();

    console.log(`\nЗапуск оценки пула сущностей: ${itemPool.length} шт...\n`);
    const floorColsHeader = activeFloors.map(fp => fp.label.padEnd(6)).join(" | ");
    const floorColsRule = activeFloors.map(() => "--------").join("+");
    const tableRule = `------+-------------------------+-----------+-------+--------+--------+------+${floorColsRule}+--------------------+--------------------------+-----------------------`;
    console.log(`ID    | Название                | Катег.    | Редк. | Цена   | ROI    | VS   | ${floorColsHeader} | Ср.Комн (Δ)        | Лучший стиль (xMult)     | Вердикт`);
    console.log(tableRule);

    const results = [];
    for (const item of itemPool) {
        try {
            const res = evaluateFloorItem(item, baselines, activeFloors);
            results.push(res);
            console.log(formatConsoleRow(res, activeFloors));
        } catch (err) {
            console.error(`❌ Ошибка симуляции для ${item.id} (${item.name}):`, err.message);
        }
    }

    const elapsed = Math.round((Date.now() - startTime) / 100) / 10;
    console.log(tableRule);
    console.log(`\n✨ Симуляция завершена за ${elapsed}s. Обработано сущностей: ${results.length}/${itemPool.length}.`);

    if (!skipReport && results.length > 0) {
        if (isFilteredRun) {
            console.log("ℹ️ Фильтрованный прогон: файлы отчётов не перезаписаны (запустите без фильтров для полного обновления).");
        } else {
            generateMarkdownReport(results, baselines, activeFloors);
            colorizeAuditMarkdown(results);
        }
    }
}

main().catch(err => {
    console.error("Критический сбой симулятора:", err);
    process.exit(1);
});
