import assert from "node:assert/strict";
import { NpcState, isNpcVisibleToPlayer } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import { SotetsegEncounter, generateSotetsegPath, inSotetsegGrid, sotetsegSharedDamage, sotetsegTileDamage } from "@server/content/modules/theatre-of-blood/SotetsegEncounter";
registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100, skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100, hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const mode = createTestGamemode("sote-tests", "Sotetseg tests");
function fixture(size = 2) {
    let tick = 0, id = 100, wipes = 0;
    const players = Array.from({ length: size }, (_, i) => new PlayerState(i + 1, 3277 + i, 4323, 0, mode));
    for (const p of players) {
        p.name = `p${p.id}`;
        p.__saveKey = p.name;
        p.worldViewId = 4000;
        p.skillSystem.setSkillXp(SkillId.Hitpoints, 13034431);
    }
    const boss = new NpcState(99, 8388, 5, -1, -1, 32, { x: 3278, y: 4326, level: 0 }, { worldViewId: 4000, maxHitpoints: 3000 });
    const npcs = new Map([[99, boss]]), hits: {
        p: PlayerState;
        d: number;
        tick: number;
    }[] = [], graphics: any[] = [], locs = new Map<string, any>(), messages: string[] = [];
    const locKey = (s: any, t: any, old: number) => `${s.ownerPlayerId}:${t.x}:${t.y}:${old}`;
    const services: any = { system: { getCurrentTick: () => tick }, instances: { getMemberPlayers: () => players, attachNpc: () => true },
        npc: { queueNpcSeq: () => { }, disengageCombat: () => { }, spawnNpc: (s: any) => { const n = new NpcState(++id, s.id, 3, 8100, 8100, 0, { x: s.x, y: s.y, level: 0 }, { worldViewId: 4000 }); npccheck(n); return n; }, removeNpc: (id: number) => npcs.delete(id) },
        animation: { playLocGraphic: (g: any) => graphics.push(g), broadcastPlayerSpot: () => { } }, projectiles: { launch: () => { } },
        movement: { clearPlayerTarget: (p: PlayerState) => p.removeCombatTarget(), teleportPlayer: (p: PlayerState, x: number, y: number, l: number) => p.teleport(x, y, l) },
        location: { replaceTemporaryLoc: (s: any, old: number, id: number, t: any) => locs.set(locKey(s, t, old), { s, id, t }), clearTemporaryLoc: (s: any, old: number, t: any) => locs.delete(locKey(s, t, old)) },
        messaging: { sendGameMessage: (_p: any, m: string) => messages.push(m) }, combat: { getNpc: (id: number) => npcs.get(id), queueCombatState: () => { }, applyPrayers: (p: PlayerState, prayers: any) => p.prayer.setActivePrayers(prayers),
            applyNpcDamageToPlayer: (_n: any, p: PlayerState, _style: number, d: number, tick: number) => { hits.push({ p, d, tick }); return { amount: d }; } } };
    function npccheck(n: NpcState) { npcs.set(n.id, n); }
    const e = new SotetsegEncounter(boss, "sote-instance", players.map(p => p.name), services, () => wipes++, new EncounterRandom(819));
    for (const p of players)
        e.admit(p);
    const cycle = (n = 1) => { for (let i = 0; i < n; i++)
        e.tick(++tick); };
    const startMaze = () => { boss.applyDamage(boss.getHitpoints() - Math.floor(boss.getMaxHitpoints() * (e.phase === 0 ? 2 / 3 : 1 / 3))); cycle(); assert(e.maze); };
    return { e, boss, players, npcs, hits, graphics, locs, messages, cycle, startMaze, tick: () => tick, wipes: () => wipes };
}
for (let seed = 1; seed <= 100; seed++) {
    const path = generateSotetsegPath(new EncounterRandom(seed));
    assert.equal(path[0].y, 4310);
    assert.equal(path.at(-1)!.y, 4324);
    assert.equal(new Set(path.map(t => `${t.x},${t.y}`)).size, path.length);
    path.forEach((t, i) => { assert(inSotetsegGrid(t)); if (i)
        assert.equal(Math.abs(t.x - path[i - 1].x) + Math.abs(t.y - path[i - 1].y), 1); });
}
assert.equal(sotetsegSharedDamage(1, 1), 70);
assert.equal(sotetsegSharedDamage(2, 1), 140);
assert.equal(sotetsegSharedDamage(2, 2), 35);
assert.equal(sotetsegSharedDamage(5, 5), 14);
assert.equal(sotetsegTileDamage(99), 21);
{
    const f = fixture(), p = f.players[0], c = f.e as any;
    p.prayer.setActivePrayers(["protect_from_magic", "piety"]);
    c.orbHit(p, "magic", 0);
    assert.equal(f.hits.at(-1)!.d, 0);
    assert(!p.prayer.areProtectionPrayersLocked());
    c.orbHit(p, "ranged", 0);
    assert(p.prayer.areProtectionPrayersLocked());
    assert(!p.prayer.hasPrayerActive("protect_from_magic"));
    assert(p.prayer.hasPrayerActive("piety"));
    for (let i = 0; i < 5; i++)
        p.prayer.advancePrayerLocks();
    assert(!p.prayer.areProtectionPrayersLocked());
    f.e.dispose();
}
for (const count of [1, 2, 5]) {
    const f = fixture(count), c = f.e as any;
    c.sharedBall(f.players, 0);
    f.cycle(6);
    assert(f.hits.some(h => h.tick === 6));
    f.e.dispose();
    assert.equal(f.locs.size, 0);
}
{
    const f = fixture(2), c = f.e as any;
    c.magic(f.players[0], 0);
    c.sharedBall(f.players, 0);
    assert.equal(f.boss.filterPlayerDamage!(f.players[0], 9999, "melee", 0), 1000, "large hit stops exactly at first threshold");
    f.startMaze();
    f.cycle(5);
    assert.equal(f.hits.length, 0, "maze cancels all incoming normal and shared projectiles");
    assert.equal(f.boss.filterPlayerDamage!(f.players[0], 99, "melee", f.tick()), 0);
    const m = f.e.maze!, runner = m.runner, other = f.players.find(p => p !== runner)!;
    assert.equal(runner.encounterVisibility?.group, "shadow");
    assert.equal(other.encounterVisibility?.group, "real");
    const pathLocs = [...f.locs.values()].filter(l => l.id === 33036);
    assert.equal(pathLocs.length, m.path.length);
    assert(pathLocs.every(l => l.s.ownerPlayerId === runner.id));
    const wrong = { x: m.path[0].x === 3273 ? 3286 : 3273, y: 4310 };
    runner.teleport(wrong.x, wrong.y);
    f.cycle();
    assert(f.hits.some(h => h.p === runner));
    assert(!f.hits.some(h => h.p === other), "runner errors never splash teammates");
    assert(f.graphics.some(g => g.spotId === 60000 && g.ownerPlayerId === other.id));
    const fourth = m.path.find(t => t.y === 4313)!;
    other.teleport(fourth.x, fourth.y);
    f.cycle();
    assert(m.tornadoIndex >= 0);
    assert(m.tornado, "tornado appears on the fourth row immediately");
    const third = m.path.find(t => t.y === 4312)!;
    other.teleport(third.x, third.y);
    f.cycle();
    assert.equal(m.tornadoIndex, -1, "retreat despawns tornado");
    other.teleport(fourth.x, fourth.y);
    f.cycle(4);
    assert(m.tornado);
    assert(!isNpcVisibleToPlayer(m.tornado, runner));
    assert(isNpcVisibleToPlayer(m.tornado, other));
    // Disconnect runner: same maze/path, remaining player receives private path.
    f.players.splice(f.players.indexOf(runner), 1);
    f.cycle();
    assert.equal(m.runner, other);
    assert.equal(runner.encounterVisibility, undefined);
    assert([...f.locs.values()].filter(l => l.id === 33036).every(l => l.s.ownerPlayerId === other.id));
    f.e.dispose();
    assert.equal(f.locs.size, 0);
    assert.equal(other.encounterVisibility, undefined);
    assert.equal(f.npcs.size, 1);
}
for (const size of [1, 2, 5]) {
    const f = fixture(size);
    for (let phase = 1; phase <= 2; phase++) {
        const defence = f.boss.getCombatStat("defence");
        f.boss.drainCombatStat("defence", 10);
        f.startMaze();
        const m = f.e.maze!;
        // Every participant must finish; one runner cannot prematurely resume combat.
        for (const t of m.path) {
            for (const p of f.players)
                p.teleport(t.x, t.y);
            f.cycle();
        }
        const end = m.path.at(-1)!;
        f.players[0].teleport(end.x, 4325);
        f.cycle();
        if (size > 1)
            assert(f.e.maze);
        for (const p of f.players)
            p.teleport(end.x, 4325);
        f.cycle();
        assert.equal(f.e.maze, undefined);
        assert.equal(f.e.phase, phase);
        assert.equal(f.locs.size, 0);
        assert.equal(f.boss.getCombatStat("defence"), defence, "maze restores drained Defence");
        assert(f.players.every(p => p.encounterVisibility === undefined));
    }
    assert.equal(f.boss.filterPlayerDamage!(f.players[0], 9999, "melee", f.tick()), 9999, "final phase can die");
    f.e.dispose();
}
{
    const f = fixture(2), c = f.e as any;
    // Isolate the targeted player while another living player remains in arena.
    f.players[1].teleport(3286, 4315);
    c.sharedBall(f.players, 0);
    f.cycle(6);
    assert(f.hits.some(h => h.tick === 6 && h.d >= 121), "unshared group ball is lethal");
    f.e.dispose();
}
{
    const f = fixture(2), c = f.e as any;
    for (let i = 0; i < 10; i++)
        c.magic(f.players[0], 0);
    f.cycle(5);
    assert(f.messages.some(m => m.includes("large ball of energy")));
    assert.equal(f.e.magicAttacks, 0);
    f.e.dispose();
}
{
    const f = fixture();
    f.startMaze();
    for (const p of f.players)
        p.raidProgress.spectating = true;
    f.cycle();
    assert.equal(f.wipes(), 1);
    assert.equal(f.locs.size, 0);
    f.cycle(20);
    assert.equal(f.wipes(), 1);
}
console.log("Sotetseg solo/party attacks, prayers, thresholds, maze privacy, tornado, runner loss and cleanup passed");
