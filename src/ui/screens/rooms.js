import { el } from "../../utils/dom.js";
import { game } from "../../engine/game.js";
import { GAME_DATA } from "../../data/index.js";
import { playSound } from "../../utils/audio.js";
import { renderStatsPanel, renderEquipmentComparison } from "../components.js";

export function renderLevelUpScreen(render) {
    if (!game._levelUpSoundPlayed) {
        playSound("levelUp");
        game._levelUpSoundPlayed = true;
    }
    const wrap = el("div", {}, [
        el("h2", { text: `⬆️ Уровень ${game.player.level + 1}!` }),
        el("p", {
            style: { marginBottom: "10px", textAlign: "center" },
            text: "Получено +3 MAX HP и +6 HP. Выберите 1 перк:",
        }),
    ]);

    game.selectedPerkChoices.forEach(perk => {
        wrap.appendChild(el("button", {
            onClick: () => {
                game._levelUpSoundPlayed = false;
                game.choosePerk(perk.id);
                render();
            },
        }, [
            el("b", { text: perk.name }),
            el("br"),
            el("small", { text: perk.desc }),
        ]));
    });

    return wrap;
}

export function renderEventScreen(render) {
    const ev = GAME_DATA.events.find(e => e.id === game.currentEventId) || GAME_DATA.events[0];
    const wrap = el("div", {}, [
        el("h3", { text: `❓ ${ev.title}` }),
        renderStatsPanel(),
        el("div", { className: "panel", text: ev.desc }),
    ]);

    ev.options.forEach(opt => {
        let disabled = false;
        let warningText = "";

        if (opt.goldCost && game.player.gold < opt.goldCost) {
            disabled = true;
            warningText = `Не хватает ${opt.goldCost - game.player.gold}G`;
        } else if (opt.hpCost && game.player.hp <= opt.hpCost) {
            disabled = true;
            warningText = "Слишком мало здоровья";
        } else if (opt.maxHpCost && game.player.baseMaxHp <= opt.maxHpCost) {
            disabled = true;
            warningText = "Слишком мало максимального здоровья";
        }

        const btnChildren = [
            el("div", { text: opt.text }),
        ];

        if (warningText) {
            btnChildren.push(el("div", {
                style: { fontSize: "11px", color: "#ff8a65", marginTop: "3px" },
                text: warningText,
            }));
        }

        wrap.appendChild(el("button", {
            disabled: disabled,
            onClick: () => {
                game.resolveEventOption(opt.id);
                render();
            },
        }, btnChildren));
    });

    return wrap;
}

export function renderEventRewardsScreen(render) {
    const rewards = game.eventRewards || { gold: 0, items: [] };
    const wrap = el("div", {}, [
        el("h3", { text: "❓ Награда за событие" }),
        renderStatsPanel(),
        el("div", {
            className: "panel",
            style: { borderColor: "#4caf50", background: "#1b2e1b" },
        }, [
            el("h3", { style: { color: "#81c784" }, text: "🎁 НАЙДЕНЫ ТРОФЕИ!" }),
            rewards.gold > 0 ? el("p", {
                className: "text-center",
                style: { marginBottom: "8px" },
                text: `Получено: +${rewards.gold} Золота`,
            }) : null,
        ]),
    ]);

    const box = wrap.lastElementChild;
    if (rewards.items.length > 0) {
        box.appendChild(el("div", {
            style: { marginBottom: "6px", fontWeight: "bold" },
            text: "Найденные предметы:",
        }));
        rewards.items.forEach(it => {
            box.appendChild(el("div", {
                style: { color: "#ffd54f", fontSize: "13px" },
                text: `• ${it}`,
            }));
        });
    }

    if (game.pendingEquipment) {
        box.appendChild(renderEquipmentComparison(game.pendingEquipment, render));
    }

    box.appendChild(el("button", {
        className: "btn-center btn-primary",
        disabled: Boolean(game.pendingEquipment),
        style: { marginTop: "10px" },
        text: game.pendingEquipment ? "Сначала сделайте выбор экипировки ☝️" : "Продолжить путь ➡️",
        onClick: () => {
            game.eventRewards = null;
            game.checkLevelUpOrFinishRoom();
            render();
        },
    }));

    return wrap;
}

export function renderCampfireScreen(render) {
    const mult = game.player.perks.includes("p28") ? 0.7 : 0.45;
    const healAmt = Math.ceil(game.player.getTotalMaxHp() * mult);
    return el("div", {}, [
        el("h3", { text: "🔥 Костёр Отдыха" }),
        renderStatsPanel(),
        el("button", {
            text: `💤 Отдохнуть у огня (+${healAmt} HP)`,
            onClick: () => {
                playSound("campfire");
                game.resolveCampfire("heal");
                render();
            },
        }),
        el("button", {
            text: "🔨 Заточить оружие (+1 ATK к заточке до конца забега)",
            onClick: () => {
                playSound("campfire");
                game.resolveCampfire("sharpen");
                render();
            },
        }),
        el("button", {
            text: "🧘 Медитировать (+4 MAX HP и +4 HP)",
            onClick: () => {
                playSound("campfire");
                game.resolveCampfire("meditate");
                render();
            },
        }),
    ]);
}

export function renderCorridorScreen(render) {
    const res = game.currentCorridorResult || {
        title: "Коридор",
        desc: "Темный коридор подземелья.",
        image: null,
        outcomeText: "Вы осторожно проходите вперед.",
        tone: "neutral",
        effectDesc: "",
    };

    let toneBg = "#1f1f1f";
    let toneBorder = "#444444";
    let toneColor = "#e0e0e0";

    if (res.tone === "positive") {
        toneBg = "#162816";
        toneBorder = "#4caf50";
        toneColor = "#81c784";
    } else if (res.tone === "negative") {
        toneBg = "#2d1616";
        toneBorder = "#e53e3e";
        toneColor = "#fc8181";
    }

    const wrap = el("div", {}, [
        el("h3", { text: `🕯️ ${res.title}` }),
        renderStatsPanel(),
        res.image ? el("img", {
            src: res.image,
            alt: res.title,
            style: {
                width: "100%",
                maxHeight: "140px",
                objectFit: "cover",
                borderRadius: "6px",
                border: "1px solid #333333",
                marginBottom: "10px",
                display: "block",
            },
            onError: e => {
                e.target.style.display = "none";
            },
        }) : null,
        el("div", {
            className: "panel",
            style: {
                color: "#cccccc",
                fontStyle: "italic",
                marginBottom: "10px",
            },
            text: res.desc,
        }),
        el("div", {
            className: "panel",
            style: {
                background: toneBg,
                borderColor: toneBorder,
                marginBottom: "12px",
            },
        }, [
            el("div", {
                style: {
                    fontSize: "14px",
                    lineHeight: "1.4",
                    marginBottom: res.effectDesc ? "8px" : "0",
                },
                text: res.outcomeText,
            }),
            res.effectDesc ? el("div", {
                style: {
                    fontWeight: "bold",
                    color: toneColor,
                    fontSize: "14px",
                },
                text: res.effectDesc,
            }) : null,
        ]),
        el("button", {
            className: game.player && game.player.hp <= 0 ? "btn-center btn-danger" : "btn-center btn-primary",
            text: game.player && game.player.hp <= 0 ? "💀 Погибнуть" : "🚪 Продолжить путь",
            onClick: () => {
                game.leaveCorridorRoom();
                render();
            },
        }),
    ]);

    return wrap;
}

export function renderShopScreen(render) {
    const wrap = el("div", {}, [
        el("h3", { text: "⚖️ Лавка Торговца и Кузнец" }),
        renderStatsPanel(),
    ]);

    game.shopOffers.forEach((offer, idx) => {
        const isPotion = offer.kind === "potion";
        const bagFull = isPotion && game.player.inventory.potions.length >= game.player.potionSlots;
        const notEnoughGold = game.player.gold < offer.cost;
        const canBuy = !offer.bought && !notEnoughGold && !bagFull;

        const btnChildren = [
            el("div", { className: "stats-line" }, [
                el("span", { text: offer.name }),
                el("b", { style: { color: "#ffd54f", marginLeft: "6px" }, text: `${offer.cost}G` }),
            ]),
        ];

        if (offer.bought) {
            btnChildren.push(el("div", {
                style: { fontSize: "11px", color: "#888888", marginTop: "3px" },
                text: "Куплено",
            }));
        } else if (bagFull) {
            btnChildren.push(el("div", {
                style: { fontSize: "11px", color: "#ff8a65", marginTop: "3px" },
                text: "Нет места в поясе",
            }));
        }

        wrap.appendChild(el("button", {
            disabled: !canBuy,
            onClick: () => {
                playSound("gold");
                game.buyShopOffer(idx);
                render();
            },
        }, btnChildren));
    });

    wrap.appendChild(el("button", {
        className: "btn-center",
        disabled: game.player.gold < game.rerollCost,
        style: { marginTop: "8px", background: "#2b3a4a" },
        text: `🔄 Обновить товары на витрине (${game.rerollCost}G)`,
        onClick: () => {
            playSound("gold");
            game.rerollShop();
            render();
        },
    }));

    wrap.appendChild(el("button", {
        className: "btn-center btn-danger",
        style: { marginTop: "8px" },
        text: "Покинуть лавку ➡️",
        onClick: () => {
            game.finishRoom();
            render();
        },
    }));

    return wrap;
}
