import assert from "node:assert/strict";

const previousSelf = (globalThis as { self?: unknown }).self;
(globalThis as { self?: unknown }).self = globalThis;
const { SceneRaycaster } = require("@client/engine/game/scene/SceneRaycaster") as typeof import("@client/engine/game/scene/SceneRaycaster");

const visible = { id: 19130, actions: ["Open"] };
let active = false;
const base = { id: 19138, transforms: [-1, 19130, -1], transform: () => active ? visible : null };
const raycaster = new SceneRaycaster({} as never, {
    locTypeLoader: { load: (id: number) => id === 19138 ? base : visible },
    varManager: {},
} as never);
const resolve = (id: number, scratch = new Map()) => (raycaster as any).getResolvedLocType(id, scratch);
const scratch = new Map();
assert.equal(resolve(19138, scratch), undefined, "inactive morph must not fall back to a clickable base object");
assert.equal(scratch.get(19138), null, "absent morph is cached for the current raycast");
active = true;
assert.equal(resolve(19138), visible, "next raycast resolves the newly active variant");
assert.equal(resolve(19130), visible, "ordinary scenery remains unchanged");
console.log("Inactive object transforms are excluded from raycasting");
if (previousSelf === undefined) delete (globalThis as { self?: unknown }).self;
else (globalThis as { self?: unknown }).self = previousSelf;
