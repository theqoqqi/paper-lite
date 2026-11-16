import { el } from "../../utils/dom.js";
import { game } from "../../engine/game.js";
import { GAME_DATA, ABYSS_START_FLOOR, getMetaUpgradeCap } from "../../data/index.js";
import { playSound } from "../../utils/audio.js";
import { normalizeSeed, RNG } from "../../utils/rng.js";

export function renderMenuScreen(render) {
    const autoSummary = game.getSlotSummary("autosave");
    const bestClassName = game.meta.bestClass && GAME_DATA.classes[game.meta.bestClass]
        ? GAME_DATA.classes[game.meta.bestClass].name
        : "";
    const metaPanelChildren = [
        el("div", { text: `Накоплено Очков Душ: 🔮 ${game.meta.souls}` }),
    ];
    if (game.meta.bestFloor > 0) {
        metaPanelChildren.push(el("div", {
            style: { marginTop: "4px" },
            text: `🏆 Рекорд: Этаж ${game.meta.bestFloor}${bestClassName ? ` (${bestClassName})` : ""}`,
        }));
    }
    if (game.meta.malkorDefeated) {
        metaPanelChildren.push(el("div", {
            style: { marginTop: "4px", color: "#cfa8ff" },
            text: "💀 Владыка Малкор повержен — Бездна и расширение Алтаря открыты",
        }));
    }
    return el("div", {}, [
        el("h1", { text: "ХРОНИКИ КЛЕТЧАТОЙ БЕЗДНЫ" }),
        el("div", { className: "panel text-center" }, metaPanelChildren),
        autoSummary ? el("button", {
            className: "btn-center btn-primary",
            text: `▶️ Продолжить (${autoSummary})`,
            onClick: () => {
                if (game.loadGame("autosave")) render();
            },
        }) : null,
        el("button", {
            className: "btn-center",
            style: { background: "#2e4c38", borderColor: "#4caf50", fontWeight: "bold" },
            text: "⚔️ Начать Новый Забег",
            onClick: () => {
                game.state = "CLASS_SELECT";
                render();
            },
        }),
        el("button", {
            className: "btn-center",
            text: "🔮 Алтарь Душ (Мета-прокачка и Классы)",
            onClick: () => {
                game.state = "META_SHOP";
                render();
            },
        }),
    ]);
}

export function renderMetaShopScreen(render) {
    const wrap = el("div", {}, [
        el("h2", { text: "Алтарь Душ" }),
        el("div", { className: "panel text-center", text: `Доступно Очков Душ: 🔮 ${game.meta.souls}` }),
        el("h3", { text: "Вечные характеристики" }),
    ]);

    GAME_DATA.metaUpgrades.forEach(upg => {
        const curLvl = game.meta[upg.key] || 0;
        const cap = getMetaUpgradeCap(upg, game.meta);
        const isLockedByMalkor = !game.meta.malkorDefeated && curLvl >= cap && cap < upg.max;
        const isMax = curLvl >= cap;
        const cost = isMax ? 0 : upg.costs[curLvl];
        const canBuy = !isMax && game.meta.souls >= cost;

        wrap.appendChild(el("button", {
            disabled: !canBuy,
            onClick: () => {
                game.buyMetaUpgrade(upg.key);
                render();
            },
        }, [
            el("div", { className: "stats-line" }, [
                el("b", { text: `${upg.name} (${curLvl}/${cap})` }),
                el("span", { text: isLockedByMalkor ? "🔒 ПОСЛЕ МАЛКОРА" : (isMax ? "МАКС" : `${cost} Душ`) }),
            ]),
            el("small", { text: upg.desc }),
        ]));
    });

    wrap.appendChild(el("h3", { text: "Открытие Классов", style: { marginTop: "12px" } }));

    Object.values(GAME_DATA.classes).forEach(cls => {
        const unlocked = game.meta.unlockedClasses.includes(cls.id);
        if (unlocked) return;
        const canBuy = game.meta.souls >= cls.cost;

        wrap.appendChild(el("button", {
            disabled: !canBuy,
            onClick: () => {
                game.unlockClass(cls.id);
                render();
            },
        }, [
            el("div", { className: "stats-line" }, [
                el("b", { text: `Открыть: ${cls.name}` }),
                el("span", { text: `${cls.cost} Душ` }),
            ]),
            el("small", { text: cls.desc }),
        ]));
    });

    wrap.appendChild(el("button", {
        className: "btn-center btn-danger",
        style: { marginTop: "12px" },
        text: "Назад в главное меню",
        onClick: () => {
            game.state = "MENU";
            render();
        },
    }));

    return wrap;
}

export function renderClassSelectScreen(render) {
    const wrap = el("div", {}, [el("h2", { text: "Выберите Класс Героя" })]);
    const seedInput = el("input", {
        style: {
            width: "100%",
            boxSizing: "border-box",
            background: "#12171d",
            color: "#e0e0e0",
            border: "1px solid #37474f",
            borderRadius: "6px",
            padding: "8px 10px",
            fontSize: "13px",
            outline: "none",
        },
    });
    seedInput.type = "text";
    seedInput.value = String(normalizeSeed(null));
    seedInput.placeholder = "Сид забега (число или текст)";

    Object.values(GAME_DATA.classes).forEach(cls => {
        const unlocked = game.meta.unlockedClasses.includes(cls.id);
        wrap.appendChild(el("button", {
            disabled: !unlocked,
            onClick: () => {
                const rawSeed = seedInput.value.trim();
                game.startRun(cls.id, rawSeed || null);
                render();
            },
        }, [
            el("div", { className: "stats-line" }, [
                el("b", { text: cls.name }),
                el("span", { text: unlocked ? `HP:${cls.hp} ATK:${cls.atk} DEF:${cls.def} EN:${cls.en}` : `🔒 Закрыт (${cls.cost} Душ)` }),
            ]),
            el("small", { text: cls.desc }),
        ]));
    });

    wrap.appendChild(el("div", { className: "panel", style: { marginTop: "10px", marginBottom: "10px" } }, [
        el("div", { style: { fontSize: "12px", color: "#b0bec5", marginBottom: "6px" }, text: "Сид забега:" }),
        seedInput,
    ]));

    wrap.appendChild(el("button", {
        className: "btn-center btn-danger",
        text: "Отмена",
        onClick: () => {
            game.state = "MENU";
            render();
        },
    }));
    return wrap;
}

export function renderAbyssChoiceScreen(render) {
    if (!game._abyssChoiceSoundPlayed) {
        playSound("victory");
        game._abyssChoiceSoundPlayed = true;
    }
    const p = game.player;
    return el("div", {}, [
        el("h2", { text: "⚡ ВЛАДЫКА МАЛКОР ПОВЕРЖЕН!" }),
        el("div", { className: "panel text-center" }, [
            el("p", { text: "Цитадель пала, но под троном разверзлась Бездна — бесконечный спуск на истощение." }),
            el("p", {
                style: { marginTop: "8px" },
                text: `Текущее состояние: ❤️ ${p.hp}/${p.getTotalMaxHp()} | ⚡ ${p.en}/${p.getTotalMaxEn()}`,
            }),
            el("p", {
                style: { marginTop: "8px", color: "#cfa8ff" },
                text: "В Бездне (Этаж 5+) HP и энергия не восстанавливаются между этажами, враги с 1-го раунда впадают в Ярость, цены растут, а забег длится до гибели.",
            }),
        ]),
        el("button", {
            className: "btn-center btn-primary",
            text: "🏆 Завершить забег с Победой и забрать Души",
            onClick: () => {
                game._abyssChoiceSoundPlayed = false;
                game._endSoundPlayed = false;
                game.finalizeRun("VICTORY");
                render();
            },
        }),
        el("button", {
            className: "btn-center",
            style: { marginTop: "8px", background: "#3a1f36", borderColor: "#b84dff", fontWeight: "bold" },
            text: "🕳️ Спуститься в Бездну (Этаж 5)",
            onClick: () => {
                game._abyssChoiceSoundPlayed = false;
                game.enterAbyssFromChoice();
                render();
            },
        }),
        el("button", {
            className: "btn-center",
            style: { marginTop: "8px" },
            text: "🗺️ Продолжить исследование 4 этажа",
            onClick: () => {
                game._abyssChoiceSoundPlayed = false;
                game.state = "MAP";
                game.saveGame("autosave");
                render();
            },
        }),
    ]);
}

export function renderEndScreen(render) {
    const isWin = game.state === "VICTORY";
    const isAbyssRun = game.enteredAbyss || game.floor >= ABYSS_START_FLOOR;
    if (!game._endSoundPlayed) {
        playSound(isWin ? "victory" : "gameOver");
        game._endSoundPlayed = true;
    }
    const resultText = isWin
        ? "Вы сокрушили Владыку Малкора и вышли победителем!"
        : (isAbyssRun
            ? `Вы пали в Бездне на Этаже ${game.floor + 1}.`
            : `Вы пали на Этаже ${game.floor + 1}.`);
    return el("div", {}, [
        el("h2", { text: isWin ? "🏆 ПОБЕДА!" : "💀 ВЫ ПОГИБЛИ" }),
        el("div", { className: "panel text-center" }, [
            el("p", { text: resultText }),
            el("p", { style: { marginTop: "8px" }, text: `Заработано Очков Душ: 🔮 +${game.lastEarnedSouls}` }),
            el("p", { text: `Всего Душ в Алтаре: 🔮 ${game.meta.souls}` }),
            game.meta.bestFloor > 0 ? el("p", {
                style: { marginTop: "6px" },
                text: `🏆 Лучший достигнутый этаж: ${game.meta.bestFloor}`,
            }) : null,
            game.seed ? el("div", {
                style: { marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" },
            }, [
                el("div", { style: { textAlign: "left", fontSize: "12px", color: "#b0bec5" } }, [
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
        ]),
        el("button", {
            className: "btn-center btn-primary",
            text: "🔮 Перейти в Алтарь Душ",
            onClick: () => {
                game._endSoundPlayed = false;
                game._abyssChoiceSoundPlayed = false;
                game.state = "META_SHOP";
                render();
            },
        }),
        el("button", {
            className: "btn-center",
            text: "В главное меню",
            onClick: () => {
                game._endSoundPlayed = false;
                game._abyssChoiceSoundPlayed = false;
                game.state = "MENU";
                render();
            },
        }),
    ]);
}
