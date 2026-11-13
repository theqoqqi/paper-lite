import { el } from "../utils/dom.js";
import { game } from "../engine/game.js";
import { isMuted, playSound, toggleMute } from "../utils/audio.js";
import { openCharacterModal, openSaveManagerModal } from "./modals.js";
import { renderItemLabelChildren } from "./rarity.js";

export function renderStatsPanel(playerFxList = []) {
    const p = game.player;
    const maxHp = p.getTotalMaxHp();
    const maxEn = p.getTotalMaxEn();

    const statusTags = [];
    if (p.poison > 0) statusTags.push(`☠️Яд:${p.poison}`);
    if (p.bleed > 0) statusTags.push(`🩸Кровь:${p.bleed}`);
    if (p.concentrateBonus > 0) statusTags.push(`🔥Усил:+${p.concentrateBonus}`);

    const combatStats = [
        `⚔️ ${p.getTotalAtk()}`,
        `🛡️ ${p.getTotalDef()}`,
        `🎯 ${p.getCritChance()}%`,
    ];
    if (p.getTotalSpikes() > 0) {
        combatStats.push(`🌵 ${p.getTotalSpikes()}`);
    }

    const combatChildren = [];
    combatStats.forEach((st, idx) => {
        if (idx > 0) {
            combatChildren.push(el("span", { className: "stat-divider" }));
        }
        combatChildren.push(st);
    });

    const panelChildren = [
        el("div", { className: "stats-line" }, [
            el("b", { text: `${p.className} (Ур. ${p.level})` }),
            el("span", { text: `XP: ${p.xp}/${p.getRequiredXp()} | 💰 ${p.gold}G` }),
        ]),
        el("div", { className: "stats-line" }, [
            el("span", { text: `❤️ HP: ${p.hp}/${maxHp} (Щит: ${p.shield})` }),
            el("span", { text: `⚡ EN: ${p.en}/${maxEn}` }),
        ]),
        el("div", { className: "stats-line" }, [
            el("span", {}, combatChildren),
        ]),
        statusTags.length > 0 ? el("div", {
            style: { color: "#ff8a65", fontSize: "12px" },
            text: `Статусы: ${statusTags.join(" ")}`,
        }) : null,
    ];

    const panelClasses = ["panel"];
    if (playerFxList.some(f => f.type === "damage" || f.type.endsWith("Damage"))) {
        panelClasses.push("anim-shake");
    }

    return el("div", { className: panelClasses.join(" ") }, panelChildren);
}

export function renderGlobalNav(render) {
    const nav = document.getElementById("global-nav");
    nav.replaceChildren();

    const row = el("div", { className: "flex-row" });
    if (game.player && ["MAP", "BATTLE", "SHOP", "EVENT", "CAMPFIRE", "EVENT_REWARDS", "CORRIDOR"].includes(game.state)) {
        row.appendChild(el("button", {
            className: "btn-center",
            style: { background: "#2b3a4a" },
            text: "👤 Персонаж",
            onClick: () => openCharacterModal(render),
        }));
    }
    row.appendChild(el("button", {
        className: "btn-center",
        text: "💾 Сохранения",
        onClick: () => openSaveManagerModal(render),
    }));
    row.appendChild(el("button", {
        className: "btn-center",
        style: { width: "44px", flex: "0 0 44px", padding: "6px" },
        text: isMuted() ? "🔇" : "🔊",
        onClick: () => {
            toggleMute();
            render();
        },
    }));
    nav.appendChild(row);
}

export function renderEquipmentComparison(pendingEquip, onResolved) {
    if (!pendingEquip) return null;
    const { type, item } = pendingEquip;
    const current = type === "weapon" ? game.player.inventory.weapon : game.player.inventory.armor;
    const currentChildren = current
        ? renderItemLabelChildren("Надето: ", current)
        : [`Надето: ${type === "weapon" ? "Кулаки" : "Лохмотья"}`];
    const oldRefund = (current && current.cost) ? Math.max(1, Math.floor(current.cost * 0.25)) : 0;
    const salvageGain = (item && item.cost) ? Math.max(1, Math.floor(item.cost * 0.25)) : 0;
    const typeLabel = type === "weapon" ? "Оружие" : "Броня";

    return el("div", {
        className: "panel",
        style: {
            borderColor: "#ff9800",
            background: "#2a2218",
            marginTop: "8px",
        },
    }, [
        el("div", {
            style: { fontWeight: "bold", color: "#ffb74d", marginBottom: "6px" },
            text: `⚖️ Выбор экипировки: найдено [${typeLabel}]`,
        }),
        el("div", {
            style: { fontSize: "12px", marginBottom: "4px" },
        }, currentChildren),
        el("div", {
            style: { fontSize: "12px", color: "#81c784", marginBottom: "8px" },
        }, renderItemLabelChildren("Найдено: ", item)),
        el("div", { className: "flex-row" }, [
            el("button", {
                className: "btn-primary",
                style: { padding: "8px", fontSize: "12px" },
                text: `Надеть (+${oldRefund}G со старого)`,
                onClick: () => {
                    playSound("equip");
                    game.resolveEquipChoice();
                    if (onResolved) onResolved();
                },
            }),
            el("button", {
                style: { padding: "8px", fontSize: "12px", background: "#4a3220" },
                text: `Разобрать (+${salvageGain}G)`,
                onClick: () => {
                    playSound("gold");
                    game.resolveSalvageChoice();
                    if (onResolved) onResolved();
                },
            }),
        ]),
    ]);
}
