import assert from "node:assert/strict";
import { test } from "node:test";

import { createPickpocketRuntime } from "@server/content/gamemodes/vanilla/skills/thieving/pickpocket";
import { getQuestDefinitionByKey, registerQuestDefinition } from "@server/content/gamemodes/vanilla/quests/QuestRegistry";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { GameEventBus } from "@server/game/events/GameEventBus";
import { LockState } from "@server/game/model/LockState";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { InventoryFacade } from "@server/game/scripts/serviceInterfaces";
import type {
    IScriptRegistry, NpcInteractionHandler, ScriptActionHandler, ScriptInventoryEntry,
    ScriptServices, TickHandler,
} from "@server/game/scripts/types";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import { getThievingSuccessChance } from "@server/game/skilling/ThievingPolicy";

type Definition = NonNullable<Parameters<typeof createPickpocketRuntime>[0]>[number];
type Payload = { npcId: number; npcTypeId: number; phase: number; attemptId?: number };
type Request = {
    kind: string; data: Payload; delayTicks: number; cooldownTicks: number;
    groups: string[]; rejectIfGroupPending?: boolean;
};
const loot = (itemId: number, quantity = 1, weight = 1) => ({
    itemId, minAmount: quantity, maxAmount: quantity, weight,
});
const definition: Definition = {
    npcIds: [3297], reqLevel: 55, xp: 84.3, lootTable: [loot(995, 50)],
    coinPouchId: 22529, minDamage: 2, maxDamage: 4, stunTicks: 8,
    displayName: "Knight of Ardougne",
};

// Reference identity is significant: replacing this object with the same numeric ID
// must invalidate an attempt. No catch-all proxy can hide missing runtime methods.
function npcFixture(id = 10, typeId = 3297) {
    return {
        id, typeId, name: "Knight", x: 3201, y: 3200, level: 0, worldViewId: -1,
        ownerPlayerId: undefined as number | undefined,
        hp: 10, dead: false, combatTarget: undefined as number | undefined,
        facing: undefined as { type: "player"; id: number } | undefined,
        isDead(_tick: number) { return this.dead; },
        getHitpoints() { return this.hp; },
        getCombatTargetPlayerId() { return this.combatTarget; },
        getInteractionTarget() { return this.facing; },
        clearInteractionTarget() { this.facing = undefined; },
    };
}
type NpcFixture = ReturnType<typeof npcFixture>;

function playerFixture(id = 1) {
    const state = { hp: 30, base: 55, boost: 0, hunter: 54, hunterBoost: 0, combat: false, stunned: false };
    const varbitValues = new Map<number, number>();
    const varpValues = new Map<number, number>();
    const variableReads: Array<["varbit" | "varp", number]> = [];
    const player = {
        id, x: 3200, y: 3200, level: 0, worldViewId: -1, lock: LockState.NONE,
        get tileX(): number { return player.x; },
        get tileY(): number { return player.y; },
        skillSystem: { getHitpointsCurrent: () => state.hp },
        varps: {
            getVarbitValue: (varbit: number) => { variableReads.push(["varbit", varbit]); return varbitValues.get(varbit) ?? 0; },
            getVarpValue: (varp: number) => { variableReads.push(["varp", varp]); return varpValues.get(varp) ?? 0; },
        },
    } as unknown as PlayerState;
    return { player, state, varbitValues, varpValues, variableReads };
}

function inventoryFixture() {
    const slots: ScriptInventoryEntry[] = Array.from({ length: 28 }, (_, slot) => ({ slot, itemId: -1, quantity: 0 }));
    const stackable = new Set([995, 22529, 22536, 6529, 562]);
    const calls: Array<[number, number]> = [];
    let throwAfterAdd: number | undefined;
    const facade = {
        getInventoryItems: () => slots.map((entry) => ({ ...entry })),
        hasInventorySlot: () => slots.some((entry) => entry.itemId <= 0),
        setInventorySlot: (_player: PlayerState, slot: number, itemId: number, quantity: number) => {
            slots[slot] = { slot, itemId, quantity };
        },
        addItemToInventory: (_player: PlayerState, itemId: number, quantity: number) => {
            calls.push([itemId, quantity]);
            let added = 0;
            let firstSlot = -1;
            while (added < quantity) {
                const entry = (stackable.has(itemId) ? slots.find((s) => s.itemId === itemId) : undefined)
                    ?? slots.find((s) => s.itemId <= 0);
                if (!entry) break;
                const amount = stackable.has(itemId) ? quantity - added : 1;
                entry.itemId = itemId;
                entry.quantity += amount;
                if (firstSlot === -1) firstSlot = entry.slot;
                added += amount;
            }
            if (itemId === throwAfterAdd) throw new Error("inventory write failed after mutation");
            return { slot: firstSlot, added };
        },
    } satisfies Pick<InventoryFacade, "getInventoryItems" | "hasInventorySlot" | "setInventorySlot" | "addItemToInventory">;
    return {
        facade: facade as unknown as InventoryFacade, slots, calls,
        throwOn(itemId: number) { throwAfterAdd = itemId; },
        fill(count = 28) {
            for (let slot = 0; slot < count; slot++) slots[slot] = { slot, itemId: 20000 + slot, quantity: 1 };
        },
        count(itemId: number) { return slots.reduce((sum, s) => sum + (s.itemId === itemId ? s.quantity : 0), 0); },
        snapshot() { return slots.map((entry) => ({ ...entry })); },
    };
}

function harness(overrides: Partial<Definition> = {}, rolls: number[] = []) {
    const def = { ...definition, ...overrides };
    const first = playerFixture();
    const players = new Map([[first.player.id, first]]);
    const inventory = inventoryFixture();
    const inventories = new Map([[first.player.id, inventory]]);
    const npc = npcFixture(10, def.npcIds[0]);
    const npcs = new Map<number, NpcFixture>([[npc.id, npc]]);
    const eventBus = new GameEventBus();
    const interactions = new Map<number, NpcInteractionHandler>();
    const npcActions = new Map<string, NpcInteractionHandler>();
    const cleanups: Array<() => void> = [];
    const ticks: TickHandler[] = [];
    const requests: Array<{ player: PlayerState; request: Request; tick: number }> = [];
    const queue: Array<{ player: PlayerState; request: Request; tick: number }> = [];
    const scheduled: typeof queue = [];
    const xp: Array<[number, number, number]> = [];
    const varbits: Array<[number, number, number]> = [];
    const faceClears: number[] = [];
    const animations: Array<[number, number]> = [];
    const spots: Array<[number, number, number]> = [];
    const sounds: number[] = [];
    const chats: string[] = [];
    const npcSequences: number[] = [];
    const stops: Array<[number, number]> = [];
    const stuns: Array<[number, number]> = [];
    const damage: Array<[number, number, number, number]> = [];
    const teleports: Array<[number, number, number, number]> = [];
    const engagements: Array<[number, number]> = [];
    const searches: Array<[number, number]> = [];
    const guards = new Map<number, NpcFixture>();
    const blockedSight = new Set<number>();
    const equipment = Array<number>(14).fill(-1);
    const control = { enqueue: true, request: true, throwSchedule: false, randomCalls: 0 };
    let action: ScriptActionHandler | undefined;
    const registry = {
        registerActionHandler: (_kind: string, handler: ScriptActionHandler) => { action = handler; },
        registerNpcInteraction: (typeId: number, handler: NpcInteractionHandler, option: string) => {
            assert.equal(option, "pickpocket");
            interactions.set(typeId, handler);
        },
        registerNpcAction: (option: string, handler: NpcInteractionHandler) => { npcActions.set(option, handler); },
        registerTickHandler: (handler: TickHandler) => { ticks.push(handler); },
        registerCleanup: (handler: () => void) => { cleanups.push(handler); },
    } as unknown as IScriptRegistry;
    const services = {
        system: { eventBus },
        inventory: {
            getInventoryItems: (player: PlayerState) => inventories.get(player.id)!.facade.getInventoryItems(player),
            hasInventorySlot: (player: PlayerState) => inventories.get(player.id)!.facade.hasInventorySlot(player),
            setInventorySlot: (player: PlayerState, slot: number, itemId: number, quantity: number) =>
                inventories.get(player.id)!.facade.setInventorySlot(player, slot, itemId, quantity),
            addItemToInventory: (player: PlayerState, itemId: number, quantity: number) =>
                inventories.get(player.id)!.facade.addItemToInventory(player, itemId, quantity),
        },
        skills: {
            getSkill: (player: PlayerState, skillId: number) => {
                const state = players.get(player.id)!.state;
                assert.ok(skillId === 17 || skillId === 21);
                return skillId === 17 ? { baseLevel: state.base, boost: state.boost }
                    : { baseLevel: state.hunter, boost: state.hunterBoost };
            },
            addSkillXp: (player: PlayerState, skillId: number, amount: number) => { xp.push([player.id, skillId, amount]); },
        },
        equipment: { getEquipArray: () => equipment },
        location: {
            isAdjacentToNpc: (player: PlayerState, target: NpcState) =>
                Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y)) <= 1,
        },
        combat: {
            getNpc: (id: number) => npcs.get(id),
            isPlayerStunned: (player: PlayerState) => players.get(player.id)!.state.stunned,
            isPlayerInCombat: (player: PlayerState) => players.get(player.id)!.state.combat,
            requestAction: (player: PlayerState, request: Request, tick: number) => {
                requests.push({ player, request, tick });
                return { ok: control.request };
            },
            scheduleAction: (id: number, request: Request, tick: number) => {
                if (control.throwSchedule) throw new Error("schedule failed");
                const entry = { player: players.get(id)!.player, request, tick: tick + request.delayTicks };
                scheduled.push(entry);
                if (control.enqueue) queue.push(entry);
                return { ok: control.enqueue };
            },
            clearPlayerFaceTarget: (player: PlayerState) => { faceClears.push(player.id); },
            applyPlayerHitsplat: (player: PlayerState, style: number, amount: number, tick: number) => {
                const state = players.get(player.id)!.state;
                const applied = Math.min(state.hp, amount);
                state.hp -= applied;
                damage.push([player.id, style, amount, tick]);
                return { amount: applied, style, hpCurrent: state.hp, hpMax: 30 };
            },
            stunPlayer: (player: PlayerState, duration: number) => {
                players.get(player.id)!.state.stunned = true;
                stuns.push([player.id, duration]);
            },
        },
        animation: {
            playPlayerSeq: (player: PlayerState, sequence: number) => { animations.push([player.id, sequence]); },
            broadcastPlayerSpot: (player: PlayerState, spot: number, height: number) => { spots.push([player.id, spot, height]); },
        },
        variables: { sendVarbit: (player: PlayerState, id: number, value: number) => { varbits.push([player.id, id, value]); } },
        sound: { sendSound: (_player: PlayerState, id: number) => { sounds.push(id); } },
        npc: {
            stopNpcMovement: (target: NpcState, duration: number) => { stops.push([target.id, duration]); },
            queueNpcForcedChat: (_target: NpcState, message: string) => { chats.push(message); },
            faceNpcToPlayer: (target: NpcFixture, player: PlayerState) => { target.facing = { type: "player", id: player.id }; },
            queueNpcSeq: (_target: NpcState, sequence: number) => { npcSequences.push(sequence); },
            engageCombat: (target: NpcFixture, player: PlayerState) => {
                target.combatTarget = player.id;
                engagements.push([target.id, player.id]);
            },
            findNearbyNpc: (_player: PlayerState, typeId: number, radius: number) => {
                searches.push([typeId, radius]);
                return guards.get(typeId);
            },
            hasLineOfSightToPlayer: (target: NpcState) => !blockedSight.has(target.id),
        },
        movement: { teleportPlayer: (player: PlayerState, x: number, y: number, level: number) => {
            teleports.push([player.id, x, y, level]);
            Object.assign(player, { x, y, level });
        } },
    } as unknown as ScriptServices;
    const runtime = createPickpocketRuntime([def], () => {
        control.randomCalls++;
        return rolls.shift() ?? 0;
    });
    runtime.register(registry, services);
    assert.ok(action);
    const execute = (data: Payload, tick = 20, player = first.player) => action!({ player, services, data, tick });
    const start = (player = first.player, tick = 20) => {
        const interaction = interactions.get(npc.typeId) ?? npcActions.get("pickpocket");
        assert.ok(interaction, "expected a direct NPC interaction or generic Pickpocket handler");
        interaction({ player, npc: npc as unknown as NpcState, services, tick });
        const request = requests.at(-1)!;
        assert.equal(request.request.kind, "skill.pickpocket");
        return execute(request.request.data, tick, player);
    };
    return {
        ...first, def, npc, npcs, inventory, runtime, registry, services, eventBus,
        control, equipment, guards, blockedSight, requests, queue, scheduled, xp, varbits,
        faceClears, animations, spots, sounds, chats, npcSequences, stops, stuns, damage,
        teleports, engagements, searches, execute, start, interactions, npcActions,
        addPlayer(id: number) {
            const value = playerFixture(id);
            const otherInventory = inventoryFixture();
            players.set(id, value); inventories.set(id, otherInventory);
            return { ...value, inventory: otherInventory };
        },
        next() { const entry = queue.shift(); assert.ok(entry, "expected a queued continuation"); return execute(entry.request.data, entry.tick, entry.player); },
        tick(tick: number) { for (const handler of ticks) handler({ tick, services }); },
        unload() { for (const cleanup of cleanups) cleanup(); },
    };
}
type Harness = ReturnType<typeof harness>;
function released(h: Harness, player = h.player) {
    assert.equal(player.lock, LockState.NONE);
    assert.ok(h.faceClears.includes(player.id));
    assert.deepEqual(h.varbits.filter(([id]) => id === player.id).at(-1), [player.id, 12393, 0]);
}
function noReward(h: Harness) {
    assert.deepEqual(h.xp, []);
    assert.deepEqual(h.inventory.calls, []);
    assert.equal(h.sounds.includes(2581), false);
}

test("interaction uses the live target and success grants one pouch/XP with a one-tick cooldown", () => {
    const h = harness();
    assert.equal(h.start().cooldownTicks, 1);
    assert.deepEqual(h.requests[0], {
        player: h.player, tick: 20,
        request: { kind: "skill.pickpocket", data: { npcId: 10, npcTypeId: 3297, phase: 0 },
            delayTicks: 0, cooldownTicks: 0, groups: ["skill.pickpocket"], rejectIfGroupPending: true },
    });
    assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    assert.deepEqual(h.animations, [[1, 881]]);
    assert.deepEqual(h.stops, [[10, 2]]);
    assert.equal(h.queue[0].tick, 21);
    assert.equal(h.queue[0].request.cooldownTicks, 1);
    assert.deepEqual(h.queue[0].request.groups, ["skill.pickpocket"]);
    const result = h.next();
    assert.equal(result.ok, true);
    assert.equal(result.cooldownTicks, 1);
    assert.deepEqual(h.xp, [[1, 17, 84.3]]);
    assert.equal(h.inventory.count(22529), 1);
    assert.equal(h.inventory.count(995), 0);
    assert.deepEqual(h.sounds, [2581]);
    assert.ok(result.effects?.some((effect) => effect.type === "inventorySnapshot"));
    assert.equal(h.queue.length, 0, "success is not automatic repeat pickpocketing");
    released(h);
});

test("boost meets the requirement; decay before resolution prevents rewards and RNG", () => {
    for (const decay of [false, true]) {
        const h = harness();
        h.state.base = 54;
        h.state.boost = 1;
        h.start();
        assert.equal(h.queue.length, 1);
        if (decay) h.state.boost = 0;
        const result = h.next();
        assert.equal(result.ok, true);
        if (decay) {
            noReward(h);
            assert.equal(h.control.randomCalls, 0);
            assert.ok(result.effects?.some((e) => e.type === "message" && /no longer meet/.test(e.message)));
        } else assert.deepEqual(h.xp, [[1, 17, 84.3]]);
        released(h);
    }
});

test("chance stays bounded and increases with a boost without pinning a provisional formula", () => {
    for (const policy of [{}, { lowChance: 40, highChance: 200 }]) {
        for (const level of [-1, 0, 54, 55, 70, 99, 120, 1000, NaN, Infinity]) {
            const chance = getThievingSuccessChance(level, 55, policy);
            assert.ok(Number.isFinite(chance) && chance >= 0 && chance <= 1);
        }
        assert.equal(getThievingSuccessChance(54, 55, policy), 0);
        assert.ok(getThievingSuccessChance(70, 55, policy) > getThievingSuccessChance(55, 55, policy));
    }
    const roll = (getThievingSuccessChance(55, 55, definition) + getThievingSuccessChance(70, 55, definition)) / 2;
    for (const boost of [0, 15]) {
        const h = harness({}, [roll]);
        h.state.boost = boost;
        h.start(); h.next();
        assert.equal(h.xp.length, boost ? 1 : 0, "runtime must use effective level for the success roll");
    }
});

const invalidTargets: Array<[string, (h: Harness) => void]> = [
    ["missing NPC", (h) => { h.npcs.delete(h.npc.id); }],
    ["dead NPC", (h) => { h.npc.dead = true; }],
    ["zero NPC HP", (h) => { h.npc.hp = 0; }],
    ["dead player", (h) => { h.state.hp = 0; }],
    ["NPC moved out of reach", (h) => { h.npc.x += 10; }],
    ["player moved out of reach", (h) => { h.player.y += 10; }],
    ["different plane", (h) => { h.npc.level = 1; }],
    ["different instance", (h) => { h.npc.worldViewId = 42; }],
    ["other player's private NPC", (h) => { h.npc.ownerPlayerId = 2; }],
];
for (const [name, mutate] of invalidTargets) {
    test(`rejects ${name} at start and releases it during every continuation phase`, () => {
        const initial = harness(); mutate(initial);
        assert.equal(initial.start().reason, "pickpocket_target_gone");
        assert.equal(initial.player.lock, LockState.NONE);
        assert.equal(initial.queue.length, 0);
        noReward(initial);
        for (const phase of [1, 2, 3]) {
            const h = harness({}, [0.999999]); h.start();
            for (let i = 1; i < phase; i++) h.next();
            mutate(h);
            assert.equal(h.next().reason, "pickpocket_interrupted");
            noReward(h); released(h);
            assert.deepEqual(h.damage, []);
            assert.deepEqual(h.stuns, []);
        }
    });
}

test("same ID/type replacement cannot inherit an NPC attempt", () => {
    const h = harness(); h.start();
    h.npcs.set(h.npc.id, npcFixture(h.npc.id, h.npc.typeId));
    assert.equal(h.next().reason, "pickpocket_interrupted");
    noReward(h); released(h);
});

test("fabricated NPC/type payloads cannot supply their own level, XP or loot", () => {
    const h = harness();
    for (const data of [
        { npcId: 999, npcTypeId: 3297, phase: 0 },
        { npcId: 10, npcTypeId: 999, phase: 0 },
    ]) assert.equal(h.execute(data).reason, "pickpocket_target_gone");
    h.state.base = 1;
    const fabricated = { npcId: 10, npcTypeId: 3297, phase: 0, reqLevel: 1, xp: 999999, lootTable: [loot(995, 999999)] };
    h.execute(fabricated);
    assert.equal(h.queue.length, 0);
    noReward(h);
    h.state.base = 55;
    h.execute(fabricated); h.next();
    assert.deepEqual(h.xp, [[1, 17, definition.xp]]);
    assert.equal(h.inventory.count(22529), 1);
});

for (const [name, mutate] of [
    ["below effective level", (h: Harness) => { h.state.boost = -1; }],
    ["stunned", (h: Harness) => { h.state.stunned = true; }],
    ["in combat", (h: Harness) => { h.state.combat = true; }],
    ["NPC in combat", (h: Harness) => { h.npc.combatTarget = 2; }],
    ["pouch cap", (h: Harness) => { h.inventory.slots[0] = { slot: 0, itemId: 22529, quantity: 28 }; }],
    ["full inventory including existing pouch", (h: Harness) => {
        h.inventory.fill(); h.inventory.slots[0] = { slot: 0, itemId: 22529, quantity: 1 };
    }],
] as const) {
    test(`start rejects ${name} before scheduling or rolling`, () => {
        const h = harness(); mutate(h);
        const before = h.inventory.snapshot();
        const result = h.start();
        assert.ok(result.effects?.some((e) => e.type === "message"));
        assert.equal(h.queue.length, 0);
        assert.equal(h.control.randomCalls, 0);
        assert.equal(h.player.lock, LockState.NONE);
        assert.deepEqual(h.inventory.snapshot(), before);
        noReward(h);
    });
}

test("rechecks pouch cap before resolution", () => {
    const h = harness(); h.start();
    h.inventory.slots[0] = { slot: 0, itemId: 22529, quantity: 28 };
    h.next(); noReward(h); released(h);
    assert.equal(h.control.randomCalls, 0);
});

test("guaranteed bundle plus one weighted reward commits together", () => {
    const h = harness({ guaranteedLoot: [loot(995, 80), loot(562, 2)], lootTable: [loot(1601), loot(1603)] }, [0, 0.75]);
    h.start(); h.next();
    assert.equal(h.inventory.count(22529), 1);
    assert.equal(h.inventory.count(562), 2);
    assert.equal(h.inventory.count(1603), 1);
    assert.equal(h.inventory.count(1601), 0);
    assert.deepEqual(h.xp, [[1, 17, 84.3]]);
});

test("pouchless Tokkul rewards retain their quantity alongside noncurrency rewards", () => {
    const h = harness({ coinPouchId: undefined, lootTable: [loot(6529, 14)], guaranteedLoot: [loot(1601)] });
    h.start(); h.next();
    assert.equal(h.inventory.count(22536), 0);
    assert.equal(h.inventory.count(6529), 14);
    assert.equal(h.inventory.count(1601), 1);
});

for (const fullBeforeStart of [false, true]) {
    test(`reward rollback preserves all slots and awards no XP (${fullBeforeStart ? "one initial free slot" : "inventory fills before resolve"})`, () => {
        const h = harness({ guaranteedLoot: [loot(562, 2)], lootTable: [loot(1601, 2)] });
        if (fullBeforeStart) h.inventory.fill(27);
        h.start();
        if (!fullBeforeStart) h.inventory.fill();
        // Existing stack mutates before a later nonstackable output fails/partially adds.
        h.inventory.slots[0] = { slot: 0, itemId: 562, quantity: 10 };
        const before = h.inventory.snapshot();
        const result = h.next();
        assert.deepEqual(h.inventory.calls, [[562, 2], [1601, 2]]);
        assert.deepEqual(h.inventory.snapshot(), before);
        assert.deepEqual(h.xp, []);
        assert.equal(h.sounds.includes(2581), false);
        assert.equal(result.effects?.some((e) => e.type === "inventorySnapshot"), false);
        assert.ok(result.effects?.some((e) => e.type === "message" && /inventory space/.test(e.message)));
        released(h);
    });
}

test("reward-only transform combines duplicates and never consumes an existing item", () => {
    const inventory = inventoryFixture(); const { player } = playerFixture();
    inventory.slots[4] = { slot: 4, itemId: 562, quantity: 10 };
    inventory.slots[7] = { slot: 7, itemId: 1601, quantity: 1 };
    const result = applyInventoryTransform(inventory.facade, player, {
        inputs: [], outputs: [{ itemId: 562, quantity: 2 }, { itemId: 562, quantity: 3 }, { itemId: 1603, quantity: 1 }],
        outputPlacement: "first-consumed-slot",
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.firstConsumedSlot, undefined);
    assert.equal(inventory.count(562), 15);
    assert.deepEqual(inventory.slots[7], { slot: 7, itemId: 1601, quantity: 1 });
    assert.equal(inventory.count(1603), 1);
    assert.deepEqual(inventory.calls, [[562, 5], [1603, 1]]);
});

test("reward-only transform restores exact snapshot after partial add or thrown mutation", () => {
    for (const throws of [false, true]) {
        const inventory = inventoryFixture(); const { player } = playerFixture();
        inventory.fill(27);
        inventory.slots[6] = { slot: 6, itemId: 562, quantity: 7 };
        if (throws) inventory.throwOn(1601);
        const before = inventory.snapshot();
        const result = applyInventoryTransform(inventory.facade, player, {
            inputs: [], outputs: [{ itemId: 562, quantity: 3 }, { itemId: 1601, quantity: 2 }],
        });
        assert.deepEqual(result, { ok: false, reason: throws ? "mutation-failed" : "inventory-full" });
        assert.deepEqual(inventory.snapshot(), before);
    }
});

test("reward-only transform can extend an existing stack in an otherwise full inventory", () => {
    const inventory = inventoryFixture(); const { player } = playerFixture();
    inventory.fill(); inventory.slots[5] = { slot: 5, itemId: 562, quantity: 7 };
    const result = applyInventoryTransform(inventory.facade, player, { inputs: [], outputs: [{ itemId: 562, quantity: 2 }] });
    assert.equal(result.ok, true);
    assert.equal(inventory.count(562), 9);
    assert.equal(inventory.slots.filter((s) => s.itemId > 0).length, 28);
});

test("reward-only transform rejects empty/invalid rewards without mutation", () => {
    for (const outputs of [[], [{ itemId: 0, quantity: 1 }], [{ itemId: 995, quantity: 0 }],
        [{ itemId: 995, quantity: -1 }], [{ itemId: 995, quantity: 1.5 }],
        [{ itemId: 995, quantity: NaN }], [{ itemId: 995, quantity: Infinity }]]) {
        const inventory = inventoryFixture(); const { player } = playerFixture();
        const before = inventory.snapshot();
        assert.deepEqual(applyInventoryTransform(inventory.facade, player, { inputs: [], outputs }),
            { ok: false, reason: "invalid-transform" });
        assert.deepEqual(inventory.snapshot(), before);
        assert.deepEqual(inventory.calls, []);
    }
});

test("failure phases face/animate first, then apply bounded damage and stun exactly once", () => {
    for (const [roll, expected] of [[0, 2], [0.999999, 4]]) {
        const h = harness({}, [0.999999, roll]); h.start();
        h.next();
        assert.deepEqual(h.varbits, [[1, 12393, 1]]);
        assert.deepEqual(h.npc.facing, { type: "player", id: 1 });
        assert.deepEqual(h.damage, []);
        assert.deepEqual(h.chats, ["What do you think you're doing?"]);
        h.next();
        assert.deepEqual(h.animations, [[1, 881], [1, 424]]);
        assert.deepEqual(h.spots, [[1, 245, 124]]);
        assert.deepEqual(h.npcSequences, [390]);
        assert.deepEqual(h.damage, []);
        const continuation = h.queue[0];
        const result = h.next();
        assert.deepEqual(h.damage, [[1, 16, expected, 23]]);
        assert.deepEqual(h.stuns, [[1, 8]]);
        assert.ok(result.effects?.some((e) => e.type === "hitsplat" && e.damage === expected && e.hpCurrent === 30 - expected && e.skipAutoSound));
        assert.deepEqual(h.sounds, [2727, 519]);
        assert.equal(h.npc.facing, undefined);
        released(h); noReward(h);
        assert.equal(h.execute(continuation.request.data, 24).reason, "pickpocket_stale_attempt");
        assert.equal(h.damage.length, 1);
    }
});

test("relocation honors probability and chosen destination after nonlethal failure", () => {
    const failure: Definition["failure"] = { kind: "relocate", chance: 0.5, message: "Thrown outside.",
        destinations: [{ x: 3000, y: 3001, level: 0 }, { x: 3010, y: 3011, level: 1 }] };
    for (const relocate of [false, true]) {
        const h = harness({ failure }, [0.999999, 0, relocate ? 0.49 : 0.5, 0.75]);
        h.start(); h.next(); h.next(); const result = h.next();
        assert.deepEqual(h.teleports, relocate ? [[1, 3010, 3011, 1]] : []);
        assert.equal(result.effects?.some((e) => e.type === "message" && e.message === failure.message), relocate);
        assert.deepEqual(h.stuns, [[1, 8]]);
        noReward(h); released(h);
    }
});

test("combat failure recruits only living visible guards with line of sight", () => {
    const h = harness({ failure: { kind: "combat", guardTypeIds: [101, 102, 103, 104, 105, 106, 107], guardRadius: 6 } }, [0.999999]);
    for (const id of [101, 102, 103, 104, 105, 106]) h.guards.set(id, npcFixture(id, id));
    h.guards.get(102)!.dead = true;
    h.guards.get(103)!.hp = 0;
    h.guards.get(104)!.worldViewId = 42;
    h.guards.get(105)!.ownerPlayerId = 2;
    h.blockedSight.add(106);
    h.start(); h.next(); h.next(); h.next();
    assert.deepEqual(h.chats, ["Guards! Help!"]);
    assert.deepEqual(h.searches, [101, 102, 103, 104, 105, 106, 107].map((id) => [id, 6]));
    assert.deepEqual(h.engagements, [[10, 1], [101, 1]]);
    assert.deepEqual(h.stuns, [[1, 8]]);
    noReward(h); released(h);
});

test("lethal failure damage does not stun, relocate or start combat", () => {
    for (const failure of [
        { kind: "combat", guardTypeIds: [101] },
        { kind: "relocate", chance: 1, destinations: [{ x: 3000, y: 3001, level: 0 }], message: "Moved" },
    ] satisfies NonNullable<Definition["failure"]>[]) {
        const h = harness({ failure }, [0.999999]); h.state.hp = 1;
        h.start(); h.next(); h.next(); const result = h.next();
        assert.equal(h.state.hp, 0);
        assert.ok(result.effects?.some((e) => e.type === "hitsplat" && e.damage === 1 && e.hpCurrent === 0));
        assert.deepEqual(h.stuns, []); assert.deepEqual(h.teleports, []); assert.deepEqual(h.engagements, []);
        assert.deepEqual(h.searches, []); released(h);
    }
});

test("stale, wrong-phase and mismatched continuations cannot advance or release a live attempt", () => {
    const h = harness(); h.start();
    const live = h.queue[0].request.data;
    for (const patch of [{ attemptId: undefined }, { attemptId: live.attemptId! + 1 }, { phase: 2 }, { npcId: 11 }, { npcTypeId: 1 }]) {
        assert.equal(h.execute({ ...live, ...patch }, 21).reason, "pickpocket_stale_attempt");
        assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
        assert.deepEqual(h.faceClears, []); noReward(h);
    }
    assert.equal(h.start().reason, "pickpocket_busy");
    assert.equal(h.queue.length, 1);
    h.next();
    assert.equal(h.execute(live, 22).reason, "pickpocket_stale_attempt");
    assert.equal(h.xp.length, 1);
    h.start(h.player, 23);
    assert.notEqual(h.queue[0].request.data.attemptId, live.attemptId);
    assert.equal(h.execute(live, 24).reason, "pickpocket_stale_attempt");
    assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    h.next(); assert.equal(h.xp.length, 2);
});

test("replaying a failure phase cannot enqueue another phase or damage twice", () => {
    const h = harness({}, [0.999999]); h.start();
    const resolve = h.queue[0].request.data; h.next();
    const reaction = h.queue[0].request.data;
    assert.equal(h.execute(resolve, 22).reason, "pickpocket_stale_attempt");
    assert.equal(h.queue.length, 1);
    h.next();
    assert.equal(h.execute(reaction, 23).reason, "pickpocket_stale_attempt");
    assert.equal(h.queue.length, 1);
    h.next(); assert.equal(h.damage.length, 1);
});

for (const phase of [1, 2, 3]) {
    test(`enqueue failure for phase ${phase} releases lock, busy state and facing`, () => {
        const h = harness({}, [0.999999]);
        if (phase === 1) h.control.enqueue = false;
        h.start();
        for (let i = 1; i < phase; i++) {
            if (i === phase - 1) h.control.enqueue = false;
            h.next();
        }
        released(h); noReward(h);
        assert.equal(h.npc.facing, undefined);
        assert.equal(h.queue.length, 0);
        const rejected = h.scheduled.at(-1)!;
        assert.equal(h.execute(rejected.request.data, rejected.tick).reason, "pickpocket_stale_attempt");
        h.control.enqueue = true;
        h.start(h.player, 30);
        assert.equal(h.queue.length, 1, "enqueue failure must not leave the player busy");
    });
}

test("throwing scheduler cleans the acquired attempt before propagating the error", () => {
    const h = harness(); h.control.throwSchedule = true;
    assert.throws(() => h.start(), /schedule failed/);
    released(h); noReward(h);
    h.control.throwSchedule = false; h.start(); assert.equal(h.queue.length, 1);
});

test("logout cleans only departing player's attempt and stale callbacks remain inert", () => {
    const h = harness({}, [0.999999, 0.999999]);
    const second = h.addPlayer(2);
    h.start(); h.next();
    h.start(second.player);
    h.eventBus.emit("player:logout", { playerId: 1, username: "one" });
    released(h);
    assert.equal(second.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    assert.equal(h.next().reason, "pickpocket_stale_attempt");
    assert.equal(h.next().ok, true);
    assert.equal(second.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    h.unload(); released(h, second.player);
});

test("provider unload releases all attempts and removes its logout subscription idempotently", () => {
    const h = harness(); const second = h.addPlayer(2);
    h.start(); h.start(second.player);
    assert.equal(h.eventBus.listenerCount("player:logout"), 1);
    h.unload(); h.unload();
    assert.equal(h.eventBus.listenerCount("player:logout"), 0);
    assert.deepEqual(h.faceClears, [1, 2]);
    released(h); released(h, second.player);
    assert.equal(h.next().reason, "pickpocket_stale_attempt");
    assert.equal(h.next().reason, "pickpocket_stale_attempt");
    noReward(h);
});

test("a queued continuation from before hot reload cannot resolve a new provider's attempt", () => {
    const h = harness(); h.start();
    const oldContinuation = { ...h.queue[0].request.data };
    h.unload();
    const replacement = createPickpocketRuntime([h.def], () => 0);
    replacement.register(h.registry, h.services);
    h.start(h.player, 21);
    assert.equal(h.eventBus.listenerCount("player:logout"), 1);
    assert.equal(h.execute(oldContinuation, 22).reason, "pickpocket_stale_attempt");
    assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    noReward(h);
    const currentContinuation = h.queue.at(-1)!;
    assert.equal(h.execute(currentContinuation.request.data, 22).ok, true);
    assert.equal(h.xp.length, 1);
    released(h);
});

test("tick expiry retains an attempt through its due tick and clears a cancelled continuation after it", () => {
    for (const phase of [1, 2, 3]) {
        const h = harness({}, [0.999999]); h.start();
        for (let i = 1; i < phase; i++) h.next();
        const queued = h.queue[0];
        h.tick(queued.tick);
        assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
        h.tick(queued.tick + 1); released(h);
        assert.equal(h.next().reason, "pickpocket_stale_attempt");
        noReward(h); assert.deepEqual(h.damage, []);
        const clears = h.faceClears.length;
        h.tick(queued.tick + 2); assert.equal(h.faceClears.length, clears);
    }
});

test("tick target invalidation releases immediately even before continuation expiry", () => {
    const h = harness(); h.start(); h.npc.worldViewId = 3; h.tick(20);
    released(h); assert.equal(h.next().reason, "pickpocket_stale_attempt"); noReward(h);
});

test("interruption preserves a replacement lock and clears stun/combat-interrupted attempts", () => {
    for (const interrupt of ["lock", "stun", "combat"] as const) {
        const h = harness(); h.start();
        if (interrupt === "lock") h.player.lock = LockState.FULL_WITH_DAMAGE_IMMUNITY;
        if (interrupt === "stun") h.state.stunned = true;
        if (interrupt === "combat") h.state.combat = true;
        assert.equal(h.next().reason, "pickpocket_interrupted");
        assert.equal(h.player.lock, interrupt === "lock" ? LockState.FULL_WITH_DAMAGE_IMMUNITY : LockState.NONE);
        assert.deepEqual(h.varbits.at(-1), [1, 12393, 0]); noReward(h);
    }
});

test("two players can pickpocket the same NPC concurrently and each receives their own result", () => {
    const h = harness(); const second = h.addPlayer(2);
    h.start(); h.start(second.player);
    assert.equal(h.queue.length, 2);
    assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    assert.equal(second.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    h.next(); released(h);
    assert.equal(second.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    h.next(); released(h, second.player);
    assert.deepEqual(h.xp, [[1, 17, 84.3], [2, 17, 84.3]]);
    assert.equal(h.inventory.count(22529), 1);
    assert.equal(second.inventory.count(22529), 1);
});

test("cleanup preserves facing belonging to another player or active NPC combat", () => {
    for (const combat of [false, true]) {
        const h = harness({}, [0.999999]); h.start(); h.next();
        h.npc.facing = { type: "player", id: combat ? 1 : 2 };
        if (combat) h.npc.combatTarget = 1;
        const facing = { ...h.npc.facing };
        h.eventBus.emit("player:logout", { playerId: 1, username: "one" });
        assert.deepEqual(h.npc.facing, facing); released(h);
    }
});

test("verified Menaphite curve rounds interpolation and truncates glove endpoints first", () => {
    const policy = { lowChance: 50, highChance: 160 };
    assert.equal(getThievingSuccessChance(65, 65, policy), 123 / 256);
    assert.equal(getThievingSuccessChance(99, 65, policy), 161 / 256);
    assert.equal(getThievingSuccessChance(65, 65, policy, 1.05), 129 / 256);
    assert.equal(getThievingSuccessChance(99, 65, policy, 1.05), 169 / 256);
    assert.equal(getThievingSuccessChance(1, 1, policy, 1.05), 53 / 256,
        "50 * 1.05 is truncated to 52 before adding the successful roll");
    assert.equal(getThievingSuccessChance(50, 1, { lowChance: 0, highChance: 1 }), 2 / 256,
        "a half roll rounds up, rather than flooring the interpolation");
});

test("gloves need base Hunter 54 and the success roll uses strict less-than", () => {
    for (const [gloves, hunter, hunterBoost, roll, success] of [
        [false, 54, 0, 125 / 256, false],
        [true, 54, 0, 125 / 256, true],
        [true, 53, 1, 125 / 256, false],
        [true, 54, 0, 129 / 256, false],
        [false, 54, 0, 123 / 256, false],
        [false, 54, 0, 122.5 / 256, true],
    ] as const) {
        const h = harness({ reqLevel: 65, lowChance: 50, highChance: 160 }, [roll]);
        h.state.base = 65; h.state.hunter = hunter; h.state.hunterBoost = hunterBoost;
        if (gloves) h.equipment[9] = 10075;
        h.start(); h.next();
        assert.equal(h.xp.length, success ? 1 : 0,
            `gloves=${gloves}, base Hunter=${hunter}, boost=${hunterBoost}, roll=${roll}`);
    }
});

test("successful heat damage requires committed loot and is prevented by each configured item", () => {
    for (const equippedId of [-1, 100, 101]) {
        const h = harness({ coinPouchId: undefined, lootTable: [loot(6529, 5)],
            successDamage: { amount: 4, preventedByEquippedItemIds: [100, 101] } });
        h.equipment[9] = equippedId;
        h.start(); const result = h.next();
        assert.equal(h.inventory.count(6529), 5);
        assert.deepEqual(h.xp, [[1, 17, 84.3]]);
        assert.deepEqual(h.damage, equippedId === -1 ? [[1, 16, 4, 21]] : []);
        assert.equal(result.effects?.some((e) => e.type === "hitsplat" && e.damage === 4), equippedId === -1);
        assert.deepEqual(h.stuns, []); released(h);
    }
    const h = harness({ guaranteedLoot: [loot(562, 2)], lootTable: [loot(1601, 2)],
        successDamage: { amount: 4, preventedByEquippedItemIds: [] } });
    h.inventory.fill(27); h.start();
    const before = h.inventory.snapshot(); h.next();
    assert.deepEqual(h.inventory.snapshot(), before);
    assert.deepEqual(h.damage, []);
    assert.deepEqual(h.xp, []);
    assert.equal(h.state.hp, 30); released(h);
});

test("custom failure chat and animation override/suppression are honored", () => {
    for (const npcFailureAnimationId of [123, -1]) {
        const h = harness({ failureChat: "Hands off!", npcFailureAnimationId }, [0.999999]);
        h.start(); h.next(); h.next();
        assert.deepEqual(h.chats, ["Hands off!"]);
        assert.deepEqual(h.npcSequences, npcFailureAnimationId === -1 ? [] : [123]);
        assert.deepEqual(h.animations, [[1, 881], [1, 424]], "NPC animation suppression does not suppress player reaction");
    }
});

const repeatedDetection: NonNullable<Definition["failure"]> = {
    kind: "relocate", chance: 1, threshold: 3, counterKey: "ham",
    destinations: [{ x: 3200, y: 3200, level: 0 }], message: "Thrown out.",
    resetArea: { minX: 3200, maxX: 3205, minY: 3200, maxY: 3205, level: 0 },
};
function failAttempt(h: Harness, tick: number) {
    h.state.stunned = false; h.state.hp = 30;
    h.start(h.player, tick); h.next(); h.next(); h.next();
    released(h);
}

test("third detection relocates across NPC variants and then resets the shared counter", () => {
    const h = harness({ npcIds: [3297, 3298], failure: repeatedDetection }, Array(40).fill(0.999999));
    failAttempt(h, 20); assert.equal(h.teleports.length, 0);
    h.npc.typeId = 3298;
    failAttempt(h, 30); assert.equal(h.teleports.length, 0);
    h.npc.typeId = 3297;
    failAttempt(h, 40); assert.equal(h.teleports.length, 1);
    failAttempt(h, 50); failAttempt(h, 60); assert.equal(h.teleports.length, 1);
    failAttempt(h, 70); assert.equal(h.teleports.length, 2);
});

test("leaving HAM area on tick or logging out resets accumulated detections", () => {
    for (const reset of ["west", "east", "south", "north", "plane", "logout", "unload"] as const) {
        const h = harness({ failure: repeatedDetection }, Array(40).fill(0.999999));
        failAttempt(h, 20); failAttempt(h, 30);
        assert.equal(h.teleports.length, 0);
        if (reset === "logout") h.eventBus.emit("player:logout", { playerId: 1, username: "one" });
        else if (reset === "unload") h.unload();
        else {
            if (reset === "west") h.player.x = 3199;
            if (reset === "east") h.player.x = 3206;
            if (reset === "south") h.player.y = 3199;
            if (reset === "north") h.player.y = 3206;
            if (reset === "plane") h.player.level = 1;
            h.tick(34);
            Object.assign(h.player, { x: 3200, y: 3200, level: 0 });
        }
        failAttempt(h, 40); failAttempt(h, 50);
        assert.equal(h.teleports.length, 0, `${reset} must clear the previous two detections`);
        failAttempt(h, 60); assert.equal(h.teleports.length, 1);
    }
});

test("successful avoidance does not count toward HAM's three-detection threshold", () => {
    const rolls = [0.999999, 0, 0]; // Fail theft, minimum damage, then successful avoidance.
    rolls.push(...Array(30).fill(0.999999));
    const h = harness({ failure: { ...repeatedDetection, avoidance: { skillId: 17, lowChance: 50, highChance: 160 } } }, rolls);
    failAttempt(h, 20); failAttempt(h, 30); failAttempt(h, 40);
    assert.equal(h.teleports.length, 0);
    failAttempt(h, 50); assert.equal(h.teleports.length, 1);
});

// Only the cache fields read by currentDefinition are supplied. The loader fails
// on unexpected IDs and bounds reads so a cycle regression fails instead of hanging.
type MorphType = {
    actions: Array<string | null>; transforms: number[]; transformVarbit: number; transformVarp: number;
};
const morphType = (overrides: Partial<MorphType> = {}): MorphType => ({
    actions: [], transforms: [], transformVarbit: -1, transformVarp: -1, ...overrides,
});
function installNpcCache(h: Harness, entries: Array<[number, MorphType]>) {
    const types = new Map(entries);
    const loads: number[] = [];
    Object.assign(h.services, { data: { getNpcTypeLoader: () => ({ load: (typeId: number) => {
        loads.push(typeId);
        assert.ok(loads.length <= 100, "morph traversal must terminate, including cycles");
        const type = types.get(typeId);
        assert.ok(type, `unexpected NPC cache lookup ${typeId}`);
        return type;
    } }) } });
    return { types, loads };
}

test("generic Pickpocket resolves a parent recursively through player varbit and varp to the child definition", () => {
    const h = harness();
    h.npc.typeId = 9000;
    const cache = installNpcCache(h, [
        [9000, morphType({ transforms: [9001, -1], transformVarbit: 11, transformVarp: 99 })],
        [9001, morphType({ transforms: [3297, -1], transformVarp: 12 })],
        [3297, morphType({ actions: ["Talk-to", null, "PiCkPoCkEt"] })],
    ]);
    assert.equal(h.interactions.has(9000), false, "parent has no direct definition/interaction");
    assert.equal(h.npcActions.has("pickpocket"), true);
    h.varpValues.set(99, 1); // Varbit takes precedence over this invisible varp branch.
    h.start();
    assert.equal(h.queue.length, 1);
    assert.deepEqual(h.requests[0].request.data, { npcId: 10, npcTypeId: 9000, phase: 0 });
    assert.equal(h.queue[0].request.data.npcTypeId, 9000, "continuation retains the actual root NPC identity");
    h.next();
    assert.deepEqual(cache.loads, [9000, 9001, 3297, 9000, 9001, 3297]);
    assert.deepEqual(h.variableReads, [["varbit", 11], ["varp", 12], ["varbit", 11], ["varp", 12]]);
    assert.deepEqual(h.xp, [[1, 17, 84.3]]);
    assert.equal(h.inventory.count(22529), 1);
    released(h);
});

test("morph to a child without Pickpocket cancels every pending phase before rewards or damage", () => {
    for (const phase of [1, 2, 3]) {
        // Both children deliberately share a definition: the option check must
        // independently reject the second child even though its ID is registered.
        const h = harness({ npcIds: [3297, 3298] }, phase === 1 ? [] : [0.999999]);
        h.npc.typeId = 9000;
        installNpcCache(h, [
            [9000, morphType({ transforms: [3297, 3298, -1], transformVarbit: 11 })],
            [3297, morphType({ actions: ["Pickpocket"] })],
            [3298, morphType({ actions: ["Talk-to", "Attack"] })],
        ]);
        h.start();
        for (let current = 1; current < phase; current++) h.next();
        const before = h.inventory.snapshot();
        const randomCalls = h.control.randomCalls;
        h.varbitValues.set(11, 1);
        assert.equal(h.next().reason, "pickpocket_interrupted");
        assert.equal(h.control.randomCalls, randomCalls, "changed morph must be rejected before another roll");
        assert.deepEqual(h.inventory.snapshot(), before);
        assert.deepEqual(h.damage, []); assert.deepEqual(h.stuns, []);
        assert.equal(h.npc.facing, undefined);
        noReward(h); released(h);
        h.varbitValues.set(11, 0);
        h.start(h.player, 30); h.next();
        assert.equal(h.xp.length, 1, "morph interruption must release the old attempt");
    }
});

test("cyclic and invisible parents reject at start and interrupt a previously valid child", () => {
    for (const invalid of ["self-cycle", "nested-cycle", "invisible"] as const) {
        const h = harness(); h.npc.typeId = 9000;
        const cache = installNpcCache(h, [
            [9000, morphType({ transforms: [3297, 9001, -1], transformVarbit: 11 })],
            [9001, morphType({ transforms: [9000], transformVarp: 12 })],
            [3297, morphType({ actions: ["Pickpocket"] })],
        ]);
        h.start();
        const queued = h.queue[0].request.data;
        if (invalid === "self-cycle") cache.types.get(9000)!.transforms[1] = 9000;
        h.varbitValues.set(11, invalid === "invisible" ? 99 : 1);
        const reads = cache.loads.length;
        assert.equal(h.next().reason, "pickpocket_interrupted");
        assert.deepEqual(cache.loads.slice(reads), invalid === "nested-cycle" ? [9000, 9001] : [9000]);
        released(h); noReward(h);
        assert.equal(h.execute(queued, 22).reason, "pickpocket_stale_attempt");
        assert.equal(h.start(h.player, 23).reason, "pickpocket_target_gone");
        assert.equal(h.queue.length, 0);
        assert.equal(h.control.randomCalls, 0);
        assert.deepEqual(h.damage, []);
    }
});

test("out-of-range and missing selectors use the final morph fallback", () => {
    for (const selector of [-1, 1, 99]) {
        const h = harness(); h.npc.typeId = 9000;
        installNpcCache(h, [
            [9000, morphType({ transforms: [-1, 3297], transformVarp: 12 })],
            [3297, morphType({ actions: ["Pickpocket"] })],
        ]);
        h.varpValues.set(12, selector);
        h.start(); h.next();
        assert.equal(h.inventory.count(22529), 1);
        released(h);
    }
    const h = harness(); h.npc.typeId = 9000;
    installNpcCache(h, [
        [9000, morphType({ transforms: [-1, 3297] })],
        [3297, morphType({ actions: ["Pickpocket"] })],
    ]);
    h.start(); h.next();
    assert.deepEqual(h.variableReads, [], "a parent with neither selector uses its fallback directly");
    assert.equal(h.inventory.count(22529), 1);
});

test("a child needs both a Pickpocket option and an authored definition; parent definition cannot substitute", () => {
    for (const child of [
        [3297, morphType({ actions: ["Talk-to"] })],
        [9999, morphType({ actions: ["Pickpocket"] })],
    ] satisfies Array<[number, MorphType]>) {
        const h = harness({ npcIds: [9000, 3297] });
        installNpcCache(h, [[9000, morphType({ transforms: [child[0]], actions: ["Pickpocket"] })], child]);
        assert.equal(h.start().reason, "pickpocket_target_gone");
        assert.equal(h.queue.length, 0);
        assert.equal(h.player.lock, LockState.NONE);
        noReward(h);
    }
});

test("two players resolve the same parent using their own morph selectors", () => {
    const h = harness(); const second = h.addPlayer(2);
    h.npc.typeId = 9000;
    installNpcCache(h, [
        [9000, morphType({ transforms: [3297, -1], transformVarbit: 11 })],
        [3297, morphType({ actions: ["Pickpocket"] })],
    ]);
    second.varbitValues.set(11, 1);
    h.start();
    assert.equal(h.start(second.player).reason, "pickpocket_target_gone");
    assert.equal(second.player.lock, LockState.NONE);
    assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    h.next();
    assert.deepEqual(h.xp, [[1, 17, 84.3]]);
    assert.equal(h.inventory.count(22529), 1);
    assert.equal(second.inventory.count(22529), 0);
    released(h);
});

function registerFremennikTrialsFixture() {
    // Use the genuine progress contract without importing the quest content/index.
    registerQuestDefinition({
        key: "fremennik_trials", name: "The Fremennik Trials", varpId: 347,
        startedValue: 1, completionValue: 10, rewards: { questPoints: 3 },
        buildJournal: () => [], register: () => undefined,
    } satisfies QuestDefinition);
}

test("unknown required quest fails closed before scheduling or granting rewards", () => {
    const requiredQuest = "pickpocket_test_unregistered_quest";
    assert.equal(getQuestDefinitionByKey(requiredQuest), undefined);
    const h = harness({ requiredQuest });
    h.varpValues.set(347, 10); // Completing a different quest cannot satisfy an unknown key.
    const before = h.inventory.snapshot();
    const result = h.start();
    assert.equal(result.ok, true);
    assert.ok(result.effects?.some((e) => e.type === "message" && /complete the required quest/.test(e.message)));
    assert.equal(h.queue.length, 0);
    assert.equal(h.control.randomCalls, 0);
    assert.equal(h.player.lock, LockState.NONE);
    assert.deepEqual(h.animations, []);
    assert.deepEqual(h.inventory.snapshot(), before);
    noReward(h);
});

test("Fremennik Trials must be completed, not merely started, to begin pickpocketing", () => {
    registerFremennikTrialsFixture();
    for (const stage of [0, 1, 9]) {
        const h = harness({ requiredQuest: "fremennik_trials" });
        h.varpValues.set(347, stage);
        const before = h.inventory.snapshot();
        const result = h.start();
        assert.ok(result.effects?.some((e) => e.type === "message" && /complete the required quest/.test(e.message)), `stage ${stage}`);
        assert.deepEqual(h.variableReads, [["varp", 347]]);
        assert.equal(h.queue.length, 0);
        assert.equal(h.control.randomCalls, 0);
        assert.equal(h.player.lock, LockState.NONE);
        assert.deepEqual(h.inventory.snapshot(), before);
        noReward(h);
    }
});

test("Fremennik Trials completion at varp 347 stage 10 permits normal loot and XP", () => {
    registerFremennikTrialsFixture();
    const h = harness({ requiredQuest: "fremennik_trials" });
    h.varpValues.set(347, 10);
    h.start();
    assert.equal(h.queue.length, 1);
    assert.equal(h.player.lock, LockState.FULL_WITH_ITEM_INTERACTION);
    const result = h.next();
    assert.equal(result.ok, true);
    assert.equal(result.cooldownTicks, 1);
    assert.deepEqual(h.variableReads, [["varp", 347], ["varp", 347]]);
    assert.deepEqual(h.xp, [[1, 17, 84.3]]);
    assert.equal(h.inventory.count(22529), 1);
    released(h);
});

test("quest stage reset between start and resolution cancels without loot, XP or a random roll", () => {
    registerFremennikTrialsFixture();
    for (const resetStage of [0, 9]) {
        const h = harness({ requiredQuest: "fremennik_trials" });
        h.varpValues.set(347, 10);
        h.start();
        const continuation = h.queue[0].request.data;
        const before = h.inventory.snapshot();
        h.varpValues.set(347, resetStage);
        const result = h.next();
        assert.equal(result.ok, true);
        assert.ok(result.effects?.some((e) => e.type === "message" && /no longer meet the requirements/.test(e.message)));
        assert.equal(h.control.randomCalls, 0);
        assert.equal(h.queue.length, 0);
        assert.deepEqual(h.inventory.snapshot(), before);
        assert.deepEqual(h.damage, []);
        assert.deepEqual(h.stuns, []);
        noReward(h); released(h);
        assert.equal(h.execute(continuation, 22).reason, "pickpocket_stale_attempt");
        h.varpValues.set(347, 10);
        h.start(h.player, 23); h.next();
        assert.equal(h.xp.length, 1, "restoring quest completion permits a fresh attempt");
    }
});
