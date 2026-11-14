import { RNG } from "../../utils/rng.js";
import { GAME_DATA, ABYSS_START_FLOOR, getMetaUpgradeCap } from "../../data/index.js";
import { pickItemByRarity } from "./encounter.js";

export function buyMetaUpgrade(game, key) {
    const upg = GAME_DATA.metaUpgrades.find(u => u.key === key);
    if (!upg) return;
    const currentLvl = game.meta[key] || 0;
    const cap = getMetaUpgradeCap(upg, game.meta);
    if (currentLvl >= cap) return;
    const cost = upg.costs[currentLvl];
    if (game.meta.souls >= cost) {
        game.meta.souls -= cost;
        game.meta[key] = currentLvl + 1;
        game.saveMeta();
    }
}

export function unlockClass(game, classKey) {
    const cls = GAME_DATA.classes[classKey];
    if (!cls || game.meta.unlockedClasses.includes(classKey)) return;
    if (game.meta.souls >= cls.cost) {
        game.meta.souls -= cls.cost;
        game.meta.unlockedClasses.push(classKey);
        game.saveMeta();
    }
}

export function setupShop(game) {
    const cfg = GAME_DATA.cursedConfig;
    const hasMerged = game.player.hasArtifact(cfg.mergedArtifactId);
    const curseChance = Math.min(12, (game.fountainCursesCount || 0) * cfg.fountainChanceStep);

    let availableNormalArts = GAME_DATA.items.artifacts.filter(
        a => !a.excludeFromDrop && a.rarity !== cfg.cursedRarity && !game.player.hasArtifact(a.id),
    );
    let availableCursedArts = hasMerged ? [] : GAME_DATA.items.artifacts.filter(
        a => !a.excludeFromDrop && a.rarity === cfg.cursedRarity && !game.player.hasArtifact(a.id),
    );

    const w = pickItemByRarity(GAME_DATA.items.weapons, game.floor);
    const a = pickItemByRarity(GAME_DATA.items.armors, game.floor);
    const pot1 = pickItemByRarity(GAME_DATA.items.potions, game.floor);
    const pot2Pool = pot1 ? GAME_DATA.items.potions.filter(p => p.id !== pot1.id) : GAME_DATA.items.potions;
    const pot2 = pickItemByRarity(pot2Pool, game.floor) || pot1;

    const forgeWeaponCost = scaleShopCost(14 + game.player.weaponUpgradeLvl * 10, game.floor);
    const forgeArmorCost = scaleShopCost(14 + game.player.armorUpgradeLvl * 10, game.floor);
    const healCost = scaleShopCost(5, game.floor);

    game.shopOffers = [{
        id: "heal_service", kind: "service_heal", name: "🩹 Аптечка хирурга (+12 HP)", cost: healCost, bought: false,
    }, {
        id: "forge_weapon",
        kind: "forge_w",
        name: `🔨 Заточка оружия (Ур. ${game.player.weaponUpgradeLvl + 1}: +1 ATK навсегда)`,
        cost: forgeWeaponCost,
        bought: false,
    }, {
        id: "forge_armor",
        kind: "forge_a",
        name: `🛡️ Укрепление брони (Ур. ${game.player.armorUpgradeLvl + 1}: +3 HP и +DEF)`,
        cost: forgeArmorCost,
        bought: false,
    }, {
        id: pot1.id,
        kind: "potion",
        rarity: pot1.rarity,
        item: pot1,
        name: `🧪 [${pot1.rarity}] ${pot1.name} — ${pot1.desc}`,
        cost: scaleShopCost(pot1.cost, game.floor),
        bought: false,
    }, {
        id: pot2.id,
        kind: "potion",
        rarity: pot2.rarity,
        item: pot2,
        name: `🧪 [${pot2.rarity}] ${pot2.name} — ${pot2.desc}`,
        cost: scaleShopCost(pot2.cost, game.floor),
        bought: false,
    }, {
        id: w.id,
        kind: "weapon",
        rarity: w.rarity,
        item: w,
        name: `⚔️ [${w.rarity}] ${w.name} (${w.desc})`,
        cost: scaleShopCost(w.cost, game.floor),
        bought: false,
    }, {
        id: a.id,
        kind: "armor",
        rarity: a.rarity,
        item: a,
        name: `🛡️ [${a.rarity}] ${a.name} (${a.desc})`,
        cost: scaleShopCost(a.cost, game.floor),
        bought: false,
    }];

    const shopArts = [];
    let hasCursedInShop = false;
    for (let i = 0; i < 2; i++) {
        let art = null;
        if (!hasCursedInShop && curseChance > 0 && availableCursedArts.length > 0 && RNG.chance(curseChance)) {
            art = RNG.choice(availableCursedArts);
            hasCursedInShop = true;
            availableCursedArts = availableCursedArts.filter(item => item.id !== art.id);
        } else if (availableNormalArts.length > 0) {
            art = pickItemByRarity(availableNormalArts, game.floor);
            if (art) {
                availableNormalArts = availableNormalArts.filter(item => item.id !== art.id);
            }
        }
        if (!art) break;
        shopArts.push(art);
    }
    shopArts.forEach(art => {
        game.shopOffers.push({
            id: art.id,
            kind: "artifact",
            rarity: art.rarity,
            item: art,
            name: `💍 [${art.rarity}] Артефакт: ${art.name} (${art.desc})`,
            cost: scaleShopCost(art.cost, game.floor),
            bought: false,
        });
    });
}

export function getBaseRerollCost(floor = 0) {
    return scaleShopCost(5, floor);
}

export function rerollShop(game) {
    if (game.player.gold < game.rerollCost) return;
    game.player.gold -= game.rerollCost;
    game.rerollCost += scaleShopCost(4, game.floor);
    game.previewShopOfferIndex = null;
    game.shopMergedNotice = null;
    setupShop(game);
    game.saveGame("autosave");
}

export function buyShopOffer(game, index) {
    const offer = game.shopOffers[index];
    if (!offer || offer.bought || game.player.gold < offer.cost) return;

    if (offer.kind === "potion" && game.player.inventory.potions.length >= game.player.potionSlots) {
        return;
    }

    game.previewShopOfferIndex = null;
    game.player.gold -= offer.cost;
    offer.bought = true;

    if (offer.kind === "service_heal") {
        game.player.heal(12);
    } else if (offer.kind === "forge_w") {
        game.player.weaponUpgradeLvl += 1;
    } else if (offer.kind === "forge_a") {
        game.player.armorUpgradeLvl += 1;
        game.player.heal(3);
    } else if (offer.kind === "potion") {
        game.player.inventory.potions.push({ ...offer.item });
    } else if (offer.kind === "weapon") {
        game.player.equipWeapon(offer.item);
    } else if (offer.kind === "armor") {
        game.player.equipArmor(offer.item);
    } else if (offer.kind === "artifact") {
        const mergedId = GAME_DATA.cursedConfig.mergedArtifactId;
        const hadMerged = game.player.hasArtifact(mergedId);
        game.player.addArtifact(offer.item);
        if (!hadMerged && game.player.hasArtifact(mergedId)) {
            game.shopMergedNotice = GAME_DATA.items.artifacts.find(a => a.id === mergedId) || null;
        }
    }
    game.saveGame("autosave");
}

export function calculateSouls(game) {
    const abyssDepth = Math.max(0, (game.floor || 0) - (ABYSS_START_FLOOR - 1));
    const abyssSoulBonus = abyssDepth > 0 ? abyssDepth * 20 + abyssDepth * (abyssDepth + 1) * 4 : 0;
    const earned = Math.floor(game.player.totalRunXp * 0.8) + (game.floor * 12) + Math.floor(game.player.gold / 5) + abyssSoulBonus;
    game.lastEarnedSouls = Math.max(1, earned);
    game.meta.souls += game.lastEarnedSouls;
    game.saveMeta();
    localStorage.removeItem("roguelite_slot_autosave");
}

function getAbyssPriceMultiplier(floor = 0) {
    const abyssDepth = Math.max(0, (floor || 0) - (ABYSS_START_FLOOR - 1));
    return 1 + abyssDepth * 0.4;
}

function scaleShopCost(baseCost, floor = 0) {
    return Math.max(1, Math.round(baseCost * getAbyssPriceMultiplier(floor)));
}
