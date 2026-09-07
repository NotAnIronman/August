import { THEATRE_MAZE_MARKER } from "@august/custom-content/locs/TheatreSpotAnimTypeLoader";
import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { CombatHitEvaluator } from "@server/game/combat/engine/CombatHitEvaluator";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { normalizeNpcAnimationPool, type NpcCombatAnimationData } from "@server/game/npc/NpcCombatAnimationData";
import type { ScriptServices } from "@server/game/scripts/types";
import { serverGeneratedDataPath } from "@server/paths";
import { maidenDistance, raidAccount, raidHitpoints } from "./MaidenEncounter";
type Tile = {
    x: number;
    y: number;
};
type Pending = {
    at: number;
    run: () => void;
};
export const SOTETSEG_ASSETS = { magic: 1606, ranged: 1607, shared: 1604, impact: 1605, zap: 1603,
    tornado: 8389, floor: 33034, path: 33036, portal: 33037 } as const;
// Verified against all 210 native floor decorations, not the room's padded bounds.
export const SOTETSEG_GRID = { minX: 3273, maxX: 3286, minY: 4310, maxY: 4324 } as const;
export const SOTETSEG_TIMING = { attack: 5, magicTravel: 3, bounceTravel: 2, sharedTravel: 6,
    prayerLock: 5, shadowDrain: 7, tornadoGrace: 0 } as const;
const protections = new Set(["protect_from_melee", "protect_from_magic", "protect_from_missiles"]);
const key = (t: Tile) => `${t.x},${t.y}`;
const tile = (p: PlayerState): Tile => ({ x: p.tileX, y: p.tileY });
const distance = (a: Tile, b: Tile) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const inSotetsegGrid = (t: Tile) => t.x >= 3273 && t.x <= 3286 && t.y >= 4310 && t.y <= 4324;
export const sotetsegTileDamage = (hp: number) => Math.floor(hp / 15) + 15;
/** Normal solo is 70. Group damage is quadratically shared in the target's 3x3. */
export const sotetsegSharedDamage = (living: number, soakers: number) => Math.floor(70 * Math.max(1, living) / Math.max(1, soakers) ** 2);
export function generateSotetsegPath(rng: EncounterRandom): Tile[] {
    const path: Tile[] = [];
    let x = 3275 + rng.nextInt(10);
    for (let y = 4310; y <= 4324; y++) {
        path.push({ x, y });
        if ((y - 4310) % 2 === 1) {
            const next = Math.max(3273, Math.min(3286, x + rng.nextInt(7) - 3));
            while (x !== next) {
                x += Math.sign(next - x);
                path.push({ x, y });
            }
        }
    }
    return path;
}
interface Maze {
    runner: PlayerState;
    path: Tile[];
    safe: Set<string>;
    finished: Set<PlayerState>;
    reachedLast: Set<PlayerState>;
    nextDrain: number;
    tornado?: NpcState;
    tornadoIndex: number;
    tornadoStarts: number;
}
/** All clocks, private views and effects belong to one attempt in one private room. */
export class SotetsegEncounter {
    readonly participants = new Set<PlayerState>();
    maze?: Maze;
    phase = 0;
    magicAttacks = 0;
    private pending: Pending[] = [];
    private nextAttack: number;
    private stopped = false;
    private lastTick = -1;
    private readonly visibilityKey: string;
    private readonly viewers = new Set<PlayerState>();
    private readonly evaluator: CombatHitEvaluator;
    constructor(readonly boss: NpcState, readonly instanceId: string, readonly roster: readonly string[], private readonly services: ScriptServices, private readonly onWipe: () => void, readonly rng = new EncounterRandom(Math.floor(Math.random() * 0x100000000))) {
        this.visibilityKey = `sotetseg:${instanceId}:${boss.id}`;
        this.evaluator = new CombatHitEvaluator({ resolveEntity: r => r.type === "npc" ? (r.id === boss.id ? boss : undefined) : this.members().find(p => p.id === r.id),
            getEquipmentBonuses: p => services.equipment?.computeEquipmentStatBonuses?.(p) ?? [], random: () => rng.next() });
        this.nextAttack = services.system.getCurrentTick() + 5;
        boss.suppressDefenceAnimation = true;
        boss.filterPlayerDamage = (p, damage) => {
            if (this.stopped || this.maze || !this.members().includes(p))
                return 0;
            const threshold = this.threshold();
            return threshold === undefined ? damage : Math.min(damage, Math.max(0, boss.getHitpoints() - threshold));
        };
    }
    private threshold(): number | undefined {
        return this.phase < 2 ? Math.floor(this.boss.getMaxHitpoints() * (this.phase === 0 ? 2 / 3 : 1 / 3)) : undefined;
    }
    admit(p: PlayerState): void {
        if (!this.roster.includes(raidAccount(p)) || this.participants.has(p))
            return;
        this.participants.add(p);
        if (this.maze && !p.raidProgress.spectating) {
            p.encounterVisibility = { key: this.visibilityKey, group: "real" };
            this.viewers.add(p);
            this.move(p, { x: this.maze.path[0].x, y: 4309 });
            this.services.location.replaceTemporaryLoc({ worldViewId: this.boss.worldViewId, ownerPlayerId: p.id }, 0, 33037, { x: 3276, y: 4325 }, this.boss.level, { newShape: 10 });
        }
    }
    private members(): PlayerState[] {
        return this.services.instances.getMemberPlayers(this.instanceId).filter(p => this.participants.has(p) &&
            !p.raidProgress.spectating && p.worldViewId === this.boss.worldViewId && p.level === this.boss.level &&
            raidHitpoints(p) > 0 && p.tileX >= 3272 && p.tileX <= 3287 && p.tileY >= 4308 && p.tileY <= 4331);
    }
    private message(p: PlayerState, text: string): void { this.services.messaging.sendGameMessage(p, text); }
    private animate(role: "melee" | "magic" | "maze"): void {
        const data = require(serverGeneratedDataPath("npc-combat-defs.json")) as {
            npcs?: Record<string, {
                anims?: NpcCombatAnimationData;
            }>;
        };
        const anim = data.npcs?.[String(this.boss.typeId)]?.anims;
        const named = Object.entries(anim?.namedSpecials ?? {}).find(([name]) => name.toLowerCase().replace(/[^a-z]/g, "") === role)?.[1];
        const seq = normalizeNpcAnimationPool(named ?? (role === "melee" ? anim?.melee : role === "magic" ? anim?.magic : undefined))[0];
        this.services.npc.queueNpcSeq(this.boss, seq ?? (role === "melee" ? 8138 : role === "magic" ? 8139 : 8136));
    }
    private move(p: PlayerState, to: Tile): void {
        this.services.movement.clearPlayerTarget(p);
        p.raidProgress.internally(() => this.services.movement.teleportPlayer(p, to.x, to.y, this.boss.level));
    }
    private damage(p: PlayerState, amount: number, tick: number): void {
        if (!this.stopped && this.members().includes(p))
            this.services.combat.applyNpcDamageToPlayer(this.boss, p, HITMARK_DAMAGE, Math.max(0, amount), tick);
    }
    private projectile(id: number, from: Tile, to: PlayerState, delay: number, source?: PlayerState): void {
        this.services.projectiles.launch({ projectileId: id, worldViewId: this.boss.worldViewId,
            source: { tileX: from.x, tileY: from.y, plane: this.boss.level, actor: source ? { kind: "player", serverId: source.id } : { kind: "npc", serverId: this.boss.id } },
            target: { tileX: to.tileX, tileY: to.tileY, plane: to.level, actor: { kind: "player", serverId: to.id } },
            sourceHeight: 80, endHeight: 30, slope: 0, startPos: 0, startCycleOffset: 0,
            endCycleOffset: delay * Math.round((this.services.system.getTickDurationMs?.() ?? 600) / 20) });
    }
    private orbHit(p: PlayerState, style: "magic" | "ranged", tick: number): void {
        if (!this.members().includes(p))
            return;
        const protectedFrom = p.prayer.hasPrayerActive(style === "magic" ? "protect_from_magic" : "protect_from_missiles");
        this.damage(p, protectedFrom ? 0 : this.rng.nextInt(51), tick);
        if (!protectedFrom) {
            p.prayer.lockProtectionPrayers(5);
            this.services.combat.applyPrayers(p, [...p.prayer.getActivePrayers()].filter(prayer => !protections.has(prayer)));
            this.services.combat.queueCombatState(p);
        }
    }
    private magic(target: PlayerState, tick: number): void {
        this.animate("magic");
        this.projectile(SOTETSEG_ASSETS.magic, { x: this.boss.tileX + 2, y: this.boss.tileY + 2 }, target, 3);
        this.magicAttacks++;
        this.pending.push({ at: tick + 3, run: () => {
                if (!this.members().includes(target))
                    return;
                const recipients = this.members().filter(p => p !== target).sort((a, b) => distance(tile(a), tile(target)) - distance(tile(b), tile(target))).slice(0, 2);
                this.orbHit(target, "magic", tick + 3);
                for (const [i, p] of recipients.entries()) {
                    const style = i === 0 ? "ranged" : "magic";
                    this.projectile(SOTETSEG_ASSETS[style], tile(target), p, 2, target);
                    this.pending.push({ at: tick + 5, run: () => this.orbHit(p, style, tick + 5) });
                }
            } });
    }
    private sharedBall(players: PlayerState[], tick: number): void {
        const target = players[this.rng.nextInt(players.length)];
        this.animate("magic");
        for (const p of players)
            this.message(p, `${target.name} has discovered a large ball of energy coming their way...`);
        this.projectile(SOTETSEG_ASSETS.shared, { x: this.boss.tileX + 2, y: this.boss.tileY + 2 }, target, 6);
        this.magicAttacks = 0;
        this.pending.push({ at: tick + 6, run: () => {
                const living = this.members();
                if (!living.includes(target))
                    return;
                const soakers = living.filter(p => distance(tile(p), tile(target)) <= 1);
                let amount = sotetsegSharedDamage(living.length, soakers.length);
                if (living.length >= 2 && soakers.length === 1)
                    amount = Math.max(121, amount, raidHitpoints(target));
                this.services.animation.playLocGraphic({ spotId: 1605, tile: tile(target), level: target.level, worldViewId: this.boss.worldViewId, durationTicks: 2 });
                for (const p of soakers)
                    this.damage(p, amount, tick + 6);
            } });
    }
    private runnerPath(p: PlayerState, show: boolean): void {
        if (!this.maze)
            return;
        const scope = { worldViewId: this.boss.worldViewId, ownerPlayerId: p.id };
        for (const t of this.maze.path) {
            if (show)
                this.services.location.replaceTemporaryLoc(scope, 33034, 33036, t, this.boss.level, { oldShape: 22, newShape: 22 });
            else
                this.services.location.clearTemporaryLoc(scope, 33034, t, this.boss.level, 22);
        }
    }
    private assignRunner(p: PlayerState, tick: number): void {
        const m = this.maze!;
        m.runner = p;
        m.nextDrain = tick + 7;
        for (const member of this.services.instances.getMemberPlayers(this.instanceId)) {
            member.encounterVisibility = { key: this.visibilityKey, group: member === p ? "shadow" : "real", privateToGroup: member === p };
            this.viewers.add(member);
        }
        this.runnerPath(p, true);
        this.services.animation.playLocGraphic({ spotId: 353, tile: tile(p), level: p.level,
            worldViewId: this.boss.worldViewId, ownerPlayerId: p.id, durationTicks: 2 });
        this.message(p, "Sotetseg chooses you... Follow the red path to the portal; your team sees only your current tile.");
    }
    private beginMaze(players: PlayerState[], tick: number): void {
        this.phase++;
        this.pending = [];
        this.boss.setUnattackable(true);
        this.animate("maze");
        const path = generateSotetsegPath(this.rng);
        this.maze = { runner: players[0], path, safe: new Set(path.map(key)), finished: new Set(), reachedLast: new Set(), nextDrain: tick + 7, tornadoIndex: -1, tornadoStarts: Infinity };
        for (const p of players) {
            this.move(p, { x: path[0].x, y: 4309 });
            this.message(p, "Follow the revealed path across the maze. Stay ahead of the tornado!");
        }
        this.assignRunner(players[this.rng.nextInt(players.length)], tick);
        // Native 8x2 portal sits just beyond the last row; use a private visual
        // override because portal collision must never block the finish line.
        for (const p of players)
            this.services.location.replaceTemporaryLoc({ worldViewId: this.boss.worldViewId, ownerPlayerId: p.id }, 0, 33037, { x: 3276, y: 4325 }, this.boss.level, { newShape: 10 });
    }
    enterPortal(p: PlayerState): void {
        const m = this.maze;
        if (!m || !this.members().includes(p) || p.tileY < 4324 || !m.reachedLast.has(p))
            return;
        m.finished.add(p);
        this.move(p, { x: m.path[m.path.length - 1].x, y: 4325 });
    }
    private clearTornado(): void {
        const m = this.maze;
        if (!m)
            return;
        if (m.tornado && this.services.combat.getNpc(m.tornado.id) === m.tornado)
            this.services.npc.removeNpc(m.tornado.id);
        m.tornado = undefined;
        m.tornadoIndex = -1;
        m.tornadoStarts = Infinity;
    }
    private mazeTick(players: PlayerState[], tick: number): void {
        const m = this.maze!;
        for (const p of this.viewers)
            if (!players.includes(p) && p.encounterVisibility?.key === this.visibilityKey) {
                p.encounterVisibility = undefined;
                if (p === m.runner)
                    this.runnerPath(p, false);
            }
        if (!players.includes(m.runner)) {
            const replacement = players.find(p => !m.finished.has(p)) ?? players[0];
            this.assignRunner(replacement, tick);
        }
        const runner = m.runner;
        if (!m.finished.has(runner) && tick >= m.nextDrain) {
            this.damage(runner, 1 + this.rng.nextInt(3), tick);
            m.nextDrain = tick + 7;
        }
        if (inSotetsegGrid(tile(runner)) && !m.finished.has(runner))
            for (const p of players)
                if (p !== runner)
                    this.services.animation.playLocGraphic({ spotId: THEATRE_MAZE_MARKER, ownerPlayerId: p.id, worldViewId: this.boss.worldViewId, tile: tile(runner), level: this.boss.level, height: 1, durationTicks: 1 });
        const end = m.path[m.path.length - 1];
        // Evaluate the occupied end-of-tick tile, not both substeps of a run.
        // This preserves diagonal/L skips without damaging on skipped tiles.
        for (const p of players) {
            if (m.finished.has(p))
                continue;
            const here = tile(p);
            if (here.y >= 4323 && here.y <= 4324 && Math.abs(here.x - end.x) <= 1 && m.safe.has(key(here)))
                m.reachedLast.add(p);
            if (here.y >= 4325) {
                if (m.reachedLast.has(p) && Math.abs(here.x - end.x) <= 1) {
                    m.finished.add(p);
                    continue;
                }
                this.move(p, { x: m.path[0].x, y: 4309 });
                continue;
            }
            if (here.y >= 4310 && here.y <= 4324 && !m.safe.has(key(here))) {
                const affected = p === runner ? [runner] : players.filter(q => q !== runner && !m.finished.has(q) && distance(tile(q), here) <= 1);
                this.services.animation.playLocGraphic({ spotId: 1603, worldViewId: this.boss.worldViewId, ownerPlayerId: p === runner ? runner.id : undefined, tile: here, level: p.level, durationTicks: 1 });
                for (const q of affected)
                    this.damage(q, sotetsegTileDamage(raidHitpoints(q)), tick);
            }
        }
        const followers = players.filter(p => (players.length === 1 || p !== runner) && !m.finished.has(p));
        if (!followers.some(p => p.tileY >= 4313))
            this.clearTornado();
        else if (m.tornadoIndex < 0) {
            m.tornadoIndex = 0;
            m.tornadoStarts = tick + SOTETSEG_TIMING.tornadoGrace;
        }
        if (m.tornadoIndex >= 0 && tick >= m.tornadoStarts) {
            const t = m.path[Math.min(m.tornadoIndex, m.path.length - 1)];
            if (!m.tornado) {
                const n = this.services.npc.spawnNpc({ id: 8389, x: t.x - 1, y: t.y - 1, level: this.boss.level, worldViewId: this.boss.worldViewId,
                    isAggressive: false, isUnattackable: true, isImmovable: true, respawns: false, wanderRadius: 0 });
                if (n) {
                    if (this.services.instances.attachNpc(this.instanceId, n)) {
                        m.tornado = n;
                        n.suppressDrops = true;
                    }
                    else
                        this.services.npc.removeNpc(n.id);
                }
            }
            if (m.tornado) {
                m.tornado.hiddenFromPlayerIds = new Set(players.length > 1 ? [runner.id] : []);
                m.tornado.teleport(t.x - 1, t.y - 1, this.boss.level);
            }
            for (const p of followers)
                if (distance(tile(p), t) <= 1)
                    this.damage(p, 60 + this.rng.nextInt(21), tick);
            m.tornadoIndex = Math.min(m.path.length - 1, m.tornadoIndex + 1);
        }
        const alive = this.members();
        if (alive.length && alive.every(p => m.finished.has(p)))
            this.finishMaze(tick);
    }
    private finishMaze(tick: number): void {
        this.clearMaze();
        this.boss.restoreCombatStat("defence");
        this.boss.setUnattackable(false);
        this.nextAttack = tick + 5;
        this.magicAttacks = 0;
    }
    private clearMaze(): void {
        if (!this.maze)
            return;
        this.runnerPath(this.maze.runner, false);
        this.clearTornado();
        for (const p of this.viewers) {
            if (p.encounterVisibility?.key === this.visibilityKey)
                p.encounterVisibility = undefined;
            this.services.location.clearTemporaryLoc({ worldViewId: this.boss.worldViewId, ownerPlayerId: p.id }, 0, { x: 3276, y: 4325 }, this.boss.level);
        }
        this.viewers.clear();
        this.maze = undefined;
    }
    tick(tick: number): void {
        if (this.stopped || tick <= this.lastTick)
            return;
        this.lastTick = tick;
        if (this.boss.getHitpoints() <= 0) {
            this.dispose();
            return;
        }
        const players = this.members();
        if (!players.length) {
            this.dispose();
            this.onWipe();
            return;
        }
        const threshold = this.threshold();
        if (!this.maze && threshold !== undefined && this.boss.getHitpoints() <= threshold)
            this.beginMaze(players, tick);
        if (this.maze) {
            this.mazeTick(players, tick);
            return;
        }
        const due = this.pending.filter(p => p.at <= tick);
        this.pending = this.pending.filter(p => p.at > tick);
        for (const p of due)
            p.run();
        const active = this.members();
        if (tick < this.nextAttack || !active.length)
            return;
        this.nextAttack = tick + 5;
        const target = active.sort((a, b) => maidenDistance(this.boss, a) - maidenDistance(this.boss, b) || this.roster.indexOf(raidAccount(a)) - this.roster.indexOf(raidAccount(b)))[0];
        if (this.magicAttacks >= 10)
            this.sharedBall(active, tick);
        else if (maidenDistance(this.boss, target) <= 1 && this.rng.nextInt(2) === 0) {
            this.animate("melee");
            const hit = this.evaluator.evaluate({ attacker: { type: "npc", id: this.boss.id }, target: { type: "player", id: target.id }, attackClock: tick,
                traits: { type: "melee", style: null, rangeTiles: 1, speedTicks: 5, maxHitOverride: 45, effects: { ignoreProtectionPrayer: true } } });
            const amount = Math.floor(hit.damage / (target.prayer.hasPrayerActive("protect_from_melee") ? 2 : 1));
            this.pending.push({ at: tick + 1, run: () => this.damage(target, amount, tick + 1) });
        }
        else
            this.magic(target, tick);
    }
    dispose(): void {
        if (this.stopped)
            return;
        this.stopped = true;
        this.pending = [];
        this.clearMaze();
        this.boss.filterPlayerDamage = undefined;
        this.participants.clear();
    }
}
