import { RNG } from "../utils/rng.js";
import { GAME_DATA } from "../data/index.js";
import { playSound } from "../utils/audio.js";
import { DungeonGenerator } from "./dungeon-generator.js";
import { Player } from "./player.js";
import * as SaveSystem from "./systems/save.js";
import * as ShopSystem from "./systems/shop.js";
import * as EncounterSystem from "./systems/encounter.js";
import * as BattleSystem from "./systems/battle.js";

export class Game {
    constructor() {
        this.defaultMeta = {
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
        if (reachedFloor > (this.meta.bestFloor || 0)) {
            this.meta.bestFloor = reachedFloor;
            this.meta.bestClass = this.player ? this.player.className : (this.meta.bestClass || null);
        }
        this.saveMeta();
    }

    enterAbyssFromChoice() {
        if (this.state !== "ABYSS_CHOICE") return;
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
    }

    startRun(classKey) {
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
        this.generateFloorMap();
        this.state = "MAP";
        this.saveGame("autosave");
    }

    generateFloorMap() {
        if (this.player) this.player.secondWindAvailable = true;
        const generated = DungeonGenerator.generate(this.floor);
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

        const isNewRoom = !targetRoom.visited;
        this.playerPos = { x: targetX, y: targetY };
        playSound("step");
        if (isNewRoom) {
            this.player.en = Math.min(this.player.getTotalMaxEn(), this.player.en + 1);
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

        const dirs = [
            { name: "up", dx: 0, dy: -1 },
            { name: "down", dx: 0, dy: 1 },
            { name: "left", dx: -1, dy: 0 },
            { name: "right", dx: 1, dy: 0 },
        ];

        let unrevealedCount = 0;
        for (const dir of dirs) {
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

        if (this.player.en >= 1) {
            return { canScout: true, costType: "en", cost: 1, count: unrevealedCount };
        }

        if (this.player.classId === "reaper" && this.player.hp > 3) {
            return { canScout: true, costType: "hp", cost: 3, count: unrevealedCount };
        }

        return { canScout: false, reason: "no_en", count: unrevealedCount };
    }

    scoutSurroundings() {
        if (this.state !== "MAP") return false;
        const status = this.getScoutStatus();
        if (!status.canScout) return false;

        if (status.costType === "en") {
            this.player.en -= 1;
        } else if (status.costType === "hp") {
            this.player.hp -= 3;
        }

        const px = this.playerPos.x;
        const py = this.playerPos.y;
        const currentRoom = this.dungeonRooms[`${px},${py}`];

        const dirs = [
            { name: "up", dx: 0, dy: -1 },
            { name: "down", dx: 0, dy: 1 },
            { name: "left", dx: -1, dy: 0 },
            { name: "right", dx: 1, dy: 0 },
        ];

        for (const dir of dirs) {
            if (currentRoom.doors[dir.name]) {
                const adjKey = `${px + dir.dx},${py + dir.dy}`;
                const adjRoom = this.dungeonRooms[adjKey];
                if (adjRoom) {
                    adjRoom.revealed = true;
                    adjRoom.visible = true;
                }
            }
        }

        this.saveGame("autosave");
        return true;
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
