import { RNG } from "../utils/rng.js";
import { GAME_DATA, ABYSS_START_FLOOR } from "../data/index.js";
import { playSound } from "../utils/audio.js";
import { DungeonGenerator } from "./dungeon-generator.js";
import { Player } from "./player.js";
import * as SaveSystem from "./systems/save.js";
import * as ShopSystem from "./systems/shop.js";
import * as EncounterSystem from "./systems/encounter.js";
import * as BattleSystem from "./systems/battle.js";
import * as ReplaySystem from "./systems/replay.js";

const SCOUT_DIRS = [
    { name: "up", dx: 0, dy: -1 },
    { name: "down", dx: 0, dy: 1 },
    { name: "left", dx: -1, dy: 0 },
    { name: "right", dx: 1, dy: 0 },
];

const SCOUT_ACTION_CONFIG = {
    battle: {
        label: "Провести диверсию",
        icon: "⚔️",
        successText: "Вы незаметно подкинули яд к привалу врагов (враги начнут бой в этой комнате с +2 Яда).",
        failText: "Враги заметили движение в проходе (в этой комнате враги начнут со +3 Щита).",
        isCombat: true,
        onSuccess: (game, room) => {
            if (room) room.poisoned = true;
        },
    },
    elite: {
        label: "Выследить слабость",
        icon: "💀",
        successText: "Вы разглядели брешь в защите противника (+5 к первой атаке в этой комнате).",
        failText: "Противник почуял слежку (в этой комнате враги начнут со +3 Щита).",
        isCombat: true,
        onSuccess: (game, room) => {
            if (room) room.weakened = true;
        },
    },
    boss: {
        label: "Изучить повадки босса",
        icon: "👑",
        successText: "Вы заметили уязвимый момент в движениях босса (+5 к первой атаке в этой комнате).",
        failText: "Владыка зала заметил вашу тень в проходе (в комнате босса враги начнут со +3 Щита).",
        isCombat: true,
        onSuccess: (game, room) => {
            if (room) room.weakened = true;
        },
    },
    corridor: {
        label: "Наметить короткий путь",
        icon: "🕯️",
        successText: "Вы заранее разглядели удобный обход и сэкономили силы (+1 EN).",
        failText: "Короткого пути нет — лишь зря потратили время.",
        isCombat: false,
        onSuccess: (game) => {
            game.player.en = Math.min(game.player.getTotalMaxEn(), game.player.en + 1);
        },
    },
    event: {
        label: "Прислушаться к происходящему",
        icon: "❓",
        successText: "Удалось подметить важные детали до входа в комнату (+7 XP).",
        failText: "Впереди тихо — ничего интересного.",
        isCombat: false,
        onSuccess: (game) => {
            game.player.xp += 7;
            game.player.totalRunXp += 7;
        },
    },
    shop: {
        label: "Осмотреть ящики у входа",
        icon: "⚖️",
        successText: "Среди придорожных ящиков нашлось несколько забытых монет (+6 Золота).",
        failText: "Вас прогнали охранники — вы не успели ничего найти.",
        isCombat: false,
        onSuccess: (game) => {
            game.player.gold += 6;
        },
    },
    campfire: {
        label: "Понаблюдать за огнём",
        icon: "🔥",
        successText: "Ровное пламя успокаивает дыхание и возвращает немного сил (+5 HP).",
        failText: "Огонь почти затух — перевести дух не удалось.",
        isCombat: false,
        onSuccess: (game) => {
            game.player.heal(5);
        },
    },
    fountain: {
        label: "Понаблюдать за блуждающими духами",
        icon: "⛲",
        successText: "Блуждающие отголоски душ притягиваются из зала (+4 Очка Душ).",
        failText: "Духи растворились во мраке — ничего не случилось.",
        isCombat: false,
        onSuccess: (game) => {
            game.meta.souls += 4;
            game.saveMeta();
        },
    },
};

export class Game {
    constructor() {
        this.defaultMeta = {
            uid: null,
            souls: 0,
            hp: 0,
            atk: 0,
            def: 0,
            en: 0,
            gold: 0,
            potions: 0,
            unlockedClasses: ["wanderer"],
            malkorDefeated: false,
            bestFloor: 0,
            bestClass: null,
        };
        this.meta = JSON.parse(JSON.stringify(this.defaultMeta));
        this.player = null;
        this.floor = 0;
        this.room = 1;
        this.state = "MENU";
        this.enteredAbyss = false;

        this.enemies = [];
        this.selectedTargetIndex = 0;
        this.battleTurn = 1;
        this.enrageAnnounced = false;
        this.battleLog = [];
        this.isProcessingTurn = false;
        this.battleFinished = false;
        this.battleRewards = { xp: 0, gold: 0, items: [] };

        this.selectedPerkChoices = [];
        this.dungeonRooms = {};
        this.playerPos = { x: 0, y: 0 };
        this.bossRoomId = null;
        this.currentEventId = null;
        this.shopOffers = [];
        this.rerollCost = 5;
        this.lastEarnedSouls = 0;
        this.pendingEquipment = null;
        this.pendingArtifact = null;
        this.fountainCursesCount = 0;
        this.fountainEclipseCount = 0;
        this.fountainResult = null;
        this.shopMergedNotice = null;
        this.eventRewards = null;
        this.currentCorridorResult = null;
        this.battleFx = [];
        this.previewShopOfferIndex = null;
        this.scoutCooldown = 0;
        this.scoutSession = null;
        this.shopRerollCount = 0;
        this.isReplayMode = false;
        this.replaySpeed = 1;
        this.sessionGeneration = 0;
        this._preReplayBackup = null;
    }

    scaleDelay(ms) {
        if (!this.isReplayMode || (this.replaySpeed || 1) <= 1) return ms;
        return Math.max(16, Math.round(ms / this.replaySpeed));
    }

    init() {
        this.loadMeta();
    }

    loadMeta() {
        SaveSystem.loadMeta(this);
    }

    saveMeta() {
        SaveSystem.saveMeta(this);
    }

    serializeState() {
        return SaveSystem.serializeState(this);
    }

    saveGame(slotKey = "autosave") {
        return SaveSystem.saveGame(this, slotKey);
    }

    loadGame(slotKeyOrJson = "autosave") {
        return SaveSystem.loadGame(this, slotKeyOrJson);
    }

    getSlotSummary(slotKey) {
        return SaveSystem.getSlotSummary(slotKey);
    }

    deleteSlot(slotKey) {
        SaveSystem.deleteSlot(slotKey);
    }

    hardResetAll() {
        SaveSystem.hardResetAll(this);
    }

    buyMetaUpgrade(key) {
        ShopSystem.buyMetaUpgrade(this, key);
    }

    unlockClass(classKey) {
        ShopSystem.unlockClass(this, classKey);
    }

    setupShop() {
        ShopSystem.setupShop(this);
    }

    rerollShop() {
        ShopSystem.rerollShop(this);
    }

    buyShopOffer(index) {
        ShopSystem.buyShopOffer(this, index);
    }

    calculateSouls() {
        ShopSystem.calculateSouls(this);
    }

    recordProgress(reachedFloor = this.floor + 1) {
        if (this.isReplayMode) return;
        if (reachedFloor > (this.meta.bestFloor || 0)) {
            this.meta.bestFloor = reachedFloor;
            this.meta.bestClass = this.player ? this.player.className : (this.meta.bestClass || null);
        }
        this.saveMeta();
    }

    recordAction(type, payload = null) {
        if (this.isReplayMode) return null;
        return ReplaySystem.recordReplayAction(this, type, payload);
    }

    selectTarget(index) {
        if (this.state !== "BATTLE" || this.isProcessingTurn || this.battleFinished) return false;
        const enemy = this.enemies[index];
        if (!enemy || enemy.isDying || enemy.currentHp <= 0) return false;
        if (index === this.selectedTargetIndex) return false;
        this.selectedTargetIndex = index;
        this.recordAction("target", index);
        return true;
    }

    proceedAfterEventRewards() {
        if (this.state !== "EVENT_REWARDS" || this.pendingEquipment || this.pendingArtifact) return false;
        this.recordAction("event_proceed", null);
        this.eventRewards = null;
        this.checkLevelUpOrFinishRoom();
        return true;
    }

    leaveShop() {
        if (this.state !== "SHOP") return false;
        this.recordAction("shop_leave", null);
        this.previewShopOfferIndex = null;
        this.finishRoom();
        return true;
    }

    reenterShop() {
        if (this.state !== "MAP") return false;
        const currentRoom = this.dungeonRooms[`${this.playerPos.x},${this.playerPos.y}`];
        if (!currentRoom || currentRoom.type !== "shop" || !currentRoom.cleared) return false;
        this.recordAction("shop_reenter", null);
        this.state = "SHOP";
        this.saveGame("autosave");
        return true;
    }

    descendToNextFloor() {
        if (this.state !== "MAP") return false;
        const currentRoom = this.dungeonRooms[`${this.playerPos.x},${this.playerPos.y}`];
        if (!currentRoom || currentRoom.type !== "boss" || !currentRoom.cleared) return false;
        if (this.floor === ABYSS_START_FLOOR - 1) return false;
        this.recordAction("descend_floor", null);
        this.floor++;
        this.recordProgress(this.floor + 1);
        this.generateFloorMap();
        this.state = "MAP";
        this.saveGame("autosave");
        return true;
    }

    openAbyssChoice() {
        if (this.state !== "MAP") return false;
        const currentRoom = this.dungeonRooms[`${this.playerPos.x},${this.playerPos.y}`];
        if (!currentRoom || currentRoom.type !== "boss" || !currentRoom.cleared) return false;
        if (this.floor !== ABYSS_START_FLOOR - 1) return false;
        this.recordAction("abyss_open", null);
        this.state = "ABYSS_CHOICE";
        return true;
    }

    returnFromAbyssChoiceToMap() {
        if (this.state !== "ABYSS_CHOICE") return false;
        this.recordAction("abyss_map", null);
        this.state = "MAP";
        this.saveGame("autosave");
        return true;
    }

    finishVictoryFromAbyssChoice() {
        if (this.state !== "ABYSS_CHOICE") return false;
        this.recordAction("abyss_victory", null);
        this.finalizeRun("VICTORY");
        return true;
    }

    enterAbyssFromChoice() {
        if (this.state !== "ABYSS_CHOICE") return;
        this.recordAction("abyss_enter", null);
        this.enteredAbyss = true;
        this.floor++;
        this.generateFloorMap();
        this.recordProgress(this.floor + 1);
        this.state = "MAP";
        this.saveGame("autosave");
    }

    finalizeRun(outcomeState = "GAMEOVER") {
        if (this.state === "VICTORY" || this.state === "GAMEOVER") return;
        if (this.player) {
            this.recordProgress(this.floor + 1);
            this.calculateSouls();
        }
        this.state = outcomeState;
        ReplaySystem.finalizeReplay(this, outcomeState);
    }

    startRun(classKey, customSeed = null) {
        this.sessionGeneration = (this.sessionGeneration || 0) + 1;
        const normalizedSeed = RNG.setSeed(customSeed);
        const rawSeed = customSeed !== null && customSeed !== undefined ? String(customSeed).trim() : "";
        this.seed = rawSeed || normalizedSeed;
        this.player = new Player(classKey, this.meta);
        this.floor = 0;
        this.room = 1;
        this.enteredAbyss = false;
        this.enrageAnnounced = false;
        this.lastEarnedSouls = 0;
        this.pendingEquipment = null;
        this.pendingArtifact = null;
        this.fountainCursesCount = 0;
        this.fountainEclipseCount = 0;
        this.fountainResult = null;
        this.shopMergedNotice = null;
        this.eventRewards = null;
        this.currentCorridorResult = null;
        this.previewShopOfferIndex = null;
        this.scoutCooldown = 0;
        this.scoutSession = null;
        this.shopRerollCount = 0;
        this.generateFloorMap();
        this.state = "MAP";
        this.saveGame("autosave");
        ReplaySystem.startReplay(this);
    }

    setRoomSeed(...scopeParts) {
        return RNG.setScopedSeed(
            this.seed,
            Math.max(0, this.floor || 0),
            this.playerPos?.x || 0,
            this.playerPos?.y || 0,
            ...scopeParts,
        );
    }

    generateFloorMap() {
        if (this.player) this.player.secondWindAvailable = true;
        this.scoutCooldown = 0;
        this.scoutSession = null;
        const generated = DungeonGenerator.generate(this.floor, this.seed);
        this.dungeonRooms = generated.rooms;
        this.playerPos = { ...generated.startPos };
        this.bossRoomId = generated.bossRoomId;
    }

    moveToRoom(targetX, targetY) {
        if (this.state !== "MAP") return false;
        const currentKey = `${this.playerPos.x},${this.playerPos.y}`;
        const currentRoom = this.dungeonRooms[currentKey];
        const targetKey = `${targetX},${targetY}`;
        const targetRoom = this.dungeonRooms[targetKey];

        if (!currentRoom || !targetRoom) return false;

        const dx = targetX - this.playerPos.x;
        const dy = targetY - this.playerPos.y;
        if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

        if (dx === 1 && !currentRoom.doors.right) return false;
        if (dx === -1 && !currentRoom.doors.left) return false;
        if (dy === 1 && !currentRoom.doors.down) return false;
        if (dy === -1 && !currentRoom.doors.up) return false;

        this.recordAction("move", { x: targetX, y: targetY });
        const isNewRoom = !targetRoom.visited;
        this.playerPos = { x: targetX, y: targetY };
        playSound("step");
        if (isNewRoom) {
            this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 1);
            this.scoutCooldown = Math.max(0, (this.scoutCooldown || 0) - 1);
        }
        targetRoom.visited = true;
        targetRoom.visible = true;
        targetRoom.revealed = true;
        this.room = Object.values(this.dungeonRooms).filter(r => r.visited && r.type !== "corridor").length;
        this.updateFogOfWar();
        this.enterCurrentRoomContent();
        this.saveGame("autosave");
        return true;
    }

    getScoutStatus() {
        const px = this.playerPos.x;
        const py = this.playerPos.y;
        const currentRoom = this.dungeonRooms[`${px},${py}`];
        if (!currentRoom) return { canScout: false, reason: "no_room" };

        let unrevealedCount = 0;
        for (const dir of SCOUT_DIRS) {
            if (currentRoom.doors[dir.name]) {
                const adjKey = `${px + dir.dx},${py + dir.dy}`;
                const adjRoom = this.dungeonRooms[adjKey];
                if (adjRoom && !adjRoom.revealed && !adjRoom.visited) {
                    unrevealedCount++;
                }
            }
        }

        if (unrevealedCount === 0) {
            return { canScout: false, reason: "all_revealed" };
        }

        if ((this.scoutCooldown || 0) > 0) {
            return {
                canScout: false,
                reason: "cooldown",
                cooldown: this.scoutCooldown,
                count: unrevealedCount,
            };
        }

        const cost = unrevealedCount;
        if (this.player.en >= cost) {
            return {
                canScout: true,
                costType: "en",
                cost,
                enSpent: cost,
                hpCost: 0,
                count: unrevealedCount,
            };
        }

        if (this.player.classId === "reaper") {
            const enSpent = Math.max(0, this.player.en);
            const hpCost = (cost - enSpent) * 2;
            if (this.player.hp > hpCost) {
                return {
                    canScout: true,
                    costType: enSpent > 0 ? "en_hp" : "hp",
                    cost,
                    enSpent,
                    hpCost,
                    count: unrevealedCount,
                };
            }
        }

        return { canScout: false, reason: "no_en", cost, count: unrevealedCount };
    }

    scoutSurroundings() {
        if (this.state !== "MAP") return false;
        const status = this.getScoutStatus();
        if (!status.canScout) return false;

        this.recordAction("scout_start", null);

        if (status.enSpent > 0) {
            this.player.en -= status.enSpent;
        }
        if (status.hpCost > 0) {
            this.player.hp -= status.hpCost;
        }

        const px = this.playerPos.x;
        const py = this.playerPos.y;
        const currentRoom = this.dungeonRooms[`${px},${py}`];

        const revealedRooms = [];
        const seenTypes = new Set();
        const actions = [];

        for (const dir of SCOUT_DIRS) {
            if (currentRoom.doors[dir.name]) {
                const adjKey = `${px + dir.dx},${py + dir.dy}`;
                const adjRoom = this.dungeonRooms[adjKey];
                if (adjRoom) {
                    const wasUnrevealed = !adjRoom.revealed && !adjRoom.visited;
                    adjRoom.revealed = true;
                    adjRoom.visible = true;
                    if (wasUnrevealed) {
                        revealedRooms.push({ id: adjKey, type: adjRoom.type });
                        if (!seenTypes.has(adjRoom.type) && SCOUT_ACTION_CONFIG[adjRoom.type]) {
                            seenTypes.add(adjRoom.type);
                            const cfg = SCOUT_ACTION_CONFIG[adjRoom.type];
                            actions.push({
                                id: adjRoom.type,
                                type: adjRoom.type,
                                icon: cfg.icon,
                                label: cfg.label,
                            });
                        }
                    }
                }
            }
        }

        this.scoutCooldown = 5;
        this.scoutSession = {
            revealedRooms,
            actions,
            result: null,
        };
        this.state = "SCOUT";
        this.saveGame("autosave");
        return true;
    }

    resolveScoutAction(actionId) {
        if (this.state !== "SCOUT" || !this.scoutSession || this.scoutSession.result) return false;

        if (actionId === "quiet") {
            this.recordAction("scout_action", "quiet");
            this.scoutSession = null;
            this.state = "MAP";
            this.saveGame("autosave");
            return true;
        }

        if (actionId === "far_passage") {
            this.recordAction("scout_action", "far_passage");
            this.setRoomSeed("scout", actionId);
            this.scoutCooldown = (this.scoutCooldown || 5) + 1;
            const candidates = [];
            const candidateIds = new Set();
            for (const entry of this.scoutSession.revealedRooms) {
                const refRoom = this.dungeonRooms[entry.id];
                if (!refRoom) continue;
                for (const dir of SCOUT_DIRS) {
                    if (!refRoom.doors[dir.name]) continue;
                    const candKey = `${refRoom.x + dir.dx},${refRoom.y + dir.dy}`;
                    const candRoom = this.dungeonRooms[candKey];
                    if (candRoom && !candRoom.revealed && !candRoom.visited && !candidateIds.has(candKey)) {
                        candidateIds.add(candKey);
                        candidates.push(candRoom);
                    }
                }
            }

            if (candidates.length > 0 && RNG.chance(50)) {
                const chosen = RNG.choice(candidates);
                chosen.revealed = true;
                chosen.visible = true;
                this.scoutSession.result = {
                    title: "👣 Осмотреть дальний проход",
                    text: "За открытыми комнатами удалось разглядеть ещё один проход.",
                    tone: "positive",
                };
            } else {
                this.scoutSession.result = {
                    title: "👣 Осмотреть дальний проход",
                    text: "Впереди ничего не разглядеть.",
                    tone: "neutral",
                };
            }

            this.saveGame("autosave");
            return true;
        }

        const hasAction = this.scoutSession.actions.some(a => a.id === actionId);
        const cfg = SCOUT_ACTION_CONFIG[actionId];
        if (!hasAction || !cfg) return false;

        this.recordAction("scout_action", actionId);
        this.setRoomSeed("scout", actionId);
        this.scoutCooldown = (this.scoutCooldown || 5) + 1;
        const matchingRooms = this.scoutSession.revealedRooms
            .filter(r => r.type === actionId)
            .map(r => this.dungeonRooms[r.id])
            .filter(Boolean);
        const targetRoom = matchingRooms.length > 0 ? RNG.choice(matchingRooms) : null;

        if (RNG.chance(70)) {
            cfg.onSuccess(this, targetRoom);
            this.scoutSession.result = {
                title: `${cfg.icon} ${cfg.label}`,
                text: cfg.successText,
                tone: "positive",
            };
        } else {
            if (cfg.isCombat && targetRoom) {
                targetRoom.alerted = true;
            }
            this.scoutSession.result = {
                title: `${cfg.icon} ${cfg.label}`,
                text: cfg.failText,
                tone: cfg.isCombat ? "negative" : "neutral",
            };
        }

        this.saveGame("autosave");
        return true;
    }

    finishScoutSession() {
        if (this.state !== "SCOUT") return;
        this.recordAction("scout_finish", null);
        this.scoutSession = null;
        this.checkLevelUpOrFinishRoom();
    }

    updateFogOfWar() {
        const currentKey = `${this.playerPos.x},${this.playerPos.y}`;
        const currentRoom = this.dungeonRooms[currentKey];
        if (!currentRoom) return;

        const dirs = [
            { name: "up", dx: 0, dy: -1 },
            { name: "down", dx: 0, dy: 1 },
            { name: "left", dx: -1, dy: 0 },
            { name: "right", dx: 1, dy: 0 },
        ];

        for (const dir of dirs) {
            if (currentRoom.doors[dir.name]) {
                const adjKey = `${currentRoom.x + dir.dx},${currentRoom.y + dir.dy}`;
                if (this.dungeonRooms[adjKey]) {
                    this.dungeonRooms[adjKey].visible = true;
                }
            }
        }
    }

    enterCurrentRoomContent() {
        const currentKey = `${this.playerPos.x},${this.playerPos.y}`;
        const roomObj = this.dungeonRooms[currentKey];
        if (!roomObj) return;

        if (roomObj.type === "start") {
            this.state = "MAP";
        } else if (roomObj.type === "battle") {
            if (!roomObj.cleared) {
                this.setupBattle("normal");
            } else {
                this.state = "MAP";
            }
        } else if (roomObj.type === "elite") {
            if (!roomObj.cleared) {
                this.setupBattle("elite");
            } else {
                this.state = "MAP";
            }
        } else if (roomObj.type === "boss") {
            if (!roomObj.cleared) {
                this.setupBattle("boss");
            } else {
                this.state = "MAP";
            }
        } else if (roomObj.type === "campfire") {
            this.player.en = this.player.getTotalMaxEn();
            if (!roomObj.cleared) {
                this.state = "CAMPFIRE";
            } else {
                this.state = "MAP";
            }
        } else if (roomObj.type === "event") {
            if (!roomObj.cleared) {
                this.setRoomSeed("event", "init");
                this.currentEventId = RNG.choice(GAME_DATA.events).id;
                this.state = "EVENT";
            } else {
                this.state = "MAP";
            }
        } else if (roomObj.type === "corridor") {
            if (!roomObj.cleared) {
                this.triggerCorridorRoom();
            } else {
                this.state = "MAP";
            }
        } else if (roomObj.type === "shop") {
            if (!roomObj.cleared) {
                this.rerollCost = ShopSystem.getBaseRerollCost(this.floor);
                this.shopMergedNotice = null;
                this.shopRerollCount = 0;
                this.setupShop();
                roomObj.cleared = true;
                this.state = "SHOP";
            } else {
                this.state = "MAP";
            }
        } else if (roomObj.type === "fountain") {
            if (!roomObj.cleared) {
                this.fountainResult = null;
                this.state = "FOUNTAIN";
            } else {
                this.state = "MAP";
            }
        }
    }

    checkLevelUpOrFinishRoom() {
        EncounterSystem.checkLevelUpOrFinishRoom(this);
    }

    grantRandomEquipment(origin = "battle") {
        return EncounterSystem.grantRandomEquipment(this, origin);
    }

    resolveEquipChoice() {
        return EncounterSystem.resolveEquipChoice(this);
    }

    resolveSalvageChoice() {
        return EncounterSystem.resolveSalvageChoice(this);
    }

    resolvePendingArtifact(accept) {
        return EncounterSystem.resolvePendingArtifact(this, accept);
    }

    resolveFountainChoice(drink) {
        EncounterSystem.resolveFountainChoice(this, drink);
    }

    leaveFountainRoom() {
        EncounterSystem.leaveFountainRoom(this);
    }

    finishRoom() {
        EncounterSystem.finishRoom(this);
    }

    generatePerkChoices() {
        EncounterSystem.generatePerkChoices(this);
    }

    choosePerk(perkId) {
        EncounterSystem.choosePerk(this, perkId);
    }

    resolveEventOption(optionId) {
        EncounterSystem.resolveEventOption(this, optionId);
    }

    resolveCampfire(choice) {
        EncounterSystem.resolveCampfire(this, choice);
    }

    triggerCorridorRoom() {
        EncounterSystem.triggerCorridorRoom(this);
    }

    leaveCorridorRoom() {
        EncounterSystem.leaveCorridorRoom(this);
    }

    createEnemyInstance(enemyKey, applyMutation = false) {
        return BattleSystem.createEnemyInstance(this, enemyKey, applyMutation);
    }

    setupBattle(mode = "normal") {
        BattleSystem.setupBattle(this, mode);
    }

    ensureValidTarget() {
        return BattleSystem.ensureValidTarget(this);
    }

    canAffordEn(cost) {
        return BattleSystem.canAffordEn(this, cost);
    }

    canUseSkill(skillName, enCost = 0) {
        return BattleSystem.canUseSkill(this, skillName, enCost);
    }

    spendEn(cost) {
        return BattleSystem.spendEn(this, cost);
    }

    tickCooldowns() {
        BattleSystem.tickCooldowns(this);
    }

    usePotion(potIndex, onStepRender) {
        BattleSystem.usePotion(this, potIndex, onStepRender);
    }

    discardPotion(potIndex) {
        BattleSystem.discardPotion(this, potIndex);
    }

    playerAction(actionType, onStepRender) {
        BattleSystem.playerAction(this, actionType, onStepRender);
    }

    runEnemyTurnSequence(onStepRender) {
        BattleSystem.runEnemyTurnSequence(this, onStepRender);
    }

    executeSingleEnemyTurn(en) {
        BattleSystem.executeSingleEnemyTurn(this, en);
    }

    checkEnemySpikes(enemy) {
        BattleSystem.checkEnemySpikes(this, enemy);
    }

    applyWeaponEffects(enemy) {
        BattleSystem.applyWeaponEffects(this, enemy);
    }

    dealDamageToEnemy(enemy, amount, ignoreDef = false, isCrit = false) {
        return BattleSystem.dealDamageToEnemy(this, enemy, amount, ignoreDef, isCrit);
    }

    onEnemyKilled(enemy) {
        BattleSystem.onEnemyKilled(this, enemy);
    }

    checkBattleEnd() {
        return BattleSystem.checkBattleEnd(this);
    }

    proceedAfterBattle() {
        BattleSystem.proceedAfterBattle(this);
    }

    getAbyssEnrageBonus() {
        return BattleSystem.getAbyssEnrageBonus(this);
    }

    addBattleFx(fx) {
        this.battleFx.push(fx);
    }

    consumeBattleFx() {
        const list = this.battleFx;
        this.battleFx = [];
        return list;
    }
}

export const game = new Game();
game.init();
