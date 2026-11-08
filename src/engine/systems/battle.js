import { RNG } from "../../utils/rng.js";
import { GAME_DATA } from "../../data/index.js";
import { playSound } from "../../utils/audio.js";

export function createEnemyInstance(game, enemyKey, applyMutation = false) {
    const template = GAME_DATA.enemies[enemyKey];
    const e = JSON.parse(JSON.stringify(template));

    const depthMult = 1 + (game.floor * 0.22) + (game.room * 0.05);
    const atkDepthBonus = Math.floor(game.floor * 1.2 + game.room / 4);

    e.hp = Math.round(e.hp * depthMult);
    e.currentHp = e.hp;
    e.shield = e.shield || 0;
    e.spikes = e.spikes || 0;
    e.poison = 0;
    e.bleed = 0;
    e.regen = 0;
    e.atkBonus = atkDepthBonus;
    e.poisonOnHit = 0;
    e.bleedOnHit = 0;
    e.patternIndex = 0;

    if (applyMutation && !e.isBoss) {
        const mut = RNG.choice(GAME_DATA.mutations);
        e.name = `${mut.prefix} ${e.name}`;
        e.hp += Math.round((mut.hpBonus || 0) * depthMult);
        e.currentHp = e.hp;
        e.def += mut.defBonus || 0;
        e.atkBonus += mut.atkBonus || 0;
        e.xp += mut.xpBonus || 2;
        if (mut.spikes) e.spikes += mut.spikes;
        if (mut.regen) e.regen += mut.regen;
        if (mut.poisonOnHit) e.poisonOnHit += mut.poisonOnHit;
        if (mut.bleedOnHit) e.bleedOnHit += mut.bleedOnHit;
    }
    return e;
}

export function setupBattle(game, mode = "normal") {
    game.enemies = [];
    game.isProcessingTurn = false;
    game.battleFinished = false;
    game.enrageAnnounced = false;
    game._victorySoundPlayed = false;
    game.battleRewards = { xp: 0, gold: 0, items: [] };

    const floorData = GAME_DATA.floors[game.floor];

    if (mode === "boss") {
        playSound("bossEncounter");
        game.enemies.push(createEnemyInstance(game, floorData.boss));
        game.battleLog = ["👑 БИТВА С БОССОМ ЭТАЖА!"];
    } else if (mode === "elite") {
        playSound("battleStart");
        const eliteKey = RNG.choice(floorData.elite);
        game.enemies.push(createEnemyInstance(game, eliteKey, game.floor >= 2));
        game.battleLog = ["💀 Встречен Элитный противник!"];
    } else if (mode === "mimic") {
        playSound("battleStart");
        game.enemies.push(createEnemyInstance(game, "mimic", game.floor >= 1));
        game.battleLog = ["📦 Сундук оказался Алчным Мимиком!"];
    } else {
        playSound("battleStart");
        let budget = Math.min(7, 2 + Math.floor(game.room / 3) + game.floor);
        let attempts = 0;
        while (budget > 0 && game.enemies.length < 3 && attempts < 18) {
            attempts++;
            const enemyKey = RNG.choice(floorData.enemies);
            const template = GAME_DATA.enemies[enemyKey];
            if (template.weight <= budget) {
                const mutate = (budget - template.weight >= 1 && (game.floor >= 1 || game.room >= 6) && RNG.chance(40));
                game.enemies.push(createEnemyInstance(game, enemyKey, mutate));
                budget -= (template.weight + (mutate ? 1 : 0));
            }
        }
        if (game.enemies.length === 0) {
            game.enemies.push(createEnemyInstance(game, floorData.enemies[0]));
        }
        game.battleLog = [`⚔️ Бой начался! Комната #${game.room}.`];
    }

    game.selectedTargetIndex = 0;
    game.battleTurn = 1;
    game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en);
    if (game.player.hasArtifact("art2")) {
        game.player.en += 2;
    }
    if (game.player.perks.includes("p33")) {
        game.player.en += game.enemies.length;
    }

    game.player.shield = 0;
    if (game.player.perks.includes("p6")) game.player.addShield(6);
    if (game.player.hasArtifact("art13")) game.player.addShield(8);
    if (game.player.classId === "engineer") game.player.addShield(5);
    if (game.player.inventory.armor && game.player.inventory.armor.startShield) {
        game.player.addShield(game.player.inventory.armor.startShield);
    }
    if (game.player.hasArtifact("art6")) {
        game.player.addShield(6);
        game.enemies.forEach(en => { en.poison += 1; });
    }
    if (game.player.perks.includes("p27")) {
        game.enemies.forEach(en => { en.poison += 2; });
    }

    game.player.tempSpikes = 0;
    game.player.poison = 0;
    game.player.bleed = 0;
    game.player.forceCritNext = false;
    game.player.damageReduction50 = false;
    game.player.concentrateBonus = game.player.concentrateBonus || 0;
    game.player.cooldowns = { defend: 0, heavy: 0, pierce: 0, whirlwind: 0, concentrate: 0 };

    game.state = "BATTLE";
}

export function ensureValidTarget(game) {
    if (game.enemies[game.selectedTargetIndex] && game.enemies[game.selectedTargetIndex].currentHp > 0) {
        return game.selectedTargetIndex;
    }
    const firstAlive = game.enemies.findIndex(e => e.currentHp > 0);
    game.selectedTargetIndex = firstAlive !== -1 ? firstAlive : 0;
    return game.selectedTargetIndex;
}

export function canAffordEn(game, cost) {
    if (game.player.en >= cost) return true;
    if (game.player.classId === "reaper" && game.player.hp > cost * 3) return true;
    return false;
}

export function canUseSkill(game, skillName, enCost = 0) {
    if (game.isProcessingTurn || game.battleFinished) return false;
    if ((game.player.cooldowns[skillName] || 0) > 0) return false;
    return canAffordEn(game, enCost);
}

export function spendEn(game, cost) {
    if (game.player.en >= cost) {
        game.player.en -= cost;
        return true;
    }
    if (game.player.classId === "reaper" && game.player.hp > cost * 3) {
        game.player.hp -= cost * 3;
        game.battleLog.unshift(`🩸 Жнец платит кровью (-${cost * 3} HP)!`);
        return true;
    }
    return false;
}

export function tickCooldowns(game) {
    for (let k in game.player.cooldowns) {
        if (game.player.cooldowns[k] > 0) {
            game.player.cooldowns[k]--;
        }
    }
}

export function usePotion(game, potIndex, onStepRender) {
    if (game.isProcessingTurn) return;
    const pot = game.player.inventory.potions[potIndex];
    if (!pot) return;
    if (game.state !== "BATTLE" && !pot.canUseOnMap) return;

    const alchBonus = game.player.perks.includes("p21") ? 6 : 0;

    if (pot.id === "pot1") {
        game.player.heal(12 + alchBonus);
        game.player.poison = 0;
        game.player.bleed = 0;
        game.addBattleFx({ target: "player", type: "heal", value: 12 + alchBonus });
        if (game.state === "BATTLE") game.battleLog.unshift(`🧪 Зелье Исцеления (+${12 + alchBonus} HP, очищение).`);
    } else if (pot.id === "pot2") {
        game.player.en += 3;
        game.player.cooldowns = { defend: 0, heavy: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
        game.battleLog.unshift("🧪 Эликсир Энергии (+3 EN, сброс перезарядок!).");
    } else if (pot.id === "pot3") {
        game.battleLog.unshift("🧪 Взрывная Колба (11 чистого урона всем)!");
        game.enemies.forEach(en => {
            if (en.currentHp > 0) dealDamageToEnemy(game, en, 11, true, false);
        });
    } else if (pot.id === "pot4") {
        game.player.addShield(10);
        game.addBattleFx({ target: "player", type: "shield", value: 10 });
        game.battleLog.unshift("🧪 Каменный Отвар (+10 Щита).");
    } else if (pot.id === "pot5") {
        game.enemies.forEach(en => {
            if (en.currentHp > 0) {
                en.poison += 4;
                en.bleed += 2;
                game.addBattleFx({ target: "enemy", enemy: en, type: "poison", value: 4 });
                game.addBattleFx({ target: "enemy", enemy: en, type: "bleed", value: 2 });
            }
        });
        game.battleLog.unshift("🧪 Ядовитый Флакон (+4 Яда и +2 Кровотока всем)!");
    } else if (pot.id === "pot6") {
        game.player.heal(8 + alchBonus);
        game.player.concentrateBonus += 4;
        game.addBattleFx({ target: "player", type: "heal", value: 8 + alchBonus });
        if (game.state === "BATTLE") game.battleLog.unshift(`🧪 Кровь Дракона (+${8 + alchBonus} HP, +4 к след. атаке).`);
    } else if (pot.id === "pot7") {
        game.player.addShield(6);
        game.player.tempSpikes += 4;
        game.addBattleFx({ target: "player", type: "shield", value: 6 });
        game.battleLog.unshift("🧪 Эликсир Железной Кожи (+6 Щита, +4 Шипов).");
    } else if (pot.id === "pot8") {
        game.player.heal(6 + alchBonus);
        game.player.poison = 0;
        game.player.bleed = 0;
        game.addBattleFx({ target: "player", type: "heal", value: 6 + alchBonus });
        if (game.state === "BATTLE") {
            game.player.addShield(5);
            game.addBattleFx({ target: "player", type: "shield", value: 5 });
            game.battleLog.unshift(`🧪 Очищающий Бальзам (+${6 + alchBonus} HP, очищение, +5 Щита).`);
        }
    } else if (pot.id === "pot9") {
        game.enemies.forEach(en => {
            if (en.currentHp > 0) {
                en.shield = 0;
                en.def = Math.max(0, en.def - 2);
            }
        });
        game.battleLog.unshift("🧪 Бутыль с Кислотой (снятие Щитов и -2 DEF всем врагам)!");
    } else if (pot.id === "pot10") {
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 2);
        game.player.forceCritNext = true;
        game.battleLog.unshift("🧪 Флакон Концентрации (+2 EN, гарантированный КРИТ на след. удар)!");
    }

    if (game.state === "BATTLE" && game.player.perks.includes("p36")) {
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
    }

    game.player.inventory.potions.splice(potIndex, 1);
    if (game.state === "BATTLE") {
        ensureValidTarget(game);
        if (handlePotentialBattleEnd(game, onStepRender)) return;
    }
    game.saveGame("autosave");
    if (onStepRender) onStepRender();
}

export function discardPotion(game, potIndex) {
    game.player.inventory.potions.splice(potIndex, 1);
    game.saveGame("autosave");
}

export function playerAction(game, actionType, onStepRender) {
    if (game.state !== "BATTLE" || game.isProcessingTurn || game.battleFinished) return;
    ensureValidTarget(game);
    const target = game.enemies[game.selectedTargetIndex];

    if (actionType === "defend" && !canUseSkill(game, "defend", 0)) {
        playSound("error");
        return;
    }
    if (actionType === "heavy" && !canUseSkill(game, "heavy", 1)) {
        playSound("error");
        return;
    }
    if (actionType === "pierce" && !canUseSkill(game, "pierce", 2)) {
        playSound("error");
        return;
    }
    if (actionType === "whirlwind" && !canUseSkill(game, "whirlwind", 2)) {
        playSound("error");
        return;
    }
    if (actionType === "concentrate" && !canUseSkill(game, "concentrate", 0)) {
        playSound("error");
        return;
    }

    game.player.tempSpikes = 0;

    const forceAssassinCrit = (game.player.classId === "assassin" && game.battleTurn === 1);
    const forceCrit = forceAssassinCrit || Boolean(game.player.forceCritNext);
    const ignoreAllDef = forceAssassinCrit;
    let atkVal = game.player.getTotalAtk();
    if (game.player.hasArtifact("art18")) atkVal += 3;
    if (game.battleTurn === 1 && game.player.perks.includes("p13")) atkVal += 5;

    const cdReduction = game.player.perks.includes("p24") ? 1 : 0;
    let extraTurn = false;

    if (actionType === "fast") {
        if (!target || target.currentHp <= 0) return;
        game.player.forceCritNext = false;
        const isCrit = game.player.rollCrit(10, forceCrit);
        let dmg = atkVal + RNG.range(1, 4);
        if (isCrit) {
            const critMult = game.player.perks.includes("p35") ? 3.0 : 1.65;
            dmg = Math.round(dmg * critMult);
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
            if (game.player.perks.includes("p11")) {
                game.player.heal(3);
                game.addBattleFx({ target: "player", type: "heal", value: 3 });
            }
            if (game.player.perks.includes("p32")) target.def = Math.max(0, target.def - 1);
        }
        applyWeaponEffects(game, target);
        if (game.player.perks.includes("p7")) {
            target.poison += 1;
            game.addBattleFx({ target: "enemy", enemy: target, type: "poison", value: 1 });
        }
        const dealt = dealDamageToEnemy(game, target, dmg, ignoreAllDef, isCrit);
        checkEnemySpikes(game, target);
        game.battleLog.unshift(`⚔️ Быстрый удар по ${target.name}${isCrit ? " (КРИТ!)" : ""}: ${dealt} урона.`);
        game.player.concentrateBonus = 0;

    } else if (actionType === "defend") {
        let shieldGain = 3 + game.player.getTotalDef() + (game.player.classId === "crusader" ? 3 : 0) + (game.player.perks.includes("p31") ? 3 : 0);
        if (game.player.classId === "crusader") game.player.tempSpikes += 3;
        if (game.player.perks.includes("p14")) game.player.tempSpikes += 3;
        game.player.addShield(shieldGain);
        game.addBattleFx({ target: "player", type: "shield", value: shieldGain });
        game.player.damageReduction50 = true;
        game.player.bleed = 0;
        game.player.poison = 0;
        const defCd = Math.max(1, 3 - (game.player.perks.includes("p31") ? 1 : 0));
        game.player.cooldowns.defend = defCd;
        game.battleLog.unshift(`🛡️ Глухая защита (+${shieldGain} Щит, -50% урон, очищение).`);

    } else if (actionType === "heavy") {
        if (!target || target.currentHp <= 0) return;
        if (!spendEn(game, 1)) return;
        playSound("heavy");
        if (game.player.perks.includes("p15")) target.shield = 0;
        const execDmg = Math.round(2 + atkVal * 0.5) + (game.player.perks.includes("p1") ? 4 : 0);
        const hpBefore = target.currentHp;
        target.currentHp = Math.max(0, target.currentHp - execDmg);
        const dealtExec = hpBefore - target.currentHp;
        game.addBattleFx({
            target: "enemy",
            enemy: target,
            type: "crit",
            value: dealtExec,
            isCrit: true,
        });
        if (target.currentHp <= 0) {
            onEnemyKilled(game, target);
            game.battleLog.unshift(`💀 Казнь ${target.name}: ${hpBefore} чистого урона — ДОБИТ! Ход не тратится!`);
            extraTurn = true;
        } else {
            game.battleLog.unshift(`💀 Казнь ${target.name}: ${execDmg} чистого урона.`);
        }
        game.player.cooldowns.heavy = Math.max(1, 3 - cdReduction);
        game.player.concentrateBonus = 0;

    } else if (actionType === "pierce") {
        if (!target || target.currentHp <= 0) return;
        if (!spendEn(game, 2)) return;
        playSound("pierce");
        if (game.player.perks.includes("p15")) target.shield = 0;
        const prcRaw = atkVal + RNG.range(3, 7);
        const prcDef = ignoreAllDef ? 0 : Math.max(0, target.def - (game.player.hasArtifact("art3") ? 1 : 0));
        const prcActual = Math.max(1, prcRaw - prcDef);
        if (game.player.perks.includes("p8")) {
            target.bleed += 2;
            game.addBattleFx({ target: "enemy", enemy: target, type: "bleed", value: 2 });
        }
        target.currentHp = Math.max(0, target.currentHp - prcActual);
        game.addBattleFx({
            target: "enemy",
            enemy: target,
            type: "damage",
            value: prcActual,
        });
        if (prcActual > 0 && game.player.hasArtifact("art17")) {
            game.player.heal(1);
            game.addBattleFx({ target: "player", type: "heal", value: 1 });
        }
        if (target.currentHp <= 0) onEnemyKilled(game, target);
        applyWeaponEffects(game, target);
        checkEnemySpikes(game, target);
        game.player.cooldowns.pierce = Math.max(1, 3 - cdReduction);
        game.battleLog.unshift(`🗡️ Пробитие ${target.name} (сквозь щит): ${prcActual} урона!`);
        game.player.concentrateBonus = 0;

    } else if (actionType === "whirlwind") {
        if (!spendEn(game, 2)) return;
        playSound("whirlwind");
        const isArcanist = game.player.classId === "arcanist";
        let dmg = Math.round(atkVal * 0.75) + (isArcanist ? RNG.range(3, 6) : RNG.range(1, 4));
        game.player.cooldowns.whirlwind = Math.max(1, 3 - cdReduction);
        game.battleLog.unshift(`🌪️ ${isArcanist ? "Огненный залп" : "Круговой вихрь"} по всем (${dmg} базы)!`);
        game.enemies.forEach(en => {
            if (en.currentHp > 0) {
                applyWeaponEffects(game, en);
                if (game.player.perks.includes("p7")) {
                    en.poison += 1;
                    game.addBattleFx({ target: "enemy", enemy: en, type: "poison", value: 1 });
                }
                dealDamageToEnemy(game, en, dmg, isArcanist || ignoreAllDef, false);
            }
        });
        game.player.concentrateBonus = 0;

    } else if (actionType === "concentrate") {
        playSound("concentrate");
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 2);
        let healAmt = game.player.perks.includes("p9") ? 7 : 4;
        game.player.heal(healAmt);
        game.addBattleFx({ target: "player", type: "heal", value: healAmt });
        for (const skillKey of Object.keys(game.player.cooldowns)) {
            if (game.player.cooldowns[skillKey] > 0) {
                game.player.cooldowns[skillKey]--;
            }
        }
        if (game.player.hasArtifact("art10")) {
            game.player.addShield(4);
            game.addBattleFx({ target: "player", type: "shield", value: 4 });
        }
        game.player.cooldowns.concentrate = 4;
        game.battleLog.unshift(`🧘 Концентрация (+2 EN, +${healAmt} HP, -1 ход ко всем КД).`);
    }

    if (["fast", "heavy", "pierce", "whirlwind"].includes(actionType) && game.player.bleed > 0) {
        game.player.hp = Math.max(0, game.player.hp - game.player.bleed);
        game.addBattleFx({ target: "player", type: "bleedDamage", value: game.player.bleed });
        game.battleLog.unshift(`🩸 Кровотечение отнимает у вас ${game.player.bleed} HP!`);
    }

    ensureValidTarget(game);
    if (handlePotentialBattleEnd(game, onStepRender)) {
        return;
    }

    if (extraTurn) {
        if (onStepRender) onStepRender();
        game.saveGame("autosave");
        return;
    }

    tickCooldowns(game);
    game.isProcessingTurn = true;
    if (onStepRender) onStepRender();
    runEnemyTurnSequence(game, onStepRender);
}

export function runEnemyTurnSequence(game, onStepRender) {
    const steps = [];

    steps.push(() => {
        if (game.player.poison > 0) {
            const pDmg = game.player.takeDamage(game.player.poison, true);
            game.addBattleFx({ target: "player", type: "poisonDamage", value: pDmg });
            game.battleLog.unshift(`☠️ Яд наносит вам ${game.player.poison} урона.`);
            game.player.poison--;
        }
        const enrageBonus = game.battleTurn >= 10 ? (game.battleTurn - 9) * 2 : 0;
        if (enrageBonus > 0) {
            game.battleLog.unshift(`🔥 Ярость Бездны (Раунд ${game.battleTurn}): враги получают +${enrageBonus} к урону!`);
        }
    });

    game.enemies.forEach((en) => {
        if (en.currentHp <= 0) return;
        steps.push(() => {
            if (en.currentHp <= 0 || game.player.hp <= 0) return;
            executeSingleEnemyTurn(game, en);
        });
    });

    steps.push(() => {
        if (game.player.hp <= 0) return;

        if (game.player.classId === "engineer") {
            const aliveEnemies = game.enemies.filter(e => e.currentHp > 0);
            if (aliveEnemies.length > 0) {
                const rndEn = RNG.choice(aliveEnemies);
                dealDamageToEnemy(game, rndEn, 3, true, false);
                game.battleLog.unshift(`⚙️ Авто-турель стреляет по ${rndEn.name} (3 чистого урона).`);
            }
        }

        if (game.player.hasArtifact("art7")) {
            game.player.heal(2);
            game.addBattleFx({ target: "player", type: "heal", value: 2 });
        }
        if (game.player.hasArtifact("art8")) {
            game.enemies.forEach(en => {
                if (en.currentHp > 0) dealDamageToEnemy(game, en, 3, true, false);
            });
        }

        if (game.player.classId === "arcanist") {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
        }
        game.player.damageReduction50 = false;
        game.battleTurn++;
        if (game.battleTurn >= 10 && !game.enrageAnnounced) {
            game.enrageAnnounced = true;
            game.addBattleFx({
                target: "player",
                type: "enrageAnnounce",
                text: "🔥 Враги стали сильнее!",
            });
        }
        if (game.player.perks.includes("p18") && game.battleTurn % 3 === 0) {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 2);
            game.battleLog.unshift("⚡ Боевой транс даёт +2 EN!");
        }
    });

    let idx = 0;
    const nextStep = () => {
        if (idx < steps.length) {
            steps[idx]();
            idx++;
            ensureValidTarget(game);

            if (game.player.hp <= 0) {
                game.isProcessingTurn = false;
                game.calculateSouls();
                game.state = "GAMEOVER";
                if (onStepRender) onStepRender();
                return;
            }
            if (handlePotentialBattleEnd(game, onStepRender)) {
                return;
            }
            if (onStepRender) onStepRender();
            const stepDelay = game.enemies.some(e => e.isDying) ? 550 : 420;
            setTimeout(nextStep, stepDelay);
        } else {
            game.isProcessingTurn = false;
            if (onStepRender) onStepRender();
            game.saveGame("autosave");
        }
    };

    const initialDelay = game.enemies.some(e => e.isDying) ? 550 : 380;
    setTimeout(nextStep, initialDelay);
}

export function executeSingleEnemyTurn(game, en) {
    const enrageBonus = game.battleTurn >= 10 ? (game.battleTurn - 9) * 2 : 0;

    const hitPlayer = (val, isPierce = false) => {
        const shieldBefore = game.player.shield;
        const taken = game.player.takeDamage(val, isPierce);
        const shieldLost = Math.max(0, shieldBefore - game.player.shield);
        game.addBattleFx({
            target: "player",
            type: "damage",
            value: taken,
            shieldValue: shieldLost,
            isBoss: Boolean(en.isBoss),
        });
        return taken;
    };

    if (en.poison > 0) {
        const pDmg = en.poison + (game.player.perks.includes("p16") ? 2 : 0);
        en.currentHp = Math.max(0, en.currentHp - pDmg);
        game.addBattleFx({ target: "enemy", enemy: en, type: "poisonDamage", value: pDmg });
        game.battleLog.unshift(`☠️ ${en.name} теряет ${pDmg} HP от яда.`);
        en.poison--;
        if (en.currentHp <= 0) {
            onEnemyKilled(game, en);
            return;
        }
    }

    if (en.regen > 0) {
        const hpBefore = en.currentHp;
        en.currentHp = Math.min(en.hp, en.currentHp + en.regen);
        const healed = en.currentHp - hpBefore;
        if (healed > 0) {
            game.addBattleFx({ target: "enemy", enemy: en, type: "heal", value: healed });
        }
    }

    const patList = en.pattern || [{ type: "attack", val: 4, text: "Атака" }];
    const patIndex = (en.patternIndex || 0) % patList.length;
    const pat = patList[patIndex];
    en.patternIndex = (en.patternIndex || 0) + 1;

    if (en.bleed > 0 && pat.val > 0) {
        en.currentHp = Math.max(0, en.currentHp - en.bleed);
        game.addBattleFx({ target: "enemy", enemy: en, type: "bleedDamage", value: en.bleed });
        game.battleLog.unshift(`🩸 ${en.name} истекает кровью (-${en.bleed} HP).`);
        if (en.currentHp <= 0) {
            onEnemyKilled(game, en);
            return;
        }
    }

    const baseVal = pat.val ? RNG.spread(pat.val + (en.atkBonus || 0) + enrageBonus, 0.15) : 0;

    if (pat.type === "attack") {
        const taken = hitPlayer(baseVal);
        game.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> вам ${taken} урона.`);
    } else if (pat.type === "pierce") {
        const taken = hitPlayer(baseVal, true);
        game.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> вам ${taken} чистого урона!`);
    } else if (pat.type === "attackPoison") {
        const taken = hitPlayer(baseVal);
        const pAmt = pat.poison || 1;
        game.player.poison += pAmt;
        game.addBattleFx({ target: "player", type: "poison", value: pAmt });
        game.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> ${taken} урона и Яд!`);
    } else if (pat.type === "attackBleed") {
        const taken = hitPlayer(baseVal);
        const bAmt = pat.bleed || 1;
        game.player.bleed += bAmt;
        game.addBattleFx({ target: "player", type: "bleed", value: bAmt });
        game.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> ${taken} урона и Кровоток!`);
    } else if (pat.type === "defendAttack") {
        en.shield += (pat.shield || 4);
        game.addBattleFx({ target: "enemy", enemy: en, type: "shield", value: pat.shield || 4 });
        const taken = hitPlayer(baseVal);
        game.battleLog.unshift(`👹 ${en.name}: +${pat.shield || 4} Щит и удар на ${taken} урона.`);
    } else if (pat.type === "vampire") {
        const taken = hitPlayer(baseVal);
        en.currentHp = Math.min(en.hp, en.currentHp + taken);
        if (taken > 0) {
            game.addBattleFx({ target: "enemy", enemy: en, type: "heal", value: taken });
        }
        game.battleLog.unshift(`👹 ${en.name}: укус на ${taken} урона и лечение!`);
    } else if (pat.type === "drainEn") {
        const taken = hitPlayer(baseVal);
        game.player.en = Math.max(0, game.player.en - 1);
        game.battleLog.unshift(`👹 ${en.name}: ${taken} урона и -1 Энергия!`);
    } else if (pat.type === "heal" || pat.type === "shieldHeal") {
        if (pat.val) {
            en.currentHp = Math.min(en.hp, en.currentHp + pat.val);
            game.addBattleFx({ target: "enemy", enemy: en, type: "heal", value: pat.val });
        }
        if (pat.shield) {
            en.shield += pat.shield;
            game.addBattleFx({ target: "enemy", enemy: en, type: "shield", value: pat.shield });
        }
        game.battleLog.unshift(`👹 ${en.name}: ${pat.text}.`);
    } else if (pat.type === "charge") {
        game.battleLog.unshift(`⚠️ ${en.name}: ${pat.text}`);
    }

    if (pat.val > 0) {
        if (en.poisonOnHit) {
            game.player.poison += en.poisonOnHit;
            game.addBattleFx({ target: "player", type: "poison", value: en.poisonOnHit });
        }
        if (en.bleedOnHit) {
            game.player.bleed += en.bleedOnHit;
            game.addBattleFx({ target: "player", type: "bleed", value: en.bleedOnHit });
        }
        if (game.player.hasArtifact("art15") && en.currentHp > 0) {
            en.poison += 2;
            game.addBattleFx({ target: "enemy", enemy: en, type: "poison", value: 2 });
        }
    }

    if (pat.val > 0 && game.player.getTotalSpikes() > 0 && en.currentHp > 0) {
        let spk = game.player.getTotalSpikes();
        if (game.player.perks.includes("p34") && en.bleed > 0) spk *= 2;
        en.currentHp = Math.max(0, en.currentHp - spk);
        game.addBattleFx({ target: "enemy", enemy: en, type: "spikesDamage", value: spk });
        game.battleLog.unshift(`🌵 Ваши Шипы ранят ${en.name} на ${spk} HP!`);
        if (en.currentHp <= 0) onEnemyKilled(game, en);
    }
}

export function checkEnemySpikes(game, enemy) {
    if (enemy && enemy.spikes > 0) {
        const shieldBefore = game.player.shield;
        const taken = game.player.takeDamage(enemy.spikes, true);
        const shieldLost = Math.max(0, shieldBefore - game.player.shield);
        game.addBattleFx({
            target: "player",
            type: "spikesDamage",
            value: taken,
            shieldValue: shieldLost,
        });
        game.battleLog.unshift(`🌵 Шипы врага (${enemy.name}) ранят вас на ${enemy.spikes} HP!`);
    }
}

export function applyWeaponEffects(game, enemy) {
    const w = game.player.inventory.weapon;
    if (!w) return;
    if (w.poison) {
        enemy.poison += w.poison;
        game.addBattleFx({ target: "enemy", enemy, type: "poison", value: w.poison });
    }
    if (w.bleed) {
        enemy.bleed += w.bleed;
        game.addBattleFx({ target: "enemy", enemy, type: "bleed", value: w.bleed });
    }
}

export function dealDamageToEnemy(game, enemy, amount, ignoreDef = false, isCrit = false) {
    if (game.player.perks.includes("p3") && enemy.currentHp <= enemy.hp / 2) {
        amount += 4;
    }
    let enemyDef = ignoreDef ? 0 : enemy.def;
    if (!ignoreDef && game.player.hasArtifact("art3")) {
        enemyDef = Math.max(0, enemyDef - 1);
    }

    let actual = ignoreDef ? amount : Math.max(1, amount - enemyDef);
    let shieldAbsorbed = 0;
    if (enemy.shield > 0) {
        if (enemy.shield >= actual) {
            shieldAbsorbed = actual;
            enemy.shield -= actual;
            actual = 0;
        } else {
            shieldAbsorbed = enemy.shield;
            actual -= enemy.shield;
            enemy.shield = 0;
        }
    }
    enemy.currentHp = Math.max(0, enemy.currentHp - actual);
    game.addBattleFx({
        target: "enemy",
        enemy,
        type: isCrit ? "crit" : "damage",
        value: actual,
        shieldValue: shieldAbsorbed,
        isCrit,
    });
    if (actual > 0 && game.player.hasArtifact("art17")) {
        game.player.heal(1);
        game.addBattleFx({ target: "player", type: "heal", value: 1 });
    }
    if (enemy.currentHp <= 0) {
        onEnemyKilled(game, enemy);
    }
    return actual;
}

export function onEnemyKilled(game, enemy) {
    if (enemy._killed) return;
    enemy._killed = true;
    enemy.isDying = true;
    playSound("death");
    setTimeout(() => {
        enemy.isDying = false;
    }, 550);

    let xpGain = enemy.xp;
    if (game.player.hasArtifact("art12")) xpGain = Math.ceil(xpGain * 1.25);
    let goldGain = RNG.range(2, 5) + game.floor * 2;
    if ((enemy.isElite || enemy.isBoss) && game.player.perks.includes("p25")) {
        xpGain += 5;
        goldGain += 8;
    }

    game.player.xp += xpGain;
    game.player.totalRunXp += xpGain;
    game.player.gold += goldGain;
    game.battleRewards.xp += xpGain;
    game.battleRewards.gold += goldGain;

    game.battleLog.unshift(`💀 ${enemy.name} повержен! (+${xpGain} XP, +${goldGain}G)`);

    if (game.player.classId === "reaper") game.player.heal(3);
    if (game.player.hasArtifact("art1")) game.player.heal(2);
    if (game.player.inventory.weapon && game.player.inventory.weapon.vamp) {
        game.player.heal(game.player.inventory.weapon.vamp);
    }
    if (game.player.perks.includes("p22")) {
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
    }
    if (game.player.perks.includes("p17") && (enemy.poison > 0 || enemy.bleed > 0)) {
        game.player.heal(3);
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
    }
    if (game.player.perks.includes("p30") && enemy.poison > 0) {
        game.enemies.forEach(en => {
            if (en !== enemy && en.currentHp > 0) {
                dealDamageToEnemy(game, en, 5, true);
            }
        });
        game.battleLog.unshift("💥 Токсичный взрыв наносит 5 чистого урона всем врагам!");
    }
}

export function handlePotentialBattleEnd(game, onStepRender) {
    if (game.battleFinished) return true;
    const allDead = game.enemies.every(en => en.currentHp <= 0);
    if (!allDead) return false;

    const hasDying = game.enemies.some(en => en.isDying && !en.deathAnimRendered);
    if (hasDying) {
        game.isProcessingTurn = true;
        if (onStepRender) onStepRender();
        setTimeout(() => {
            game.enemies.forEach(en => {
                en.isDying = false;
            });
            checkBattleEnd(game);
            if (onStepRender) onStepRender();
            game.saveGame("autosave");
        }, 550);
        return true;
    }

    checkBattleEnd(game);
    if (onStepRender) onStepRender();
    game.saveGame("autosave");
    return true;
}

export function checkBattleEnd(game) {
    if (game.battleFinished) return true;
    const allDead = game.enemies.every(en => en.currentHp <= 0);
    if (!allDead) return false;

    game.battleFinished = true;
    game.isProcessingTurn = false;

    if (game.player.perks.includes("p10")) {
        game.player.heal(4);
        game.battleLog.unshift("💚 Кровь тролля восстанавливает +4 HP.");
    }
    if (game.player.hasArtifact("art4")) {
        game.player.gold += 3;
        game.player.xp += 2;
        game.battleRewards.gold += 3;
        game.battleRewards.xp += 2;
    }
    if (game.player.hasArtifact("art16")) {
        game.player.gold += 5;
        game.battleRewards.gold += 5;
        game.battleLog.unshift("🧭 Золотой Компас даёт +5 Золота.");
    }
    if (game.player.hasArtifact("art9")) {
        game.player.heal(2);
    }

    if (RNG.chance(45) && game.player.inventory.potions.length < game.player.potionSlots) {
        const droppedPot = { ...RNG.choice(GAME_DATA.items.potions) };
        game.player.inventory.potions.push(droppedPot);
        game.battleRewards.items.push(`Зелье: ${droppedPot.name}`);
    }

    const currentKey = `${game.playerPos.x},${game.playerPos.y}`;
    const currentRoomObj = game.dungeonRooms[currentKey];
    const hadEliteOrBoss = game.enemies.some(e => e.isElite || e.isBoss) || (currentRoomObj && (currentRoomObj.type === "elite" || currentRoomObj.type === "boss"));
    if (hadEliteOrBoss) {
        const lootName = game.grantRandomEquipment();
        if (lootName) game.battleRewards.items.push(lootName);
    }

    game.battleLog.unshift("🏆 ПОБЕДА! Соберите трофеи и нажмите «Продолжить».");
    return true;
}

export function proceedAfterBattle(game) {
    if (!game.battleFinished || game.pendingEquipment) return;
    game.checkLevelUpOrFinishRoom();
}
