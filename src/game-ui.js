// ============================================================================
// GAME-UI.JS — Отрисовка интерфейса, меню Персонажа/Скиллов и Менеджер Сейвов
// ============================================================================

function el(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.id) element.id = options.id;
    if (options.disabled) element.disabled = true;
    if (options.style) Object.assign(element.style, options.style);
    if (options.onClick) element.addEventListener("click", options.onClick);

    children.forEach(child => {
        if (!child) return;
        if (typeof child === "string" || typeof child === "number") {
            element.appendChild(document.createTextNode(String(child)));
        } else {
            element.appendChild(child);
        }
    });
    return element;
}

function renderStatsPanel() {
    const p = game.player;
    const maxHp = p.getTotalMaxHp();
    const maxEn = p.getTotalMaxEn();
    const wName = p.inventory.weapon ? `${p.inventory.weapon.name}${p.weaponUpgradeLvl ? ` (+${p.weaponUpgradeLvl})` : ""}` : `Кулаки (+${p.weaponUpgradeLvl})`;
    const aName = p.inventory.armor ? `${p.inventory.armor.name}${p.armorUpgradeLvl ? ` (+${p.armorUpgradeLvl})` : ""}` : `Лохмотья (+${p.armorUpgradeLvl})`;

    const statusTags = [];
    if (p.poison > 0) statusTags.push(`☠️Яд:${p.poison}`);
    if (p.bleed > 0) statusTags.push(`🩸Кровь:${p.bleed}`);
    if (p.concentrateBonus > 0) statusTags.push(`🔥Усил:+${p.concentrateBonus}`);

    return el("div", { className: "panel" }, [
        el("div", { className: "stats-line" }, [
            el("b", { text: `${p.className} (Ур. ${p.level})` }),
            el("span", { text: `XP: ${p.xp}/${p.getRequiredXp()} | 💰 ${p.gold}G` })
        ]),
        el("div", { className: "stats-line" }, [
            el("span", { text: `❤️ HP: ${p.hp}/${maxHp} (Щит: ${p.shield})` }),
            el("span", { text: `⚡ EN: ${p.en}/${maxEn}` })
        ]),
        el("div", { className: "stats-line" }, [
            el("span", { text: `⚔️ ATK: ${p.getTotalAtk()} | 🛡️ DEF: ${p.getTotalDef()} | 🎯 Крит: ${p.getCritChance()}% | 🌵 Шипы: ${p.getTotalSpikes()}` })
        ]),
        statusTags.length > 0 ? el("div", {
            style: { color: "#ff8a65", fontSize: "12px" },
            text: `Статусы: ${statusTags.join(" ")}`
        }) : null,
        el("div", {
            className: "equip-line",
            text: `⚔️ ${wName} | 🛡️ ${aName} | 💍 Артефактов: ${p.inventory.artifacts.length} | ⭐ Перков: ${p.perks.length}`
        })
    ]);
}

function render() {
    const container = document.getElementById("screen-container");
    container.replaceChildren();
    renderGlobalNav();

    if (game.state === "MENU") container.appendChild(renderMenuScreen());
    else if (game.state === "META_SHOP") container.appendChild(renderMetaShopScreen());
    else if (game.state === "CLASS_SELECT") container.appendChild(renderClassSelectScreen());
    else if (game.state === "MAP") container.appendChild(renderMapScreen());
    else if (game.state === "BATTLE") container.appendChild(renderBattleScreen());
    else if (game.state === "LEVELUP") container.appendChild(renderLevelUpScreen());
    else if (game.state === "EVENT") container.appendChild(renderEventScreen());
    else if (game.state === "EVENT_REWARDS") container.appendChild(renderEventRewardsScreen());
    else if (game.state === "CAMPFIRE") container.appendChild(renderCampfireScreen());
    else if (game.state === "SHOP") container.appendChild(renderShopScreen());
    else if (game.state === "GAMEOVER" || game.state === "VICTORY") container.appendChild(renderEndScreen());
}

function renderGlobalNav() {
    const nav = document.getElementById("global-nav");
    nav.replaceChildren();

    const row = el("div", { className: "flex-row" });
    if (game.player && ["MAP", "BATTLE", "SHOP", "EVENT", "CAMPFIRE", "EVENT_REWARDS"].includes(game.state)) {
        row.appendChild(el("button", {
            className: "btn-center",
            style: { background: "#2b3a4a" },
            text: "👤 Герой и Навыки",
            onClick: openCharacterModal
        }));
    }
    row.appendChild(el("button", {
        className: "btn-center",
        text: "💾 Сохранения",
        onClick: openSaveManagerModal
    }));
    nav.appendChild(row);
}

function renderMenuScreen() {
    const autoSummary = game.getSlotSummary("autosave");
    return el("div", {}, [
        el("h1", { text: "ХРОНИКИ КЛЕТЧАТОЙ БЕЗДНЫ" }),
        el("div", { className: "panel text-center" }, [
            el("div", { text: `Накоплено Очков Душ: 🔮 ${game.meta.souls}` })
        ]),
        autoSummary ? el("button", {
            className: "btn-center btn-primary",
            text: `▶️ Продолжить (${autoSummary})`,
            onClick: () => {
                if (game.loadGame("autosave")) render();
            }
        }) : null,
        el("button", {
            className: "btn-center",
            style: { background: "#2e4c38", borderColor: "#4caf50", fontWeight: "bold" },
            text: "⚔️ Начать Новый Забег",
            onClick: () => {
                game.state = "CLASS_SELECT";
                render();
            }
        }),
        el("button", {
            className: "btn-center",
            text: "🔮 Алтарь Душ (Мета-прокачка и Классы)",
            onClick: () => {
                game.state = "META_SHOP";
                render();
            }
        })
    ]);
}

function renderMetaShopScreen() {
    const wrap = el("div", {}, [
        el("h2", { text: "Алтарь Душ" }),
        el("div", { className: "panel text-center", text: `Доступно Очков Душ: 🔮 ${game.meta.souls}` }),
        el("h3", { text: "Вечные характеристики" })
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
            }
        }, [
            el("div", { className: "stats-line" }, [
                el("b", { text: `${upg.name} (${curLvl}/${upg.max})` }),
                el("span", { text: isMax ? "МАКС" : `${cost} Душ` })
            ]),
            el("small", { text: upg.desc })
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
            }
        }, [
            el("div", { className: "stats-line" }, [
                el("b", { text: `Открыть: ${cls.name}` }),
                el("span", { text: `${cls.cost} Душ` })
            ]),
            el("small", { text: cls.desc })
        ]));
    });

    wrap.appendChild(el("button", {
        className: "btn-center btn-danger",
        style: { marginTop: "12px" },
        text: "Назад в главное меню",
        onClick: () => {
            game.state = "MENU";
            render();
        }
    }));

    return wrap;
}

function renderClassSelectScreen() {
    const wrap = el("div", {}, [el("h2", { text: "Выберите Класс Героя" })]);

    Object.values(GAME_DATA.classes).forEach(cls => {
        const unlocked = game.meta.unlockedClasses.includes(cls.id);
        wrap.appendChild(el("button", {
            disabled: !unlocked,
            onClick: () => {
                game.startRun(cls.id);
                render();
            }
        }, [
            el("div", { className: "stats-line" }, [
                el("b", { text: cls.name }),
                el("span", { text: unlocked ? `HP:${cls.hp} ATK:${cls.atk} DEF:${cls.def} EN:${cls.en}` : `🔒 Закрыт (${cls.cost} Душ)` })
            ]),
            el("small", { text: cls.desc })
        ]));
    });

    wrap.appendChild(el("button", {
        className: "btn-center btn-danger",
        text: "Отмена",
        onClick: () => {
            game.state = "MENU";
            render();
        }
    }));
    return wrap;
}

function renderMapScreen() {
    const floorData = GAME_DATA.floors[game.floor];
    const roomTypes = {
        battle: { icon: "⚔️", name: "Бой" },
        elite: { icon: "💀", name: "Элита" },
        event: { icon: "❓", name: "Событие" },
        shop: { icon: "⚖️", name: "Лавка" },
        campfire: { icon: "🔥", name: "Костёр" },
        boss: { icon: "👑", name: "БОСС" },
    };

    const grid = el("div", { className: "map-grid" });
    game.mapRooms.forEach(r => {
        let cls = "map-node";
        if (r.id === game.room) cls += " active";
        else if (r.completed) cls += " done";

        const info = roomTypes[r.type] || { icon: "❓", name: r.type };

        grid.appendChild(el("div", {
            className: cls,
            onClick: () => {
                if (r.id === game.room) {
                    game.enterRoom(r.id);
                    render();
                }
            },
        }, [
            el("div", { style: { fontSize: "18px", lineHeight: "1.2" }, text: info.icon }),
            el("div", { style: { fontSize: "11px", marginTop: "2px" }, text: info.name }),
        ]));
    });

    const curRoomObj = game.mapRooms.find(r => r.id === game.room);
    const curType = roomTypes[curRoomObj?.type || "battle"] || { icon: "⚔️", name: "Бой" };

    return el("div", {}, [
        el("h3", { text: `Этаж ${game.floor + 1}: ${floorData.name}` }),
        renderStatsPanel(),
        grid,
        el("button", {
            className: "btn-center btn-primary",
            text: `Войти в Комнату #${game.room} (${curType.icon} ${curType.name})`,
            onClick: () => {
                game.enterRoom(game.room);
                render();
            },
        }),
    ]);
}

function renderBattleScreen() {
    game.ensureValidTarget();
    const p = game.player;
    const cds = p.cooldowns || {};
    const atk = p.getTotalAtk();

    const wrap = el("div", {}, [
        el("h3", { text: `Бой — Комната #${game.room} (Раунд ${game.battleTurn})` }),
        renderStatsPanel()
    ]);

    // Если бой завершен — показываем экран Трофеев вместо врагов и кнопок атаки
    if (game.battleFinished) {
        const rewardBox = el("div", { className: "panel", style: { borderColor: "#4caf50", background: "#1b2e1b" } }, [
            el("h3", { style: { color: "#81c784" }, text: "🏆 ПОБЕДА В БОЮ!" }),
            el("p", {
                className: "text-center",
                style: { marginBottom: "8px" },
                text: `Получено: +${game.battleRewards.xp} XP | +${game.battleRewards.gold} Золота`
            })
        ]);

        if (game.battleRewards.items.length > 0) {
            rewardBox.appendChild(el("div", {
                style: { marginBottom: "6px", fontWeight: "bold" },
                text: "Найденные трофеи:"
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
            }
        }));
        wrap.appendChild(rewardBox);
    } else {
        // Карточки живых врагов
        const enemyBox = el("div", { style: { marginBottom: "8px" } }, [
            el("div", {
                style: { marginBottom: "4px", fontSize: "12px", color: "#aaa" },
                text: game.isProcessingTurn ? "⏳ Ход противников..." : "Выберите цель для атаки:"
            })
        ]);

        game.enemies.forEach((en, idx) => {
            if (en.currentHp <= 0) return;
            const isSelected = idx === game.selectedTargetIndex;
            const nextPat = en.pattern[(en.patternIndex || 0) % en.pattern.length];
            const previewVal = nextPat.val ? nextPat.val + (en.atkBonus || 0) : 0;

            const statusParts = [];
            if (en.shield > 0) statusParts.push(`Щит:${en.shield}`);
            if (en.spikes > 0) statusParts.push(`Шипы:${en.spikes}`);
            if (en.poison > 0) statusParts.push(`Яд:${en.poison}`);
            if (en.bleed > 0) statusParts.push(`Кровь:${en.bleed}`);
            if (en.regen > 0) statusParts.push(`Реген:${en.regen}`);

            enemyBox.appendChild(el("div", {
                className: `enemy-card ${isSelected ? "selected" : ""}`,
                onClick: () => {
                    if (!game.isProcessingTurn) {
                        game.selectedTargetIndex = idx;
                        render();
                    }
                }
            }, [
                el("div", { className: "stats-line" }, [
                    el("b", { text: `${isSelected ? "🎯 " : ""}${en.name}` }),
                    el("span", { text: `❤️ ${en.currentHp}/${en.hp} | DEF:${en.def}` })
                ]),
                statusParts.length > 0 ? el("div", { className: "enemy-status", text: statusParts.join(" | ") }) : null,
                el("div", {
                    className: "enemy-intent",
                    text: `Намерение: ${nextPat.text}${previewVal > 0 ? ` (~${previewVal} ур.)` : ""}`
                })
            ]));
        });
        wrap.appendChild(enemyBox);

        // Кнопки навыков с превью урона/эффекта
        const fastMin = atk + 1, fastMax = atk + 4;
        const hvyMin = Math.round(atk * 1.4) + 2, hvyMax = Math.round(atk * 1.4) + 6;
        const prcDmg = (atk * 2) + 4 + (p.perks.includes("p1") ? 4 : 0);
        const whrMin = atk + (p.classId === "arcanist" ? 4 : 2), whrMax = atk + (p.classId === "arcanist" ? 8 : 5);
        const defShield = 4 + p.getTotalDef() + (p.classId === "crusader" ? 4 : 0);

        const defLabel = cds.defend > 0 ? `🛡️ Защита [КД:${cds.defend}]` : `🛡️ Защита (0) [+${defShield} Щит]`;
        const prcLabel = cds.pierce > 0 ? `🗡️ Пробив. [КД:${cds.pierce}]` : `🗡️ Пробив. (2) [${prcDmg} чист.]`;
        const whrLabel = cds.whirlwind > 0 ? `🌪️ Вихрь [КД:${cds.whirlwind}]` : `🌪️ Вихрь (2) [${whrMin}-${whrMax} всем]`;
        const cncLabel = p.concentrateUsesLeft <= 0
            ? "🧘 Концентр. [0/2]"
            : (cds.concentrate > 0 ? `🧘 Концентр. [КД:${cds.concentrate}]` : `🧘 Концентр. (${p.concentrateUsesLeft}/2) [+2 EN]`);

        const actionsGrid = el("div", {}, [
            el("div", { className: "flex-row" }, [
                el("button", {
                    disabled: game.isProcessingTurn,
                    text: `⚔️ Быстрый (0) [${fastMin}-${fastMax}]`,
                    onClick: () => game.playerAction("fast", render)
                }),
                el("button", {
                    disabled: !game.canUseSkill("defend", 0),
                    text: defLabel,
                    onClick: () => game.playerAction("defend", render)
                })
            ]),
            el("div", { className: "flex-row" }, [
                el("button", {
                    disabled: game.isProcessingTurn || !game.canAffordEn(1),
                    text: `💥 Тяжёлый (1) [${hvyMin}-${hvyMax}]`,
                    onClick: () => game.playerAction("heavy", render)
                }),
                el("button", {
                    disabled: !game.canUseSkill("pierce", 2),
                    text: prcLabel,
                    onClick: () => game.playerAction("pierce", render)
                })
            ]),
            el("div", { className: "flex-row" }, [
                el("button", {
                    disabled: !game.canUseSkill("whirlwind", 2),
                    text: whrLabel,
                    onClick: () => game.playerAction("whirlwind", render)
                }),
                el("button", {
                    disabled: !game.canUseSkill("concentrate", 0),
                    text: cncLabel,
                    onClick: () => game.playerAction("concentrate", render)
                })
            ])
        ]);
        wrap.appendChild(actionsGrid);

        if (p.inventory.potions.length > 0) {
            const potRow = el("div", { style: { marginTop: "6px" } }, [
                el("small", { text: `Зелья (${p.inventory.potions.length}/${p.potionSlots}, не тратят ход):` })
            ]);
            p.inventory.potions.forEach((pot, pIdx) => {
                potRow.appendChild(el("button", {
                    disabled: game.isProcessingTurn,
                    style: { padding: "6px", fontSize: "12px", background: "#243b24" },
                    text: `🧪 ${pot.name} — ${pot.desc}`,
                    onClick: () => {
                        game.usePotion(pIdx);
                        render();
                    }
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

function renderLevelUpScreen() {
    const wrap = el("div", {}, [
        el("h2", { text: `⬆️ Уровень ${game.player.level + 1}!` }),
        el("p", {
            style: { marginBottom: "10px", textAlign: "center" },
            text: "Получено +3 MAX HP и +6 HP. Выберите 1 перк:"
        })
    ]);

    game.selectedPerkChoices.forEach(perk => {
        wrap.appendChild(el("button", {
            onClick: () => {
                game.choosePerk(perk.id);
                render();
            }
        }, [
            el("b", { text: perk.name }),
            el("br"),
            el("small", { text: perk.desc })
        ]));
    });

    return wrap;
}

function renderEventScreen() {
    const ev = GAME_DATA.events.find(e => e.id === game.currentEventId) || GAME_DATA.events[0];
    const wrap = el("div", {}, [
        el("h3", { text: `❓ ${ev.title}` }),
        renderStatsPanel(),
        el("div", { className: "panel", text: ev.desc })
    ]);

    ev.options.forEach(opt => {
        wrap.appendChild(el("button", {
            text: opt.text,
            onClick: () => {
                game.resolveEventOption(opt.id);
                render();
            }
        }));
    });

    return wrap;
}

function renderEventRewardsScreen() {
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

function renderCampfireScreen() {
    const mult = game.player.perks.includes("p28") ? 0.7 : 0.45;
    const healAmt = Math.ceil(game.player.getTotalMaxHp() * mult);
    return el("div", {}, [
        el("h3", { text: "🔥 Костёр Отдыха" }),
        renderStatsPanel(),
        el("button", {
            text: `💤 Отдохнуть у огня (+${healAmt} HP)`,
            onClick: () => {
                game.resolveCampfire("heal");
                render();
            }
        }),
        el("button", {
            text: "🔨 Заточить оружие (+1 ATK к заточке до конца забега)",
            onClick: () => {
                game.resolveCampfire("sharpen");
                render();
            }
        }),
        el("button", {
            text: "🧘 Медитировать (+4 MAX HP и +4 HP)",
            onClick: () => {
                game.resolveCampfire("meditate");
                render();
            }
        })
    ]);
}

function renderShopScreen() {
    const wrap = el("div", {}, [
        el("h3", { text: "⚖️ Лавка Торговца и Кузнец" }),
        renderStatsPanel()
    ]);

    game.shopOffers.forEach((offer, idx) => {
        const canBuy = !offer.bought && game.player.gold >= offer.cost;
        wrap.appendChild(el("button", {
            disabled: !canBuy,
            onClick: () => {
                game.buyShopOffer(idx);
                render();
            }
        }, [
            el("div", { className: "stats-line" }, [
                el("span", { text: offer.bought ? `[КУПЛЕНО] ${offer.name}` : offer.name }),
                el("b", { style: { color: "#ffd54f", marginLeft: "6px" }, text: `${offer.cost}G` })
            ])
        ]));
    });

    wrap.appendChild(el("button", {
        className: "btn-center",
        disabled: game.player.gold < game.rerollCost,
        style: { marginTop: "8px", background: "#2b3a4a" },
        text: `🔄 Обновить товары на витрине (${game.rerollCost}G)`,
        onClick: () => {
            game.rerollShop();
            render();
        }
    }));

    wrap.appendChild(el("button", {
        className: "btn-center btn-danger",
        style: { marginTop: "8px" },
        text: "Покинуть лавку ➡️",
        onClick: () => {
            game.finishRoom();
            render();
        }
    }));

    return wrap;
}

function renderEndScreen() {
    const isWin = game.state === "VICTORY";
    return el("div", {}, [
        el("h2", { text: isWin ? "🏆 ПОБЕДА!" : "💀 ВЫ ПОГИБЛИ" }),
        el("div", { className: "panel text-center" }, [
            el("p", { text: isWin ? "Вы сокрушили Владыку Малкора и прошли Бездну!" : `Вы пали на Этаже ${game.floor + 1} (Комната ${game.room}).` }),
            el("p", { style: { marginTop: "8px" }, text: `Заработано Очков Душ: 🔮 +${game.lastEarnedSouls}` }),
            el("p", { text: `Всего Душ в Алтаре: 🔮 ${game.meta.souls}` })
        ]),
        el("button", {
            className: "btn-center btn-primary",
            text: "🔮 Перейти в Алтарь Душ",
            onClick: () => {
                game.state = "META_SHOP";
                render();
            }
        }),
        el("button", {
            className: "btn-center",
            text: "В главное меню",
            onClick: () => {
                game.state = "MENU";
                render();
            }
        })
    ]);
}

function renderEquipmentComparison(pendingEquip, onResolved) {
    if (!pendingEquip) return null;
    const { type, item } = pendingEquip;
    const current = type === "weapon" ? game.player.inventory.weapon : game.player.inventory.armor;
    const currentName = current ? `${current.name} (${current.desc})` : (type === "weapon" ? "Кулаки" : "Лохмотья");
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
            text: `Надето: ${currentName}`,
        }),
        el("div", {
            style: { fontSize: "12px", color: "#81c784", marginBottom: "8px" },
            text: `Найдено: [${item.rarity}] ${item.name} (${item.desc})`,
        }),
        el("div", { className: "flex-row" }, [
            el("button", {
                className: "btn-primary",
                style: { padding: "8px", fontSize: "12px" },
                text: `Надеть (+${oldRefund}G со старого)`,
                onClick: () => {
                    game.resolveEquipChoice();
                    if (onResolved) onResolved();
                },
            }),
            el("button", {
                style: { padding: "8px", fontSize: "12px", background: "#4a3220" },
                text: `Разобрать (+${salvageGain}G)`,
                onClick: () => {
                    game.resolveSalvageChoice();
                    if (onResolved) onResolved();
                },
            }),
        ]),
    ]);
}

// ================= МОДАЛЬНОЕ ОКНО: ГЕРОЙ, ИНВЕНТАРЬ И СПРАВОЧНИК НАВЫКОВ =================

function openCharacterModal() {
    const p = game.player;
    if (!p) return;

    const contentBox = el("div", { className: "modal-scroll" });

    // 1. Класс и характеристики
    const clsData = GAME_DATA.classes[p.classId];
    contentBox.appendChild(el("div", { className: "panel" }, [
        el("b", { text: `${p.className} (Уровень ${p.level})` }),
        el("div", { style: { fontSize: "12px", color: "#bbb", marginTop: "3px" }, text: clsData ? clsData.desc : "" }),
        el("div", {
            style: { marginTop: "6px", fontSize: "12px" },
            text: `Кузнечная заточка: Оружие +${p.weaponUpgradeLvl} | Броня +${p.armorUpgradeLvl}`
        }),
        el("div", {
            style: { fontSize: "12px" },
            text: `Бонус Pity-Крита сейчас: +${p.pityCritBonus}% (Всего шанс: ${p.getCritChance()}%)`
        })
    ]));

    // 2. Справочник боевых навыков
    contentBox.appendChild(el("h4", { text: "📖 Боевые Навыки:" }));
    const skillsPanel = el("div", { className: "panel" });
    GAME_DATA.skillsInfo.forEach(sk => {
        skillsPanel.appendChild(el("div", {
            style: {
                marginBottom: "6px",
                borderBottom: "1px dashed #333",
                paddingBottom: "4px"
            }
        }, [
            el("div", { className: "stats-line" }, [
                el("b", { text: sk.name }),
                el("small", { style: { color: "#ffb74d" }, text: `${sk.cost} | КД: ${sk.cd}` })
            ]),
            el("div", { style: { fontSize: "11px", color: "#ccc" }, text: sk.desc })
        ]));
    });
    contentBox.appendChild(skillsPanel);

    // 3. Экипировка и Артефакты
    contentBox.appendChild(el("h4", { text: "🛡️ Экипировка и Артефакты:" }));
    const eqPanel = el("div", { className: "panel" }, [
        el("div", { text: `⚔️ Оружие: ${p.inventory.weapon ? `${p.inventory.weapon.name} (${p.inventory.weapon.desc})` : "Нет"}` }),
        el("div", {
            style: { marginTop: "4px" },
            text: `🛡️ Броня: ${p.inventory.armor ? `${p.inventory.armor.name} (${p.inventory.armor.desc})` : "Нет"}`
        })
    ]);

    if (p.inventory.artifacts.length > 0) {
        eqPanel.appendChild(el("div", {
            style: { marginTop: "6px", fontWeight: "bold" },
            text: `💍 Собранные Артефакты (${p.inventory.artifacts.length}):`
        }));
        p.inventory.artifacts.forEach(art => {
            eqPanel.appendChild(el("div", {
                style: { fontSize: "12px", color: "#81c784", marginTop: "2px" },
                text: `• ${art.name}: ${art.desc}`
            }));
        });
    } else {
        eqPanel.appendChild(el("div", {
            style: { marginTop: "6px", fontSize: "12px", color: "#777" },
            text: "Артефактов пока нет."
        }));
    }
    contentBox.appendChild(eqPanel);

    // 4. Пояс зелий
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
                        }
                    }) : null,
                    el("button", {
                        style: { padding: "4px", fontSize: "11px", background: "#4a2020" },
                        text: "Выбросить",
                        onClick: () => {
                            game.discardPotion(idx);
                            modalOverlay.remove();
                            openCharacterModal();
                            render();
                        }
                    })
                ])
            ]));
        });
    }
    contentBox.appendChild(potPanel);

    // 5. Перки забега
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
                    text: `• ${pObj.name}: ${pObj.desc}`
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
                onClick: () => modalOverlay.remove()
            })
        ])
    ]);

    document.body.appendChild(modalOverlay);
}

// ================= МОДАЛЬНОЕ ОКНО: МЕНЕДЖЕР СОХРАНЕНИЙ (3 СЛОТА + JSON + СБРОС) =================

function openSaveManagerModal() {
    const modalOverlay = el("div", { className: "modal-overlay" });

    function rebuildModalContent() {
        modalOverlay.replaceChildren();
        const scrollBox = el("div", { className: "modal-scroll" });

        // Слоты 1, 2, 3
        ["slot1", "slot2", "slot3"].forEach((slotKey, i) => {
            const summary = game.getSlotSummary(slotKey);
            const slotCard = el("div", { className: "panel" }, [
                el("b", { text: `Слот #${i + 1}` }),
                el("div", {
                    style: { fontSize: "12px", color: summary ? "#81c784" : "#777", margin: "4px 0" },
                    text: summary || "Пустой слот"
                }),
                el("div", { className: "flex-row" }, [
                    game.player ? el("button", {
                        style: { padding: "6px", fontSize: "12px", background: "#264653" },
                        text: "Сохранить сюда",
                        onClick: () => {
                            game.saveGame(slotKey);
                            rebuildModalContent();
                        }
                    }) : null,
                    summary ? el("button", {
                        style: { padding: "6px", fontSize: "12px" },
                        text: "Загрузить",
                        onClick: () => {
                            if (game.loadGame(slotKey)) {
                                modalOverlay.remove();
                                render();
                            }
                        }
                    }) : null,
                    summary ? el("button", {
                        style: { padding: "6px", fontSize: "12px", background: "#4a2020" },
                        text: "Удалить",
                        onClick: () => {
                            game.deleteSlot(slotKey);
                            rebuildModalContent();
                        }
                    }) : null
                ])
            ]);
            scrollBox.appendChild(slotCard);
        });

        // Экспорт и Импорт JSON
        const currentJson = game.serializeState();
        const textarea = el("textarea", { id: "save-json-area" });
        textarea.value = currentJson;

        scrollBox.appendChild(el("div", { className: "panel" }, [
            el("b", { text: "📋 Экспорт / Импорт JSON" }),
            el("p", {
                style: { fontSize: "11px", margin: "4px 0" },
                text: "Скопируйте строку для бэкапа или вставьте свою:"
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
                    }
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
                    }
                })
            ])
        ]));

        // Полный сброс игры с нуля
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
            }
        }));

        modalOverlay.appendChild(el("div", { className: "modal-box" }, [
            el("h3", { text: "💾 Управление Сохранениями" }),
            scrollBox,
            el("button", {
                className: "btn-center",
                style: { marginTop: "8px" },
                text: "Закрыть окно",
                onClick: () => modalOverlay.remove()
            })
        ]));
    }

    rebuildModalContent();
    document.body.appendChild(modalOverlay);
}

document.addEventListener("DOMContentLoaded", () => {
    render();
});