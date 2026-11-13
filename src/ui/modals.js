import { el } from "../utils/dom.js";
import { game } from "../engine/game.js";
import { GAME_DATA } from "../data/index.js";
import { renderItemLabelChildren } from "./rarity.js";

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
            potPanel.appendChild(el("div", { style: { marginBottom: "6px" } }, [
                el("div", { style: { fontSize: "12px" }, text: `${pot.name} — ${pot.desc}` }),
                el("div", { className: "flex-row" }, [
                    canDrinkHere ? el("button", {
                        style: { padding: "4px", fontSize: "11px", background: "#243b24" },
                        text: "Выпить",
                        onClick: () => {
                            game.usePotion(idx);
                            modalOverlay.remove();
                            render();
                        },
                    }) : null,
                    el("button", {
                        style: { padding: "4px", fontSize: "11px", background: "#4a2020" },
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
                perkPanel.appendChild(el("div", {
                    style: { fontSize: "12px", marginBottom: "3px" },
                    text: `• ${pObj.name}: ${pObj.desc}`,
                }));
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
                        text: "Сохранить сюда",
                        onClick: () => {
                            game.saveGame(slotKey);
                            rebuildModalContent();
                        },
                    }) : null,
                    summary ? el("button", {
                        style: { padding: "6px", fontSize: "12px" },
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
