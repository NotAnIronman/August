import { HITMARK_DAMAGE, HITMARK_HEAL } from "@server/game/combat/HitEffects";
import { CombatHitEvaluator } from "@server/game/combat/engine/CombatHitEvaluator";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import { normalizeNpcAnimationPool, type NpcCombatAnimationData } from "@server/game/npc/NpcCombatAnimationData";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { CardinalAdjacentRouteStrategy } from "@server/pathfinding/engine/RouteStrategy";
import { serverGeneratedDataPath } from "@server/paths";
import type { AttackType } from "@server/game/combat/AttackType";
import type { FoundationRoom } from "./rooms";
export type Tile = {
    x: number;
    y: number;
};
export const tileOf = (p: {
    tileX: number;
    tileY: number;
}): Tile => ({ x: p.tileX, y: p.tileY });
export const distance = (a: Tile, b: Tile): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const hp = (p: PlayerState): number => p.skillSystem.getHitpointsCurrent();
export const bodyDistance = (n: NpcState, p: PlayerState): number => Math.max(n.tileX - p.tileX, p.tileX - (n.tileX + n.size - 1), n.tileY - p.tileY, p.tileY - (n.tileY + n.size - 1), 0);
const key = (t: Tile) => `${t.x}:${t.y}`;
/** An attempt owns every timer and visual. No delayed work survives a wipe/reload. */
export abstract class EncounterSupport {
    protected stopped = false;
    protected tickNow: number;
    private lastProcessed: number;
    private pending: {
        at: number;
        run: () => void;
    }[] = [];
    private graphics: {
        tile: Tile;
        spotId: number;
        expires: number;
    }[] = [];
    private locs = new Map<string, Tile>();
    readonly evaluator: CombatHitEvaluator;
    constructor(readonly npcs: readonly NpcState[], readonly instanceId: string, readonly room: FoundationRoom, protected readonly services: ScriptServices, readonly rng = new EncounterRandom(Math.floor(Math.random() * 0x100000000))) {
        this.tickNow = services.system.getCurrentTick();
        this.lastProcessed = this.tickNow;
        this.evaluator = new CombatHitEvaluator({ resolveEntity: ref => ref.type === "npc" ? this.npcs.find(n => n.id === ref.id) : this.members().find(p => p.id === ref.id),
            getEquipmentBonuses: p => services.equipment.computeEquipmentStatBonuses?.(p) ?? [], random: () => rng.next() });
        for (const n of npcs) {
            n.scriptedMovement = true;
            n.suppressDefenceAnimation = true;
            services.npc.disengageCombat(n);
        }
    }
    members(): PlayerState[] { return this.services.instances.getMemberPlayers(this.instanceId).filter(p => p.worldViewId === this.npcs[0].worldViewId && p.level === this.room.inside.level && hp(p) > 0 && this.inBounds(tileOf(p))); }
    protected inBounds(t: Tile, size = 1): boolean { const b = this.room.bounds; return t.x >= b.minX && t.y >= b.minY && t.x + size - 1 <= b.maxX && t.y + size - 1 <= b.maxY; }
    protected roll(min: number, max: number): number { return min + this.rng.nextInt(max - min + 1); }
    protected later(ticks: number, run: () => void): void { this.pending.push({ at: this.tickNow + ticks, run }); }
    protected update(tick: number): boolean {
        if (this.stopped || tick <= this.lastProcessed)
            return false;
        this.lastProcessed = this.tickNow = tick;
        this.graphics = this.graphics.filter(v => v.expires > tick);
        const due = this.pending.filter(p => p.at <= tick);
        this.pending = this.pending.filter(p => p.at > tick);
        for (const p of due)
            if (!this.stopped)
                p.run();
        return !this.stopped;
    }
    protected target(n: NpcState): PlayerState | undefined {
        const members = this.members(), target = n.combatAttributes.get(CombatAttributes.COMBAT_TARGET);
        return members.find(p => target?.type === "player" && p.id === target.id) ?? members.sort((a, b) => bodyDistance(n, a) - bodyDistance(n, b) || a.id - b.id)[0];
    }
    protected message(text: string): void { for (const p of this.members())
        this.services.messaging.sendGameMessage(p, text); }
    protected animate(n: NpcState, role: string, fallback: number): void {
        const data = require(serverGeneratedDataPath("npc-combat-defs.json")) as {
            npcs?: Record<string, {
                anims?: NpcCombatAnimationData;
            }>;
        };
        const a = data.npcs?.[String(n.typeId)]?.anims;
        const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
        const named = Object.entries(a?.namedSpecials ?? {}).find(([k]) => normalize(k) === normalize(role))?.[1];
        const standard = role === "melee" ? a?.melee : role === "ranged" ? a?.ranged : role === "magic" ? a?.magic : role === "attack" ? a?.attack : undefined;
        this.services.npc.queueNpcSeq(n, normalizeNpcAnimationPool(named ?? standard)[0] ?? fallback);
    }
    protected hit(n: NpcState, p: PlayerState, damage: number): number {
        if (!this.members().includes(p))
            return 0;
        return this.services.combat.applyNpcDamageToPlayer(n, p, HITMARK_DAMAGE, damage, this.tickNow).amount;
    }
    protected heal(n: NpcState, amount: number): void { if (n.getHitpoints() > 0)
        this.services.combat.applyNpcHitsplat(n, HITMARK_HEAL, amount, this.tickNow); }
    protected evaluate(n: NpcState, p: PlayerState, type: AttackType, max: number) {
        return this.evaluator.evaluate({ attacker: { type: "npc", id: n.id }, target: { type: "player", id: p.id }, attackClock: this.tickNow,
            traits: { type, style: null, rangeTiles: 20, speedTicks: 6, maxHitOverride: max, effects: { ignoreProtectionPrayer: true } } });
    }
    protected standardHit(n: NpcState, p: PlayerState, type: AttackType, max: number, protectedMultiplier: number, delay = 1): void {
        const result = this.evaluate(n, p, type, max);
        const protectedFrom = p.prayer.hasPrayerActive(type === "melee" ? "protect_from_melee" : type === "ranged" ? "protect_from_missiles" : "protect_from_magic");
        const damage = Math.floor(result.damage * (protectedFrom ? protectedMultiplier : 1));
        this.later(delay, () => this.hit(n, p, damage));
    }
    protected graphic(tile: Tile, spotId: number, durationTicks = 3): void {
        this.services.animation.playLocGraphic({ tile, spotId, durationTicks, level: this.room.inside.level, worldViewId: this.npcs[0].worldViewId });
        if (durationTicks > 0)
            this.graphics.push({ tile, spotId, expires: this.tickNow + durationTicks });
    }
    protected projectile(n: NpcState, tile: Tile, id: number, delay = 2, p?: PlayerState): void {
        this.services.projectiles.launch({ projectileId: id, worldViewId: n.worldViewId,
            source: { tileX: n.tileX + Math.floor(n.size / 2), tileY: n.tileY + Math.floor(n.size / 2), plane: n.level, actor: { kind: "npc", serverId: n.id } },
            target: { tileX: tile.x, tileY: tile.y, plane: n.level, ...(p ? { actor: { kind: "player" as const, serverId: p.id } } : {}) },
            sourceHeight: 80, endHeight: p ? 30 : 0, slope: 24, startPos: 0, startCycleOffset: 0,
            endCycleOffset: delay * Math.round((this.services.system.getTickDurationMs?.() ?? 600) / 20) });
    }
    protected loc(tile: Tile, id: number): void {
        this.services.location.replaceTemporaryLoc({ worldViewId: this.npcs[0].worldViewId }, 0, id, tile, this.room.inside.level, { newShape: 10, newRotation: 0 });
        this.locs.set(key(tile), tile);
    }
    protected clearLoc(tile: Tile): void {
        this.services.location.clearTemporaryLoc({ worldViewId: this.npcs[0].worldViewId }, 0, tile, this.room.inside.level);
        this.locs.delete(key(tile));
    }
    protected clearVisuals(): void {
        for (const v of this.graphics)
            this.graphic(v.tile, v.spotId, 0);
        this.graphics = [];
        for (const t of this.locs.values())
            this.clearLoc(t);
    }
    protected stepAllowed(from: Tile, to: Tile, size = 1): boolean {
        return this.inBounds(to, size) && this.services.movement.getPathService()?.canActorStep({ ...from, plane: this.room.inside.level }, to, size, this.npcs[0].worldViewId) === true;
    }
    protected pursue(n: NpcState, p: PlayerState): void {
        if (bodyDistance(n, p) <= 1 || n.hasPath() || n.isFrozen(this.tickNow))
            return;
        const path = this.services.movement.getPathService();
        if (!path)
            return;
        const strategy = new CardinalAdjacentRouteStrategy(p.tileX, p.tileY, 1, 1);
        strategy.setCollisionGetter((x, y, l) => path.getCollisionFlagAt(x, y, l, n.worldViewId), n.level);
        const route = path.findPathSteps({ from: { x: n.tileX, y: n.tileY, plane: n.level }, to: tileOf(p), size: n.size, worldViewId: n.worldViewId }, { routeStrategy: strategy, maxSteps: 64 });
        if (route.ok && route.steps?.length)
            n.setPath(route.steps.filter(t => this.inBounds(t, n.size)), false);
    }
    protected push(n: NpcState, p: PlayerState, tiles = 3): void {
        const from = tileOf(p);
        let to = from;
        const dx = p.tileX - (n.tileX + (n.size - 1) / 2), dy = p.tileY - (n.tileY + (n.size - 1) / 2);
        const step = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
        for (let i = 0; i < tiles; i++) {
            const next = { x: to.x + step.x, y: to.y + step.y };
            if (!this.stepAllowed(to, next))
                break;
            to = next;
        }
        if (distance(from, to) > 0) {
            p.clearPath();
            // Forced movement is a visual packet, not a server position update.
            this.services.movement.teleportPlayer(p, to.x, to.y, p.level);
            this.services.movement.queueForcedMovement(p, { startTile: from, endTile: to, startTick: this.tickNow, endTick: this.tickNow + 1 });
        }
    }
    abstract tick(tick: number): void;
    dispose(): void { if (this.stopped)
        return; this.stopped = true; this.pending = []; this.clearVisuals(); for (const n of this.npcs)
        n.clearPath(); }
}
