import { Player } from "../player.js";

const META_STORAGE_KEY = "roguelite_meta_v4";
const SLOT_PREFIX = "roguelite_slot_";

export function loadMeta(game) {
    const saved = localStorage.getItem(META_STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            game.meta = Object.assign(JSON.parse(JSON.stringify(game.defaultMeta)), parsed);
        } catch (e) {
            console.error(e);
        }
    }
}

export function saveMeta(game) {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(game.meta));
}

export function serializeState(game) {
    return JSON.stringify({
        timestamp: Date.now(),
        meta: game.meta,
        player: game.player,
        floor: game.floor,
        room: game.room,
        state: game.state,
        enemies: game.enemies,
        selectedTargetIndex: game.selectedTargetIndex,
        battleTurn: game.battleTurn,
        enrageAnnounced: Boolean(game.enrageAnnounced),
        battleFinished: game.battleFinished,
        battleRewards: game.battleRewards,
        playerPos: game.playerPos,
        dungeonRooms: game.dungeonRooms,
        bossRoomId: game.bossRoomId,
        currentEventId: game.currentEventId,
        shopOffers: game.shopOffers,
        rerollCost: game.rerollCost,
        selectedPerkChoices: game.selectedPerkChoices,
        battleLog: game.battleLog,
        pendingEquipment: game.pendingEquipment,
        pendingArtifact: game.pendingArtifact || null,
        fountainCursesCount: game.fountainCursesCount || 0,
        fountainEclipseCount: game.fountainEclipseCount || 0,
        fountainResult: game.fountainResult || null,
        eventRewards: game.eventRewards,
        currentCorridorResult: game.currentCorridorResult,
    });
}

export function saveGame(game, slotKey = "autosave") {
    if (!game.player) return serializeState(game);
    if (slotKey === "autosave" && (game.state === "VICTORY" || game.state === "GAMEOVER")) {
        localStorage.removeItem(`${SLOT_PREFIX}autosave`);
        return null;
    }
    const json = serializeState(game);
    localStorage.setItem(`${SLOT_PREFIX}${slotKey}`, json);
    return json;
}

export function loadGame(game, slotKeyOrJson = "autosave") {
    try {
        let raw = slotKeyOrJson;
        if (!slotKeyOrJson.trim().startsWith("{")) {
            raw = localStorage.getItem(`${SLOT_PREFIX}${slotKeyOrJson}`);
        }
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || !data.player) return false;

        loadMeta(game);
        game.player = Object.assign(new Player(data.player.classId || "wanderer"), data.player);
        if (!game.player.inventory.artifacts) game.player.inventory.artifacts = [];
        if (!game.player.cooldowns) {
            game.player.cooldowns = { defend: 0, heavy: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
        }

        game.floor = data.floor || 0;
        game.room = data.room || 1;
        game.state = data.state || "MAP";
        game.enemies = data.enemies || [];
        game.selectedTargetIndex = data.selectedTargetIndex || 0;
        game.battleTurn = data.battleTurn || 1;
        game.enrageAnnounced = Boolean(data.enrageAnnounced || game.battleTurn >= 11);
        game.battleFinished = Boolean(data.battleFinished);
        game.battleRewards = data.battleRewards || { xp: 0, gold: 0, items: [] };
        game.isProcessingTurn = false;
        game.playerPos = data.playerPos || { x: 0, y: 0 };
        game.dungeonRooms = data.dungeonRooms || {};
        game.bossRoomId = data.bossRoomId || null;
        if (Object.keys(game.dungeonRooms).length === 0) {
            game.generateFloorMap();
        }
        game.currentEventId = data.currentEventId || "altar";
        game.shopOffers = data.shopOffers || [];
        game.rerollCost = data.rerollCost || 5;
        game.selectedPerkChoices = data.selectedPerkChoices || [];
        game.battleLog = data.battleLog || [];
        game.pendingEquipment = data.pendingEquipment || null;
        game.pendingArtifact = data.pendingArtifact || null;
        game.fountainCursesCount = data.fountainCursesCount || 0;
        game.fountainEclipseCount = data.fountainEclipseCount || 0;
        game.fountainResult = data.fountainResult || null;
        game.shopMergedNotice = null;
        game.eventRewards = data.eventRewards || null;
        game.currentCorridorResult = data.currentCorridorResult || null;
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export function getSlotSummary(slotKey) {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${slotKey}`);
    if (!raw) return null;
    try {
        const d = JSON.parse(raw);
        if (!d || !d.player) return null;
        if (d.state === "VICTORY" || d.state === "GAMEOVER") return null;
        const dateStr = d.timestamp ? new Date(d.timestamp).toLocaleString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
        }) : "";
        const clearedCount = d.dungeonRooms ? Object.values(d.dungeonRooms).filter(r => r.cleared && r.type !== "corridor").length : (d.room || 1);
        const totalCount = d.dungeonRooms ? Object.values(d.dungeonRooms).filter(r => r.type !== "corridor").length : 10;
        return `${d.player.className} (Ур.${d.player.level}) | Этаж ${d.floor + 1} (${clearedCount}/${totalCount} комн.) | 💰${d.player.gold}G [${dateStr}]`;
    } catch (e) {
        return null;
    }
}

export function deleteSlot(slotKey) {
    localStorage.removeItem(`${SLOT_PREFIX}${slotKey}`);
}

export function hardResetAll(game) {
    localStorage.removeItem(META_STORAGE_KEY);
    ["autosave", "slot1", "slot2", "slot3"].forEach(k => localStorage.removeItem(`${SLOT_PREFIX}${k}`));
    game.meta = JSON.parse(JSON.stringify(game.defaultMeta));
    game.player = null;
    game.state = "MENU";
}
