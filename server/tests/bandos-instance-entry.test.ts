import assert from "node:assert/strict";

import { resolveLocActions } from "../../client/common/world/LocActionOverrides";
import { AttackType } from "../src/game/combat/AttackType";
import { EncounterRegistry } from "../src/game/encounters/EncounterRegistry";
import { getNpcCombatProfile } from "../src/data/npcCombatStats";
import type { IScriptRegistry, LocInteractionHandler } from "../src/game/scripts/types";
import { register } from "../extrascripts/bandos-instance";

assert.deepEqual(resolveLocActions(26503, ["Open", "Peek"]), [
    "Open",
    "Peek",
    "Enter Solo",
    "Enter Party",
    "Join Party",
]);
assert.deepEqual(resolveLocActions(1, ["Open"]), ["Open"]);

const handlers = new Map<string, LocInteractionHandler>();
const registry = {
    registerLocInteraction: (locId: number, handler: LocInteractionHandler, action?: string) => {
        handlers.set(`${locId}:${action}`, handler);
        return { unregister() {} };
    },
} as unknown as IScriptRegistry;
register(registry, {} as never);

assert.deepEqual([...handlers.keys()], [
    "26503:open",
    "26503:peek",
    "26503:enter solo",
    "26503:enter party",
    "26503:join party",
]);

const graardor = EncounterRegistry.shared.findByNpcTypeId(2215);
assert.equal(graardor?.id, "general-graardor");
assert.deepEqual(
    graardor?.attacks.map(({ id, type, maxHit }) => ({ id, type, maxHit })),
    [
        { id: "melee", type: AttackType.Melee, maxHit: 60 },
        { id: "ranged", type: AttackType.Ranged, maxHit: 35 },
    ],
);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2216)?.attacks[0]?.type, AttackType.Melee);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2217)?.attacks[0]?.type, AttackType.Magic);
assert.equal(EncounterRegistry.shared.findByNpcTypeId(2218)?.attacks[0]?.type, AttackType.Ranged);
assert.equal(getNpcCombatProfile(2216)?.attackLevel, 124);
assert.equal(getNpcCombatProfile(2217)?.magicLevel, 150);
assert.equal(getNpcCombatProfile(2218)?.rangedLevel, 150);

let copiedArea: Record<string, number> | undefined;
let instanceSpec: any;
const testPlayer = { id: 42 } as never;
const testServices = {
    instances: {
        get: () => undefined,
        buildTemplate: (copies: readonly Record<string, number>[]) => {
            copiedArea = copies[0];
            return [];
        },
        create: (_player: unknown, spec: unknown) => {
            instanceSpec = spec;
            return { id: "test-bandos-room" };
        },
        markStarted: () => true,
    },
    messaging: { sendGameMessage: () => undefined },
};
handlers.get("26503:enter solo")?.({ player: testPlayer, services: testServices } as never);
assert.deepEqual(instanceSpec.destination, { x: 2864, y: 5354, level: 2 });
assert.deepEqual(instanceSpec.exit, { x: 2862, y: 5354, level: 2 });
assert.equal(copiedArea?.destinationChunkX, 4);
assert.equal(copiedArea?.destinationChunkY, 3);
assert.equal(copiedArea?.heightChunks, 7);
const instanceBase = {
    x: ((instanceSpec.destination.x >> 3) - 6) * 8,
    y: ((instanceSpec.destination.y >> 3) - 6) * 8,
};
assert.deepEqual(
    instanceSpec.npcs.map((npc: { id: number; offsetX: number; offsetY: number }) => ({
        id: npc.id,
        x: instanceBase.x + npc.offsetX,
        y: instanceBase.y + npc.offsetY,
    })),
    [
        { id: 2215, x: 2872, y: 5358 },
        { id: 2216, x: 2866, y: 5358 },
        { id: 2217, x: 2872, y: 5352 },
        { id: 2218, x: 2868, y: 5362 },
    ],
);

console.log("bandos instance entry tests passed");
