import assert from "node:assert/strict";
import { register, enrageCleaveTiles } from "@server/content/modules/araxxor-instance";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import { NpcAttackDecision } from "@server/game/scripts/types";
import { AttackType } from "@server/game/combat/AttackType";

const attacks = new Map<number, (event: any) => unknown>();
const cleanups: Array<() => void> = [];
const registry = { registerCleanup: (fn: () => void) => cleanups.push(fn), registerLocInteraction() {},
    registerNpcAttack: (id: number, fn: (event: any) => unknown) => attacks.set(id, fn),
    registerNpcPreDeath() {}, registerNpcScript() {} };
let tick = 0, nextId = 10, nextTask = 0;
const tasks = new Map<number, { at: number; fn: (tick: number) => void }>();
const live = new Map<number, any>();
const spawned: any[] = [], damages: number[] = [], playerDamages: number[] = [], holds: number[] = [];
function body(id: number, typeId: number, x: number, y: number, size = 1, hp = 65): any {
    const npc = { id, typeId, tileX: x, tileY: y, size, level: 0, worldViewId: 1,
        hp, getHitpoints: () => npc.hp, getMaxHitpoints: () => hp, applyDamage: (n: number) => { npc.hp -= n; } };
    live.set(id, npc); return npc;
}
const boss = body(1, 13668, 3630, 9813, 7, 1020);
const player = { id: 8, tileX: 3638, tileY: 9815, level: 0, worldViewId: 1 };
const owned = new Set([boss.id]);
const runtime = { generation: 0, rng: { nextInt: () => 0 }, ownNpc: (id: number) => owned.add(id),
    releaseNpc: (id: number) => owned.delete(id), ownTask() {}, releaseTask() {}, runMechanic() {},
    snapshotOwnedResources: () => ({ npcRuntimeIds: owned }) };
const services: any = {
    system: { getCurrentTick: () => tick }, encounters: { ensure: () => runtime, getByNpcRuntimeId: () => runtime },
    instances: { get: () => ({ id: 1, definitionId: "araxxor-lair", access: "solo" }), getMemberPlayers: () => [player] },
    npc: { spawnNpc: (config: any) => { const n = body(nextId++, config.id, config.x, config.y); spawned.push(n); return n; },
        removeNpc: (id: number) => live.delete(id), queueNpcSeq() {}, queueNpcForcedChat() {}, engageCombat() {},
        findNearbyNpc: () => boss, stopNpcMovement: (_n: unknown, hold = 0) => holds.push(hold) },
    messaging: { sendGameMessage() {} },
    combat: { getNpc: (id: number) => live.get(id),
        applyPlayerDamageToNpc: (_p: unknown, n: any) => damages.push(n.id),
        applyNpcDamageToPlayer: (_n: unknown, p: any) => playerDamages.push(p.id) },
    scheduler: { after: (delay: number, fn: (tick: number) => void) => { const id = ++nextTask; tasks.set(id, { at: tick + delay, fn }); return id; } },
};
function advance(to: number) {
    while (tick < to) { tick++; for (const [id, task] of [...tasks]) if (task.at <= tick) { tasks.delete(id); task.fn(tick); } }
}
register(registry as never, services);
try {
    const enrage = EncounterRegistry.shared.get("araxxor")!.attacks.find(a => a.id === "enraged-melee")!;
    assert.equal(enrage.rangeTiles, 2); assert.equal(enrage.preferredDistance, 1);
    for (let i = 0; i < 100; i++) {
        attacks.get(13668)!({ npc: boss, target: player, services, tick, attack: { traits: { type: AttackType.Melee } } });
        advance(tick + 2);
    }
    assert.equal(spawned.filter(n => [13670, 13672, 13674].includes(n.typeId)).length, 6, "six eggs total, never replenished");
    assert.equal(spawned.filter(n => [13671, 13673, 13675].includes(n.typeId)).length, 6, "each egg hatches at most once");
    const ruptura = body(500, 13673, 3638, 9815, 1, 58);
    const minion1 = body(501, 13671, 3638, 9816), minion2 = body(502, 13671, 3639, 9815);
    owned.add(minion1.id); owned.add(minion2.id); owned.add(ruptura.id);
    const event = { npc: ruptura, target: player, services, tick };
    const before = tasks.size;
    assert.equal(attacks.get(13673)!(event), NpcAttackDecision.Prevent);
    attacks.get(13673)!(event);
    assert.equal(tasks.size, before + 1, "arming twice cannot schedule two explosions");
    assert.deepEqual(holds, [0, 4], "stop current path and hold movement through explosion tick");
    advance(tick + 2); assert.equal(damages.length, 0);
    player.tileX = 3660; // escaping during the three-tick warning is possible
    advance(tick + 1);
    assert.equal(playerDamages.length, 0);
    assert(damages.includes(boss.id), "blast reaches the boss footprint, despite its distant SW anchor");
    assert(damages.includes(501) && damages.includes(502), "all minions of the same type receive damage");
    assert.equal(live.has(ruptura.id), false);
    for (const [x, y, vertical] of [[3638,9816,true], [3628,9816,true], [3633,9821,false], [3633,9811,false]] as const) {
        const strip = enrageCleaveTiles(boss, { tileX: x, tileY: y, level: 0 });
        assert.equal(new Set(strip.map(t => vertical ? t.x : t.y)).size, 1);
        assert.equal(new Set(strip.map(t => vertical ? t.y : t.x)).size, 3);
    }
} finally { for (const cleanup of cleanups) cleanup(); }
console.log("Araxxor six-egg limit, delayed stationary Ruptura, footprint/AoE damage and orthogonal cleaves passed");
