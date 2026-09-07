import assert from "node:assert/strict";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { NyloEncounter, nyloHealth, nyloWaveCount } from "@server/content/modules/theatre-of-blood/NyloEncounter";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100, skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100, hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const mode = createTestGamemode("nylo-tests", "Nylo tests");
function fixture(size = 1) {
    let tick = 0, id = 1000;
    const npcs = new Map<number, NpcState>(), hits: number[] = [], cleared: number[] = [];
    const players = Array.from({ length: size }, (_, i) => new PlayerState(i + 1, 3290 + i, 4245, 0, mode));
    for (const p of players) {
        p.worldViewId = 4000;
        p.name = `p${p.id}`;
        p.__saveKey = p.name;
        p.skillSystem.setSkillXp(SkillId.Hitpoints, 13034431);
    }
    const blueprint = new NpcState(99, 8355, 4, 8002, 8003, 32, { x: 3294, y: 4247, level: 0 }, { worldViewId: 4000, maxHitpoints: 2500 });
    const services: any = { system: { getCurrentTick: () => tick }, instances: { getMemberPlayers: () => players, attachNpc: () => true },
        equipment: { computeEquipmentStatBonuses: () => [] }, npc: { spawnNpc: (s: any) => {
                const n = new NpcState(++id, s.id, s.id >= 8355 ? 4 : s.id >= 8345 ? 2 : 1, -1, -1, 32, { x: s.x, y: s.y, level: 0 }, { worldViewId: s.worldViewId });
                npccheck(n);
                return n;
            }, removeNpc: (n: number) => npcs.delete(n), queueNpcSeq: () => { } }, animation: { playLocGraphic: () => { } }, projectiles: { launch: () => { } },
        movement: { getPathService: () => undefined, clearPlayerTarget: (p: PlayerState) => { cleared.push(p.id); p.removeCombatTarget(); } },
        messaging: { sendGameMessage: () => { } }, combat: { getNpc: (id: number) => npcs.get(id), applyNpcDamageToPlayer: (_n: any, _p: any, _s: number, d: number) => { hits.push(d); return { amount: d }; } } };
    function npccheck(n: NpcState) { npcs.set(n.id, n); }
    const e = new NyloEncounter(blueprint, "instance", players.map(p => p.name), services, () => { });
    for (const p of players)
        e.admit(p);
    const cycle = (n = 1) => { for (let i = 0; i < n; i++)
        e.tick(++tick); };
    const kill = (n: NpcState) => { n.applyDamage(n.getHitpoints()); e.killed(n); };
    return { e, players, npcs, hits, cleared, services, cycle, kill, tick: () => tick };
}
for (let size = 1; size <= 5; size++) {
    assert.equal(nyloWaveCount(size), size * 5);
    assert.equal(nyloHealth(false, size), size === 5 ? 11 : size === 4 ? 9 : 8);
    assert.equal(nyloHealth(true, size), size === 5 ? 22 : size === 4 ? 19 : 16);
    const f = fixture(size);
    assert.equal(f.npcs.size, 0, "no boss before waves");
    for (let i = 0; i < 1200 && !f.e.bossActive; i++) {
        f.cycle();
        assert(f.e.adds.size <= 15);
        for (const a of [...f.e.adds.values()])
            f.kill(a.npc);
    }
    assert(f.e.bossActive, `size ${size} finishes all waves and split children`);
    assert.equal(f.e.waves, size * 5);
    assert.equal(f.e.bossStyle, "melee");
    assert.equal(f.e.boss.getMaxHitpoints(), size === 5 ? 2500 : size === 4 ? 2187 : 1875);
    const p = f.players[0];
    assert.equal(f.e.boss.filterPlayerDamage!(p, 50, "magic", f.tick()), 0);
    assert.equal(f.e.boss.filterPlayerDamage!(p, 50, "melee", f.tick()), 50);
    f.cycle(10);
    assert.notEqual(f.e.bossStyle, "melee");
    const first = f.e.bossStyle;
    f.cycle(10);
    assert.notEqual(f.e.bossStyle, first);
    f.e.dispose();
    assert.equal(f.e.boss.filterPlayerDamage, undefined);
}
{
    const f = fixture(2);
    f.cycle(2);
    const a = [...f.e.adds.values()][0], p = f.players[0], q = f.players[1];
    const wrong = a.style === "magic" ? "melee" : "magic";
    assert.equal(a.npc.filterPlayerDamage!(p, 0, wrong, 2), 0, "even a missed wrong-style hit locks the spider");
    assert.equal(a.npc.filterPlayerDamage!(p, 20, a.style, 2), 0);
    assert.equal(a.npc.filterPlayerDamage!(q, 20, a.style, 2), 20, "teammate remains eligible");
    p.raidProgress.spectating = true;
    assert(!p.canAttack());
    assert(!p.canBeAttacked());
    f.e.dispose();
    assert.equal(f.npcs.size, 0);
    f.cycle(100);
    assert.equal(f.npcs.size, 0, "cleanup cancels waves");
}
{
    const f = fixture(5);
    f.cycle(40);
    assert.equal(f.e.adds.size, 15, "waves pause at active cap");
    const waves = f.e.waves;
    f.cycle(5);
    assert.equal(f.e.waves, waves);
    const a = [...f.e.adds.values()][0];
    f.cycle(7);
    assert(!f.e.adds.has(a.npc.id), "50-tick lifetime destroys an add");
    assert(f.e.adds.size <= 15);
    f.e.dispose();
}
{
    const f = fixture();
    f.cycle(2);
    const a = [...f.e.adds.values()][0], p = f.players[0];
    const control = f.e as any;
    control.evaluator.evaluate = () => ({ damage: 70 });
    p.prayer.hasPrayerActive = () => true;
    control.hit(a.npc, p, "melee", 70, true, f.tick());
    assert.equal(f.hits.pop(), 0);
    control.hit(a.npc, p, "ranged", 70, true, f.tick());
    f.cycle(2);
    assert.equal(f.hits.pop(), 17);
    p.prayer.hasPrayerActive = () => false;
    control.hit(a.npc, p, "magic", 70, true, f.tick());
    f.cycle(2);
    assert.equal(f.hits.pop(), 70);
    f.e.dispose();
}
console.log("Nylo: all party sizes, 5 waves/person, cap, splits, lifetime, style lock, morphs and prayer damage passed");
