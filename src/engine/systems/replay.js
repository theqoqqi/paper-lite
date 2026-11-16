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

const BASE_STEP_DELAY = 700;
const REPLAY_SPEEDS = [1, 2, 4, 8];

const REPLAY_ACTION_HANDLERS = {
    move: (game, p) => game.moveToRoom(p.x, p.y),
    scout_start: (game) => game.scoutSurroundings(),
    scout_action: (game, p) => game.resolveScoutAction(p),
    scout_finish: (game) => game.finishScoutSession(),
    target: (game, p) => game.selectTarget(p),
    skill: (game, p, render) => game.playerAction(p, render),
    potion: (game, p, render) => game.usePotion(p, render),
    potion_discard: (game, p) => game.discardPotion(p),
    equip_accept: (game) => game.resolveEquipChoice(),
    equip_salvage: (game) => game.resolveSalvageChoice(),
    artifact_choice: (game, p) => game.resolvePendingArtifact(p),
    battle_proceed: (game) => game.proceedAfterBattle(),
    perk: (game, p) => game.choosePerk(p),
    event_option: (game, p) => game.resolveEventOption(p),
    event_proceed: (game) => game.proceedAfterEventRewards(),
    campfire: (game, p) => game.resolveCampfire(p),
    corridor_leave: (game) => game.leaveCorridorRoom(),
    fountain_choice: (game, p) => game.resolveFountainChoice(p),
    fountain_leave: (game) => game.leaveFountainRoom(),
    shop_buy: (game, p) => game.buyShopOffer(p),
    shop_reroll: (game) => game.rerollShop(),
    shop_leave: (game) => game.leaveShop(),
    shop_reenter: (game) => game.reenterShop(),
    descend_floor: (game) => game.descendToNextFloor(),
    abyss_open: (game) => game.openAbyssChoice(),
    abyss_enter: (game) => game.enterAbyssFromChoice(),
    abyss_map: (game) => game.returnFromAbyssChoiceToMap(),
    abyss_victory: (game) => game.finishVictoryFromAbyssChoice(),
};

export function applyReplayAction(game, action, render) {
    if (!game || !action) return false;
    const handler = REPLAY_ACTION_HANDLERS[action.t];
    if (!handler) {
        console.warn("Unknown replay action:", action);
        return false;
    }
    handler(game, action.p, render);
    return true;
}

export class ReplayPlayer {
    constructor() {
        this.game = null;
        this.renderFn = null;
        this.replay = null;
        this.currentStep = 0;
        this.isPlaying = false;
        this.isCollapsed = false;
        this.isSettingsOpen = false;
        this._sessionId = 0;
        this._timerId = null;
    }

    _clearTimer() {
        if (this._timerId !== null) {
            clearTimeout(this._timerId);
            this._timerId = null;
        }
    }

    _resetSoundFlags(game) {
        game._victorySoundPlayed = false;
        game._endSoundPlayed = false;
        game._abyssChoiceSoundPlayed = false;
        game._levelUpSoundPlayed = false;
    }

    startPlayback(game, replay, renderFn) {
        if (!game || !replay || !replay.initialState || !Array.isArray(replay.actions)) {
            return false;
        }
        this._clearTimer();
        this._sessionId++;

        if (!game.isReplayMode) {
            game._preReplayBackup = {
                state: game.state,
                hasPlayer: Boolean(game.player),
                snapshot: game.player ? game.serializeState() : null,
            };
        }

        game.isReplayMode = true;
        this.game = game;
        this.renderFn = renderFn;
        this.replay = replay;
        this.currentStep = 0;
        this.isPlaying = false;
        this.isCollapsed = false;
        this.isSettingsOpen = false;

        const loaded = game.loadGame(JSON.stringify(replay.initialState));
        if (!loaded) {
            this.stopPlayback();
            return false;
        }
        this._resetSoundFlags(game);
        if (this.renderFn) this.renderFn();
        return true;
    }

    restartPlayback() {
        if (!this.game || !this.replay) return;
        this._clearTimer();
        this._sessionId++;
        this.isPlaying = false;
        this.currentStep = 0;
        this.game.loadGame(JSON.stringify(this.replay.initialState));
        this._resetSoundFlags(this.game);
        if (this.renderFn) this.renderFn();
    }

    resumePlayback() {
        if (!this.game || !this.replay) return;
        if (this.currentStep >= this.replay.actions.length) {
            this.restartPlayback();
        }
        if (this.replay.actions.length === 0) return;
        this._clearTimer();
        const sid = ++this._sessionId;
        this.isPlaying = true;
        if (this.renderFn) this.renderFn();
        this._scheduleNextStep(sid, true);
    }

    pausePlayback() {
        this._clearTimer();
        this._sessionId++;
        this.isPlaying = false;
        if (this.renderFn) this.renderFn();
    }

    stepForward() {
        if (!this.game || !this.replay) return;
        if (this.isPlaying) {
            this.pausePlayback();
        }
        if (this.currentStep >= this.replay.actions.length) return;
        if (this.game.isProcessingTurn) {
            const sid = ++this._sessionId;
            this._waitAndSingleStep(sid);
            return;
        }
        this._executeSingleStep();
    }

    _waitAndSingleStep(sessionId) {
        if (sessionId !== this._sessionId || !this.game || !this.replay) return;
        if (this.game.isProcessingTurn) {
            this._timerId = setTimeout(() => {
                this._waitAndSingleStep(sessionId);
            }, 40);
            return;
        }
        if (this.currentStep < this.replay.actions.length) {
            this._executeSingleStep();
        }
    }

    _executeSingleStep() {
        if (!this.game || !this.replay || this.currentStep >= this.replay.actions.length) return;
        const action = this.replay.actions[this.currentStep];
        this.currentStep++;
        applyReplayAction(this.game, action, this.renderFn);
        if (this.currentStep >= this.replay.actions.length && !this.game.isProcessingTurn) {
            this.isPlaying = false;
        }
        if (this.renderFn) this.renderFn();
    }

    _scheduleNextStep(sessionId, immediate = false) {
        if (sessionId !== this._sessionId || !this.isPlaying || !this.game || !this.replay) return;
        if (this.game.isProcessingTurn) {
            this._timerId = setTimeout(() => {
                this._scheduleNextStep(sessionId, false);
            }, Math.min(50, this.game.scaleDelay(100)));
            return;
        }
        if (this.currentStep >= this.replay.actions.length) {
            this.isPlaying = false;
            if (this.renderFn) this.renderFn();
            return;
        }
        if (immediate) {
            this._executeSingleStep();
            this._waitIdleAndSchedule(sessionId);
            return;
        }
        this._timerId = setTimeout(() => {
            if (sessionId !== this._sessionId || !this.isPlaying) return;
            if (this.game.isProcessingTurn) {
                this._scheduleNextStep(sessionId, false);
                return;
            }
            if (this.currentStep >= this.replay.actions.length) {
                this.isPlaying = false;
                if (this.renderFn) this.renderFn();
                return;
            }
            this._executeSingleStep();
            this._waitIdleAndSchedule(sessionId);
        }, this.game.scaleDelay(BASE_STEP_DELAY));
    }

    _waitIdleAndSchedule(sessionId) {
        if (sessionId !== this._sessionId || !this.isPlaying || !this.game || !this.replay) return;
        if (this.game.isProcessingTurn) {
            this._timerId = setTimeout(() => {
                this._waitIdleAndSchedule(sessionId);
            }, Math.min(50, this.game.scaleDelay(100)));
            return;
        }
        if (this.currentStep >= this.replay.actions.length) {
            this.isPlaying = false;
            if (this.renderFn) this.renderFn();
            return;
        }
        this._scheduleNextStep(sessionId, false);
    }

    setSpeed(speed) {
        if (!REPLAY_SPEEDS.includes(speed)) return;
        if (this.game) {
            this.game.replaySpeed = speed;
        }
        if (this.isPlaying && !this.game?.isProcessingTurn) {
            this._clearTimer();
            const sid = ++this._sessionId;
            this._scheduleNextStep(sid, false);
        }
        if (this.renderFn) this.renderFn();
    }

    cycleSpeed() {
        const cur = this.game ? (this.game.replaySpeed || 1) : 1;
        const nextIdx = (REPLAY_SPEEDS.indexOf(cur) + 1) % REPLAY_SPEEDS.length;
        this.setSpeed(REPLAY_SPEEDS[nextIdx]);
    }

    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        if (this.isCollapsed) {
            this.isSettingsOpen = false;
        }
        if (this.renderFn) this.renderFn();
    }

    stopPlayback() {
        this._clearTimer();
        this._sessionId++;
        const game = this.game;
        const renderFn = this.renderFn;
        this.replay = null;
        this.currentStep = 0;
        this.isPlaying = false;
        this.isCollapsed = false;
        this.isSettingsOpen = false;
        this.game = null;
        this.renderFn = null;

        if (!game) return;
        game.sessionGeneration = (game.sessionGeneration || 0) + 1;
        game.isProcessingTurn = false;
        const backup = game._preReplayBackup;
        game._preReplayBackup = null;

        if (backup && backup.hasPlayer && backup.snapshot) {
            game.loadGame(backup.snapshot);
            if (backup.state) game.state = backup.state;
        } else {
            game.player = null;
            game.state = (backup && backup.state) || "MENU";
        }
        game.isReplayMode = false;
        game.loadMeta();
        this._resetSoundFlags(game);
        if (renderFn) renderFn();
    }
}

export const replayPlayer = new ReplayPlayer();
