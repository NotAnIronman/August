import assert from "node:assert/strict";

import { register as registerFrozenDoor } from "@server/content/modules/frozen-door";
import { register as registerHerblore } from "@server/content/gamemodes/vanilla/skills/herblore";
import { executeBoltEnchantAction } from "@server/content/gamemodes/vanilla/skills/production/boltEnchant";
import { register as registerRunecrafting } from "@server/content/gamemodes/vanilla/skills/runecrafting";
import { register as registerPicklock } from "@server/content/gamemodes/vanilla/skills/thieving/picklock";
import { register as registerPickpocket } from "@server/content/gamemodes/vanilla/skills/thieving/pickpocket";
import { LockState } from "@server/game/model/LockState";
import { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { InventoryFacade } from "@server/game/scripts/serviceInterfaces";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import type {
    IScriptRegistry,
    ItemOnItemHandler,
    LocInteractionHandler,
    NpcInteractionHandler,
    ScriptActionHandler,
    ScriptInventoryEntry,
    ScriptServices,
} from "@server/game/scripts/types";

type CapturedRegistry = {
    registry: IScriptRegistry;
    actionHandlers: Map<string, ScriptActionHandler>;
    itemActions: Map<string, ItemOnItemHandler>;
    itemOnItems: Map<string, ItemOnItemHandler>;
    locInteractions: Map<string, LocInteractionHandler>;
    npcInteractions: Map<string, NpcInteractionHandler>;
};

function registryKey(id: number, action?: string): string {
    return `${id}:${action ?? ""}`;
}

function itemPairKey(first: number, second: number): string {
    return first <= second ? `${first}:${second}` : `${second}:${first}`;
}

function captureRegistry(): CapturedRegistry {
    const actionHandlers = new Map<string, ScriptActionHandler>();
    const itemActions = new Map<string, ItemOnItemHandler>();
    const itemOnItems = new Map<string, ItemOnItemHandler>();
    const locInteractions = new Map<string, LocInteractionHandler>();
    const npcInteractions = new Map<string, NpcInteractionHandler>();
    const registry = new Proxy(
        {},
        {
            get: (_target, property) => (...args: unknown[]) => {
                if (property === "registerActionHandler") {
                    actionHandlers.set(args[0] as string, args[1] as ScriptActionHandler);
                } else if (property === "registerItemAction") {
                    itemActions.set(
                        registryKey(args[0] as number, args[2] as string | undefined),
                        args[1] as ItemOnItemHandler,
                    );
                } else if (property === "registerItemOnItem") {
                    itemOnItems.set(
                        itemPairKey(args[0] as number, args[1] as number),
                        args[2] as ItemOnItemHandler,
                    );
                } else if (property === "registerNpcInteraction") {
                    npcInteractions.set(
                        registryKey(args[0] as number, args[2] as string | undefined),
                        args[1] as NpcInteractionHandler,
                    );
                } else if (property === "registerLocInteraction") {
                    locInteractions.set(
                        registryKey(args[0] as number, args[2] as string | undefined),
                        args[1] as LocInteractionHandler,
                    );
                }
                return { unregister: () => undefined };
            },
        },
    ) as unknown as IScriptRegistry;
    return { registry, actionHandlers, itemActions, itemOnItems, locInteractions, npcInteractions };
}

function createInventory(
    initial: ReadonlyArray<Partial<ScriptInventoryEntry>>,
    failAdds = new Set<number>(),
): { facade: InventoryFacade; slots: ScriptInventoryEntry[] } {
    const slots = Array.from({ length: 28 }, (_, slot) => ({
        slot,
        itemId: -1,
        quantity: 0,
    }));
    for (const entry of initial) {
        const slot = entry.slot ?? 0;
        slots[slot] = {
            slot,
            itemId: entry.itemId ?? -1,
            quantity: entry.quantity ?? 0,
        };
    }
    const facade = {
        consumeItem: (_player: PlayerState, slot: number) => {
            const entry = slots[slot];
            if (!entry || entry.itemId <= 0 || entry.quantity <= 0) return false;
            entry.quantity -= 1;
            if (entry.quantity === 0) entry.itemId = -1;
            return true;
        },
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
            if (failAdds.has(itemId)) return { slot: -1, added: 0 };
            const existing = slots.find(
                (entry) => entry.itemId === itemId && entry.quantity > 0,
            );
            if (existing) {
                existing.quantity += quantity;
                return { slot: existing.slot, added: quantity };
            }
            const empty = slots.find((entry) => entry.itemId <= 0 || entry.quantity <= 0);
            if (!empty) return { slot: -1, added: 0 };
            empty.itemId = itemId;
            empty.quantity = quantity;
            return { slot: empty.slot, added: quantity };
        },
    } as unknown as InventoryFacade;
    return { facade, slots };
}

function playerWithInventory(id: number, facade: InventoryFacade): PlayerState {
    return {
        id,
        lock: LockState.NONE,
        items: {
            hasItem: (itemId: number, quantity = 1) =>
                facade
                    .getInventoryItems({} as PlayerState)
                    .filter((entry) => entry.itemId === itemId)
                    .reduce((total, entry) => total + entry.quantity, 0) >= quantity,
            getItemCount: (itemId: number) =>
                facade
                    .getInventoryItems({} as PlayerState)
                    .filter((entry) => entry.itemId === itemId)
                    .reduce((total, entry) => total + entry.quantity, 0),
            addItem: (itemId: number, quantity: number) => ({
                completed: facade.addItemToInventory({} as PlayerState, itemId, quantity).added,
            }),
        },
    } as unknown as PlayerState;
}

// Generic allocation must not consume quantities reserved by a later exact-slot
// input, and first-consumed-slot must still follow the declared input order.
{
    const { facade, slots } = createInventory([
        { slot: 0, itemId: 100, quantity: 1 },
        { slot: 5, itemId: 100, quantity: 1 },
    ]);
    const player = playerWithInventory(99, facade);
    const result = applyInventoryTransform(facade, player, {
        inputs: [
            { itemId: 100, quantity: 1 },
            { itemId: 100, quantity: 1, slot: 0 },
        ],
        outputs: [{ itemId: 200, quantity: 1 }],
        outputPlacement: "first-consumed-slot",
    });
    assert.deepEqual(result, { ok: true, firstConsumedSlot: 5 });
    assert.deepEqual(slots[0], { slot: 0, itemId: -1, quantity: 0 });
    assert.deepEqual(slots[5], { slot: 5, itemId: 200, quantity: 1 });
}

{
    const { facade, slots } = createInventory([{ slot: 0, itemId: 100, quantity: 1 }]);
    const before = slots.map((entry) => ({ ...entry }));
    const result = applyInventoryTransform(facade, playerWithInventory(100, facade), {
        inputs: [{ itemId: 100, quantity: 1, slot: 28 }],
        outputs: [{ itemId: 200, quantity: 1 }],
    });
    assert.deepEqual(result, { ok: false, reason: "invalid-transform" });
    assert.deepEqual(slots, before);
}

// Bolt enchanting must treat bolts, inventory runes, and output as one commit.
{
    const fullInventory = Array.from({ length: 28 }, (_, slot) => ({
        slot,
        itemId: slot === 0 ? 100 : slot === 1 ? 556 : 10_000 + slot,
        quantity: slot === 0 ? 20 : slot === 1 ? 2 : 1,
    }));
    const { facade, slots } = createInventory(fullInventory);
    const before = slots.map((entry) => ({ ...entry }));
    const player = playerWithInventory(1, facade);
    let xp = 0;
    const services = {
        inventory: facade,
        equipment: { getEquipArray: () => [] },
        combat: {
            validateRunes: () => ({
                canCast: true,
                runesConsumed: [{ runeId: 556, quantity: 1 }],
            }),
            scheduleAction: () => ({ ok: true }),
        },
        animation: { playPlayerSeq: () => undefined },
        skills: { addSkillXp: (_player: PlayerState, _skill: number, amount: number) => { xp += amount; } },
        system: {},
    } as unknown as ScriptServices;

    const result = executeBoltEnchantAction({
        player,
        tick: 10,
        services,
        data: {
            sourceItemId: 100,
            enchantedItemId: 200,
            enchantedName: "test bolts",
            runeCosts: [{ runeId: 556, quantity: 1 }],
            xp: 7,
            count: 1,
        },
    });
    assert.deepEqual(slots, before, "a full-inventory enchant failure must restore bolts and runes");
    assert.equal(xp, 0, "a rolled-back enchant must not award XP");
    assert.equal(result.reason, "bolt_enchant_inventory_full");
}

// A failed pickpocket phase enqueue must not strand the player lock or busy varbit.
{
    const captured = captureRegistry();
    registerPickpocket(captured.registry, {} as ScriptServices);
    const handler = captured.actionHandlers.get("skill.pickpocket");
    assert(handler, "pickpocket action handler should be registered");
    const npc = new NpcState(999, 3297, 1, -1, -1, 32, { x: 3201, y: 3200, level: 0 });
    const player = {
        id: 2, lock: LockState.NONE, level: 0, worldViewId: -1,
        skillSystem: { getHitpointsCurrent: () => 10 },
    } as unknown as PlayerState;
    let faceClears = 0;
    let requestedData: unknown;
    let enqueues = 0;
    const varbits: Array<[number, number]> = [];
    const services = {
        skills: { getSkill: () => ({ baseLevel: 99, boost: 0 }) },
        inventory: { hasInventorySlot: () => true, getInventoryItems: () => [] },
        combat: {
            getNpc: (id: number) => id === npc.id ? npc : undefined,
            isPlayerStunned: () => false,
            isPlayerInCombat: () => false,
            requestAction: (_player: PlayerState, request: { data: unknown }) => {
                requestedData = request.data;
                return { ok: true };
            },
            scheduleAction: () => { enqueues += 1; return { ok: false }; },
            clearPlayerFaceTarget: () => { faceClears += 1; },
        },
        animation: { playPlayerSeq: () => undefined },
        location: { isAdjacentToNpc: () => true },
        npc: { stopNpcMovement: () => undefined },
        variables: { sendVarbit: (_player: PlayerState, id: number, value: number) => { varbits.push([id, value]); } },
    } as unknown as ScriptServices;

    const interact = captured.npcInteractions.get(registryKey(npc.typeId, "pickpocket"));
    assert(interact, "pickpocket NPC interaction should be registered");
    interact({ player, npc, services, tick: 20 });
    assert.deepEqual(requestedData, { npcId: npc.id, npcTypeId: npc.typeId, phase: 0 });
    handler({ player, services, tick: 20, data: requestedData });
    assert.equal(enqueues, 1);
    assert.equal(player.lock, LockState.NONE);
    assert.equal(faceClears, 1);
    assert.deepEqual(varbits.at(-1), [12393, 0]);
}

// Opening one pouch in a full inventory must be all-or-nothing.
{
    const captured = captureRegistry();
    registerPickpocket(captured.registry, {} as ScriptServices);
    const open = captured.itemActions.get(registryKey(22521, "open"));
    assert(open, "coin-pouch open handler should be registered");
    const fullInventory = Array.from({ length: 28 }, (_, slot) => ({
        slot,
        itemId: slot === 0 ? 22521 : 20_000 + slot,
        quantity: slot === 0 ? 2 : 1,
    }));
    const { facade, slots } = createInventory(fullInventory);
    const before = slots.map((entry) => ({ ...entry }));
    const player = playerWithInventory(3, facade);
    const messages: string[] = [];
    const services = {
        inventory: {
            ...facade,
            snapshotInventory: () => undefined,
        },
        messaging: { sendGameMessage: (_player: PlayerState, message: string) => messages.push(message) },
        sound: { sendSound: () => undefined },
    } as unknown as ScriptServices;
    void open({
        player,
        source: { slot: 0, itemId: 22521 },
        target: { slot: 0, itemId: 22521 },
        tick: 1,
        services,
    });
    assert.deepEqual(slots, before);
    assert(messages.some((message) => /inventory space/i.test(message)));
}

// Picklock start/continuation timings share one skill action family.
{
    const captured = captureRegistry();
    registerPicklock(captured.registry, {} as ScriptServices);
    const interaction = captured.locInteractions.get(registryKey(5492, "pick-lock"));
    const handler = captured.actionHandlers.get("skill.picklock");
    assert(interaction && handler, "picklock interaction and action handler should be registered");
    const requests: Array<Record<string, unknown>> = [];
    const repeats: Array<Record<string, unknown>> = [];
    const player = { id: 4, tileX:1, tileY:2, level:0, worldViewId:-1,
        canInteract: () => true, status:{hitpointsCurrent:10}, skillSystem:{getHitpointsCurrent:()=>10},
        varps:{getVarbitValue:()=>0} } as unknown as PlayerState;
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
        data: { getLocDefinition: () => ({ id:5492, actions:["Pick-lock"] }) },
        location: { isAdjacentToLoc: () => true, resolveLocTransformId: () => 5492 },
        messaging: { sendGameMessage: () => undefined },
        skills: { getSkill: () => ({ baseLevel: 1, boost: 0 }) },
        sound: { sendSound: () => undefined },
    } as unknown as ScriptServices;
    void interaction({
        player,
        services,
        tick: 30,
        locId: 5492,
        tile: { x: 1, y: 2 },
        level: 0,
        action: "pick-lock",
    });
    assert.deepEqual(
        {
            kind: requests[0]?.kind,
            delayTicks: requests[0]?.delayTicks,
            cooldownTicks: requests[0]?.cooldownTicks,
            groups: requests[0]?.groups,
        },
        { kind: "skill.picklock", delayTicks: 0, cooldownTicks: 0, groups: ["skill.picklock"] },
    );
    handler({ player, services, tick: 30, data: { ...(requests[0]?.data as object), started: false } });
    assert.equal(repeats[0]?.kind, "skill.picklock");
    assert.equal(repeats[0]?.delayTicks, 1);
    assert.deepEqual(repeats[0]?.groups, ["skill.picklock"]);
}

// Herblore transforms only the two clicked slots and keeps the result in the
// clicked vial/secondary/potion slot even when an identical input appears first.
{
    const captured = captureRegistry();
    const { facade, slots } = createInventory([
        { slot: 0, itemId: 227, quantity: 1 },
        { slot: 5, itemId: 227, quantity: 1 },
        { slot: 7, itemId: 249, quantity: 1 },
    ]);
    const player = playerWithInventory(7, facade);
    const services = {
        inventory: { ...facade, snapshotInventoryImmediate: () => undefined },
        skills: {
            getSkill: () => ({ baseLevel: 99, boost: 0 }),
            addSkillXp: () => undefined,
        },
        messaging: { sendGameMessage: () => undefined },
    } as unknown as ScriptServices;
    registerHerblore(captured.registry, services);
    const mix = captured.itemOnItems.get(itemPairKey(249, 227));
    assert(mix, "guam and vial-of-water handler should be registered");
    void mix({
        player,
        source: { slot: 7, itemId: 249 },
        target: { slot: 5, itemId: 227 },
        tick: 1,
        services,
    });
    assert.deepEqual(slots[0], { slot: 0, itemId: 227, quantity: 1 });
    assert.deepEqual(slots[5], { slot: 5, itemId: 91, quantity: 1 });
    assert.deepEqual(slots[7], { slot: 7, itemId: -1, quantity: 0 });
}

// Frozen Key assembly and whole-inventory Air Runecrafting commit atomically.
{
    const captured = captureRegistry();
    const { facade, slots } = createInventory([
        { slot: 0, itemId: 26358, quantity: 1 },
        { slot: 1, itemId: 26360, quantity: 1 },
        { slot: 2, itemId: 26362, quantity: 1 },
        { slot: 3, itemId: 26364, quantity: 1 },
    ]);
    const player = playerWithInventory(5, facade);
    const messages: string[] = [];
    const services = {
        inventory: { ...facade, snapshotInventoryImmediate: () => undefined },
        messaging: { sendGameMessage: (_player: PlayerState, message: string) => messages.push(message) },
    } as unknown as ScriptServices;
    registerFrozenDoor(captured.registry, services);
    const assemble = captured.itemActions.get(registryKey(26358, "assemble"));
    assert(assemble, "Frozen Key assemble handler should be registered");
    void assemble({
        player,
        source: { slot: 0, itemId: 26358 },
        target: { slot: 0, itemId: 26358 },
        tick: 1,
        services,
    });
    assert.equal(slots.filter((entry) => entry.itemId === 26356).length, 1);
    assert.equal([26358, 26360, 26362, 26364].some((id) => slots.some((entry) => entry.itemId === id)), false);
    assert(messages.some((message) => /assemble the frozen key pieces/i.test(message)));
}

{
    const captured = captureRegistry();
    registerRunecrafting(captured.registry);
    const craft = captured.locInteractions.get(registryKey(34760, "craft-rune"));
    assert(craft, "Air altar craft handler should be registered");
    const { facade, slots } = createInventory([
        { slot: 0, itemId: 1436, quantity: 2 },
        { slot: 1, itemId: 7936, quantity: 1 },
    ]);
    const player = playerWithInventory(6, facade);
    let xp = 0;
    const services = {
        inventory: { ...facade, snapshotInventory: () => undefined },
        skills: {
            getSkill: () => ({ baseLevel: 1, boost: 0 }),
            addSkillXp: (_player: PlayerState, _skill: number, amount: number) => { xp += amount; },
        },
        messaging: { sendGameMessage: () => undefined },
    } as unknown as ScriptServices;
    void craft({
        player,
        services,
        tick: 1,
        locId: 34760,
        tile: { x: 0, y: 0 },
        level: 0,
        action: "craft-rune",
    });
    assert.equal(slots.some((entry) => entry.itemId === 1436 || entry.itemId === 7936), false);
    assert.equal(slots.find((entry) => entry.itemId === 556)?.quantity, 3);
    assert.equal(xp, 15);
}

console.log("skilling-content-boundaries.test.ts: all assertions passed");
