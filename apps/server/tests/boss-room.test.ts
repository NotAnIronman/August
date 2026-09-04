import assert from "node:assert/strict";

import { defineBossRoom } from "@server/game/encounters/BossRoom";
import {
    defineGwdAltar,
    formatGwdAltarCooldown,
} from "@server/game/encounters/GwdAltar";
import type { PlayerState } from "@server/game/player";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import type { ScriptServices } from "@server/game/scripts/types";

const player = { id: 10 } as PlayerState;
const messages: string[] = [];
const dialogs: Array<{
    id: string;
    title: string;
    options: string[];
    onSelect: (choice: number) => void;
}> = [];
let currentRoom: any;
let createdSpec: any;
let copiedTemplate: unknown;
let markedRoomId: string | undefined;
let leftDestination: unknown;
let joinResult: any;
const joinAttempts: string[] = [];
const joinable = [
    {
        id: "party-1",
        ownerName: "Alice",
        memberPlayerIds: [1, 2],
        maxPlayers: 5,
        definitionId: "test-room",
    },
];
const services = {
    instances: {
        get: () => currentRoom,
        buildTemplate: (copies: unknown) => {
            copiedTemplate = copies;
            return [[[123]]];
        },
        create: (_player: PlayerState, spec: unknown) => {
            createdSpec = spec;
            return { id: "created-room" };
        },
        markStarted: (id: string) => {
            markedRoomId = id;
            return true;
        },
        listJoinable: () => joinable,
        getById: (id: string) =>
            id === "party-1"
                ? joinable[0]
                : id === "other-party"
                  ? { ...joinable[0], id, definitionId: "other-room" }
                  : undefined,
        join: (_player: PlayerState, id: string) => {
            joinAttempts.push(id);
            joinResult = id === "party-1" ? joinable[0] : undefined;
            return joinResult;
        },
        leave: (_player: PlayerState, destination: unknown) => {
            leftDestination = destination;
            return true;
        },
    },
    messaging: {
        sendGameMessage: (_player: PlayerState, message: string) => messages.push(message),
    },
    dialog: {
        openDialogOptions: (_player: PlayerState, dialog: (typeof dialogs)[number]) =>
            dialogs.push(dialog),
    },
} as unknown as ScriptServices;

const templateCopies = [
    {
        sourceBaseX: 100,
        sourceBaseY: 200,
        widthChunks: 4,
        heightChunks: 5,
        sourcePlanes: [2],
        destinationChunkX: 3,
        destinationChunkY: 4,
    },
] as const;
const room = defineBossRoom({
    id: "test-room",
    doorLocId: 9000,
    templateCopies,
    destination: { x: 300, y: 400, level: 2 },
    exit: { x: 299, y: 400, level: 2 },
    grave: { locId: 9359, tile: { x: 298, y: 400 }, level: 2 },
    npcs: [{ id: 1, offsetX: 2, offsetY: 3, level: 2 }],
    dialogs: {
        entry: { id: "test-entry", title: "Enter the test chamber" },
        join: { id: "test-join", title: "Join a test party" },
    },
    messages: {
        alreadyInside: "already inside",
        unavailable: "unavailable",
        leaveBeforeJoining: "leave first",
        noJoinableParties: "none available",
        partyUnavailable: "party gone",
        peek: (count, scope) => `${scope}:${count}`,
    },
    actions: { leave: ["leave"] },
});

const registry = new ScriptRegistry();
room.register(registry);
for (const action of ["open", "peek", "enter solo", "enter party", "join party", "leave"]) {
    assert.equal(typeof registry.findLocInteraction(9000, action), "function");
}

room.create(player, services, "solo");
assert.equal(copiedTemplate, templateCopies);
assert.deepEqual(createdSpec, {
    definitionId: "test-room",
    access: "solo",
    maxPlayers: 1,
    joinInProgress: false,
    templateChunks: [[[123]]],
    destination: { x: 300, y: 400, level: 2 },
    exit: { x: 299, y: 400, level: 2 },
    grave: { locId: 9359, tile: { x: 298, y: 400 }, level: 2 },
    npcs: [{ id: 1, offsetX: 2, offsetY: 3, level: 2 }],
    locs: undefined,
});
assert.equal(markedRoomId, "created-room");

room.create(player, services, "party");
assert.equal(createdSpec.access, "party");
assert.equal(createdSpec.maxPlayers, 5);
assert.equal(createdSpec.joinInProgress, true);

room.showJoinOptions(player, services);
assert.deepEqual(dialogs.at(-1)?.options, ["Alice's party (2/5)"]);
dialogs.at(-1)?.onSelect(0);
assert.equal(joinResult?.id, "party-1");
assert.deepEqual(joinAttempts, ["party-1"]);
assert.equal(room.join(player, services, "other-party"), undefined);
assert.deepEqual(
    joinAttempts,
    ["party-1"],
    "the public helper must reject an instance owned by another room definition",
);
assert.equal(messages.at(-1), "party gone");

currentRoom = { id: "another-room", definitionId: "other-room", memberPlayerIds: [10] };
const attemptsBeforeStaleJoin = joinAttempts.length;
assert.equal(room.join(player, services, "party-1"), undefined);
assert.equal(joinAttempts.length, attemptsBeforeStaleJoin);
assert.equal(messages.at(-1), "leave first", "a stale dialog cannot replace another active room");
const destinationBeforeForeignLeave = leftDestination;
assert.equal(room.leave(player, services), false);
assert.equal(
    leftDestination,
    destinationBeforeForeignLeave,
    "a room helper cannot dispose a player from a different room",
);
currentRoom = joinable[0];
assert.strictEqual(room.join(player, services, "party-1"), currentRoom);
assert.equal(joinAttempts.length, attemptsBeforeStaleJoin, "joining the current room is idempotent");
currentRoom = undefined;

room.peek(player, services);
assert.equal(messages.at(-1), "joinable:2");
currentRoom = { definitionId: "test-room", memberPlayerIds: [10, 11, 12] };
room.peek(player, services);
assert.equal(messages.at(-1), "current:3");
room.showEntryOptions(player, services);
assert.deepEqual(leftDestination, { x: 299, y: 400, level: 2 });

function testAltar(): void {
    const altarMessages: string[] = [];
    let boost = -20;
    let animation = -1;
    let sound = -1;
    let resets = 0;
    const altarPlayer = {
        id: 20,
        skillSystem: {
            getSkill: () => ({ baseLevel: 70, boost }),
            setSkillBoost: (_skillId: number, level: number) => {
                boost = level - 70;
            },
        },
        prayer: { resetDrainAccumulator: () => resets++ },
    } as unknown as PlayerState;
    let altarRoomId: string | undefined;
    const altarServices = {
        instances: { get: () => ({ definitionId: altarRoomId }) },
        messaging: {
            sendGameMessage: (_player: PlayerState, message: string) =>
                altarMessages.push(message),
        },
        animation: { playPlayerSeq: (_player: PlayerState, id: number) => (animation = id) },
        sound: { sendSound: (_player: PlayerState, id: number) => (sound = id) },
    } as unknown as ScriptServices;
    const altar = defineGwdAltar({
        locId: 9001,
        roomDefinitionId: "test-room",
        cooldownTicks: 500,
        messages: {
            cooldown: (ticks) => `wait ${formatGwdAltarCooldown(ticks)}`,
            alreadyFull: "full",
            restored: "restored",
        },
    });
    const altarRegistry = new ScriptRegistry();
    altar.register(altarRegistry);
    assert.equal(typeof altarRegistry.findLocInteraction(9001, "pray"), "function");
    assert.equal(typeof altarRegistry.findLocInteraction(9001, "pray-at"), "function");

    altar.interact({ player: altarPlayer, services: altarServices, tick: 100 } as never);
    assert.equal(animation, -1, "an altar must ignore players outside its room");
    altarRoomId = "test-room";
    altar.interact({ player: altarPlayer, services: altarServices, tick: 100 } as never);
    assert.equal(boost, 0);
    assert.equal(animation, 645);
    assert.ok(sound >= 0);
    assert.equal(resets, 1);
    assert.equal(altarMessages.at(-1), "restored");

    boost = -5;
    altar.interact({ player: altarPlayer, services: altarServices, tick: 101 } as never);
    assert.equal(altarMessages.at(-1), "wait 5 minutes");
    assert.equal(boost, -5, "cooldown must not recharge Prayer");
    altar.interact({ player: altarPlayer, services: altarServices, tick: 600 } as never);
    assert.equal(boost, 0, "the cooldown is inclusive at its ready tick");
}

testAltar();
console.log("boss room and GWD altar contract tests passed");
