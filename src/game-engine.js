// ============================================================================
// GAME-ENGINE.JS — Движок игры, пошаговые задержки боя, трофеи и слоты сейвов
// ============================================================================

class Game {
    constructor() {
        this.defaultMeta = {
            souls: 0, hp: 0, atk: 0, def: 0, en: 0, gold: 0, potions: 0, unlockedClasses: ["wanderer"],
        };
        this.meta = JSON.parse(JSON.stringify(this.defaultMeta));
        this.player = null;
        this.floor = 0;
        this.room = 1;
        this.state = "MENU"; // MENU, META_SHOP, CLASS_SELECT, MAP, BATTLE, EVENT, SHOP, CAMPFIRE, LEVELUP, GAMEOVER, VICTORY

        this.enemies = [];
        this.selectedTargetIndex = 0;
        this.battleTurn = 1;
        this.battleLog = [];
        this.isProcessingTurn = false; // Блокировка кнопок на время анимации ходов врагов
        this.battleFinished = false;   // Фаза просмотра трофеев в конце боя
        this.battleRewards = { xp: 0, gold: 0, items: [] };

        this.selectedPerkChoices = [];
        this.mapRooms = [];
        this.currentEventId = null;
        this.shopOffers = [];
        this.rerollCost = 5;
        this.lastEarnedSouls = 0;
        this.pendingEquipment = null;
        this.eventRewards = null;
    }

    init() {
        this.loadMeta();
    }

    // ================= СИСТЕМА СОХРАНЕНИЙ И СЛОТОВ =================

    loadMeta() {
        const saved = localStorage.getItem("roguelite_meta_v4");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.meta = Object.assign(JSON.parse(JSON.stringify(this.defaultMeta)), parsed);
            } catch (e) {
                console.error(e);
            }
        }
    }

    saveMeta() {
        localStorage.setItem("roguelite_meta_v4", JSON.stringify(this.meta));
    }

    serializeState() {
        return JSON.stringify({
            timestamp: Date.now(),
            meta: this.meta,
            player: this.player,
            floor: this.floor,
            room: this.room,
            state: this.state,
            enemies: this.enemies,
            selectedTargetIndex: this.selectedTargetIndex,
            battleTurn: this.battleTurn,
            battleFinished: this.battleFinished,
            battleRewards: this.battleRewards,
            mapRooms: this.mapRooms,
            currentEventId: this.currentEventId,
            shopOffers: this.shopOffers,
            rerollCost: this.rerollCost,
            selectedPerkChoices: this.selectedPerkChoices,
            battleLog: this.battleLog,
            pendingEquipment: this.pendingEquipment,
            eventRewards: this.eventRewards,
        });
    }

    saveGame(slotKey = "autosave") {
        if (!this.player) return this.serializeState();
        const json = this.serializeState();
        localStorage.setItem(`roguelite_slot_${slotKey}`, json);
        return json;
    }

    loadGame(slotKeyOrJson = "autosave") {
        try {
            let raw = slotKeyOrJson;
            if (!slotKeyOrJson.trim().startsWith("{")) {
                raw = localStorage.getItem(`roguelite_slot_${slotKeyOrJson}`);
            }
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !data.player) return false;

            this.meta = Object.assign(JSON.parse(JSON.stringify(this.defaultMeta)), data.meta || {});
            this.player = Object.assign(new Player(data.player.classId || "wanderer"), data.player);
            if (!this.player.inventory.artifacts) this.player.inventory.artifacts = [];
            if (!this.player.cooldowns) {
                this.player.cooldowns = { defend: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
            }

            this.floor = data.floor || 0;
            this.room = data.room || 1;
            this.state = data.state || "MAP";
            this.enemies = data.enemies || [];
            this.selectedTargetIndex = data.selectedTargetIndex || 0;
            this.battleTurn = data.battleTurn || 1;
            this.battleFinished = Boolean(data.battleFinished);
            this.battleRewards = data.battleRewards || { xp: 0, gold: 0, items: [] };
            this.isProcessingTurn = false;
            this.mapRooms = data.mapRooms || [];
            this.currentEventId = data.currentEventId || "altar";
            this.shopOffers = data.shopOffers || [];
            this.rerollCost = data.rerollCost || 5;
            this.selectedPerkChoices = data.selectedPerkChoices || [];
            this.battleLog = data.battleLog || [];
            this.pendingEquipment = data.pendingEquipment || null;
            this.eventRewards = data.eventRewards || null;
            this.saveMeta();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    getSlotSummary(slotKey) {
        const raw = localStorage.getItem(`roguelite_slot_${slotKey}`);
        if (!raw) return null;
        try {
            const d = JSON.parse(raw);
            if (!d || !d.player) return null;
            const dateStr = d.timestamp ? new Date(d.timestamp).toLocaleString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
            }) : "";
            return `${d.player.className} (Ур.${d.player.level}) | Этаж ${d.floor + 1}, Комн. ${d.room} | 💰${d.player.gold}G [${dateStr}]`;
        } catch (e) {
            return null;
        }
    }

    deleteSlot(slotKey) {
        localStorage.removeItem(`roguelite_slot_${slotKey}`);
    }

    hardResetAll() {
        localStorage.removeItem("roguelite_meta_v4");
        ["autosave", "slot1", "slot2", "slot3"].forEach(k => localStorage.removeItem(`roguelite_slot_${k}`));
        this.meta = JSON.parse(JSON.stringify(this.defaultMeta));
        this.player = null;
        this.state = "MENU";
    }

    // ================= МЕТА-ПРОКАЧКА И СТАРТ ЗАБЕГА =================

    buyMetaUpgrade(key) {
        const upg = GAME_DATA.metaUpgrades.find(u => u.key === key);
        if (!upg) return;
        const currentLvl = this.meta[key] || 0;
        if (currentLvl >= upg.max) return;
        const cost = upg.costs[currentLvl];
        if (this.meta.souls >= cost) {
            this.meta.souls -= cost;
            this.meta[key] = currentLvl + 1;
            this.saveMeta();
        }
    }

    unlockClass(classKey) {
        const cls = GAME_DATA.classes[classKey];
        if (!cls || this.meta.unlockedClasses.includes(classKey)) return;
        if (this.meta.souls >= cls.cost) {
            this.meta.souls -= cls.cost;
            this.meta.unlockedClasses.push(classKey);
            this.saveMeta();
        }
    }

    startRun(classKey) {
        this.player = new Player(classKey, this.meta);
        this.floor = 0;
        this.room = 1;
        this.pendingEquipment = null;
        this.eventRewards = null;
        this.generateFloorMap();
        this.state = "MAP";
        this.saveGame("autosave");
    }

    generateFloorMap() {
        this.mapRooms = [];
        if (this.player) this.player.secondWindAvailable = true;
        for (let i = 1; i <= 10; i++) {
            let type = "battle";
            if (i === 1) type = "battle";
            else if (i === 5) type = "elite";
            else if (i === 9) type = "shop";
            else if (i === 10) type = "boss";
            else {
                const rand = RNG.range(1, 100);
                if (rand <= 38) type = "battle";
                else if (rand <= 54) type = "elite";
                else if (rand <= 72) type = "event";
                else if (rand <= 86) type = "shop";
                else type = "campfire";
            }
            this.mapRooms.push({ id: i, type, completed: i < this.room });
        }
    }

    enterRoom(roomId) {
        const roomObj = this.mapRooms.find(r => r.id === roomId);
        if (!roomObj || roomObj.completed || roomObj.id !== this.room) return;

        if (roomObj.type === "battle") this.setupBattle("normal");
        else if (roomObj.type === "elite") this.setupBattle("elite");
        else if (roomObj.type === "boss") this.setupBattle("boss");
        else if (roomObj.type === "campfire") this.state = "CAMPFIRE";
        else if (roomObj.type === "event") {
            this.currentEventId = RNG.choice(GAME_DATA.events).id;
            this.state = "EVENT";
        } else if (roomObj.type === "shop") {
            this.rerollCost = 5;
            this.setupShop();
            this.state = "SHOP";
        }
        this.saveGame("autosave");
    }

    // ================= ГЕНЕРАЦИЯ ВРАГОВ И МАСШТАБИРОВАНИЕ СЛОЖНОСТИ =================

    createEnemyInstance(enemyKey, applyMutation = false) {
        const template = GAME_DATA.enemies[enemyKey];
        const e = JSON.parse(JSON.stringify(template));

        // Прогрессивное усиление врагов от глубины комнаты и этажа
        const depthMult = 1 + (this.floor * 0.22) + (this.room * 0.05);
        const atkDepthBonus = Math.floor(this.floor * 1.2 + this.room / 4);

        e.hp = Math.round(e.hp * depthMult);
        e.currentHp = e.hp;
        e.shield = e.shield || 0;
        e.spikes = e.spikes || 0;
        e.poison = 0;
        e.bleed = 0;
        e.regen = 0;
        e.atkBonus = atkDepthBonus;
        e.poisonOnHit = 0;
        e.bleedOnHit = 0;
        e.patternIndex = 0;

        if (applyMutation && !e.isBoss) {
            const mut = RNG.choice(GAME_DATA.mutations);
            e.name = `${mut.prefix} ${e.name}`;
            e.hp += Math.round((mut.hpBonus || 0) * depthMult);
            e.currentHp = e.hp;
            e.def += mut.defBonus || 0;
            e.atkBonus += mut.atkBonus || 0;
            e.xp += mut.xpBonus || 2;
            if (mut.spikes) e.spikes += mut.spikes;
            if (mut.regen) e.regen += mut.regen;
            if (mut.poisonOnHit) e.poisonOnHit += mut.poisonOnHit;
            if (mut.bleedOnHit) e.bleedOnHit += mut.bleedOnHit;
        }
        return e;
    }

    setupBattle(mode = "normal") {
        this.enemies = [];
        this.isProcessingTurn = false;
        this.battleFinished = false;
        this.battleRewards = { xp: 0, gold: 0, items: [] };

        const floorData = GAME_DATA.floors[this.floor];

        if (mode === "boss") {
            this.enemies.push(this.createEnemyInstance(floorData.boss));
            this.battleLog = [`👑 БИТВА С БОССОМ ЭТАЖА!`];
        } else if (mode === "elite") {
            const eliteKey = RNG.choice(floorData.elite);
            this.enemies.push(this.createEnemyInstance(eliteKey, this.floor >= 2));
            this.battleLog = [`💀 Встречен Элитный противник!`];
        } else if (mode === "mimic") {
            this.enemies.push(this.createEnemyInstance("mimic", this.floor >= 1));
            this.battleLog = [`📦 Сундук оказался Алчным Мимиком!`];
        } else {
            let budget = Math.min(7, 2 + Math.floor(this.room / 3) + this.floor);
            let attempts = 0;
            while (budget > 0 && this.enemies.length < 3 && attempts < 18) {
                attempts++;
                const enemyKey = RNG.choice(floorData.enemies);
                const template = GAME_DATA.enemies[enemyKey];
                if (template.weight <= budget) {
                    const mutate = (budget - template.weight >= 1 && (this.floor >= 1 || this.room >= 6) && RNG.chance(40));
                    this.enemies.push(this.createEnemyInstance(enemyKey, mutate));
                    budget -= (template.weight + (mutate ? 1 : 0));
                }
            }
            if (this.enemies.length === 0) {
                this.enemies.push(this.createEnemyInstance(floorData.enemies[0]));
            }
            this.battleLog = [`⚔️ Бой начался! Комната #${this.room}.`];
        }

        this.selectedTargetIndex = 0;
        this.battleTurn = 1;
        this.player.en = this.player.getTotalMaxEn();
        if (this.player.hasArtifact("art2")) {
            this.player.en += 2;
        }

        this.player.shield = 0;
        if (this.player.perks.includes("p6")) this.player.addShield(6);
        if (this.player.classId === "engineer") this.player.addShield(5);
        if (this.player.inventory.armor && this.player.inventory.armor.startShield) {
            this.player.addShield(this.player.inventory.armor.startShield);
        }
        if (this.player.hasArtifact("art6")) {
            this.player.addShield(6);
            this.enemies.forEach(en => { en.poison += 1; });
        }
        if (this.player.perks.includes("p27")) {
            this.enemies.forEach(en => { en.poison += 2; });
        }

        this.player.tempSpikes = 0;
        this.player.poison = 0;
        this.player.bleed = 0;
        this.player.concentrateBonus = 0;
        this.player.cooldowns = { defend: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
        this.player.concentrateUsesLeft = 2;

        this.state = "BATTLE";
    }

    ensureValidTarget() {
        if (this.enemies[this.selectedTargetIndex] && this.enemies[this.selectedTargetIndex].currentHp > 0) {
            return this.selectedTargetIndex;
        }
        const firstAlive = this.enemies.findIndex(e => e.currentHp > 0);
        this.selectedTargetIndex = firstAlive !== -1 ? firstAlive : 0;
        return this.selectedTargetIndex;
    }

    canAffordEn(cost) {
        if (this.player.en >= cost) return true;
        if (this.player.classId === "reaper" && this.player.hp > cost * 3) return true;
        return false;
    }

    canUseSkill(skillName, enCost = 0) {
        if (this.isProcessingTurn || this.battleFinished) return false;
        if ((this.player.cooldowns[skillName] || 0) > 0) return false;
        if (skillName === "concentrate" && this.player.concentrateUsesLeft <= 0) return false;
        return this.canAffordEn(enCost);
    }

    spendEn(cost) {
        if (this.player.en >= cost) {
            this.player.en -= cost;
            return true;
        }
        if (this.player.classId === "reaper" && this.player.hp > cost * 3) {
            this.player.hp -= cost * 3;
            this.battleLog.unshift(`🩸 Жнец платит кровью (-${cost * 3} HP)!`);
            return true;
        }
        return false;
    }

    tickCooldowns() {
        for (let k in this.player.cooldowns) {
            if (this.player.cooldowns[k] > 0) {
                this.player.cooldowns[k]--;
            }
        }
    }

    // Использование зелий (в бою или прямо из меню персонажа на карте)
    usePotion(potIndex) {
        if (this.isProcessingTurn) return;
        const pot = this.player.inventory.potions[potIndex];
        if (!pot) return;
        if (this.state !== "BATTLE" && !pot.canUseOnMap) return;

        const alchBonus = this.player.perks.includes("p21") ? 6 : 0;

        if (pot.id === "pot1") {
            this.player.heal(12 + alchBonus);
            this.player.poison = 0;
            this.player.bleed = 0;
            if (this.state === "BATTLE") this.battleLog.unshift(`🧪 Зелье Исцеления (+${12 + alchBonus} HP, очищение).`);
        } else if (pot.id === "pot2") {
            this.player.en += 3;
            this.player.cooldowns = { defend: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
            this.battleLog.unshift(`🧪 Эликсир Энергии (+3 EN, сброс перезарядок!).`);
        } else if (pot.id === "pot3") {
            this.battleLog.unshift(`🧪 Взрывная Колба (11 чистого урона всем)!`);
            this.enemies.forEach(en => {
                if (en.currentHp > 0) this.dealDamageToEnemy(en, 11, true);
            });
        } else if (pot.id === "pot4") {
            this.player.addShield(10);
            this.battleLog.unshift(`🧪 Каменный Отвар (+10 Щита).`);
        } else if (pot.id === "pot5") {
            this.enemies.forEach(en => {
                if (en.currentHp > 0) {
                    en.poison += 4;
                    en.bleed += 2;
                }
            });
            this.battleLog.unshift(`🧪 Ядовитый Флакон (+4 Яда и +2 Кровотока всем)!`);
        } else if (pot.id === "pot6") {
            this.player.heal(8 + alchBonus);
            this.player.concentrateBonus += 4;
            if (this.state === "BATTLE") this.battleLog.unshift(`🧪 Кровь Дракона (+${8 + alchBonus} HP, +4 к след. атаке).`);
        }

        this.player.inventory.potions.splice(potIndex, 1);
        if (this.state === "BATTLE") {
            this.ensureValidTarget();
            this.checkBattleEnd();
        }
        this.saveGame("autosave");
    }

    discardPotion(potIndex) {
        this.player.inventory.potions.splice(potIndex, 1);
        this.saveGame("autosave");
    }

    // ================= БОЕВАЯ СИСТЕМА С ПОШАГОВОЙ ЗАДЕРЖКОЙ =================

    playerAction(actionType, onStepRender) {
        if (this.state !== "BATTLE" || this.isProcessingTurn || this.battleFinished) return;
        this.ensureValidTarget();
        const target = this.enemies[this.selectedTargetIndex];

        if (actionType === "defend" && !this.canUseSkill("defend", 0)) return;
        if (actionType === "heavy" && !this.canAffordEn(1)) return;
        if (actionType === "pierce" && !this.canUseSkill("pierce", 2)) return;
        if (actionType === "whirlwind" && !this.canUseSkill("whirlwind", 2)) return;
        if (actionType === "concentrate" && !this.canUseSkill("concentrate", 0)) return;

        this.tickCooldowns();
        this.player.tempSpikes = 0;

        const forceAssassinCrit = (this.player.classId === "assassin" && this.battleTurn === 1);
        const ignoreAllDef = forceAssassinCrit;
        let atkVal = this.player.getTotalAtk();
        if (this.battleTurn === 1 && this.player.perks.includes("p13")) atkVal += 5;

        const cdReduction = this.player.perks.includes("p24") ? 1 : 0;

        if (actionType === "fast") {
            if (!target || target.currentHp <= 0) return;
            const isCrit = this.player.rollCrit(10, forceAssassinCrit);
            let dmg = atkVal + RNG.range(1, 4);
            if (isCrit) {
                dmg = Math.round(dmg * 1.65);
                this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 1);
                if (this.player.perks.includes("p11")) this.player.heal(3);
            }
            this.applyWeaponEffects(target);
            if (this.player.perks.includes("p7")) target.poison += 1;
            const dealt = this.dealDamageToEnemy(target, dmg, ignoreAllDef);
            this.checkEnemySpikes(target);
            this.battleLog.unshift(`⚔️ Быстрый удар по ${target.name}${isCrit ? " (КРИТ!)" : ""}: ${dealt} урона.`);
            this.player.concentrateBonus = 0;

        } else if (actionType === "defend") {
            let shieldGain = 4 + this.player.getTotalDef() + (this.player.classId === "crusader" ? 4 : 0);
            if (this.player.classId === "crusader") this.player.tempSpikes += 3;
            if (this.player.perks.includes("p14")) this.player.tempSpikes += 3;
            this.player.addShield(shieldGain);
            this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 1);
            this.player.bleed = Math.max(0, this.player.bleed - 1);
            this.player.cooldowns.defend = 2;
            this.battleLog.unshift(`🛡️ Глухая защита (+${shieldGain} Щит, +1 EN).`);

        } else if (actionType === "heavy") {
            if (!target || target.currentHp <= 0) return;
            if (!this.spendEn(1)) return;
            if (this.player.perks.includes("p15")) target.shield = 0;
            const isCrit = this.player.rollCrit(0, forceAssassinCrit);
            let dmg = Math.round(atkVal * 1.4) + RNG.range(2, 6);
            if (isCrit) {
                dmg = Math.round(dmg * 1.65);
                if (this.player.perks.includes("p11")) this.player.heal(3);
            }
            this.applyWeaponEffects(target);
            if (this.player.perks.includes("p8")) target.bleed += 2;
            const dealt = this.dealDamageToEnemy(target, dmg, ignoreAllDef);
            this.checkEnemySpikes(target);
            this.battleLog.unshift(`💥 Тяжёлый выпад по ${target.name}${isCrit ? " (КРИТ!)" : ""}: ${dealt} урона.`);
            this.player.concentrateBonus = 0;

        } else if (actionType === "pierce") {
            if (!target || target.currentHp <= 0) return;
            if (!this.spendEn(2)) return;
            if (this.player.perks.includes("p15")) target.shield = 0;
            let dmg = (atkVal * 2) + 4 + (this.player.perks.includes("p1") ? 4 : 0);
            this.applyWeaponEffects(target);
            const dealt = this.dealDamageToEnemy(target, dmg, true);
            this.checkEnemySpikes(target);
            this.player.cooldowns.pierce = Math.max(1, 2 - cdReduction);
            this.battleLog.unshift(`🗡️ Пробивающий удар по ${target.name}: ${dealt} чистого урона!`);
            this.player.concentrateBonus = 0;

        } else if (actionType === "whirlwind") {
            if (!this.spendEn(2)) return;
            const isArcanist = this.player.classId === "arcanist";
            let dmg = atkVal + (isArcanist ? RNG.range(4, 8) : RNG.range(2, 5));
            this.player.cooldowns.whirlwind = Math.max(1, 2 - cdReduction);
            this.battleLog.unshift(`🌪️ ${isArcanist ? "Огненный залп" : "Круговой вихрь"} по всем (${dmg} базы)!`);
            this.enemies.forEach(en => {
                if (en.currentHp > 0) {
                    this.applyWeaponEffects(en);
                    if (this.player.perks.includes("p7")) en.poison += 1;
                    this.dealDamageToEnemy(en, dmg, isArcanist || ignoreAllDef);
                }
            });
            this.player.concentrateBonus = 0;

        } else if (actionType === "concentrate") {
            this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 2);
            let healAmt = this.player.perks.includes("p9") ? 7 : 3;
            this.player.heal(healAmt);
            if (this.player.hasArtifact("art10")) {
                this.player.addShield(4);
            }
            this.player.concentrateBonus = 3;
            this.player.concentrateUsesLeft--;
            this.player.cooldowns.concentrate = 3;
            this.battleLog.unshift(`🧘 Концентрация (+2 EN, +${healAmt} HP, +3 ATK к след. удару).`);
        }

        if (["fast", "heavy", "pierce", "whirlwind"].includes(actionType) && this.player.bleed > 0) {
            this.player.hp = Math.max(0, this.player.hp - this.player.bleed);
            this.battleLog.unshift(`🩸 Кровотечение отнимает у вас ${this.player.bleed} HP!`);
        }

        this.ensureValidTarget();
        if (this.checkBattleEnd()) {
            if (onStepRender) onStepRender();
            this.saveGame("autosave");
            return;
        }

        // Запускаем пошаговую очередь ходов врагов с задержкой 450мс
        this.isProcessingTurn = true;
        if (onStepRender) onStepRender();
        this.runEnemyTurnSequence(onStepRender);
    }

    runEnemyTurnSequence(onStepRender) {
        const steps = [];

        // Шаг 1: Яд на игроке и всплеск Ярости Бездны
        steps.push(() => {
            if (this.player.poison > 0) {
                this.player.takeDamage(this.player.poison, true);
                this.battleLog.unshift(`☠️ Яд наносит вам ${this.player.poison} урона.`);
                this.player.poison--;
            }
            const enrageBonus = this.battleTurn >= 10 ? (this.battleTurn - 9) * 2 : 0;
            if (enrageBonus > 0) {
                this.battleLog.unshift(`🔥 Ярость Бездны (Раунд ${this.battleTurn}): враги получают +${enrageBonus} к урону!`);
            }
        });

        // Шаги для каждого живого врага по отдельности
        this.enemies.forEach((en) => {
            if (en.currentHp <= 0) return;
            steps.push(() => {
                if (en.currentHp <= 0 || this.player.hp <= 0) return;
                this.executeSingleEnemyTurn(en);
            });
        });

        // Финальный шаг раунда (турель, реген артефактов, проверка смерти)
        steps.push(() => {
            if (this.player.hp <= 0) return;

            if (this.player.classId === "engineer") {
                const aliveEnemies = this.enemies.filter(e => e.currentHp > 0);
                if (aliveEnemies.length > 0) {
                    const rndEn = RNG.choice(aliveEnemies);
                    this.dealDamageToEnemy(rndEn, 3, true);
                    this.battleLog.unshift(`⚙️ Авто-турель стреляет по ${rndEn.name} (3 чистого урона).`);
                }
            }

            if (this.player.hasArtifact("art7")) this.player.heal(2);
            if (this.player.hasArtifact("art8")) {
                this.enemies.forEach(en => {
                    if (en.currentHp > 0) this.dealDamageToEnemy(en, 3, true);
                });
            }

            if (this.player.classId === "arcanist") {
                this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 1);
            }
            this.battleTurn++;
            if (this.player.perks.includes("p18") && this.battleTurn % 3 === 0) {
                this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 2);
                this.battleLog.unshift(`⚡ Боевой транс даёт +2 EN!`);
            }
        });

        let idx = 0;
        const nextStep = () => {
            if (idx < steps.length) {
                steps[idx]();
                idx++;
                this.ensureValidTarget();

                if (this.player.hp <= 0) {
                    this.isProcessingTurn = false;
                    this.calculateSouls();
                    this.state = "GAMEOVER";
                    if (onStepRender) onStepRender();
                    return;
                }
                if (this.checkBattleEnd()) {
                    this.isProcessingTurn = false;
                    if (onStepRender) onStepRender();
                    this.saveGame("autosave");
                    return;
                }
                if (onStepRender) onStepRender();
                setTimeout(nextStep, 420);
            } else {
                this.isProcessingTurn = false;
                if (onStepRender) onStepRender();
                this.saveGame("autosave");
            }
        };

        setTimeout(nextStep, 380);
    }

    executeSingleEnemyTurn(en) {
        const enrageBonus = this.battleTurn >= 10 ? (this.battleTurn - 9) * 2 : 0;

        if (en.poison > 0) {
            const pDmg = en.poison + (this.player.perks.includes("p16") ? 2 : 0);
            en.currentHp = Math.max(0, en.currentHp - pDmg);
            this.battleLog.unshift(`☠️ ${en.name} теряет ${pDmg} HP от яда.`);
            en.poison--;
            if (en.currentHp <= 0) {
                this.onEnemyKilled(en);
                return;
            }
        }

        if (en.regen > 0) {
            en.currentHp = Math.min(en.hp, en.currentHp + en.regen);
        }

        const patList = en.pattern || [{ type: "attack", val: 4, text: "Атака" }];
        const patIndex = (en.patternIndex || 0) % patList.length;
        const pat = patList[patIndex];
        en.patternIndex = (en.patternIndex || 0) + 1;

        if (en.bleed > 0 && pat.val > 0) {
            en.currentHp = Math.max(0, en.currentHp - en.bleed);
            this.battleLog.unshift(`🩸 ${en.name} истекает кровью (-${en.bleed} HP).`);
            if (en.currentHp <= 0) {
                this.onEnemyKilled(en);
                return;
            }
        }

        const baseVal = pat.val ? RNG.spread(pat.val + (en.atkBonus || 0) + enrageBonus, 0.15) : 0;

        if (pat.type === "attack") {
            const taken = this.player.takeDamage(baseVal);
            this.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> вам ${taken} урона.`);
        } else if (pat.type === "pierce") {
            const taken = this.player.takeDamage(baseVal, true);
            this.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> вам ${taken} чистого урона!`);
        } else if (pat.type === "attackPoison") {
            const taken = this.player.takeDamage(baseVal);
            this.player.poison += (pat.poison || 1);
            this.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> ${taken} урона и Яд!`);
        } else if (pat.type === "attackBleed") {
            const taken = this.player.takeDamage(baseVal);
            this.player.bleed += (pat.bleed || 1);
            this.battleLog.unshift(`👹 ${en.name}: ${pat.text} -> ${taken} урона и Кровоток!`);
        } else if (pat.type === "defendAttack") {
            en.shield += (pat.shield || 4);
            const taken = this.player.takeDamage(baseVal);
            this.battleLog.unshift(`👹 ${en.name}: +${pat.shield || 4} Щит и удар на ${taken} урона.`);
        } else if (pat.type === "vampire") {
            const taken = this.player.takeDamage(baseVal);
            en.currentHp = Math.min(en.hp, en.currentHp + taken);
            this.battleLog.unshift(`👹 ${en.name}: укус на ${taken} урона и лечение!`);
        } else if (pat.type === "drainEn") {
            const taken = this.player.takeDamage(baseVal);
            this.player.en = Math.max(0, this.player.en - 1);
            this.battleLog.unshift(`👹 ${en.name}: ${taken} урона и -1 Энергия!`);
        } else if (pat.type === "heal" || pat.type === "shieldHeal") {
            if (pat.val) en.currentHp = Math.min(en.hp, en.currentHp + pat.val);
            if (pat.shield) en.shield += pat.shield;
            this.battleLog.unshift(`👹 ${en.name}: ${pat.text}.`);
        } else if (pat.type === "charge") {
            this.battleLog.unshift(`⚠️ ${en.name}: ${pat.text}`);
        }

        if (pat.val > 0) {
            if (en.poisonOnHit) this.player.poison += en.poisonOnHit;
            if (en.bleedOnHit) this.player.bleed += en.bleedOnHit;
        }

        if (pat.val > 0 && this.player.getTotalSpikes() > 0 && en.currentHp > 0) {
            const spk = this.player.getTotalSpikes();
            en.currentHp = Math.max(0, en.currentHp - spk);
            this.battleLog.unshift(`🌵 Ваши Шипы ранят ${en.name} на ${spk} HP!`);
            if (en.currentHp <= 0) this.onEnemyKilled(en);
        }
    }

    checkEnemySpikes(enemy) {
        if (enemy && enemy.spikes > 0) {
            this.player.takeDamage(enemy.spikes, true);
            this.battleLog.unshift(`🌵 Шипы врага (${enemy.name}) ранят вас на ${enemy.spikes} HP!`);
        }
    }

    applyWeaponEffects(enemy) {
        const w = this.player.inventory.weapon;
        if (!w) return;
        if (w.poison) enemy.poison += w.poison;
        if (w.bleed) enemy.bleed += w.bleed;
    }

    dealDamageToEnemy(enemy, amount, ignoreDef = false) {
        if (this.player.perks.includes("p3") && enemy.currentHp <= enemy.hp / 2) {
            amount += 4;
        }
        let enemyDef = ignoreDef ? 0 : enemy.def;
        if (!ignoreDef && this.player.hasArtifact("art3")) {
            enemyDef = Math.max(0, enemyDef - 1);
        }

        let actual = ignoreDef ? amount : Math.max(1, amount - enemyDef);
        if (enemy.shield > 0) {
            if (enemy.shield >= actual) {
                enemy.shield -= actual;
                actual = 0;
            } else {
                actual -= enemy.shield;
                enemy.shield = 0;
            }
        }
        enemy.currentHp = Math.max(0, enemy.currentHp - actual);
        if (enemy.currentHp <= 0) {
            this.onEnemyKilled(enemy);
        }
        return actual;
    }

    onEnemyKilled(enemy) {
        let xpGain = enemy.xp;
        if (this.player.hasArtifact("art12")) xpGain = Math.ceil(xpGain * 1.25);
        let goldGain = RNG.range(2, 5) + this.floor * 2;
        if ((enemy.isElite || enemy.isBoss) && this.player.perks.includes("p25")) {
            xpGain += 5;
            goldGain += 8;
        }

        this.player.xp += xpGain;
        this.player.totalRunXp += xpGain;
        this.player.gold += goldGain;
        this.battleRewards.xp += xpGain;
        this.battleRewards.gold += goldGain;

        this.battleLog.unshift(`💀 ${enemy.name} повержен! (+${xpGain} XP, +${goldGain}G)`);

        if (this.player.classId === "reaper") this.player.heal(3);
        if (this.player.hasArtifact("art1")) this.player.heal(2);
        if (this.player.inventory.weapon && this.player.inventory.weapon.vamp) {
            this.player.heal(this.player.inventory.weapon.vamp);
        }
        if (this.player.perks.includes("p22")) {
            this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 1);
        }
        if (this.player.perks.includes("p17") && (enemy.poison > 0 || enemy.bleed > 0)) {
            this.player.heal(3);
            this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 1);
        }
    }

    // Когда все враги убиты — открываем панель трофеев прямо на экране боя
    checkBattleEnd() {
        if (this.battleFinished) return true;
        const allDead = this.enemies.every(en => en.currentHp <= 0);
        if (!allDead) return false;

        this.battleFinished = true;
        this.isProcessingTurn = false;

        if (this.player.perks.includes("p10")) {
            this.player.heal(4);
            this.battleLog.unshift(`💚 Кровь тролля восстанавливает +4 HP.`);
        }
        if (this.player.hasArtifact("art4")) {
            this.player.gold += 3;
            this.player.xp += 2;
            this.battleRewards.gold += 3;
            this.battleRewards.xp += 2;
        }
        if (this.player.hasArtifact("art9")) {
            this.player.heal(2);
        }

        if (RNG.chance(45) && this.player.inventory.potions.length < this.player.potionSlots) {
            const droppedPot = { ...RNG.choice(GAME_DATA.items.potions) };
            this.player.inventory.potions.push(droppedPot);
            this.battleRewards.items.push(`Зелье: ${droppedPot.name}`);
        }

        const currentRoomObj = this.mapRooms.find(r => r.id === this.room);
        const hadEliteOrBoss = this.enemies.some(e => e.isElite || e.isBoss) || (currentRoomObj && currentRoomObj.type === "elite");
        if (hadEliteOrBoss) {
            const lootName = this.grantRandomEquipment();
            if (lootName) this.battleRewards.items.push(lootName);
        }

        this.battleLog.unshift(`🏆 ПОБЕДА! Соберите трофеи и нажмите «Продолжить».`);
        return true;
    }

    proceedAfterBattle() {
        if (!this.battleFinished || this.pendingEquipment) return;
        this.checkLevelUpOrFinishRoom();
    }

    checkLevelUpOrFinishRoom() {
        const req = this.player.getRequiredXp();
        if (this.player.xp >= req) {
            this.generatePerkChoices();
            if (this.selectedPerkChoices.length > 0) {
                this.state = "LEVELUP";
                this.saveGame("autosave");
                return;
            }
        }
        this.finishRoom();
    }

    grantRandomEquipment(origin = "battle") {
        const tier = this.floor >= 2 ? 2 : 1;
        const roll = RNG.range(1, 3);
        if (roll === 1) {
            const pool = GAME_DATA.items.weapons.filter(w => w.tier === tier);
            const item = RNG.choice(pool);
            this.pendingEquipment = {
                type: "weapon",
                item: { ...item },
                origin: origin,
            };
            return `Оружие: ${item.name} (${item.desc})`;
        } else if (roll === 2) {
            const pool = GAME_DATA.items.armors.filter(a => a.tier === tier);
            const item = RNG.choice(pool);
            this.pendingEquipment = {
                type: "armor",
                item: { ...item },
                origin: origin,
            };
            return `Броня: ${item.name} (${item.desc})`;
        } else {
            const unowned = GAME_DATA.items.artifacts.filter(a => !this.player.hasArtifact(a.id));
            if (unowned.length > 0) {
                const art = RNG.choice(unowned);
                this.player.addArtifact(art);
                return `Артефакт: ${art.name}`;
            } else {
                this.player.gold += 15;
                return `Сундук золота (+15G)`;
            }
        }
    }

    resolveEquipChoice() {
        if (!this.pendingEquipment) return null;
        const { type, item } = this.pendingEquipment;
        let refund = 0;
        if (type === "weapon") {
            refund = this.player.equipWeapon(item);
        } else if (type === "armor") {
            refund = this.player.equipArmor(item);
        }
        const result = { name: item.name, refund: refund };
        this.pendingEquipment = null;
        this.saveGame("autosave");
        return result;
    }

    resolveSalvageChoice() {
        if (!this.pendingEquipment) return null;
        const { item } = this.pendingEquipment;
        const goldGain = (item && item.cost) ? Math.max(1, Math.floor(item.cost * 0.25)) : 0;
        this.player.gold += goldGain;
        const result = { name: item.name, goldGain: goldGain };
        this.pendingEquipment = null;
        this.saveGame("autosave");
        return result;
    }

    finishRoom() {
        const roomObj = this.mapRooms.find(r => r.id === this.room);
        if (roomObj) roomObj.completed = true;

        if (this.room >= 10) {
            this.player.heal(this.player.getTotalMaxHp());
            if (this.floor < 3) {
                this.floor++;
                this.room = 1;
                this.generateFloorMap();
                this.state = "MAP";
            } else {
                this.calculateSouls();
                this.state = "VICTORY";
            }
        } else {
            this.room++;
            this.state = "MAP";
        }
        this.saveGame("autosave");
    }

    generatePerkChoices() {
        const available = GAME_DATA.perks.filter(p => !this.player.perks.includes(p.id));
        this.selectedPerkChoices = RNG.shuffle(available).slice(0, 3);
    }

    choosePerk(perkId) {
        const req = this.player.getRequiredXp();
        this.player.xp = Math.max(0, this.player.xp - req);
        this.player.level++;
        this.player.perks.push(perkId);

        this.player.baseMaxHp += 3;
        this.player.heal(6);
        if (perkId === "p23") {
            this.player.heal(10);
        }
        // Если накопленного опыта хватает еще на один уровень — открываем следующий выбор перка!
        this.checkLevelUpOrFinishRoom();
    }

    resolveEventOption(optionId) {
        if (optionId === "altar_hp") {
            this.player.hp = Math.max(1, this.player.hp - 6);
            this.player.baseAtk += 1;
        } else if (optionId === "altar_gold") {
            if (this.player.gold >= 12) {
                this.player.gold -= 12;
                const unowned = GAME_DATA.items.artifacts.filter(a => !this.player.hasArtifact(a.id));
                if (unowned.length > 0) this.player.addArtifact(RNG.choice(unowned));
            }
        } else if (optionId === "spring_heal") {
            this.player.heal(this.player.getTotalMaxHp());
        } else if (optionId === "spring_max") {
            this.player.baseMaxHp += 5;
            this.player.heal(5);
        } else if (optionId === "smith_atk") {
            this.player.weaponUpgradeLvl += 1;
        } else if (optionId === "smith_def") {
            this.player.armorUpgradeLvl += 1;
            this.player.heal(3);
        } else if (optionId === "smith_xp") {
            this.player.xp += 10;
            this.player.totalRunXp += 10;
        } else if (optionId === "stash_take") {
            this.player.gold += 10;
            this.player.heal(5);
            if (this.player.inventory.potions.length < this.player.potionSlots) {
                this.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
            }
        } else if (optionId === "chest_open") {
            if (RNG.chance(50)) {
                this.setupBattle("mimic");
                this.saveGame("autosave");
                return;
            } else {
                this.player.gold += 15;
                const loot = this.grantRandomEquipment("event");
                this.eventRewards = {
                    gold: 15,
                    items: loot ? [loot] : [],
                };
                this.state = "EVENT_REWARDS";
                this.saveGame("autosave");
                return;
            }
        } else if (optionId === "lib_xp") {
            this.player.xp += 12;
            this.player.totalRunXp += 12;
        } else if (optionId === "lib_perk") {
            this.player.hp = Math.max(1, this.player.hp - 6);
            const available = GAME_DATA.perks.filter(p => !this.player.perks.includes(p.id));
            if (available.length > 0) this.player.perks.push(RNG.choice(available).id);
        } else if (optionId === "gamble_play") {
            if (this.player.gold >= 8) {
                this.player.gold -= 8;
                if (RNG.chance(50)) {
                    this.player.gold += 20;
                    if (this.player.inventory.potions.length < this.player.potionSlots) {
                        this.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
                    }
                }
            }
        } else if (optionId === "gamble_rob") {
            this.player.hp = Math.max(1, this.player.hp - 4);
            this.player.gold += 9;
        } else if (optionId === "lab_potions") {
            this.player.potionSlots += 1;
            for (let i = 0; i < 2; i++) {
                if (this.player.inventory.potions.length < this.player.potionSlots) {
                    this.player.inventory.potions.push({ ...RNG.choice(GAME_DATA.items.potions) });
                }
            }
        } else if (optionId === "lab_mutagen") {
            this.player.baseMaxHp += 7;
            this.player.hp = Math.max(1, this.player.hp - 3);
        } else if (optionId === "soul_sell_hp") {
            this.player.baseMaxHp = Math.max(6, this.player.baseMaxHp - 5);
            this.player.clampHp();
            this.player.gold += 18;
            const unowned = GAME_DATA.items.artifacts.filter(a => !this.player.hasArtifact(a.id));
            if (unowned.length > 0) this.player.addArtifact(RNG.choice(unowned));
        } else if (optionId === "soul_buy_souls") {
            if (this.player.gold >= 12) {
                this.player.gold -= 12;
                this.meta.souls += 10;
                this.saveMeta();
            }
        } else if (optionId === "arena_fight") {
            this.player.gold += 10;
            this.setupBattle("elite");
            this.saveGame("autosave");
            return;
        }

        this.checkLevelUpOrFinishRoom();
    }

    resolveCampfire(choice) {
        if (choice === "heal") {
            const mult = this.player.perks.includes("p28") ? 0.7 : 0.45;
            if (this.player.perks.includes("p28")) this.player.gold += 6;
            this.player.heal(Math.ceil(this.player.getTotalMaxHp() * mult));
        } else if (choice === "sharpen") {
            this.player.weaponUpgradeLvl += 1;
        } else if (choice === "meditate") {
            this.player.baseMaxHp += 4;
            this.player.heal(4);
        }
        this.finishRoom();
    }

    // ================= МАГАЗИН С БЕСКОНЕЧНЫМИ УЛУЧШЕНИЯМИ И АРТЕФАКТАМИ =================

    setupShop() {
        const wPool = GAME_DATA.items.weapons.filter(i => this.floor >= 1 || i.tier === 1);
        const aPool = GAME_DATA.items.armors.filter(i => this.floor >= 1 || i.tier === 1);
        const unownedArts = GAME_DATA.items.artifacts.filter(a => !this.player.hasArtifact(a.id));

        const w = RNG.choice(wPool);
        const a = RNG.choice(aPool);
        const pot1 = RNG.choice(GAME_DATA.items.potions);
        const pot2 = RNG.choice(GAME_DATA.items.potions);

        const forgeWeaponCost = 14 + this.player.weaponUpgradeLvl * 10;
        const forgeArmorCost = 14 + this.player.armorUpgradeLvl * 10;

        this.shopOffers = [{
            id: "heal_service", kind: "service_heal", name: "🩹 Аптечка хирурга (+12 HP)", cost: 5, bought: false
        }, {
            id: "forge_weapon",
            kind: "forge_w",
            name: `🔨 Заточка оружия (Ур. ${this.player.weaponUpgradeLvl + 1}: +1 ATK навсегда)`,
            cost: forgeWeaponCost,
            bought: false
        }, {
            id: "forge_armor",
            kind: "forge_a",
            name: `🛡️ Укрепление брони (Ур. ${this.player.armorUpgradeLvl + 1}: +3 HP и +DEF)`,
            cost: forgeArmorCost,
            bought: false
        }, {
            id: pot1.id,
            kind: "potion",
            item: pot1,
            name: `🧪 ${pot1.name} — ${pot1.desc}`,
            cost: pot1.cost,
            bought: false
        }, {
            id: pot2.id,
            kind: "potion",
            item: pot2,
            name: `🧪 ${pot2.name} — ${pot2.desc}`,
            cost: pot2.cost,
            bought: false
        }, {
            id: w.id,
            kind: "weapon",
            item: w,
            name: `⚔️ [${w.rarity}] ${w.name} (${w.desc})`,
            cost: w.cost,
            bought: false
        }, {
            id: a.id,
            kind: "armor",
            item: a,
            name: `🛡️ [${a.rarity}] ${a.name} (${a.desc})`,
            cost: a.cost,
            bought: false
        }];

        const shuffledArts = RNG.shuffle(unownedArts).slice(0, 2);
        shuffledArts.forEach(art => {
            this.shopOffers.push({
                id: art.id,
                kind: "artifact",
                item: art,
                name: `💍 [${art.rarity}] Артефакт: ${art.name} (${art.desc})`,
                cost: art.cost,
                bought: false
            });
        });
    }

    rerollShop() {
        if (this.player.gold < this.rerollCost) return;
        this.player.gold -= this.rerollCost;
        this.rerollCost += 4;
        this.setupShop();
        this.saveGame("autosave");
    }

    buyShopOffer(index) {
        const offer = this.shopOffers[index];
        if (!offer || offer.bought || this.player.gold < offer.cost) return;

        if (offer.kind === "potion" && this.player.inventory.potions.length >= this.player.potionSlots) {
            return;
        }

        this.player.gold -= offer.cost;
        offer.bought = true;

        if (offer.kind === "service_heal") {
            this.player.heal(12);
        } else if (offer.kind === "forge_w") {
            this.player.weaponUpgradeLvl += 1;
        } else if (offer.kind === "forge_a") {
            this.player.armorUpgradeLvl += 1;
            this.player.heal(3);
        } else if (offer.kind === "potion") {
            this.player.inventory.potions.push({ ...offer.item });
        } else if (offer.kind === "weapon") {
            this.player.equipWeapon(offer.item);
        } else if (offer.kind === "armor") {
            this.player.equipArmor(offer.item);
        } else if (offer.kind === "artifact") {
            this.player.addArtifact(offer.item);
        }
        this.saveGame("autosave");
    }

    calculateSouls() {
        const earned = Math.floor(this.player.totalRunXp * 0.8) + (this.floor * 12) + Math.floor(this.player.gold / 5);
        this.lastEarnedSouls = Math.max(1, earned);
        this.meta.souls += this.lastEarnedSouls;
        this.saveMeta();
        localStorage.removeItem("roguelite_slot_autosave");
    }
}

const game = new Game();
game.init();