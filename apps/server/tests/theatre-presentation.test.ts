import assert from "node:assert/strict";
import { encodeMessage } from "@server/network/messages";
import { decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";
import { GfxManager } from "@client/engine/rendering/gfx/GfxManager";
import { ProjectileSystem } from "@server/game/systems/ProjectileSystem";
import { CombatBroadcaster } from "@server/network/broadcast/CombatBroadcaster";
import { TheatreHud } from "@server/content/modules/theatre-of-blood/TheatreHud";
const tile = { x: 3175, y: 4446, level: 0 };
for (const durationCycles of [undefined, 1500, 0]) {
    const packet = encodeMessage({ type: "spot", payload: { spotId: 1579, tile, durationCycles } }) as Uint8Array;
    const decoded = decodeServerPacket(packet)!;
    assert.equal(decoded.type, "spot");
    assert.equal(decoded.payload.durationCycles, durationCycles);
    assert.deepEqual(decoded.payload.tile, tile);
}
const gfx: any = new GfxManager({ gfxRenderer: { getCache: () => ({ getDurationTicks: () => 300 }) } } as any);
gfx.spawnAtTile(1579, tile, { durationCycles: 1500, startCycle: 0 });
assert.equal(gfx.instances.values().next().value.durationMs, 30000, "blood stays visible beyond its native six-second animation");
gfx.spawnAtTile(1579, tile, { durationCycles: 1200, startCycle: 0 });
assert.equal(gfx.instances.size, 1, "refresh must not stack graphics");
gfx.spawnAtTile(1579, tile, { durationCycles: 0 });
assert.equal(gfx.instances.size, 0, "death/wipe removes floor graphics immediately");
const viewers = [{ id: 1, worldViewId: 4000, tileX: 3175, tileY: 4446, level: 0 }, { id: 2, worldViewId: 4001, tileX: 3175, tileY: 4446, level: 0 }];
const projectiles: any = new ProjectileSystem({ ticker: { currentTick: () => 1 }, players: { forEach: (fn: any) => viewers.forEach(p => fn({}, p)) } } as any);
projectiles.queueProjectileForViewers({ worldViewId: 4000, source: { tileX: 3175, tileY: 4446, plane: 0 }, target: { tileX: 3175, tileY: 4446, plane: 0 } } as any);
assert.equal(projectiles.pendingProjectilePackets.get(1).length, 1);
assert(!projectiles.pendingProjectilePackets.has(2));
const sent: number[] = [];
const broadcast = new CombatBroadcaster({ forEachPlayer: fn => viewers.forEach(p => fn(p.id as any, p)), withDirectSendBypass: (_s, fn) => fn() });
broadcast.flush({ spotAnimations: [{ tick: 1, spotId: 1579, tile, worldViewId: 4000, durationTicks: 50 }] } as any, { cyclesPerTick: 30, sendWithGuard: (sock: any) => sent.push(sock), broadcast: () => assert.fail("unscoped broadcast"), broadcastToNearby: () => assert.fail("unscoped nearby broadcast") } as any);
assert.deepEqual(sent, [1]);
const opens: any[] = [], scripts: any[] = [], closes: any[] = [], bits: any[] = [];
const instance = { id: "raid", definitionId: "theatre-of-blood:run:0", worldViewId: 4000 };
const player = (name: string, id: number) => ({ id, name, __saveKey: name.toLowerCase(), worldViewId: 4000, displayMode: 1,
    raidProgress: { checkpoint: { runId: "run", status: "active" } }, skillSystem: { getSkill: () => ({ baseLevel: 99, boost: 0 }) } } as any);
const alice = player("Alice", 1), bob = player("Bob", 2);
let members = [bob, alice], live = true;
const hud = new TheatreHud({ instances: { get: () => live ? instance : undefined, getMemberPlayers: () => members,
        theatreRuns: { load: () => ({ roster: ["alice", "bob"] }) } }, viewport: { getViewportTrackerFrontUid: (m: number) => 100 + m },
    variables: { sendVarbit: (_p: any, id: number, v: number) => bits.push([id, v]) },
    dialog: { openSubInterface: (_p: any, ...args: any[]) => opens.push(args), closeSubInterface: (_p: any, ...args: any[]) => closes.push(args),
        queueClientScript: (_id: number, ...args: any[]) => scripts.push(args) } } as any);
hud.watch(alice);
hud.tick();
assert.deepEqual(opens[0][3].preScripts[0].args, ["Alice", "Bob", "", "", ""]);
members = [alice];
hud.tick();
assert(bits.some(([id, v]) => id === 6443 && v === 31), "disconnected teammate keeps second orb");
members = [player("Bob", 9), alice];
hud.tick();
assert.equal(scripts.at(-1)[2], "Bob", "new runtime ID restores saved orb order");
alice.displayMode = 2;
hud.tick();
assert.equal(opens.at(-1)[0], 102);
assert.equal(closes[0][0], 101);
live = false;
hud.tick();
assert.equal(closes.at(-1)[0], 102);
assert.deepEqual(bits.at(-1), [6440, 0]);
console.log("Theatre presentation: timed blood codec/lifetime/cleanup, party-isolated effects, stable roster and HUD remount passed");
