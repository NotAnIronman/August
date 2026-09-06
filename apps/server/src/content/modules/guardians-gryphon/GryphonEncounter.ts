import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { getItemDefinition } from "@server/data/items";
import { getAttackAnimation } from "@server/game/combat/WeaponDataProvider";
import { EncounterSupport, bodyDistance, distance, tileOf, type Tile } from "./EncounterSupport";
import type { FoundationRoom } from "./rooms";
export const GRYPHON_TIMING = { attack: 5, specialEvery: 4, spitTravel: 2, counter: 2,
    corrosion: [2, 8, 14, 20, 26, 32], windSpacing: 3, windCount: 5, windWarmup: 6, windActive: 25 } as const;
export const GRYPHON_ASSETS = { spit: 3461, ranged: 3459, armourIcon: 1361, windInactive: 57917, windActive: 57918 } as const;
export const WIND_DAMAGE = [
    { min: 2, max: 3, burstMin: 20, burstMax: 24, radius: 0 },
    { min: 5, max: 6, burstMin: 25, burstMax: 29, radius: 1 },
    { min: 8, max: 9, burstMin: 30, burstMax: 39, radius: 2 },
    { min: 10, max: 12, burstMin: 40, burstMax: 49, radius: 3 },
    { min: 11, max: 15, burstMin: 50, burstMax: 60, radius: Infinity },
] as const;
/** Item catalogue weights are kilograms. Inventory and ammo stack quantities do not count. */
export function equippedWeight(p: PlayerState, services: ScriptServices): number {
    return p.exportEquipmentSnapshot().reduce((sum, e) => {
        const cached = services.data.getObjType(e.itemId);
        return sum + (cached ? cached.weight / 1000 : getItemDefinition(e.itemId)?.weight ?? 0);
    }, 0);
}
type Wind = Tile & {
    strength: number;
};
type WindBatch = {
    target: PlayerState;
    next: number;
    remaining: number;
    activeAt: number;
    burstAt: number;
    active: boolean;
    winds: Map<string, Wind>;
};
export class GryphonEncounter extends EncounterSupport {
    private nextAttack: number;
    private attacks = 0;
    private counter?: {
        player: PlayerState;
        expires: number;
    };
    private corrosion = new Map<PlayerState, {
        started: number;
        hit: number;
    }>();
    private batch?: WindBatch;
    private previousClick: NpcState["onPlayerAttackClick"];
    private previousWeakness: NpcState["elementalWeakness"];
    private readonly clickHook: NonNullable<NpcState["onPlayerAttackClick"]>;
    constructor(readonly boss: NpcState, instanceId: string, room: FoundationRoom, services: ScriptServices) {
        super([boss], instanceId, room, services);
        this.nextAttack = this.tickNow + GRYPHON_TIMING.attack;
        this.previousClick = boss.onPlayerAttackClick;
        this.previousWeakness = boss.elementalWeakness;
        boss.elementalWeakness = { element: "wind", percent: 50 };
        this.clickHook = (p, t) => { this.previousClick?.(p, t); this.counterClick(p, t); };
        boss.onPlayerAttackClick = this.clickHook;
    }
    private counterClick(p: PlayerState, tick: number): void {
        const window = this.counter;
        if (!window || window.player !== p || tick >= window.expires || this.stopped || !this.members().includes(p) || bodyDistance(this.boss, p) > 1)
            return;
        // Eating remains a real penalty. Weapon recovery alone does not consume this free hit.
        if (p.combatAttributes.get(CombatAttributes.FOOD_DELAY) > tick || p.combatAttributes.get(CombatAttributes.COUNTER_FOOD_DELAY) > tick || this.services.combat.isPlayerStunned(p))
            return;
        this.counter = undefined;
        const b = this.boss, dx = b.tileX + (b.size - 1) / 2 - p.tileX, dy = b.tileY + (b.size - 1) / 2 - p.tileY;
        const to = Math.abs(dx) >= Math.abs(dy) ? { x: b.tileX + (Math.sign(dx) || 1), y: b.tileY } : { x: b.tileX, y: b.tileY + (Math.sign(dy) || 1) };
        if (this.stepAllowed(tileOf(b), to, b.size))
            b.setPath([to], false);
        const roll = this.evaluator.evaluate({ attacker: { type: "player", id: p.id }, target: { type: "npc", id: b.id }, attackClock: tick,
            traits: { type: "melee", style: null, rangeTiles: 1, speedTicks: 0, weaponId: p.combat.weaponItemId } });
        this.services.animation.playPlayerSeq(p, getAttackAnimation(p.combat.weaponItemId, p.combat.styleSlot));
        this.services.combat.applyPlayerDamageToNpc(p, b, HITMARK_DAMAGE, roll.damage, tick);
        this.services.messaging.sendGameMessage(p, "You hold your ground and shove the gryphon back!");
        this.nextAttack = Math.max(this.nextAttack, tick + 2);
    }
    private knockback(p: PlayerState): void {
        this.animate(this.boss, "knockback", 12552);
        this.boss.clearPath();
        if (equippedWeight(p, this.services) >= 40) {
            this.counter = { player: p, expires: this.tickNow + GRYPHON_TIMING.counter };
            this.services.messaging.sendGameMessage(p, "You hold your ground! Attack the gryphon now to push it back!");
        }
        else {
            this.hit(this.boss, p, this.roll(0, 30));
            this.push(this.boss, p);
        }
    }
    private spit(p: PlayerState): void {
        const tile = tileOf(p);
        this.animate(this.boss, "ranged", 12554);
        this.projectile(this.boss, tile, GRYPHON_ASSETS.spit, GRYPHON_TIMING.spitTravel);
        this.later(GRYPHON_TIMING.spitTravel, () => {
            this.graphic(tile, 3462, 2);
            if (this.members().includes(p) && distance(tile, tileOf(p)) === 0 && p.exportEquipmentSnapshot().length) {
                this.corrosion.set(p, { started: this.tickNow, hit: 0 });
                this.services.messaging.sendGameMessage(p, "Corrosive spit coats your equipment! Remove all worn items to stop the damage.");
            }
        });
    }
    private whirlwind(p: PlayerState): void {
        this.animate(this.boss, "whirlwind", 12555);
        this.message("The gryphon aggressively flaps its wings...");
        const activeAt = this.tickNow + (GRYPHON_TIMING.windCount - 1) * GRYPHON_TIMING.windSpacing + GRYPHON_TIMING.windWarmup;
        this.batch = { target: p, next: this.tickNow, remaining: 5, activeAt, burstAt: activeAt + GRYPHON_TIMING.windActive, active: false, winds: new Map() };
        this.winds();
    }
    private winds(): void {
        const b = this.batch;
        if (!b)
            return;
        if (b.remaining > 0 && this.tickNow >= b.next) {
            const p = this.members().includes(b.target) ? b.target : this.target(this.boss);
            if (p) {
                const tile = tileOf(p), key = `${tile.x}:${tile.y}`, w = b.winds.get(key) ?? { ...tile, strength: 0 };
                w.strength = Math.min(5, w.strength + 1);
                b.winds.set(key, w);
                this.loc(w, 57917 + (w.strength - 1) * 2);
            }
            b.remaining--;
            b.next += 3;
        }
        if (this.tickNow < b.activeAt)
            return;
        if (!b.active) {
            b.active = true;
            for (const w of b.winds.values())
                this.loc(w, 57918 + (w.strength - 1) * 2);
        }
        const burst = this.tickNow >= b.burstAt;
        for (const w of b.winds.values()) {
            const d = WIND_DAMAGE[w.strength - 1];
            for (const p of this.members())
                if (distance(w, tileOf(p)) <= (burst ? d.radius : 0))
                    this.hit(this.boss, p, burst ? this.roll(d.burstMin, d.burstMax) : this.roll(d.min, d.max));
            if (burst) {
                for (const p of this.members())
                    this.services.animation.playLocAnimation({ playerId: p.id, locId: 57918 + (w.strength - 1) * 2, tile: w, level: this.boss.level, shape: 10, animId: 12581 + w.strength - 1 });
                this.later(2, () => this.clearLoc(w));
            }
        }
        if (burst) {
            this.message("The whirlwinds explode outwards in a large gust of wind!");
            this.batch = undefined;
        }
    }
    tick(tick: number): void {
        if (this.boss.getHitpoints() <= 0) {
            this.dispose();
            return;
        }
        if (!this.update(tick))
            return;
        for (const [p, c] of this.corrosion) {
            if (!this.members().includes(p) || !p.exportEquipmentSnapshot().length) {
                this.corrosion.delete(p);
                continue;
            }
            if (tick >= c.started + GRYPHON_TIMING.corrosion[c.hit]) {
                this.hit(this.boss, p, this.roll(3, 12));
                if (++c.hit === 6)
                    this.corrosion.delete(p);
            }
        }
        this.winds();
        if (this.counter) {
            if (tick < this.counter.expires)
                return;
            const p = this.counter.player;
            this.counter = undefined;
            if (this.members().includes(p)) {
                this.services.messaging.sendGameMessage(p, "The gryphon regains its focus and strikes!");
                this.hit(this.boss, p, this.roll(0, 30));
                this.push(this.boss, p);
            }
        }
        const target = this.target(this.boss);
        if (!target)
            return;
        this.pursue(this.boss, target);
        if (tick < this.nextAttack || !this.services.npc.hasLineOfSightToPlayer(this.boss, target))
            return;
        this.nextAttack = tick + GRYPHON_TIMING.attack;
        this.services.npc.faceNpcToPlayer(this.boss, target);
        if (++this.attacks % GRYPHON_TIMING.specialEvery === 0) {
            const choices = equippedWeight(target, this.services) >= 40 ? [1, 1, 2, 2, 0] : [0, 1, 2];
            let special = choices[this.rng.nextInt(choices.length)];
            if (special === 2 && this.batch)
                special = 1;
            if (special === 0 && bodyDistance(this.boss, target) <= 1)
                this.knockback(target);
            else if (special === 2)
                this.whirlwind(target);
            else
                this.spit(target);
        }
        else if (bodyDistance(this.boss, target) <= 1 && this.rng.next() < 0.8) {
            this.animate(this.boss, "attack", 12552);
            this.standardHit(this.boss, target, "melee", 22, 0.2);
        }
        else {
            this.animate(this.boss, "normal-ranged", 12554);
            this.projectile(this.boss, tileOf(target), 3459, 2, target);
            this.standardHit(this.boss, target, "ranged", 22, 0, 2);
        }
    }
    override dispose(): void {
        if (this.stopped)
            return;
        if (this.boss.onPlayerAttackClick === this.clickHook)
            this.boss.onPlayerAttackClick = this.previousClick;
        this.boss.elementalWeakness = this.previousWeakness;
        this.corrosion.clear();
        this.counter = undefined;
        this.batch = undefined;
        super.dispose();
    }
}
