import { DATA_CLASSES, DATA_SKILLS, DATA_META_UPGRADES, getMetaUpgradeCap } from "./classes.js";
import { DATA_MUTATIONS, DATA_FLOORS, DATA_ENEMIES, ABYSS_START_FLOOR, getEnemyNativeFloor, getFloorMeta } from "./enemies.js";
import {
    DATA_PERKS,
    DATA_ITEMS,
    DATA_RARITY_ORDER,
    DATA_RARITY_COLORS,
    DATA_RARITY_WEIGHTS_BY_FLOOR,
    DATA_CURSED_CONFIG,
} from "./items.js";
import { DATA_EVENTS } from "./events.js";
import { DATA_CORRIDOR_ROOMS, DATA_CORRIDOR_OUTCOMES } from "./corridors.js";

export const GAME_DATA = {
    classes: DATA_CLASSES,
    skillsInfo: DATA_SKILLS,
    metaUpgrades: DATA_META_UPGRADES,
    mutations: DATA_MUTATIONS,
    floors: DATA_FLOORS,
    enemies: DATA_ENEMIES,
    perks: DATA_PERKS,
    items: DATA_ITEMS,
    rarityOrder: DATA_RARITY_ORDER,
    rarityColors: DATA_RARITY_COLORS,
    rarityWeightsByFloor: DATA_RARITY_WEIGHTS_BY_FLOOR,
    cursedConfig: DATA_CURSED_CONFIG,
    events: DATA_EVENTS,
    corridorRooms: DATA_CORRIDOR_ROOMS,
    corridorOutcomes: DATA_CORRIDOR_OUTCOMES,
};

export {
    ABYSS_START_FLOOR,
    getEnemyNativeFloor,
    getFloorMeta,
    getMetaUpgradeCap,
};
