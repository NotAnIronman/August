import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import { LockState } from "@server/game/model/LockState";
import { isNpcVisibleToPlayer, type NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { getQuestDefinitionByKey } from "@server/content/gamemodes/vanilla/quests/QuestRegistry";
import { isQuestComplete } from "@server/content/gamemodes/vanilla/quests/QuestService";
import { registerPlayerLifecycleCleanup } from "@server/game/scripts/ScriptLifecycle";
import type {
    IScriptRegistry, ItemOnItemEvent, NpcInteractionEvent,
    ScriptActionHandlerContext, ScriptServices,
} from "@server/game/scripts/types";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import { getSkillLevel } from "@server/game/skilling/Requirements";
import { defineSkillAction, repeatSkillAction } from "@server/game/skilling/SkillAction";
import {
    getThievingSuccessChance, rollThievingLoot,
    type ThievingFailurePolicy, type ThievingLootEntry,
} from "@server/game/skilling/ThievingPolicy";
import {
    Items, PICKPOCKET_NPCS, COIN_POUCH_VALUES, COIN_POUCH_IDS,
    MAX_COIN_POUCHES,
    type PickpocketNpcDef,
} from "./pickpocketDefinitions";

export { npcIdToPickpocketDef, PICKPOCKET_NPCS } from "./pickpocketDefinitions";
export type { PickpocketNpcDef } from "./pickpocketDefinitions";

type Definition = PickpocketNpcDef & {
    guaranteedLoot?: ThievingLootEntry[];
    failure?: ThievingFailurePolicy;
    disabledReason?: string;
    failureChat?: string;
    npcFailureAnimationId?: number;
    successDamage?: { amount: number; preventedByEquippedItemIds: readonly number[] };
};
interface PickpocketActionData {
    npcId: number;
    npcTypeId: number;
    phase: 0 | 1 | 2 | 3;
    attemptId?: number;
    providerToken?: object;
}
interface Attempt {
    id: number;
    player: PlayerState;
    npc: NpcState;
    definition: Definition;
    phase: number;
    dueTick: number;
    services: ScriptServices;
}

const THIEVING_SKILL_ID = 17;
const PICKPOCKET_BUSY_VARBIT = 12393;
const COIN_POUCH_OPEN_SOUND = 2115;
const START_ACTION = defineSkillAction("pickpocket", { delayTicks: 0, cooldownTicks: 0 });
const PHASE_ACTION = defineSkillAction("pickpocket", { delayTicks: 1 });

function message(player: PlayerState, text: string): ActionEffect {
    return { type: "message", playerId: player.id, message: text };
}

function targetIsValid(player: PlayerState, npc: NpcState, services: ScriptServices, tick: number): boolean {
    return services.combat.getNpc(npc.id) === npc &&
        !npc.isDead(tick) && npc.getHitpoints() > 0 &&
        player.level === npc.level && isNpcVisibleToPlayer(npc, player) &&
        services.location.isAdjacentToNpc(player, npc) &&
        player.skillSystem.getHitpointsCurrent() > 0;
}

/** One provider owns all pending attempts and releases its own locks on interruption/unload. */
export function createPickpocketRuntime(
    definitions: readonly Definition[] = PICKPOCKET_NPCS,
    random: () => number = Math.random,
) {
    const byId = new Map<number, Definition>();
    for (const definition of definitions) {
        for (const id of definition.npcIds) {
            if (byId.has(id)) throw new Error(`Duplicate pickpocket NPC ${id}`);
            byId.set(id, definition);
        }
    }
    const attempts = new Map<number, Attempt>();
    // Scheduler payloads are in-memory. Identity prevents a queued old provider
    // continuation from matching a new provider's restarted numeric counter.
    const providerToken = {};
    const detections = new Map<PlayerState, Map<string, { count: number; policy: Extract<ThievingFailurePolicy, { kind: "relocate" }> }>>();
    let nextAttemptId = 0;

    function meetsQuestRequirement(player: PlayerState, def: Definition): boolean {
        if (!def.requiredQuest) return true;
        const quest = getQuestDefinitionByKey(def.requiredQuest);
        return !!quest && isQuestComplete(player, quest);
    }

    function currentDefinition(player: PlayerState, npc: NpcState, services: ScriptServices): Definition | undefined {
        const loader = services.data?.getNpcTypeLoader?.();
        // Lightweight test facades omit the cache; a live facade supplies it.
        if (!loader) return byId.get(npc.typeId);
        const visited = new Set<number>();
        let typeId = npc.typeId;
        while (typeId >= 0 && !visited.has(typeId)) {
            visited.add(typeId);
            const type = loader.load(typeId);
            if (!type.transforms?.length) {
                return type.actions.some((action) => action?.toLowerCase() === "pickpocket") ? byId.get(typeId) : undefined;
            }
            const value = type.transformVarbit >= 0 ? player.varps.getVarbitValue(type.transformVarbit)
                : type.transformVarp >= 0 ? player.varps.getVarpValue(type.transformVarp) : -1;
            typeId = value >= 0 && value < type.transforms.length - 1
                ? type.transforms[value] : type.transforms[type.transforms.length - 1];
        }
        return undefined;
    }

    function release(attempt: Attempt): void {
        if (attempts.get(attempt.player.id) !== attempt) return;
        attempts.delete(attempt.player.id);
        if (attempt.player.lock === LockState.FULL_WITH_ITEM_INTERACTION) {
            attempt.player.lock = LockState.NONE;
        }
        const facing = attempt.npc.getInteractionTarget();
        if (facing?.type === "player" && facing.id === attempt.player.id &&
            attempt.npc.getCombatTargetPlayerId() === undefined) {
            attempt.npc.clearInteractionTarget();
        }
        attempt.services.combat.clearPlayerFaceTarget(attempt.player);
        attempt.services.variables.sendVarbit?.(attempt.player, PICKPOCKET_BUSY_VARBIT, 0);
    }

    function schedule(attempt: Attempt, phase: 1 | 2 | 3, tick: number): boolean {
        attempt.phase = phase;
        attempt.dueTick = tick + PHASE_ACTION.delayTicks;
        const ok = repeatSkillAction(attempt.services, attempt.player, PHASE_ACTION, {
            npcId: attempt.npc.id, npcTypeId: attempt.npc.typeId,
            attemptId: attempt.id, providerToken, phase,
        } satisfies PickpocketActionData, tick);
        if (!ok) release(attempt);
        return ok;
    }

    function pouchLimitReached(player: PlayerState, def: Definition, services: ScriptServices): boolean {
        if (!def.coinPouchId) return false;
        const count = services.inventory.getInventoryItems(player)
            .filter((entry) => entry.itemId === def.coinPouchId)
            .reduce((sum, entry) => sum + entry.quantity, 0);
        return count >= MAX_COIN_POUCHES;
    }

    function resetOutsideArea(player: PlayerState): void {
        const counters = detections.get(player);
        if (!counters) return;
        for (const [key, { policy }] of counters) {
            const area = policy.resetArea;
            if (area && (player.level !== area.level || player.tileX < area.minX ||
                player.tileX > area.maxX || player.tileY < area.minY || player.tileY > area.maxY)) {
                counters.delete(key);
            }
        }
        if (counters.size === 0) detections.delete(player);
    }

    function shouldRelocate(player: PlayerState, policy: Extract<ThievingFailurePolicy, { kind: "relocate" }>, services: ScriptServices): boolean {
        resetOutsideArea(player);
        if (policy.avoidance && random() < getThievingSuccessChance(
            getSkillLevel(services, player, policy.avoidance.skillId), 1, policy.avoidance,
        )) return false;
        const key = policy.counterKey ?? "relocation";
        const counters = detections.get(player) ?? new Map();
        const count = (counters.get(key)?.count ?? 0) + 1;
        counters.set(key, { count, policy });
        detections.set(player, counters);
        if (count < (policy.threshold ?? 1) || random() >= policy.chance) return false;
        counters.delete(key);
        if (counters.size === 0) detections.delete(player);
        return true;
    }

    function execute(ctx: ScriptActionHandlerContext): ActionExecutionResult {
        const { player, services, tick } = ctx;
        const data = ctx.data as PickpocketActionData;
        const effects: ActionEffect[] = [];
        let attempt = attempts.get(player.id);
        try {
            if (data.phase === 0) {
                if (attempt || player.lock !== LockState.NONE) return { ok: false, reason: "pickpocket_busy" };
                const npc = services.combat.getNpc(data.npcId);
                const def = npc && currentDefinition(player, npc, services);
                if (!npc || npc.typeId !== data.npcTypeId || !def ||
                    !targetIsValid(player, npc, services, tick)) return { ok: false, reason: "pickpocket_target_gone" };
                const reject = (text: string): ActionExecutionResult => ({ ok: true, effects: [message(player, text)] });
                if (def.disabledReason) return reject("You can't pickpocket this NPC yet.");
                if (!meetsQuestRequirement(player, def)) {
                    return reject("You must complete the required quest before pickpocketing this NPC.");
                }
                if (getSkillLevel(services, player, THIEVING_SKILL_ID) < def.reqLevel) {
                    return reject(`You need a Thieving level of ${def.reqLevel} to pickpocket this NPC.`);
                }
                if (services.combat.isPlayerStunned(player)) return reject("You're stunned!");
                if (services.combat.isPlayerInCombat(player)) return reject("You can't do that during combat.");
                if (npc.getCombatTargetPlayerId() !== undefined) {
                    return reject("They're busy at the moment.");
                }
                if (pouchLimitReached(player, def, services)) {
                    return reject("You should open the coin pouches that you've already stolen first.");
                }
                // OSRS requires a free slot to start, even for an existing pouch stack.
                if (!services.inventory.hasInventorySlot(player)) {
                    return reject("You don't have enough inventory space to do that.");
                }
                attempt = { id: ++nextAttemptId, player, npc, definition: def, phase: 0, dueTick: tick, services };
                attempts.set(player.id, attempt);
                services.npc.stopNpcMovement(npc, 2);
                services.animation.playPlayerSeq(player, 881);
                player.lock = LockState.FULL_WITH_ITEM_INTERACTION;
                schedule(attempt, 1, tick);
                return { ok: true, cooldownTicks: 1 };
            }

            // No copied loot/level fields are trusted; continuations refer to a live owned attempt.
            if (data.providerToken !== providerToken || !attempt || attempt.id !== data.attemptId || attempt.phase !== data.phase ||
                attempt.npc.id !== data.npcId || attempt.npc.typeId !== data.npcTypeId) {
                return { ok: false, reason: "pickpocket_stale_attempt" };
            }
            if (!targetIsValid(player, attempt.npc, services, tick) ||
                currentDefinition(player, attempt.npc, services) !== attempt.definition ||
                player.lock !== LockState.FULL_WITH_ITEM_INTERACTION ||
                services.combat.isPlayerInCombat(player) || services.combat.isPlayerStunned(player)) {
                release(attempt);
                return { ok: false, reason: "pickpocket_interrupted" };
            }
            const { npc, definition: def } = attempt;
            const name = (def.displayName ?? npc.name ?? "NPC").toLowerCase();
            if (data.phase === 1) {
                const level = getSkillLevel(services, player, THIEVING_SKILL_ID);
                if (level < def.reqLevel || !meetsQuestRequirement(player, def) || pouchLimitReached(player, def, services)) {
                    release(attempt);
                    return { ok: true, effects: [message(player, "You no longer meet the requirements to pickpocket this NPC.")] };
                }
                const equipped = services.equipment.getEquipArray(player);
                const silence = equipped[9] === 10075 && getSkillLevel(services, player, 21, "base") >= 54;
                const chance = getThievingSuccessChance(level, def.reqLevel, def, silence ? 1.05 : 1);
                if (random() < chance) {
                    const rewards = rollThievingLoot(def.lootTable, def.guaranteedLoot, random).map((reward) =>
                        reward.itemId === Items.COINS_995 && def.coinPouchId
                            ? { itemId: def.coinPouchId, quantity: 1 } : reward);
                    const result = applyInventoryTransform(services.inventory, player, { inputs: [], outputs: rewards });
                    release(attempt);
                    if (!result.ok) {
                        return { ok: true, effects: [message(player, "You don't have enough inventory space to take the loot.")] };
                    }
                    services.skills.addSkillXp(player, THIEVING_SKILL_ID, def.xp);
                    services.sound.sendSound(player, 2581);
                    effects.push(
                        { type: "inventorySnapshot", playerId: player.id },
                        message(player, `You pick the ${name}'s pocket.`),
                    );
                    if (def.successDamage && !def.successDamage.preventedByEquippedItemIds.some((id) => equipped.includes(id))) {
                        const burn = services.combat.applyPlayerHitsplat(player, 16, def.successDamage.amount, tick);
                        effects.push({ type: "hitsplat", playerId: player.id, targetType: "player", targetId: player.id,
                            damage: burn.amount, style: burn.style, hpCurrent: burn.hpCurrent, hpMax: burn.hpMax, tick });
                    }
                    return { ok: true, cooldownTicks: 1, effects };
                }
                effects.push(message(player, `You fail to pick the ${name}'s pocket.`));
                services.variables.sendVarbit?.(player, PICKPOCKET_BUSY_VARBIT, 1);
                services.npc.stopNpcMovement(npc, 2);
                services.npc.queueNpcForcedChat(npc, def.failureChat ?? (def.failure?.kind === "combat" ? "Guards! Help!" : "What do you think you're doing?"));
                services.npc.faceNpcToPlayer(npc, player);
                schedule(attempt, 2, tick);
                return { ok: true, cooldownTicks: 1, effects };
            }
            if (data.phase === 2) {
                services.animation.playPlayerSeq(player, 424);
                services.animation.broadcastPlayerSpot(player, 245, 124);
                services.sound.sendSound(player, 2727);
                services.npc.stopNpcMovement(npc, 2);
                if (def.npcFailureAnimationId !== -1) services.npc.queueNpcSeq(npc, def.npcFailureAnimationId ?? 390);
                services.npc.faceNpcToPlayer(npc, player);
                schedule(attempt, 3, tick);
                return { ok: true, cooldownTicks: 1 };
            }
            const damage = def.minDamage + Math.floor(random() * (def.maxDamage - def.minDamage + 1));
            const hit = services.combat.applyPlayerHitsplat(player, 16, damage, tick);
            if (hit) effects.push({
                type: "hitsplat", playerId: player.id, targetType: "player", targetId: player.id,
                damage: hit.amount, style: hit.style, hpCurrent: hit.hpCurrent, hpMax: hit.hpMax,
                tick, skipAutoSound: true,
            });
            services.sound.sendSound(player, 519, { delayMs: 20 });
            release(attempt);
            if (player.skillSystem.getHitpointsCurrent() > 0) {
                services.combat.stunPlayer(player, def.stunTicks);
                effects.push(message(player, "You've been stunned!"));
                const failure = def.failure;
                if (failure?.kind === "combat") {
                    services.npc.engageCombat(npc, player);
                    for (const typeId of failure.guardTypeIds ?? []) {
                        const guard = services.npc.findNearbyNpc(player, typeId, failure.guardRadius ?? 8);
                        if (guard && !guard.isDead(tick) && guard.getHitpoints() > 0 &&
                            isNpcVisibleToPlayer(guard, player) && services.npc.hasLineOfSightToPlayer(guard, player)) {
                            services.npc.engageCombat(guard, player);
                        }
                    }
                } else if (failure?.kind === "relocate" && failure.destinations.length > 0 &&
                    shouldRelocate(player, failure, services)) {
                    const destination = failure.destinations[Math.floor(random() * failure.destinations.length)];
                    services.movement.teleportPlayer(player, destination.x, destination.y, destination.level);
                    effects.push(message(player, failure.message));
                }
            }
            return { ok: true, effects };
        } catch (error) {
            if (attempt) release(attempt);
            throw error;
        }
    }

    function registerHandlers(registry: IScriptRegistry, services: ScriptServices): void {
        registry.registerActionHandler(START_ACTION.kind, execute);
        const start = (event: NpcInteractionEvent) => {
                event.services.combat.requestAction(event.player, {
                    kind: START_ACTION.kind,
                    data: { npcId: event.npc.id, npcTypeId: event.npc.typeId, phase: 0 } satisfies PickpocketActionData,
                    delayTicks: START_ACTION.delayTicks, cooldownTicks: START_ACTION.cooldownTicks,
                    groups: [...START_ACTION.groups], rejectIfGroupPending: true,
                }, event.tick);
        };
        for (const id of byId.keys()) {
            registry.registerNpcInteraction(id, start, "pickpocket");
        }
        // Morph parents have no useful name/options of their own. Resolve the
        // player's active child at execution instead of assigning a parent loot table.
        registry.registerNpcAction?.("pickpocket", start);
        // A cancelled/deferred action must not leave an attempt lock behind.
        registry.registerTickHandler?.(({ tick }) => {
            for (const player of detections.keys()) resetOutsideArea(player);
            for (const attempt of attempts.values()) {
                if (tick > attempt.dueTick || !targetIsValid(attempt.player, attempt.npc, attempt.services, tick)) {
                    release(attempt);
                }
            }
        });
        registerPlayerLifecycleCleanup(registry, services, {
            player: (id) => {
                const attempt = attempts.get(id);
                if (attempt) release(attempt);
                for (const player of detections.keys()) if (player.id === id) detections.delete(player);
            },
            reset: () => {
                for (const attempt of attempts.values()) release(attempt);
                detections.clear();
            },
        });
    }
    return { execute, register: registerHandlers };
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    createPickpocketRuntime().register(registry, services);
    // Coin pouch: "Open" and "Open-all" item actions
    for (const pouchId of COIN_POUCH_IDS) {
        const openHandler = (
            event: ItemOnItemEvent,
            openAll: boolean,
        ) => {
            const { player, source, services } = event;
            const slot = source.slot;
            const inv = services.inventory.getInventoryItems(player);
            const entry = inv[slot];
            if (!entry || entry.itemId !== pouchId) return;

            const count = openAll ? entry.quantity : 1;
            const range = COIN_POUCH_VALUES[pouchId];
            if (!range) return;

            const currencyId = Items.COINS_995;

            let totalCurrency = 0;
            for (let i = 0; i < count; i++) {
                const [min, max] = range;
                totalCurrency +=
                    min === max ? min : min + Math.floor(Math.random() * (max - min + 1));
            }

            const exchange = applyInventoryTransform(services.inventory, player, {
                inputs: [{ itemId: pouchId, quantity: count }],
                outputs: [{ itemId: currencyId, quantity: totalCurrency }],
                outputPlacement: "first-consumed-slot",
            });
            if (!exchange.ok) {
                if (exchange.reason === "inventory-full") {
                    services.messaging.sendGameMessage(
                        player,
                        "You don't have enough inventory space to open that pouch.",
                    );
                }
                return;
            }
            services.inventory.snapshotInventory(player);
            services.sound.sendSound(player, COIN_POUCH_OPEN_SOUND);
            const pouchText = count === 1 ? "coin pouch" : "coin pouches";
            services.messaging.sendGameMessage(
                player,
                `You open ${count} ${pouchText} and receive ${totalCurrency} coins.`,
            );
        };

        registry.registerItemAction(pouchId, (event) => openHandler(event, true), "open-all");
        registry.registerItemAction(pouchId, (event) => openHandler(event, false), "open");
    }
}
