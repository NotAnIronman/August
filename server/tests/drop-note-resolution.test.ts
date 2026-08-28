import assert from "node:assert/strict";

import { resolveDropEntry } from "../src/game/drops/helpers";

const notedMagicLogs = resolveDropEntry({
    itemId: 1513,
    quantity: "15-20 (noted)",
    rarity: "1/1",
});
assert.equal(notedMagicLogs?.itemId, 1514);
assert.deepEqual(notedMagicLogs?.quantity, { min: 15, max: 20 });

const ordinaryMagicLogs = resolveDropEntry({
    itemId: 1513,
    quantity: "15-20",
    rarity: "1/1",
});
assert.equal(ordinaryMagicLogs?.itemId, 1513);

console.log("drop note resolution tests passed");
