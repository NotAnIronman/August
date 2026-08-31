import assert from "node:assert/strict";

import type { IScriptRegistry } from "@server/game/scripts/types";
import { register } from "@server/content/modules/boss-killcounts";

let onNpcKilled: ((killer: any, npc: any, tick: number) => void) | undefined;
const messages: string[] = [];
const varps: Array<{ id: number; value: number }> = [];
const stats = new Map<number, { count1: number }>([[487, { count1: 99 }]]);
const player = {
    id: 7,
    collectionLog: {
        incrementCategoryStat: (structId: number) => {
            const stat = stats.get(structId) ?? { count1: 0 };
            stat.count1++;
            stats.set(structId, stat);
        },
        getCategoryStat: (structId: number) => stats.get(structId),
    },
};
register({} as IScriptRegistry, {
    combat: { registerOnNpcKilled: (listener: typeof onNpcKilled) => (onNpcKilled = listener) },
    messaging: { sendGameMessage: (_player: unknown, message: string) => messages.push(message) },
    variables: { queueVarp: (_playerId: number, id: number, value: number) => varps.push({ id, value }) },
} as never);

onNpcKilled?.(player, { typeId: 2215 }, 1);
assert.equal(stats.get(487)?.count1, 100);
assert.deepEqual(varps.at(-1), { id: 2048, value: 100 });
assert.deepEqual(messages, [
    "General Graardor killcount : 100",
    "Congratulations! You reached the 100 kills Milestone!",
]);

onNpcKilled?.(player, { typeId: 3130 }, 2);
assert.equal(messages.length, 2, "bodyguards must not count as boss kills");
console.log("boss killcount tests passed");
