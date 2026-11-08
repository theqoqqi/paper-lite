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
    const tier = game.floor >= 2 ? 2 : 1;
    const roll = RNG.range(1, 3);
    if (roll === 1) {
        const pool = GAME_DATA.items.weapons.filter(w => w.tier === tier);
        const item = RNG.choice(pool);
        game.pendingEquipment = {
            type: "weapon",
            item: { ...item },
            origin: origin,
        };
        return `Оружие: ${item.name} (${item.desc})`;
    } else if (roll === 2) {
        const pool = GAME_DATA.items.armors.filter(a => a.tier === tier);
        const item = RNG.choice(pool);
        game.pendingEquipment = {
            type: "armor",
            item: { ...item },
            origin: origin,
        };
        return `Броня: ${item.name} (${item.desc})`;
    } else {
        const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
        if (unowned.length > 0) {
            const art = RNG.choice(unowned);
            game.player.addArtifact(art);
            return `Артефакт: ${art.name}`;
        } else {
            game.player.gold += 15;
            return "Сундук золота (+15G)";
        }
    }
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
            game.floor++;
            game.generateFloorMap();
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
    const available = GAME_DATA.perks.filter(p => !game.player.perks.includes(p.id));
    game.selectedPerkChoices = RNG.shuffle(available).slice(0, 3);
}

export function choosePerk(game, perkId) {
    const req = game.player.getRequiredXp();
    game.player.xp = Math.max(0, game.player.xp - req);
    game.player.level++;
    game.player.perks.push(perkId);

    game.player.baseMaxHp += 3;
    game.player.heal(6);
    if (perkId === "p23") {
        game.player.heal(10);
    }
    checkLevelUpOrFinishRoom(game);
}

export function resolveEventOption(game, optionId) {
    if (optionId === "altar_hp") {
        game.player.hp = Math.max(1, game.player.hp - 6);
        game.player.baseAtk += 1;
    } else if (optionId === "altar_gold") {
        if (game.player.gold >= 12) {
            game.player.gold -= 12;
            const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
            if (unowned.length > 0) game.player.addArtifact(RNG.choice(unowned));
        }
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
        if (game.player.inventory.potions.length < game.player.potionSlots) {
            game.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
        }
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
        game.player.hp = Math.max(1, game.player.hp - 6);
        const available = GAME_DATA.perks.filter(p => !game.player.perks.includes(p.id));
        if (available.length > 0) game.player.perks.push(RNG.choice(available).id);
    } else if (optionId === "gamble_play") {
        if (game.player.gold >= 8) {
            game.player.gold -= 8;
            if (RNG.chance(50)) {
                game.player.gold += 20;
                if (game.player.inventory.potions.length < game.player.potionSlots) {
                    game.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
                }
            }
        }
    } else if (optionId === "gamble_rob") {
        game.player.hp = Math.max(1, game.player.hp - 4);
        game.player.gold += 9;
    } else if (optionId === "lab_potions") {
        game.player.potionSlots += 1;
        for (let i = 0; i < 2; i++) {
            if (game.player.inventory.potions.length < game.player.potionSlots) {
                game.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
            }
        }
    } else if (optionId === "lab_mutagen") {
        game.player.baseMaxHp += 7;
        game.player.hp = Math.max(1, game.player.hp - 3);
    } else if (optionId === "soul_sell_hp") {
        game.player.baseMaxHp = Math.max(6, game.player.baseMaxHp - 5);
        game.player.clampHp();
        game.player.gold += 18;
        const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
        if (unowned.length > 0) game.player.addArtifact(RNG.choice(unowned));
    } else if (optionId === "soul_buy_souls") {
        if (game.player.gold >= 12) {
            game.player.gold -= 12;
            game.meta.souls += 10;
            game.saveMeta();
        }
    } else if (optionId === "arena_fight") {
        game.player.gold += 10;
        game.setupBattle("elite");
        game.saveGame("autosave");
        return;
    } else if (optionId === "well_gold") {
        if (game.player.gold >= 10) {
            game.player.gold -= 10;
            game.player.heal(12);
            game.player.xp += 10;
            game.player.totalRunXp += 10;
        }
    } else if (optionId === "well_blood") {
        game.player.hp = Math.max(1, game.player.hp - 6);
        const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
        if (unowned.length > 0) game.player.addArtifact(RNG.choice(unowned));
    } else if (optionId === "pilgrim_help") {
        game.player.hp = Math.max(1, game.player.hp - 5);
        game.player.weaponUpgradeLvl += 1;
        game.player.xp += 8;
        game.player.totalRunXp += 8;
    } else if (optionId === "pilgrim_rob") {
        game.player.gold += 15;
        if (game.player.inventory.potions.length < game.player.potionSlots) {
            game.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
        }
    } else if (optionId === "cauldron_drink") {
        if (RNG.chance(50)) {
            game.player.baseMaxHp += 8;
            game.player.heal(8);
        } else {
            game.player.hp = Math.max(1, game.player.hp - 6);
        }
    } else if (optionId === "cauldron_potion") {
        if (game.player.inventory.potions.length < game.player.potionSlots) {
            game.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
        }
    } else if (optionId === "cauldron_gold") {
        game.player.gold += 12;
    } else if (optionId === "monolith_perk") {
        game.player.hp = Math.max(1, game.player.hp - 7);
        const available = GAME_DATA.perks.filter(p => !game.player.perks.includes(p.id));
        if (available.length > 0) game.player.perks.push(RNG.choice(available).id);
    } else if (optionId === "monolith_pray") {
        game.player.en = game.player.getTotalMaxEn();
        game.player.xp += 15;
        game.player.totalRunXp += 15;
    } else if (optionId === "sarcophagus_fight") {
        game.player.gold += 20;
        const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
        if (unowned.length > 0) game.player.addArtifact(RNG.choice(unowned));
        game.setupBattle("elite");
        game.saveGame("autosave");
        return;
    } else if (optionId === "sarcophagus_pray") {
        if (game.player.gold >= 8) {
            game.player.gold -= 8;
            game.player.baseMaxHp += 5;
            game.player.heal(5);
        }
    } else if (optionId === "pawn_dice") {
        if (game.player.gold >= 10) {
            game.player.gold -= 10;
            if (RNG.chance(50)) {
                game.player.gold += 22;
            }
        }
    } else if (optionId === "pawn_blood") {
        game.player.hp = Math.max(1, game.player.hp - 8);
        game.player.gold += 18;
    } else if (optionId === "pawn_relic") {
        if (game.player.gold >= 20) {
            game.player.gold -= 20;
            const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
            if (unowned.length > 0) game.player.addArtifact(RNG.choice(unowned));
        }
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
        if (game.player.inventory.potions.length < game.player.potionSlots) {
            game.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
        }
    } else if (optionId === "nest_hunt") {
        game.player.gold += 15;
        const unowned = GAME_DATA.items.artifacts.filter(a => !game.player.hasArtifact(a.id));
        if (unowned.length > 0) game.player.addArtifact(RNG.choice(unowned));
        game.setupBattle("elite");
        game.saveGame("autosave");
        return;
    }

    checkLevelUpOrFinishRoom(game);
}

export function resolveCampfire(game, choice) {
    if (choice === "heal") {
        const mult = game.player.perks.includes("p28") ? 0.7 : 0.45;
        if (game.player.perks.includes("p28")) game.player.gold += 6;
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
