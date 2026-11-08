import { el } from "../../utils/dom.js";
import { game } from "../../engine/game.js";
import { GAME_DATA } from "../../data/index.js";
import { playSound } from "../../utils/audio.js";

export function renderMenuScreen(render) {
    const autoSummary = game.getSlotSummary("autosave");
    return el("div", {}, [
        el("h1", { text: "ХРОНИКИ КЛЕТЧАТОЙ БЕЗДНЫ" }),
        el("div", { className: "panel text-center" }, [
            el("div", { text: `Накоплено Очков Душ: 🔮 ${game.meta.souls}` }),
        ]),
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
        const isMax = curLvl >= upg.max;
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
                el("b", { text: `${upg.name} (${curLvl}/${upg.max})` }),
                el("span", { text: isMax ? "МАКС" : `${cost} Душ` }),
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

    Object.values(GAME_DATA.classes).forEach(cls => {
        const unlocked = game.meta.unlockedClasses.includes(cls.id);
        wrap.appendChild(el("button", {
            disabled: !unlocked,
            onClick: () => {
                game.startRun(cls.id);
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

export function renderEndScreen(render) {
    const isWin = game.state === "VICTORY";
    if (!game._endSoundPlayed) {
        playSound(isWin ? "victory" : "gameOver");
        game._endSoundPlayed = true;
    }
    return el("div", {}, [
        el("h2", { text: isWin ? "🏆 ПОБЕДА!" : "💀 ВЫ ПОГИБЛИ" }),
        el("div", { className: "panel text-center" }, [
            el("p", { text: isWin ? "Вы сокрушили Владыку Малкора и прошли Бездну!" : `Вы пали на Этаже ${game.floor + 1}.` }),
            el("p", { style: { marginTop: "8px" }, text: `Заработано Очков Душ: 🔮 +${game.lastEarnedSouls}` }),
            el("p", { text: `Всего Душ в Алтаре: 🔮 ${game.meta.souls}` }),
        ]),
        el("button", {
            className: "btn-center btn-primary",
            text: "🔮 Перейти в Алтарь Душ",
            onClick: () => {
                game._endSoundPlayed = false;
                game.state = "META_SHOP";
                render();
            },
        }),
        el("button", {
            className: "btn-center",
            text: "В главное меню",
            onClick: () => {
                game._endSoundPlayed = false;
                game.state = "MENU";
                render();
            },
        }),
    ]);
}
