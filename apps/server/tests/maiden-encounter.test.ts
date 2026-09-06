import assert from "node:assert/strict";
import { MaidenEncounter, maidenTarget, maidenSpawnTiles, maidenDrainSkills } from "@server/content/modules/theatre-of-blood/MaidenEncounter";
import { theatreOrbHealth } from "@server/content/modules/theatre-of-blood/TheatreHud";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { HITMARK_HEAL } from "@server/game/combat/HitEffects";
function fixture(size = 1) {
    let tick = 0, next = 10, wipes = 0;
    const npcs = new Map<number, any>(), hits: any[] = [], launches: any[] = [], graphics: any[] = [], seqs: number[] = [];
    function npc(id: number, x: number, y: number, hp: number, typeId = 8360) {
        const n: any = { id, typeId, tileX: x, tileY: y, level: 0, worldViewId: 4000, size: typeId === 8360 ? 6 : typeId === 8366 ? 2 : 1, hp, maxHp: hp,
            getHitpoints() { return this.hp; }, getMaxHitpoints() { return this.maxHp; }, configureHitpoints(h: number) { this.hp = h; this.maxHp = h; },
            frozen: false, isFrozen() { return this.frozen; }, hasPath: () => false, setPath() { } };
        npcs.set(id, n);
        return n;
    }
    const boss = npc(1, 3162, 4444, 2625);
    const players = Array.from({ length: size }, (_, i) => {
        const skills = new Map<number, {
            baseLevel: number;
            boost: number;
        }>();
        return { id: i + 1, name: `p${i}`, __saveKey: `p${i}`, tileX: 3170 + i, tileY: 4446, level: 0, worldViewId: 4000, protected: false,
            prayer: { hasPrayerActive: () => players[i].protected }, skillSystem: { getSkill: (s: number) => { if (!skills.has(s))
                    skills.set(s, { baseLevel: 99, boost: 0 }); return skills.get(s)!; },
                setSkillBoost: (s: number, current: number) => { const v = players[i].skillSystem.getSkill(s); v.boost = current - v.baseLevel; } } } as any;
    });
    const services: any = { system: { getCurrentTick: () => tick }, instances: { getMemberPlayers: () => players, attachNpc: () => true },
        npc: { spawnNpc: (c: any) => npc(next++, c.x, c.y, 1, c.id), removeNpc: (id: number) => npcs.delete(id), queueNpcSeq: (_n: any, seq: number) => seqs.push(seq), moveNpcTo: () => true },
        movement: { getPathService: () => undefined }, equipment: { computeEquipmentStatBonuses: () => [0, 0, 0, 150, 0] },
        animation: { playLocGraphic: (g: any) => graphics.push(g) }, projectiles: { launch: (p: any) => launches.push(p) },
        combat: { getNpc: (id: number) => npcs.get(id), applyNpcHitsplat: (n: any, style: number, d: number) => { assert.equal(style, HITMARK_HEAL); n.hp = Math.min(n.maxHp, n.hp + d); },
            applyNpcDamageToPlayer: (_n: any, p: any, _style: number, d: number) => {
                const hp = p.skillSystem.getSkill(SkillId.Hitpoints), amount = Math.min(d, Math.max(0, hp.baseLevel + hp.boost));
                hp.boost -= amount;
                hits.push({ p, damage: d, amount });
                return { amount };
            } } };
    const encounter = new MaidenEncounter(boss, "one", players.map(p => p.name), services, () => wipes++);
    players.forEach(p => encounter.admit(p));
    const cycle = (t: number) => { tick = t; encounter.tick(t); };
    return { encounter, boss, players, npcs, hits, launches, graphics, seqs, services, cycle, wipes: () => wipes };
}
for (let size = 1; size <= 5; size++) {
    const f = fixture(size);
    f.boss.hp = 1800;
    f.cycle(1);
    assert.equal(f.encounter.adds.size, size * 2);
    assert([...f.encounter.adds.values()].every(n => n.getMaxHitpoints() === (size === 5 ? 200 : size === 4 ? 175 : 150)));
    assert.equal(f.boss.presentationTypeId, 8361);
    assert.equal(f.boss.id, 1);
    assert.equal(f.boss.hp, 1800);
    f.cycle(2);
    assert.equal(f.encounter.adds.size, size * 2, "threshold runs once");
    f.boss.hp = 700;
    f.cycle(3);
    assert.equal(f.encounter.adds.size, size * 6, "skipping health thresholds does not skip waves");
    assert.equal(f.boss.presentationTypeId, 8363);
    f.boss.hp = 2000;
    f.cycle(4);
    assert.equal(f.encounter.adds.size, size * 6, "healing never rearms a threshold");
    f.encounter.dispose();
}
assert.deepEqual(maidenSpawnTiles(5).slice(-2), maidenSpawnTiles(4).slice(-2), "fifth pair shares farthest tiles by request");
{
    const f = fixture(3), [a, b, c] = f.players;
    Object.assign(a, { tileX: 3164, tileY: 4443 });
    Object.assign(b, { tileX: 3164, tileY: 4450 });
    Object.assign(c, { tileX: 3168, tileY: 4445 });
    assert.equal(maidenTarget(f.boss, [c, b, a], [a.name, b.name, c.name]), b, "north/east preference then orb order");
    Object.assign(b, { tileY: 4451 });
    assert.equal(maidenTarget(f.boss, [c, b, a], [a.name, b.name, c.name]), c, "distance before orb order");
    assert.deepEqual(maidenDrainSkills([50, 100, 20, 90, 95]), [SkillId.Attack, SkillId.Strength]);
    assert.deepEqual(maidenDrainSkills([0, 0, 0, 100, 50]), [SkillId.Magic]);
    assert.deepEqual(maidenDrainSkills([0, 0, 0, 0, 10]), [SkillId.Ranged]);
    assert.deepEqual(maidenDrainSkills([-30, -20, -40, -10, -50]), [SkillId.Magic], "negative bonuses still select the highest actual bonus");
}
{
    const f = fixture();
    f.encounter.rng.next = () => 0.99;
    f.cycle(10);
    assert.equal(f.launches[0].projectileId, 1577);
    assert.equal(f.hits.length, 0);
    f.players[0].skillSystem.setSkillBoost(SkillId.Hitpoints, 10);
    f.cycle(11);
    assert.equal(f.hits[0].damage, 36, "launch roll is not capped at target HP");
    const g = fixture();
    g.players[0].protected = true;
    g.encounter.rng.next = () => 0.99;
    g.cycle(10);
    g.cycle(11);
    assert.equal(g.hits[0].damage, 18);
    const h = fixture();
    h.encounter.rng.next = () => 0.99;
    h.cycle(10);
    h.players[0].worldViewId = 4001;
    h.cycle(11);
    assert.equal(h.hits.length, 0);
    assert.equal(h.wipes(), 1);
}
{
    const f = fixture();
    f.boss.hp = 1800;
    f.cycle(1);
    const add: any = [...f.encounter.adds.values()][0];
    Object.assign(add, { tileX: 3168, tileY: 4445, hp: 40, frozen: true });
    f.cycle(2);
    assert.equal(f.encounter.absorbed, 0, "frozen healer cannot be absorbed");
    add.frozen = false;
    f.cycle(3);
    assert.equal(f.encounter.absorbed, 1);
    assert.equal(f.boss.hp, 1880);
    assert(!f.npcs.has(add.id));
    f.cycle(4);
    assert.equal(f.encounter.absorbed, 1, "absorption counts only once");
    const dead: any = [...f.encounter.adds.values()][0];
    dead.hp = 0;
    f.cycle(5);
    assert.equal(f.encounter.absorbed, 1);
}
{
    const f = fixture();
    f.encounter.rng.next = () => 0;
    f.cycle(10);
    assert(f.launches.every(p => p.projectileId === 1578));
    f.cycle(11);
    assert.equal(f.hits.length, 0, "first tick after splat launch remains safe");
    assert.equal(f.encounter.blood.size, 0);
    f.cycle(12);
    assert(f.hits.some(h => h.damage === 10));
    assert.equal(f.players[0].skillSystem.getSkill(SkillId.Prayer).boost, -10);
    assert(f.encounter.bloodSpawns.size > 0);
    assert([...f.encounter.bloodSpawns.values()].every(n => n.getMaxHitpoints() === 120));
    assert(f.graphics.every(g => g.worldViewId === 4000));
    const count = f.launches.length;
    f.cycle(20);
    assert.equal(f.launches[count].projectileId, 1577, "first attack after splats is normal");
    const count2 = f.launches.length;
    f.cycle(30);
    assert.equal(f.launches[count2].projectileId, 1577, "second attack after splats is normal");
    f.encounter.dispose();
    assert.equal(f.encounter.blood.size, 0);
    assert.equal(f.encounter.bloodSpawns.size, 0);
    const hits = f.hits.length;
    f.cycle(40);
    assert.equal(f.hits.length, hits);
}
{
    const f = fixture();
    f.encounter.rng.next = () => 0.99;
    (f.encounter as any).patch({ x: 3170, y: 4446 }, 0, 34, false);
    f.players[0].tileX = 3171;
    f.cycle(1);
    assert.equal(f.hits.length, 0, "moving off the marked tile dodges damage");
    f.cycle(34);
    assert.equal(f.encounter.blood.size, 0);
    assert.equal(theatreOrbHealth(f.players[0]), 27);
    f.players[0].skillSystem.setSkillBoost(SkillId.Hitpoints, 0);
    assert.equal(theatreOrbHealth(f.players[0]), 30);
    assert.equal(theatreOrbHealth(), 31);
}
{
    const f = fixture(), rolls = [0.99, 0.99, 0];
    f.encounter.rng.next = () => rolls.shift() ?? 0.99;
    f.cycle(10);
    f.services.equipment.computeEquipmentStatBonuses = () => [200, 0, 0, 0, 0];
    f.cycle(11);
    assert.equal(f.players[0].skillSystem.getSkill(SkillId.Magic).boost, -7, "drain uses launch equipment and actual damage");
    assert.equal(f.players[0].skillSystem.getSkill(SkillId.Attack).boost, 0, "switching gear after launch cannot change the selected drain");
    const zero = fixture(), zeroRolls = [0.99, 0, 0];
    zero.encounter.rng.next = () => zeroRolls.shift() ?? 0.99;
    zero.cycle(10);
    zero.cycle(11);
    assert.equal(zero.hits[0].damage, 0, "zero is an allowed successful damage roll");
    assert.equal(zero.players[0].skillSystem.getSkill(SkillId.Magic).boost, 0, "zero damage does not drain stats");
}
{
    const f=fixture();f.encounter.rng.next=()=>0;f.cycle(10);f.cycle(11);
    f.players[0].tileX++;
    f.cycle(12);
    assert.equal(f.hits.length,0,"moving during the two-tick splat window avoids the targeted tile");
    assert(f.launches.every(p=>p.endCycleOffset===60),"all splat projectiles arrive after two ticks");
}
console.log("Maiden: order, waves/scaling, absorption/freezes, hit timing/protection, stat-drain snapshots, two-tick splats, hazards, disposal and orb states passed");
