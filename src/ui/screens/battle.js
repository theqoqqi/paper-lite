import { el } from "../../utils/dom.js";
import { game } from "../../engine/game.js";
import { playSound } from "../../utils/audio.js";
import { renderStatsPanel, renderEquipmentComparison } from "../components.js";
import { renderTextWithRarity } from "../rarity.js";

const activeRowMap = new Map();

export function renderBattleScreen(render) {
    game.ensureValidTarget();
    const p = game.player;
    const cds = p.cooldowns || {};
    const atk = p.getTotalAtk();

    const activeFx = game.consumeBattleFx();
    const enemyFxMap = new Map();
    const playerFxList = [];
    const enemyCardEntries = [];

    activeFx.forEach(fx => {
        if (fx.target === "player") {
            playerFxList.push(fx);
        } else if (fx.target === "enemy" && fx.enemy) {
            if (!enemyFxMap.has(fx.enemy)) {
                enemyFxMap.set(fx.enemy, []);
            }
            enemyFxMap.get(fx.enemy).push(fx);
        }
    });

    if (activeFx.length > 0) {
        playBattleFxSound(activeFx);
    }

    const enrageBonus = game.battleTurn >= 11 ? (game.battleTurn - 10) * 2 : 0;
    const wrap = el("div", {}, [
        el("h3", { text: `Бой — Этаж ${game.floor + 1} (Раунд ${game.battleTurn})` }),
        renderStatsPanel(playerFxList),
    ]);

    if (game.battleFinished) {
        if (!game._victorySoundPlayed) {
            playSound("victory");
            game._victorySoundPlayed = true;
        }
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
                rewardBox.appendChild(el(
                    "div",
                    { style: { color: "#ffd54f", fontSize: "13px" } },
                    renderTextWithRarity(`• ${it}`),
                ));
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
        const enemyBoxChildren = [];
        if (enrageBonus > 0) {
            enemyBoxChildren.push(el("div", {
                className: "text-center",
                style: {
                    color: "#ff9800",
                    fontSize: "12px",
                    fontWeight: "bold",
                    marginBottom: "6px",
                },
                text: `🔥 Ярость Бездны (+${enrageBonus} к атакам врагов)`,
            }));
        }
        const enemyBox = el("div", { style: { marginBottom: "8px" } }, enemyBoxChildren);

        game.enemies.forEach((en, idx) => {
            if (en.currentHp <= 0 && (!en.isDying || en.deathAnimRendered)) return;
            const isSelected = idx === game.selectedTargetIndex && !en.isDying;
            const nextPat = en.pattern ? en.pattern[(en.patternIndex || 0) % en.pattern.length] : { text: "...", val: 0 };
            const previewVal = nextPat.val ? nextPat.val + (en.atkBonus || 0) + enrageBonus : 0;

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
            extraStats.forEach((st) => {
                statChildren.push(el("span", { className: "stat-divider" }));
                statChildren.push(st);
            });

            const isBossBanner = Boolean(en.sprite && en.sprite.isBanner);
            const isEliteSprite = Boolean(en.sprite && en.sprite.width === 128);

            let spriteEl;
            if (isBossBanner) {
                spriteEl = el("div", {
                    className: "enemy-banner",
                    style: {
                        backgroundImage: `url("${en.sprite.src}")`,
                    },
                });
            } else if (en.sprite) {
                spriteEl = el("div", {
                    className: `enemy-sprite ${isEliteSprite ? "elite" : ""}`,
                    style: {
                        backgroundImage: `url("${en.sprite.src}")`,
                        backgroundPosition: `-${en.sprite.x}px -${en.sprite.y}px`,
                    },
                });
            } else {
                const fallbackText = en.isBoss ? "👑" : (en.name.includes("Мимик") ? "📦" : (en.isElite ? "💀" : "👾"));
                spriteEl = el("div", {
                    className: `enemy-sprite-fallback ${en.isElite ? "elite" : ""}`,
                    text: fallbackText,
                });
            }

            const infoChildren = [];
            if (en.isFinalBoss) {
                infoChildren.push(el("div", {
                    className: "enemy-badge boss final-boss",
                    text: "👑 ФИНАЛЬНЫЙ БОСС",
                }));
            } else if (en.isBoss) {
                infoChildren.push(el("div", {
                    className: "enemy-badge boss",
                    text: "👑 БОСС",
                }));
            } else if (en.isElite) {
                infoChildren.push(el("div", {
                    className: "enemy-badge elite",
                    text: "💀 ЭЛИТА",
                }));
            }
            infoChildren.push(el("div", {
                className: "enemy-name",
                style: { color: isSelected ? "#ef5350" : "#ffffff" },
                text: en.name,
            }));
            infoChildren.push(el("div", { className: "enemy-stats" }, statChildren));
            if (en.isDying) {
                infoChildren.push(el("div", {
                    className: "enemy-intent",
                    style: { color: "#e57373", fontWeight: "bold" },
                    text: "💀 Повержен",
                }));
            } else {
                infoChildren.push(el("div", {
                    className: "enemy-intent",
                    text: `${nextPat.text}${previewVal > 0 ? ` (~${previewVal} ур.)` : ""}`,
                }));
            }

            const infoEl = el("div", { className: "enemy-info" }, infoChildren);

            const enFxList = enemyFxMap.get(en) || [];
            const hasEnCrit = enFxList.some(f => f.isCrit);
            const hasEnDmg = enFxList.some(f => f.type === "damage" || f.type === "crit" || f.type.endsWith("Damage"));

            const cardClasses = ["enemy-card"];
            if (isBossBanner || en.isBoss) cardClasses.push("boss");
            if (isEliteSprite || en.isElite) cardClasses.push("elite");
            if (isSelected) cardClasses.push("selected");
            if (en.isDying) {
                en.deathAnimRendered = true;
                cardClasses.push("dying");
            } else if (hasEnCrit) {
                cardClasses.push("anim-crit-shake");
            } else if (hasEnDmg) {
                cardClasses.push("anim-shake");
            }

            const cardEl = el("div", {
                className: cardClasses.join(" "),
                onClick: () => {
                    if (!game.isProcessingTurn && !en.isDying) {
                        game.selectedTargetIndex = idx;
                        render();
                    }
                },
            }, [
                spriteEl,
                infoEl,
            ]);
            if (en.isDying) {
                cardEl.addEventListener("animationend", (e) => {
                    if (e.target !== cardEl) return;
                    en.isDying = false;
                    cardEl.remove();
                });
            }
            enemyBox.appendChild(cardEl);
            if (enFxList.length > 0) {
                enemyCardEntries.push({ enemy: en, el: cardEl, fxList: enFxList });
            }
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
                        game.usePotion(pIdx, render);
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

    requestAnimationFrame(() => {
        if (playerFxList.length > 0) {
            const playerStatsEl = wrap.querySelector(".panel");
            if (playerStatsEl) {
                playerFxList.forEach(fx => spawnFloatingFx("player", playerStatsEl, fx));
            }
        }
        enemyCardEntries.forEach(({ enemy, el: cardEl, fxList }) => {
            fxList.forEach(fx => spawnFloatingFx(enemy, cardEl, fx));
        });
    });

    return wrap;
}

export function clearActiveFxRows() {
    activeRowMap.clear();
}

function formatFxText(fx) {
    if (fx.text) {
        return fx.text;
    }
    if (fx.isCrit) {
        return `💥 -${fx.value}!`;
    }
    if (fx.type === "damage") {
        if (fx.value > 0) {
            return fx.shieldValue > 0 ? `-${fx.value} (🛡️-${fx.shieldValue})` : `-${fx.value}`;
        }
        if (fx.shieldValue > 0) {
            return `🛡️ -${fx.shieldValue}`;
        }
    }
    if (fx.type === "shield") {
        return `🛡️ +${fx.value}`;
    }
    if (fx.type === "heal") {
        return `💚 +${fx.value}`;
    }
    if (fx.type === "poison") {
        return `☠️ +${fx.value}`;
    }
    if (fx.type === "poisonDamage") {
        return `☠️ -${fx.value}`;
    }
    if (fx.type === "bleed") {
        return `🩸 +${fx.value}`;
    }
    if (fx.type === "bleedDamage") {
        return `🩸 -${fx.value}`;
    }
    if (fx.type === "spikesDamage") {
        return `🌵 -${fx.value}`;
    }
    return "";
}

function spawnFloatingFx(targetKey, targetElement, fx) {
    const overlay = document.getElementById("fx-overlay");
    const app = document.getElementById("app");
    if (!overlay || !app || !targetElement) return;

    const text = formatFxText(fx);
    if (!text) return;

    const now = performance.now();
    let entry = activeRowMap.get(targetKey);
    let rowEl = entry ? entry.rowEl : null;

    if (!rowEl || !rowEl.isConnected || (now - entry.createdAt > 400)) {
        const appRect = app.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const x = (targetRect.left - appRect.left) + targetRect.width / 2;
        const y = (targetRect.top - appRect.top) + targetRect.height / 2;

        rowEl = el("div", {
            className: "fx-row",
            style: {
                left: `${x}px`,
                top: `${y}px`,
            },
        });

        rowEl.addEventListener("animationend", (e) => {
            if (e.target !== rowEl) return;
            rowEl.remove();
            if (activeRowMap.get(targetKey)?.rowEl === rowEl) {
                activeRowMap.delete(targetKey);
            }
        });

        overlay.appendChild(rowEl);
        activeRowMap.set(targetKey, { rowEl, createdAt: now });
    }

    const fxClass = (fx.type === "damage" && fx.value === 0 && fx.shieldValue > 0) ? "shield" : (fx.isCrit ? "crit" : fx.type);
    const badgeEl = el("div", {
        className: `fx-badge ${fxClass}`,
        text,
    });

    rowEl.appendChild(badgeEl);
}

function playBattleFxSound(activeFx) {
    if (activeFx.some(f => f.isCrit)) {
        playSound("crit");
        return;
    }
    if (activeFx.some(f => f.type === "spikesDamage")) {
        playSound("spikes");
        return;
    }
    if (activeFx.some(f => f.type === "bleedDamage")) {
        playSound("bleed");
        return;
    }
    if (activeFx.some(f => f.type === "shield" || (f.type === "damage" && f.value === 0 && f.shieldValue > 0))) {
        playSound("shield");
        return;
    }
    if (activeFx.some(f => f.target === "player" && f.isBoss)) {
        playSound("bossAttack");
        return;
    }
    if (activeFx.some(f => f.type === "damage" || f.type.endsWith("Damage"))) {
        playSound("hit");
        return;
    }
    if (activeFx.some(f => f.type === "heal")) {
        playSound("heal");
        return;
    }
    if (activeFx.some(f => f.type === "poison")) {
        playSound("poison");
        return;
    }
    if (activeFx.some(f => f.type === "bleed")) {
        playSound("bleed");
        return;
    }
}
