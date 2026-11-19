const isLocal = typeof window !== "undefined"
    && ["localhost", "127.0.0.1", ""].includes(window.location?.hostname);

export const TELEMETRY_API_URL = isLocal
    ? "http://localhost:3100/api/telemetry"
    : "http://95.56.251.112:3715/api/telemetry";

const META_STORAGE_KEY = "roguelite_meta_v4";
const ACTIVE_REPLAY_KEY = "roguelite_active_replay";
const REPLAY_HISTORY_KEY = "roguelite_replay_history";
const REQUEST_TIMEOUT_MS = 8000;
const ERROR_COOLDOWN_MS = 10000;

let cachedDeviceInfoPromise = null;
let isReplayModeChecker = () => false;
let initialized = false;
let isSessionSynced = false;
let inFlight = false;
let pendingFullSync = false;
let pendingActiveSync = false;
let cooldownUntil = 0;
let cooldownTimerId = null;
let activeReplayId = null;
let activeServerActionsCount = null;
const uploadedHistoryWithoutFinalState = new Set();

export function initTelemetry(options = {}) {
    if (typeof options.isReplayMode === "function") {
        isReplayModeChecker = options.isReplayMode;
    }
    if (!initialized && typeof window !== "undefined") {
        initialized = true;
        window.addEventListener("online", handleOnline);
    }
    syncAllReplays();
}

export function syncAllReplays() {
    if (!canSendTelemetry()) return;
    pendingFullSync = true;
    pumpSyncQueue();
}

export function notifyReplayStarted(replay) {
    if (!canSendTelemetry()) return;
    if (replay && replay.id) {
        activeReplayId = replay.id;
        activeServerActionsCount = null;
    }
    pendingActiveSync = true;
    pumpSyncQueue();
}

export function notifyReplayActionRecorded(replay) {
    if (!canSendTelemetry()) return;
    if (replay && replay.id && replay.id !== activeReplayId) {
        activeReplayId = replay.id;
        activeServerActionsCount = null;
    }
    pendingActiveSync = true;
    pumpSyncQueue();
}

export function notifyReplayArchived() {
    if (!canSendTelemetry()) return;
    activeReplayId = null;
    activeServerActionsCount = null;
    pendingFullSync = true;
    pumpSyncQueue();
}

function handleOnline() {
    clearCooldown();
    if (!canSendTelemetry()) return;
    pendingFullSync = true;
    pumpSyncQueue();
}

async function pumpSyncQueue() {
    if (inFlight) return;
    if (!canSendTelemetry()) {
        pendingFullSync = false;
        pendingActiveSync = false;
        return;
    }
    if (Date.now() < cooldownUntil) {
        scheduleCooldownRetry(pumpSyncQueue);
        return;
    }

    inFlight = true;
    try {
        while (pendingFullSync || pendingActiveSync) {
            if (!canSendTelemetry() || Date.now() < cooldownUntil) {
                break;
            }
            if (pendingFullSync || !isSessionSynced) {
                pendingFullSync = false;
                pendingActiveSync = false;
                const ok = await runFullSync();
                if (!ok) break;
            } else if (pendingActiveSync) {
                pendingActiveSync = false;
                const ok = await runActiveSync();
                if (!ok) break;
            }
        }
    } finally {
        inFlight = false;
        if ((pendingFullSync || pendingActiveSync) && canSendTelemetry()) {
            if (Date.now() < cooldownUntil) {
                scheduleCooldownRetry(pumpSyncQueue);
            } else {
                pumpSyncQueue();
            }
        }
    }
}

async function runFullSync() {
    const uid = readPlayerUid();
    if (!uid) return true;

    const history = readReplayHistory();
    const active = readActiveReplay();
    const historyMap = new Map();
    const historyIds = [];

    for (const item of history) {
        if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
        if (!item.finalState && uploadedHistoryWithoutFinalState.has(item.id)) continue;
        if (historyMap.has(item.id)) continue;
        historyMap.set(item.id, item);
        historyIds.push(item.id);
    }

    const deviceInfo = await collectDeviceInfo();
    const statusRes = await sendJson("POST", "/status", {
        uid,
        deviceInfo,
        historyIds,
        activeId: active?.id ?? null,
    });

    if (!statusRes || statusRes.ok !== true) {
        enterErrorCooldown();
        return false;
    }

    isSessionSynced = true;
    if (active && active.id) {
        activeReplayId = active.id;
        activeServerActionsCount = typeof statusRes.activeActionsCount === "number"
            ? statusRes.activeActionsCount
            : null;
    } else {
        activeReplayId = null;
        activeServerActionsCount = null;
    }

    const unsyncedIds = Array.isArray(statusRes.unsyncedIds) ? statusRes.unsyncedIds : [];
    for (const replayId of unsyncedIds) {
        if (!canSendTelemetry()) return true;
        const replay = historyMap.get(replayId);
        if (!replay) continue;
        const putRes = await sendJson("PUT", `/replays/${encodeURIComponent(replayId)}`, {
            uid,
            replay,
        });
        if (!putRes || putRes.ok !== true) {
            enterErrorCooldown();
            return false;
        }
        if (!replay.finalState && putRes.hasFinalState === false) {
            uploadedHistoryWithoutFinalState.add(replayId);
        }
    }

    const currentActive = readActiveReplay();
    if (currentActive) {
        return syncActiveReplayObject(uid, currentActive);
    }
    return true;
}

async function runActiveSync() {
    const uid = readPlayerUid();
    const active = readActiveReplay();
    if (!uid || !active) return true;
    return syncActiveReplayObject(uid, active);
}

async function syncActiveReplayObject(uid, active) {
    if (!active || !active.id) return true;
    if (active.id !== activeReplayId) {
        activeReplayId = active.id;
        activeServerActionsCount = null;
    }

    if (activeServerActionsCount === null) {
        const putRes = await sendJson("PUT", `/replays/${encodeURIComponent(active.id)}`, {
            uid,
            replay: stripFinalState(active),
        });
        if (!putRes || putRes.ok !== true) {
            enterErrorCooldown();
            return false;
        }
        activeServerActionsCount = typeof putRes.actionsCount === "number"
            ? putRes.actionsCount
            : active.actions.length;
        return true;
    }

    if (active.actions.length <= activeServerActionsCount) {
        return true;
    }

    const fromSeq = activeServerActionsCount;
    const batch = active.actions.slice(fromSeq);
    const appendRes = await sendJson("POST", `/replays/${encodeURIComponent(active.id)}/actions`, {
        uid,
        fromSeq,
        actions: batch,
        updatedAt: active.updatedAt,
        reachedFloor: active.reachedFloor,
    });

    if (!appendRes) {
        enterErrorCooldown();
        return false;
    }

    if (appendRes.ok === true) {
        activeServerActionsCount = typeof appendRes.actionsCount === "number"
            ? appendRes.actionsCount
            : fromSeq + batch.length;
        return true;
    }

    if (appendRes.reason === "not_found") {
        activeServerActionsCount = null;
        pendingActiveSync = true;
        return true;
    }

    if (appendRes.reason === "desync") {
        activeServerActionsCount = typeof appendRes.actionsCount === "number"
            ? appendRes.actionsCount
            : null;
        pendingActiveSync = true;
        return true;
    }

    enterErrorCooldown();
    return false;
}

function enterErrorCooldown() {
    cooldownUntil = Date.now() + ERROR_COOLDOWN_MS;
    isSessionSynced = false;
    pendingFullSync = true;
}

function scheduleCooldownRetry(onRetry) {
    if (cooldownTimerId !== null) return;
    const delay = Math.max(100, cooldownUntil - Date.now());
    cooldownTimerId = setTimeout(() => {
        cooldownTimerId = null;
        onRetry();
    }, delay);
}

function clearCooldown() {
    cooldownUntil = 0;
    if (cooldownTimerId !== null) {
        clearTimeout(cooldownTimerId);
        cooldownTimerId = null;
    }
}

async function sendJson(method, endpointPath, payload) {
    const { signal, cleanup } = createTimeoutSignal(REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(`${TELEMETRY_API_URL}${endpointPath}`, {
            method,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal,
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    } finally {
        cleanup();
    }
}

function createTimeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        return {
            signal: AbortSignal.timeout(ms),
            cleanup: () => {},
        };
    }
    if (typeof AbortController === "undefined") {
        return {
            signal: undefined,
            cleanup: () => {},
        };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(timer),
    };
}

function collectDeviceInfo() {
    if (!cachedDeviceInfoPromise) {
        cachedDeviceInfoPromise = buildDeviceInfo();
    }
    return cachedDeviceInfoPromise;
}

async function buildDeviceInfo() {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const scr = typeof screen !== "undefined" ? screen : null;
    const win = typeof window !== "undefined" ? window : null;
    const gpu = detectWebGlGpu();
    const clientHints = await detectClientHints(nav);

    return {
        userAgent: nav.userAgent || null,
        platform: nav.platform || null,
        language: nav.language || null,
        languages: Array.isArray(nav.languages) ? [...nav.languages] : [],
        timezone: detectTimezone(),
        utcOffsetMinutes: new Date().getTimezoneOffset(),
        screen: scr ? `${scr.width}x${scr.height}` : null,
        viewport: win ? `${win.innerWidth}x${win.innerHeight}` : null,
        pixelRatio: win && typeof win.devicePixelRatio === "number" ? win.devicePixelRatio : null,
        cpuCores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
        ramGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
        touchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : null,
        gpuVendor: gpu.vendor,
        gpuRenderer: gpu.renderer,
        clientHints,
    };
}

function detectTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
        return null;
    }
}

function detectWebGlGpu() {
    try {
        if (typeof document === "undefined") {
            return {
                vendor: null,
                renderer: null,
            };
        }
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) {
            return {
                vendor: null,
                renderer: null,
            };
        }
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null;
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
        const loseContext = gl.getExtension("WEBGL_lose_context");
        if (loseContext) loseContext.loseContext();
        return {
            vendor: typeof vendor === "string" ? vendor : null,
            renderer: typeof renderer === "string" ? renderer : null,
        };
    } catch {
        return {
            vendor: null,
            renderer: null,
        };
    }
}

async function detectClientHints(nav) {
    const uaData = nav.userAgentData;
    if (!uaData) {
        return {
            mobile: null,
            platform: null,
            model: "",
        };
    }
    const hints = {
        mobile: typeof uaData.mobile === "boolean" ? uaData.mobile : null,
        platform: typeof uaData.platform === "string" ? uaData.platform : null,
        model: "",
    };
    try {
        if (typeof uaData.getHighEntropyValues === "function") {
            const high = await uaData.getHighEntropyValues([
                "model",
                "platformVersion",
            ]);
            if (high && typeof high.model === "string") {
                hints.model = high.model;
            }
        }
    } catch {
        return hints;
    }
    return hints;
}

function canSendTelemetry() {
    return typeof window !== "undefined"
        && typeof fetch === "function"
        && typeof localStorage !== "undefined"
        && !isReplayModeChecker();
}

function readPlayerUid() {
    const meta = readJsonKey(META_STORAGE_KEY, null);
    if (!meta || typeof meta !== "object" || typeof meta.uid !== "string" || !meta.uid) {
        return null;
    }
    return meta.uid;
}

function readActiveReplay() {
    const data = readJsonKey(ACTIVE_REPLAY_KEY, null);
    if (!data || typeof data !== "object" || !Array.isArray(data.actions)) {
        return null;
    }
    return data;
}

function readReplayHistory() {
    const data = readJsonKey(REPLAY_HISTORY_KEY, []);
    return Array.isArray(data) ? data : [];
}

function readJsonKey(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function stripFinalState(replay) {
    const copy = { ...replay };
    delete copy.finalState;
    return copy;
}
