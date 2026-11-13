import { el } from "../utils/dom.js";
import { GAME_DATA } from "../data/index.js";

const RARITY_KEYS = Object.keys(GAME_DATA.rarityColors);
const RARITY_TAG_SPLIT_RE = new RegExp(`\\[(${RARITY_KEYS.join("|")})\\]`);
const ICON_PREFIX_RE = /^([^\p{L}\p{N}\s[]+\s+)/u;

export function renderTextWithRarity(text, fallbackRarity = null) {
    const textStr = String(text || "");
    const parts = textStr.split(RARITY_TAG_SPLIT_RE);
    if (parts.length > 1) {
        return parts
            .map((part, idx) => (idx % 2 === 1 ? renderRarityTag(part) : part))
            .filter(Boolean);
    }

    if (fallbackRarity) {
        const iconMatch = textStr.match(ICON_PREFIX_RE);
        if (iconMatch) {
            const prefix = iconMatch[1];
            const rest = textStr.slice(prefix.length);
            return [prefix, renderRarityTag(fallbackRarity), rest ? ` ${rest}` : ""].filter(Boolean);
        }
        return [renderRarityTag(fallbackRarity), textStr ? ` ${textStr}` : ""].filter(Boolean);
    }

    return textStr ? [textStr] : [];
}

export function renderItemLabelChildren(prefix, item, separator = "paren") {
    const children = [];
    if (prefix) {
        children.push(prefix);
    }
    if (item && item.rarity) {
        children.push(renderRarityTag(item.rarity));
        children.push(" ");
    }
    const suffix = separator === "colon"
        ? `${item.name}: ${item.desc}`
        : `${item.name} (${item.desc})`;
    children.push(suffix);
    return children;
}

export function renderRarityTag(rarity) {
    if (!rarity) return null;
    const color = getRarityColor(rarity);
    return el("span", {
        style: color ? { color } : null,
        text: `[${rarity}]`,
    });
}

export function getRarityColor(rarity) {
    return rarity ? (GAME_DATA.rarityColors[rarity] || null) : null;
}
