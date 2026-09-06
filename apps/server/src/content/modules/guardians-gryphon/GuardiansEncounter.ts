import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { getItemDefinition } from "@server/data/items";
import type { AttackType } from "@server/game/combat/AttackType";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import type { FoundationRoom } from "./rooms";
import { EncounterSupport, bodyDistance, distance, tileOf, type Tile } from "./EncounterSupport";
export const GUARDIANS_TIMING = { attack: 6, stoneEvery: 4, stoneTravel: 2, wingCharge: 12, rockfallEvery: 14,
    lightning: 10, sphereStage: 6, sphereAbsorb: 24, prison: 5, prisonEvery: 8 } as const;
export const GUARDIANS_ASSETS = { ranged: 1444, stone: 1445, rock: 1435, shadow: [1446, 1447, 1448, 1449],
    lightning: 1424, prison: 1434, spheres: [31678, 31679, 31680], dawn: [7852, 7853, 7884], dusk: [7851, 7882, 7883, 7888] } as const;
export const HAMMERS = [4162, 21754] as const;
export const GARGOYLE_SMASHER_VARBIT = 4027;
type Sphere = Tile & {
    stage: number;
    spawned: number;
};
type Prison = {
    player: PlayerState;
    center: Tile;
    gap: Tile;
    last: Tile;
    escaped: boolean;
    expires: number;
};
type Lightning = Tile & {
    activeAt: number;
};
/** Both actors retain their runtime identities, contribution records, and one shared reward. */
export class GuardiansEncounter extends EncounterSupport {
    phase: 1 | 2 | 3 | 4 = 1;
    private nextDawn: number;
    private nextDusk: number;
    private dawnAttacks = 0;
    private duskAttacks = 0;
    private nextRocks = Infinity;
    private wingUntil = 0;
    private lightningUntil = 0;
    private lightning: Lightning[] = [];
    private spheres: Sphere[] = [];
    private prisons: Prison[] = [];
    private firstPrison = true;
    private prisonInvulnerableUntil = 0;
    private duskStyle: "melee" | "ranged" = "melee";
    private finishers = new Set<NpcState>();
    private oldFilters = new Map<NpcState, NpcState["filterPlayerDamage"]>();
    private oldHits = new Map<NpcState, NpcState["onPlayerHit"]>();
    private readonly baseSize: number;
    private floor?: Tile[];
    constructor(readonly dusk: NpcState, readonly dawn: NpcState, instanceId: string, room: FoundationRoom, services: ScriptServices) {
        super([dusk, dawn], instanceId, room, services);
        this.baseSize = dusk.size;
        this.nextDawn = this.nextDusk = this.tickNow + 6;
        dusk.presentationTypeId = 7851;
        dusk.incomingPlayerFlatArmourModifier = -1;
        for (const n of this.npcs) {
            this.oldFilters.set(n, n.filterPlayerDamage);
            this.oldHits.set(n, n.onPlayerHit);
            n.filterPlayerDamage = (p, d, type, t, weapon) => this.filterHit(n, p, this.oldFilters.get(n)?.(p, d, type, t, weapon) ?? d, type, weapon);
            n.onPlayerHit = (p, d, type, t) => { this.oldHits.get(n)?.(p, d, type, t); this.tickNow = Math.max(this.tickNow, t); this.transitions(); };
        }
    }
    private vulnerable(n: NpcState): boolean {
        if (this.lightningUntil > this.tickNow)
            return false;
        return n === this.dawn ? (this.phase === 1 || this.phase === 3) : (this.phase === 2 || this.phase === 4) && this.tickNow >= this.prisonInvulnerableUntil;
    }
    private filterHit(n: NpcState, p: PlayerState, damage: number, type: AttackType, weaponId?: number): number {
        if (this.stopped || !this.members().includes(p) || !this.vulnerable(n))
            return 0;
        if (this.finishers.has(n))
            return damage;
        if (n === this.dusk && type !== "melee")
            return 0;
        if (n === this.dawn && type === "melee" && !/halberd/i.test(getItemDefinition(weaponId ?? p.combat.weaponItemId)?.name ?? ""))
            return 0;
        const floor = (this.phase === 1 || this.phase === 2) ? Math.ceil(n.getMaxHitpoints() * 0.55) :
            (p.varps.getVarbitValue(GARGOYLE_SMASHER_VARBIT) > 0 ? 0 : 1);
        return Math.max(0, Math.min(damage, n.getHitpoints() - floor));
    }
    /** Protect status/script damage as well as the regular player impact pipeline. */
    preventDeath(n: NpcState, p?: PlayerState): boolean {
        return !this.vulnerable(n) || this.phase < 3 || (!this.finishers.has(n) && (!p || p.varps.getVarbitValue(GARGOYLE_SMASHER_VARBIT) <= 0));
    }
    finish(n: NpcState, p: PlayerState, itemId?: number): boolean {
        if (!this.npcs.includes(n) || !this.members().includes(p) || !this.vulnerable(n) || this.phase < 3 || n.getHitpoints() >= 10 || n.getHitpoints() <= 0)
            return false;
        const hammer = itemId ?? HAMMERS.find(id => p.items.hasItem(id, 1));
        if (!hammer || !HAMMERS.includes(hammer as 4162 | 21754) || !p.items.hasItem(hammer, 1)) {
            this.services.messaging.sendGameMessage(p, "Use a rock hammer on the weakened guardian to finish it.");
            return false;
        }
        if (bodyDistance(n, p) > (hammer === 21754 ? 9 : 1) || !this.services.npc.hasLineOfSightToPlayer(n, p))
            return false;
        this.finishers.add(n);
        try {
            this.services.combat.applyPlayerDamageToNpc(p, n, HITMARK_DAMAGE, n.getHitpoints(), this.tickNow);
        }
        finally {
            this.finishers.delete(n);
        }
        this.transitions();
        return true;
    }
    private transitions(): void {
        if (this.stopped)
            return;
        if (this.phase === 1 && this.dawn.getHitpoints() <= Math.ceil(this.dawn.getMaxHitpoints() * 0.55)) {
            this.phase = 2;
            this.dawn.presentationTypeId = 7853;
            this.dawn.isUnattackable = true;
            this.animate(this.dawn, "fly-up", 7773);
            this.dawn.clearPath();
            this.dusk.presentationTypeId = 7882;
            this.animate(this.dusk, "enddef", 7783);
            this.nextDusk = this.tickNow + 6;
            this.nextRocks = this.tickNow + 4;
            this.duskAttacks = 0;
        }
        if (this.phase === 2 && this.dusk.getHitpoints() <= Math.ceil(this.dusk.getMaxHitpoints() * 0.55)) {
            this.phase = 3;
            this.wingUntil = 0;
            this.nextRocks = Infinity;
            this.dusk.clearPath();
            this.dawn.clearPath();
            this.animate(this.dusk, "fly", 7791);
            this.animate(this.dawn, "fly-down", 7774);
            const steps: Tile[] = [];
            let from = tileOf(this.dusk);
            for (let i = 0; i < 3; i++) {
                const next = { x: from.x - 1, y: from.y };
                if (!this.stepAllowed(from, next, this.dusk.size))
                    break;
                steps.push(next);
                from = next;
            }
            if (steps.length)
                this.dusk.setPath(steps, false);
            this.dusk.presentationTypeId = 7883;
            this.dawn.presentationTypeId = 7884;
            this.dawn.isUnattackable = false;
            this.lightningUntil = this.tickNow + GUARDIANS_TIMING.lightning;
            this.message("Dawn and Dusk charge the air with lightning!");
            const tiles = this.members().map(tileOf);
            for (let i = 0; i < 10; i++) {
                const tile = this.floorTile();
                if (tile)
                    tiles.push(tile);
            }
            const seen = new Set<string>();
            for (const [i, tile] of tiles.entries()) {
                const k = `${tile.x}:${tile.y}`;
                if (seen.has(k))
                    continue;
                seen.add(k);
                const warning = i < this.members().length ? 0 : this.roll(0, 3);
                this.lightning.push({ ...tile, activeAt: this.tickNow + warning + 2 });
                this.later(warning, () => this.graphic(tile, 1424, GUARDIANS_TIMING.lightning - warning));
            }
        }
        if (this.phase === 3 && this.dawn.getHitpoints() <= 0) {
            this.phase = 4;
            this.lightning = [];
            this.lightningUntil = 0;
            this.clearSpheres();
            this.clearVisuals();
            this.dusk.presentationTypeId = 7888;
            this.dusk.setFootprintSize(6);
            Object.assign(this.dusk.combat, { attackLevel: 300, strengthLevel: 250, magicLevel: 250, rangedLevel: 250, defenceLevel: 150 });
            this.dusk.incomingPlayerFlatArmourModifier = 0;
            this.animate(this.dusk, "enrage", 7796);
            this.prison();
            this.nextDusk = this.tickNow + GUARDIANS_TIMING.prison + 1;
            this.duskAttacks = 0;
            const p = this.target(this.dusk);
            this.duskStyle = p?.prayer.hasPrayerActive("protect_from_melee") ? (this.rng.next() < 2 / 3 ? "ranged" : "melee") :
                p?.prayer.hasPrayerActive("protect_from_missiles") ? (this.rng.next() < 2 / 3 ? "melee" : "ranged") : (this.rng.next() < 0.5 ? "melee" : "ranged");
        }
    }
    /** Collision-checked arena tiles, never a shadow inside the scenery. */
    private floorTile(avoid: readonly Tile[] = [], margin = 0): Tile | undefined {
        const b = this.room.bounds;
        if (!this.floor) {
            const queue: Tile[] = [{ x: this.room.inside.x, y: this.room.inside.y }], seen = new Set<string>([`${queue[0].x}:${queue[0].y}`]);
            for (let i = 0; i < queue.length; i++)
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const from = queue[i], t = { x: from.x + dx, y: from.y + dy }, key = `${t.x}:${t.y}`;
                    if (!seen.has(key) && this.stepAllowed(from, t)) {
                        seen.add(key);
                        queue.push(t);
                    }
                }
            this.floor = queue;
        }
        const candidates = this.floor.filter(t => {
            if (t.x < b.minX + margin || t.x > b.maxX - margin || t.y < b.minY + margin || t.y > b.maxY - margin)
                return false;
            if (avoid.some(a => distance(t, a) <= 2))
                return false;
            if (this.npcs.some(n => n.getHitpoints() > 0 && t.x >= n.tileX - 1 && t.x <= n.tileX + n.size && t.y >= n.tileY - 1 && t.y <= n.tileY + n.size))
                return false;
            return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([x, y]) => this.stepAllowed(t, { x: t.x + x, y: t.y + y }));
        });
        return candidates.length ? candidates[this.rng.nextInt(candidates.length)] : undefined;
    }
    private rockfall(): void {
        const used: Tile[] = [];
        for (let i = 0, count = this.roll(9, 10); i < count; i++) {
            const tile = this.floorTile(used);
            if (!tile)
                continue;
            used.push(tile);
            const speed = this.roll(0, 3), delay = 3 + speed;
            this.graphic(tile, GUARDIANS_ASSETS.shadow[speed], delay);
            this.later(delay, () => {
                if (this.phase !== 2)
                    return;
                this.graphic(tile, 1436, 2);
                for (const p of this.members())
                    if (distance(tile, tileOf(p)) <= 1) {
                        this.hit(this.dusk, p, this.roll(0, 22));
                        if (distance(tile, tileOf(p)) === 0)
                            this.services.combat.stunPlayer(p, 10);
                    }
            });
        }
    }
    private dawnAttack(p: PlayerState): void {
        this.services.npc.faceNpcToPlayer(this.dawn, p);
        if (++this.dawnAttacks % GUARDIANS_TIMING.stoneEvery === 0) {
            this.animate(this.dawn, "stone-ball", 7771);
            const tile = tileOf(p);
            this.projectile(this.dawn, tile, 1445, 2);
            this.later(2, () => { if (this.phase !== 1 && this.phase !== 3)
                return; for (const player of this.members())
                if (distance(tile, tileOf(player)) <= 1) {
                    this.hit(this.dawn, player, this.roll(0, 15));
                    player.applyFreeze(10, this.tickNow);
                    this.graphic(tile, 1312, 2);
                } });
        }
        else if (bodyDistance(this.dawn, p) <= 1 && this.rng.next() < 0.5) {
            this.animate(this.dawn, "melee", 7769);
            this.standardHit(this.dawn, p, "melee", 15, 0.2);
        }
        else {
            this.animate(this.dawn, "magic", 7770);
            for (const delay of [2, 3]) {
                this.projectile(this.dawn, tileOf(p), 1444, delay, p);
                this.standardHit(this.dawn, p, "ranged", 9, 0.5, delay);
            }
        }
    }
    private wing(): void {
        this.wingUntil = this.tickNow + GUARDIANS_TIMING.wingCharge;
        this.dusk.clearPath();
        this.animate(this.dusk, "wing-charge", 7787);
        this.message("Dusk draws back his wing. Get away from him!");
        this.nextDusk = this.wingUntil + 6;
    }
    private spawnSpheres(): void {
        this.animate(this.dawn, "energy-spheres", 7772);
        const used: Tile[] = [];
        for (let i = 0; i < 3; i++) {
            const tile = this.floorTile(used);
            if (!tile)
                continue;
            used.push(tile);
            this.spheres.push({ ...tile, stage: 0, spawned: this.tickNow });
            this.loc(tile, 31678);
        }
    }
    private clearSpheres(): void { for (const s of this.spheres)
        this.clearLoc(s); this.spheres = []; }
    private updateSpheres(): void {
        this.spheres = this.spheres.filter(s => {
            if (this.members().some(p => distance(s, tileOf(p)) === 0)) {
                this.clearLoc(s);
                return false;
            }
            if (this.tickNow >= s.spawned + GUARDIANS_TIMING.sphereAbsorb) {
                this.projectile(this.dawn, s, 1441, 1);
                this.heal(this.dawn, 90);
                this.clearLoc(s);
                return false;
            }
            const stage = Math.min(2, Math.floor((this.tickNow - s.spawned) / GUARDIANS_TIMING.sphereStage));
            if (stage !== s.stage) {
                s.stage = stage;
                this.loc(s, 31678 + stage);
            }
            return true;
        });
    }
    private prison(): void {
        this.dusk.clearPath();
        this.animate(this.dusk, "prison", 7799);
        if (this.firstPrison) {
            this.prisonInvulnerableUntil = this.tickNow + 5;
            this.firstPrison = false;
        }
        const centers: Tile[] = [];
        for (const player of this.members()) {
            const center = this.floorTile(centers, 2);
            if (!center)
                continue;
            centers.push(center);
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], [dx, dy] = dirs[this.rng.nextInt(4)];
            const gap = { x: center.x + dx, y: center.y + dy };
            this.services.movement.clearPlayerTarget(player);
            player.clearPath();
            const start = tileOf(player);
            this.services.movement.teleportPlayer(player, center.x, center.y, player.level);
            this.services.movement.queueForcedMovement(player, { startTile: start, endTile: center, startTick: this.tickNow, endTick: this.tickNow + 1 });
            this.prisons.push({ player, center, gap, last: center, escaped: false, expires: this.tickNow + 5 });
            for (let x = -1; x <= 1; x++)
                for (let y = -1; y <= 1; y++)
                    if ((x || y) && (x !== dx || y !== dy))
                        this.graphic({ x: center.x + x, y: center.y + y }, 1434, 5);
            this.services.messaging.sendGameMessage(player, "Escape through the gap in the flames!");
        }
    }
    private updatePrisons(): void {
        this.prisons = this.prisons.filter(prison => {
            const { player, center, gap } = prison;
            if (!this.members().includes(player))
                return false;
            const now = tileOf(player);
            // Check both tiles of a run, not just its destination. A diagonal shortcut
            // through a flame does not count as using the one safe opening.
            if (!prison.escaped && this.tickNow > prison.expires - 4) {
                const steps = distance(prison.last, now);
                if (steps <= 2)
                    for (let i = 1; i <= steps; i++) {
                        const t = { x: prison.last.x + Math.sign(now.x - prison.last.x) * Math.min(i, Math.abs(now.x - prison.last.x)), y: prison.last.y + Math.sign(now.y - prison.last.y) * Math.min(i, Math.abs(now.y - prison.last.y)) };
                        if (distance(t, center) === 1) {
                            if (distance(t, gap) === 0)
                                prison.escaped = true;
                            break;
                        }
                    }
            }
            prison.last = now;
            if (this.tickNow < prison.expires)
                return true;
            if (!prison.escaped && distance(now, gap) !== 0)
                this.heal(this.dusk, this.hit(this.dusk, player, this.roll(0, 65)));
            return false;
        });
    }
    private duskAttack(p: PlayerState): void {
        this.services.npc.faceNpcToPlayer(this.dusk, p);
        this.duskAttacks++;
        if (this.phase === 2 && this.duskAttacks % 3 === 2) {
            this.wing();
            return;
        }
        if (this.phase === 4 && this.duskAttacks % GUARDIANS_TIMING.prisonEvery === 0) {
            this.prison();
            this.nextDusk = this.tickNow + 6;
            return;
        }
        if (this.phase === 4 && this.duskStyle === "ranged") {
            this.animate(this.dusk, "magic", 7801);
            const prayer = p.prayer.hasPrayerActive("protect_from_missiles");
            const first = this.evaluate(this.dusk, p, "ranged", 15).landed ? Math.floor(9 * (prayer ? 0.5 : 1)) : 0;
            const second = this.evaluate(this.dusk, p, "ranged", 15).landed ? Math.floor(this.roll(0, this.roll(0, 15)) * (prayer ? 0.45 : 1)) : 0;
            for (const [delay, d] of [[2, first], [3, second]]) {
                this.projectile(this.dusk, tileOf(p), 1444, delay, p);
                this.later(delay, () => this.hit(this.dusk, p, d));
            }
        }
        else {
            this.animate(this.dusk, this.phase === 4 ? "melee" : this.phase === 2 ? "normal-melee" : "melee-2", this.phase === 4 ? 7800 : this.phase === 2 ? 7786 : 7785);
            this.standardHit(this.dusk, p, "melee", this.phase === 4 ? 26 : 15, 0.2);
        }
        if (this.phase === 4) {
            const protecting = p.prayer.hasPrayerActive(this.duskStyle === "melee" ? "protect_from_melee" : "protect_from_missiles");
            if (this.rng.next() < (protecting ? 1 / 3 : 1 / 6))
                this.duskStyle = this.duskStyle === "melee" ? "ranged" : "melee";
        }
    }
    tick(tick: number): void {
        if (this.dusk.getHitpoints() <= 0) {
            this.dispose();
            return;
        }
        if (!this.update(tick))
            return;
        this.transitions();
        this.updatePrisons();
        if (this.lightningUntil) {
            if (tick < this.lightningUntil) {
                for (const l of this.lightning)
                    if (tick >= l.activeAt)
                        for (const p of this.members())
                            if (distance(l, tileOf(p)) <= 1)
                                this.hit(this.dusk, p, this.roll(5, 10));
                return;
            }
            this.lightningUntil = 0;
            this.lightning = [];
            this.clearVisuals();
            this.spawnSpheres();
            this.nextDawn = this.nextDusk = tick + 6;
        }
        this.updateSpheres();
        if (this.phase === 2 && tick >= this.nextRocks) {
            this.rockfall();
            this.nextRocks = tick + 14;
        }
        if (this.wingUntil) {
            if (tick >= this.wingUntil) {
                this.animate(this.dusk, "melee-3", 7788);
                for (const p of this.members())
                    if (bodyDistance(this.dusk, p) <= 1) {
                        this.hit(this.dusk, p, this.roll(25, 29));
                        this.push(this.dusk, p);
                    }
                this.wingUntil = 0;
            }
        }
        else if (tick >= this.prisonInvulnerableUntil) {
            const p = this.target(this.dusk);
            if (p) {
                const ranged = this.phase === 4 && this.duskStyle === "ranged";
                if (!ranged)
                    this.pursue(this.dusk, p);
                else
                    this.dusk.clearPath();
                if ((bodyDistance(this.dusk, p) <= 1 || ranged) && tick >= this.nextDusk && this.services.npc.hasLineOfSightToPlayer(this.dusk, p)) {
                    this.nextDusk = tick + 6;
                    this.duskAttack(p);
                }
            }
        }
        if ((this.phase === 2 || this.phase === 4) && tick % 6 === 0)
            for (const p of this.members())
                if (bodyDistance(this.dusk, p) === 0)
                    this.hit(this.dusk, p, this.roll(0, 40));
        if ((this.phase === 1 || this.phase === 3) && tick >= this.nextDawn) {
            const p = this.target(this.dawn);
            if (p && this.services.npc.hasLineOfSightToPlayer(this.dawn, p)) {
                this.nextDawn = tick + 6;
                this.dawnAttack(p);
            }
        }
    }
    override dispose(): void {
        if (this.stopped)
            return;
        for (const n of this.npcs) {
            n.filterPlayerDamage = this.oldFilters.get(n);
            n.onPlayerHit = this.oldHits.get(n);
        }
        // A killed boss keeps its last form/footprint until the ordinary corpse despawn.
        if (this.dusk.getHitpoints() > 0)
            this.dusk.setFootprintSize(this.baseSize);
        this.spheres = [];
        this.prisons = [];
        this.lightning = [];
        super.dispose();
    }
}
