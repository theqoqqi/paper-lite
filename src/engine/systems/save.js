import { Player } from "../player.js";
import { ABYSS_START_FLOOR } from "../../data/index.js";
import { RNG } from "../../utils/rng.js";
import { onGameLoaded, clearActiveReplay, updateActiveReplaySnapshot } from "./replay.js";

const META_STORAGE_KEY = "roguelite_meta_v4";
const SLOT_PREFIX = "roguelite_slot_";
const UID_VALID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

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
    if (ensurePlayerUid(game)) {
        saveMeta(game);
    }
}

export function saveMeta(game) {
    if (game.isReplayMode) return;
    ensurePlayerUid(game);
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
        enteredAbyss: Boolean(game.enteredAbyss),
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
        scoutCooldown: game.scoutCooldown || 0,
        scoutSession: game.scoutSession || null,
        shopRerollCount: game.shopRerollCount || 0,
        seed: game.seed ?? RNG.getSeed(),
        rngState: RNG.getState(),
    });
}

export function saveGame(game, slotKey = "autosave") {
    if (game.isReplayMode) return null;
    if (!game.player) return serializeState(game);
    if (slotKey === "autosave" && (game.state === "VICTORY" || game.state === "GAMEOVER")) {
        localStorage.removeItem(`${SLOT_PREFIX}autosave`);
        return null;
    }
    const json = serializeState(game);
    localStorage.setItem(`${SLOT_PREFIX}${slotKey}`, json);
    if (slotKey === "autosave") {
        updateActiveReplaySnapshot(json);
    }
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

        game.sessionGeneration = (game.sessionGeneration || 0) + 1;
        if (!game.isReplayMode) {
            loadMeta(game);
        } else if (data.meta) {
            game.meta = Object.assign(JSON.parse(JSON.stringify(game.defaultMeta)), data.meta);
        }
        if (data.seed !== undefined && data.seed !== null) {
            game.seed = data.seed;
            RNG.setState(data.rngState ?? data.seed, data.seed);
        } else {
            game.seed = RNG.setSeed(null);
        }
        game.player = Object.assign(new Player(data.player.classId || "wanderer"), data.player);
        if (!game.player.inventory.artifacts) game.player.inventory.artifacts = [];
        if (!game.player.cooldowns) {
            game.player.cooldowns = { defend: 0, heavy: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
        }

        game.floor = data.floor || 0;
        game.room = data.room || 1;
        game.state = data.state || "MAP";
        game.enteredAbyss = Boolean(data.enteredAbyss || game.floor >= ABYSS_START_FLOOR);
        game.enemies = data.enemies || [];
        game.selectedTargetIndex = data.selectedTargetIndex || 0;
        game.battleTurn = data.battleTurn || 1;
        game.enrageAnnounced = Boolean(data.enrageAnnounced || game.battleTurn >= 11 || game.floor >= ABYSS_START_FLOOR);
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
        game.scoutCooldown = data.scoutCooldown || 0;
        game.scoutSession = data.scoutSession || null;
        game.shopRerollCount = data.shopRerollCount || 0;
        if (!game.isReplayMode) {
            onGameLoaded(game, slotKeyOrJson);
        }
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
        const floorNum = (d.floor || 0) + 1;
        const locationText = d.state === "ABYSS_CHOICE"
            ? "Развилка после Малкора"
            : `${(d.floor || 0) >= ABYSS_START_FLOOR ? "Бездна: " : ""}Этаж ${floorNum} (${clearedCount}/${totalCount} комн.)`;
        return `${d.player.className} (Ур.${d.player.level}) | ${locationText} | 💰${d.player.gold}G [${dateStr}]`;
    } catch (e) {
        return null;
    }
}

export function deleteSlot(slotKey) {
    localStorage.removeItem(`${SLOT_PREFIX}${slotKey}`);
}

export function hardResetAll(game) {
    const preservedUid = isValidPlayerUid(game.meta?.uid) ? game.meta.uid : generatePlayerUid();
    localStorage.removeItem(META_STORAGE_KEY);
    ["autosave", "slot1", "slot2", "slot3"].forEach(k => localStorage.removeItem(`${SLOT_PREFIX}${k}`));
    clearActiveReplay();
    game.meta = JSON.parse(JSON.stringify(game.defaultMeta));
    game.meta.uid = preservedUid;
    saveMeta(game);
    game.player = null;
    game.state = "MENU";
}

function ensurePlayerUid(game) {
    if (!game.meta || typeof game.meta !== "object") return false;
    if (isValidPlayerUid(game.meta.uid)) return false;
    game.meta.uid = generatePlayerUid();
    return true;
}

function isValidPlayerUid(value) {
    return typeof value === "string" && UID_VALID_REGEX.test(value);
}

function generatePlayerUid() {
    let randomPart = "";
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(6);
        crypto.getRandomValues(bytes);
        randomPart = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    } else {
        randomPart = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
    }
    return `plr_${Date.now()}_${randomPart}`;
}
