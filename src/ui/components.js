import { el } from "../utils/dom.js";
import { game } from "../engine/game.js";
import { isMuted, playSound, toggleMute } from "../utils/audio.js";
import { replayPlayer } from "../engine/systems/replay.js";
import { openCharacterModal, openSaveManagerModal, openReplayManagerModal } from "./modals.js";
import { renderItemLabelChildren } from "./rarity.js";

let outsideSettingsClickHandler = null;
let outsideReplaySettingsClickHandler = null;

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

function cleanupReplaySettingsOutsideHandler() {
    if (outsideReplaySettingsClickHandler) {
        document.removeEventListener("click", outsideReplaySettingsClickHandler);
        outsideReplaySettingsClickHandler = null;
    }
}

export function renderReplayFloatingBar(render) {
    cleanupReplaySettingsOutsideHandler();
    const bar = document.getElementById("replay-bar");
    if (!bar) return;
    bar.replaceChildren();

    if (!game.isReplayMode || !replayPlayer.replay) {
        bar.style.display = "none";
        return;
    }

    bar.style.display = "block";
    bar.style.position = "fixed";
    bar.style.bottom = "8px";
    bar.style.left = "50%";
    bar.style.transform = "translateX(-50%)";
    bar.style.width = "calc(100% - 16px)";
    bar.style.maxWidth = "480px";
    bar.style.zIndex = "200";
    bar.style.pointerEvents = "none";

    const currentStep = replayPlayer.currentStep || 0;
    const totalSteps = Array.isArray(replayPlayer.replay.actions) ? replayPlayer.replay.actions.length : 0;
    const validation = replayPlayer.checkCompletion();

    if (replayPlayer.isCollapsed) {
        const badgeIcon = validation?.status === "valid" ? " ✅" : (validation?.status === "mismatch" ? " ⚠️" : "");
        bar.appendChild(el("div", {
            style: { display: "flex", justifyContent: "flex-end" },
        }, [
            el("button", {
                style: {
                    width: "auto",
                    margin: "0",
                    padding: "5px 10px",
                    fontSize: "12px",
                    background: "#18242e",
                    borderColor: "#4a7a96",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.75)",
                    pointerEvents: "auto",
                },
                text: `🎬 ${currentStep}/${totalSteps}${badgeIcon}`,
                onClick: () => replayPlayer.toggleCollapse(),
            }),
        ]));
        return;
    }

    const isAtEnd = currentStep >= totalSteps;
    let playBtnIcon = "▶️";
    if (isAtEnd && totalSteps > 0) {
        playBtnIcon = "🔄";
    } else if (replayPlayer.isPlaying) {
        playBtnIcon = "⏸️";
    }

    const currentSpeed = game.replaySpeed || 1;
    const speedPopup = el("div", {
        style: {
            position: "absolute",
            bottom: "100%",
            right: "0",
            marginBottom: "6px",
            minWidth: "160px",
            background: "#16202a",
            border: "1px solid #4a7a96",
            borderRadius: "6px",
            padding: "8px",
            boxShadow: "0 6px 16px rgba(0, 0, 0, 0.85)",
            zIndex: "210",
        },
    }, [
        el("div", {
            style: { fontSize: "11px", color: "#90caf9", marginBottom: "6px", textAlign: "center" },
            text: `Шаг ${currentStep} / ${totalSteps}`,
        }),
        el("div", {
            style: { fontSize: "11px", color: "#b0bec5", marginBottom: "4px" },
            text: "Скорость:",
        }),
        el("div", { className: "flex-row", style: { gap: "4px" } }, [1, 2, 4, 8].map(spd => el("button", {
            className: `btn-center${currentSpeed === spd ? " btn-primary" : ""}`,
            style: { padding: "4px 6px", margin: "0", fontSize: "11px" },
            text: `${spd}x`,
            onClick: () => replayPlayer.setSpeed(spd),
        }))),
    ]);
    speedPopup.hidden = !replayPlayer.isSettingsOpen;

    const iconBtnStyle = {
        position: "relative",
        width: "34px",
        height: "34px",
        padding: "0",
        margin: "0",
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
    };

    const makeIconBtn = (icon, label, opts = {}) => el("button", {
        className: opts.className || "btn-center",
        style: iconBtnStyle,
        disabled: Boolean(opts.disabled),
        onClick: opts.onClick,
    }, [
        el("span", { style: { transform: "translateY(-2px)" }, text: icon }),
        el("span", {
            style: {
                position: "absolute",
                bottom: "0px",
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: "7px",
                lineHeight: "1",
                color: "#90a4ae",
                pointerEvents: "none",
                whiteSpace: "nowrap",
            },
            text: label,
        }),
    ]);

    const settingsAnchor = el("div", {
        style: { position: "relative", flexShrink: "0" },
    }, [
        makeIconBtn("⚙️", `${currentSpeed}x`, {
            onClick: (e) => {
                e.stopPropagation();
                replayPlayer.isSettingsOpen = !replayPlayer.isSettingsOpen;
                renderReplayFloatingBar(render);
            },
        }),
        speedPopup,
    ]);

    if (replayPlayer.isSettingsOpen) {
        outsideReplaySettingsClickHandler = (event) => {
            if (!settingsAnchor.contains(event.target)) {
                replayPlayer.isSettingsOpen = false;
                renderReplayFloatingBar(render);
            }
        };
        document.addEventListener("click", outsideReplaySettingsClickHandler);
    }

    const panel = el("div", {
        style: {
            width: "fit-content",
            margin: "0 auto",
            background: "rgba(22, 32, 42, 0.96)",
            border: "1px solid #4a7a96",
            borderRadius: "6px",
            padding: "5px",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.8)",
            pointerEvents: "auto",
        },
    }, [
        el("div", { className: "flex-row", style: { gap: "5px", alignItems: "center" } }, [
            makeIconBtn("✖", "Выход", {
                className: "btn-center btn-danger",
                onClick: () => replayPlayer.stopPlayback(),
            }),
            makeIconBtn("🔽", "Скрыть", {
                onClick: () => replayPlayer.toggleCollapse(),
            }),
            makeIconBtn(
                playBtnIcon,
                isAtEnd && totalSteps > 0 ? "Заново" : (replayPlayer.isPlaying ? "Пауза" : "Старт"),
                {
                    className: "btn-center btn-primary",
                    disabled: totalSteps === 0 && !isAtEnd,
                    onClick: () => {
                        if (isAtEnd) {
                            replayPlayer.restartPlayback();
                        } else if (replayPlayer.isPlaying) {
                            replayPlayer.pausePlayback();
                        } else {
                            replayPlayer.resumePlayback();
                        }
                    },
                },
            ),
            makeIconBtn("⏭️", "Шаг", {
                disabled: isAtEnd || game.isProcessingTurn,
                onClick: () => replayPlayer.stepForward(),
            }),
            settingsAnchor,
        ]),
    ]);

    if (validation && validation.status !== "skipped") {
        const isOk = validation.status === "valid";
        bar.appendChild(el("div", {
            style: { display: "flex", justifyContent: "center", marginBottom: "4px" },
        }, [
            el("button", {
                className: "btn-center",
                style: {
                    width: "auto",
                    margin: "0",
                    padding: "3px 8px",
                    fontSize: "11px",
                    background: isOk ? "#162419" : "#281618",
                    borderColor: isOk ? "#2e5c38" : "#883333",
                    color: isOk ? "#81c784" : "#ef9a9a",
                    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.75)",
                    pointerEvents: "auto",
                    cursor: isOk ? "default" : "pointer",
                },
                text: isOk
                    ? "✅ Валидация сейва прошла успешно"
                    : `⚠️ Результат воспроизведения отличается от сейва. Расхождений: ${validation.diffs.length}. Подробнее в консоли.`,
                onClick: isOk ? null : () => {
                    const preview = validation.diffs.slice(0, 10).join("\n");
                    const more = validation.diffs.length > 10 ? `\n...и ещё ${validation.diffs.length - 10}` : "";
                    alert(`Итоговое состояние после воспроизведения отличается от финального сейва:\n\n${preview}${more}`);
                },
            }),
        ]));
    }

    bar.appendChild(panel);
}

export function renderGlobalNav(render) {
    closeSettingsMenu();
    const nav = document.getElementById("global-nav");
    nav.replaceChildren();

    const row = el("div", { className: "flex-row" });
    const hasCharacterButton = game.player
        && ["MAP", "BATTLE", "SHOP", "EVENT", "CAMPFIRE", "EVENT_REWARDS", "CORRIDOR", "FOUNTAIN", "SCOUT"].includes(game.state);

    if (hasCharacterButton) {
        row.appendChild(el("button", {
            className: "btn-center",
            style: { background: "#2b3a4a" },
            text: "👤 Персонаж",
            onClick: () => openCharacterModal(render),
        }));
    } else {
        row.appendChild(el("button", {
            className: "btn-center",
            text: "💾 Сохранения",
            onClick: () => openSaveManagerModal(render),
        }));
    }

    row.appendChild(createSettingsAnchor(render));
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

export function renderPendingArtifactChoice(pendingArt, onResolved) {
    if (!pendingArt) return null;

    return el("div", {
        className: "panel",
        style: {
            borderColor: "#ef5350",
            background: "#2a1618",
            marginTop: "8px",
        },
    }, [
        el("div", {
            style: { fontWeight: "bold", color: "#ef9a9a", marginBottom: "6px" },
            text: "🩸 Найден проклятый артефакт",
        }),
        el("div", {
            style: { fontSize: "12px", marginBottom: "6px" },
        }, renderItemLabelChildren("", pendingArt, "colon")),
        el("div", {
            style: { fontSize: "11px", color: "#bcaaa4", marginBottom: "8px" },
            text: "Проклятый артефакт нельзя выбросить из инвентаря после принятия.",
        }),
        el("div", { className: "flex-row" }, [
            el("button", {
                style: { padding: "8px", fontSize: "12px", background: "#7f1d1d" },
                text: "Принять проклятие",
                onClick: () => {
                    const res = game.resolvePendingArtifact(true);
                    playSound(res && res.mergedArt ? "levelUp" : "equip");
                    if (onResolved) onResolved();
                },
            }),
            el("button", {
                style: { padding: "8px", fontSize: "12px", background: "#37474f" },
                text: "Отказаться",
                onClick: () => {
                    playSound("click");
                    game.resolvePendingArtifact(false);
                    if (onResolved) onResolved();
                },
            }),
        ]),
    ]);
}

function createSettingsAnchor(render) {
    const soundBtn = el("button", {
        text: getSoundToggleLabel(),
        onClick: () => {
            toggleMute();
            soundBtn.textContent = getSoundToggleLabel();
        },
    });
    const savesBtn = el("button", {
        text: "💾 Сохранения",
        onClick: () => {
            closeSettingsMenu();
            openSaveManagerModal(render);
        },
    });
    const replaysBtn = el("button", {
        text: "🎬 Реплеи",
        onClick: () => {
            closeSettingsMenu();
            openReplayManagerModal(render);
        },
    });
    const popover = el("div", { className: "settings-popover" }, [soundBtn, savesBtn, replaysBtn]);
    popover.hidden = true;

    const anchor = el("div", { className: "settings-anchor" }, [
        popover,
        el("button", {
            className: "btn-center",
            text: "⚙️",
            onClick: () => toggleSettingsMenu(popover, anchor),
        }),
    ]);

    return anchor;
}

function toggleSettingsMenu(popover, anchor) {
    if (!popover.hidden) {
        closeSettingsMenu();
        return;
    }

    closeSettingsMenu();
    popover.hidden = false;
    outsideSettingsClickHandler = (event) => {
        if (!anchor.contains(event.target)) {
            closeSettingsMenu();
        }
    };
    document.addEventListener("click", outsideSettingsClickHandler);
}

export function closeSettingsMenu() {
    const popover = document.querySelector(".settings-popover:not([hidden])");
    if (popover) popover.hidden = true;
    if (outsideSettingsClickHandler) {
        document.removeEventListener("click", outsideSettingsClickHandler);
        outsideSettingsClickHandler = null;
    }
}

function getSoundToggleLabel() {
    return isMuted() ? "🔇 Звук: Выкл" : "🔊 Звук: Вкл";
}
