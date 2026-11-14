import { RNG } from "../../utils/rng.js";
import { GAME_DATA, ABYSS_START_FLOOR, getEnemyNativeFloor, getFloorMeta } from "../../data/index.js";
import { playSound } from "../../utils/audio.js";
import { pickItemByRarity } from "./encounter.js";

const FLOOR_HP_MULTIPLIERS = [1.0, 1.5, 2.15, 3.0];
const FLOOR_ATK_BONUSES = [0, 2, 4, 7];
const MUTATION_CHANCE_NORMAL = [10, 30, 50, 70];
const MUTATION_CHANCE_ELITE = [0, 30, 60, 90];
const TIER_HP_NORMALIZE = [2.8, 2.0, 1.4, 1.0];
const TIER_ATK_NORMALIZE_SHIFT = [4, 3, 1, 0];

export function createEnemyInstance(game, enemyKey, applyMutation = false) {
    const template = GAME_DATA.enemies[enemyKey];
    const e = JSON.parse(JSON.stringify(template));

    const floor = Math.max(0, game.floor || 0);
    const isAbyss = floor >= ABYSS_START_FLOOR;
    const cursedCfg = GAME_DATA.cursedConfig;
    const fountainAtkBonus = (game.fountainCursesCount || 0) * (cursedCfg ? cursedCfg.fountainEnemyAtkStep : 1);
    const eclipseCount = game.fountainEclipseCount || 0;
    const eclipseAtkBonus = eclipseCount * (cursedCfg ? cursedCfg.eclipseEnemyAtkStep : 2);
    const eclipseHpMult = 1 + eclipseCount * ((cursedCfg ? cursedCfg.eclipseEnemyHpPctStep : 25) / 100);

    let depthMult;
    let atkDepthBonus;

    if (isAbyss) {
        const abyssDepth = floor - (ABYSS_START_FLOOR - 1);
        const nativeFloor = getEnemyNativeFloor(enemyKey);
        const tierHpNorm = TIER_HP_NORMALIZE[nativeFloor] || 1.0;
        const tierAtkShift = TIER_ATK_NORMALIZE_SHIFT[nativeFloor] || 0;
        const atkMult = Math.pow(1.22, abyssDepth);
        const shieldMult = tierHpNorm * Math.pow(1.18, abyssDepth);

        depthMult = FLOOR_HP_MULTIPLIERS[3] * tierHpNorm * Math.pow(1.48, abyssDepth);
        atkDepthBonus = 0;

        e.xp = Math.round((e.xp || 3) * tierHpNorm * (1 + abyssDepth * 0.25));
        if (e.shield) {
            e.shield = Math.max(1, Math.round(e.shield * shieldMult));
        }
        if (Array.isArray(e.pattern)) {
            e.pattern = e.pattern.map(step => {
                const next = { ...step };
                if (next.val > 0) {
                    next.val = Math.max(1, Math.round((next.val + tierAtkShift + FLOOR_ATK_BONUSES[3]) * atkMult));
                }
                if (next.shield > 0) {
                    next.shield = Math.max(1, Math.round(next.shield * shieldMult));
                }
                return next;
            });
        }
    } else {
        const floorIdx = Math.min(3, floor);
        depthMult = FLOOR_HP_MULTIPLIERS[floorIdx];
        atkDepthBonus = FLOOR_ATK_BONUSES[floorIdx];
    }

    e.hp = Math.round(e.hp * depthMult * eclipseHpMult);
    e.currentHp = e.hp;
    e.shield = e.shield || 0;
    e.spikes = e.spikes || 0;
    e.poison = 0;
    e.bleed = 0;
    e.regen = 0;
    e.atkBonus = atkDepthBonus + fountainAtkBonus + eclipseAtkBonus;
    e.poisonOnHit = 0;
    e.bleedOnHit = 0;
    e.patternIndex = 0;

    if (applyMutation && !e.isBoss) {
        const mut = RNG.choice(GAME_DATA.mutations);
        e.mutationId = mut.id;
        e.name = `${mut.prefix} ${e.name}`;
        e.hp += Math.round((mut.hpBonus || 0) * depthMult * eclipseHpMult);
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

    const floor = Math.max(0, game.floor || 0);
    const isAbyss = floor >= ABYSS_START_FLOOR;
    const floorIdx = Math.min(3, floor);
    const floorData = getFloorMeta(floor);

    if (mode === "boss") {
        playSound("bossEncounter");
        const bossKey = isAbyss ? RNG.choice(floorData.bosses) : floorData.boss;
        game.enemies.push(createEnemyInstance(game, bossKey));
        game.battleLog = [isAbyss ? "👑 ХРАНИТЕЛЬ ГЛУБИН БЕЗДНЫ!" : "👑 БИТВА С БОССОМ ЭТАЖА!"];
    } else if (mode === "elite") {
        playSound("battleStart");
        const eliteKey = RNG.choice(floorData.elite);
        const mutateElite = isAbyss ? true : RNG.chance(MUTATION_CHANCE_ELITE[floorIdx]);
        game.enemies.push(createEnemyInstance(game, eliteKey, mutateElite));
        if (isAbyss) {
            const abyssDepth = floor - (ABYSS_START_FLOOR - 1);
            const escortChance = Math.min(75, Math.max(0, (abyssDepth - 1) * 25));
            if (escortChance > 0 && RNG.chance(escortChance)) {
                const escortKey = RNG.choice(floorData.enemies);
                game.enemies.push(createEnemyInstance(game, escortKey, true));
            }
        }
        game.battleLog = ["💀 Встречен Элитный противник!"];
    } else if (mode === "mimic") {
        playSound("battleStart");
        game.enemies.push(createEnemyInstance(game, "mimic", floor >= 1));
        game.battleLog = ["📦 Сундук оказался Алчным Мимиком!"];
    } else {
        playSound("battleStart");
        const mutChance = isAbyss ? 100 : MUTATION_CHANCE_NORMAL[floorIdx];
        const abyssDepth = isAbyss ? floor - (ABYSS_START_FLOOR - 1) : 0;
        let budget = isAbyss
            ? Math.min(12, 7 + abyssDepth + Math.floor(game.room / 4))
            : Math.min(7, 2 + Math.floor(game.room / 3) + floor);
        const maxEnemies = isAbyss ? 4 : 3;
        let attempts = 0;
        while (budget > 0 && game.enemies.length < maxEnemies && attempts < 24) {
            attempts++;
            const enemyKey = RNG.choice(floorData.enemies);
            const template = GAME_DATA.enemies[enemyKey];
            if (template.weight <= budget) {
                const mutate = RNG.chance(mutChance);
                game.enemies.push(createEnemyInstance(game, enemyKey, mutate));
                budget -= template.weight;
            }
        }
        if (game.enemies.length === 0) {
            const fallbackKey = isAbyss ? RNG.choice(floorData.enemies) : floorData.enemies[0];
            game.enemies.push(createEnemyInstance(game, fallbackKey, isAbyss));
        }
        game.battleLog = [`⚔️ Бой начался! Комната #${game.room}.`];
    }

    game.selectedTargetIndex = 0;
    game.battleTurn = 1;
    const startEnrage = getAbyssEnrageBonus(game);
    if (startEnrage > 0) {
        game.enrageAnnounced = true;
        game.battleLog.unshift(`🔥 Ярость Бездны активна с 1-го раунда (+${startEnrage} к атакам врагов)!`);
    }
    game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en);
    if (game.player.hasArtifact("art2")) {
        game.player.en += 2;
    }
    if (game.player.hasArtifact("art32")) {
        game.player.en += 1;
    }
    if (game.player.hasArtifact("art37")) {
        game.player.en += 2;
    }
    if (game.player.hasArtifact("art40") || game.player.hasArtifact("art41")) {
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
    }
    if (game.player.perks.includes("p24")) {
        game.player.en += 1;
    }

    game.player.shield = 0;
    if (game.player.perks.includes("p33")) {
        const thirstCount = game.enemies.length;
        game.player.en += thirstCount;
        game.player.addShield(thirstCount * 2);
    }
    if (game.player.perks.includes("p6")) game.player.addShield(10);
    if (game.player.hasArtifact("art13")) game.player.addShield(8);
    if (game.player.hasArtifact("art16")) game.player.addShield(5);
    if (game.player.hasArtifact("art22")) game.player.addShield(4);
    if (game.player.hasArtifact("art29")) game.player.addShield(4);
    if (game.player.hasArtifact("art35")) game.player.addShield(8);
    if (game.player.hasArtifact("art36")) game.player.addShield(2);
    if (game.player.hasArtifact("art37")) game.player.addShield(6);
    if (game.player.hasArtifact("art39")) game.player.addShield(18);
    if (game.player.hasArtifact("art41")) game.player.addShield(8);
    if (game.player.classId === "engineer") game.player.addShield(5);
    if (game.player.inventory.weapon && game.player.inventory.weapon.startShield) {
        game.player.addShield(game.player.inventory.weapon.startShield);
    }
    if (game.player.inventory.armor && game.player.inventory.armor.startShield) {
        game.player.addShield(game.player.inventory.armor.startShield);
    }
    if (game.player.hasArtifact("art6")) {
        game.player.addShield(6);
        game.enemies.forEach(en => { en.poison += 2; });
    }
    if (game.player.hasArtifact("art19")) {
        game.enemies.forEach(en => { en.bleed += 2; });
    }
    if (game.player.perks.includes("p27")) {
        game.enemies.forEach(en => { en.poison += 2; });
    }
    if (game.player.perks.includes("p16")) {
        game.enemies.forEach(en => { en.poison += 1; });
    }

    game.player.tempSpikes = 0;
    game.player.battleSpikes = 0;
    game.player.battleAtk = 0;
    game.player.battleBannerAtk = 0;
    if (game.player.hasArtifact("art23") && game.enemies.some(e => e.isElite || e.isBoss)) {
        game.player.addShield(14);
        game.player.battleAtk += 3;
    }
    game.player.poison = 0;
    game.player.bleed = 0;
    game.player.forceCritNext = false;
    game.player.critBonusNext = 0;
    game.player.damageReductionPct = 0;
    game.player.steelScaleUsed = false;
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
    if (game.isProcessingTurn || game.battleFinished || game.pendingArtifact) return false;
    if ((game.player.cooldowns[skillName] || 0) > 0) return false;
    return canAffordEn(game, enCost);
}

export function spendEn(game, cost) {
    if (game.player.en >= cost) {
        game.player.en -= cost;
        if (cost > 0 && game.player.hasArtifact("art32")) {
            const shieldAdded = game.player.addShield(3);
            if (shieldAdded > 0) {
                game.addBattleFx({ target: "player", type: "shield", value: shieldAdded });
            }
        }
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
    if (game.isProcessingTurn || game.pendingArtifact) return;
    const pot = game.player.inventory.potions[potIndex];
    if (!pot) return;
    if (game.state !== "BATTLE" && !pot.canUseOnMap) return;

    const alchBonus = game.player.perks.includes("p21") ? 6 : 0;
    const totalHeal = (pot.heal || 0) + alchBonus;

    if (totalHeal > 0) {
        game.player.heal(totalHeal);
        game.addBattleFx({ target: "player", type: "heal", value: totalHeal });
    }
    if (pot.cleanse) {
        game.player.poison = 0;
        game.player.bleed = 0;
    }

    if (game.state === "BATTLE") {
        if (pot.en) {
            game.player.en += pot.en;
        }
        if (pot.shield) {
            const shieldAdded = game.player.addShield(pot.shield);
            if (shieldAdded > 0) game.addBattleFx({ target: "player", type: "shield", value: shieldAdded });
        }
        if (pot.resetCooldowns) {
            game.player.cooldowns = { defend: 0, heavy: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
        } else if (pot.cooldownReduce) {
            for (const k of Object.keys(game.player.cooldowns)) {
                game.player.cooldowns[k] = Math.max(0, game.player.cooldowns[k] - pot.cooldownReduce);
            }
        }
        if (pot.dmgReducePct) {
            game.player.damageReductionPct = Math.max(game.player.damageReductionPct || 0, pot.dmgReducePct);
        }
        if (pot.battleAtk) {
            game.player.battleAtk += pot.battleAtk;
        }
        if (pot.battleSpikes) {
            game.player.battleSpikes += pot.battleSpikes;
        }
        if (pot.nextAtk) {
            game.player.concentrateBonus += pot.nextAtk;
        }
        if (pot.critChanceNext >= 100) {
            game.player.forceCritNext = true;
        } else if (pot.critChanceNext > 0) {
            game.player.critBonusNext = (game.player.critBonusNext || 0) + pot.critChanceNext;
        }
        if (pot.stripShield || pot.defShred || pot.poison || pot.bleed || pot.damage) {
            game.enemies.forEach(en => {
                if (en.currentHp <= 0) return;
                if (pot.stripShield) en.shield = 0;
                if (pot.defShred) en.def = Math.max(0, en.def - pot.defShred);
                if (pot.poison) {
                    en.poison += pot.poison;
                    game.addBattleFx({ target: "enemy", enemy: en, type: "poison", value: pot.poison });
                }
                if (pot.bleed) {
                    en.bleed += pot.bleed;
                    game.addBattleFx({ target: "enemy", enemy: en, type: "bleed", value: pot.bleed });
                }
                if (pot.damage) dealDamageToEnemy(game, en, pot.damage, true, false);
            });
        }
        const alchNote = alchBonus > 0 ? ` (+${alchBonus} HP Алхимия)` : "";
        game.battleLog.unshift(`🧪 [${pot.rarity}] ${pot.name}: ${pot.desc}${alchNote}`);
        if (game.player.perks.includes("p36")) {
            game.player.en += 2;
            const shieldAdded = game.player.addShield(8);
            if (shieldAdded > 0) game.addBattleFx({ target: "player", type: "shield", value: shieldAdded });
        }
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
    if (game.state !== "BATTLE" || game.isProcessingTurn || game.battleFinished || game.pendingArtifact) return;
    ensureValidTarget(game);
    const target = game.enemies[game.selectedTargetIndex];

    const twoEnCost = game.player.perks.includes("p24") ? 1 : 2;
    if (actionType === "defend" && !canUseSkill(game, "defend", 0)) {
        playSound("error");
        return;
    }
    if (actionType === "heavy" && !canUseSkill(game, "heavy", 1)) {
        playSound("error");
        return;
    }
    if (actionType === "pierce" && !canUseSkill(game, "pierce", twoEnCost)) {
        playSound("error");
        return;
    }
    if (actionType === "whirlwind" && !canUseSkill(game, "whirlwind", twoEnCost)) {
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
    if (game.battleTurn === 1 && game.player.hasArtifact("art22")) atkVal += 4;
    const singleAtkBonus = (target && (target.isElite || target.isBoss) && game.player.perks.includes("p25")) ? 3 : 0;

    const cdReduction = game.player.perks.includes("p24") ? 1 : 0;
    let extraTurn = false;

    if (actionType === "fast") {
        if (!target || target.currentHp <= 0) return;
        const potionCritBonus = game.player.critBonusNext || 0;
        game.player.forceCritNext = false;
        game.player.critBonusNext = 0;
        const fastCritBonus = (game.player.perks.includes("p35") ? 18 : 10)
            + (game.player.hasArtifact("art20") ? 5 : 0)
            + potionCritBonus;
        const isCrit = game.player.rollCrit(fastCritBonus, forceCrit);
        let dmg = atkVal + singleAtkBonus + RNG.range(1, 4) + (game.player.hasArtifact("art20") ? 2 : 0);
        if (isCrit) {
            const critMult = getCritMultiplier(game.player, "fast");
            dmg = Math.round(dmg * critMult);
            applyCritPlayerBonus(game);
            applyCritEnemyEffects(game, target);
        }
        dmg = game.player.modifyOutgoingDamage(dmg);
        applyWeaponEffects(game, target, isCrit);
        if (game.player.perks.includes("p7")) {
            target.poison += 1;
            game.addBattleFx({ target: "enemy", enemy: target, type: "poison", value: 1 });
        }
        const dealt = dealDamageToEnemy(game, target, dmg, ignoreAllDef, isCrit);
        checkEnemySpikes(game, target);
        game.battleLog.unshift(`⚔️ Быстрый удар по ${target.name}${isCrit ? " (КРИТ!)" : ""}: ${dealt} урона.`);
        game.player.concentrateBonus = 0;

    } else if (actionType === "defend") {
        let shieldGain = Math.max(1, 3
            + game.player.getTotalDef()
            + (game.player.classId === "crusader" ? 3 : 0)
            + (game.player.perks.includes("p31") ? 6 : 0)
            + (game.player.hasArtifact("art29") ? 3 : 0));
        if (game.player.classId === "crusader") game.player.tempSpikes += 3;
        if (game.player.perks.includes("p14")) game.player.tempSpikes += 4;
        const shieldAdded = game.player.addShield(shieldGain);
        if (shieldAdded > 0) game.addBattleFx({ target: "player", type: "shield", value: shieldAdded });
        game.player.damageReductionPct = Math.max(game.player.damageReductionPct || 0, 50);
        game.player.bleed = 0;
        game.player.poison = 0;
        const defCd = Math.max(1, 3 - (game.player.perks.includes("p31") ? 1 : 0));
        game.player.cooldowns.defend = defCd;
        game.battleLog.unshift(`🛡️ Глухая защита (+${shieldAdded} Щит, -50% урон, очищение).`);

    } else if (actionType === "heavy") {
        if (!target || target.currentHp <= 0) return;
        if (!spendEn(game, 1)) return;
        playSound("heavy");
        const isPotionCrit = consumePotionCritRoll(game);
        const p15Bonus = (game.player.perks.includes("p15") && (target.shield > 0 || target.def >= 2)) ? 8 : 0;
        const art26Bonus = game.player.hasArtifact("art26") ? 10 : 0;
        const art34Bonus = (game.player.hasArtifact("art34") && target.poison > 0 && target.bleed > 0) ? 4 : 0;
        let execDmg = Math.round(2 + (atkVal + singleAtkBonus) * 0.5)
            + (game.player.perks.includes("p1") ? 4 : 0)
            + p15Bonus
            + art26Bonus
            + art34Bonus;
        if (isPotionCrit) {
            execDmg = Math.round(execDmg * getCritMultiplier(game.player, "heavy"));
            applyCritPlayerBonus(game);
            applyCritEnemyEffects(game, target);
        }
        execDmg = game.player.modifyOutgoingDamage(execDmg);
        if (game.player.perks.includes("p8")) {
            target.bleed += 3;
            game.addBattleFx({ target: "enemy", enemy: target, type: "bleed", value: 3 });
        }
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
            if (game.player.hasArtifact("art26")) {
                game.player.heal(8);
                const cupShield = game.player.addShield(6);
                game.addBattleFx({ target: "player", type: "heal", value: 8 });
                if (cupShield > 0) game.addBattleFx({ target: "player", type: "shield", value: cupShield });
            }
            game.battleLog.unshift(`💀 Казнь ${target.name}${isPotionCrit ? " (КРИТ!)" : ""}: ${hpBefore} чистого урона — ДОБИТ! Ход не тратится!`);
            extraTurn = true;
        } else {
            if (dealtExec > 0) {
                applyPlagueCenserHit(game, target);
            }
            game.battleLog.unshift(`💀 Казнь ${target.name}${isPotionCrit ? " (КРИТ!)" : ""}: ${execDmg} чистого урона.`);
        }
        game.player.cooldowns.heavy = Math.max(1, 3 - cdReduction);
        game.player.concentrateBonus = 0;

    } else if (actionType === "pierce") {
        if (!target || target.currentHp <= 0) return;
        if (!spendEn(game, twoEnCost)) return;
        playSound("pierce");
        const isPotionCrit = consumePotionCritRoll(game);
        const art34Bonus = (game.player.hasArtifact("art34") && target.poison > 0 && target.bleed > 0) ? 4 : 0;
        let prcRaw = atkVal + singleAtkBonus + RNG.range(3, 7) + art34Bonus;
        if (isPotionCrit) {
            prcRaw = Math.round(prcRaw * getCritMultiplier(game.player, "pierce"));
            applyCritPlayerBonus(game);
            applyCritEnemyEffects(game, target);
        }
        prcRaw = game.player.modifyOutgoingDamage(prcRaw);
        const prcDef = ignoreAllDef ? 0 : Math.max(0, target.def - (game.player.hasArtifact("art3") ? 2 : 0));
        const p15Bonus = (game.player.perks.includes("p15") && (target.shield > 0 || target.def >= 2)) ? 8 : 0;
        const prcActual = Math.max(1, prcRaw - prcDef) + p15Bonus;
        if (game.player.perks.includes("p8")) {
            target.bleed += 3;
            game.addBattleFx({ target: "enemy", enemy: target, type: "bleed", value: 3 });
        }
        target.currentHp = Math.max(0, target.currentHp - prcActual);
        game.addBattleFx({
            target: "enemy",
            enemy: target,
            type: isPotionCrit ? "crit" : "damage",
            value: prcActual,
            isCrit: isPotionCrit,
        });
        if (prcActual > 0 && game.player.hasArtifact("art17")) {
            game.player.heal(2);
            game.addBattleFx({ target: "player", type: "heal", value: 2 });
        }
        if (prcActual > 0 && target.currentHp > 0) {
            applyPlagueCenserHit(game, target);
        }
        if (target.currentHp <= 0) onEnemyKilled(game, target);
        applyWeaponEffects(game, target, isPotionCrit);
        checkEnemySpikes(game, target);
        if (game.player.hasArtifact("art27")) {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
        }
        game.player.cooldowns.pierce = Math.max(1, 3 - cdReduction);
        game.battleLog.unshift(`🗡️ Пробитие ${target.name}${isPotionCrit ? " (КРИТ!)" : ""} (сквозь щит): ${prcActual} урона!`);
        game.player.concentrateBonus = 0;

    } else if (actionType === "whirlwind") {
        if (!spendEn(game, twoEnCost)) return;
        playSound("whirlwind");
        const isArcanist = game.player.classId === "arcanist";
        const isPotionCrit = consumePotionCritRoll(game);
        const aliveBeforeWhirl = game.enemies.filter(e => e.currentHp > 0).length;
        const whrArtBonus = game.player.hasArtifact("art28") ? 3 : 0;
        const baseRoll = isArcanist ? RNG.range(3, 6) : RNG.range(1, 4);
        let dmg = Math.round(atkVal * 0.75) + baseRoll + whrArtBonus;
        const critMult = getCritMultiplier(game.player, "whirlwind");
        if (isPotionCrit) {
            dmg = Math.round(dmg * critMult);
            applyCritPlayerBonus(game);
        }
        game.player.cooldowns.whirlwind = Math.max(1, 3 - cdReduction);
        game.battleLog.unshift(`🌪️ ${isArcanist ? "Огненный залп" : "Круговой вихрь"}${isPotionCrit ? " (КРИТ!)" : ""} по всем (${dmg} базы)!`);
        game.enemies.forEach(en => {
            if (en.currentHp > 0) {
                const enAtk = atkVal + ((en.isElite || en.isBoss) && game.player.perks.includes("p25") ? 3 : 0);
                let enDmg = Math.round(enAtk * 0.75) + baseRoll + whrArtBonus;
                if (isPotionCrit) {
                    enDmg = Math.round(enDmg * critMult);
                    applyCritEnemyEffects(game, en);
                    applyWeaponEffects(game, en, true);
                }
                enDmg = game.player.modifyOutgoingDamage(enDmg);
                if (game.player.perks.includes("p7")) {
                    en.poison += 1;
                    game.addBattleFx({ target: "enemy", enemy: en, type: "poison", value: 1 });
                }
                dealDamageToEnemy(game, en, enDmg, isArcanist || ignoreAllDef, isPotionCrit);
            }
        });
        if (game.player.hasArtifact("art28") && aliveBeforeWhirl > 0) {
            const stormShield = game.player.addShield(aliveBeforeWhirl * 3);
            if (stormShield > 0) game.addBattleFx({ target: "player", type: "shield", value: stormShield });
        }
        game.player.concentrateBonus = 0;

    } else if (actionType === "concentrate") {
        playSound("concentrate");
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 2);
        let healAmt = game.player.perks.includes("p9") ? 8 : 4;
        game.player.heal(healAmt);
        game.addBattleFx({ target: "player", type: "heal", value: healAmt });
        for (const skillKey of Object.keys(game.player.cooldowns)) {
            if (game.player.cooldowns[skillKey] > 0) {
                game.player.cooldowns[skillKey]--;
            }
        }
        if (game.player.hasArtifact("art10")) {
            const bookShield = game.player.addShield(10);
            game.player.concentrateBonus += 4;
            if (bookShield > 0) game.addBattleFx({ target: "player", type: "shield", value: bookShield });
        }
        game.player.cooldowns.concentrate = 4;
        game.battleLog.unshift(`🧘 Концентрация (+2 EN, +${healAmt} HP, -1 ход ко всем КД).`);
    }

    if (["fast", "heavy", "pierce", "whirlwind"].includes(actionType) && game.player.bleed > 0) {
        game.player.hp = Math.max(0, game.player.hp - game.player.bleed);
        game.addBattleFx({ target: "player", type: "bleedDamage", value: game.player.bleed });
        game.battleLog.unshift(`🩸 Кровотечение отнимает у вас ${game.player.bleed} HP!`);
        game.player.bleed--;
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
        const enrageBonus = getAbyssEnrageBonus(game);
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
        if (game.player.hasArtifact("art36")) {
            game.player.heal(1);
            game.addBattleFx({ target: "player", type: "heal", value: 1 });
        }
        if (game.player.hasArtifact("art40")) {
            game.player.heal(6);
            game.addBattleFx({ target: "player", type: "heal", value: 6 });
        }
        if (game.player.hasArtifact("art41")) {
            game.player.heal(6);
            game.addBattleFx({ target: "player", type: "heal", value: 6 });
        }
        if (game.player.hasArtifact("art8")) {
            game.enemies.forEach(en => {
                if (en.currentHp > 0) dealDamageToEnemy(game, en, 3, true, false);
            });
        }
        if (game.player.hasArtifact("art33")) {
            const bannerShield = game.player.addShield(1);
            if (bannerShield > 0) game.addBattleFx({ target: "player", type: "shield", value: bannerShield });
            if ((game.player.battleBannerAtk || 0) < 2) {
                game.player.battleBannerAtk = (game.player.battleBannerAtk || 0) + 1;
                game.player.battleAtk = (game.player.battleAtk || 0) + 1;
                game.battleLog.unshift(`🚩 Знамя Легиона даёт +${bannerShield} Щита и +1 ATK до конца боя!`);
            } else {
                game.battleLog.unshift(`🚩 Знамя Легиона даёт +${bannerShield} Щита!`);
            }
        }

        if (game.player.classId === "arcanist") {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
        }
        game.player.damageReductionPct = 0;
        game.player.steelScaleUsed = false;
        game.battleTurn++;
        if (getAbyssEnrageBonus(game) > 0 && !game.enrageAnnounced) {
            game.enrageAnnounced = true;
            game.addBattleFx({
                target: "player",
                type: "enrageAnnounce",
                text: "🔥 Враги стали сильнее!",
            });
        }
        if (game.player.hasArtifact("art36")) {
            const golemShield = game.player.addShield(2);
            if (golemShield > 0) game.addBattleFx({ target: "player", type: "shield", value: golemShield });
        }
        if (game.player.hasArtifact("art40")) {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
        }
        if (game.player.hasArtifact("art41")) {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
            const eclipseShield = game.player.addShield(8);
            if (eclipseShield > 0) game.addBattleFx({ target: "player", type: "shield", value: eclipseShield });
        }
        if (game.player.hasArtifact("art30") && game.battleTurn % 2 === 0 && game.battleTurn <= 6) {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
            const rosaryShield = game.player.addShield(2);
            if (rosaryShield > 0) game.addBattleFx({ target: "player", type: "shield", value: rosaryShield });
            game.battleLog.unshift(`📿 Костяные Чётки дают +1 EN и +${rosaryShield} Щита!`);
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
                game.finalizeRun("GAMEOVER");
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
    const enrageBonus = getAbyssEnrageBonus(game);

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
        const bleedDmg = en.bleed + (game.player.hasArtifact("art21") ? 1 : 0);
        en.currentHp = Math.max(0, en.currentHp - bleedDmg);
        game.addBattleFx({ target: "enemy", enemy: en, type: "bleedDamage", value: bleedDmg });
        game.battleLog.unshift(`🩸 ${en.name} истекает кровью (-${bleedDmg} HP).`);
        en.bleed--;
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
            en.poison += 1;
            game.addBattleFx({ target: "enemy", enemy: en, type: "poison", value: 1 });
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

export function applyWeaponEffects(game, enemy, isCrit = false) {
    const w = game.player.inventory.weapon;
    if (!w) return;
    if (w.onCrit && !isCrit) return;
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
    if (game.player.hasArtifact("art34") && enemy.poison > 0 && enemy.bleed > 0) {
        amount += 4;
    }
    let enemyDef = ignoreDef ? 0 : enemy.def;
    if (!ignoreDef && game.player.hasArtifact("art3")) {
        enemyDef = Math.max(0, enemyDef - 2);
    }

    let actual = ignoreDef ? amount : Math.max(1, amount - enemyDef);
    let shieldAbsorbed = 0;
    if (enemy.shield > 0) {
        const shieldMult = game.player.perks.includes("p15") ? 2 : 1;
        const shieldCost = Math.ceil(enemy.shield / shieldMult);
        if (actual <= shieldCost) {
            shieldAbsorbed = Math.min(enemy.shield, actual * shieldMult);
            enemy.shield = Math.max(0, enemy.shield - actual * shieldMult);
            actual = 0;
        } else {
            shieldAbsorbed = enemy.shield;
            actual -= shieldCost;
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
        game.player.heal(2);
        game.addBattleFx({ target: "player", type: "heal", value: 2 });
    }
    if (actual > 0 && enemy.currentHp > 0) {
        applyPlagueCenserHit(game, enemy);
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
    if (game.player.hasArtifact("art12")) xpGain = Math.ceil(xpGain * 1.5);
    let goldGain = RNG.range(2, 5) + game.floor * 2;
    if ((enemy.isElite || enemy.isBoss) && game.player.perks.includes("p25")) {
        xpGain += 8;
        goldGain += 10;
    }
    const cfg = GAME_DATA.cursedConfig;
    const eclipseCount = game.fountainEclipseCount || 0;
    if (eclipseCount > 0) {
        const rewardMult = 1 + eclipseCount * ((cfg ? cfg.eclipseRewardBonusPct : 50) / 100);
        xpGain = Math.ceil(xpGain * rewardMult);
        goldGain = Math.ceil(goldGain * rewardMult);
    }

    game.player.xp += xpGain;
    game.player.totalRunXp += xpGain;
    game.player.gold += goldGain;
    game.battleRewards.xp += xpGain;
    game.battleRewards.gold += goldGain;

    game.battleLog.unshift(`💀 ${enemy.name} повержен! (+${xpGain} XP, +${goldGain}G)`);

    if (game.player.classId === "reaper") game.player.heal(3);
    if (game.player.hasArtifact("art1")) game.player.heal(4);
    if (game.player.hasArtifact("art12")) {
        game.player.heal(2);
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
    }
    if (game.player.hasArtifact("art37")) {
        game.player.heal(3);
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
        for (const k in game.player.cooldowns) {
            game.player.cooldowns[k] = 0;
        }
        game.addBattleFx({ target: "player", type: "heal", value: 3 });
        game.battleLog.unshift("⏳ Хронометр Хаоса лечит +3 HP, даёт +1 EN и сбрасывает перезарядки!");
    }
    if (game.player.inventory.weapon && game.player.inventory.weapon.vamp) {
        game.player.heal(game.player.inventory.weapon.vamp);
    }
    if (game.player.perks.includes("p22")) {
        game.player.en += 1;
        game.player.addShield(2);
        game.addBattleFx({ target: "player", type: "shield", value: 2 });
    }
    if (game.player.perks.includes("p17")) {
        if (enemy.poison > 0 || enemy.bleed > 0) {
            game.player.heal(6);
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
        } else {
            game.player.heal(4);
        }
    }
    if (game.player.perks.includes("p30")) {
        const isPoisoned = enemy.poison > 0;
        const boomDmg = isPoisoned ? 10 : 6;
        const aliveOthers = game.enemies.filter(en => en !== enemy && en.currentHp > 0);
        if (aliveOthers.length > 0) {
            aliveOthers.forEach(en => {
                if (isPoisoned) {
                    en.poison += 2;
                    game.addBattleFx({ target: "enemy", enemy: en, type: "poison", value: 2 });
                }
                dealDamageToEnemy(game, en, boomDmg, true);
            });
            game.battleLog.unshift(`💥 Токсичный взрыв наносит ${boomDmg} чистого урона всем врагам${isPoisoned ? " и накладывает Яд (2)" : ""}!`);
        }
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
        game.player.heal(6);
        game.battleLog.unshift("💚 Кровь тролля восстанавливает +6 HP.");
    }
    if (game.player.perks.includes("p28")) {
        game.player.heal(3);
        game.battleLog.unshift("🍲 Сытный привал восстанавливает +3 HP.");
    }
    if (game.player.hasArtifact("art4")) {
        game.player.heal(3);
        game.player.gold += 6;
        game.player.xp += 4;
        game.battleRewards.gold += 6;
        game.battleRewards.xp += 4;
    }
    if (game.player.hasArtifact("art16")) {
        game.player.gold += 8;
        game.battleRewards.gold += 8;
        game.battleLog.unshift("🧭 Золотой Компас даёт +8 Золота.");
    }
    if (game.player.hasArtifact("art9")) {
        game.player.heal(3);
    }

    if (RNG.chance(45) && game.player.inventory.potions.length < game.player.potionSlots) {
        const droppedPot = pickItemByRarity(GAME_DATA.items.potions, game.floor);
        if (droppedPot) {
            const potCopy = { ...droppedPot };
            game.player.inventory.potions.push(potCopy);
            game.battleRewards.items.push(`🧪 [${potCopy.rarity}] Зелье: ${potCopy.name}`);
        }
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
    if (!game.battleFinished || game.pendingEquipment || game.pendingArtifact) return;
    game.checkLevelUpOrFinishRoom();
}

function applyCritPlayerBonus(game) {
    game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
    if (game.player.perks.includes("p11")) {
        game.player.heal(6);
        const vampShield = game.player.addShield(4);
        game.addBattleFx({ target: "player", type: "heal", value: 6 });
        if (vampShield > 0) game.addBattleFx({ target: "player", type: "shield", value: vampShield });
    }
    if (game.player.hasArtifact("art38")) {
        game.player.heal(5);
        game.addBattleFx({ target: "player", type: "heal", value: 5 });
    }
    if (game.player.hasArtifact("art41")) {
        game.player.heal(5);
        game.addBattleFx({ target: "player", type: "heal", value: 5 });
    }
}

function getCritMultiplier(player, actionType) {
    if (actionType === "fast" && player.perks.includes("p35")) return 2.5;
    if (player.hasArtifact("art41")) return 2.2;
    if (player.hasArtifact("art38")) return 2.1;
    if (player.hasArtifact("art31")) return 2.0;
    return 1.65;
}

function applyCritEnemyEffects(game, enemy) {
    if (!enemy || enemy.currentHp <= 0) return;
    if (game.player.perks.includes("p32")) {
        enemy.def = Math.max(0, enemy.def - 2);
        enemy.currentHp = Math.max(0, enemy.currentHp - 3);
        game.addBattleFx({ target: "enemy", enemy, type: "damage", value: 3 });
    }
    if (game.player.hasArtifact("art21")) {
        enemy.bleed += 2;
        game.addBattleFx({ target: "enemy", enemy, type: "bleed", value: 2 });
    }
}

function applyPlagueCenserHit(game, enemy) {
    if (!enemy || enemy.currentHp <= 0 || !game.player.hasArtifact("art34")) return;
    enemy.poison += 1;
    enemy.bleed += 1;
    game.addBattleFx({ target: "enemy", enemy, type: "poison", value: 1 });
    game.addBattleFx({ target: "enemy", enemy, type: "bleed", value: 1 });
}

function consumePotionCritRoll(game) {
    const hadForce = Boolean(game.player.forceCritNext);
    const bonus = game.player.critBonusNext || 0;
    game.player.forceCritNext = false;
    game.player.critBonusNext = 0;
    if (hadForce) {
        game.player.pityCritBonus = 0;
        return true;
    }
    if (bonus > 0) return game.player.rollCrit(bonus);
    return false;
}

export function getAbyssEnrageBonus(game) {
    const turn = game.battleTurn || 1;
    if ((game.floor || 0) >= ABYSS_START_FLOOR) {
        return turn * 2;
    }
    return turn >= 11 ? (turn - 10) * 2 : 0;
}
