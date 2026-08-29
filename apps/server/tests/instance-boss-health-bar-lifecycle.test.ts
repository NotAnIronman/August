import assert from "node:assert/strict";

import {
    BOSS_HEALTH_BAR_GROUP_ID,
    BossHealthBarVar,
    BossHealthBarVarbit,
} from "@august/protocol/ui/bossHealthBar";
import type { ServerServices } from "@server/game/ServerServices";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { DisplayMode } from "@server/widgets/viewport";
import { InstancedAreaManager } from "@server/world/InstancedAreaManager";

const ENCOUNTER_ID = "instance-boss-hud-lifecycle-test";
const BOSS_TYPE_ID = 59_999;
if (!EncounterRegistry.shared.get(ENCOUNTER_ID)) {
    EncounterRegistry.shared.register({
        id: ENCOUNTER_ID,
        npcTypeIds: [BOSS_TYPE_ID],
        maxHealth: 255,
        bossHealthBar: { name: "Framework Boss", npcTypeId: BOSS_TYPE_ID },
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

const openByPlayer = new Map<number, boolean>();
const varpsByPlayer = new Map<number, Map<number, number>>();

function createPlayer(id: number, name: string): PlayerState {
    const values = new Map<number, number>([[BossHealthBarVarbit.Disabled, 1]]);
    varpsByPlayer.set(id, values);
    const player = {
        id,
        name,
        worldViewId: -1,
        instanceNpcIds: new Set<number>(),
        displayMode: DisplayMode.RESIZABLE_NORMAL,
        widgets: {
            isOpen: (groupId: number) =>
                groupId === BOSS_HEALTH_BAR_GROUP_ID && openByPlayer.get(id) === true,
        },
        varps: {
            getVarbitValue: (varbitId: number) => values.get(varbitId) ?? 0,
            setVarpValue: (varpId: number, value: number) => values.set(varpId, value),
            setVarbitValue: (varbitId: number, value: number) => values.set(varbitId, value),
        },
    };
    return player as unknown as PlayerState;
}

const owner = createPlayer(100, "Owner");
const member = createPlayer(101, "Member");
const opens: Array<{ playerId: number; targetUid: number; groupId: number; opts: any }> = [];
const closes: Array<{ playerId: number; targetUid: number; groupId?: number }> = [];
const sentVarbits: Array<{ playerId: number; id: number; value: number }> = [];
const sentVarps: Array<{ playerId: number; id: number; value: number }> = [];
const scheduledRemounts: Array<{
    ownerId: number;
    delayTicks: number;
    handler: () => void;
}> = [];

const scriptServices = {
    variables: {
        sendVarp: (player: PlayerState, id: number, value: number) =>
            sentVarps.push({ playerId: player.id, id, value }),
        sendVarbit: (player: PlayerState, id: number, value: number) =>
            sentVarbits.push({ playerId: player.id, id, value }),
    },
    dialog: {
        openSubInterface: (
            player: PlayerState,
            targetUid: number,
            groupId: number,
            _type: number,
            opts: any,
        ) => {
            opens.push({ playerId: player.id, targetUid, groupId, opts });
            openByPlayer.set(player.id, true);
        },
        closeSubInterface: (
            player: PlayerState,
            targetUid: number,
            groupId?: number,
        ) => {
            closes.push({ playerId: player.id, targetUid, groupId });
            openByPlayer.set(player.id, false);
        },
        queueWidgetEvent: () => undefined,
    },
    scheduler: {
        after: (
            delayTicks: number,
            handler: () => void,
            ownerScope: { kind: string; id: number },
        ) => {
            scheduledRemounts.push({ ownerId: ownerScope.id, delayTicks, handler });
            return scheduledRemounts.length;
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
assert.equal(opens.length, 1, "creating an instance opens the owner boss HUD");
assert.equal(opens[0]?.playerId, owner.id);
assert.equal(opens[0]?.groupId, BOSS_HEALTH_BAR_GROUP_ID);
assert.deepEqual(opens[0]?.opts.varps, { [BossHealthBarVar.NpcType]: BOSS_TYPE_ID });
assert.deepEqual(opens[0]?.opts.varbits, {
    [BossHealthBarVarbit.Current]: 255,
    [BossHealthBarVarbit.Maximum]: 255,
    [BossHealthBarVarbit.Boss]: 1,
    [BossHealthBarVarbit.Disabled]: 0,
});
assert.deepEqual(
    scheduledRemounts.map(({ ownerId, delayTicks }) => ({ ownerId, delayTicks })),
    [{ ownerId: owner.id, delayTicks: 3 }],
);
const opensBeforeSceneSettles = opens.length;
scheduledRemounts[0]?.handler();
assert.equal(
    opens.length,
    opensBeforeSceneSettles + 1,
    "the generic delayed remount repairs a client-only instance rebuild discard",
);
assert.equal(opens.at(-1)?.playerId, owner.id);

assert(instances.join(member, room.id));
assert.equal(opens.at(-1)?.playerId, member.id, "joining a party opens the same encounter HUD");
const memberDelayedRemount = scheduledRemounts.find((entry) => entry.ownerId === member.id);
assert(memberDelayedRemount);

bossHealth = 211;
instances.syncBossHealthBars();
assert.deepEqual(
    sentVarbits
        .filter((entry) => entry.id === BossHealthBarVarbit.Current && entry.value === 211)
        .map((entry) => entry.playerId)
        .sort((a, b) => a - b),
    [owner.id, member.id],
    "one framework tick updates every member",
);
const stableUpdateCount = sentVarbits.length;
instances.syncBossHealthBars();
assert.equal(sentVarbits.length, stableUpdateCount, "unchanged HUD state is deduplicated");

owner.displayMode = DisplayMode.FIXED;
instances.syncBossHealthBars();
assert.equal(opens.at(-1)?.playerId, owner.id);
assert.equal(opens.at(-1)?.targetUid, (548 << 16) | 44, "a toplevel change remounts the HUD");

openByPlayer.set(member.id, false);
instances.syncBossHealthBars();
assert.equal(opens.at(-1)?.playerId, member.id, "a displaced HUD mount is repaired next tick");

assert.equal(instances.leave(owner), true);
assert.equal(closes.at(-1)?.playerId, owner.id, "the explicit leave path closes the HUD");

// PlayerDeathService and disconnect cleanup both terminate the room through
// InstancedAreaManager.dispose(), so this covers their shared lifecycle surface.
assert.equal(instances.dispose(member), true);
assert.equal(closes.at(-1)?.playerId, member.id, "the death/dispose path closes the HUD");
assert.equal(instances.getById(room.id), undefined);
const opensBeforeStaleMemberRemount = opens.length;
memberDelayedRemount.handler();
assert.equal(
    opens.length,
    opensBeforeStaleMemberRemount,
    "a delayed callback cannot reopen the HUD after the member was disposed",
);

const reconnectRoom = createParty();
assert(reconnectRoom);
const reconnectDelayedRemount = scheduledRemounts.at(-1);
assert.equal(reconnectDelayedRemount?.ownerId, owner.id);
const closesBeforeDisconnect = closes.length;
assert.equal(instances.dispose(owner), true);
assert.equal(closes.length, closesBeforeDisconnect + 1);
assert.equal(closes.at(-1)?.playerId, owner.id, "the disconnect/dispose path closes the HUD");
const opensBeforeStaleDisconnectRemount = opens.length;
reconnectDelayedRemount?.handler();
assert.equal(opens.length, opensBeforeStaleDisconnectRemount);
assert.ok(
    sentVarbits.some(
        (entry) =>
            entry.playerId === owner.id &&
            entry.id === BossHealthBarVarbit.Disabled &&
            entry.value === 1,
    ),
    "closing restores the player's pre-encounter disabled preference",
);
assert.ok(
    sentVarbits.some(
        (entry) =>
            entry.playerId === owner.id &&
            entry.id === BossHealthBarVarbit.Boss &&
            entry.value === 0,
    ),
    "closing clears the cache's boss HUD mode",
);
assert.ok(
    sentVarps.some(
        (entry) =>
            entry.playerId === owner.id && entry.id === BossHealthBarVar.NpcType && entry.value === -1,
    ),
);

console.log("instance boss health bar lifecycle tests passed");
