import { RNG } from "../../utils/rng.js";
import { GAME_DATA } from "../../data/index.js";

export function checkLevelUpOrFinishRoom(game) {
    const req = game.player.getRequiredXp();
    if (game.player.xp >= req) {
        generatePerkChoices(game);
        if (game.selectedPerkChoices.length > 0) {
            game.state = "LEVELUP";
            game.saveGame("autosave");
            return;
        }
    }
    finishRoom(game);
}

export function grantRandomEquipment(game, origin = "battle") {
    const minRarity = origin === "battle" ? "Редкое" : null;
    const roll = RNG.range(1, 3);
    if (roll === 1 || roll === 2) {
        const type = roll === 1 ? "weapon" : "armor";
        const pool = roll === 1 ? GAME_DATA.items.weapons : GAME_DATA.items.armors;
        const label = roll === 1 ? "Оружие" : "Броня";
        const item = pickItemByRarity(pool, game.floor, minRarity);
        if (!item) return null;
        game.pendingEquipment = {
            type: type,
            item: { ...item },
            origin: origin,
        };
        return `${label}: [${item.rarity}] ${item.name} (${item.desc})`;
    }
    const art = grantRandomArtifact(game, minRarity);
    if (art) {
        if (game.pendingArtifact && game.pendingArtifact.id === art.id) {
            return null;
        }
        return formatArtifactLine(art);
    }
    game.player.gold += 15;
    return "Сундук золота (+15G)";
}

export function resolveEquipChoice(game) {
    if (!game.pendingEquipment) return null;
    const { type, item } = game.pendingEquipment;
    let refund = 0;
    if (type === "weapon") {
        refund = game.player.equipWeapon(item);
    } else if (type === "armor") {
        refund = game.player.equipArmor(item);
    }
    const result = { name: item.name, refund: refund };
    game.pendingEquipment = null;
    game.saveGame("autosave");
    return result;
}

export function resolveSalvageChoice(game) {
    if (!game.pendingEquipment) return null;
    const { item } = game.pendingEquipment;
    const goldGain = (item && item.cost) ? Math.max(1, Math.floor(item.cost * 0.25)) : 0;
    game.player.gold += goldGain;
    const result = { name: item.name, goldGain: goldGain };
    game.pendingEquipment = null;
    game.saveGame("autosave");
    return result;
}

export function resolvePendingArtifact(game, accept) {
    if (!game.pendingArtifact) return null;
    const art = game.pendingArtifact;
    game.pendingArtifact = null;
    let mergedArt = null;

    if (accept) {
        const mergedId = GAME_DATA.cursedConfig.mergedArtifactId;
        const hadMerged = game.player.hasArtifact(mergedId);
        game.player.addArtifact(art);
        if (!hadMerged && game.player.hasArtifact(mergedId)) {
            mergedArt = GAME_DATA.items.artifacts.find(a => a.id === mergedId) || null;
        }
        const activeArtId = mergedArt ? mergedArt.id : art.id;

        if (game.state === "BATTLE") {
            if (!game.battleFinished && game.battleTurn === 1) {
                if (activeArtId === "art39") {
                    const gained = game.player.addShield(18);
                    if (gained > 0) game.addBattleFx({ target: "player", type: "shield", value: gained });
                } else if (activeArtId === "art41") {
                    const gained = game.player.addShield(8);
                    if (gained > 0) game.addBattleFx({ target: "player", type: "shield", value: gained });
                }
            }
            if (mergedArt) {
                game.battleLog.unshift(`🌑 СЛИЯНИЕ ПРОКЛЯТИЙ! Получен секретный артефакт: ${mergedArt.name}!`);
                if (game.battleRewards) {
                    game.battleRewards.items.push(`🌑 [Проклятое] Слияние: ${mergedArt.name} (${mergedArt.desc})`);
                }
            } else {
                game.battleLog.unshift(`🩸 Принят проклятый артефакт: ${art.name}!`);
                if (game.battleRewards) {
                    game.battleRewards.items.push(formatArtifactLine(art));
                }
            }
        } else if (game.state === "EVENT_REWARDS" && game.eventRewards) {
            if (!Array.isArray(game.eventRewards.items)) game.eventRewards.items = [];
            if (mergedArt) {
                game.eventRewards.items.push(`🌑 [Проклятое] Слияние: ${mergedArt.name} (${mergedArt.desc})`);
            } else {
                game.eventRewards.items.push(formatArtifactLine(art));
            }
        }
    } else if (game.state === "BATTLE") {
        game.battleLog.unshift(`🙅 Вы отказались от проклятого артефакта (${art.name}).`);
    } else if (game.state === "EVENT_REWARDS" && game.eventRewards) {
        if (!Array.isArray(game.eventRewards.notes)) game.eventRewards.notes = [];
        game.eventRewards.notes.push(`🙅 Вы отказались от проклятого артефакта (${art.name}).`);
    }

    game.saveGame("autosave");
    return { art, accepted: accept, mergedArt };
}

export function finishRoom(game) {
    const currentKey = `${game.playerPos.x},${game.playerPos.y}`;
    const roomObj = game.dungeonRooms[currentKey];
    if (roomObj) {
        roomObj.cleared = true;
    }
    game.currentCorridorResult = null;
    game.fountainResult = null;
    game.shopMergedNotice = null;

    if (roomObj && roomObj.type === "boss") {
        game.player.heal(game.player.getTotalMaxHp());
        game.player.en = game.player.getTotalMaxEn();
        if (game.floor < 3) {
            game.state = "MAP";
        } else {
            game.calculateSouls();
            game.state = "VICTORY";
        }
    } else {
        game.state = "MAP";
    }
    if (game.state !== "VICTORY") {
        game.saveGame("autosave");
    }
}

export function generatePerkChoices(game) {
    let pool = GAME_DATA.perks.filter(p => !game.player.perks.includes(p.id));
    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
        const picked = pickItemByRarity(pool, game.floor);
        if (!picked) break;
        choices.push(picked);
        pool = pool.filter(p => p.id !== picked.id);
    }
    game.selectedPerkChoices = choices;
}

export function choosePerk(game, perkId) {
    const req = game.player.getRequiredXp();
    game.player.xp = Math.max(0, game.player.xp - req);
    game.player.level++;
    game.player.addPerk(perkId, game.floor);

    game.player.baseMaxHp += 3;
    game.player.heal(6);
    checkLevelUpOrFinishRoom(game);
}

export function resolveEventOption(game, optionId) {
    if (optionId === "altar_hp") {
        if (game.player.hp <= 6) return;
        game.player.hp -= 6;
        game.player.baseAtk += 1;
    } else if (optionId === "altar_gold") {
        if (game.player.gold < 12) return;
        game.player.gold -= 12;
        const items = [];
        const notes = [];
        collectEventArtifact(game, items, notes);
        openEventRewards(game, { items, notes });
        return;
    } else if (optionId === "spring_heal") {
        game.player.heal(game.player.getTotalMaxHp());
    } else if (optionId === "spring_max") {
        game.player.baseMaxHp += 5;
        game.player.heal(5);
    } else if (optionId === "smith_atk") {
        game.player.weaponUpgradeLvl += 1;
    } else if (optionId === "smith_def") {
        game.player.armorUpgradeLvl += 1;
        game.player.heal(3);
    } else if (optionId === "smith_xp") {
        game.player.xp += 10;
        game.player.totalRunXp += 10;
    } else if (optionId === "stash_take") {
        game.player.gold += 10;
        game.player.heal(5);
        const items = [];
        const notes = [];
        collectRandomPotions(game, 1, items, notes);
        openEventRewards(game, {
            gold: 10,
            effects: ["❤️ +5 HP"],
            items,
            notes,
        });
        return;
    } else if (optionId === "chest_open") {
        if (RNG.chance(50)) {
            game.setupBattle("mimic");
            game.saveGame("autosave");
            return;
        } else {
            game.player.gold += 15;
            const loot = grantRandomEquipment(game, "event");
            openEventRewards(game, {
                gold: 15,
                items: loot ? [loot] : [],
            });
            return;
        }
    } else if (optionId === "lib_xp") {
        game.player.xp += 12;
        game.player.totalRunXp += 12;
    } else if (optionId === "lib_perk") {
        if (game.player.hp <= 6) return;
        game.player.hp -= 6;
        const items = [];
        const effects = ["💔 -6 HP"];
        const notes = [];
        collectRandomEventPerk(game, items, effects, notes);
        openEventRewards(game, { effects, items, notes });
        return;
    } else if (optionId === "gamble_play") {
        if (game.player.gold < 8) return;
        game.player.gold -= 8;
        let wonGold = 0;
        const wonItems = [];
        const notes = [];
        if (RNG.chance(50)) {
            wonGold = 20;
            game.player.gold += 20;
            collectRandomPotions(game, 1, wonItems, notes);
        } else {
            notes.push("Ничего не выиграно! Бес забирает ставку (-8G).");
        }
        openEventRewards(game, {
            gold: wonGold,
            items: wonItems,
            notes,
        });
        return;
    } else if (optionId === "gamble_rob") {
        if (game.player.hp <= 4) return;
        game.player.hp -= 4;
        game.player.gold += 9;
    } else if (optionId === "lab_potions") {
        game.player.potionSlots += 1;
        const items = [];
        const notes = [];
        collectRandomPotions(game, 2, items, notes);
        openEventRewards(game, {
            effects: ["🧪 +1 Слот пояса зелий"],
            items,
            notes,
        });
        return;
    } else if (optionId === "lab_mutagen") {
        game.player.baseMaxHp += 7;
        game.player.hp = Math.max(1, game.player.hp - 3);
    } else if (optionId === "soul_sell_hp") {
        if (game.player.baseMaxHp <= 5) return;
        game.player.baseMaxHp = Math.max(6, game.player.baseMaxHp - 5);
        game.player.clampHp();
        game.player.gold += 18;
        const items = [];
        const notes = [];
        collectEventArtifact(game, items, notes);
        openEventRewards(game, {
            gold: 18,
            effects: ["💔 -5 MAX HP"],
            items,
            notes,
        });
        return;
    } else if (optionId === "soul_buy_souls") {
        if (game.player.gold < 12) return;
        game.player.gold -= 12;
        game.meta.souls += 10;
        game.saveMeta();
    } else if (optionId === "arena_fight") {
        game.player.gold += 10;
        game.setupBattle("elite");
        game.saveGame("autosave");
        return;
    } else if (optionId === "well_gold") {
        if (game.player.gold < 10) return;
        game.player.gold -= 10;
        game.player.heal(12);
        game.player.xp += 10;
        game.player.totalRunXp += 10;
    } else if (optionId === "well_blood") {
        if (game.player.hp <= 6) return;
        game.player.hp -= 6;
        const items = [];
        const notes = [];
        collectEventArtifact(game, items, notes);
        openEventRewards(game, {
            effects: ["💔 -6 HP"],
            items,
            notes,
        });
        return;
    } else if (optionId === "pilgrim_help") {
        if (game.player.hp <= 5) return;
        game.player.hp -= 5;
        game.player.weaponUpgradeLvl += 1;
        game.player.xp += 8;
        game.player.totalRunXp += 8;
    } else if (optionId === "pilgrim_rob") {
        game.player.gold += 15;
        const items = [];
        const notes = [];
        collectRandomPotions(game, 1, items, notes);
        openEventRewards(game, {
            gold: 15,
            items,
            notes,
        });
        return;
    } else if (optionId === "cauldron_drink") {
        if (RNG.chance(50)) {
            game.player.baseMaxHp += 8;
            game.player.heal(8);
        } else {
            game.player.hp = Math.max(1, game.player.hp - 6);
        }
    } else if (optionId === "cauldron_potion") {
        const items = [];
        const notes = [];
        collectRandomPotions(game, 1, items, notes);
        openEventRewards(game, { items, notes });
        return;
    } else if (optionId === "cauldron_gold") {
        game.player.gold += 12;
    } else if (optionId === "monolith_perk") {
        if (game.player.hp <= 7) return;
        game.player.hp -= 7;
        const items = [];
        const effects = ["💔 -7 HP"];
        const notes = [];
        collectRandomEventPerk(game, items, effects, notes);
        openEventRewards(game, { effects, items, notes });
        return;
    } else if (optionId === "monolith_pray") {
        game.player.en = game.player.getTotalMaxEn();
        game.player.xp += 15;
        game.player.totalRunXp += 15;
    } else if (optionId === "sarcophagus_fight") {
        startEliteEventWithArtifact(game, 20, "Саркофаг вскрыт");
        return;
    } else if (optionId === "sarcophagus_pray") {
        if (game.player.gold < 8) return;
        game.player.gold -= 8;
        game.player.baseMaxHp += 5;
        game.player.heal(5);
    } else if (optionId === "pawn_dice") {
        if (game.player.gold < 10) return;
        game.player.gold -= 10;
        let won = false;
        if (RNG.chance(50)) {
            game.player.gold += 22;
            won = true;
        }
        openEventRewards(game, {
            gold: won ? 22 : 0,
            notes: won ? [] : ["Проигрыш в кости (-10G)."],
        });
        return;
    } else if (optionId === "pawn_blood") {
        if (game.player.hp <= 8) return;
        game.player.hp -= 8;
        game.player.gold += 18;
    } else if (optionId === "pawn_relic") {
        if (game.player.gold < 20) return;
        game.player.gold -= 20;
        const items = [];
        const notes = [];
        collectEventArtifact(game, items, notes);
        openEventRewards(game, { items, notes });
        return;
    } else if (optionId === "rift_dive") {
        if (RNG.chance(50)) {
            game.player.armorUpgradeLvl += 1;
            game.player.heal(3);
        } else {
            game.player.hp = Math.max(1, game.player.hp - 8);
        }
    } else if (optionId === "rift_absorb") {
        game.player.xp += 20;
        game.player.totalRunXp += 20;
        game.meta.souls += 8;
        game.saveMeta();
    } else if (optionId === "nest_loot") {
        game.player.gold += 12;
        const items = [];
        const notes = [];
        collectRandomPotions(game, 1, items, notes);
        openEventRewards(game, {
            gold: 12,
            items,
            notes,
        });
        return;
    } else if (optionId === "nest_hunt") {
        startEliteEventWithArtifact(game, 15, "Добыча из логова");
        return;
    }

    checkLevelUpOrFinishRoom(game);
}

export function resolveCampfire(game, choice) {
    if (choice === "heal") {
        const mult = game.player.perks.includes("p28") ? 0.7 : 0.45;
        if (game.player.perks.includes("p28")) game.player.gold += 8;
        let healAmt = Math.ceil(game.player.getTotalMaxHp() * mult);
        if (game.player.hasArtifact("art39")) {
            healAmt = Math.max(1, Math.floor(healAmt * 0.5));
        }
        game.player.heal(healAmt);
    } else if (choice === "sharpen") {
        game.player.weaponUpgradeLvl += 1;
    } else if (choice === "meditate") {
        game.player.baseMaxHp += 4;
        game.player.heal(4);
    }
    finishRoom(game);
}

export function resolveFountainChoice(game, drink) {
    const currentKey = `${game.playerPos.x},${game.playerPos.y}`;
    const roomObj = game.dungeonRooms[currentKey];
    if (roomObj) {
        roomObj.cleared = true;
    }
    if (!drink) {
        game.fountainResult = null;
        finishRoom(game);
        return;
    }
    const cfg = GAME_DATA.cursedConfig;
    if (game.player.hasArtifact(cfg.mergedArtifactId)) {
        game.fountainEclipseCount = (game.fountainEclipseCount || 0) + 1;
        game.fountainResult = {
            isEclipseRitual: true,
            eclipseCount: game.fountainEclipseCount,
        };
        game.saveGame("autosave");
        return;
    }
    game.player.gold += cfg.fountainGold;
    game.fountainCursesCount = (game.fountainCursesCount || 0) + 1;
    const chance = Math.min(12, game.fountainCursesCount * cfg.fountainChanceStep);
    game.fountainResult = {
        goldGain: cfg.fountainGold,
        cursesCount: game.fountainCursesCount,
        cursedChance: chance,
    };
    game.saveGame("autosave");
}

export function leaveFountainRoom(game) {
    game.fountainResult = null;
    checkLevelUpOrFinishRoom(game);
}

export function triggerCorridorRoom(game) {
    const roomTemplate = RNG.choice(GAME_DATA.corridorRooms);
    const outcomeId = RNG.choice(roomTemplate.outcomeIds);
    const outcome = GAME_DATA.corridorOutcomes[outcomeId] || {
        id: "empty_default",
        text: "В коридоре тихо и пусто.",
        kind: "none",
        tone: "neutral",
    };

    let effectDesc = "";
    if (outcome.kind === "gold") {
        const delta = RNG.range(outcome.min, outcome.max);
        game.player.gold += delta;
        effectDesc = `+${delta}G`;
    } else if (outcome.kind === "heal") {
        const delta = RNG.range(outcome.min, outcome.max);
        game.player.heal(delta);
        effectDesc = `+${delta} HP`;
    } else if (outcome.kind === "xp") {
        const delta = RNG.range(outcome.min, outcome.max);
        game.player.xp += delta;
        game.player.totalRunXp += delta;
        effectDesc = `+${delta} XP`;
    } else if (outcome.kind === "en") {
        const delta = outcome.value;
        game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + delta);
        effectDesc = `+${delta} EN`;
    } else if (outcome.kind === "concentrate") {
        const delta = outcome.value;
        game.player.concentrateBonus = (game.player.concentrateBonus || 0) + delta;
        effectDesc = `+${delta} к урону (на след. удар)`;
    } else if (outcome.kind === "trap_hp") {
        const delta = RNG.range(outcome.min, outcome.max);
        game.player.hp -= delta;
        effectDesc = `-${delta} HP`;
    } else if (outcome.kind === "trap_en") {
        const delta = outcome.value;
        game.player.en = Math.max(0, game.player.en - delta);
        effectDesc = `-${delta} EN`;
    }

    const currentKey = `${game.playerPos.x},${game.playerPos.y}`;
    const roomObj = game.dungeonRooms[currentKey];
    if (roomObj) {
        roomObj.cleared = true;
    }

    game.currentCorridorResult = {
        roomId: roomTemplate.id,
        title: roomTemplate.title,
        desc: roomTemplate.desc,
        image: roomTemplate.image || null,
        outcomeText: outcome.text,
        tone: outcome.tone,
        effectDesc: effectDesc,
    };

    game.state = "CORRIDOR";
    game.saveGame("autosave");
}

export function leaveCorridorRoom(game) {
    if (game.player.hp <= 0) {
        game.calculateSouls();
        game.state = "GAMEOVER";
        return;
    }
    game.currentCorridorResult = null;
    checkLevelUpOrFinishRoom(game);
}

export function grantRandomArtifact(game, minRarity = null) {
    const cfg = GAME_DATA.cursedConfig;
    const hasMerged = game.player.hasArtifact(cfg.mergedArtifactId);
    const curseChance = Math.min(12, (game.fountainCursesCount || 0) * cfg.fountainChanceStep);
    const unownedCursed = hasMerged
        ? []
        : GAME_DATA.items.artifacts.filter(
            a => !a.excludeFromDrop && a.rarity === cfg.cursedRarity && !game.player.hasArtifact(a.id),
        );

    if (!game.pendingArtifact && curseChance > 0 && unownedCursed.length > 0 && RNG.chance(curseChance)) {
        const cursedArt = RNG.choice(unownedCursed);
        game.pendingArtifact = { ...cursedArt };
        return cursedArt;
    }

    const unowned = GAME_DATA.items.artifacts.filter(
        a => !a.excludeFromDrop && a.rarity !== cfg.cursedRarity && !game.player.hasArtifact(a.id),
    );
    if (unowned.length === 0) return null;
    const art = pickItemByRarity(unowned, game.floor, minRarity);
    if (!art) return null;
    game.player.addArtifact(art);
    return art;
}

export function pickItemByRarity(items, floor = 0, minRarity = null) {
    if (!items || items.length === 0) return null;

    const rarityOrder = GAME_DATA.rarityOrder;
    if (minRarity && !rarityOrder.includes(minRarity)) {
        throw new Error(`Unknown minRarity: ${minRarity}`);
    }

    const weightsByFloor = GAME_DATA.rarityWeightsByFloor;
    const floorIndex = Math.min(Math.max(Number(floor) || 0, 0), weightsByFloor.length - 1);
    const weights = weightsByFloor[floorIndex];
    const minIndex = minRarity ? rarityOrder.indexOf(minRarity) : 0;
    const allowedRarities = rarityOrder.slice(minIndex);

    const weightedPools = [];
    for (const rarity of allowedRarities) {
        const weight = weights[rarity] || 0;
        if (weight <= 0) continue;
        const pool = items.filter(item => item.rarity === rarity);
        if (pool.length > 0) {
            weightedPools.push({ weight, pool });
        }
    }

    if (weightedPools.length > 0) {
        const selected = RNG.weightedChoice(weightedPools);
        return RNG.choice(selected.pool);
    }

    const allowedPool = items.filter(item => allowedRarities.includes(item.rarity));
    if (allowedPool.length > 0) {
        return RNG.choice(allowedPool);
    }

    return RNG.choice(items);
}

function openEventRewards(game, { gold = 0, effects = [], items = [], notes = [] }) {
    game.eventRewards = {
        gold,
        effects,
        items,
        notes,
    };
    game.state = "EVENT_REWARDS";
    game.saveGame("autosave");
}

function startEliteEventWithArtifact(game, bonusGold, sourceText) {
    game.player.gold += bonusGold;
    const art = grantRandomArtifact(game);
    const isPendingCursed = Boolean(game.pendingArtifact && art && game.pendingArtifact.id === art.id);
    game.setupBattle("elite");
    if (!isPendingCursed) {
        if (art) {
            game.battleRewards.items.push(formatArtifactLine(art));
            game.battleLog.unshift(`💍 ${sourceText}: +${bonusGold}G и [${art.rarity}] ${art.name} (${art.desc})`);
        } else {
            game.battleLog.unshift(`💰 ${sourceText}: +${bonusGold}G (все доступные артефакты уже собраны).`);
        }
    } else {
        game.battleLog.unshift(`💰 ${sourceText}: +${bonusGold}G. Внутри таится проклятая реликвия!`);
    }
    game.saveGame("autosave");
}

function collectEventArtifact(game, items, notes) {
    const art = grantRandomArtifact(game);
    if (!art) {
        notes.push("💍 Все доступные артефакты уже собраны.");
        return null;
    }
    const isPendingCursed = Boolean(game.pendingArtifact && game.pendingArtifact.id === art.id);
    if (!isPendingCursed) {
        items.push(formatArtifactLine(art));
    }
    return art;
}

function collectRandomEventPerk(game, items, effects, notes) {
    const available = GAME_DATA.perks.filter(p => !game.player.perks.includes(p.id));
    const picked = pickItemByRarity(available, game.floor);
    if (!picked) {
        notes.push("✨ Все доступные перки уже изучены.");
        return null;
    }
    const potionsBefore = game.player.inventory.potions.length;
    const slotsBefore = game.player.potionSlots;
    game.player.addPerk(picked.id, game.floor);
    items.push(formatPerkLine(picked));
    if (game.player.potionSlots > slotsBefore) {
        effects.push(`🧪 +${game.player.potionSlots - slotsBefore} Слот пояса зелий`);
    }
    game.player.inventory.potions.slice(potionsBefore).forEach(pot => {
        items.push(formatPotionLine(pot));
    });
    return picked;
}

function collectRandomPotions(game, count, items, notes) {
    let overflowCount = 0;
    for (let i = 0; i < count; i++) {
        const pot = grantRandomPotion(game);
        if (pot) {
            items.push(formatPotionLine(pot));
        } else {
            overflowCount++;
        }
    }
    if (overflowCount > 0) {
        notes.push(
            overflowCount === 1
                ? "🧪 Пояс зелий полон — новое зелье не поместилось."
                : `🧪 Пояс зелий полон — не поместилось зелий: ${overflowCount}.`,
        );
    }
}

function formatArtifactLine(art) {
    return `💍 [${art.rarity}] Артефакт: ${art.name} (${art.desc})`;
}

function formatPotionLine(pot) {
    return `🧪 [${pot.rarity}] Зелье: ${pot.name} (${pot.desc})`;
}

function formatPerkLine(perk) {
    return `✨ [${perk.rarity}] Перк: ${perk.name} (${perk.desc})`;
}

function grantRandomPotion(game) {
    if (game.player.inventory.potions.length >= game.player.potionSlots) return null;
    const pot = pickItemByRarity(GAME_DATA.items.potions, game.floor);
    if (!pot) return null;
    const copy = { ...pot };
    game.player.inventory.potions.push(copy);
    return copy;
}
