import assert from "node:assert/strict";

import type { PlayerState } from "@server/game/player";
import type { InventoryFacade } from "@server/game/scripts/serviceInterfaces";
import type { ScriptInventoryEntry, ScriptServices } from "@server/game/scripts/types";
import { defineGatheringSkill, pickWeighted } from "@server/game/skilling/GatheringSkill";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import { defineProductionSkill } from "@server/game/skilling/ProductionSkill";
import { checkSkillingRequirements, hasTool } from "@server/game/skilling/Requirements";
import { defineSkillAction } from "@server/game/skilling/SkillAction";

const player = { id: 42 } as PlayerState;

assert.equal(pickWeighted([]), undefined);
assert.equal(
    pickWeighted([{ value: "zero", weight: 0 }, { value: "invalid", weight: Number.NaN }]),
    undefined,
    "an invalid weighted table must preserve the caller's explicit fallback",
);
assert.deepEqual(
    pickWeighted([{ value: "ignored", weight: Number.POSITIVE_INFINITY }, { value: "valid", weight: 2 }], () => 0),
    { value: "valid", weight: 2 },
);

assert.deepEqual(defineSkillAction("example", {
    delayTicks: 2,
    groups: ["skill.production", "skill.production"],
}).groups, ["skill.example", "skill.production"]);
for (const invalidTicks of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
    assert.throws(
        () => defineSkillAction("invalid-timing", { delayTicks: invalidTicks }),
        /non-negative integer/,
    );
    assert.throws(
        () => defineSkillAction("invalid-timing", { delayTicks: 1, cooldownTicks: invalidTicks }),
        /non-negative integer/,
    );
}

function createInventory(
    initial: ReadonlyArray<Partial<ScriptInventoryEntry>>,
    nonStackable = new Set<number>(),
): { facade: InventoryFacade; slots: ScriptInventoryEntry[] } {
    const slots = Array.from({ length: 28 }, (_, slot) => ({ slot, itemId: -1, quantity: 0 }));
    for (const entry of initial) {
        const slot = entry.slot ?? 0;
        slots[slot] = {
            slot,
            itemId: entry.itemId ?? -1,
            quantity: entry.quantity ?? 0,
        };
    }
    const facade = {
        getInventoryItems: () => slots.map((entry) => ({ ...entry })),
        setInventorySlot: (
            _player: PlayerState,
            slot: number,
            itemId: number,
            quantity: number,
        ) => {
            slots[slot] = { slot, itemId, quantity };
        },
        addItemToInventory: (_player: PlayerState, itemId: number, quantity: number) => {
            if (itemId === 9999) return { slot: -1, added: 0 };
            if (!nonStackable.has(itemId)) {
                const existing = slots.find((entry) => entry.itemId === itemId && entry.quantity > 0);
                if (existing) {
                    existing.quantity += quantity;
                    return { slot: existing.slot, added: quantity };
                }
                const empty = slots.find((entry) => entry.itemId <= 0 || entry.quantity <= 0);
                if (!empty) return { slot: -1, added: 0 };
                empty.itemId = itemId;
                empty.quantity = quantity;
                return { slot: empty.slot, added: quantity };
            }
            const empty = slots.filter((entry) => entry.itemId <= 0 || entry.quantity <= 0);
            if (empty.length < quantity) return { slot: -1, added: 0 };
            for (let i = 0; i < quantity; i++) {
                empty[i].itemId = itemId;
                empty[i].quantity = 1;
            }
            return { slot: empty[0].slot, added: quantity };
        },
        collectCarriedItemIds: () => [],
    } as unknown as InventoryFacade;
    return { facade, slots };
}

{
    const full = Array.from({ length: 28 }, (_, slot) => ({
        slot,
        itemId: slot === 0 ? 100 : 500 + slot,
        quantity: 1,
    }));
    const { facade, slots } = createInventory(full);
    const before = slots.map((entry) => ({ ...entry }));
    const result = applyInventoryTransform(facade, player, {
        inputs: [{ itemId: 100, quantity: 1 }],
        outputs: [
            { itemId: 200, quantity: 1 },
            { itemId: 9999, quantity: 1 },
        ],
    });
    assert.deepEqual(result, { ok: false, reason: "inventory-full" });
    assert.deepEqual(slots, before, "a late output failure must restore all inventory slots");
}

{
    const { facade, slots } = createInventory([{ slot: 0, itemId: 100, quantity: 1 }], new Set([300]));
    const result = applyInventoryTransform(facade, player, {
        inputs: [{ itemId: 100, quantity: 1 }],
        outputs: [{ itemId: 300, quantity: 2 }],
        outputPlacement: "first-consumed-slot",
    });
    assert.equal(result.ok, true);
    assert.equal(slots.filter((entry) => entry.itemId === 300).length, 2);
    assert(slots.filter((entry) => entry.itemId === 300).every((entry) => entry.quantity === 1));
}

{
    const { facade, slots } = createInventory([{ slot: 0, itemId: 100, quantity: 1 }]);
    const before = slots.map((entry) => ({ ...entry }));
    const result = applyInventoryTransform(facade, player, {
        inputs: [{ itemId: 100, quantity: 1 }],
        outputs: [{ itemId: -1, quantity: 1 }],
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-transform" });
    assert.deepEqual(slots, before, "malformed transforms must be non-mutating");
}

{
    const { facade } = createInventory([{ slot: 0, itemId: 55, quantity: 3 }]);
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [-1, 55, -1] },
    } as unknown as ScriptServices;
    assert.equal(hasTool(services, player, { itemIds: [55], quantity: 3, source: "inventory" }), true);
    assert.equal(hasTool(services, player, { itemIds: [55], quantity: 4, source: "carried" }), true);
    assert.equal(hasTool(services, player, { itemIds: [55], quantity: 2, source: "equipment" }), false);
    assert.equal(hasTool(services, player, { itemIds: [] }), false);
    assert.equal(hasTool(services, player, { itemIds: [0, -1, Number.NaN] }), false);
    assert.equal(hasTool(services, player, { itemIds: [55], quantity: Number.NaN }), false);
    const invalidLevel = checkSkillingRequirements(
        {
            ...services,
            skills: { getSkill: () => ({ baseLevel: 99, boost: 0 }) },
        } as unknown as ScriptServices,
        player,
        { levels: [{ skillId: 1, level: Number.NaN }] },
    );
    assert.equal(invalidLevel?.kind, "level", "malformed level requirements must fail closed");
    const invalidStoredLevel = checkSkillingRequirements(
        {
            ...services,
            skills: { getSkill: () => ({ baseLevel: Number.NaN, boost: Number.NaN }) },
        } as unknown as ScriptServices,
        player,
        { levels: [{ skillId: 1, level: 2 }] },
    );
    assert.equal(
        invalidStoredLevel?.kind,
        "level",
        "malformed persisted skill values must not bypass requirements",
    );
}

{
    const requests: Array<Record<string, unknown>> = [];
    const repeats: Array<Record<string, unknown>> = [];
    const services = {
        combat: {
            requestAction: (_player: PlayerState, request: Record<string, unknown>) => {
                requests.push(request);
                return { ok: true };
            },
            scheduleAction: (_id: number, request: Record<string, unknown>) => {
                repeats.push(request);
                return { ok: true };
            },
        },
        system: { getCurrentTick: () => 12 },
    } as unknown as ScriptServices;
    const gather = defineGatheringSkill<{ low: number; ratio: number }, { multiplier: number }>({
        name: "test-gather",
        timing: { delayTicks: 4 },
        success: {
            kind: "linear-255",
            low: (resource, tool) => resource.low * tool.multiplier,
            ratio: (resource) => resource.ratio,
        },
        depletion: { chance: () => 0.25 },
        respawn: { duration: () => ({ min: 2, max: 5 }) },
    });
    assert.equal(gather.action(), gather.action(), "default action policies should be cached");
    assert.equal(
        gather.action({ delayTicks: 2 }),
        gather.action({ delayTicks: 2 }),
        "dynamic tool timing policies should be cached",
    );
    assert.equal(gather.rollSuccess(1, { low: 50, ratio: 2 }, { multiplier: 1 }, () => 49 / 255), true);
    assert.equal(gather.rollSuccess(1, { low: 50, ratio: 2 }, { multiplier: 1 }, () => 51 / 255), false);
    assert.equal(gather.rollDepletion({ low: 1, ratio: 1 }, undefined, () => 0.24), true);
    assert.deepEqual(gather.respawnDuration({ low: 1, ratio: 1 }), { min: 2, max: 5 });
    assert.equal(gather.request(services, player, { node: 1 }, undefined, { delayTicks: 2 }), true);
    assert.equal(gather.repeat(services, player, { node: 1 }, 13, { delayTicks: 3 }), true);
    assert.equal(requests[0].kind, "skill.test-gather");
    assert.equal(requests[0].delayTicks, 2);
    assert.deepEqual(requests[0].groups, ["skill.test-gather"]);
    assert.equal(repeats[0].delayTicks, 3);
}

{
    const { facade, slots } = createInventory([
        { slot: 0, itemId: 10, quantity: 2 },
        { slot: 1, itemId: 99, quantity: 1 },
    ]);
    const animations: number[] = [];
    const xp: number[] = [];
    const crafted: unknown[] = [];
    const requests: Array<Record<string, unknown>> = [];
    const repeats: Array<Record<string, unknown>> = [];
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        skills: {
            getSkill: () => ({ baseLevel: 10, boost: 0 }),
            addSkillXp: (_player: PlayerState, _skill: number, amount: number) => xp.push(amount),
        },
        animation: { playPlayerSeq: (_player: PlayerState, id: number) => animations.push(id) },
        system: {
            getCurrentTick: () => 20,
            eventBus: { emit: (_name: string, payload: unknown) => crafted.push(payload) },
        },
        combat: {
            requestAction: (_player: PlayerState, request: Record<string, unknown>) => {
                requests.push(request);
                return { ok: true };
            },
            scheduleAction: (_id: number, request: Record<string, unknown>) => {
                repeats.push(request);
                return { ok: true };
            },
        },
    } as unknown as ScriptServices;
    const production = defineProductionSkill({
        name: "test-produce",
        skillId: 7,
        requestGroups: ["skill.surface"],
        random: () => 0.125,
        recipes: [
            {
                id: "good",
                source: "good",
                level: 5,
                inputs: [{ itemId: 10, quantity: 1 }],
                outputs: [{ itemId: 20, quantity: 1 }],
                tools: [{ itemIds: [99], source: "inventory" }],
                xp: 12.5,
                animationId: 123,
                ticks: 3,
            },
        ],
        messages: {
            unknownRecipe: "unknown",
            missingLevel: () => "level",
            missingInputs: () => "inputs",
            missingTools: () => "tools",
            inventoryFull: () => "full",
            success: () => "made",
            interrupted: "stopped",
        },
        resolveOutcome: (context) => {
            assert.equal(context.random(), 0.125);
            return {};
        },
    });
    const recipe = production.getRecipe("good")!;
    assert.equal(production.hasMaterials(services, player, recipe), true);
    assert.equal(production.request(services, player, recipe, 2), true);
    assert.deepEqual(requests[0].groups, ["skill.test-produce", "skill.surface"]);
    const result = production.execute({
        player,
        services,
        tick: 20,
        data: { recipeId: "good", count: 2 },
    } as never);
    assert.equal(result.ok, true);
    assert.equal(slots[0].itemId, 10);
    assert.equal(slots[0].quantity, 1);
    assert.equal(slots.some((entry) => entry.itemId === 20), true);
    assert.deepEqual(animations, [123]);
    assert.deepEqual(xp, [12.5]);
    assert.equal(crafted.length, 1);
    assert.equal(repeats.length, 1);
    assert.equal(repeats[0].delayTicks, 3);
    assert.deepEqual(repeats[0].data, { recipeId: "good", count: 1 });
}

{
    const { facade, slots } = createInventory([]);
    let randomCalls = 0;
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        skills: {
            getSkill: () => ({ baseLevel: 99, boost: 0 }),
            addSkillXp: () => undefined,
        },
        animation: { playPlayerSeq: () => undefined },
        system: {},
    } as unknown as ScriptServices;
    const production = defineProductionSkill({
        name: "preflight",
        skillId: 7,
        random: () => {
            randomCalls++;
            return 0;
        },
        recipes: [{
            id: "random-outcome",
            source: "random",
            level: 1,
            inputs: [{ itemId: 10, quantity: 1 }],
            outputs: [{ itemId: 20, quantity: 1 }],
            xp: 1,
            ticks: 1,
        }],
        messages: {
            unknownRecipe: "unknown", missingLevel: () => "level", missingInputs: () => "inputs",
            missingTools: () => "tools", inventoryFull: () => "full", success: () => "made",
            interrupted: "stopped",
        },
        resolveOutcome: ({ random }) => {
            random();
            return {};
        },
    });
    const result = production.execute({
        player,
        services,
        tick: 1,
        data: { recipeId: "random-outcome", count: 1 },
    } as never);
    assert.equal(result.reason, "materials");
    assert.equal(randomCalls, 0, "a missing static input must fail before rolling an outcome");
    assert.equal(slots.some((entry) => entry.itemId > 0), false);
}

{
    const { facade, slots } = createInventory([{ slot: 0, itemId: 10, quantity: 1 }]);
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        skills: {
            getSkill: () => ({ baseLevel: 10, boost: 5 }),
            addSkillXp: () => undefined,
        },
        animation: { playPlayerSeq: () => undefined },
        system: {},
    } as unknown as ScriptServices;
    const production = defineProductionSkill({
        name: "base-only",
        skillId: 7,
        recipes: [
            {
                id: "base-level-recipe",
                source: "base",
                level: 12,
                levelSource: "base",
                inputs: [{ itemId: 10, quantity: 1 }],
                outputs: [{ itemId: 20, quantity: 1 }],
                xp: 1,
                ticks: 1,
            },
        ],
        messages: {
            unknownRecipe: "unknown",
            missingLevel: () => "base level required",
            missingInputs: () => "inputs",
            missingTools: () => "tools",
            inventoryFull: () => "full",
            success: () => "made",
            interrupted: "stopped",
        },
    });
    const result = production.execute({
        player,
        services,
        tick: 1,
        data: { recipeId: "base-level-recipe", count: 1 },
    } as never);
    assert.equal(result.reason, "level");
    assert.equal(slots[0].itemId, 10, "a boost must not satisfy a base-only recipe");
}

{
    const { facade, slots } = createInventory([{ slot: 0, itemId: 30, quantity: 1 }]);
    const xp: number[] = [];
    const crafted: unknown[] = [];
    const animations: number[] = [];
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        skills: {
            getSkill: () => ({ baseLevel: 99, boost: 0 }),
            addSkillXp: (_player: PlayerState, _skill: number, amount: number) => xp.push(amount),
        },
        animation: { playPlayerSeq: (_player: PlayerState, id: number) => animations.push(id) },
        system: { eventBus: { emit: (_name: string, payload: unknown) => crafted.push(payload) } },
    } as unknown as ScriptServices;
    const production = defineProductionSkill({
        name: "outcome",
        skillId: 7,
        recipes: [{
            id: "burn",
            source: "burn",
            level: 1,
            inputs: [{ itemId: 30, quantity: 1 }],
            outputs: [{ itemId: 40, quantity: 1 }],
            xp: 10,
            animationId: 555,
            ticks: 2,
        }],
        messages: {
            unknownRecipe: "", missingLevel: () => "", missingInputs: () => "", missingTools: () => "",
            inventoryFull: () => "", success: () => "burnt", interrupted: "",
        },
        resolveOutcome: () => ({
            variant: "failed",
            outputs: [{ itemId: 41, quantity: 1 }],
            animationId: -1,
            awardXp: false,
            emitCraftEvents: false,
        }),
    });
    const result = production.execute({
        player,
        services,
        tick: 1,
        data: { recipeId: "burn", count: 1 },
    } as never);
    assert.equal(result.ok, true);
    assert.equal(slots.some((entry) => entry.itemId === 30), false);
    assert.equal(slots.some((entry) => entry.itemId === 41), true);
    assert.deepEqual(xp, []);
    assert.deepEqual(crafted, []);
    assert.deepEqual(animations, []);
}

// Pure content planning must finish before inventory mutation. A formatter or
// repeat-data bug therefore fails closed without consuming the player's items.
for (const throwingCallback of ["success", "repeat"] as const) {
    const { facade, slots } = createInventory([{ slot: 0, itemId: 50, quantity: 2 }]);
    const before = slots.map((entry) => ({ ...entry }));
    const warnings: unknown[][] = [];
    let repeats = 0;
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        skills: {
            getSkill: () => ({ baseLevel: 99, boost: 0 }),
            addSkillXp: () => undefined,
        },
        animation: { playPlayerSeq: () => undefined },
        combat: {
            scheduleAction: () => {
                repeats++;
                return { ok: true };
            },
        },
        system: { logger: { warn: (...args: unknown[]) => warnings.push(args) } },
    } as unknown as ScriptServices;
    const production = defineProductionSkill({
        name: `throwing-${throwingCallback}`,
        skillId: 7,
        recipes: [{
            id: "unsafe-plan",
            source: "unsafe-plan",
            level: 1,
            inputs: [{ itemId: 50, quantity: 1 }],
            outputs: [{ itemId: 51, quantity: 1 }],
            xp: 1,
            ticks: 2,
        }],
        messages: {
            unknownRecipe: "",
            missingLevel: () => "",
            missingInputs: () => "",
            missingTools: () => "",
            inventoryFull: () => "",
            success: () => {
                if (throwingCallback === "success") throw new Error("bad success formatter");
                return "made";
            },
            interrupted: "stopped",
        },
        buildRepeatData: (_context, remaining) => {
            if (throwingCallback === "repeat") throw new Error("bad repeat builder");
            return { recipeId: "unsafe-plan", count: remaining };
        },
    });
    const result = production.execute({
        player,
        services,
        tick: 1,
        data: { recipeId: "unsafe-plan", count: 2 },
    } as never);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "callback_failed");
    assert.deepEqual(slots, before, `${throwingCallback} failure must happen before commit`);
    assert.equal(repeats, 0, `${throwingCallback} failure must not enqueue a repeat`);
    assert.equal(warnings.length, 1);
}

// Repeat data is continuation-only. A one-shot recipe must not invoke a
// builder that has no next action to describe.
{
    const { facade, slots } = createInventory([{ slot: 0, itemId: 55, quantity: 1 }]);
    let repeatBuilderCalls = 0;
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        skills: {
            getSkill: () => ({ baseLevel: 99, boost: 0 }),
            addSkillXp: () => undefined,
        },
        animation: { playPlayerSeq: () => undefined },
        system: {},
    } as unknown as ScriptServices;
    const production = defineProductionSkill({
        name: "one-shot-repeat-data",
        skillId: 7,
        recipes: [{
            id: "one-shot",
            source: "one-shot",
            level: 1,
            inputs: [{ itemId: 55, quantity: 1 }],
            outputs: [{ itemId: 56, quantity: 1 }],
            xp: 1,
            ticks: 1,
        }],
        messages: {
            unknownRecipe: "",
            missingLevel: () => "",
            missingInputs: () => "",
            missingTools: () => "",
            inventoryFull: () => "",
            success: () => "made",
            interrupted: "",
        },
        buildRepeatData: () => {
            repeatBuilderCalls++;
            throw new Error("one-shot repeat builder should not run");
        },
    });
    const result = production.execute({
        player,
        services,
        tick: 1,
        data: { recipeId: "one-shot", count: 1 },
    } as never);
    assert.equal(result.ok, true);
    assert.equal(repeatBuilderCalls, 0);
    assert.equal(slots[0]?.itemId, 56);
}

// afterStep is the sole content callback intentionally run after commit. Its
// failure is isolated: the committed state is snapshotted and exactly one
// continuation is requested.
{
    const { facade, slots } = createInventory([{ slot: 0, itemId: 60, quantity: 2 }]);
    const repeats: Array<Record<string, unknown>> = [];
    const warnings: unknown[][] = [];
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        skills: {
            getSkill: () => ({ baseLevel: 99, boost: 0 }),
            addSkillXp: () => undefined,
        },
        animation: { playPlayerSeq: () => undefined },
        combat: {
            scheduleAction: (_playerId: number, request: Record<string, unknown>) => {
                repeats.push(request);
                return { ok: true };
            },
        },
        system: { logger: { warn: (...args: unknown[]) => warnings.push(args) } },
    } as unknown as ScriptServices;
    const production = defineProductionSkill({
        name: "throwing-after-step",
        skillId: 7,
        recipes: [{
            id: "committed-step",
            source: "committed-step",
            level: 1,
            inputs: [{ itemId: 60, quantity: 1 }],
            outputs: [{ itemId: 61, quantity: 1 }],
            xp: 1,
            ticks: 2,
        }],
        messages: {
            unknownRecipe: "",
            missingLevel: () => "",
            missingInputs: () => "",
            missingTools: () => "",
            inventoryFull: () => "",
            success: () => "made",
            interrupted: "stopped",
        },
        afterStep: () => {
            throw new Error("bad post-commit hook");
        },
    });
    const result = production.execute({
        player,
        services,
        tick: 10,
        data: { recipeId: "committed-step", count: 2 },
    } as never);
    assert.equal(result.ok, true);
    assert.equal(slots.find((entry) => entry.itemId === 60)?.quantity, 1);
    assert.equal(slots.find((entry) => entry.itemId === 61)?.quantity, 1);
    assert(result.effects?.some((effect) => effect.type === "inventorySnapshot"));
    assert(result.effects?.some((effect) => effect.type === "message" && effect.message === "made"));
    assert.equal(repeats.length, 1, "a failed afterStep hook must not duplicate continuation");
    assert.deepEqual(repeats[0]?.data, { recipeId: "committed-step", count: 1 });
    assert.equal(warnings.length, 1);
}

assert.throws(
    () =>
        defineProductionSkill({
            name: "invalid",
            skillId: 1,
            recipes: [
                { id: "dupe", source: 1, level: 1, inputs: [{ itemId: 1, quantity: 1 }], outputs: [], xp: 0, ticks: 1 },
                { id: "dupe", source: 2, level: 1, inputs: [{ itemId: 1, quantity: 1 }], outputs: [], xp: 0, ticks: 1 },
            ],
            messages: {
                unknownRecipe: "", missingLevel: () => "", missingInputs: () => "", missingTools: () => "",
                inventoryFull: () => "", success: () => "", interrupted: "",
            },
        }),
    /Duplicate production recipe id/,
);

assert.throws(
    () =>
        defineProductionSkill({
            name: "invalid-amount",
            skillId: 1,
            recipes: [{
                id: "bad",
                source: 1,
                level: 1,
                inputs: [{ itemId: 1, quantity: 0 }],
                outputs: [{ itemId: 2, quantity: 1 }],
                xp: 0,
                ticks: 1,
            }],
            messages: {
                unknownRecipe: "", missingLevel: () => "", missingInputs: () => "", missingTools: () => "",
                inventoryFull: () => "", success: () => "", interrupted: "",
            },
        }),
    /invalid item amounts/,
);

console.log("skilling-framework.test.ts: all assertions passed");
