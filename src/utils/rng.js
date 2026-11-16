export function normalizeSeed(rawSeed) {
    if (typeof rawSeed === "number" && Number.isFinite(rawSeed)) {
        return (rawSeed >>> 0) || 1;
    }
    const str = String(rawSeed ?? "").trim();
    if (!str) {
        return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
    }
    if (/^\d+$/.test(str)) {
        const parsed = Number(str);
        if (Number.isSafeInteger(parsed)) {
            return (parsed >>> 0) || 1;
        }
    }
    // FNV-1a 32-bit hash
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) || 1;
}

export function mixSeed(...inputs) {
    let h = 0x811c9dc5;
    for (const item of inputs) {
        if (typeof item === "string") {
            h ^= 0x1a;
            h = Math.imul(h, 0x01000193);
            for (let i = 0; i < item.length; i++) {
                h ^= item.charCodeAt(i);
                h = Math.imul(h, 0x01000193);
            }
        } else {
            h ^= 0x2b;
            h = Math.imul(h, 0x01000193);
            const n = (Number(item) | 0);
            h ^= n & 0xff;
            h = Math.imul(h, 0x01000193);
            h ^= (n >>> 8) & 0xff;
            h = Math.imul(h, 0x01000193);
            h ^= (n >>> 16) & 0xff;
            h = Math.imul(h, 0x01000193);
            h ^= (n >>> 24) & 0xff;
            h = Math.imul(h, 0x01000193);
        }
        h ^= 0xff;
        h = Math.imul(h, 0x01000193);
    }
    let res = h >>> 0;
    res ^= res >>> 16;
    res = Math.imul(res, 0x85ebca6b) >>> 0;
    res ^= res >>> 13;
    res = Math.imul(res, 0xc2b2ae35) >>> 0;
    res ^= res >>> 16;
    return (res >>> 0) || 1;
}

export class PRNG {
    constructor(seed = 1) {
        this.seed = normalizeSeed(seed);
        this.state = this.seed;
    }

    next() {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    chance(percent) {
        return this.next() * 100 < percent;
    }

    spread(base, variancePercent) {
        const min = Math.floor(base * (1 - variancePercent / 100));
        const max = Math.ceil(base * (1 + variancePercent / 100));
        return this.range(min, max);
    }

    choice(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(this.next() * arr.length)];
    }

    weightedChoice(items) {
        if (!items || items.length === 0) return null;
        const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
        let roll = this.next() * total;
        for (const item of items) {
            roll -= item.weight || 1;
            if (roll <= 0) return item;
        }
        return items[items.length - 1];
    }

    shuffle(arr) {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }
}

export class RNG {
    static _prng = new PRNG(Date.now());
    static _baseSeed = RNG._prng.seed;

    static setSeed(seed) {
        this._prng = new PRNG(seed);
        this._baseSeed = this._prng.seed;
        return this._baseSeed;
    }

    static getSeed() {
        return this._baseSeed;
    }

    static getState() {
        return this._prng.state >>> 0;
    }

    static setState(state, seed = this._baseSeed) {
        this._baseSeed = normalizeSeed(seed);
        this._prng = new PRNG(this._baseSeed);
        this._prng.state = (Number(state) >>> 0) || this._baseSeed;
    }

    static setScopedSeed(baseSeed, ...scopeParts) {
        const seedToUse = (baseSeed !== undefined && baseSeed !== null) ? baseSeed : this._baseSeed;
        const normalizedBase = normalizeSeed(seedToUse);
        const scopedSeed = mixSeed(normalizedBase, ...scopeParts);
        this._prng = new PRNG(scopedSeed);
        return scopedSeed;
    }

    static next() {
        return this._prng.next();
    }

    static range(min, max) {
        return this._prng.range(min, max);
    }

    static chance(percent) {
        return this._prng.chance(percent);
    }

    static spread(base, variancePercent) {
        return this._prng.spread(base, variancePercent);
    }

    static choice(arr) {
        return this._prng.choice(arr);
    }

    static weightedChoice(items) {
        return this._prng.weightedChoice(items);
    }

    static shuffle(arr) {
        return this._prng.shuffle(arr);
    }
}
