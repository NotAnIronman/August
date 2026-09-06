import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { normalizeNpcAnimationPool, type NpcCombatAnimationData } from "@server/game/npc/NpcCombatAnimationData";
import { serverGeneratedDataPath } from "@server/paths";
import { raidAccount, raidHitpoints } from "./MaidenEncounter";

type Tile = { x: number; y: number };
export const BLOAT_ASSETS = { flies: 1568, spread: 1569, hands: [1570, 1571, 1572, 1573], stunned: 1575, blood: 1576 } as const;
export const BLOAT_TIMING = { down: 32, stomp: 30, turnCooldown: 32, turnGrace: 5,
    handDelay: 4, handStun: 5, handCount: 16 } as const;
export const bloatFloor = (t: Tile): boolean => t.x >= 3288 && t.x <= 3303 && t.y >= 4440 && t.y <= 4455 &&
    !(t.x >= 3293 && t.x <= 3298 && t.y >= 4445 && t.y <= 4450);
/** SW anchors of the 5x5 footprint: cardinal steps, including at corners. */
export const BLOAT_ROUTE: readonly Tile[] = [
    ...Array.from({ length: 11 }, (_, i) => ({ x: 3288 + i, y: 4440 })),
    ...Array.from({ length: 11 }, (_, i) => ({ x: 3299, y: 4440 + i })),
    ...Array.from({ length: 11 }, (_, i) => ({ x: 3299 - i, y: 4451 })),
    ...Array.from({ length: 11 }, (_, i) => ({ x: 3288, y: 4451 - i })),
];
export function bloatNearestEdge(b: { tileX: number; tileY: number; size: number }, p: Tile): Tile[] {
    const maxX = b.tileX + b.size - 1, maxY = b.tileY + b.size - 1;
    const dx = p.x - (b.tileX + maxX) / 2, dy = p.y - (b.tileY + maxY) / 2;
    return Array.from({ length: b.size }, (_, i) => Math.abs(dx) >= Math.abs(dy)
        ? { x: dx >= 0 ? maxX : b.tileX, y: b.tileY + i }
        : { x: b.tileX + i, y: dy >= 0 ? maxY : b.tileY });
}
type Hand = Tile & { at: number; spotId: number };
type Hit = { at: number; player: PlayerState; damage: number; stomp: boolean };

/** One private-room attempt. No ordinary retaliation, pursuit, or unscoped hazards. */
export class BloatEncounter {
    readonly participants = new Set<PlayerState>();
    phase: "active" | "down" = "active";
    private stopped = false;
    private lastTick: number;
    private phaseAt: number;
    private walkDuration: number;
    private direction: number;
    private turnCooldown: number = BLOAT_TIMING.turnCooldown;
    private lastTurn = -Infinity;
    private lowHpRunning = false;
    private attackedDown = false;
    private nextHands: number;
    private hands: Hand[] = [];
    private previousHands = new Set<string>();
    private pending: Hit[] = [];
    private visuals: { tile: Tile; spotId: number; expires: number }[] = [];
    private readonly previousHit: NpcState["onPlayerHit"];
    private readonly hitHook: NonNullable<NpcState["onPlayerHit"]>;
    private readonly previousMultiplier: number;
    constructor(readonly boss: NpcState, readonly instanceId: string, readonly roster: readonly string[],
        private readonly services: ScriptServices, private readonly onWipe: () => void,
        readonly rng = new EncounterRandom(Math.floor(Math.random() * 0x100000000))) {
        this.lastTick = this.phaseAt = services.system.getCurrentTick();
        this.walkDuration = 38 + rng.nextInt(9);
        this.direction = rng.nextInt(2) ? 1 : -1;
        this.nextHands = this.phaseAt + 6;
        this.previousMultiplier = boss.incomingPlayerDamageMultiplier;
        this.previousHit = boss.onPlayerHit;
        this.hitHook = (p, damage, style, tick) => {
            this.previousHit?.(p, damage, style, tick);
            if (this.stopped) return;
            if (this.phase === "down") this.attackedDown = true;
            if (boss.getHitpoints() < boss.getMaxHitpoints() * 0.4) this.lowHpRunning = !this.lowHpRunning;
        };
        boss.onPlayerHit = this.hitHook;
        boss.scriptedMovement = true;
        boss.suppressDefenceAnimation = true;
        boss.incomingPlayerDamageMultiplier = this.previousMultiplier * 0.5;
        services.npc.disengageCombat(boss);
    }
    admit(p: PlayerState): void { if (this.roster.includes(raidAccount(p))) this.participants.add(p); }
    private members(): PlayerState[] {
        return this.services.instances.getMemberPlayers(this.instanceId).filter(p => this.participants.has(p) &&
            this.roster.includes(raidAccount(p)) && p.worldViewId === this.boss.worldViewId && p.level === this.boss.level &&
            bloatFloor({ x: p.tileX, y: p.tileY }) && raidHitpoints(p) > 0);
    }
    private clearRay(from: Tile, to: Tile): boolean {
        return this.services.movement.getPathService()?.projectileRaycast({ ...from, plane: this.boss.level }, to, this.boss.worldViewId).clear === true;
    }
    private sees(p: PlayerState): boolean {
        const tile = { x: p.tileX, y: p.tileY };
        return bloatNearestEdge(this.boss, tile).some(edge => this.clearRay(edge, tile));
    }
    private graphic(tile: Tile, spotId: number, durationTicks = 6): void {
        this.services.animation.playLocGraphic({ tile, spotId, durationTicks, level: this.boss.level, worldViewId: this.boss.worldViewId });
        if (durationTicks > 0) this.visuals.push({ tile, spotId, expires: this.lastTick + durationTicks });
    }
    private shutdownAnimation(): void {
        const data = require(serverGeneratedDataPath("npc-combat-defs.json")) as { npcs?: Record<string, { anims?: NpcCombatAnimationData }> };
        const a = data.npcs?.["8359"]?.anims;
        const role = Object.entries(a?.namedSpecials ?? {}).find(([key]) => key.toLowerCase().replace(/[\s_-]/g, "") === "shutdown")?.[1];
        this.services.npc.queueNpcSeq(this.boss, normalizeNpcAnimationPool(role)[0] ?? a?.specials?.[0] ?? 8082);
    }
    private move(): void {
        const b = this.boss;
        const index = BLOAT_ROUTE.findIndex(t => t.x === b.tileX && t.y === b.tileY);
        if (index < 0) return; // Never path across the tank to repair an unexpected position.
        const fraction = b.getHitpoints() / b.getMaxHitpoints();
        const run = fraction <= 0.6 && (fraction >= 0.4 || this.lowHpRunning);
        const steps = Array.from({ length: run ? 2 : 1 }, (_, i) => BLOAT_ROUTE[(index + this.direction * (i + 1) + BLOAT_ROUTE.length) % BLOAT_ROUTE.length]);
        b.setPath(steps, run);
    }
    private flies(players: PlayerState[], tick: number): void {
        const direct = players.filter(p => this.sees(p));
        // One-hop spread only, with one hit per player even when several sources see them.
        for (const p of players) {
            const isDirect = direct.includes(p);
            if (!isDirect && !direct.some(source => this.clearRay({ x: source.tileX, y: source.tileY }, { x: p.tileX, y: p.tileY }))) continue;
            this.services.animation.broadcastPlayerSpot(p, isDirect ? BLOAT_ASSETS.flies : BLOAT_ASSETS.spread);
            const roll = 10 + this.rng.nextInt(11);
            const damage = p.prayer.hasPrayerActive("protect_from_missiles") ? Math.floor(roll * 0.75) : roll;
            this.queueHit(p, damage, tick + 1);
        }
    }
    private queueHit(player: PlayerState, damage: number, at: number, stomp = false): void {
        // Snapshot HP on launch, allowing food eaten before impact to save the player.
        this.pending.push({ player, damage: Math.min(damage, raidHitpoints(player)), at, stomp });
    }
    private spawnHands(tick: number): void {
        const candidates: Tile[] = [];
        for (let x = 3288; x <= 3303; x++) for (let y = 4440; y <= 4455; y++)
            if (bloatFloor({ x, y }) && !this.previousHands.has(`${x}:${y}`)) candidates.push({ x, y });
        this.previousHands.clear();
        for (let i = 0; i < BLOAT_TIMING.handCount && candidates.length; i++) {
            const tile = candidates.splice(this.rng.nextInt(candidates.length), 1)[0];
            const spotId = BLOAT_ASSETS.hands[this.rng.nextInt(BLOAT_ASSETS.hands.length)];
            this.previousHands.add(`${tile.x}:${tile.y}`);
            this.hands.push({ ...tile, spotId, at: tick + BLOAT_TIMING.handDelay });
            // Native falling-flesh animation includes the approaching shadow.
            this.graphic(tile, spotId);
        }
    }
    tick(tick: number): void {
        if (this.stopped || tick <= this.lastTick) return;
        this.lastTick = tick;
        this.visuals = this.visuals.filter(v => v.expires > tick);
        if (this.boss.getHitpoints() <= 0 || this.services.combat.getNpc(this.boss.id) !== this.boss) { this.dispose(); return; }
        const players = this.members();
        if (!players.length) { this.dispose(); this.onWipe(); return; }
        const due = this.pending.filter(h => h.at <= tick);
        this.pending = this.pending.filter(h => h.at > tick);
        for (const h of due) if (this.members().includes(h.player) && (!h.stomp || this.sees(h.player)))
            this.services.combat.applyNpcDamageToPlayer(this.boss, h.player, HITMARK_DAMAGE, h.damage, tick);
        const landed = this.hands.filter(h => h.at <= tick);
        this.hands = this.hands.filter(h => h.at > tick);
        for (const h of landed) {
            this.graphic(h, BLOAT_ASSETS.blood, 1);
            for (const p of this.members()) if (p.tileX === h.x && p.tileY === h.y) {
                const hit = this.services.combat.applyNpcDamageToPlayer(this.boss, p, HITMARK_DAMAGE, 30 + this.rng.nextInt(21), tick);
                if (hit.amount > 0) {
                    this.services.combat.stunPlayer(p, BLOAT_TIMING.handStun);
                    this.services.animation.broadcastPlayerSpot(p, BLOAT_ASSETS.stunned);
                }
            }
        }
        if (this.phase === "down") {
            const elapsed = tick - this.phaseAt;
            if (elapsed === BLOAT_TIMING.stomp - 1) for (const p of this.members())
                this.queueHit(p, 40 + this.rng.nextInt(41), tick + 1, true);
            if (elapsed === BLOAT_TIMING.stomp) this.boss.restoreCombatStat("defence");
            if (elapsed < BLOAT_TIMING.down) return;
            this.phase = "active"; this.phaseAt = tick;
            this.walkDuration = 34 + this.rng.nextInt(9) + (this.attackedDown ? 0 : 4);
            this.boss.incomingPlayerDamageMultiplier = this.previousMultiplier * 0.5;
            this.services.npc.queueNpcSeq(this.boss, -1);
        }
        let nextCooldown = Math.max(0, this.turnCooldown - 1);
        if (nextCooldown === 0 && this.rng.nextInt(20) === 0) {
            this.direction *= -1; nextCooldown = BLOAT_TIMING.turnCooldown; this.lastTurn = tick;
        }
        if (tick - this.phaseAt >= this.walkDuration && tick - this.lastTurn >= BLOAT_TIMING.turnGrace) {
            this.phase = "down"; this.phaseAt = tick; this.attackedDown = false;
            this.boss.clearPath(); this.boss.incomingPlayerDamageMultiplier = this.previousMultiplier;
            this.shutdownAnimation(); return;
        }
        // Count the wake-up movement tick, but not the tick that enters shutdown.
        this.turnCooldown = nextCooldown;
        this.move();
        this.flies(this.members(), tick);
        if (tick >= this.nextHands && this.boss.getHitpoints() < this.boss.getMaxHitpoints() * 0.9) {
            this.spawnHands(tick);
            this.nextHands = tick + (this.boss.getHitpoints() < this.boss.getMaxHitpoints() * 0.6 ? 4 : 6);
        }
    }
    dispose(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.boss.clearPath();
        this.boss.incomingPlayerDamageMultiplier = this.previousMultiplier;
        if (this.boss.onPlayerHit === this.hitHook) this.boss.onPlayerHit = this.previousHit;
        for (const v of this.visuals) this.graphic(v.tile, v.spotId, 0);
        this.visuals = [];
        this.hands = []; this.pending = []; this.participants.clear();
    }
}
