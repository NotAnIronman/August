import assert from "node:assert/strict";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import { combatConsumableManager } from "@server/game/combat/engine/CombatConsumableManager";
import { GryphonEncounter, equippedWeight, WIND_DAMAGE } from "@server/content/modules/guardians-gryphon/GryphonEncounter";
import { GuardiansEncounter, GARGOYLE_SMASHER_VARBIT } from "@server/content/modules/guardians-gryphon/GuardiansEncounter";
import { BOSS_ROOMS } from "@server/content/modules/guardians-gryphon/rooms";
import { DeferredHitQueue, DeferredHitsplatType } from "@server/game/combat/engine/DeferredHitQueue";
import { createSpellDataProvider } from "@server/content/gamemodes/vanilla/data/spells";
import { registerSpellDataProvider } from "@server/game/spells/SpellDataProvider";
import { registerProjectileParamsProvider } from "@server/game/data/ProjectileParamsProvider";
import { createProjectileParamsProvider } from "@server/content/gamemodes/vanilla/data/projectileParams";
import { registerWeaponDataProvider } from "@server/game/combat/WeaponDataProvider";
import { createWeaponDataProvider } from "@server/content/gamemodes/vanilla/data/weapons";
const mode = createTestGamemode("guardians-gryphon-mechanics-test", "Guardian/Gryphon test");
registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100, skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100, hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
registerProjectileParamsProvider(createProjectileParamsProvider());
registerWeaponDataProvider(createWeaponDataProvider());
registerSpellDataProvider(createSpellDataProvider());
function fixture(guardians = false, count = 1) {
    const room = BOSS_ROOMS[guardians ? 0 : 1];
    let tick = 0;
    const hits: {
        player: PlayerState;
        damage: number;
        tick: number;
    }[] = [], stuns: number[] = [], seqs: number[] = [], graphics: any[] = [], locs: any[] = [], messages: string[] = [], forced: any[] = [];
    const players = Array.from({ length: count }, (_, i) => new PlayerState(i + 1, room.inside.x + i, room.inside.y, 0, mode));
    const inventory = new Map(players.map(p => [p, new Set<number>()])), prayers = new Map(players.map(p => [p, new Set<string>()]));
    for (const p of players) {
        p.worldViewId = 4000;
        p.skillSystem.getHitpointsCurrent = () => 10000;
        p.items.hasItem = (id) => inventory.get(p)!.has(id);
        p.prayer.hasPrayerActive = (id) => prayers.get(p)!.has(id);
        p.skillSystem.setSkillXp(SkillId.Attack, 13034431);
        p.skillSystem.setSkillXp(SkillId.Strength, 13034431);
    }
    const npcs = room.bosses.map((b, i) => new NpcState(i + 100, b.id, 4, -1, -1, 32, { x: b.x, y: b.y, level: 0 }, { maxHitpoints: guardians ? 450 : 400, worldViewId: 4000 }));
    let open = true, weight = 40000;
    const services: any = { system: { getCurrentTick: () => tick }, data: { getObjType: () => ({ weight }) }, equipment: { computeEquipmentStatBonuses: () => Array(14).fill(0) },
        instances: { getMemberPlayers: () => players }, messaging: { sendGameMessage: (_: any, m: string) => messages.push(m) },
        npc: { disengageCombat() { }, queueNpcSeq: (_: any, s: number) => seqs.push(s), hasLineOfSightToPlayer: () => open, faceNpcToPlayer() { },
            getNpc: (id: number) => npcs.find(n => n.id === id) },
        location: { replaceTemporaryLoc: (scope: any, _old: number, id: number, tile: any) => { assert.equal(scope.worldViewId, 4000); locs.push({ id, ...tile }); }, clearTemporaryLoc: () => true },
        animation: { playLocGraphic: (g: any) => graphics.push(g), playLocAnimation() { }, playPlayerSeq() { } }, projectiles: { launch() { } },
        movement: { clearPlayerTarget: (p: PlayerState) => p.removeCombatTarget(), teleportPlayer: (p: PlayerState, x: number, y: number, l: number) => p.teleport(x, y, l), queueForcedMovement: (_p: PlayerState, v: any) => { forced.push(v); },
            getPathService: () => ({ canActorStep: () => open, getCollisionFlagAt: () => 0, findPathSteps: () => ({ ok: false }) }) },
        combat: { isPlayerStunned: () => false, applyNpcDamageToPlayer: (_: any, p: PlayerState, _s: number, d: number, t: number) => { hits.push({ player: p, damage: d, tick: t }); return { amount: d }; },
            applyNpcHitsplat: (n: NpcState, _s: number, d: number) => n.heal(d), stunPlayer: (_: any, t: number) => stuns.push(t),
            applyPlayerDamageToNpc: (p: PlayerState, n: NpcState, _s: number, d: number) => { const allowed = !guardians || !(e as GuardiansEncounter).preventDeath(n, p); if (allowed)
                n.applyDamage(d); return { amount: allowed ? d : 0 }; } },
    };
    const e = guardians ? new GuardiansEncounter(npcs[0], npcs[1], "room", room, services) : new GryphonEncounter(npcs[0], "room", room, services);
    const control = e as any;
    control.nextAttack = control.nextDawn = control.nextDusk = Infinity;
    const cycle = (ticks = 1) => { for (let i = 0; i < ticks; i++)
        e.tick(++tick); };
    const playerHit = (n: NpcState, p: PlayerState, d: number, type: "melee" | "ranged" | "magic", weapon?: number) => {
        const damage = n.filterPlayerDamage?.(p, d, type, tick, weapon) ?? d;
        n.applyDamage(damage);
        n.onPlayerHit?.(p, damage, type, tick);
        return damage;
    };
    return { e, control, npcs, players, inventory, prayers, services, hits, stuns, seqs, graphics, locs, messages, forced, cycle, playerHit, tick: () => tick, setWeight: (n: number) => weight = n, setOpen: (v: boolean) => open = v };
}
{
    const f = fixture(), p = f.players[0];
    p.setEquipmentSlot(3, 4151);
    assert.equal(equippedWeight(p, f.services), 40, "cache grams become equipped kilograms");
    f.inventory.get(p)!.add(1127);
    assert.equal(equippedWeight(p, f.services), 40, "backpack excluded");
    f.setWeight(39999);
    assert.equal(equippedWeight(p, f.services), 39.999);
    f.e.dispose();
}
for (const counter of [false, true]) {
    const f = fixture(), p = f.players[0], n = f.npcs[0];
    p.teleport(n.tileX - 1, n.tileY, 0);
    p.setEquipmentSlot(3, 4151);
    f.control.knockback(p);
    assert(f.control.counter);
    f.cycle();
    assert.equal(f.hits.length, 0, "heavy player gets two-tick response window");
    if (counter)
        n.onPlayerAttackClick!(p, 1);
    f.cycle();
    assert.equal(f.forced.length, counter ? 0 : 1);
    assert.equal(f.control.counter, undefined);
    assert.equal(f.stuns.length, 0, "knockback never stuns player");
    f.e.dispose();
}
{
    const f = fixture(), p = f.players[0], n = f.npcs[0];
    p.teleport(n.tileX - 1, n.tileY, 0);
    p.setEquipmentSlot(3, 4151);
    f.control.knockback(p);
    combatConsumableManager.applyComboFoodAttackDelay(p, 0);
    n.onPlayerAttackClick!(p, 1);
    assert(f.control.counter, "food blocks the otherwise free counter");
    f.cycle(2);
    assert.equal(f.forced.length, 1);
    f.e.dispose();
    assert.equal(n.onPlayerAttackClick, undefined);
}
{
    const f = fixture(), p = f.players[0];
    f.setOpen(false);
    f.control.knockback(p);
    assert.equal(f.hits.length, 1);
    assert.equal(f.forced.length, 0, "knockback cannot cross a wall");
    f.e.dispose();
}
for (const dodge of [false, true]) {
    const f = fixture(), p = f.players[0];
    p.setEquipmentSlot(3, 4151);
    f.control.spit(p);
    f.cycle();
    assert.equal(f.hits.length, 0);
    if (dodge)
        p.tileX++;
    f.cycle(33);
    assert.equal(f.hits.length, dodge ? 0 : 6);
    if (!dodge) {
        assert.deepEqual(f.hits.map(h => h.tick), [4, 10, 16, 22, 28, 34]);
        assert(f.hits.every(h => h.damage >= 3 && h.damage <= 12));
    }
    f.e.dispose();
}
{
    const f = fixture(), p = f.players[0];
    p.setEquipmentSlot(3, 4151);
    f.control.spit(p);
    f.cycle(4);
    p.setEquipmentSlot(3, -1);
    f.cycle(40);
    assert.equal(f.hits.length, 1, "removing ALL worn gear stops corrosion");
    f.e.dispose();
}
{
    const f = fixture(), p = f.players[0];
    f.control.whirlwind(p);
    f.cycle(12);
    assert.equal(f.control.batch.winds.size, 1);
    assert.equal([...f.control.batch.winds.values()][0].strength, 5);
    f.cycle(5);
    assert.equal(f.hits.length, 0);
    f.cycle();
    assert.equal(f.hits.length, 1, "activation six ticks after fifth formation");
    p.tileX += 10;
    f.cycle(25);
    assert.equal(f.hits.length, 2, "strength-five burst reaches entire cave");
    assert(f.hits[1].damage >= 50 && f.hits[1].damage <= 60);
    assert.equal(f.control.batch, undefined);
    f.e.dispose();
}
{
    const f = fixture(), p = f.players[0];
    f.control.whirlwind(p);
    for (let i = 0; i < 4; i++) {
        p.tileX++;
        f.cycle(3);
    }
    assert.equal(f.control.batch.winds.size, 5);
    assert([...f.control.batch.winds.values()].every((v: any) => v.strength === 1));
    p.worldViewId = 4001;
    f.cycle(35);
    assert.equal(f.hits.length, 0, "hazards cannot follow players into another instance");
    f.e.dispose();
}
assert.deepEqual(WIND_DAMAGE.map(d => d.radius), [0, 1, 2, 3, Infinity]);
function toPhaseThree(f: ReturnType<typeof fixture>) {
    const [dusk, dawn] = f.npcs, p = f.players[0];
    assert.equal(f.playerHit(dusk, p, 100, "melee"), 0, "Dusk immune in phase one");
    assert.equal(f.playerHit(dawn, p, 100, "melee", 4151), 0, "Dawn airborne");
    assert.equal(f.playerHit(dawn, p, 100, "melee", 3204), 100, "halberd reaches Dawn");
    f.playerHit(dawn, p, 10000, "ranged");
    assert.equal(dawn.getHitpoints(), 248);
    assert.equal((f.e as GuardiansEncounter).phase, 2);
    assert.equal(f.playerHit(dawn, p, 30, "magic"), 0);
    assert.equal(f.playerHit(dusk, p, 40, "ranged"), 0);
    assert.equal(f.playerHit(dusk, p, 40, "magic"), 0);
    f.playerHit(dusk, p, 10000, "melee");
    assert.equal(dusk.getHitpoints(), 248);
    assert.equal((f.e as GuardiansEncounter).phase, 3);
    assert.equal(f.playerHit(dawn, p, 40, "ranged"), 0, "transition lightning is invulnerable");
    f.cycle(10);
    f.control.nextDawn = f.control.nextDusk = Infinity;
    assert.equal(f.control.spheres.length, 3);
}
{
    const f = fixture(true, 2);
    toPhaseThree(f);
    const [dusk, dawn] = f.npcs, p = f.players[0], g = f.e as GuardiansEncounter;
    assert.equal(f.playerHit(dusk, p, 10000, "melee"), 0, "phase-three Dusk still immune");
    f.playerHit(dawn, p, 10000, "ranged");
    assert.equal(dawn.getHitpoints(), 1, "manual finisher required");
    assert.equal(g.finish(dawn, p), false);
    f.inventory.get(p)!.add(4162);
    p.teleport(dawn.tileX - 1, dawn.tileY, 0);
    assert(g.finish(dawn, p));
    assert.equal(g.phase, 4);
    assert.equal(dusk.size, 6);
    assert.equal(dusk.presentationTypeId, 7888);
    assert.equal(dusk.combat.defenceLevel, 150);
    assert.equal(f.control.prisons.length, 2, "every party member has an independent prison");
    assert.equal(f.playerHit(dusk, p, 40, "melee"), 0, "first prison is immune");
    const prison = f.control.prisons[0];
    p.teleport(prison.gap.x, prison.gap.y, 0);
    f.cycle(5);
    assert(!f.hits.some(h => h.player === p && h.tick === 15), "missing flame tile is safe even at arena edge");
    assert(f.hits.some(h => h.player === f.players[1] && h.tick === 15), "failed teammate prison hurts independently");
    f.playerHit(dusk, p, 10000, "melee");
    assert.equal(dusk.getHitpoints(), 1);
    p.teleport(dusk.tileX - 1, dusk.tileY, 0);
    assert(g.finish(dusk, p));
    assert.equal(dusk.getHitpoints(), 0);
    f.cycle();
    const hits = f.hits.length;
    f.cycle(50);
    assert.equal(f.hits.length, hits, "no post-death timers leak");
}
{
    const f = fixture(true);
    toPhaseThree(f);
    const dawn = f.npcs[1], p = f.players[0];
    const sphere = f.control.spheres[0];
    p.teleport(sphere.x, sphere.y, 0);
    f.cycle();
    assert.equal(f.control.spheres.length, 2, "walking into sphere costs no HP");
    p.teleport(f.e.room.inside.x, f.e.room.inside.y, 0);
    dawn.applyDamage(100);
    const before = dawn.getHitpoints();
    f.cycle(23);
    assert.equal(dawn.getHitpoints(), before + 180, "each unabsorbed orb heals 90");
    assert.equal(f.control.spheres.length, 0);
    f.e.dispose();
}
{
    const f = fixture(true);
    toPhaseThree(f);
    const dawn = f.npcs[1], p = f.players[0];
    p.varps.setVarbitValue(GARGOYLE_SMASHER_VARBIT, 1);
    assert.equal(f.playerHit(dawn, p, 10000, "ranged"), 248, "smasher unlock bypasses manual hammer");
    assert.equal((f.e as GuardiansEncounter).phase, 4);
    f.e.dispose();
}
{
    const f = fixture(true), [dusk, dawn] = f.npcs, p = f.players[0];
    const q = new DeferredHitQueue({ resolveEntity: ref => ref.type === "player" ? p : f.npcs.find(n => n.id === ref.id) });
    const attack: any = { attacker: { type: "player", id: p.id }, target: { type: "npc", id: dusk.id }, attackClock: 0, traits: { type: "ranged", style: null, rangeTiles: 10, speedTicks: 4, weaponId: 861 } };
    q.enqueue({ attack, source: attack.attacker, target: attack.target, damage: 40, maxHit: 40, landed: true, hitsplatType: DeferredHitsplatType.Normal, attackType: "ranged", revealClock: 1, profileId: "test" });
    q.processTick(1, { hitsplats: [] } as never);
    assert.equal(dusk.getHitpoints(), 450, "real deferred pipeline enforces impact-time phase immunity");
    f.e.dispose();
    assert.equal(dawn.filterPlayerDamage, undefined);
    assert.equal(dusk.onPlayerHit, undefined);
}
console.log("Gryphon counters/corrosion/winds and Guardians phases/gear gates/prisons/spheres/lifecycle passed.");
for (const dodge of [false, true]) {
    const f = fixture(true, 2), p = f.players[0];
    f.control.dawnAttacks = 3;
    const freezes: number[] = [];
    for (const p of f.players)
        p.applyFreeze = (duration) => { freezes.push(duration); return true; };
    f.control.dawnAttack(p);
    f.cycle();
    assert.equal(f.hits.length, 0);
    if (dodge)
        for (const p of f.players)
            p.tileY += 2;
    f.cycle();
    assert.equal(f.hits.length, dodge ? 0 : 2, "stone ball hits everyone in its targeted 3x3, never homes after launch");
    if (!dodge)
        assert.deepEqual(freezes, [10, 10]);
    f.e.dispose();
}
for (const dodge of [false, true]) {
    const f = fixture(true), p = f.players[0], dusk = f.npcs[0];
    f.control.phase = 2;
    p.teleport(dusk.tileX - 1, dusk.tileY, 0);
    f.control.wing();
    f.cycle(11);
    assert.equal(f.hits.length, 0, "wing has a twelve-tick charge");
    if (dodge)
        p.tileX--;
    f.cycle();
    assert.equal(f.hits.length, dodge ? 0 : 1);
    if (!dodge)
        assert(f.hits[0].damage >= 25 && f.hits[0].damage <= 29);
    f.e.dispose();
}
{
    const f = fixture(true);
    f.control.phase = 2;
    f.control.rockfall();
    const shadows = f.graphics.filter(g => g.spotId >= 1446 && g.spotId <= 1449);
    assert(shadows.length >= 9 && shadows.length <= 10);
    assert.equal(new Set(shadows.map(g => `${g.tile.x}:${g.tile.y}`)).size, shadows.length);
    const first = shadows[0];
    f.players[0].teleport(first.tile.x, first.tile.y, 0);
    f.cycle(first.durationTicks - 1);
    assert.equal(f.stuns.length, 0);
    f.cycle();
    assert(f.stuns.includes(10), "centre of falling rock stuns for ten ticks");
    f.e.dispose();
    const hits = f.hits.length;
    f.cycle(30);
    assert.equal(f.hits.length, hits, "disposal cancels remaining rock impacts");
}
for (const protect of [false, true]) {
    const f = fixture(true), p = f.players[0];
    f.control.evaluate = (_: any, _p: any, _type: any, max: number) => ({ landed: true, damage: max });
    if (protect)
        f.prayers.get(p)!.add("protect_from_missiles");
    f.control.dawnAttack(p);
    f.cycle(3);
    assert.deepEqual(f.hits.map(h => h.damage), protect ? [4, 4] : [9, 9], "Dawn rolls two ranged hits with partial protection");
    f.e.dispose();
}
{
    const f = fixture(), p = f.players[0], boss = f.npcs[0];
    p.skillSystem.setSkillXp(SkillId.Magic, 13034431);
    const attack: any = { attacker: { type: "player", id: p.id }, target: { type: "npc", id: boss.id }, attackClock: 1, traits: { type: "magic", style: null, rangeTiles: 10, speedTicks: 5, spellId: 3273 } };
    boss.elementalWeakness = undefined;
    const base = f.e.evaluator.evaluate(attack);
    boss.elementalWeakness = { element: "wind", percent: 50 };
    const wind = f.e.evaluator.evaluate(attack);
    assert.equal(wind.attackRoll, Math.floor(base.attackRoll * 1.5));
    assert.equal(wind.maxHit, base.maxHit + Math.floor(base.maxHit * 0.5));
    attack.traits.spellId = 3275;
    const water = f.e.evaluator.evaluate(attack);
    boss.elementalWeakness = undefined;
    const waterBase = f.e.evaluator.evaluate(attack);
    assert.equal(water.attackRoll, waterBase.attackRoll);
    assert.equal(water.maxHit, waterBase.maxHit);
    f.e.dispose();
}
console.log("Rockfall, wing warning, two-hit volleys, stone-ball freezing and wind-only weakness passed.");
