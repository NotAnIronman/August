import assert from "node:assert/strict";

import type { PlayerState } from "@server/game/player";
import {
    type IScriptRegistry,
    type ItemOnLocHandler,
    type LocInteractionHandler,
    type ScriptActionHandler,
    type ScriptDialogOptionRequest,
    type ScriptInventoryEntry,
    type ScriptServices,
} from "@server/game/scripts/types";
import { register as registerSpinning } from "@server/content/gamemodes/vanilla/skills/crafting/spinning";
import {
    SINEW_DELAY_TICKS,
    SINEW_SOURCE_ITEM_IDS,
    SPINNING_RECIPES,
    SPINNING_WHEEL_LOC_IDS,
} from "@server/content/gamemodes/vanilla/skills/crafting/spinningData";
import { registerCookingInteractions } from "@server/content/gamemodes/vanilla/skills/production/cooking";
import { COOKING_RECIPES } from "@server/content/gamemodes/vanilla/skills/production/cookingData";
import { SmithingUI } from "@server/content/gamemodes/vanilla/skills/smithing/smithingUI";

type CapturedRegistry = {
    registry: IScriptRegistry;
    actionHandlers: Map<string, ScriptActionHandler>;
    itemOnLoc: Map<number, ItemOnLocHandler>;
    locInteractions: Map<number, LocInteractionHandler>;
    locActions: Map<string, LocInteractionHandler>;
};

function captureRegistry(): CapturedRegistry {
    const actionHandlers = new Map<string, ScriptActionHandler>();
    const itemOnLoc = new Map<number, ItemOnLocHandler>();
    const locInteractions = new Map<number, LocInteractionHandler>();
    const locActions = new Map<string, LocInteractionHandler>();
    const registry = new Proxy(
        {},
        {
            get: (_target, property) => (...args: unknown[]) => {
                if (property === "registerActionHandler") {
                    actionHandlers.set(args[0] as string, args[1] as ScriptActionHandler);
                } else if (property === "registerItemOnLoc") {
                    itemOnLoc.set(args[0] as number, args[2] as ItemOnLocHandler);
                } else if (property === "registerLocInteraction") {
                    locInteractions.set(args[0] as number, args[1] as LocInteractionHandler);
                } else if (property === "registerLocAction") {
                    locActions.set(args[0] as string, args[1] as LocInteractionHandler);
                }
                return { unregister: () => undefined };
            },
        },
    ) as unknown as IScriptRegistry;
    return { registry, actionHandlers, itemOnLoc, locInteractions, locActions };
}

function inventoryEntry(slot: number, itemId: number, quantity = 1): ScriptInventoryEntry {
    return { slot, itemId, quantity };
}

// The smithing UI is an adapter, but its initial timing is intentionally not
// the same as the production repeat: close the modal, swing next tick, then
// continue at the recipe cadence.
{
    const requests: Array<Record<string, unknown>> = [];
    const order: string[] = [];
    let inventory = [inventoryEntry(0, 2347), inventoryEntry(1, 2349)];
    const player = {
        id: 1,
        appearance: { equip: [] },
        bank: {
            getSmithingQuantityMode: () => 0,
            getSmithingCustomQuantity: () => 0,
        },
        skillSystem: { getSkill: () => ({ baseLevel: 99, boost: 0 }) },
    } as unknown as PlayerState;
    const services = {
        combat: {
            requestAction: (_player: PlayerState, request: Record<string, unknown>) => {
                order.push("request");
                requests.push(request);
                return { ok: true };
            },
        },
        dialog: { closeModal: () => order.push("close") },
        inventory: {
            getInventoryItems: () => inventory,
            playerHasItem: (_player: PlayerState, itemId: number) => itemId === 2347,
        },
        messaging: { sendGameMessage: () => undefined },
        production: {
            isSmithingModalOpen: () => true,
            queueSmithingMessage: () => undefined,
        },
        system: { getCurrentTick: () => 77 },
    } as unknown as ScriptServices;
    const ui = new SmithingUI(services);

    ui.handleSmithingSelection(player, "bronze_dagger", 1);
    assert.deepEqual(order, ["close", "request"]);
    assert.deepEqual(
        {
            kind: requests[0]?.kind,
            delayTicks: requests[0]?.delayTicks,
            cooldownTicks: requests[0]?.cooldownTicks,
            groups: requests[0]?.groups,
        },
        { kind: "skill.smith", delayTicks: 1, cooldownTicks: 4, groups: ["skill.smith"] },
    );

    inventory = [inventoryEntry(0, 436), inventoryEntry(1, 438)];
    ui.handleSmeltingSelection(player, "smelt_bronze_bar", 1);
    assert.deepEqual(
        {
            kind: requests[1]?.kind,
            delayTicks: requests[1]?.delayTicks,
            cooldownTicks: requests[1]?.cooldownTicks,
            groups: requests[1]?.groups,
        },
        { kind: "skill.smelt", delayTicks: 4, cooldownTicks: 4, groups: ["skill.smelt"] },
    );
}

// Direct ground-fire cooking is a deliberate narrow action: it does not take
// the broader modal surface lock used by ranges.
{
    const captured = captureRegistry();
    const requests: Array<Record<string, unknown>> = [];
    const recipe = COOKING_RECIPES[0];
    assert(recipe);
    const services = {
        combat: {
            requestAction: (_player: PlayerState, request: Record<string, unknown>) => {
                requests.push(request);
                return { ok: true };
            },
        },
        dialog: {},
        gathering: { getTracker: () => ({ hasTile: () => true }) },
        messaging: { sendGameMessage: () => undefined },
        system: { getCurrentTick: () => 1 },
    } as unknown as ScriptServices;
    registerCookingInteractions(captured.registry, services);
    const handler = captured.itemOnLoc.get(recipe.rawItemId);
    assert(handler);
    const player = { id: 2 } as PlayerState;
    void handler({
        player,
        services,
        tick: 15,
        source: { slot: 0, itemId: recipe.rawItemId },
        target: { locId: 1, tile: { x: 10, y: 20 }, level: 0 },
    });
    assert.deepEqual(
        {
            kind: requests[0]?.kind,
            delayTicks: requests[0]?.delayTicks,
            cooldownTicks: requests[0]?.cooldownTicks,
            groups: requests[0]?.groups,
            data: requests[0]?.data,
        },
        {
            kind: "skill.cook",
            delayTicks: recipe.delayTicks ?? 4,
            cooldownTicks: recipe.delayTicks ?? 4,
            groups: ["skill.cook"],
            data: { recipeId: recipe.id, count: 1, heatSource: "fire" },
        },
    );
}

// Spinning and sinew now share the same named action-policy entry points as
// the other skills while retaining their existing visual/UI choreography.
{
    const captured = captureRegistry();
    const requests: Array<Record<string, unknown>> = [];
    const spinRecipe = SPINNING_RECIPES[0];
    const sinewItemId = SINEW_SOURCE_ITEM_IDS[0];
    assert(spinRecipe && sinewItemId);
    const player = { id: 3 } as PlayerState;
    const services = {
        animation: { playLocAnimation: () => undefined, playPlayerSeq: () => undefined },
        combat: {
            requestAction: (_player: PlayerState, request: Record<string, unknown>) => {
                requests.push(request);
                return { ok: true };
            },
        },
        data: { getLocDefinition: () => ({ name: "Range" }) },
        dialog: {
            openSkillMulti: (_player: PlayerState, options: { onSelect: (index: number, quantity: number) => void }) => {
                options.onSelect(0, 1);
                return true;
            },
        },
        inventory: { getInventoryItems: () => [inventoryEntry(0, spinRecipe.inputItemId)] },
        location: { faceTile: () => undefined },
        messaging: { sendGameMessage: () => undefined },
        skills: { getSkill: () => ({ baseLevel: 99, boost: 0 }) },
        sound: { sendSound: () => undefined },
        system: { getCurrentTick: () => 88 },
    } as unknown as ScriptServices;
    registerSpinning(captured.registry, services);

    const spin = captured.locInteractions.get(SPINNING_WHEEL_LOC_IDS[0]);
    assert(spin);
    void spin({
        player,
        services,
        tick: 20,
        locId: SPINNING_WHEEL_LOC_IDS[0],
        tile: { x: 1, y: 2 },
        level: 0,
        action: "spin",
    });
    assert.deepEqual(
        {
            kind: requests[0]?.kind,
            delayTicks: requests[0]?.delayTicks,
            cooldownTicks: requests[0]?.cooldownTicks,
            groups: requests[0]?.groups,
        },
        {
            kind: "skill.spin",
            delayTicks: spinRecipe.delayTicks,
            cooldownTicks: spinRecipe.delayTicks,
            groups: ["skill.spin"],
        },
    );

    const sinew = captured.itemOnLoc.get(sinewItemId);
    assert(sinew);
    void sinew({
        player,
        services,
        tick: 21,
        source: { slot: 0, itemId: sinewItemId },
        target: { locId: 100, tile: { x: 3, y: 4 }, level: 0 },
    });
    assert.deepEqual(
        {
            kind: requests[1]?.kind,
            delayTicks: requests[1]?.delayTicks,
            cooldownTicks: requests[1]?.cooldownTicks,
            groups: requests[1]?.groups,
        },
        {
            kind: "skill.sinew",
            delayTicks: SINEW_DELAY_TICKS,
            cooldownTicks: SINEW_DELAY_TICKS,
            groups: ["skill.sinew"],
        },
    );
}

// Range cooking uses effective levels consistently in both its chooser and
// executor, and a delayed dialog choice schedules from the live clock.
{
    const captured = captureRegistry();
    const recipe = COOKING_RECIPES.find((candidate) => candidate.level > 1);
    assert(recipe);
    let dialog: ScriptDialogOptionRequest | undefined;
    let currentTick = 40;
    const requests: Array<{ request: Record<string, unknown>; tick: number }> = [];
    const player = { id: 20 } as PlayerState;
    const services = {
        combat: {
            requestAction: (
                _player: PlayerState,
                request: Record<string, unknown>,
                tick: number,
            ) => {
                requests.push({ request, tick });
                return { ok: true };
            },
        },
        data: { getLocDefinition: () => ({ name: "Range", supportItems: 1 }) },
        dialog: {
            openDialogOptions: (_player: PlayerState, request: ScriptDialogOptionRequest) => {
                dialog = request;
                return true;
            },
            closeDialog: () => undefined,
        },
        inventory: {
            getInventoryItems: () => [inventoryEntry(0, recipe.rawItemId)],
        },
        messaging: { sendGameMessage: () => undefined },
        skills: {
            getSkill: () => ({ baseLevel: recipe.level - 1, boost: 1 }),
        },
        system: { getCurrentTick: () => currentTick },
    } as unknown as ScriptServices;
    registerCookingInteractions(captured.registry, services);
    const cook = captured.locActions.get("cook");
    assert(cook);
    void cook({
        player,
        services,
        tick: 10,
        locId: 100,
        tile: { x: 1, y: 1 },
        level: 0,
        action: "cook",
    });
    assert(dialog, "a boost-unlocked recipe should be available in the range chooser");
    assert.equal(dialog.disabledOptions?.[0], false);
    currentTick = 75;
    dialog.onSelect(0);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.tick, 75);
    assert.equal(requests[0]?.request.kind, "skill.cook");
}

console.log("skilling-action-routing.test.ts: all assertions passed");
