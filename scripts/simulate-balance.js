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
 *   node scripts/simulate-balance.js                  # Быстрый прогон всех 104 сущностей (~10-15 сек)
 *   node scripts/simulate-balance.js --full           # Глубокий аудит с увеличенной выборкой (~35 сек)
 *   node scripts/simulate-balance.js --colorize       # Мгновенное обновление цветов в docs/items-and-perks-balance.md
 *   node scripts/simulate-balance.js --id p35         # Анализ конкретного перка / предмета
 *   node scripts/simulate-balance.js --category perks # Анализ только категории (perks/weapons/armors/artifacts/potions)
 *   node scripts/simulate-balance.js --class assassin # Анализ только по одному классу
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
    // Этаж 0: Заброшенные Катакомбы (плавный разгон и развитие персонажа)
    { name: "Склеп: Разминка", floor: 0, room: 1, mode: "normal" },
    { name: "Склеп: Обычный пак 1", floor: 0, room: 2, mode: "normal" },
    { name: "Склеп: Обычный пак 2", floor: 0, room: 3, mode: "normal" },
    { name: "Склеп: Усиленный пак", floor: 0, room: 4, mode: "normal" },
    { name: "Склеп: Ветеранский пак", floor: 0, room: 5, mode: "normal" },
    { name: "Склеп: Элита", floor: 0, room: 6, mode: "elite" },
    { name: "Склеп: Босс Король Ворт", floor: 0, room: 8, mode: "boss" },

    // Этаж 1: Грибные Пещеры и Топи
    { name: "Топи: Дозор болот", floor: 1, room: 2, mode: "normal" },
    { name: "Топи: Споровый пак", floor: 1, room: 3, mode: "normal" },
    { name: "Топи: Глубокая трясина", floor: 1, room: 4, mode: "normal" },
    { name: "Топи: Засада чудовищ", floor: 1, room: 5, mode: "normal" },
    { name: "Топи: Элита", floor: 1, room: 6, mode: "elite" },
    { name: "Топи: Босс Агарик", floor: 1, room: 8, mode: "boss" },

    // Этаж 2: Кузня Железного Культа
    { name: "Кузня: Патруль автоматонов", floor: 2, room: 2, mode: "normal" },
    { name: "Кузня: Шлаковый забой", floor: 2, room: 4, mode: "normal" },
    { name: "Кузня: Огненный цех", floor: 2, room: 5, mode: "normal" },
    { name: "Кузня: Элита", floor: 2, room: 6, mode: "elite" },
    { name: "Кузня: Босс Вулкан", floor: 2, room: 8, mode: "boss" },

    // Этаж 3: Цитадель Пустоты
    { name: "Цитадель: Тени бездны", floor: 3, room: 2, mode: "normal" },
    { name: "Цитадель: Астральный дозор", floor: 3, room: 4, mode: "normal" },
    { name: "Цитадель: Элита", floor: 3, room: 6, mode: "elite" },
    { name: "Цитадель: Финальный Босс Малкор", floor: 3, room: 8, mode: "boss" },

    // Пост-гейм (Endless Abyss)
    { name: "Бездна: Волна 1", floor: 3, room: 10, mode: "normal" },
    { name: "Бездна: Волна 2 (Элита)", floor: 3, room: 12, mode: "elite" },
    { name: "Бездна: Волна 3 (Архи-Босс)", floor: 3, room: 16, mode: "boss" },
];

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
    const execDmg = Math.round(2 + atkVal * 0.5) + (p.perks.includes("p1") ? 4 : 0);

    // Добивание Казнью ради экстра-хода
    const killable = alive.find(item => item.e.currentHp <= execDmg);
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

    for (let i = p.inventory.potions.length - 1; i >= 0; i--) {
        const pot = p.inventory.potions[i];
        if (!pot) continue;

        // Лечение
        if (["pot1", "pot6", "pot8"].includes(pot.id)) {
            if (p.hp <= maxHp * 0.45 || p.poison >= 3 || p.bleed >= 3) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (pot.id === "pot4") {
            if (p.hp <= maxHp * 0.55 && p.shield <= 3) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        if (pot.id === "pot7") {
            const aliveEnemies = game.enemies.filter(e => e.currentHp > 0);
            const shouldStartBuff = p.battleSpikes === 0 && (aliveEnemies.length >= 2 || aliveEnemies.some(e => e.currentHp >= 14));
            if (shouldStartBuff || (p.hp <= maxHp * 0.55 && p.shield <= 3)) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        // АОЕ / дебаффы (pot3, pot5)
        if (["pot3", "pot5"].includes(pot.id)) {
            const aliveCount = game.enemies.filter(e => e.currentHp > 0).length;
            if (aliveCount >= 1) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        // Бутыль с Кислотой (pot9) — снимает щиты и -2 DEF
        if (pot.id === "pot9") {
            const aliveEnemies = game.enemies.filter(e => e.currentHp > 0);
            const worthAcid = aliveEnemies.some(e => e.shield >= 3 || e.def >= 2 || (e.currentHp >= 10 && (e.shield > 0 || e.def > 0)))
                || aliveEnemies.filter(e => e.shield > 0 || e.def > 0).length >= 2;
            if (worthAcid) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        // Энергия / сброс кулдаунов (pot2)
        if (pot.id === "pot2") {
            const aliveHp = game.enemies.reduce((s, e) => s + Math.max(0, e.currentHp), 0);
            if (aliveHp >= 8 && (p.en <= 1 || (p.cooldowns.heavy > 0 && p.cooldowns.pierce > 0 && p.en <= 2))) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
        // Гарантированный крит (pot10)
        if (pot.id === "pot10") {
            const aliveEnemies = game.enemies.filter(e => e.currentHp > 0);
            const isAssassinFirstTurn = p.classId === "assassin" && game.battleTurn === 1;
            if (aliveEnemies.length > 0 && !p.forceCritNext && !isAssassinFirstTurn && aliveEnemies.some(e => e.currentHp >= 5)) {
                BattleSystem.usePotion(game, i);
                return;
            }
        }
    }
}

function chooseAction(game, playstyleId) {
    const p = game.player;
    const target = game.enemies[game.selectedTargetIndex];
    const aliveCount = game.enemies.filter(e => e.currentHp > 0).length;

    let atkVal = p.getTotalAtk();
    if (p.hasArtifact("art18")) atkVal += 3;
    if (game.battleTurn === 1 && p.perks.includes("p13")) atkVal += 5;
    const execDmg = Math.round(2 + atkVal * 0.5) + (p.perks.includes("p1") ? 4 : 0);

    const canDef = BattleSystem.canUseSkill(game, "defend", 0);
    const canExec = target && BattleSystem.canUseSkill(game, "heavy", 1);
    const canPrc = target && BattleSystem.canUseSkill(game, "pierce", 2);
    const canWhirl = aliveCount >= 1 && BattleSystem.canUseSkill(game, "whirlwind", 2);
    const canConc = BattleSystem.canUseSkill(game, "concentrate", 0);
    const heavyThreat = hasIncomingHeavyAttack(game);

    if (playstyleId === "fast_spam") {
        if (p.hp <= 8 && heavyThreat && canDef) return "defend";
        return "fast";
    }

    if (playstyleId === "execute_focus") {
        if (canExec && (target.currentHp <= execDmg || target.def >= 2 || target.shield > 0 || p.perks.includes("p1"))) return "heavy";
        if (p.en < 1 && canConc) return "concentrate";
        return "fast";
    }

    if (playstyleId === "pierce_focus") {
        if (canPrc && (target.shield > 0 || target.def >= 1 || p.en >= 2)) return "pierce";
        if (p.en < 2 && canConc && p.hp > 10) return "concentrate";
        return "fast";
    }

    if (playstyleId === "whirlwind_focus") {
        if (canWhirl) return "whirlwind";
        if (p.en < 2 && canConc && aliveCount >= 2) return "concentrate";
        return "fast";
    }

    if (playstyleId === "tank_focus") {
        if (canDef) return "defend";
        if (canConc && p.hp < p.getTotalMaxHp() * 0.8) return "concentrate";
        if (target && target.currentHp <= execDmg && canExec) return "heavy";
        if (aliveCount >= 2 && canWhirl) return "whirlwind";
        return "fast";
    }

    // Default: Smart (Адаптивный)
    if ((heavyThreat || p.hp <= 8) && canDef) return "defend";
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

function simulateFloorRun(classId, itemDef, playstyleId, runIndex, metrics) {
    const game = new Game();
    game.init();
    game.startRun(classId);

    if (itemDef) {
        const p = game.player;
        if (itemDef.type === "perk") {
            p.perks.push(itemDef.id);
            if (itemDef.id === "p23") p.clampHp();
        } else if (itemDef.type === "artifact") {
            p.addArtifact(itemDef);
        } else if (itemDef.type === "weapon") {
            p.equipWeapon(itemDef);
        } else if (itemDef.type === "armor") {
            p.equipArmor(itemDef);
        } else if (itemDef.type === "potion") {
            p.potionSlots += 2;
            p.inventory.potions.push({ ...itemDef }, { ...itemDef });
        }
    }

    let runDamage = 0;
    let roomsCleared = 0;
    let totalTurns = 0;

    for (let sIdx = 0; sIdx < GAUNTLET_STEPS.length; sIdx++) {
        const step = GAUNTLET_STEPS[sIdx];
        if (game.player.hp <= 0) break;

        game.floor = step.floor;
        game.room = step.room;
        const currentHp = game.player.hp;
        setSeed(getRoomSeed(playstyleId, classId, runIndex, sIdx));
        BattleSystem.setupBattle(game, step.mode);
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
            processIntermission(game, step, roomsCleared);
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

function processIntermission(game, step, roomsCleared) {
    const p = game.player;
    if (p.hp <= 0) return;

    // 1. Сброс временных боевых статусов между комнатами
    p.poison = 0;
    p.bleed = 0;
    p.shield = 0;
    p.tempSpikes = 0;
    p.battleSpikes = 0;
    p.damageReduction50 = false;
    p.forceCritNext = false;
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
    const isCampfire = step.mode === "boss" || (roomsCleared > 0 && roomsCleared % 3 === 0);
    if (isCampfire) {
        const healPct = p.perks.includes("p28") ? 0.70 : 0.45;
        if (p.perks.includes("p28")) {
            p.gold += 6;
        }
        p.heal(Math.ceil(p.getTotalMaxHp() * healPct));
        p.en = p.getTotalMaxEn();
    }

    // Имитация покупки зелья лечения/аптечки при ранении
    if (p.hp < p.getTotalMaxHp() * 0.55 && p.gold >= 6 && (p._lastHealRoom !== step.room)) {
        p._lastHealRoom = step.room;
        p.gold -= 6;
        p.heal(8);
    }

    // 5. Детерминированный псевдо-магазин (конвертация набранного золота в боевые параметры)
    // Каждые 14G накопленного золота игрок получает стабильное усиление экипировки
    while (p.gold >= 14) {
        p.gold -= 14;
        const upgradeStep = (p._simUpgradesDone || 0) % 3;
        p._simUpgradesDone = (p._simUpgradesDone || 0) + 1;

        if (upgradeStep === 0) {
            p.weaponUpgradeLvl += 1;
        } else if (upgradeStep === 1) {
            p.armorUpgradeLvl += 1;
        } else {
            p.baseMaxHp += 3;
            p.heal(8);
        }
    }
}

// 7. Расчёт базовой линии («голый» персонаж)
function calculateFloorBaseline() {
    process.stdout.write("⏳ Расчёт базовой линии прогрессии (без предметов)... ");
    const baseline = {
        avgDamage: 0,
        avgRooms: 0,
        avgTurns: 0,
        byPlaystyle: {},
        skillDpc: {},
        skillEdpc: {},
    };

    let totalAllDamage = 0;
    let totalAllRooms = 0;
    let totalAllRuns = 0;

    const globalMetrics = createMetricsContainer();

    for (const style of PLAYSTYLES) {
        let styleDamage = 0;
        let styleRooms = 0;
        let styleRuns = 0;

        for (const cls of CLASSES) {
            for (let i = 0; i < RUNS_PER_PLAYSTYLE; i++) {
                const res = simulateFloorRun(cls, null, style.id, i, globalMetrics);
                styleDamage += res.runDamage;
                styleRooms += res.roomsCleared;
                styleRuns++;
            }
        }

        const avgDmg = Math.round((styleDamage / styleRuns) * 10) / 10;
        const avgRms = Math.round((styleRooms / styleRuns) * 10) / 10;
        baseline.byPlaystyle[style.id] = { avgDamage: avgDmg, avgRooms: avgRms };

        totalAllDamage += styleDamage;
        totalAllRooms += styleRooms;
        totalAllRuns += styleRuns;
    }

    baseline.avgDamage = Math.round((totalAllDamage / totalAllRuns) * 10) / 10;
    baseline.avgRooms = Math.round((totalAllRooms / totalAllRuns) * 10) / 10;
    baseline.avgTurns = Math.round((globalMetrics.turnsSurvived / totalAllRuns) * 10) / 10;

    for (const sk of ALL_SKILLS) {
        baseline.skillDpc[sk] = globalMetrics.skillCasts[sk] > 0
            ? Math.round((globalMetrics.skillDamage[sk] / globalMetrics.skillCasts[sk]) * 10) / 10
            : 0;
        baseline.skillEdpc[sk] = globalMetrics.skillCasts[sk] > 0
            ? Math.round((globalMetrics.skillDefense[sk] / globalMetrics.skillCasts[sk]) * 10) / 10
            : 0;
    }

    console.log(`[Готово: Комнаты: ${baseline.avgRooms}/${GAUNTLET_STEPS.length}.0, Урон: ${baseline.avgDamage}, DPC Fast: ${baseline.skillDpc.fast}]`);
    return baseline;
}

// 8. Оценка предмета
function evaluateFloorItem(itemDef, baseline) {
    const itemMetrics = createMetricsContainer();
    const styleBreakdown = {};

    let totalAllDamage = 0;
    let totalAllRooms = 0;
    let totalAllRuns = 0;

    let bestPlaystyle = null;
    let maxStyleMult = 0;

    for (const style of PLAYSTYLES) {
        let styleDamage = 0;
        let styleRooms = 0;
        let styleRuns = 0;

        for (const cls of CLASSES) {
            for (let i = 0; i < RUNS_PER_PLAYSTYLE; i++) {
                const res = simulateFloorRun(cls, itemDef, style.id, i, itemMetrics);
                styleDamage += res.runDamage;
                styleRooms += res.roomsCleared;
                styleRuns++;
            }
        }

        const avgDmg = Math.round((styleDamage / styleRuns) * 10) / 10;
        const avgRms = Math.round((styleRooms / styleRuns) * 10) / 10;

        const baseStyle = baseline.byPlaystyle[style.id] || { avgDamage: 1, avgRooms: 1 };
        const deltaDmg = Math.max(0, Math.round((avgDmg - baseStyle.avgDamage) * 10) / 10);
        const deltaRms = Math.max(0, Math.round((avgRms - baseStyle.avgRooms) * 10) / 10);
        const mult = baseStyle.avgDamage > 0 ? Math.max(1.0, Math.round((avgDmg / baseStyle.avgDamage) * 100) / 100) : 1.0;

        styleBreakdown[style.id] = { avgDmg, avgRms, deltaDmg, deltaRms, mult };

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

        totalAllDamage += styleDamage;
        totalAllRooms += styleRooms;
        totalAllRuns += styleRuns;
    }

    const overallAvgDamage = Math.round((totalAllDamage / totalAllRuns) * 10) / 10;
    const overallAvgRooms = Math.round((totalAllRooms / totalAllRuns) * 10) / 10;

    const deltaDamage = Math.max(0, Math.round((overallAvgDamage - baseline.avgDamage) * 10) / 10);
    const deltaDamagePct = baseline.avgDamage > 0 ? Math.max(0, Math.round((deltaDamage / baseline.avgDamage) * 100)) : 0;
    const deltaRooms = Math.max(0, Math.round((overallAvgRooms - baseline.avgRooms) * 10) / 10);
    const deltaRoomsPct = baseline.avgRooms > 0 ? Math.max(0, Math.round((deltaRooms / baseline.avgRooms) * 100)) : 0;

    // Расчёт Value Per Cast
    const itemDpc = {};
    const itemEdpc = {};
    const dpcDeltas = {};
    let bestSynergySkill = null;
    let maxSkillMult = 1.0;

    for (const sk of ALL_SKILLS) {
        const dpc = itemMetrics.skillCasts[sk] > 0
            ? Math.round((itemMetrics.skillDamage[sk] / itemMetrics.skillCasts[sk]) * 10) / 10
            : 0;
        const edpc = itemMetrics.skillCasts[sk] > 0
            ? Math.round((itemMetrics.skillDefense[sk] / itemMetrics.skillCasts[sk]) * 10) / 10
            : 0;

        itemDpc[sk] = dpc;
        itemEdpc[sk] = edpc;

        const baseVal = ["defend", "concentrate"].includes(sk) ? baseline.skillEdpc[sk] : baseline.skillDpc[sk];
        const curVal = ["defend", "concentrate"].includes(sk) ? edpc : dpc;
        dpcDeltas[sk] = Math.round((curVal - baseVal) * 10) / 10;

        if (baseVal > 0) {
            const mult = curVal / baseVal;
            if (mult > maxSkillMult && itemMetrics.skillCasts[sk] >= 10) {
                maxSkillMult = mult;
                bestSynergySkill = { skill: sk, mult: Math.round(mult * 100) / 100, delta: dpcDeltas[sk] };
            }
        }
    }

    const cost = itemDef.cost || null;
    const deltaDmgVal = deltaDamage;
    const deltaDmgPctVal = deltaDamagePct;
    const deltaRmsVal = deltaRooms;
    const deltaRmsPctVal = deltaRoomsPct;

    // Классификатор вердиктов по дальности выживания и прогрессу комнат
    let verdict = "Баланс";
    let icon = "✅";

    if (deltaRmsPctVal >= 80 || deltaRmsVal >= 2.5) {
        verdict = "Универсальная имба";
        icon = "🚨";
    } else if (cost && cost >= 20 && deltaRmsPctVal <= 15) {
        verdict = "Оверпрайс / Ловушка";
        icon = "💸";
    } else if (cost && cost <= 14 && cost > 0 && (deltaRmsPctVal / cost) >= 3.0 && deltaRmsPctVal >= 30) {
        verdict = "Сверхвыгодно (Высокий ROI)";
        icon = "💎";
    } else if (maxStyleMult >= 1.65 || (bestPlaystyle && bestPlaystyle.deltaRms >= 2.0)) {
        verdict = "Сломанная синергия";
        icon = "⚡";
    } else if (deltaRmsPctVal <= 8 && deltaRmsVal <= 0.25) {
        verdict = "Слабо / Мусор";
        icon = "💤";
    } else {
        verdict = "Баланс";
        icon = "✅";
    }

    const roi = cost && cost > 0
        ? Math.max(0, Math.round((deltaRmsPctVal / cost) * 10) / 10)
        : null;

    return {
        id: itemDef.id,
        name: itemDef.name,
        category: itemDef.category,
        cost: itemDef.cost ?? null,
        desc: itemDef.desc || "",
        roi,
        avgDamage: overallAvgDamage,
        deltaDamage: deltaDmgVal,
        deltaDamagePct: deltaDmgPctVal,
        avgRooms: overallAvgRooms,
        deltaRooms: deltaRmsVal,
        deltaRoomsPct: deltaRmsPctVal,
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
        const prefixA = a.id.replace(/\d+/g, "");
        const prefixB = b.id.replace(/\d+/g, "");
        if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
        const numA = parseInt(a.id.replace(/\D+/g, ""), 10) || 0;
        const numB = parseInt(b.id.replace(/\D+/g, ""), 10) || 0;
        return numA - numB;
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
function formatConsoleRow(res) {
    const dRms = `+${res.deltaRooms} (+${res.deltaRoomsPct}%)`;
    const dDmg = `+${res.deltaDamage}`;
    const costStr = res.cost !== null ? `${res.cost}G`.padEnd(6) : "—".padEnd(6);
    const roiStr = res.roi !== null ? `+${res.roi}`.padEnd(8) : "—".padEnd(8);
    const idPad = res.id.padEnd(5);
    const namePad = res.name.slice(0, 20).padEnd(21);
    const catPad = res.category.padEnd(10);
    const rmsPad = `${res.avgRooms} (${dRms})`.padEnd(22);
    const dmgPad = `${res.avgDamage} (${dDmg})`.padEnd(16);
    const bestStylePad = res.bestPlaystyle ? `${res.bestPlaystyle.name} (x${res.bestPlaystyle.mult})`.slice(0, 24).padEnd(25) : "-".padEnd(25);
    const verdPad = `${res.icon} ${res.verdict}`;

    return `${idPad} | ${namePad} | ${catPad} | ${costStr} | ${roiStr} | ${rmsPad} | ${dmgPad} | ${bestStylePad} | ${verdPad}`;
}

function generateMarkdownReport(results, baseline) {
    const reportPath = path.resolve("./docs/balance-report.md");
    let md = "";

    md += "# Автоматический отчёт баланса: Дальность комнат, стили атак и экономика\n\n";
    md += `* **Дата генерации:** ${new Date().toLocaleString("ru-RU")}\n`;
    md += `* **Конфигурация:** ${RUNS_PER_PLAYSTYLE} забегов на стиль, классы: ${CLASSES.join(", ")}\n`;
    md += `* **Стандартный полигон:** 20-комнатная лестница прогрессии (Склеп -> Топи -> Кузня -> Цитадель -> Бездна)\n`;
    md += `* **Базовая линия («голый» персонаж):** Комнат пройдено: **${baseline.avgRooms} / ${GAUNTLET_STEPS.length}.0**, Средний урон: **${baseline.avgDamage}**, Раундов прожито: **${baseline.avgTurns}**\n`;
    md += `* **Базовая отдача способностей (DPC / EDPC):** Fast: **${baseline.skillDpc.fast}**, Heavy: **${baseline.skillDpc.heavy}**, Pierce: **${baseline.skillDpc.pierce}**, Whirl: **${baseline.skillDpc.whirlwind}**, Def: **${baseline.skillEdpc.defend}**, Conc: **${baseline.skillEdpc.concentrate}**\n\n`;

    const imbaList = results.filter(r => r.verdict === "Универсальная имба");
    const superRoiList = results.filter(r => r.verdict === "Сверхвыгодно (Высокий ROI)");
    const overpriceList = results.filter(r => r.verdict === "Оверпрайс / Ловушка");
    const synergyList = results.filter(r => r.verdict === "Сломанная синергия");
    const weakList = results.filter(r => r.verdict === "Слабо / Мусор");

    md += "## 1. Сводка критических отклонений баланса\n\n";
    md += `* 🚨 **Универсальная имба (${imbaList.length}):** ${imbaList.map(r => `\`${r.id}\` **${r.name}** (+${r.deltaRoomsPct}% комнат, +${r.deltaRooms} комнат)`).join(", ") || "Нет"}\n`;
    md += `* 💎 **Сверхвыгодные предметы магазина (Высокий ROI, ${superRoiList.length}):** ${superRoiList.map(r => `\`${r.id}\` **${r.name}** (${r.cost}G, ROI: +${r.roi})`).join(", ") || "Нет"}\n`;
    md += `* 💸 **Оверпрайс / Ловушки для игрока (${overpriceList.length}):** ${overpriceList.map(r => `\`${r.id}\` **${r.name}** (${r.cost}G, +${r.deltaRoomsPct}% комнат)`).join(", ") || "Нет"}\n`;
    md += `* ⚡ **Мощные синергии стилей (${synergyList.length}):** ${synergyList.map(r => `\`${r.id}\` **${r.name}** (${r.bestPlaystyle ? r.bestPlaystyle.name + " x" + r.bestPlaystyle.mult : ""})`).join(", ") || "Нет"}\n`;
    md += `* 💤 **Слабый / Мёртвый груз (${weakList.length}):** ${weakList.map(r => `\`${r.id}\` ${r.name} (+${r.deltaRoomsPct}% комнат)`).join(", ") || "Нет"}\n\n`;

    const categories = [
        { key: "perks", title: "Перки (36)" },
        { key: "artifacts", title: "Артефакты (18)" },
        { key: "weapons", title: "Оружие (20)" },
        { key: "armors", title: "Броня (20)" },
        { key: "potions", title: "Зелья (10)" },
    ];

    for (const cat of categories) {
        const catResults = sortByIdNatural(results.filter(r => r.category === cat.key));
        if (catResults.length === 0) continue;

        md += `## 2. ${cat.title}\n\n`;
        md += "| ID | Название | Цена | Эффект | Комнаты | Δ Дальность | Урон забега | ROI (Комн/G) | Лучший стиль игры игрока | Вердикт |\n";
        md += "| :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- | :--- |\n";

        for (const r of catResults) {
            const costStr = r.cost !== null ? `${r.cost}G` : "— *(LvlUp)*";
            const roiStr = r.roi !== null ? `**+${r.roi}**` : "—";
            const dRmsStr = `+${r.deltaRooms} (+${r.deltaRoomsPct}%)`;
            const dDmgStr = `${r.avgDamage} (+${r.deltaDamage})`;
            const styleStr = r.bestPlaystyle ? `**${r.bestPlaystyle.name}** (x${r.bestPlaystyle.mult})` : "-";
            const descEscaped = r.desc.replace(/\|/g, "\\|");

            md += `| \`${r.id}\` | **${r.name}** | ${costStr} | ${descEscaped} | ${r.avgRooms} | **${dRmsStr}** | ${dDmgStr} | ${roiStr} | ${styleStr} | ${r.icon} ${r.verdict} |\n`;
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

const PERK_EXPECTED_PCT = 35;
const GOLD_EXPECTED_PCT_PER_G = 3.5;

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
    const normalizedScore = Math.max(0, Math.round((pct / PERK_EXPECTED_PCT) * 100));
    return calculateScoreHue(normalizedScore);
}

function calculateItemValueScore(id, pct, itemCostMap) {
    const cost = itemCostMap.get(id);
    const expected = cost === null || cost === undefined
        ? PERK_EXPECTED_PCT
        : cost * GOLD_EXPECTED_PCT_PER_G;
    return Math.max(0, Math.round((pct / expected) * 100));
}

function colorizeAuditMarkdown(simResults = null) {
    const auditPath = path.resolve("./docs/items-and-perks-balance.md");
    const reportPath = path.resolve("./docs/balance-report.md");

    if (!fs.existsSync(auditPath)) {
        console.warn(`[colorize] Файл не найден: ${auditPath}`);
        return;
    }

    const itemCostMap = new Map();
    DATA_PERKS.forEach(p => itemCostMap.set(p.id, null));
    DATA_ITEMS.weapons.forEach(w => itemCostMap.set(w.id, w.cost));
    (DATA_ITEMS.armors || DATA_ITEMS.armor || []).forEach(a => itemCostMap.set(a.id, a.cost));
    DATA_ITEMS.artifacts.forEach(art => itemCostMap.set(art.id, art.cost));
    DATA_ITEMS.potions.forEach(pot => itemCostMap.set(pot.id, pot.cost));

    const metrics = new Map();

    if (Array.isArray(simResults) && simResults.length > 0) {
        for (const r of simResults) {
            metrics.set(r.id, r.deltaRoomsPct || 0);
        }
    } else if (fs.existsSync(reportPath)) {
        const reportContent = fs.readFileSync(reportPath, "utf8");
        for (const line of reportContent.split(/\r?\n/)) {
            const m = line.match(/^\|\s*`([a-z0-9]+)`\s*\|\s*\*\*([^*]+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([0-9.]+)\s*\|\s*\*\*\+([0-9.]+)\s*\(\+?([0-9.]+)%\)\*\*/);
            if (m) {
                const id = m[1];
                const pct = parseFloat(m[7] || 0);
                metrics.set(id, pct);
            }
        }
    }

    const rawContent = fs.readFileSync(auditPath, "utf8");
    const lines = rawContent.split(/\r?\n/);

    let powerColIdx = -1;
    let rawColIdx = -1;
    let costColIdx = -1;
    let currentTableHasRaw = false;
    let modifiedCount = 0;
    const outputLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed.startsWith("|")) {
            const cols = trimmed.split("|").map(c => c.trim()).slice(1, -1);
            if (cols.includes("Оценка силы")) {
                currentTableHasRaw = cols.includes("Сырой прирост");
                costColIdx = cols.indexOf("Цена");
                if (!currentTableHasRaw) {
                    const pIdx = cols.indexOf("Оценка силы");
                    cols.splice(pIdx, 0, "Сырой прирост");
                    rawColIdx = pIdx;
                    powerColIdx = pIdx + 1;
                } else {
                    rawColIdx = cols.indexOf("Сырой прирост");
                    powerColIdx = cols.indexOf("Оценка силы");
                }
                outputLines.push(`| ${cols.join(" | ")} |`);
                continue;
            }
            if (trimmed.includes(":---")) {
                if (!currentTableHasRaw) {
                    cols.splice(rawColIdx, 0, ":---:");
                    outputLines.push(`| ${cols.join(" | ")} |`);
                } else {
                    outputLines.push(line);
                }
                continue;
            }

            const idMatch = cols[0] ? cols[0].match(/`([a-z0-9]+)`/) : null;
            if (idMatch && powerColIdx >= 0) {
                const id = idMatch[1];
                const cost = itemCostMap.get(id);
                const fallbackPct = cost ? cost * GOLD_EXPECTED_PCT_PER_G : PERK_EXPECTED_PCT;
                const pct = metrics.get(id) ?? fallbackPct;
                const score = calculateItemValueScore(id, pct, itemCostMap);

                const scoreHue = calculateScoreHue(score);
                const scoreHex = hslToHex(scoreHue, 85, 54);

                const rawHue = calculateRawPctHue(pct);
                const rawHex = hslToHex(rawHue, 85, 54);

                const rawCell = `<span style="color: ${rawHex}">**+${pct}%**</span>`;
                const scoreCell = `<span style="color: ${scoreHex}">**${score}**</span>`;

                if (costColIdx >= 0 && cost !== null && cost !== undefined) {
                    cols[costColIdx] = String(cost);
                }

                if (!currentTableHasRaw) {
                    cols[powerColIdx - 1] = scoreCell;
                    cols.splice(rawColIdx, 0, rawCell);
                } else {
                    cols[rawColIdx] = rawCell;
                    cols[powerColIdx] = scoreCell;
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
        "> **Шкала оценок эффективности (Две шкалы):**",
        "> 1. **Сырой прирост (растянутая шкала прироста дальности комнат от $+0\\%$ до $+180\\%+$):**  ",
        `>    <span style="color: ${hslToHex(calculateRawPctHue(0), 85, 54)}">**+0% (база)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(35), 85, 54)}">**+35% (норма)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(56), 85, 54)}">**+56% (сильно)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(75), 85, 54)}">**+75% (алый)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(125), 85, 54)}">**+125% (мощно)**</span> $\\to$ <span style="color: ${hslToHex(calculateRawPctHue(180), 85, 54)}">**+180%+ (пурпур)**</span>`,
        "> 2. **Оценка силы / Value Score (справедливая ценность к стоимости, эталон — 100):**  ",
        ">    *Ориентир 100 означает: $+3.5\\%$ дальности на $1G$ цены предмета, либо $+35\\%$ дальности на слот бесплатного перка (для перков обе колонки окрашены идентично).*  ",
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
    console.log(`🎨 Добавлена колонка Сырой прирост и обновлен Value Score (${modifiedCount} шт.) в ${auditPath}`);
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
    console.log("==========================================================================================");
    console.log("🎮 Headless Balance Simulator — Paper-Lite (Gauntlet Survival & Economy Progression)");
    console.log(`Параметры: запусков/стиль=${RUNS_PER_PLAYSTYLE}, классы=[${CLASSES.join(", ")}], фильтр ID=${targetIdArg || "все"}`);
    console.log("==========================================================================================\n");

    const baseline = calculateFloorBaseline();
    const itemPool = buildItemPool();

    console.log(`\nЗапуск оценки пула сущностей: ${itemPool.length} шт...\n`);
    console.log("ID    | Название                | Категория  | Цена   | ROI    | Комнаты (Δ)            | Урон (Δ)         | Лучший стиль игры (xMult)   | Вердикт");
    console.log("------+-------------------------+------------+--------+--------+------------------------+------------------+-----------------------------+-----------------------");

    const results = [];
    for (const item of itemPool) {
        try {
            const res = evaluateFloorItem(item, baseline);
            results.push(res);
            console.log(formatConsoleRow(res));
        } catch (err) {
            console.error(`❌ Ошибка симуляции для ${item.id} (${item.name}):`, err.message);
        }
    }

    const elapsed = Math.round((Date.now() - startTime) / 100) / 10;
    console.log("------+-------------------------+------------+------------------------+----------------+-----------------------------+-----------------------");
    console.log(`\n✨ Симуляция завершена за ${elapsed}s. Обработано сущностей: ${results.length}/${itemPool.length}.`);

    if (!skipReport && results.length > 0) {
        generateMarkdownReport(results, baseline);
        colorizeAuditMarkdown(results);
    }
}

main().catch(err => {
    console.error("Критический сбой симулятора:", err);
    process.exit(1);
});
