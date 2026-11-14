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
        return `Артефакт: [${art.rarity}] ${art.name}`;
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

export function finishRoom(game) {
    const currentKey = `${game.playerPos.x},${game.playerPos.y}`;
    const roomObj = game.dungeonRooms[currentKey];
    if (roomObj) {
        roomObj.cleared = true;
    }
    game.currentCorridorResult = null;

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
        const art = grantRandomArtifact(game);
        const items = formatArtifactReward(art);
        game.eventRewards = {
            gold: 0,
            items: items,
        };
        game.state = "EVENT_REWARDS";
        game.saveGame("autosave");
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
        grantRandomPotion(game);
    } else if (optionId === "chest_open") {
        if (RNG.chance(50)) {
            game.setupBattle("mimic");
            game.saveGame("autosave");
            return;
        } else {
            game.player.gold += 15;
            const loot = grantRandomEquipment(game, "event");
            game.eventRewards = {
                gold: 15,
                items: loot ? [loot] : [],
            };
            game.state = "EVENT_REWARDS";
            game.saveGame("autosave");
            return;
        }
    } else if (optionId === "lib_xp") {
        game.player.xp += 12;
        game.player.totalRunXp += 12;
    } else if (optionId === "lib_perk") {
        if (game.player.hp <= 6) return;
        game.player.hp -= 6;
        const available = GAME_DATA.perks.filter(p => !game.player.perks.includes(p.id));
        const picked = pickItemByRarity(available, game.floor);
        if (picked) game.player.addPerk(picked.id, game.floor);
    } else if (optionId === "gamble_play") {
        if (game.player.gold < 8) return;
        game.player.gold -= 8;
        let wonGold = 0;
        const wonItems = [];
        if (RNG.chance(50)) {
            wonGold = 20;
            game.player.gold += 20;
            const pot = grantRandomPotion(game);
            if (pot) {
                wonItems.push(`🧪 [${pot.rarity}] Зелье: ${pot.name}`);
            }
        }
        game.eventRewards = {
            gold: wonGold,
            items: wonItems.length > 0 ? wonItems : (wonGold === 0 ? ["Ничего не выиграно! Бес забирает ставку."] : []),
        };
        game.state = "EVENT_REWARDS";
        game.saveGame("autosave");
        return;
    } else if (optionId === "gamble_rob") {
        if (game.player.hp <= 4) return;
        game.player.hp -= 4;
        game.player.gold += 9;
    } else if (optionId === "lab_potions") {
        game.player.potionSlots += 1;
        for (let i = 0; i < 2; i++) {
            grantRandomPotion(game);
        }
    } else if (optionId === "lab_mutagen") {
        game.player.baseMaxHp += 7;
        game.player.hp = Math.max(1, game.player.hp - 3);
    } else if (optionId === "soul_sell_hp") {
        if (game.player.baseMaxHp <= 5) return;
        game.player.baseMaxHp = Math.max(6, game.player.baseMaxHp - 5);
        game.player.clampHp();
        game.player.gold += 18;
        const art = grantRandomArtifact(game);
        const items = formatArtifactReward(art);
        game.eventRewards = {
            gold: 18,
            items: items,
        };
        game.state = "EVENT_REWARDS";
        game.saveGame("autosave");
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
        const art = grantRandomArtifact(game);
        const items = formatArtifactReward(art);
        game.eventRewards = {
            gold: 0,
            items: items,
        };
        game.state = "EVENT_REWARDS";
        game.saveGame("autosave");
        return;
    } else if (optionId === "pilgrim_help") {
        if (game.player.hp <= 5) return;
        game.player.hp -= 5;
        game.player.weaponUpgradeLvl += 1;
        game.player.xp += 8;
        game.player.totalRunXp += 8;
    } else if (optionId === "pilgrim_rob") {
        game.player.gold += 15;
        grantRandomPotion(game);
    } else if (optionId === "cauldron_drink") {
        if (RNG.chance(50)) {
            game.player.baseMaxHp += 8;
            game.player.heal(8);
        } else {
            game.player.hp = Math.max(1, game.player.hp - 6);
        }
    } else if (optionId === "cauldron_potion") {
        grantRandomPotion(game);
    } else if (optionId === "cauldron_gold") {
        game.player.gold += 12;
    } else if (optionId === "monolith_perk") {
        if (game.player.hp <= 7) return;
        game.player.hp -= 7;
        const available = GAME_DATA.perks.filter(p => !game.player.perks.includes(p.id));
        const picked = pickItemByRarity(available, game.floor);
        if (picked) game.player.addPerk(picked.id, game.floor);
    } else if (optionId === "monolith_pray") {
        game.player.en = game.player.getTotalMaxEn();
        game.player.xp += 15;
        game.player.totalRunXp += 15;
    } else if (optionId === "sarcophagus_fight") {
        game.player.gold += 20;
        grantRandomArtifact(game);
        game.setupBattle("elite");
        game.saveGame("autosave");
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
        game.eventRewards = {
            gold: won ? 22 : 0,
            items: won ? [] : ["Проигрыш в кости (-10G)"],
        };
        game.state = "EVENT_REWARDS";
        game.saveGame("autosave");
        return;
    } else if (optionId === "pawn_blood") {
        if (game.player.hp <= 8) return;
        game.player.hp -= 8;
        game.player.gold += 18;
    } else if (optionId === "pawn_relic") {
        if (game.player.gold < 20) return;
        game.player.gold -= 20;
        const art = grantRandomArtifact(game);
        const items = formatArtifactReward(art);
        game.eventRewards = {
            gold: 0,
            items: items,
        };
        game.state = "EVENT_REWARDS";
        game.saveGame("autosave");
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
        grantRandomPotion(game);
    } else if (optionId === "nest_hunt") {
        game.player.gold += 15;
        grantRandomArtifact(game);
        game.setupBattle("elite");
        game.saveGame("autosave");
        return;
    }

    checkLevelUpOrFinishRoom(game);
}

export function resolveCampfire(game, choice) {
    if (choice === "heal") {
        const mult = game.player.perks.includes("p28") ? 0.7 : 0.45;
        if (game.player.perks.includes("p28")) game.player.gold += 8;
        game.player.heal(Math.ceil(game.player.getTotalMaxHp() * mult));
    } else if (choice === "sharpen") {
        game.player.weaponUpgradeLvl += 1;
    } else if (choice === "meditate") {
        game.player.baseMaxHp += 4;
        game.player.heal(4);
    }
    finishRoom(game);
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
    const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
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

function formatArtifactReward(art) {
    return art ? [`💍 [${art.rarity}] Артефакт: ${art.name} (${art.desc})`] : [];
}

function grantRandomPotion(game) {
    if (game.player.inventory.potions.length >= game.player.potionSlots) return null;
    const pot = pickItemByRarity(GAME_DATA.items.potions, game.floor);
    if (!pot) return null;
    const copy = { ...pot };
    game.player.inventory.potions.push(copy);
    return copy;
}
