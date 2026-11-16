import { RNG } from "../../utils/rng.js";

export const ACTIVE_REPLAY_KEY = "roguelite_active_replay";
export const REPLAY_HISTORY_KEY = "roguelite_replay_history";
export const MAX_REPLAY_HISTORY = 100;

function isQuotaError(err) {
    return Boolean(
        err && (
            err.name === "QuotaExceededError"
            || err.code === 22
            || err.code === 1014
        ),
    );
}

function readJsonStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        console.error(e);
        return fallback;
    }
}

function saveReplayHistory(history) {
    const list = Array.isArray(history) ? history.slice(0, MAX_REPLAY_HISTORY) : [];
    while (true) {
        try {
            localStorage.setItem(REPLAY_HISTORY_KEY, JSON.stringify(list));
            return list;
        } catch (err) {
            if (!isQuotaError(err) || list.length === 0) {
                console.error(err);
                return list;
            }
            list.pop();
        }
    }
}

function saveActiveReplay(replay) {
    const json = JSON.stringify(replay);
    try {
        localStorage.setItem(ACTIVE_REPLAY_KEY, json);
        return true;
    } catch (err) {
        if (!isQuotaError(err)) {
            console.error(err);
            return false;
        }
        const history = getReplayHistory();
        while (history.length > 0) {
            history.pop();
            saveReplayHistory(history);
            try {
                localStorage.setItem(ACTIVE_REPLAY_KEY, json);
                return true;
            } catch (retryErr) {
                if (!isQuotaError(retryErr)) {
                    console.error(retryErr);
                    return false;
                }
            }
        }
        return false;
    }
}

export function getActiveReplay() {
    const data = readJsonStorage(ACTIVE_REPLAY_KEY, null);
    if (!data || typeof data !== "object" || !Array.isArray(data.actions)) return null;
    return data;
}

export function getReplayHistory() {
    const data = readJsonStorage(REPLAY_HISTORY_KEY, []);
    return Array.isArray(data) ? data : [];
}

export function archiveActiveReplay(outcome = "INTERRUPTED") {
    const active = getActiveReplay();
    if (!active) return null;
    if (!active.actions || active.actions.length === 0) {
        localStorage.removeItem(ACTIVE_REPLAY_KEY);
        return null;
    }
    const now = Date.now();
    active.outcome = outcome;
    active.finishedAt = now;
    active.updatedAt = now;
    const history = getReplayHistory().filter(item => item && item.id !== active.id);
    history.unshift(active);
    saveReplayHistory(history);
    localStorage.removeItem(ACTIVE_REPLAY_KEY);
    return active;
}

export function startReplay(game) {
    if (!game || !game.player) return null;
    archiveActiveReplay("INTERRUPTED");

    const now = Date.now();
    const numericSeed = RNG.getSeed();
    const replay = {
        id: `rep_${now}_${numericSeed}`,
        version: 1,
        seed: game.seed ?? numericSeed,
        classId: game.player.classId,
        className: game.player.className,
        startedAt: now,
        updatedAt: now,
        finishedAt: null,
        outcome: "IN_PROGRESS",
        reachedFloor: (game.floor || 0) + 1,
        initialState: JSON.parse(game.serializeState()),
        actions: [],
    };
    saveActiveReplay(replay);
    return replay;
}

export function onGameLoaded(game, slotKeyOrJson = "autosave") {
    if (!game || !game.player) return null;
    if (slotKeyOrJson === "autosave") {
        const active = getActiveReplay();
        if (
            active
            && active.outcome === "IN_PROGRESS"
            && active.initialState
            && Array.isArray(active.actions)
            && String(active.seed) === String(game.seed)
            && active.classId === game.player.classId
        ) {
            active.updatedAt = Date.now();
            active.reachedFloor = Math.max(active.reachedFloor || 1, (game.floor || 0) + 1);
            saveActiveReplay(active);
            return active;
        }
    }
    return startReplay(game);
}

export function recordReplayAction(game, type, payload = null) {
    if (!game || !game.player) return null;
    let active = getActiveReplay();
    if (!active || !Array.isArray(active.actions) || active.outcome !== "IN_PROGRESS") {
        active = startReplay(game);
        if (!active) return null;
    }
    const seq = active.actions.length;
    active.actions.push({
        seq,
        t: type,
        p: payload === undefined ? null : payload,
    });
    active.updatedAt = Date.now();
    active.reachedFloor = Math.max(active.reachedFloor || 1, (game.floor || 0) + 1);
    saveActiveReplay(active);
    return active;
}

export function updateActiveReplaySnapshot(stateJsonOrObj) {
    const active = getActiveReplay();
    if (!active || active.outcome !== "IN_PROGRESS") return;
    try {
        active.finalState = typeof stateJsonOrObj === "string"
            ? JSON.parse(stateJsonOrObj)
            : stateJsonOrObj;
        active.updatedAt = Date.now();
        saveActiveReplay(active);
    } catch (e) {
        console.error(e);
    }
}

export function finalizeReplay(game, outcomeState = "GAMEOVER") {
    const active = getActiveReplay();
    if (!active) return null;
    const now = Date.now();
    active.outcome = outcomeState;
    active.finishedAt = now;
    active.updatedAt = now;
    if (game) {
        active.reachedFloor = Math.max(active.reachedFloor || 1, (game.floor || 0) + 1);
        if (game.player) {
            active.finalState = JSON.parse(game.serializeState());
        }
    }
    const history = getReplayHistory().filter(item => item && item.id !== active.id);
    history.unshift(active);
    saveReplayHistory(history);
    localStorage.removeItem(ACTIVE_REPLAY_KEY);
    return active;
}

export function clearActiveReplay() {
    localStorage.removeItem(ACTIVE_REPLAY_KEY);
}

export function deleteReplay(replayId) {
    const history = getReplayHistory().filter(item => item && item.id !== replayId);
    saveReplayHistory(history);
    return history;
}

export function clearReplayHistory() {
    localStorage.removeItem(REPLAY_HISTORY_KEY);
}

export function importReplayJson(rawJson) {
    const data = JSON.parse(rawJson);
    if (!data || typeof data !== "object") return null;
    if (!data.initialState || typeof data.initialState !== "object" || !data.initialState.player) {
        return null;
    }
    if (!Array.isArray(data.actions)) return null;

    const history = getReplayHistory();
    const now = Date.now();
    const initPlayer = data.initialState.player;
    const rawOutcome = data.outcome;
    const normalizedOutcome = ["VICTORY", "GAMEOVER", "INTERRUPTED"].includes(rawOutcome)
        ? rawOutcome
        : "INTERRUPTED";

    let replayId = typeof data.id === "string" && data.id.trim()
        ? data.id.trim()
        : `rep_${now}_${data.seed ?? data.initialState.seed ?? 0}`;
    if (history.some(item => item && item.id === replayId)) {
        replayId = `${replayId}_imp_${now}`;
    }

    const normalizedActions = data.actions.map((act, idx) => ({
        seq: typeof act?.seq === "number" ? act.seq : idx,
        t: String(act?.t ?? ""),
        p: act?.p === undefined ? null : act.p,
    }));

    const replay = {
        id: replayId,
        version: data.version || 1,
        seed: data.seed ?? data.initialState.seed ?? null,
        classId: data.classId || initPlayer.classId || "wanderer",
        className: data.className || initPlayer.className || "Герой",
        startedAt: data.startedAt || data.initialState.timestamp || now,
        updatedAt: data.updatedAt || now,
        finishedAt: data.finishedAt || now,
        outcome: normalizedOutcome,
        reachedFloor: data.reachedFloor || ((data.initialState.floor || 0) + 1),
        initialState: data.initialState,
        finalState: data.finalState && typeof data.finalState === "object" ? data.finalState : null,
        actions: normalizedActions,
    };

    history.unshift(replay);
    saveReplayHistory(history);
    return replay;
}

export function exportReplayToFile(replay) {
    if (!replay) return;
    const safeSeed = String(replay.seed ?? "seed").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeClass = String(replay.classId || "run").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `replay_${safeClass}_${safeSeed}_${replay.id || Date.now()}.json`;
    const blob = new Blob([JSON.stringify(replay)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
