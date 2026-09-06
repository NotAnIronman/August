import { SkillId } from "@august/osrs-engine/skill/skills";
import { HITMARK_DAMAGE, HITMARK_HEAL } from "@server/game/combat/HitEffects";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import { applyStatDrains } from "@server/game/encounters/mechanics/playerEffects";
import { normalizeNpcAnimationPool, type NpcCombatAnimationData } from "@server/game/npc/NpcCombatAnimationData";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { CardinalAdjacentRouteStrategy } from "@server/pathfinding/engine/RouteStrategy";
import { serverGeneratedDataPath } from "@server/paths";
import { theatreHitpoints } from "@server/data/theatreCombatStats";
import { MAIDEN_ADD_SPAWNS } from "./arenas";
export const MAIDEN_ASSETS = { forms: [8360, 8361, 8362, 8363], nylocas: 8366, bloodSpawn: 8367,
    blackstorm: 1577, splat: 1578, blood: 1579 } as const;
export const MAIDEN_TIMING = { attack: 10, splatChance: 0.25, splatCooldownAttacks: 2, bloodSpawnCap: 8,
    splatLifetime: 50, trailMin: 34, trailMax: 50 } as const;
type Tile = {
    x: number;
    y: number;
};
interface Blood extends Tile {
    expires: number;
    spawnRoll?: number;
}
interface Pending {
    at: number;
    apply: () => void;
}
export const raidAccount = (p: PlayerState) => (p.__saveKey || p.name).trim().toLowerCase();
export const raidHitpoints = (p: PlayerState) => { const hp = p.skillSystem.getSkill(SkillId.Hitpoints); return Math.max(0, hp.baseLevel + hp.boost); };
export function maidenDistance(npc: {
    tileX: number;
    tileY: number;
    size: number;
}, p: {
    tileX: number;
    tileY: number;
}): number {
    return Math.max(npc.tileX - p.tileX, p.tileX - (npc.tileX + npc.size - 1), npc.tileY - p.tileY, p.tileY - (npc.tileY + npc.size - 1), 0);
}
export function maidenTarget(boss: NpcState, players: readonly PlayerState[], roster: readonly string[]): PlayerState | undefined {
    const side = (p: PlayerState) => p.tileY >= boss.tileY + boss.size || p.tileX >= boss.tileX + boss.size ? 0 : 1;
    return [...players].sort((a, b) => maidenDistance(boss, a) - maidenDistance(boss, b) || side(a) - side(b) ||
        roster.indexOf(raidAccount(a)) - roster.indexOf(raidAccount(b)))[0];
}
export function maidenSpawnTiles(size: number): Tile[] {
    return Array.from({ length: Math.min(5, Math.max(1, size)) }, (_, i) => [MAIDEN_ADD_SPAWNS.left[Math.min(i, 3)], MAIDEN_ADD_SPAWNS.right[Math.min(i, 3)]]).flat()
        // The 2x2 footprint at x3187 intersects the east wall at x3188.
        .map(tile => ({ ...tile, x: Math.min(tile.x, 3186) }));
}
export function maidenDrainSkills(bonuses: readonly number[]): SkillId[] {
    const melee = Math.max(bonuses[0] ?? 0, bonuses[1] ?? 0, bonuses[2] ?? 0), magic = bonuses[3] ?? 0, ranged = bonuses[4] ?? 0;
    return magic > melee && magic >= ranged ? [SkillId.Magic] : ranged > melee ? [SkillId.Ranged] : [SkillId.Attack, SkillId.Strength];
}
/** One attempt owns its adds, delayed hits and floor patches. Never shared by NPC type or coordinates. */
export class MaidenEncounter {
    readonly participants = new Set<PlayerState>();
    readonly adds = new Map<number, NpcState>();
    readonly bloodSpawns = new Map<number, NpcState>();
    readonly blood = new Map<string, Blood>();
    private pending: Pending[] = [];
    private nextAttack: number;
    private cooldown = 0;
    private phase = 0;
    private stopped = false;
    absorbed = 0;
    constructor(readonly boss: NpcState, readonly instanceId: string, readonly roster: readonly string[], private readonly services: ScriptServices, private readonly onWipe: () => void, readonly rng = new EncounterRandom(Math.floor(Math.random() * 0x100000000))) {
        this.nextAttack = services.system.getCurrentTick() + MAIDEN_TIMING.attack;
        boss.suppressDefenceAnimation = true;
        this.animate("idle");
    }
    admit(player: PlayerState): void { if (this.roster.includes(raidAccount(player)))
        this.participants.add(player); }
    private members(): PlayerState[] {
        return this.services.instances.getMemberPlayers(this.instanceId).filter(p => this.participants.has(p) &&
            p.worldViewId === this.boss.worldViewId && p.level === this.boss.level && this.roster.includes(raidAccount(p)) &&
            p.tileX >= 3159 && p.tileX <= 3190 && p.tileY >= 4434 && p.tileY <= 4459 && raidHitpoints(p) > 0);
    }
    private animate(role: "magic" | "splat" | "idle"): void {
        // Read the animation editor's canonical data; never rewrite its assignments.
        const data = require(serverGeneratedDataPath("npc-combat-defs.json")) as {
            npcs?: Record<string, {
                anims?: NpcCombatAnimationData;
            }>;
        };
        const anim = data.npcs?.["8360"]?.anims;
        const pool = normalizeNpcAnimationPool(role === "magic" ? anim?.magic ?? anim?.attack : anim?.namedSpecials?.[role]);
        this.services.npc.queueNpcSeq(this.boss, pool[0] ?? (role === "magic" ? 8091 : role === "splat" ? 8092 : 8090));
    }
    private launch(id: number, tile: Tile, delay: number, target?: PlayerState): void {
        const b = this.boss;
        this.services.projectiles.launch({ projectileId: id, worldViewId: b.worldViewId,
            source: { tileX: b.tileX + Math.floor(b.size / 2), tileY: b.tileY + Math.floor(b.size / 2), plane: b.level, actor: { kind: "npc", serverId: b.id } },
            target: { tileX: tile.x, tileY: tile.y, plane: b.level, ...(target ? { actor: { kind: "player" as const, serverId: target.id } } : {}) },
            sourceHeight: 100, endHeight: target ? 30 : 0, slope: target ? 0 : 32, startPos: 0, startCycleOffset: 0,
            endCycleOffset: Math.max(1, delay * Math.round((this.services.system.getTickDurationMs?.() ?? 600) / 20)) });
    }
    private delay(tile: Tile): number {
        return Math.max(1, Math.ceil(maidenDistance(this.boss, { tileX: tile.x, tileY: tile.y }) / 3));
    }
    private blackstorm(players: PlayerState[], tick: number): void {
        const target = maidenTarget(this.boss, players, this.roster);
        if (!target)
            return;
        this.animate("magic");
        const max = Math.floor(36.5 + 3.5 * this.absorbed);
        const raw = this.rng.nextInt(max + 1);
        const damage = target.prayer.hasPrayerActive("protect_from_magic") ? Math.floor(raw / 2) : raw;
        const drains = maidenDrainSkills(this.services.equipment.computeEquipmentStatBonuses?.(target) ?? []);
        const shouldDrain = this.rng.next() < 0.5, delay = this.delay({ x: target.tileX, y: target.tileY });
        this.launch(MAIDEN_ASSETS.blackstorm, { x: target.tileX, y: target.tileY }, delay, target);
        // Deliberately no launch-HP cap: eating after launch cannot shrink the queued hit.
        this.pending.push({ at: tick + delay, apply: () => {
                if (!this.members().includes(target))
                    return;
                const hit = this.services.combat.applyNpcDamageToPlayer(this.boss, target, HITMARK_DAMAGE, damage, tick + delay);
                if (shouldDrain && hit.amount > 0)
                    applyStatDrains(target, drains.map(skillId => ({ skillId, amount: Math.floor((hit.amount + 1) / 5) })));
            } });
    }
    private splats(players: PlayerState[], tick: number): void {
        this.animate("splat");
        const tiles = players.map(p => ({ x: p.tileX, y: p.tileY }));
        const extra = players[this.rng.nextInt(players.length)];
        for (let i = 0; i < 2; i++)
            tiles.push({ x: extra.tileX + this.rng.nextInt(5) - 2, y: extra.tileY + this.rng.nextInt(5) - 2 });
        for (const tile of tiles) {
            const delay = this.delay(tile);
            this.launch(MAIDEN_ASSETS.splat, tile, delay);
            this.pending.push({ at: tick + delay, apply: () => this.patch(tile, tick + delay, MAIDEN_TIMING.splatLifetime, true) });
        }
    }
    private patch(tile: Tile, tick: number, duration: number, splat = false): void {
        if (tile.x < 3159 || tile.x > 3190 || tile.y < 4434 || tile.y > 4459)
            return;
        const key = `${tile.x}:${tile.y}`, old = this.blood.get(key);
        if (old) {
            if (splat)
                old.expires = Math.max(old.expires, tick + duration);
            return;
        }
        const patch: Blood = { ...tile, expires: tick + duration, ...(splat ? { spawnRoll: this.rng.next() } : {}) };
        this.blood.set(key, patch);
        this.showBlood(tile, duration);
    }
    private showBlood(tile: Tile, durationTicks: number): void {
        this.services.animation.playLocGraphic({ spotId: MAIDEN_ASSETS.blood, tile, level: this.boss.level,
            worldViewId: this.boss.worldViewId, durationTicks });
    }
    private spawn(typeId: number, tile: Tile, hp: number): NpcState | undefined {
        const npc = this.services.npc.spawnNpc({ id: typeId, x: tile.x, y: tile.y, level: this.boss.level, worldViewId: this.boss.worldViewId,
            isAggressive: false, wanderRadius: 0, respawns: false, combatLeashRadius: 64, retreatInteractionRange: 64 });
        if (!npc)
            return;
        if (!this.services.instances.attachNpc(this.instanceId, npc)) {
            this.services.npc.removeNpc(npc.id);
            return;
        }
        npc.suppressDrops = true;
        npc.scriptedMovement = true;
        npc.configureHitpoints(hp);
        return npc;
    }
    private wave(): void {
        for (const tile of maidenSpawnTiles(this.roster.length)) {
            const add = this.spawn(MAIDEN_ASSETS.nylocas, tile, theatreHitpoints(200, this.roster.length));
            if (add)
                this.adds.set(add.id, add);
        }
    }
    private moveAdds(tick: number): void {
        const b = this.boss, path = this.services.movement.getPathService();
        for (const [id, add] of this.adds) {
            if (add.getHitpoints() <= 0 || this.services.combat.getNpc(id) !== add) {
                this.adds.delete(id);
                continue;
            }
            if (add.isFrozen(tick))
                continue;
            // Distance between the full 2x2 healer and Maiden's 6x6 body.
            const distance = Math.max(b.tileX - (add.tileX + add.size - 1), add.tileX - (b.tileX + b.size - 1), b.tileY - (add.tileY + add.size - 1), add.tileY - (b.tileY + b.size - 1), 0);
            if (distance <= 1) {
                this.absorbed++;
                this.services.combat.applyNpcHitsplat(b, HITMARK_HEAL, add.getHitpoints() * 2, tick);
                this.services.npc.removeNpc(id);
                this.adds.delete(id);
                continue;
            }
            if (add.hasPath() || !path)
                continue;
            const strategy = new CardinalAdjacentRouteStrategy(b.tileX, b.tileY, b.size, b.size);
            strategy.setCollisionGetter((x, y, p) => path.getCollisionFlagAt(x, y, p, b.worldViewId), b.level);
            const route = path.findPathSteps({ from: { x: add.tileX, y: add.tileY, plane: add.level }, to: { x: b.tileX, y: b.tileY }, size: add.size, worldViewId: b.worldViewId }, { routeStrategy: strategy, maxSteps: 128 });
            if (route.ok && route.steps?.length)
                add.setPath(route.steps, false);
        }
    }
    private moveBloodSpawns(tick: number): void {
        for (const [id, npc] of this.bloodSpawns) {
            if (npc.getHitpoints() <= 0 || this.services.combat.getNpc(id) !== npc) {
                this.bloodSpawns.delete(id);
                continue;
            }
            if (npc.isFrozen(tick))
                continue;
            if (!npc.hasPath()) {
                const tile = { x: Math.max(3169, Math.min(3183, npc.tileX + this.rng.nextInt(7) - 3)),
                    y: Math.max(4436, Math.min(4456, npc.tileY + this.rng.nextInt(7) - 3)) };
                this.services.npc.moveNpcTo(npc, tile, false);
            }
            this.patch({ x: npc.tileX, y: npc.tileY }, tick, MAIDEN_TIMING.trailMin + this.rng.nextInt(MAIDEN_TIMING.trailMax - MAIDEN_TIMING.trailMin + 1));
        }
    }
    private floor(players: PlayerState[], tick: number): void {
        for (const [key, blood] of this.blood) {
            if (tick >= blood.expires) {
                this.showBlood(blood, 0);
                this.blood.delete(key);
                continue;
            }
            // Re-send remaining lifetimes for viewers walking into streaming range.
            if (tick % 5 === 0)
                this.showBlood(blood, blood.expires - tick);
            const standing = players.filter(p => p.tileX === blood.x && p.tileY === blood.y);
            for (const p of standing) {
                const hit = this.services.combat.applyNpcDamageToPlayer(this.boss, p, HITMARK_DAMAGE, 10 + 2 * this.absorbed, tick);
                if (hit.amount > 0) {
                    this.services.combat.applyNpcHitsplat(this.boss, HITMARK_HEAL, hit.amount, tick);
                    applyStatDrains(p, [{ skillId: SkillId.Prayer, amount: hit.amount }]);
                }
            }
            if (blood.spawnRoll !== undefined && (blood.spawnRoll < 0.1 || (standing.length > 0 && blood.spawnRoll < 0.2))) {
                blood.spawnRoll = undefined;
                if (this.bloodSpawns.size < MAIDEN_TIMING.bloodSpawnCap) {
                    const npc = this.spawn(MAIDEN_ASSETS.bloodSpawn, blood, 120);
                    if (npc)
                        this.bloodSpawns.set(npc.id, npc);
                }
            }
        }
    }
    tick(tick: number): void {
        if (this.stopped)
            return;
        if (this.boss.getHitpoints() <= 0 || this.services.combat.getNpc(this.boss.id) !== this.boss) {
            this.dispose();
            return;
        }
        const players = this.members();
        if (!players.length) {
            this.dispose();
            this.onWipe();
            return;
        }
        while (this.phase < 3 && this.boss.getHitpoints() <= this.boss.getMaxHitpoints() * [0.7, 0.5, 0.3][this.phase]) {
            this.phase++;
            this.boss.presentationTypeId = MAIDEN_ASSETS.forms[this.phase];
            this.wave();
        }
        const due = this.pending.filter(p => p.at <= tick);
        this.pending = this.pending.filter(p => p.at > tick);
        for (const p of due)
            p.apply();
        this.moveAdds(tick);
        this.moveBloodSpawns(tick);
        this.floor(this.members(), tick);
        if (tick >= this.nextAttack) {
            this.nextAttack = tick + MAIDEN_TIMING.attack;
            if (this.cooldown === 0 && this.rng.next() < MAIDEN_TIMING.splatChance) {
                this.splats(players, tick);
                this.cooldown = MAIDEN_TIMING.splatCooldownAttacks;
            }
            else {
                this.blackstorm(players, tick);
                this.cooldown = Math.max(0, this.cooldown - 1);
            }
        }
    }
    owns(npc: NpcState): boolean { return this.adds.get(npc.id) === npc || this.bloodSpawns.get(npc.id) === npc; }
    dispose(): void {
        this.stopped = true;
        this.pending = [];
        for (const blood of this.blood.values())
            this.showBlood(blood, 0);
        this.blood.clear();
        for (const npc of [...this.adds.values(), ...this.bloodSpawns.values()])
            if (this.services.combat.getNpc(npc.id) === npc)
                this.services.npc.removeNpc(npc.id);
        this.adds.clear();
        this.bloodSpawns.clear();
        this.participants.clear();
    }
}
