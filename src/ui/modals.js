import { el } from "../utils/dom.js";
import { game } from "../engine/game.js";
import { GAME_DATA } from "../data/index.js";
import { renderItemLabelChildren, renderTextWithRarity } from "./rarity.js";
import { RNG } from "../utils/rng.js";
import { Player } from "../engine/player.js";
import {
    getActiveReplay,
    getReplayHistory,
    deleteReplay,
    clearReplayHistory,
    importReplayJson,
    exportReplayToFile,
    replayPlayer,
} from "../engine/systems/replay.js";

const STATS_HELP = [
    {
        name: "❤️ Здоровье (HP)",
        desc: "Текущий и максимальный запас жизни. Падение до 0 означает гибель в забеге.",
    },
    {
        name: "🛡️ Щит",
        desc: "Поглощает урон перед вычетом из HP. Не сгорает в конце хода и сохраняется до конца текущего боя.",
    },
    {
        name: "⚡ Энергия (EN)",
        desc: "Расходуется на применение боевых навыков. Восполняется перед боем, а также восстанавливает +1 EN за каждую новую открытую комнату.",
    },
    {
        name: "⚔️ Атака (ATK)",
        desc: "Базовая сила ударов и боевых умений. Складывается из силы класса, оружия, заточки и бонусов перков.",
    },
    {
        name: "🛡️ Защита (DEF)",
        desc: "Прямое вычитание из входящего урона (за исключением чистого урона). Каждый пункт DEF снижает урон на 1 (минимум 1 урона).",
    },
    {
        name: "🎯 Крит и Pity-бонус",
        desc: "Шанс нанести критический удар (x1.75 урона). За каждый удар без крита шанс увеличивается на +7% (защита от неудач). При успешном крите бонус сбрасывается.",
    },
    {
        name: "🌵 Шипы",
        desc: "Наносят чистый урон атакующему противнику каждый раз, когда он наносит удар герою.",
    },
    {
        name: "☠️ Яд",
        desc: "Наносит чистый урон в конце хода, игнорируя защиту и щит. Каждый ход количество яда уменьшается на 1.",
    },
    {
        name: "🩸 Кровоток",
        desc: "Наносит урон каждый раз, когда цель совершает атакующее действие.",
    },
    {
        name: "🔥 Концентрация",
        desc: "Увеличивает силу следующего удара. После совершения атаки эффект сбрасывается.",
    },
];

export function openCharacterModal(render) {
    const p = game.player;
    if (!p) return;

    const contentBox = el("div", { className: "modal-scroll" });

    const clsData = GAME_DATA.classes[p.classId];
    contentBox.appendChild(el("div", { className: "panel" }, [
        el("b", { text: `${p.className} (Уровень ${p.level})` }),
        el("div", { style: { fontSize: "12px", color: "#bbb", marginTop: "3px" }, text: clsData ? clsData.desc : "" }),
        el("div", {
            style: { marginTop: "6px", fontSize: "12px" },
            text: `Кузнечная заточка: Оружие +${p.weaponUpgradeLvl} | Броня +${p.armorUpgradeLvl}`,
        }),
        el("div", {
            style: { fontSize: "12px" },
            text: `Бонус Pity-Крита сейчас: +${p.pityCritBonus}% (Всего шанс: ${p.getCritChance()}%)`,
        }),
        game.seed ? el("div", {
            style: { marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "12px", color: "#b0bec5" },
        }, [
            el("div", {}, [
                el("div", {}, [
                    "Сид забега: ",
                    el("span", { style: { color: "#e0e0e0" }, text: String(RNG.getSeed()) }),
                ]),
                String(game.seed) !== String(RNG.getSeed())
                    ? el("div", { style: { color: "#e0e0e0", wordBreak: "break-all" }, text: String(game.seed) })
                    : null,
            ]),
            el("button", {
                text: "📋",
                style: { width: "auto", minWidth: "30px", padding: "4px 6px", margin: "0", fontSize: "14px", flexShrink: "0" },
                onClick: (e) => {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(String(game.seed));
                        e.target.textContent = "✓";
                    }
                },
            }),
        ]) : null,
    ]));

    const statsHelpList = STATS_HELP.map(item => el("div", {
        style: {
            marginTop: "6px",
            borderTop: "1px dashed #263238",
            paddingTop: "4px",
        },
    }, [
        el("b", { style: { color: "#e0e0e0", fontSize: "12px" }, text: item.name }),
        el("div", { style: { fontSize: "11px", color: "#b0bec5", marginTop: "2px", lineHeight: "1.3" }, text: item.desc }),
    ]));

    contentBox.appendChild(el("details", {
        className: "panel",
        style: {
            marginBottom: "8px",
            background: "#181f26",
            borderColor: "#37474f",
            cursor: "pointer",
        },
    }, [
        el("summary", {
            style: {
                fontWeight: "bold",
                color: "#90caf9",
                outline: "none",
                userSelect: "none",
            },
            text: "📖 Характеристики и эффекты",
        }),
        el("div", { style: { marginTop: "8px", cursor: "default" } }, statsHelpList),
    ]));

    const skillItems = GAME_DATA.skillsInfo.map(sk => el("div", {
        style: {
            marginBottom: "6px",
            borderBottom: "1px dashed #333",
            paddingBottom: "4px",
        },
    }, [
        el("div", { className: "stats-line" }, [
            el("b", { text: sk.name }),
            el("small", { style: { color: "#ffb74d" }, text: `${sk.cost} | КД: ${sk.cd}` }),
        ]),
        el("div", { style: { fontSize: "11px", color: "#ccc" }, text: sk.desc }),
    ]));

    contentBox.appendChild(el("details", {
        className: "panel",
        style: {
            marginBottom: "8px",
            background: "#181f26",
            borderColor: "#37474f",
            cursor: "pointer",
        },
    }, [
        el("summary", {
            style: {
                fontWeight: "bold",
                color: "#90caf9",
                outline: "none",
                userSelect: "none",
            },
            text: "⚔️ Боевые Навыки",
        }),
        el("div", { style: { marginTop: "8px", cursor: "default" } }, skillItems),
    ]));

    contentBox.appendChild(el("h4", { text: "🛡️ Экипировка и Артефакты:" }));
    const weaponChildren = p.inventory.weapon
        ? renderItemLabelChildren("⚔️ Оружие: ", p.inventory.weapon)
        : ["⚔️ Оружие: Нет"];
    const armorChildren = p.inventory.armor
        ? renderItemLabelChildren("🛡️ Броня: ", p.inventory.armor)
        : ["🛡️ Броня: Нет"];
    const eqPanel = el("div", { className: "panel" }, [
        el("div", {}, weaponChildren),
        el("div", {
            style: { marginTop: "4px" },
        }, armorChildren),
    ]);

    if (p.inventory.artifacts.length > 0) {
        eqPanel.appendChild(el("div", {
            style: { marginTop: "6px", fontWeight: "bold" },
            text: `💍 Собранные Артефакты (${p.inventory.artifacts.length}):`,
        }));
        p.inventory.artifacts.forEach(art => {
            eqPanel.appendChild(el("div", {
                style: { fontSize: "12px", color: "#81c784", marginTop: "2px" },
            }, renderItemLabelChildren("• ", art, "colon")));
        });
    } else {
        eqPanel.appendChild(el("div", {
            style: { marginTop: "6px", fontSize: "12px", color: "#777" },
            text: "Артефактов пока нет.",
        }));
    }
    contentBox.appendChild(eqPanel);

    contentBox.appendChild(el("h4", { text: `🧪 Пояс зелий (${p.inventory.potions.length}/${p.potionSlots}):` }));
    const potPanel = el("div", { className: "panel" });
    if (p.inventory.potions.length === 0) {
        potPanel.appendChild(el("div", { style: { fontSize: "12px", color: "#777" }, text: "Пусто." }));
    } else {
        p.inventory.potions.forEach((pot, idx) => {
            const canDrinkHere = (game.state === "BATTLE" || pot.canUseOnMap);
            const potText = pot.rarity
                ? `[${pot.rarity}] ${pot.name} — ${pot.desc}`
                : `${pot.name} — ${pot.desc}`;
            potPanel.appendChild(el("div", { style: { marginBottom: "6px" } }, [
                el("div", { style: { fontSize: "12px" } }, renderTextWithRarity(potText, pot.rarity || null)),
                el("div", { className: "flex-row" }, [
                    canDrinkHere ? el("button", {
                        style: { padding: "4px", fontSize: "11px", background: "#243b24" },
                        disabled: game.isReplayMode,
                        text: "Выпить",
                        onClick: () => {
                            game.usePotion(idx);
                            modalOverlay.remove();
                            render();
                        },
                    }) : null,
                    el("button", {
                        style: { padding: "4px", fontSize: "11px", background: "#4a2020" },
                        disabled: game.isReplayMode,
                        text: "Выбросить",
                        onClick: () => {
                            game.discardPotion(idx);
                            modalOverlay.remove();
                            openCharacterModal(render);
                            render();
                        },
                    }),
                ]),
            ]));
        });
    }
    contentBox.appendChild(potPanel);

    contentBox.appendChild(el("h4", { text: `⭐ Активные Перки (${p.perks.length}):` }));
    const perkPanel = el("div", { className: "panel" });
    if (p.perks.length === 0) {
        perkPanel.appendChild(el("div", { style: { fontSize: "12px", color: "#777" }, text: "Перков пока нет." }));
    } else {
        p.perks.forEach(pid => {
            const pObj = GAME_DATA.perks.find(x => x.id === pid);
            if (pObj) {
                const perkText = pObj.rarity
                    ? `• [${pObj.rarity}] ${pObj.name}: ${pObj.desc}`
                    : `• ${pObj.name}: ${pObj.desc}`;
                perkPanel.appendChild(el("div", {
                    style: { fontSize: "12px", marginBottom: "3px" },
                }, renderTextWithRarity(perkText, pObj.rarity || null)));
            }
        });
    }
    contentBox.appendChild(perkPanel);

    const modalOverlay = el("div", { className: "modal-overlay" }, [
        el("div", { className: "modal-box" }, [
            el("h3", { text: "👤 Меню Персонажа" }),
            contentBox,
            el("button", {
                className: "btn-center btn-danger",
                style: { marginTop: "8px" },
                text: "Закрыть",
                onClick: () => modalOverlay.remove(),
            }),
        ]),
    ]);

    document.body.appendChild(modalOverlay);
}

export function openSaveManagerModal(render) {
    const modalOverlay = el("div", { className: "modal-overlay" });

    function rebuildModalContent() {
        modalOverlay.replaceChildren();
        const scrollBox = el("div", { className: "modal-scroll" });

        ["slot1", "slot2", "slot3"].forEach((slotKey, i) => {
            const summary = game.getSlotSummary(slotKey);
            const slotCard = el("div", { className: "panel" }, [
                el("b", { text: `Слот #${i + 1}` }),
                el("div", {
                    style: { fontSize: "12px", color: summary ? "#81c784" : "#777", margin: "4px 0" },
                    text: summary || "Пустой слот",
                }),
                el("div", { className: "flex-row" }, [
                    game.player ? el("button", {
                        style: { padding: "6px", fontSize: "12px", background: "#264653" },
                        disabled: game.isReplayMode,
                        text: "Сохранить сюда",
                        onClick: () => {
                            game.saveGame(slotKey);
                            rebuildModalContent();
                        },
                    }) : null,
                    summary ? el("button", {
                        style: { padding: "6px", fontSize: "12px" },
                        disabled: game.isReplayMode,
                        text: "Загрузить",
                        onClick: () => {
                            if (game.loadGame(slotKey)) {
                                modalOverlay.remove();
                                render();
                            }
                        },
                    }) : null,
                    summary ? el("button", {
                        style: { padding: "6px", fontSize: "12px", background: "#4a2020" },
                        disabled: game.isReplayMode,
                        text: "Удалить",
                        onClick: () => {
                            game.deleteSlot(slotKey);
                            rebuildModalContent();
                        },
                    }) : null,
                ]),
            ]);
            scrollBox.appendChild(slotCard);
        });

        const currentJson = game.serializeState();
        const textarea = el("textarea", { id: "save-json-area" });
        textarea.value = currentJson;

        scrollBox.appendChild(el("div", { className: "panel" }, [
            el("b", { text: "📋 Экспорт / Импорт JSON" }),
            el("p", {
                style: { fontSize: "11px", margin: "4px 0" },
                text: "Скопируйте строку для бэкапа или вставьте свою:",
            }),
            textarea,
            el("div", { className: "flex-row" }, [
                el("button", {
                    className: "btn-center",
                    style: { padding: "6px", fontSize: "12px" },
                    text: "Скопировать JSON",
                    onClick: () => {
                        textarea.select();
                        navigator.clipboard?.writeText(textarea.value);
                    },
                }),
                el("button", {
                    className: "btn-center btn-primary",
                    style: { padding: "6px", fontSize: "12px" },
                    disabled: game.isReplayMode,
                    text: "Загрузить из JSON",
                    onClick: () => {
                        if (game.loadGame(textarea.value)) {
                            modalOverlay.remove();
                            render();
                        } else {
                            alert("Ошибка: некорректный JSON!");
                        }
                    },
                }),
            ]),
        ]));

        scrollBox.appendChild(el("button", {
            className: "btn-center btn-danger",
            style: { marginTop: "6px" },
            disabled: game.isReplayMode,
            text: "⚠️ ПОЛНЫЙ СБРОС ПРОГРЕССА (Начать с нуля)",
            onClick: () => {
                if (confirm("Вы уверены? Это удалит все Очки Душ, открытые классы и все слоты сохранений!")) {
                    game.hardResetAll();
                    modalOverlay.remove();
                    render();
                }
            },
        }));

        modalOverlay.appendChild(el("div", { className: "modal-box" }, [
            el("h3", { text: "💾 Управление Сохранениями" }),
            scrollBox,
            el("button", {
                className: "btn-center",
                style: { marginTop: "8px" },
                text: "Закрыть окно",
                onClick: () => modalOverlay.remove(),
            }),
        ]));
    }

    rebuildModalContent();
    document.body.appendChild(modalOverlay);
}

const REPLAY_OUTCOME_LABELS = {
    VICTORY: { text: "Победа", color: "#81c784", bg: "#162419", border: "#2e5c38" },
    GAMEOVER: { text: "Поражение", color: "#ef9a9a", bg: "#281618", border: "#5c262a" },
    INTERRUPTED: { text: "Прерван", color: "#ffd54f", bg: "#242014", border: "#574b24" },
    IN_PROGRESS: { text: "В процессе", color: "#90caf9", bg: "#18242e", border: "#4a7a96" },
};

function formatReplayDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
    });
}

function getReplayPlayer(rep) {
    const playerData = rep?.finalState?.player;
    if (!playerData) return null;
    const p = Object.assign(new Player(playerData.classId || "wanderer"), playerData);
    if (!p.inventory) p.inventory = { weapon: null, armor: null, potions: [], artifacts: [] };
    if (!p.inventory.artifacts) p.inventory.artifacts = [];
    if (!p.perks) p.perks = [];
    return p;
}

function joinWithStatDividers(items) {
    const out = [];
    items.forEach((item, idx) => {
        if (idx > 0) out.push(el("span", { className: "stat-divider" }));
        out.push(item);
    });
    return out;
}

function renderReplaySummaryStats(p) {
    if (!p) return null;
    return el("div", {
        style: {
            marginTop: "4px",
            fontSize: "11px",
            color: "#cfd8dc",
            lineHeight: "1.4",
        },
    }, [
        el("div", {}, joinWithStatDividers([
            `Ур. ${p.level}`,
            `❤️ ${p.hp}/${p.getTotalMaxHp()}`,
            `⚡ ${p.en}/${p.getTotalMaxEn()}`,
            `💰 ${p.gold}G`,
        ])),
        el("div", {}, joinWithStatDividers([
            `⚔️ ${p.getTotalAtk()}`,
            `🛡️ ${p.getTotalDef()}`,
            `🎯 ${p.getCritChance()}%`,
        ])),
    ]);
}

function renderReplayDetailsBlock(rep, p, actionsCount, badge, dateStr, actionsRow, deleteBtn) {
    const weaponText = p
        ? (p.inventory.weapon
            ? `${p.inventory.weapon.name}${p.weaponUpgradeLvl > 0 ? ` (+${p.weaponUpgradeLvl})` : ""}`
            : `Кулаки${p.weaponUpgradeLvl > 0 ? ` (+${p.weaponUpgradeLvl})` : ""}`)
        : null;
    const armorText = p
        ? (p.inventory.armor
            ? `${p.inventory.armor.name}${p.armorUpgradeLvl > 0 ? ` (+${p.armorUpgradeLvl})` : ""}`
            : `Лохмотья${p.armorUpgradeLvl > 0 ? ` (+${p.armorUpgradeLvl})` : ""}`)
        : null;
    const artifactsText = p
        ? (p.inventory.artifacts.length > 0
            ? p.inventory.artifacts.map(a => a.name).join(", ")
            : "нет")
        : null;
    const perksText = p
        ? (p.perks.length > 0
            ? p.perks.map(pid => GAME_DATA.perks.find(x => x.id === pid)?.name || pid).join(", ")
            : "нет")
        : null;

    const makeRow = (label, value, valueColor = "#e0e0e0") => el("div", { style: { color: "#b0bec5" } }, [
        `${label}: `,
        el("span", { style: { color: valueColor }, text: String(value) }),
    ]);

    return el("div", {
        style: {
            marginTop: "8px",
            paddingTop: "6px",
            borderTop: "1px dashed #263238",
            fontSize: "11px",
            color: "#cfd8dc",
            lineHeight: "1.45",
        },
    }, [
        makeRow("Исход", badge.text, badge.color),
        p ? makeRow("Уровень", `${p.level} (XP: ${p.xp}/${p.getRequiredXp()})`) : null,
        p ? makeRow("Оружие", weaponText) : null,
        p ? makeRow("Броня", armorText) : null,
        p ? makeRow("Артефакты", p.inventory.artifacts.length) : null,
        p ? makeRow("Перки", p.perks.length) : null,
        actionsRow,
        el("div", {
            style: {
                marginTop: "6px",
                marginBottom: "6px",
                borderBottom: "1px dashed #263238",
            },
        }),
        dateStr ? makeRow("Дата", dateStr) : null,
        el("div", { style: { color: "#b0bec5" } }, [
            "Ходов: ",
            el("span", { style: { color: "#e0e0e0" }, text: String(actionsCount) }),
            el("span", { className: "stat-divider" }),
            "Сид: ",
            el("span", { style: { color: "#e0e0e0" }, text: String(rep.seed ?? "?") }),
        ]),
        el("div", {
            className: "flex-row",
            style: { marginTop: "6px", gap: "4px" },
        }, [
            rep.seed ? el("button", {
                style: { padding: "4px 6px", margin: "0", fontSize: "11px" },
                text: "📋 Копировать сид",
                onClick: (e) => {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(String(rep.seed));
                        e.target.textContent = "✓ Сид скопирован";
                    }
                },
            }) : null,
            deleteBtn,
        ]),
    ]);
}

export function openReplayManagerModal(render) {
    const modalOverlay = el("div", { className: "modal-overlay" });

    function makeCopyJsonBtn(replay) {
        return el("button", {
            style: { padding: "6px", fontSize: "12px" },
            text: "📋 Копировать JSON",
            onClick: (e) => {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(JSON.stringify(replay));
                    e.target.textContent = "✓ Скопировано";
                }
            },
        });
    }

    function rebuildModalContent() {
        modalOverlay.replaceChildren();
        const scrollBox = el("div", { className: "modal-scroll" });
        const active = getActiveReplay();
        const history = getReplayHistory();

        if (active) {
            scrollBox.appendChild(el("div", {
                className: "panel",
                style: { borderColor: "#4a7a96", background: "#18242e" },
            }, [
                el("div", { style: { fontWeight: "bold", color: "#90caf9" }, text: "▶️ Текущий активный забег" }),
                el("div", {
                    style: { fontSize: "12px", margin: "4px 0", color: "#e0e0e0" },
                    text: `${active.className} — Этаж ${active.reachedFloor || 1}`,
                }),
                el("div", {
                    style: { fontSize: "11px", color: "#b0bec5", marginBottom: "6px" },
                    text: `Ходов: ${active.actions.length} | Сид: ${active.seed ?? "?"}`,
                }),
                el("div", { className: "flex-row" }, [
                    makeCopyJsonBtn(active),
                    el("button", {
                        style: { padding: "6px", fontSize: "12px", background: "#264653" },
                        text: "⬇️ Скачать .json",
                        onClick: () => exportReplayToFile(active),
                    }),
                    el("button", {
                        className: "btn-primary",
                        style: { padding: "6px", fontSize: "12px" },
                        text: "▶️ Смотреть",
                        onClick: () => {
                            modalOverlay.remove();
                            replayPlayer.startPlayback(game, active, render);
                        },
                    }),
                ]),
            ]));
        }

        const importTextarea = el("textarea", {
            style: {
                width: "100%",
                minHeight: "64px",
                boxSizing: "border-box",
                margin: "6px 0",
            },
        });
        importTextarea.placeholder = "Вставьте JSON реплея сюда...";

        const fileInput = el("input", {
            style: {
                width: "100%",
                boxSizing: "border-box",
                marginBottom: "6px",
                fontSize: "12px",
                color: "#b0bec5",
            },
        });
        fileInput.type = "file";
        fileInput.accept = ".json,application/json";
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = importReplayJson(text);
                if (!imported) {
                    alert("Ошибка: файл не содержит корректный реплей!");
                    return;
                }
                rebuildModalContent();
            } catch (e) {
                alert("Ошибка чтения JSON файла реплея!");
            }
        });

        scrollBox.appendChild(el("div", { className: "panel" }, [
            el("b", { text: "📥 Импорт реплея" }),
            importTextarea,
            fileInput,
            el("button", {
                className: "btn-center btn-primary",
                style: { padding: "6px", fontSize: "12px" },
                text: "Импортировать JSON",
                onClick: () => {
                    try {
                        const imported = importReplayJson(importTextarea.value);
                        if (!imported) {
                            alert("Ошибка: некорректный формат реплея (нужны initialState и actions)!");
                            return;
                        }
                        rebuildModalContent();
                    } catch (e) {
                        alert("Ошибка: некорректный JSON!");
                    }
                },
            }),
        ]));

        scrollBox.appendChild(el("h4", { text: `История реплеев (${history.length}/100):` }));

        if (history.length === 0) {
            scrollBox.appendChild(el("div", {
                className: "panel text-center",
                style: { fontSize: "12px", color: "#777" },
                text: "История реплеев пуста.",
            }));
        } else {
            history.forEach(rep => {
                const badge = REPLAY_OUTCOME_LABELS[rep.outcome] || REPLAY_OUTCOME_LABELS.INTERRUPTED;
                const dateStr = formatReplayDate(rep.finishedAt || rep.updatedAt || rep.startedAt);
                const actionsCount = Array.isArray(rep.actions) ? rep.actions.length : 0;
                const repPlayer = getReplayPlayer(rep);

                const summaryDateEl = dateStr ? el("span", {
                    style: {
                        position: "absolute",
                        right: "0",
                        bottom: "0",
                        fontSize: "10px",
                        color: "#b0bec5",
                        pointerEvents: "none",
                    },
                    text: dateStr,
                }) : null;

                const actionsRow = el("div", { className: "flex-row", style: { marginTop: "6px", gap: "4px" } }, [
                    el("button", {
                        style: { padding: "4px 6px", margin: "0", fontSize: "11px" },
                        text: "📋 JSON",
                        onClick: (e) => {
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(JSON.stringify(rep));
                                e.target.textContent = "✓ Скопировано";
                            }
                        },
                    }),
                    el("button", {
                        style: { padding: "4px 6px", margin: "0", fontSize: "11px", background: "#264653" },
                        text: "⬇️ Скачать",
                        onClick: () => exportReplayToFile(rep),
                    }),
                    el("button", {
                        className: "btn-primary",
                        style: { padding: "4px 6px", margin: "0", fontSize: "11px" },
                        text: "▶️ Смотреть",
                        onClick: () => {
                            modalOverlay.remove();
                            replayPlayer.startPlayback(game, rep, render);
                        },
                    }),
                ]);

                const deleteBtn = el("button", {
                    style: { padding: "4px 6px", margin: "0", fontSize: "11px", background: "#4a2020" },
                    text: "🗑️ Удалить",
                    onClick: () => {
                        if (confirm("Удалить этот реплей?")) {
                            deleteReplay(rep.id);
                            rebuildModalContent();
                        }
                    },
                });

                const detailsEl = el("details", {
                    className: "panel",
                    style: {
                        cursor: "pointer",
                        padding: "6px 10px",
                        background: badge.bg,
                        borderColor: badge.border,
                    },
                }, [
                    el("summary", {
                        style: {
                            listStyle: "none",
                            outline: "none",
                            position: "relative",
                        },
                    }, [
                        el("div", {
                            style: { fontSize: "13px", fontWeight: "bold" },
                            text: `${rep.className || "Герой"} — Этаж ${rep.reachedFloor || 1}`,
                        }),
                        renderReplaySummaryStats(repPlayer),
                        summaryDateEl,
                    ]),
                    renderReplayDetailsBlock(rep, repPlayer, actionsCount, badge, dateStr, actionsRow, deleteBtn),
                ]);
                if (summaryDateEl) {
                    detailsEl.addEventListener("toggle", () => {
                        summaryDateEl.style.display = detailsEl.open ? "none" : "block";
                    });
                }
                scrollBox.appendChild(detailsEl);
            });

            scrollBox.appendChild(el("button", {
                className: "btn-center btn-danger",
                style: { marginTop: "6px" },
                text: "🗑️ Очистить всю историю реплеев",
                onClick: () => {
                    if (confirm("Удалить всю историю сохранённых реплеев?")) {
                        clearReplayHistory();
                        rebuildModalContent();
                    }
                },
            }));
        }

        modalOverlay.appendChild(el("div", { className: "modal-box" }, [
            el("h3", { text: "🎬 Реплеи забегов" }),
            scrollBox,
            el("button", {
                className: "btn-center",
                style: { marginTop: "8px" },
                text: "Закрыть окно",
                onClick: () => {
                    modalOverlay.remove();
                    if (render) render();
                },
            }),
        ]));
    }

    rebuildModalContent();
    document.body.appendChild(modalOverlay);
}
