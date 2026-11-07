import { el } from "../../utils/dom.js";
import { game } from "../../engine/game.js";
import { renderStatsPanel, renderEquipmentComparison } from "../components.js";

export function renderBattleScreen(render) {
    game.ensureValidTarget();
    const p = game.player;
    const cds = p.cooldowns || {};
    const atk = p.getTotalAtk();

    const wrap = el("div", {}, [
        el("h3", { text: `Бой — Этаж ${game.floor + 1} (Раунд ${game.battleTurn})` }),
        renderStatsPanel(),
    ]);

    if (game.battleFinished) {
        const rewardBox = el("div", { className: "panel", style: { borderColor: "#4caf50", background: "#1b2e1b" } }, [
            el("h3", { style: { color: "#81c784" }, text: "🏆 ПОБЕДА В БОЮ!" }),
            el("p", {
                className: "text-center",
                style: { marginBottom: "8px" },
                text: `Получено: +${game.battleRewards.xp} XP | +${game.battleRewards.gold} Золота`,
            }),
        ]);

        if (game.battleRewards.items.length > 0) {
            rewardBox.appendChild(el("div", {
                style: { marginBottom: "6px", fontWeight: "bold" },
                text: "Найденные трофеи:",
            }));
            game.battleRewards.items.forEach(it => {
                rewardBox.appendChild(el("div", { style: { color: "#ffd54f", fontSize: "13px" }, text: `• ${it}` }));
            });
        }

        if (game.pendingEquipment) {
            rewardBox.appendChild(renderEquipmentComparison(game.pendingEquipment, render));
        }

        rewardBox.appendChild(el("button", {
            className: "btn-center btn-primary",
            disabled: Boolean(game.pendingEquipment),
            style: { marginTop: "10px" },
            text: game.pendingEquipment ? "Сначала сделайте выбор" : "Продолжить ➡️",
            onClick: () => {
                game.proceedAfterBattle();
                render();
            },
        }));
        wrap.appendChild(rewardBox);
    } else {
        const enemyBox = el("div", { style: { marginBottom: "8px" } }, [
            el("div", {
                style: { marginBottom: "4px", fontSize: "12px", color: "#aaa" },
                text: game.isProcessingTurn ? "⏳ Ход противников..." : "Выберите цель для атаки:",
            }),
        ]);

        game.enemies.forEach((en, idx) => {
            if (en.currentHp <= 0) return;
            const isSelected = idx === game.selectedTargetIndex;
            const nextPat = en.pattern[(en.patternIndex || 0) % en.pattern.length];
            const previewVal = nextPat.val ? nextPat.val + (en.atkBonus || 0) : 0;

            const extraStats = [];
            if (en.def > 0) extraStats.push(`🛡️ ${en.def}`);
            if (en.poison > 0) extraStats.push(`☠️ ${en.poison}`);
            if (en.bleed > 0) extraStats.push(`🩸 ${en.bleed}`);
            if (en.spikes > 0) extraStats.push(`🌵 ${en.spikes}`);
            if (en.regen > 0) extraStats.push(`💚 ${en.regen}`);

            const statChildren = [
                `❤️ ${en.currentHp}`,
            ];
            if (en.shield > 0) {
                statChildren.push(el("span", {
                    style: { color: "#888888" },
                    text: ` (+${en.shield})`,
                }));
            }
            if (extraStats.length > 0) {
                statChildren.push(` | ${extraStats.join(" | ")}`);
            }

            const infoEl = el("div", { className: "enemy-info" }, [
                el("div", {
                    className: "enemy-name",
                    style: { color: isSelected ? "#ef5350" : "#ffffff" },
                    text: en.name,
                }),
                el("div", { className: "enemy-stats" }, statChildren),
                el("div", {
                    className: "enemy-intent",
                    text: `${nextPat.text}${previewVal > 0 ? ` (~${previewVal} ур.)` : ""}`,
                }),
            ]);

            enemyBox.appendChild(el("div", {
                className: `enemy-card ${isSelected ? "selected" : ""}`,
                onClick: () => {
                    if (!game.isProcessingTurn) {
                        game.selectedTargetIndex = idx;
                        render();
                    }
                },
            }, [
                infoEl,
            ]));
        });
        wrap.appendChild(enemyBox);

        const fastMin = atk + 1;
        const fastMax = atk + 4;
        const execDmg = Math.round(2 + atk * 0.5) + (p.perks.includes("p1") ? 4 : 0);
        const prcMin = atk + 3;
        const prcMax = atk + 7;
        const whrMin = Math.round(atk * 0.75) + (p.classId === "arcanist" ? 3 : 1);
        const whrMax = Math.round(atk * 0.75) + (p.classId === "arcanist" ? 6 : 4);
        const defShield = 3 + p.getTotalDef() + (p.classId === "crusader" ? 3 : 0) + (p.perks.includes("p31") ? 3 : 0);

        const formatCd = cd => (cd === 1 ? "[КД: 1 ход]" : `[КД: ${cd} хода]`);
        const defSub = cds.defend > 0 ? formatCd(cds.defend) : `[+${defShield} Щит, -50% ур.]`;
        const heavySub = cds.heavy > 0 ? formatCd(cds.heavy) : `[${execDmg} чист., доп. ход]`;
        const prcSub = cds.pierce > 0 ? formatCd(cds.pierce) : `[${prcMin}-${prcMax} сквозь щит]`;
        const whrSub = cds.whirlwind > 0 ? formatCd(cds.whirlwind) : `[${whrMin}-${whrMax} всем]`;
        const cncSub = cds.concentrate > 0 ? formatCd(cds.concentrate) : "[+2 EN, +HP, -1 КД]";

        const makeActionBtn = (title, sub, disabled, onClick) => el("button", { disabled, onClick }, [
            el("span", { style: { display: "block", whiteSpace: "nowrap" }, text: title }),
            el("span", { style: { display: "block", fontSize: "11px", opacity: 0.85, marginTop: "2px" }, text: sub }),
        ]);

        const actionsGrid = el("div", {}, [
            el("div", { className: "flex-row" }, [
                makeActionBtn("⚔️ Быстрый (0 EN)", `[${fastMin}-${fastMax} ур.]`, game.isProcessingTurn, () => game.playerAction("fast", render)),
                makeActionBtn("🛡️ Защита (0 EN)", defSub, !game.canUseSkill("defend", 0), () => game.playerAction("defend", render)),
            ]),
            el("div", { className: "flex-row" }, [
                makeActionBtn("🗡️ Пробитие (2 EN)", prcSub, !game.canUseSkill("pierce", 2), () => game.playerAction("pierce", render)),
                makeActionBtn("🌪️ Вихрь (2 EN)", whrSub, !game.canUseSkill("whirlwind", 2), () => game.playerAction("whirlwind", render)),
            ]),
            el("div", { className: "flex-row" }, [
                makeActionBtn("💀 Казнь (1 EN)", heavySub, !game.canUseSkill("heavy", 1), () => game.playerAction("heavy", render)),
                makeActionBtn("🧘 Концентрация", cncSub, !game.canUseSkill("concentrate", 0), () => game.playerAction("concentrate", render)),
            ]),
        ]);
        wrap.appendChild(actionsGrid);

        if (p.inventory.potions.length > 0) {
            const potRow = el("div", { style: { marginTop: "6px" } }, [
                el("small", { text: `Зелья (${p.inventory.potions.length}/${p.potionSlots}, не тратят ход):` }),
            ]);
            p.inventory.potions.forEach((pot, pIdx) => {
                potRow.appendChild(el("button", {
                    disabled: game.isProcessingTurn,
                    style: { padding: "6px", fontSize: "12px", background: "#243b24" },
                    text: `🧪 ${pot.name} — ${pot.desc}`,
                    onClick: () => {
                        game.usePotion(pIdx);
                        render();
                    },
                }));
            });
            wrap.appendChild(potRow);
        }
    }

    const logBox = el("div", { className: "log" });
    game.battleLog.forEach(line => {
        logBox.appendChild(el("div", { text: line }));
    });
    wrap.appendChild(logBox);

    return wrap;
}
