import assert from "node:assert/strict";
import { getMiningRockById } from "@server/content/gamemodes/vanilla/skills/mining/miningData";
const amethyst=getMiningRockById("amethyst")!;
assert.equal(amethyst.oreItemId,21347);
assert.equal(amethyst.depleteChance,0.2,"successful crystals must not always deplete the vein");
assert.equal(getMiningRockById("iron")?.depleteChance,1,"ordinary one-ore rocks stay unchanged");
console.log("Amethyst multi-yield depletion configuration passed");
