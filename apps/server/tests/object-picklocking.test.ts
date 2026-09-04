import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { ActionRequest } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import type { ScriptServices, ScriptInventoryEntry } from "@server/game/scripts/types";
import { resolveLocTransformId } from "@server/world/LocTransforms";
import { CollisionOverlayStore } from "@server/world/CollisionOverlayStore";
import { DoorCollisionService } from "@server/world/DoorCollisionService";
import type { DoorDefinitionLoader } from "@server/world/DoorDefinitionLoader";
import { DoorStateManager } from "@server/world/DoorStateManager";
import { CollisionFlag } from "@server/pathfinding/engine/flag/CollisionFlag";
import { register, getPicklockDoorDestination, getPicklockDoorSide } from "@server/content/gamemodes/vanilla/skills/thieving/picklock";
import { PICKLOCK_OPTION_AUDIT, PICKLOCK_DOORS, PICKLOCK_CHESTS, normalizePicklockOption } from "@server/content/gamemodes/vanilla/skills/thieving/picklockDefinitions";

function harness() {
    const registry = new ScriptRegistry();
    const cleanup: Array<() => void> = [];
    registry.registerCleanup = (fn) => { cleanup.push(fn); return { unregister: fn }; };
    let currentTick = 10;
    let boost = 0;
    let baseLevel = 99;
    let pathSteps: Array<{ x: number; y: number }> = [];
    let adjacent = true;
    let blocked = false;
    let approximate = false;
    let snapshots = 0;
    const xp: number[] = [];
    const messages: string[] = [];
    const changes: unknown[][] = [];
    const temporary: unknown[][] = [];
    const teleports: number[][] = [];
    const animations: number[] = [];
    const damages: number[] = [];
    const requests: ActionRequest[] = [];
    const varbits = new Map<number, number>([[235, 0]]);
    const inventory: ScriptInventoryEntry[] = Array.from({ length: 28 }, (_, slot) => ({ slot, itemId: -1, quantity: 0 }));
    const p = {
        id: 1, tileX: 100, tileY: 100, level: 0, worldViewId: -1,
        status: { hitpointsCurrent: 50 }, canInteract: () => true,
        varps: { getVarbitValue: (id: number) => varbits.get(id) ?? 0, setVarbitValue: (id: number, value: number) => varbits.set(id, value) },
        setPath: (steps: typeof pathSteps) => { pathSteps = steps; },
        peekNextStep: () => pathSteps[0],
        clearPath: () => { pathSteps = []; },
    };
    const skillSystem = {getHitpointsCurrent: () => p.status.hitpointsCurrent};
    Object.assign(p,{skillSystem});
    const player = p as unknown as PlayerState;
    const defs = new Map([
        [5490, { id: 5490, actions: ["Open", null, null, null, "Pick-Lock"] }],
        [5491, { id: 5491, actions: ["Climb-down", "Close"] }],
        [5492, { id: 5492, actions: [] as (string | null)[], transforms: [5490, 5491, 5490, 5490, -1], transformVarbit: 235 }],
        [11735, { id: 11735, actions: ["Open", "Search for traps", "Pick-lock"] }],
        [11736, { id: 11736, actions: ["Open", "Search for traps", "Pick-lock"] }],
        [11727, { id: 11727, actions: ["Open", "Pick-lock"] }],
        [5501, { id: 5501, actions: ["Open", "Pick-lock"] }],
        [9565, { id: 9565, actions: ["Open", "Pick-lock"] }],
        [22681, { id: 22681, actions: ["Open", "Pick-lock"] }],
    ]);
    const overlays = new CollisionOverlayStore();
    // Generic catalog shares the open model with the content-specific pair.
    const doorDefinitions = {
        getGateDef: () => undefined,
        getDoubleDoorDef: () => undefined,
        getSingleDoorPair: (id: number) => id === 3270 || id === 3271 ? { closed: 3270, opened: 3271 } : undefined,
    } as unknown as DoorDefinitionLoader;
    const manager = new DoorStateManager(
        { load: () => ({ name: "Door", types: [0], actions: ["Open"], blocksProjectile: true }) },
        doorDefinitions, new DoorCollisionService(overlays), undefined, undefined,
        (x, y, level, idHint) => ({ id: idHint ?? 11727, x, y, level, rotation: 0, type: 0 }),
    );
    const services = {
        system: { getCurrentTick: () => currentTick },
        data: { getLocDefinition: (id: number) => defs.get(id) },
        location: {
            doorManager: manager,
            isAdjacentToLoc: () => adjacent,
            resolveLocTransformId,
            sendLocChangeToPlayer: (...args: unknown[]) => changes.push(args),
            emitLocChange: (...args: unknown[]) => changes.push(args),
            replaceTemporaryLoc: (...args: unknown[]) => temporary.push(args),
            clearTemporaryLoc: (...args: unknown[]) => temporary.push(args),
        },
        skills: { getSkill: () => ({ baseLevel, boost }), addSkillXp: (_p: PlayerState, _id: number, amount: number) => xp.push(amount) },
        variables: { sendVarbit: () => {} },
        sound: { sendSound: () => {}, playAreaSound: () => {} },
        animation: { playPlayerSeq: (_p: PlayerState, id: number) => animations.push(id) },
        messaging: { sendGameMessage: (_p: PlayerState, text: string) => messages.push(text) },
        equipment: { getEquipArray: () => [] },
        inventory: {
            getInventoryItems: () => inventory.map((entry) => ({ ...entry })),
            setInventorySlot: (_p: PlayerState, slot: number, itemId: number, quantity: number) => { inventory[slot] = { slot, itemId, quantity }; },
            addItemToInventory: (_p: PlayerState, itemId: number, quantity: number) => {
                const slot = inventory.find((s) => s.itemId === itemId && s.quantity > 0) ?? inventory.find((s) => s.itemId < 0);
                if (!slot) return { added: 0, slot: -1 };
                slot.itemId = itemId; slot.quantity += quantity;
                return { added: quantity, slot: slot.slot };
            },
            snapshotInventory: () => { snapshots++; },
        },
        combat: {
            requestAction: (_p: PlayerState, request: ActionRequest) => { requests.push(request); return { ok: true }; },
            scheduleAction: (_id: number, request: ActionRequest) => { requests.push(request); return { ok: true }; },
            applyPlayerHitsplat: (_p: PlayerState, _style: number, damage: number) => { damages.push(damage); return {}; },
        },
        movement: {
            teleportPlayer: (_p: PlayerState, ...args: number[]) => teleports.push(args),
            getPathService: () => ({
                findPathSteps: ({ to }: { to: { x: number; y: number } }) => {
                    assert.equal(overlays.applyOverlay(3038, 3956, 0, CollisionFlag.WALL_WEST) & CollisionFlag.WALL_WEST, 0, "door collision opens before pathfinding");
                    return { ok: !blocked, steps: [to], end: to, clamped: approximate };
                },
                canActorStep: () => !blocked,
            }),
        },
    } as unknown as ScriptServices;
    register(registry, services);
    function click(id: number, action: string, tick = currentTick) {
        const placement = PICKLOCK_CHESTS.find(d => d.locId === id)?.placements[0];
        const route = PICKLOCK_DOORS.find(d => d.locId === id)?.routes?.[0];
        const tile = placement ?? (route ? {...route.tile,level:route.level} : {x:100,y:100,level:0});
        p.tileX = tile.x; p.tileY = tile.y; p.level = tile.level;
        registry.findLocInteraction(id, action)?.({ player, services, tick, locId: id, tile, level: tile.level, action });
    }
    function execute() {
        const request = requests.shift();
        assert.ok(request, "interaction should queue an action");
        return registry.findActionHandler(request.kind)!({ player, services, tick: currentTick, data: request.data });
    }
    function tick(t: number) {
        currentTick = t;
        for (const fn of registry.getTickHandlers()) fn({ tick: t, services });
    }
    return { registry, player, p, services, inventory, xp, requests, messages, changes, teleports, animations, damages,
        click, execute, tick, manager, overlays, varbits, cleanup, temporary, getSnapshots: () => snapshots,
        setLevel: (base: number, value: number = 0) => { baseLevel = base; boost = value; },
        setAdjacent: (value: boolean) => { adjacent = value; },
        setBlocked: (value: boolean) => { blocked = value; },
        setApproximate: (value: boolean) => { approximate = value; },
        getSteps: () => pathSteps,
    };
}

const snapshot = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../data/generated/cache/locs.json"), "utf8")) as Array<{ id: number; name: string; actions: (string | null)[] }>;
const matches = snapshot.filter((d) => d.actions?.some((a) => normalizePicklockOption(a ?? undefined) === "picklock"));
const audited = PICKLOCK_OPTION_AUDIT.flatMap((g) => [...g.ids]).sort((a, b) => a - b);
assert.equal(new Set(audited).size, audited.length, "no duplicated audit IDs");
assert.deepEqual(audited, matches.map((d) => d.id).sort((a, b) => a - b), "all snapshot options have an explicit disposition");
assert.equal(matches.length, 65);
assert.equal(matches.filter((d) => /chest/i.test(d.name)).length, 18);
assert.equal(matches.filter((d) => /door|gate/i.test(d.name)).length, 37);

for (const action of ["Search for traps", "Pick-lock", "Picklock"]) {
    const h = harness();
    h.setLevel(25, 3);
    h.click(11736, action); h.execute(); h.execute();
    assert.deepEqual(h.xp, [25], "boosted levels accepted for native/alias actions");
    assert.equal(h.inventory.find((s) => s.itemId === 561)?.quantity, 1);
    assert.equal(h.inventory.find((s) => s.itemId === 995)?.quantity, 3);
    assert.equal(h.getSnapshots(), 1);
    assert.equal(h.temporary[0]?.[2], 171, "success replaces closed chest with reviewed open model");
    h.click(11736, action); h.execute();
    assert.deepEqual(h.xp, [25], "no duplicate chest rewards during cooldown");
    h.tick(35);
    assert.equal(h.temporary.length, 2, "expiry restores original chest");
    h.click(11736, action); h.execute(); h.execute();
    assert.deepEqual(h.xp, [25, 25], "respawn permits a fresh reward");
}
{
    const h = harness();
    for (let slot = 0; slot < 27; slot++) h.inventory[slot] = { slot, itemId: 2000 + slot, quantity: 1 };
    const before = h.inventory.map((s) => ({ ...s }));
    h.click(11736, "Pick-lock"); h.execute(); h.execute();
    assert.deepEqual(h.inventory, before, "first output rolls back when second cannot fit");
    assert.deepEqual(h.xp, []);
    assert.equal(h.getSnapshots(), 0);
    h.inventory[0] = { slot: 0, itemId: -1, quantity: 0 };
    h.click(11736, "Pick-lock"); h.execute(); h.execute();
    assert.deepEqual(h.xp, [25], "failed inventory commit does not deplete the chest");
}
for (const interrupt of [
    (h: ReturnType<typeof harness>) => h.setLevel(25, 0),
    (h: ReturnType<typeof harness>) => { h.p.tileX++; },
    (h: ReturnType<typeof harness>) => { h.p.level += 1; },
    (h: ReturnType<typeof harness>) => { h.p.worldViewId = 2; },
    (h: ReturnType<typeof harness>) => { h.p.status.hitpointsCurrent = 0; },
    (h: ReturnType<typeof harness>) => h.setAdjacent(false),
]) {
    const h = harness();
    h.setLevel(25, 3);
    h.click(11736, "Pick-lock"); h.execute();
    interrupt(h); h.execute();
    assert.deepEqual(h.xp, [], "revalidate every delayed action");
    assert.equal(h.inventory.every((s) => s.itemId === -1), true);
    assert.equal(h.requests.length, 0);
}
{
    const h = harness();
    h.click(11736, "Open");
    const trapResult = h.execute();
    assert.equal(trapResult.effects?.[0]?.type, "hitsplat", "trap damage is dispatched through action effects");
    assert.deepEqual(h.damages, [9]);
    assert.deepEqual(h.xp, []);
    assert.equal(h.requests.length, 0);
    h.click(22681, "Pick-lock");
    h.click(22681, "Open");
    assert.equal(h.requests.length, 0, "unverified chest cannot manufacture loot");
    for (const id of [9565]) { h.click(id, "Pick-lock"); h.execute(); }
    assert.deepEqual(h.xp, [], "unmapped inside-only doors stay gated");
}
const realRandom = Math.random;
try {
    Math.random = () => 0;
    {
        const side = PICKLOCK_DOORS.find(d=>d.locId===11727)!.routes![0].sides[0];
        const original = side.policy;
        side.policy = "free"; // Synthetic policy fixture, restored below; no live free-exit claim.
        try {
            for (const action of ["Open","Pick-lock"]) {
                const h=harness();h.setLevel(1); // no required lockpick
                h.click(11727,action);
                if(action==="Pick-lock") h.execute();
                assert.equal(h.manager.getOpenDoorCount(),1,"free side skips requirements and random failure");
                assert.equal(h.requests.length,0,"free side has no retry/reward action");
                h.p.tileX=3037;h.player.clearPath();h.tick(11);
                assert.deepEqual(h.xp,[],"free Pick-lock and Open both give zero XP");
            }
        } finally {side.policy=original;}
    }
    {
        const h = harness();
        h.click(5492, "Pick-lock"); h.execute(); h.execute();
        assert.equal(h.varbits.get(235), 1);
        assert.deepEqual(h.xp, [4]);
        h.click(5490, "Pick-lock"); h.execute();
        assert.deepEqual(h.xp, [4], "stale closed-child packets cannot farm HAM XP");
        h.click(5491, "Close");
        assert.equal(h.varbits.get(235), 0);
        h.click(5492, "Climb-down");
        assert.equal(h.teleports.length, 0, "cannot climb through the locked parent");
        h.click(5492, "Pick-lock"); h.execute(); h.execute();
        h.click(5491, "Climb-down");
        assert.deepEqual(h.teleports, [[3149, 9652, 0]]);
        assert.equal(h.varbits.get(235), 0);
    }
    {
        const h = harness();
        h.click(11727, "Pick-lock"); h.execute();
        assert.match(h.messages.at(-1)!, /lockpick/);
        h.inventory[0] = { slot: 0, itemId: 1523, quantity: 1 };
        h.click(11727, "Pick-lock"); h.execute();
        h.inventory[0] = { slot: 0, itemId: -1, quantity: 0 };
        h.execute();
        assert.equal(h.manager.getOpenDoorCount(), 0, "removed tool invalidates pending attempt");
    }
    for (const end of ["arrive", "walk-away", "timeout", "cleanup", "blocked", "approximate", "external-close"]) {
        const h = harness();
        h.inventory[0] = { slot: 0, itemId: 1523, quantity: 1 };
        h.setBlocked(end === "blocked"); h.setApproximate(end === "approximate");
        h.click(11727, "Pick-lock"); h.execute(); h.execute();
        assert.deepEqual(h.xp, [], "XP waits for traversal");
        assert.deepEqual(h.teleports, [], "doors never teleport");
        if (end === "arrive") { h.p.tileX = 3037; h.player.clearPath(); h.tick(11); }
        if (end === "walk-away") { h.player.clearPath(); h.tick(11); }
        if (end === "timeout") h.tick(18);
        if (end === "cleanup") for (const fn of h.cleanup) fn();
        if (end === "external-close") {
            const closed = h.manager.toggleDoor({x:3037,y:3956,level:0,currentId:3271,action:"close"});
            assert.equal(closed?.newLocId,11727,"generic Close preserves content pair rather than generic3270");
            h.player.clearPath(); h.tick(11);
        }
        assert.equal(h.manager.getOpenDoorCount(), 0, end + " closes the actual door manager state");
        assert.ok(h.overlays.applyOverlay(3038, 3956, 0, 0) & CollisionFlag.WALL_WEST, end + " restores wall collision");
        assert.deepEqual(h.xp, end === "arrive" ? [35] : []);
        assert.equal(h.changes.length, end === "external-close" ? 1 : 2, "cleanup never reopens an externally closed door");
    }
    Math.random = () => 0.99;
    {
        const h = harness();
        h.click(5492, "Pick-lock"); h.execute(); h.execute();
        assert.deepEqual(h.animations, [537]);
        assert.equal(h.requests[0]?.delayTicks, 5, "failure retains HAM retry cadence");
        h.setAdjacent(false); h.execute();
        assert.equal(h.requests.length, 0, "walking away ends retries");
    }
} finally { Math.random = realRandom; }

for (let rotation = 0; rotation < 4; rotation++) {
    const tile = { x: 10, y: 10 };
    const to = getPicklockDoorDestination(tile, rotation, tile)!;
    assert.equal(Math.abs(to.x - tile.x) + Math.abs(to.y - tile.y), 1);
    assert.deepEqual(getPicklockDoorDestination(tile, rotation, to), tile);
    assert.equal(getPicklockDoorDestination(tile, rotation, { x: 11, y: 11 }), undefined);
}
{
    const jail = PICKLOCK_DOORS.find((d) => d.locId === 5501)!;
    const tile = { x: 10, y: 10 };
    assert.equal(getPicklockDoorSide(jail, tile, 0, tile).policy, "blocked");
    // Synthetic exact-route contract; these coordinates are not game evidence.
    const def = { ...jail, routes: [{ tile, level: 0, rotation:0, openedId:1547, sides: [
        { from: tile, to: { x: 9, y: 10 }, policy: "free" as const, evidence: "synthetic fixture" },
    ] }] };
    assert.equal(getPicklockDoorSide(def, tile, 0, tile).policy, "free");
    assert.equal(getPicklockDoorSide(def, tile, 0, { x: 9, y: 10 }).policy, "blocked");
    assert.equal(getPicklockDoorSide(def, tile, 1, tile).policy, "blocked");
}
console.log("object-picklocking: audit, atomic rewards, revalidation, HAM and door lifecycle passed");
