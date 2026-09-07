import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import type { AttackType } from "@server/game/combat/AttackType";
import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { CombatHitEvaluator } from "@server/game/combat/engine/CombatHitEvaluator";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import { CardinalAdjacentRouteStrategy } from "@server/pathfinding/engine/RouteStrategy";
import { theatreHitpoints } from "@server/data/theatreCombatStats";
import { raidAccount, raidHitpoints, maidenDistance } from "./MaidenEncounter";
import { THEATRE_ARENAS } from "./arenas";
export const NYLO_STYLES: readonly AttackType[] = ["melee", "ranged", "magic"];
export const NYLO_IDS = [8342, 8343, 8344, 8345, 8346, 8347, 8355, 8356, 8357];
export const NYLO_LANES = [[{ x: 3311, y: 4249 }, { x: 3311, y: 4248 }],
    [{ x: 3296, y: 4233 }, { x: 3295, y: 4233 }], [{ x: 3280, y: 4248 }, { x: 3280, y: 4249 }]] as const;
export const NYLO_TIMING = { wave: 8, lifetime: 50, cap: 15, morph: 10, attack: 4 } as const;
type Tile = {
    x: number;
    y: number;
};
interface Add {
    npc: NpcState;
    style: AttackType;
    large: boolean;
    expires: number;
    attack: number;
    entered: boolean;
    blocked: Set<string>;
}
interface Spawn {
    tile: Tile;
    style: AttackType;
    large: boolean;
    split?: boolean;
}
export function nyloWaveCount(size: number): number { return 5 * Math.max(1, Math.min(5, size)); }
export function nyloHealth(large: boolean, size: number): number { return theatreHitpoints(large ? 22 : 11, size); }
export function insideNylo(t: Tile): boolean { return t.x >= 3290 && t.x <= 3301 && t.y >= 4243 && t.y <= 4254; }
export function nyloTunnelStep(from: Tile, to: Tile): boolean {
    if (Math.abs(from.x - to.x) + Math.abs(from.y - to.y) !== 1)
        return false;
    if (from.y === 4248 || from.y === 4249) {
        if (from.y !== to.y)
            return false;
        if (from.x >= 3301 && from.x <= 3311)
            return to.x === from.x - 1;
        if (from.x >= 3280 && from.x < 3290)
            return to.x === from.x + 1;
    }
    return (from.x === 3295 || from.x === 3296) && to.x === from.x && from.y >= 4233 && from.y < 4243 && to.y === from.y + 1;
}
/** A room attempt owns all adds, style locks, delayed hits and wave scheduling. */
export class NyloEncounter {
    readonly participants = new Set<PlayerState>();
    readonly adds = new Map<number, Add>();
    bossActive = false;
    waves = 0;
    bossStyle: AttackType = "melee";
    private pendingSpawns: Spawn[] = [];
    private pendingHits: {
        at: number;
        run: () => void;
    }[] = [];
    private nextWave: number;
    private nextMorph = Infinity;
    private nextAttack = Infinity;
    private lastTick: number;
    private stopped = false;
    private readonly evaluator: CombatHitEvaluator;
    constructor(public boss: NpcState, readonly instanceId: string, readonly roster: readonly string[], private readonly services: ScriptServices, private readonly onBoss: (npc: NpcState) => void, readonly rng = new EncounterRandom(Math.floor(Math.random() * 0x100000000))) {
        this.lastTick = services.system.getCurrentTick();
        this.nextWave = this.lastTick + 2;
        this.evaluator = new CombatHitEvaluator({ resolveEntity: r => r.type === "npc" ? (this.adds.get(r.id)?.npc ?? (this.bossActive && r.id === this.boss.id ? this.boss : undefined)) : this.members().find(p => p.id === r.id),
            getEquipmentBonuses: p => services.equipment.computeEquipmentStatBonuses?.(p) ?? [], random: () => rng.next() });
    }
    admit(p: PlayerState): void { if (this.roster.includes(raidAccount(p)))
        this.participants.add(p); }
    members(): PlayerState[] {
        return this.services.instances.getMemberPlayers(this.instanceId).filter(p => this.participants.has(p) && !p.raidProgress.spectating && p.worldViewId === this.boss.worldViewId && p.level === 0 && raidHitpoints(p) > 0 &&
            insideNylo({ x: p.tileX, y: p.tileY }));
    }
    owns(n: NpcState): boolean { return this.boss === n || this.adds.get(n.id)?.npc === n; }
    private spawn(spec: Spawn, tick: number): boolean {
        const typeId = 8342 + NYLO_STYLES.indexOf(spec.style) + (spec.large ? 3 : 0);
        const npc = this.services.npc.spawnNpc({ id: typeId, x: spec.tile.x, y: spec.tile.y, level: 0, worldViewId: this.boss.worldViewId,
            isAggressive: false, isImmovable: false, respawns: false, wanderRadius: 0, combatLeashRadius: 64, retreatInteractionRange: 64, immunities: { poison: true, venom: true } });
        if (!npc)
            return false;
        if (!this.services.instances.attachNpc(this.instanceId, npc)) {
            this.services.npc.removeNpc(npc.id);
            return false;
        }
        npc.configureHitpoints(nyloHealth(spec.large, this.roster.length));
        npc.suppressDrops = true;
        npc.scriptedMovement = true;
        npc.suppressDefenceAnimation = true;
        if (!spec.split)
            npc.scriptedCollisionStep = nyloTunnelStep;
        const add: Add = { npc, style: spec.style, large: spec.large, expires: tick + NYLO_TIMING.lifetime, attack: tick + 4, entered: !!spec.split, blocked: new Set() };
        npc.filterPlayerDamage = (p, damage, type) => {
            if (!this.members().includes(p))
                return 0;
            const name = raidAccount(p);
            if (type !== add.style && !add.blocked.has(name)) {
                add.blocked.add(name);
                this.services.messaging.sendGameMessage(p, "That Nylocas rejects your attack. You can no longer damage this spider.");
            }
            return add.blocked.has(name) ? 0 : damage;
        };
        this.adds.set(npc.id, add);
        return true;
    }
    private wave(): void {
        // Five waves per roster member. Three lanes per wave; every third wave
        // substitutes one large spider. Split children take priority over waves.
        const wave = this.waves++;
        for (let lane = 0; lane < 3; lane++)
            this.pendingSpawns.push({ tile: { ...NYLO_LANES[lane][wave % 2] },
                style: NYLO_STYLES[(wave + lane) % 3], large: wave % 3 === 2 && lane === Math.floor(wave / 3) % 3 });
    }
    private graphic(n: NpcState, id: number): void {
        this.services.animation.playLocGraphic({ spotId: id, tile: { x: n.tileX, y: n.tileY }, level: 0, worldViewId: n.worldViewId, durationTicks: 3 });
    }
    private remove(add: Add, explode: boolean, tick: number): void {
        this.adds.delete(add.npc.id);
        add.npc.filterPlayerDamage = undefined;
        add.npc.scriptedCollisionStep = undefined;
        this.graphic(add.npc, (explode ? 1565 : 1562) + NYLO_STYLES.indexOf(add.style));
        if (explode) {
            for (const p of this.members())
                if (maidenDistance(add.npc, p) <= 1)
                    this.services.combat.applyNpcDamageToPlayer(add.npc, p, HITMARK_DAMAGE, this.rng.nextInt((add.large ? 21 : 18) + 1), tick);
        }
        else if (add.large) {
            for (let i = 0; i < 2; i++)
                this.pendingSpawns.unshift({ tile: { x: add.npc.tileX, y: add.npc.tileY }, style: NYLO_STYLES[this.rng.nextInt(3)], large: false, split: true });
        }
        if (this.services.combat.getNpc(add.npc.id) === add.npc)
            this.services.npc.removeNpc(add.npc.id);
    }
    killed(n: NpcState): void { const add = this.adds.get(n.id); if (add?.npc === n)
        this.remove(add, false, this.services.system.getCurrentTick()); }
    private move(n: NpcState, target: Tile, size = 1): void {
        if (n.isFrozen(this.lastTick) || n.hasPath())
            return;
        const path = this.services.movement.getPathService();
        if (!path)
            return;
        const strategy = new CardinalAdjacentRouteStrategy(target.x, target.y, size, size);
        strategy.setCollisionGetter((x, y, l) => path.getCollisionFlagAt(x, y, l, n.worldViewId), n.level);
        const route = path.findPathSteps({ from: { x: n.tileX, y: n.tileY, plane: n.level }, to: target, size: n.size, worldViewId: n.worldViewId }, { routeStrategy: strategy, maxSteps: 96 });
        if (route.ok && route.steps?.length)
            n.setPath(route.steps, false);
    }
    private hit(n: NpcState, p: PlayerState, style: AttackType, max: number, boss: boolean, tick: number): void {
        const result = this.evaluator.evaluate({ attacker: { type: "npc", id: n.id }, target: { type: "player", id: p.id }, attackClock: tick,
            traits: { type: style, style: null, rangeTiles: 16, speedTicks: 4, maxHitOverride: max, effects: { ignoreProtectionPrayer: true } } });
        const protectedFrom = p.prayer.hasPrayerActive(style === "melee" ? "protect_from_melee" : style === "ranged" ? "protect_from_missiles" : "protect_from_magic");
        const damage = protectedFrom ? (boss && style !== "melee" ? Math.floor(result.damage / 4) : 0) : result.damage;
        this.services.npc.queueNpcSeq(n, style === "melee" ? 8004 : style === "ranged" ? 7999 : 7989);
        const delay = style === "melee" ? 0 : 2;
        if (style !== "melee")
            this.services.projectiles.launch({ projectileId: style === "ranged" ? (boss ? 1561 : 1559) : 130, worldViewId: n.worldViewId,
                source: { tileX: n.tileX, tileY: n.tileY, plane: 0, actor: { kind: "npc", serverId: n.id } },
                target: { tileX: p.tileX, tileY: p.tileY, plane: 0, actor: { kind: "player", serverId: p.id } },
                sourceHeight: 70, endHeight: 30, slope: 0, startPos: 0, startCycleOffset: 0, endCycleOffset: 60 });
        const apply = () => { if (!this.stopped && this.members().includes(p))
            this.services.combat.applyNpcDamageToPlayer(n, p, HITMARK_DAMAGE, damage, tick + delay); };
        if (delay)
            this.pendingHits.push({ at: tick + delay, run: apply });
        else
            apply();
    }
    private summonBoss(tick: number): void {
        const marker = THEATRE_ARENAS.nylo.boss;
        const n = this.services.npc.spawnNpc({ ...marker, level: 0, worldViewId: this.boss.worldViewId, isAggressive: false, isImmovable: false,
            respawns: false, wanderRadius: 0, combatLeashRadius: 64, retreatInteractionRange: 64, immunities: { poison: true, venom: true } });
        if (!n)
            return;
        if (!this.services.instances.attachNpc(this.instanceId, n)) {
            this.services.npc.removeNpc(n.id);
            return;
        }
        this.boss = n;
        n.configureHitpoints(theatreHitpoints(2500, this.roster.length));
        n.suppressDrops = true;
        n.scriptedMovement = true;
        n.suppressDefenceAnimation = true;
        n.filterPlayerDamage = (p, damage, type) => this.members().includes(p) && type === this.bossStyle ? damage : 0;
        this.bossActive = true;
        this.bossStyle = "melee";
        this.nextMorph = tick + 10;
        this.nextAttack = tick + 4;
        this.onBoss(n);
        for (const p of this.members())
            this.services.messaging.sendGameMessage(p, "Nylocas Vasilias descends! Match its colour with your weapon and protection prayer.");
    }
    tick(tick: number): void {
        if (this.stopped || tick <= this.lastTick)
            return;
        this.lastTick = tick;
        const players = this.members();
        const due = this.pendingHits.filter(h => h.at <= tick);
        this.pendingHits = this.pendingHits.filter(h => h.at > tick);
        for (const h of due)
            h.run();
        if (this.bossActive) {
            if (this.boss.getHitpoints() <= 0)
                return;
            if (tick >= this.nextMorph) {
                const alternatives = NYLO_STYLES.filter(s => s !== this.bossStyle);
                this.bossStyle = alternatives[this.rng.nextInt(2)];
                this.boss.presentationTypeId = this.bossStyle === "melee" ? 8355 : this.bossStyle === "magic" ? 8356 : 8357;
                this.boss.clearPath();
                this.nextMorph = tick + 10;
                for (const p of players)
                    if (p.getCombatTarget()?.type === "npc" && p.getCombatTarget()?.id === this.boss.id)
                        this.services.movement.clearPlayerTarget(p);
            }
            const p = players.sort((a, b) => maidenDistance(this.boss, a) - maidenDistance(this.boss, b))[0];
            if (!p)
                return;
            if (this.bossStyle === "melee" && maidenDistance(this.boss, p) > 1) {
                this.move(this.boss, { x: p.tileX, y: p.tileY });
                return;
            }
            if (tick >= this.nextAttack) {
                this.hit(this.boss, p, this.bossStyle, 70, true, tick);
                this.nextAttack = tick + 4;
            }
            return;
        }
        for (const add of [...this.adds.values()]) {
            const n = add.npc;
            if (n.getHitpoints() <= 0 || this.services.combat.getNpc(n.id) !== n) {
                this.remove(add, false, tick);
                continue;
            }
            if (tick >= add.expires) {
                this.remove(add, true, tick);
                continue;
            }
            if (!add.entered && insideNylo({ x: n.tileX, y: n.tileY }) && insideNylo({ x: n.tileX + n.size - 1, y: n.tileY + n.size - 1 })) {
                add.entered = true;
                n.scriptedCollisionStep = undefined;
                n.clearPath();
            }
            if (!add.entered) {
                if (!n.isFrozen(tick) && !n.hasPath()) {
                    const to = n.tileX > 3300 ? { x: n.tileX - 1, y: n.tileY } : n.tileX < 3290 ? { x: n.tileX + 1, y: n.tileY } : { x: n.tileX, y: n.tileY + 1 };
                    if (nyloTunnelStep({ x: n.tileX, y: n.tileY }, to))
                        n.setPath([to], false);
                }
                continue;
            }
            const p = [...players].sort((a, b) => maidenDistance(n, a) - maidenDistance(n, b))[0];
            if (!p)
                continue;
            if (add.style === "melee" && maidenDistance(n, p) > 1) {
                this.move(n, { x: p.tileX, y: p.tileY });
                continue;
            }
            if (tick >= add.attack) {
                this.hit(n, p, add.style, add.large ? 24 : 17, false, tick);
                add.attack = tick + 3;
            }
        }
        if (!players.length)
            return;
        if (!this.pendingSpawns.length && this.waves < nyloWaveCount(this.roster.length) && tick >= this.nextWave && this.adds.size < NYLO_TIMING.cap) {
            this.wave();
            this.nextWave = tick + NYLO_TIMING.wave;
        }
        while (this.pendingSpawns.length && this.adds.size < NYLO_TIMING.cap) {
            if (!this.spawn(this.pendingSpawns[0], tick))
                break;
            this.pendingSpawns.shift();
        }
        if (this.waves === nyloWaveCount(this.roster.length) && !this.pendingSpawns.length && !this.adds.size)
            this.summonBoss(tick);
    }
    dispose(): void {
        if (this.stopped)
            return;
        this.stopped = true;
        this.pendingHits = [];
        this.pendingSpawns = [];
        for (const a of this.adds.values()) {
            a.npc.filterPlayerDamage = undefined;
            a.npc.scriptedCollisionStep = undefined;
            if (this.services.combat.getNpc(a.npc.id) === a.npc)
                this.services.npc.removeNpc(a.npc.id);
        }
        this.adds.clear();
        this.boss.filterPlayerDamage = undefined;
        this.boss.clearPath();
        this.participants.clear();
    }
}
