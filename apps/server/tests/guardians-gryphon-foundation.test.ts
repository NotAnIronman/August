import assert from "node:assert/strict";
import { register, VARBIT_GUARDIANS_UNLOCKED, BRITTLE_KEY } from "@server/content/modules/guardians-gryphon";
import { BOSS_ROOMS, roomGeometry } from "@server/content/modules/guardians-gryphon/rooms";
import { encounterEligibility } from "@server/content/modules/guardians-gryphon/rewards";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { GUARDIANS_GRYPHON_COMBAT_STATS } from "@server/data/guardiansGryphonCombatStats";
import { GUARDIANS_DROP_TABLE, GRYPHON_DROP_TABLE } from "@server/content/gamemodes/vanilla/data/guardiansGryphonDrops";
import { DropRollService } from "@server/game/drops/DropRollService";
import { resolveDropTable } from "@server/game/drops/dropTableResolver";
import type { ScriptServices } from "@server/game/scripts/types";
import { MANUAL_NPC_DROP_OVERRIDES } from "@server/game/drops/manualTables";
const record = (player: any, damage: number) => ({ primaryLooter: player, eligibleLooters: [player], totalDamage: damage,
    damageSummaries: [{ player, playerId: player.id, totalDamage: damage, hitCount: 1, firstHitTick: 1, lastHitTick: 2, damageByType: new Map([["melee", damage]]) }] });
let disposePrevious = () => { };
function harness() {
    disposePrevious();
    const players: any[] = [], rooms = new Map<string, any>(), npcs: any[] = [], spawns: any[] = [], drops: any[] = [], messages: string[] = [], tasks = new Map<number, () => void>();
    let dialog: any, killed: ((player: any, npc: any) => void) | undefined, next = 1, saves = 0, rolls = 0;
    const player = (id: number, keyCount = 0) => {
        const varps = new Map(), log = new Map();
        const p: any = { id, tileX: 3427, tileY: 3542, level: 2, worldViewId: -1, keyCount,
            varps: { getVarbitValue: (id: number) => varps.get(id) ?? 0, setVarbitValue: (id: number, value: number) => varps.set(id, value) },
            collectionLog: { incrementCategoryStat: (id: number) => log.set(id, (log.get(id) ?? 0) + 1), getCategoryStat: (id: number) => ({ count1: log.get(id) ?? 0 }) },
            items: { hasItem: (id: number) => id === BRITTLE_KEY && p.keyCount > 0, removeItem: () => ({ completed: p.keyCount > 0 ? (p.keyCount--, 1) : 0 }) } };
        players.push(p);
        return p;
    };
    const services: any = {
        system:{getCurrentTick:()=>0}, equipment:{},
        instances: { get: (id: number) => [...rooms.values()].find(r => r.memberPlayerIds.includes(id)), getById: (id: string) => rooms.get(id),
            buildTemplate: (copies: any) => copies, create: (p: any, spec: any) => {
                const room = { ...spec, id: `room-${next++}`, worldViewId: 4000 + next, memberPlayerIds: [p.id], ownerPlayerId: p.id, ownerName: `Player ${p.id}` };
                rooms.set(room.id, room);
                p.worldViewId = room.worldViewId;
                p.tileX = spec.destination.x;
                p.tileY = spec.destination.y;
                p.level = spec.destination.level;
                return room;
            }, markStarted: () => { }, attachNpc: () => true,
            getMemberPlayers: (id: string) => players.filter(p => rooms.get(id)?.memberPlayerIds.includes(p.id)),
            listJoinable: (definitionId: string) => [...rooms.values()].filter(r => r.definitionId === definitionId && r.access === "party"),
            join: (p: any, id: string) => {
                const room = rooms.get(id);
                if (!room || room.memberPlayerIds.length >= room.maxPlayers)
                    return;
                room.memberPlayerIds.push(p.id);
                p.worldViewId = room.worldViewId;
                p.tileX = room.destination.x;
                p.tileY = room.destination.y;
                p.level = room.destination.level;
                return room;
            },
            leave: (p: any, tile: any) => {
                const r = services.instances.get(p.id);
                if (!r)
                    return false;
                r.memberPlayerIds = r.memberPlayerIds.filter((id: number) => id !== p.id);
                if (!r.memberPlayerIds.length)
                    rooms.delete(r.id);
                p.worldViewId = -1;
                p.tileX = tile.x;
                p.tileY = tile.y;
                p.level = tile.level;
                return true;
            },
        },
        npc: { spawnNpc: (spec: any) => {
                spawns.push(spec);
                const n = { ...spec, typeId: spec.id, id: next++, tileX: spec.x, tileY: spec.y,
                    getMaxHitpoints: () => GUARDIANS_GRYPHON_COMBAT_STATS[spec.id].hitpoints, getHitpoints:()=>0, suppressDrops: false, clearPath(){}, size:4 };
                npcs.push(n);
                return n;
            }, removeNpc: () => true, disengageCombat(){} },
        messaging: { sendGameMessage: (_p: any, message: string) => messages.push(message) },
        variables: { sendVarbit: () => { }, queueVarp: () => { } }, inventory: { snapshotInventoryImmediate: () => { } }, appearance: { savePlayerSnapshot: () => saves++ },
        dialog: { openDialogOptions: (_p: any, d: any) => dialog = d }, movement: { teleportPlayer: () => { } },
        combat: { registerOnNpcKilled: (fn: any) => { killed = fn; return () => killed = undefined; }, getDropEligibility: (npc: any) => npc.record,
            rollNpcDrops: (npc: any, eligibility: any) => { assert(!npc.suppressDrops); rolls++; return eligibility.eligibleLooters.map((p: any) => ({ itemId: 21726, quantity: 60, ownerId: p.id })); } },
        groundItems: { spawn: (id: number, qty: number, tile: any, options: any) => drops.push({ id, qty, tile, ...options }) }, collectionLog: { trackCollectionLogItem: () => { } },
        scheduler: { after: (_delay: number, fn: () => void) => { const id = next++; tasks.set(id, fn); return id; }, cancel: (id: number) => tasks.delete(id) },
    };
    const registry = new ScriptRegistry(), cleanups: Array<() => void> = [];
    const registerCleanup = registry.registerCleanup.bind(registry);
    registry.registerCleanup = fn => { const handle = registerCleanup(fn); cleanups.push(() => handle.unregister()); return handle; };
    disposePrevious = () => { for (const cleanup of cleanups.reverse())
        cleanup(); };
    register(registry, services as ScriptServices);
    const click = (p: any, loc: number, action: string) => registry.findLocInteraction(loc, action)?.({ player: p, services, tick: 1 } as never);
    return { player, services, click, select: (choice: number) => dialog.onSelect(choice), rooms, npcs, spawns, drops, tasks, messages,
        kill: (p: any, npc: any) => killed!(p, npc), get saves() { return saves; }, get rolls() { return rolls; } };
}
for (const reverse of [false, true]) {
    const h = harness(), leader = h.player(1, 1), member = h.player(2);
    h.click(leader, 31681, "unlock");
    assert.equal(leader.keyCount, 0);
    assert.equal(leader.varps.getVarbitValue(VARBIT_GUARDIANS_UNLOCKED), 1);
    assert.equal(h.saves, 1);
    h.select(1);
    const room = [...h.rooms.values()][0];
    assert.equal(room.multiCombat, true);
    assert.equal(room.maxPlayers, 5);
    assert.deepEqual(room.sceneBase, roomGeometry(BOSS_ROOMS[0]).sceneBase);
    assert.deepEqual(h.spawns.map(n => [n.id, n.x, n.y]), [[7882, 1689, 4573], [7852, 1701, 4573]]);
    assert(h.spawns.every(n => n.worldViewId === room.worldViewId && n.ownerPlayerId === undefined && !n.respawns));
    h.click(member, 31681, "join party");
    h.select(0);
    assert.equal(member.worldViewId, -1, "every party member needs their own unlock");
    member.keyCount = 1;
    h.click(member, 31681, "unlock");
    h.select(2);
    h.select(0);
    assert.equal(member.worldViewId, leader.worldViewId);
    assert.deepEqual([member.tileX, member.tileY, member.level], [1696, 4567, 0]);
    const [dusk, dawn] = h.npcs;
    dusk.record = record(leader, 450);
    dawn.record = record(member, 450);
    const [first, last] = reverse ? [dawn, dusk] : [dusk, dawn];
    h.kill(leader, first);
    assert(first.suppressDrops);
    assert.equal(h.rolls, 0);
    assert.equal(h.tasks.size, 0, "one Guardian cannot respawn independently");
    h.kill(member, last);
    assert(last.suppressDrops);
    assert.equal(h.rolls, 1);
    assert.deepEqual(h.drops.map(d => d.ownerId).sort(), [1, 2]);
    assert.equal(leader.collectionLog.getCategoryStat(489).count1, 1);
    assert.equal(member.collectionLog.getCategoryStat(489).count1, 1);
    h.kill(member, last);
    assert.equal(h.rolls, 1, "duplicate death notification cannot duplicate rewards");
    [...h.tasks.values()][0]();
    assert.equal(h.spawns.length, 4, "both Guardians respawn together");
    assert.equal(h.saves, 2, "the consumed key is saved exactly once per account");
}
{
    const h = harness(), p = h.player(1);
    p.tileX = 3175;
    p.tileY = 2478;
    p.level = 0;
    h.click(p, 58439, "enter solo");
    const room = [...h.rooms.values()][0];
    assert.equal(room.multiCombat, true);
    assert.equal(room.maxPlayers, 1);
    assert.deepEqual(room.sceneBase, roomGeometry(BOSS_ROOMS[1]).sceneBase);
    assert.deepEqual([h.spawns[0].x, h.spawns[0].y, h.spawns[0].ownerPlayerId], [3179, 8872, p.id]);
    h.npcs[0].record = record(p, 400);
    h.kill(p, h.npcs[0]);
    assert.equal(h.rolls, 1);
    assert.equal(p.collectionLog.getCategoryStat(6337).count1, 1);
    h.click(p, 58442, "exit");
    assert.deepEqual([p.tileX, p.tileY, p.level, p.worldViewId], [3175, 2478, 0, -1]);
    [...h.tasks.values()][0]();
    assert.equal(h.spawns.length, 1, "disposed rooms cannot respawn");
}
{
    const h = harness(), p = h.player(1, 1);
    h.click(p, 31681, "open");
    p.tileX = 3200;
    h.select(1);
    assert.equal(h.rooms.size, 0);
    assert.equal(p.keyCount, 1, "stale menu cannot consume the key or teleport remotely");
    p.tileX = 3427;
    p.varps.setVarbitValue(VARBIT_GUARDIANS_UNLOCKED, 1);
    p.keyCount = 0;
    h.click(p, 31681, "enter solo");
    assert.equal(h.rooms.size, 1, "saved unlock requires no new key");
}
for (const size of [1, 2, 3, 4, 5]) {
    const members = Array.from({ length: size }, (_, i) => ({ id: i, worldViewId: 4000, level: 0 }));
    const required = [0, 0, 120, 100, 80, 60][size];
    const records = [record(members[0], Math.max(1, required))];
    assert.equal(encounterEligibility(records as never, members as never, 400, size, 4000, 0).eligibleLooters.length, 1);
    if (required)
        assert.equal(encounterEligibility([record(members[0], required - 1)] as never, members as never, 400, size, 4000, 0).eligibleLooters.length, 0);
}
for (const [id, table] of [[7882, GUARDIANS_DROP_TABLE], [14860, GRYPHON_DROP_TABLE]] as const) {
    assert.equal(MANUAL_NPC_DROP_OVERRIDES.find(o => o.npcTypeIds.includes(id))?.table, table);
    const resolved = resolveDropTable(table)!;
    assert(resolved);
    assert.equal(resolved.pools.find(p => p.category === "main")?.rolls, 2);
    assert.equal(resolved.pools.find(p => p.category === "tertiary")?.rolls, 1);
    const service = new DropRollService({ get: () => resolved } as never), random = Math.random;
    try {
        Math.random = () => 0.5;
        const drops = service.roll({ npcTypeId: id, npcName: id === 7882 ? "Dusk" : "Shellbane gryphon", tile: { x: 1, y: 1, level: 0 }, isWilderness: false,
            recipients: [{ ownerId: 1, dropRateMultiplier: 1 }], worldViewId: 4000 });
        assert(drops.every(d => d.ownerId === 1 && d.worldViewId === 4000));
        assert(!drops.some(d => [12073, 20543, 23083].includes(d.itemId)), "no unconditional clue/casket/Konar key awards");
        assert(drops.some(d => d.itemId === (id === 7882 ? 21726 : 31235)));
    }
    finally {
        Math.random = random;
    }
}
assert.equal(GUARDIANS_DROP_TABLE.pools![1].entries.filter(e => e.outcomeId === "combat-potions").length, 3);
disposePrevious();
console.log("Guardians/Gryphon foundation: access, shared views, both kill orders, party eligibility, reward dedupe, respawn and loot tables passed.");
