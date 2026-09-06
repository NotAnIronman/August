import assert from "node:assert/strict";

import type { ServerServices } from "@server/game/ServerServices";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { InstancedAreaManager } from "@server/world/InstancedAreaManager";

const ENCOUNTER_ID = "instance-boss-hud-lifecycle-test";
const BOSS_TYPE_ID = 59_999;
const NEXT_ENCOUNTER_ID = "instance-next-boss-hud-lifecycle-test";
const NEXT_BOSS_TYPE_ID = 59_998;
if (!EncounterRegistry.shared.get(ENCOUNTER_ID)) {
    EncounterRegistry.shared.register({
        id: ENCOUNTER_ID,
        npcTypeIds: [BOSS_TYPE_ID],
        maxHealth: 255,
        bossHealthBar: { name: "Framework Boss", npcTypeId: BOSS_TYPE_ID },
        phases: [
            { id: "opening", startsAtHealthPercent: 100 },
            { id: "enraged", startsAtHealthPercent: 50 },
        ],
        thresholds: [
            { id: "summon-adds", atHealthPercent: 75 },
            { id: "shield", atHealthPercent: 50 },
        ],
        attacks: [
            {
                id: "melee",
                type: AttackType.Melee,
                rangeTiles: 1,
                speedTicks: 4,
            },
        ],
    });
}
if (!EncounterRegistry.shared.get(NEXT_ENCOUNTER_ID)) {
    EncounterRegistry.shared.register({
        id: NEXT_ENCOUNTER_ID,
        npcTypeIds: [NEXT_BOSS_TYPE_ID],
        maxHealth: 500,
        bossHealthBar: {
            name: "Next Framework Boss",
            npcTypeId: NEXT_BOSS_TYPE_ID,
            markers: [],
        },
        attacks: [{ id: "melee", type: AttackType.Melee, rangeTiles: 1, speedTicks: 4 }],
    });
}

function createPlayer(id: number, name: string): PlayerState {
    const player = {
        id,
        name,
        worldViewId: -1,
        instanceNpcIds: new Set<number>(),
    };
    return player as unknown as PlayerState;
}

const owner = createPlayer(100, "Owner");
const member = createPlayer(101, "Member");
const widgetEvents: Array<{ playerId: number; event: Record<string, unknown> }> = [];

const scriptServices = {
    variables: {
        sendVarp: () => {
            throw new Error("custom boss HUD must not emit a legacy varp");
        },
        sendVarbit: () => {
            throw new Error("custom boss HUD must not emit a legacy varbit");
        },
    },
    dialog: {
        openSubInterface: () => {
            throw new Error("custom boss HUD must not mount group 303");
        },
        closeSubInterface: () => {
            throw new Error("custom boss HUD must not close group 303");
        },
        queueWidgetEvent: (playerId: number, event: Record<string, unknown>) => {
            widgetEvents.push({ playerId, event });
        },
    },
} as unknown as ScriptServices;

let nextNpcId = 700;
let bossHealth = 255;
const npcs = new Map<
    number,
    {
        id: number;
        typeId: number;
        getHitpoints(): number;
        getMaxHitpoints(): number;
    }
>();
const services = {
    players: {
        getById: (id: number) => id === owner.id ? owner : id === member.id ? member : undefined,
    },
    mapService: { buildInstanceCollision: () => [] },
    pathService: {
        registerWorldViewCollision: () => undefined,
        removeWorldViewCollision: () => undefined,
    },
    npcManager: {
        spawnTransientNpc: (spawn: { id: number }) => {
            const npc = {
                id: nextNpcId++,
                typeId: spawn.id,
                getHitpoints: () => bossHealth,
                getMaxHitpoints: () => 255,
            };
            npcs.set(npc.id, npc);
            return npc;
        },
        getById: (id: number) => npcs.get(id),
        removeNpc: (id: number) => npcs.delete(id),
    },
    movementService: {
        teleportToInstance: () => undefined,
        teleportPlayer: () => undefined,
    },
    locationService: {},
    scriptScheduler: { cancelOwner: () => 0 },
    groundItems: { removeByWorldView: () => undefined },
    scriptRuntime: { getServices: () => scriptServices },
} as unknown as ServerServices;

const instances = new InstancedAreaManager(services);
const bossHudEvents = (playerId?: number) =>
    widgetEvents.filter(
        ({ playerId: eventPlayerId, event }) =>
            event.action === "set_boss_health_bar" &&
            (playerId === undefined || eventPlayerId === playerId),
    );
const createParty = () =>
    instances.create(owner, {
        definitionId: "framework-room",
        templateChunks: [],
        destination: { x: 3200, y: 3200, level: 0 },
        access: "party",
        maxPlayers: 2,
        npcs: [{ id: BOSS_TYPE_ID, offsetX: 52, offsetY: 52, level: 0 }],
    });

const room = createParty();
assert(room);
assert.deepEqual(
    bossHudEvents(),
    [{
        playerId: owner.id,
        event: {
            action: "set_boss_health_bar",
            active: true,
            npcTypeId: BOSS_TYPE_ID,
            name: "Framework Boss",
            current: 255,
            maximum: 255,
            markers: [
                { percent: 75, label: "summon-adds", style: "mechanic" },
                { percent: 50, label: "shield", style: "mechanic" },
            ],
        },
    }],
    "omitted marker configuration derives mechanic thresholds and phase gates",
);

assert(instances.join(member, room.id));
assert.equal(
    bossHudEvents(member.id).length,
    1,
    "joining a party sends one authoritative encounter snapshot",
);

bossHealth = 211;
instances.syncBossHealthBars();
assert.deepEqual(
    bossHudEvents()
        .filter(({ event }) => event.active === true && event.current === 211)
        .map(({ playerId }) => playerId)
        .sort((a, b) => a - b),
    [owner.id, member.id],
    "one framework tick sends one changed snapshot to every member",
);
const stableHudUpdateCount = widgetEvents.length;
instances.syncBossHealthBars();
assert.equal(widgetEvents.length, stableHudUpdateCount, "unchanged custom HUD state is deduplicated");

assert.equal(instances.leave(owner), true);
assert.deepEqual(
    bossHudEvents(owner.id).at(-1)?.event,
    { action: "set_boss_health_bar", active: false },
    "the explicit leave path sends one inactive snapshot",
);

// PlayerDeathService and disconnect cleanup both terminate the room through
// InstancedAreaManager.dispose(), so this covers their shared lifecycle surface.
assert.equal(instances.dispose(member), true);
assert.deepEqual(
    bossHudEvents(member.id).at(-1)?.event,
    { action: "set_boss_health_bar", active: false },
    "the death/dispose path sends one inactive snapshot",
);
assert.equal(instances.getById(room.id), undefined);

const reconnectRoom = createParty();
assert(reconnectRoom);
const ownerEventsBeforeDisconnect = bossHudEvents(owner.id).length;
assert.equal(instances.dispose(owner), true);
assert.equal(
    bossHudEvents(owner.id).length,
    ownerEventsBeforeDisconnect + 1,
    "disconnect cleanup emits exactly one final HUD event",
);
assert.deepEqual(bossHudEvents(owner.id).at(-1)?.event, {
    action: "set_boss_health_bar",
    active: false,
});

const dynamicRoom = instances.create(owner, {
    definitionId: "dynamic-framework-room",
    templateChunks: [],
    destination: { x: 3200, y: 3200, level: 0 },
    access: "party",
    maxPlayers: 2,
});
assert(dynamicRoom);
const ownerEventsBeforeDynamicBoss = bossHudEvents(owner.id).length;
let firstDynamicHealth = 255;
const firstDynamicBoss = {
    id: 900,
    typeId: BOSS_TYPE_ID,
    worldViewId: dynamicRoom.worldViewId,
    getHitpoints: () => firstDynamicHealth,
    getMaxHitpoints: () => 255,
} as unknown as import("@server/game/npc").NpcState;
npcs.set(firstDynamicBoss.id, firstDynamicBoss);
assert.equal(instances.attachNpc(dynamicRoom.id, firstDynamicBoss), true);
assert.equal(owner.instanceNpcIds.has(firstDynamicBoss.id), true);
assert.equal(
    bossHudEvents(owner.id).length,
    ownerEventsBeforeDynamicBoss + 1,
    "a late boss sends one owner snapshot",
);
assert.equal(bossHudEvents(owner.id).at(-1)?.event.npcTypeId, BOSS_TYPE_ID);
assert.equal(instances.detachNpc(firstDynamicBoss.id), true);
assert.equal(owner.instanceNpcIds.has(firstDynamicBoss.id), false);
assert.equal(instances.attachNpcByWorldView(firstDynamicBoss), true);
assert.equal(owner.instanceNpcIds.has(firstDynamicBoss.id), true, "a queued respawn reattaches by view");

assert(instances.join(member, dynamicRoom.id));
assert.equal(member.instanceNpcIds.has(firstDynamicBoss.id), true);
firstDynamicHealth = 0;
instances.syncBossHealthBars();
assert.equal(
    bossHudEvents().filter(({ event }) => event.active === true).at(-1)?.event.current,
    0,
);
const replacementSameBoss = {
    id: 902,
    typeId: BOSS_TYPE_ID,
    worldViewId: dynamicRoom.worldViewId,
    getHitpoints: () => 255,
    getMaxHitpoints: () => 255,
} as unknown as import("@server/game/npc").NpcState;
npcs.set(replacementSameBoss.id, replacementSameBoss);
assert.equal(instances.attachNpc(dynamicRoom.id, replacementSameBoss), true);
instances.syncBossHealthBars();
assert.equal(
    bossHudEvents().filter(({ event }) => event.active === true).at(-1)?.event.current,
    255,
    "HUD resolution prefers a live replacement form over a retained dead actor",
);
assert.equal(instances.detachNpc(replacementSameBoss.id), true);
npcs.delete(replacementSameBoss.id);
const secondDynamicBoss = {
    id: 901,
    typeId: NEXT_BOSS_TYPE_ID,
    worldViewId: dynamicRoom.worldViewId,
    getHitpoints: () => 500,
    getMaxHitpoints: () => 500,
} as unknown as import("@server/game/npc").NpcState;
npcs.set(secondDynamicBoss.id, secondDynamicBoss);
const eventsBeforeBossSwitch = bossHudEvents().length;
assert.equal(instances.attachNpc(dynamicRoom.id, secondDynamicBoss), true);
assert.equal(
    bossHudEvents().length,
    eventsBeforeBossSwitch + 2,
    "a sequential boss sends one replacement snapshot to every member",
);
assert.deepEqual(
    widgetEvents.filter(({ event }) => event.action === "set_boss_health_bar").at(-1)?.event,
    {
        action: "set_boss_health_bar",
        active: true,
        npcTypeId: NEXT_BOSS_TYPE_ID,
        name: "Next Framework Boss",
        current: 500,
        maximum: 500,
        markers: [],
    },
    "explicit empty markers survive a sequential boss transition",
);

assert.equal(instances.detachNpc(firstDynamicBoss.id), true);
npcs.delete(firstDynamicBoss.id);
assert.equal(owner.instanceNpcIds.has(firstDynamicBoss.id), false);
assert.equal(member.instanceNpcIds.has(firstDynamicBoss.id), false);
assert.equal(instances.detachNpc(secondDynamicBoss.id), true);
npcs.delete(secondDynamicBoss.id);
const recycledWorldNpc = {
    id: secondDynamicBoss.id,
    typeId: 1,
    worldViewId: -1,
    getHitpoints: () => 1,
    getMaxHitpoints: () => 1,
};
npcs.set(recycledWorldNpc.id, recycledWorldNpc);
assert.equal(instances.dispose(owner), true);
assert.equal(instances.dispose(member), true);
assert.strictEqual(
    npcs.get(recycledWorldNpc.id),
    recycledWorldNpc,
    "instance cleanup must not remove an unrelated NPC which reused a detached runtime id",
);

const duoRoom=instances.create(owner,{definitionId:"duo-boss-test",templateChunks:[],destination:{x:3000,y:3000,level:0}})!;
let duoHealth=255;
const duoFirst={id:8800,typeId:BOSS_TYPE_ID,worldViewId:duoRoom.worldViewId,getHitpoints:()=>duoHealth,getMaxHitpoints:()=>255};
const duoSecond={id:8801,typeId:NEXT_BOSS_TYPE_ID,worldViewId:duoRoom.worldViewId,getHitpoints:()=>400,getMaxHitpoints:()=>500};
npcs.set(8800,duoFirst);npcs.set(8801,duoSecond);
instances.attachNpc(duoRoom.id,duoFirst as never);instances.attachNpc(duoRoom.id,duoSecond as never);
assert.equal(bossHudEvents(owner.id).at(-1)?.event.npcTypeId,BOSS_TYPE_ID);
duoHealth=0;instances.syncBossHealthBars();
assert.equal(bossHudEvents(owner.id).at(-1)?.event.npcTypeId,NEXT_BOSS_TYPE_ID,"switch to an already-present surviving Guardian");
assert.equal(bossHudEvents(owner.id).at(-1)?.event.current,400);
instances.dispose(owner);
console.log("instance boss health bar lifecycle tests passed");
