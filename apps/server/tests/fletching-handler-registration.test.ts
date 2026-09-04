import assert from "node:assert/strict";

import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    ItemOnItemEvent,
    ItemOnItemHandler,
    ScriptActionHandler,
    ScriptDialogOptionRequest,
    ScriptServices,
} from "@server/game/scripts/types";
import { register } from "@server/content/gamemodes/vanilla/skills/fletching";

const AMETHYST = 21347;
const CHISEL = 1755;

let amethystRegistrationCount = 0;
let amethystHandler: ItemOnItemHandler | undefined;
let fletchingActionHandler: ScriptActionHandler | undefined;
const registry = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
        if (property === "registerItemOnItem") {
            const first = args[0] as number;
            const second = args[1] as number;
            if (new Set([first, second]).has(AMETHYST) && new Set([first, second]).has(CHISEL)) {
                amethystRegistrationCount++;
                amethystHandler = args[2] as ItemOnItemHandler;
            }
        } else if (property === "registerActionHandler" && args[0] === "skill.fletch") {
            fletchingActionHandler = args[1] as ScriptActionHandler;
        }
        return { unregister() {} };
    },
}) as unknown as IScriptRegistry;

const dialogs: ScriptDialogOptionRequest[] = [];
const actions: Array<{ kind: string; data?: unknown; requestedAtTick: number }> = [];
let currentTick = 100;
const services = {
    inventory: {
        getInventoryItems: () => [
            { slot: 0, itemId: AMETHYST, quantity: 2 },
            { slot: 1, itemId: CHISEL, quantity: 1 },
        ],
    },
    dialog: {
        openDialogOptions: (_player: PlayerState, request: ScriptDialogOptionRequest) => dialogs.push(request),
        closeDialog: () => undefined,
    },
    skills: { getSkill: () => ({ baseLevel: 99 }) },
    messaging: { sendGameMessage: () => undefined },
    system: { getCurrentTick: () => currentTick },
    combat: {
        requestAction: (
            _player: PlayerState,
            request: { kind: string; data?: unknown },
            requestedAtTick: number,
        ) => {
            actions.push({ ...request, requestedAtTick });
            return { ok: true };
        },
    },
} as unknown as ScriptServices;

register(registry, services);
assert.equal(amethystRegistrationCount, 1, "amethyst and chisel should have one grouped handler");
assert(amethystHandler, "the grouped amethyst handler should be registered");

const player = { id: 1 } as PlayerState;
amethystHandler({
    player,
    source: { slot: 0, itemId: AMETHYST },
    target: { slot: 1, itemId: CHISEL },
    tick: 100,
    services,
} as ItemOnItemEvent);

assert.equal(dialogs.length, 1);
assert.equal(dialogs[0].title, "What would you like to make?");
assert.equal(dialogs[0].options.length, 4);
assert(dialogs[0].options.some((option) => /arrowtips/i.test(option)));
assert(dialogs[0].options.some((option) => /bolt tips/i.test(option)));
assert(dialogs[0].options.some((option) => /javelin heads/i.test(option)));
assert(dialogs[0].options.some((option) => /dart tips/i.test(option)));

dialogs[0].onSelect(0);
assert.equal(dialogs.length, 2, "selecting a product should open its quantity options");
currentTick = 140;
dialogs[1].onSelect(0);
assert.equal(actions.length, 1);
assert.equal(actions[0].kind, "skill.fletch");
assert.match(String((actions[0].data as { recipeId?: string })?.recipeId), /^carve_amethyst_/);
assert.equal(
    actions[0].requestedAtTick,
    140,
    "a delayed dialog choice must schedule from the live tick, not the original item interaction",
);

assert(fletchingActionHandler, "the shared fletching action handler should be registered");
const lowLevelNoMaterials = fletchingActionHandler({
    player,
    tick: 101,
    data: { recipeId: "log_1513_shortbow_u", count: 1 },
    services: {
        skills: { getSkill: () => ({ baseLevel: 1, boost: 0 }) },
        inventory: { findInventorySlotWithItem: () => undefined },
    } as unknown as ScriptServices,
} as never);
assert.equal(lowLevelNoMaterials.reason, undefined);
assert.match(
    String(lowLevelNoMaterials.effects?.find((effect) => effect.type === "message")?.message),
    /Fletching level 80/,
    "the level failure must retain priority over a simultaneous missing-input failure",
);

console.log("fletching-handler-registration.test.ts: all assertions passed");
