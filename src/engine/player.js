// ============================================================================
// PLAYER-MODEL.JS — Модель игрока, динамические статы, инвентарь и артефакты
// ============================================================================

import { RNG } from "../utils/rng.js";
import { GAME_DATA } from "../data/index.js";
import { pickItemByRarity } from "./systems/encounter.js";

export class Player {
    constructor(classKey = "wanderer", meta = {}) {
        const base = GAME_DATA.classes[classKey] || GAME_DATA.classes.wanderer;
        this.classId = base.id;
        this.className = base.name;

        // Базовые статы (без учета надетых вещей)
        this.baseMaxHp = base.hp + (meta.hp || 0) * 4;
        this.hp = this.baseMaxHp;
        this.baseAtk = base.atk + (meta.atk || 0);
        this.baseDef = base.def + (meta.def || 0);
        this.baseMaxEn = base.en + (meta.en || 0);
        this.en = this.baseMaxEn;
        this.baseCrit = base.crit || 15;

        // Pity-бонус к криту: растёт на +7% за каждый удар без крита
        this.pityCritBonus = 0;

        // Уровни кузнечной заточки в текущем забеге
        this.weaponUpgradeLvl = 0;
        this.armorUpgradeLvl = 0;

        this.gold = (meta.gold || 0) * 8;
        this.xp = 0;
        this.totalRunXp = 0;
        this.level = 1;

        this.shield = 0;
        this.tempSpikes = 0;
        this.battleSpikes = 0;
        this.battleAtk = 0;
        this.battleBannerAtk = 0;
        this.poison = 0;
        this.bleed = 0;
        this.concentrateBonus = 0;

        this.cooldowns = { defend: 0, heavy: 0, pierce: 0, whirlwind: 0, concentrate: 0 };
        this.secondWindAvailable = true;
        this.steelScaleUsed = false;
        this.forceCritNext = false;
        this.critBonusNext = 0;
        this.damageReductionPct = 0;

        this.perks = [];
        this.potionSlots = 2 + (meta.potions || 0);
        this.inventory = {
            weapon: null,
            armor: null,
            artifacts: [], // Неограниченный список артефактов
            potions: []
        };

        if (this.classId === "wanderer") {
            this.gold += 10;
            this.inventory.potions.push({ ...GAME_DATA.items.potions[0] });
        }
        if ((meta.potions || 0) > 0 && this.inventory.potions.length < this.potionSlots) {
            const metaPot = pickItemByRarity(GAME_DATA.items.potions, 0);
            if (metaPot) {
                this.inventory.potions.push({ ...metaPot });
            }
        }
    }

    // Сколько XP нужно для перехода с текущего уровня на следующий
    getRequiredXp() {
        const lvl = this.level;
        return 10 + (lvl - 1) * 8 + (lvl - 1) * (lvl - 1) * 2;
    }

    hasArtifact(artId) {
        return this.inventory.artifacts.some(a => a.id === artId);
    }

    addArtifact(artObj) {
        if (!artObj || this.hasArtifact(artObj.id)) return false;

        const cursedCfg = GAME_DATA.cursedConfig;
        const mergedId = cursedCfg ? cursedCfg.mergedArtifactId : null;
        if (mergedId && cursedCfg.cursedArtifactIds.includes(artObj.id) && this.hasArtifact(mergedId)) {
            return false;
        }

        const oldMaxHp = this.getTotalMaxHp();
        const oldMaxEn = this.getTotalMaxEn();

        this.inventory.artifacts.push({ ...artObj });

        let mergedNow = false;
        if (cursedCfg && cursedCfg.cursedArtifactIds.every(id => this.hasArtifact(id))) {
            const mergedTpl = GAME_DATA.items.artifacts.find(a => a.id === mergedId);
            if (mergedTpl) {
                this.inventory.artifacts = this.inventory.artifacts.filter(
                    a => !cursedCfg.cursedArtifactIds.includes(a.id),
                );
                this.inventory.artifacts.push({ ...mergedTpl });
                mergedNow = true;
            }
        }

        const newMaxHp = this.getTotalMaxHp();
        const newMaxEn = this.getTotalMaxEn();

        if (artObj.id === "art9") {
            this.hp += 6;
        }
        if (artObj.id === "art32" || artObj.id === "art37") {
            this.en += 1;
        }
        if (mergedNow || artObj.id === "art40") {
            if (newMaxHp > oldMaxHp) {
                this.hp += (newMaxHp - oldMaxHp);
            }
            if (newMaxEn > oldMaxEn) {
                this.en += (newMaxEn - oldMaxEn);
            }
        }

        this.en = Math.min(newMaxEn, this.en);
        this.clampHp();
        return true;
    }

    // При надевании нового оружия/брони старое продается за 25% цены
    equipWeapon(newWeapon) {
        let refund = 0;
        if (this.inventory.weapon && this.inventory.weapon.cost) {
            refund = Math.max(1, Math.floor(this.inventory.weapon.cost * 0.25));
            this.gold += refund;
        }
        this.inventory.weapon = { ...newWeapon };
        return refund;
    }

    equipArmor(newArmor) {
        let refund = 0;
        const oldMax = this.getTotalMaxHp();
        if (this.inventory.armor && this.inventory.armor.cost) {
            refund = Math.max(1, Math.floor(this.inventory.armor.cost * 0.25));
            this.gold += refund;
        }
        this.inventory.armor = { ...newArmor };
        const newMax = this.getTotalMaxHp();
        if (newMax > oldMax) {
            this.hp += (newMax - oldMax);
        }
        this.clampHp();
        return refund;
    }

    getTotalMaxHp() {
        let val = this.baseMaxHp;
        if (this.inventory.armor && this.inventory.armor.hp) val += this.inventory.armor.hp;
        val += this.armorUpgradeLvl * 3;
        if (this.hasArtifact("art9")) val += 10;
        if (this.hasArtifact("art40") || this.hasArtifact("art41")) val += 35;
        if (this.perks.includes("p23")) val += 18;
        if (this.hasArtifact("art39")) {
            val = Math.round(val * 0.5);
        }
        return Math.max(1, val);
    }

    addPerk(perkId, floor = 0) {
        if (!perkId || this.perks.includes(perkId)) return false;
        this.perks.push(perkId);
        if (perkId === "p21") {
            this.potionSlots += 1;
            if (this.inventory.potions.length < this.potionSlots) {
                const pot = pickItemByRarity(GAME_DATA.items.potions, floor);
                if (pot) {
                    this.inventory.potions.push({ ...pot });
                }
            }
        }
        if (perkId === "p9") {
            this.en = Math.min(this.getTotalMaxEn(), this.en + 1);
        }
        if (perkId === "p23") {
            this.heal(18);
        }
        return true;
    }

    clampHp() {
        const max = this.getTotalMaxHp();
        if (this.hp > max) this.hp = max;
    }

    getTotalMaxEn() {
        let val = this.baseMaxEn;
        if (this.inventory.weapon && this.inventory.weapon.en) val += this.inventory.weapon.en;
        if (this.inventory.armor && this.inventory.armor.en) val += this.inventory.armor.en;
        if (this.perks.includes("p9")) val += 1;
        if (this.hasArtifact("art32")) val += 1;
        if (this.hasArtifact("art37")) val += 1;
        if (this.hasArtifact("art39")) val -= 2;
        if (this.hasArtifact("art40") || this.hasArtifact("art41")) val += 2;
        return Math.max(2, val);
    }

    getTotalAtk() {
        let val = this.baseAtk + this.concentrateBonus + (this.battleAtk || 0) + this.weaponUpgradeLvl;
        if (this.inventory.weapon) val += this.inventory.weapon.atk || 0;
        if (this.hasArtifact("art3")) val += 1;
        if (this.hasArtifact("art5")) val += 1;
        if (this.hasArtifact("art24") && this.hp <= this.getTotalMaxHp() / 2) val += 1;
        if (this.hasArtifact("art27")) val += 1;
        if (this.hasArtifact("art29") && this.shield > 0) val += 2;
        if (this.hasArtifact("art32")) val += 1;
        if (this.hasArtifact("art35")) val += 2;
        if (this.hasArtifact("art37")) val += 2;
        if (this.hasArtifact("art38")) val += 7;
        if (this.hasArtifact("art41")) val += 8;
        if (this.perks.includes("p1")) val += 1;
        if (this.perks.includes("p4") && this.hp <= this.getTotalMaxHp() / 2) val += 3;
        if (this.perks.includes("p20")) val += Math.min(5, Math.floor(this.gold / 12));
        return val;
    }

    getTotalDef() {
        let val = this.baseDef + Math.floor(this.armorUpgradeLvl / 2);
        if (this.inventory.weapon && this.inventory.weapon.def) val += this.inventory.weapon.def;
        if (this.inventory.armor) val += this.inventory.armor.def || 0;
        if (this.hasArtifact("art35")) val += 1;
        if (this.hasArtifact("art36")) val += 1;
        if (this.hasArtifact("art39")) val += 4;
        if (this.hasArtifact("art41")) val += 5;
        if (this.hasArtifact("art38")) val -= 4;
        if (this.perks.includes("p5")) val += 1;
        return val;
    }

    getTotalSpikes() {
        let val = this.tempSpikes + this.battleSpikes;
        if (this.inventory.armor && this.inventory.armor.spikes) val += this.inventory.armor.spikes;
        if (this.perks.includes("p12")) val += 2;
        if (this.perks.includes("p34")) val += 1;
        if (this.hasArtifact("art14")) val += 2;
        if (this.hasArtifact("art25")) val += 1;
        return val;
    }

    getCritChance(bonus = 0) {
        let val = this.baseCrit + this.pityCritBonus + bonus;
        if (this.inventory.weapon && this.inventory.weapon.crit) val += this.inventory.weapon.crit;
        if (this.perks.includes("p2")) val += 12;
        if (this.hasArtifact("art5")) val += 8;
        if (this.hasArtifact("art11")) val += 24;
        if (this.hasArtifact("art21")) val += 8;
        if (this.hasArtifact("art27")) val += 5;
        if (this.hasArtifact("art31")) val += 15;
        if (this.hasArtifact("art38")) val += 25;
        if (this.hasArtifact("art40")) val -= 20;
        if (this.hasArtifact("art41")) val += 25;
        return Math.max(0, Math.min(100, val));
    }

    rollCrit(skillBonus = 0, forceCrit = false) {
        if (forceCrit) {
            this.pityCritBonus = 0;
            return true;
        }
        const chance = this.getCritChance(skillBonus);
        if (RNG.chance(chance)) {
            this.pityCritBonus = 0;
            return true;
        } else {
            this.pityCritBonus += 7; // Защита от невезения (+7% к следующему удару)
            return false;
        }
    }

    getModifiedShieldGain(amount) {
        if (amount <= 0) return 0;
        if (this.hasArtifact("art38")) {
            return Math.max(1, Math.floor(amount * 0.5));
        }
        return amount;
    }

    modifyOutgoingDamage(amount) {
        if (amount <= 0) return amount;
        if (this.hasArtifact("art40")) {
            return Math.max(1, Math.round(amount * 0.7));
        }
        return amount;
    }

    addShield(amount) {
        const finalAmt = this.getModifiedShieldGain(amount);
        if (finalAmt <= 0) return 0;
        const max = this.getTotalMaxHp();
        this.shield = Math.min(max, this.shield + finalAmt);
        return finalAmt;
    }

    heal(amount) {
        const max = this.getTotalMaxHp();
        this.hp = Math.min(max, this.hp + amount);
    }

    takeDamage(rawAmount, ignoreDef = false) {
        let amount = rawAmount;
        const reducePct = Math.min(90, Math.max(0, this.damageReductionPct || 0));
        if (reducePct > 0) {
            amount = Math.ceil(amount * (1 - reducePct / 100));
        }
        if (this.hasArtifact("art18")) {
            amount = Math.max(1, amount - 1);
        }
        if (this.hasArtifact("art24") && this.hp <= this.getTotalMaxHp() / 2) {
            amount = Math.max(1, amount - 1);
        }
        if (this.perks.includes("p19") && amount >= 8) {
            amount -= 2;
        }
        let def = ignoreDef ? 0 : this.getTotalDef();
        let dmg = ignoreDef ? amount : Math.max(1, amount - def);

        if (this.shield > 0) {
            if (this.shield >= dmg) {
                this.shield -= dmg;
                dmg = 0;
            } else {
                dmg -= this.shield;
                this.shield = 0;
            }
        }
        this.hp = Math.max(0, this.hp - dmg);
        if (this.perks.includes("p29") && dmg > 0 && !this.steelScaleUsed) {
            this.steelScaleUsed = true;
            this.addShield(2);
        }

        if (this.hp <= 0 && this.perks.includes("p26") && this.secondWindAvailable) {
            this.secondWindAvailable = false;
            this.hp = Math.max(1, Math.ceil(this.getTotalMaxHp() * 0.4));
            this.poison = 0;
            this.bleed = 0;
            this.addShield(18);
        }
        return dmg;
    }
}