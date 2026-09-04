import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    ScriptActionHandlerContext,
    ScriptServices,
} from "@server/game/scripts/types";
import { ResourceNodeTracker, buildTileKey } from "@server/game/skilling/ResourceNodeTracker";
import {
    defineSkillAction,
    repeatSkillAction,
    requestSkillAction,
    type SkillActionPolicy,
} from "@server/game/skilling/SkillAction";
import {
    ASHES_ITEM_ID,
    FIREMAKING_LOG_IDS,
    FIRE_LIGHTING_ANIMATION,
    type FireNodeData,
    TINDERBOX_ITEM_IDS,
    computeFireLightingDelayTicks,
    getFiremakingLogDefinition,
} from "@server/content/gamemodes/vanilla/skills/firemaking/firemakingData";

const FIRE_LIT_SYNTH_SOUND = 2596;
const FORESTERS_CAMPFIRE_OBJECT_ID = 49927;
const CAMPFIRE_LOG_DELAY_TICKS = 3;
const CAMPFIRE_ADDED_BURN_TICKS = 10;
const CAMPFIRE_DIALOG_ID = "firemaking_foresters_campfire";
const FIREMAKING_ACTIONS = new Map<number, SkillActionPolicy>();
const CAMPFIRE_START_ACTION = defineSkillAction("campfire", {
    delayTicks: 0,
    cooldownTicks: 1,
});
const CAMPFIRE_CYCLE_ACTION = defineSkillAction("campfire", {
    delayTicks: CAMPFIRE_LOG_DELAY_TICKS,
});

function firemakingAction(delayTicks: number): SkillActionPolicy {
    const normalizedDelay = Math.max(0, Math.trunc(delayTicks));
    let policy = FIREMAKING_ACTIONS.get(normalizedDelay);
    if (!policy) {
        policy = defineSkillAction("firemaking", { delayTicks: normalizedDelay });
        FIREMAKING_ACTIONS.set(normalizedDelay, policy);
    }
    return policy;
}

interface FiremakingActionData {
    logItemId: number;
    logLevel?: number;
    tile: { x: number; y: number };
    level: number;
    slot?: number;
    started: boolean;
    attempts: number;
    previousLocId: number;
}

interface CampfireActionData {
    logItemId: number;
    tile: { x: number; y: number };
    level: number;
    slot?: number;
}

function buildMessageEffect(player: PlayerState, message: string): ActionEffect {
    return { type: "message", playerId: player.id, message };
}

function describeItem(services: ScriptServices, itemId: number): string {
    return services.data.getObjType(itemId)?.name?.toLowerCase() ?? "item";
}

function failFiremakingPrecheck(
    player: PlayerState,
    services: ScriptServices,
    message: string,
): ActionExecutionResult {
    services.stopGatheringInteraction?.(player);
    const effects: ActionEffect[] = message ? [buildMessageEffect(player, message)] : [];
    return { ok: true, effects };
}

function rollFiremakingSuccess(level: number, logLevel: number): boolean {
    // At 43 Firemaking, every ordinary log ignition succeeds. Temporary
    // boosts count, exactly as they do for a boosted log requirement.
    if (level >= 43) return true;
    const effective = Math.max(1, level);
    const difficulty = Math.max(1, logLevel);
    const ratio = effective / difficulty;
    const chance = Math.min(0.95, Math.max(0.25, ratio * 0.5));
    return Math.random() < chance;
}

function executeFiremakingAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as FiremakingActionData;
    const logId = data.logItemId;
    const logDef = getFiremakingLogDefinition(logId);
    if (!logDef) {
        return failFiremakingPrecheck(player, services, "You can't light that.");
    }

    const tile = { x: data.tile.x, y: data.tile.y };
    const plane = data.level;
    const slotIndex = data.slot;
    const attempts = Math.max(0, data.attempts);
    const effects: ActionEffect[] = [];

    if (!data.started) {
        effects.push(buildMessageEffect(player, "You attempt to light the logs."));
    }

    if (player.level !== plane) {
        return failFiremakingPrecheck(player, services, "You stop lighting the logs.");
    }

    if (player.tileX !== tile.x || player.tileY !== tile.y) {
        return failFiremakingPrecheck(player, services, "You stop lighting the logs.");
    }

    if (!services.playerHasTinderbox?.(player)) {
        return failFiremakingPrecheck(
            player,
            services,
            "You need a tinderbox to light these logs.",
        );
    }

    const skill = services.skills.getSkill(player, SkillId.Firemaking);
    const effectiveLevel = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
    if (effectiveLevel < logDef.level) {
        return failFiremakingPrecheck(
            player,
            services,
            `You need Firemaking level ${logDef.level} to light these logs.`,
        );
    }

    if (services.gathering?.getTracker<FireNodeData>("firemaking")?.hasTile(tile, plane)) {
        return failFiremakingPrecheck(player, services, "There's already a fire here.");
    }

    if (services.isFiremakingTileBlocked?.(tile, plane)) {
        return failFiremakingPrecheck(player, services, "You can't light a fire here.");
    }

    services.location.faceTile(player, tile);

    if (data.started) {
        services.animation.playPlayerSeq(player, FIRE_LIGHTING_ANIMATION);
    }

    const success = logDef.alwaysIgnites || rollFiremakingSuccess(effectiveLevel, logDef.level);
    if (!success) {
        effects.push(buildMessageEffect(player, "You fail to light the logs."));
        const delay = computeFireLightingDelayTicks(effectiveLevel);
        const rescheduled = repeatSkillAction(
            services,
            player,
            firemakingAction(delay),
            {
                logItemId: logDef.logId,
                logLevel: logDef.level,
                tile: { ...tile },
                level: plane,
                slot: slotIndex,
                started: true,
                attempts: attempts + 1,
                previousLocId: data.previousLocId,
            },
            tick,
        );
        if (!rescheduled) {
            return failFiremakingPrecheck(player, services, "You stop lighting the logs.");
        }
        return { ok: true, effects };
    }

    const consumedSlot = services.consumeFiremakingLog?.(player, logId, slotIndex);
    if (consumedSlot === undefined) {
        return failFiremakingPrecheck(player, services, "You need logs to light a fire.");
    }

    effects.push({ type: "inventorySnapshot", playerId: player.id });
    const logName = describeItem(services, logId);
    effects.push(buildMessageEffect(player, `The fire catches and the ${logName} begin to burn.`));

    services.skills.addSkillXp(player, SkillId.Firemaking, logDef.xp);

    const fire = services.lightFire?.({
        tile,
        level: plane,
        logItemId: logId,
        currentTick: tick,
        burnTicks: logDef.burnTicks,
        fireObjectId: logDef.fireObjectId,
        previousLocId: data.previousLocId,
        ownerId: player.id,
    });

    if (fire) {
        services.location.emitLocChange(0, fire.fireObjectId, tile, plane);
    }

    services.animation.stopPlayerAnimation(player);
    services.walkPlayerAwayFromFire?.(player, tile);
    services.sound.sendSound(player, FIRE_LIT_SYNTH_SOUND);

    return { ok: true, effects };
}

function executeCampfireAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as CampfireActionData;
    const logDef = getFiremakingLogDefinition(data.logItemId);
    const tile = { ...data.tile };
    const level = data.level;
    if (!logDef || player.level !== level) {
        return failFiremakingPrecheck(player, services, "You stop tending to the campfire.");
    }

    const fire = services.gathering?.getTracker<FireNodeData>("firemaking")?.getByTile(tile, level);
    if (!fire?.data.isForestersCampfire) {
        return failFiremakingPrecheck(player, services, "The campfire has gone out.");
    }
    if (Math.max(Math.abs(player.tileX - tile.x), Math.abs(player.tileY - tile.y)) > 1) {
        return failFiremakingPrecheck(player, services, "You stop tending to the campfire.");
    }

    const skill = services.skills.getSkill(player, SkillId.Firemaking);
    const effectiveLevel = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
    if (effectiveLevel < logDef.level) {
        return failFiremakingPrecheck(
            player,
            services,
            `You need Firemaking level ${logDef.level} to add these logs.`,
        );
    }

    const consumedSlot = services.consumeFiremakingLog?.(player, logDef.logId, data.slot);
    if (consumedSlot === undefined) {
        return failFiremakingPrecheck(player, services, "You have run out of those logs.");
    }

    services.animation.playPlayerSeq(player, FIRE_LIGHTING_ANIMATION);
    services.skills.addSkillXp(player, SkillId.Firemaking, logDef.xp);
    fire.expiryTick = Math.max(fire.expiryTick, tick) + CAMPFIRE_ADDED_BURN_TICKS;
    fire.data.logItemId = logDef.logId;

    const effects: ActionEffect[] = [{ type: "inventorySnapshot", playerId: player.id }];
    const nextSlot = services.inventory.findInventorySlotWithItem(player, logDef.logId);
    if (nextSlot === undefined) {
        services.stopGatheringInteraction?.(player);
        return { ok: true, effects };
    }
    const rescheduled = repeatSkillAction(
        services,
        player,
        CAMPFIRE_CYCLE_ACTION,
        { logItemId: logDef.logId, tile, level, slot: nextSlot },
        tick,
    );
    if (!rescheduled) services.stopGatheringInteraction?.(player);
    return {
        ok: true,
        cooldownTicks: CAMPFIRE_LOG_DELAY_TICKS,
        groups: [...CAMPFIRE_CYCLE_ACTION.groups],
        effects,
    };
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler(firemakingAction(0).kind, executeFiremakingAction);
    registry.registerActionHandler(CAMPFIRE_START_ACTION.kind, executeCampfireAction);

    const fireTracker = new ResourceNodeTracker<FireNodeData>();
    const disposeTracker = services.gathering?.registerTracker(
        "firemaking",
        fireTracker,
        (node, gatheringServices) => {
            gatheringServices.emitLocChange(node.data.fireObjectId, 0, node.tile, node.level);
            gatheringServices.spawnGroundItem(
                ASHES_ITEM_ID,
                1,
                { x: node.tile.x, y: node.tile.y, level: node.level },
                node.expiryTick,
                { privateTicks: 0 },
            );
        },
        {
            // Reload/reset restores the world object but must not award ashes
            // before the fire's natural expiry.
            onDispose: (node, gatheringServices) => {
                gatheringServices.emitLocChange(
                    node.data.fireObjectId,
                    0,
                    node.tile,
                    node.level,
                );
            },
        },
    );
    if (disposeTracker) registry.registerCleanup(disposeTracker);

    const previousIsFiremakingTileBlocked = services.isFiremakingTileBlocked;
    const isFiremakingTileBlocked = (tile: { x: number; y: number }, level: number) => {
        const pathService = services.movement.getPathService();
        if (!pathService) return false;
        const flag = pathService.getCollisionFlagAt(tile.x, tile.y, level);
        if (flag === undefined || flag < 0) return false;
        return (flag & 0x100_0300) !== 0;
    };
    services.isFiremakingTileBlocked = isFiremakingTileBlocked;

    const previousLightFire = services.lightFire;
    const lightFire: NonNullable<ScriptServices["lightFire"]> = (params) => {
        const key = buildTileKey(params.tile, params.level);
        const burnTicks = params.burnTicks ?? { min: 75, max: 120 };
        const min = Math.max(1, Math.floor(burnTicks.min));
        const max = Math.max(min, Math.floor(burnTicks.max));
        const span = max - min + 1;
        const duration = min + (span > 0 ? Math.floor(Math.random() * span) : 0);
        fireTracker.add(key, params.tile, params.level, params.currentTick + duration, {
            fireObjectId: params.fireObjectId,
            previousLocId: params.previousLocId,
            logItemId: params.logItemId,
            ownerId: params.ownerId,
        });
        return { fireObjectId: params.fireObjectId };
    };
    services.lightFire = lightFire;

    const previousPlayerHasTinderbox = services.playerHasTinderbox;
    const playerHasTinderbox: NonNullable<ScriptServices["playerHasTinderbox"]> = (player) => {
        for (const id of TINDERBOX_ITEM_IDS) {
            if (services.inventory.playerHasItem(player, id)) return true;
        }
        return false;
    };
    services.playerHasTinderbox = playerHasTinderbox;

    const previousConsumeFiremakingLog = services.consumeFiremakingLog;
    const consumeFiremakingLog: NonNullable<ScriptServices["consumeFiremakingLog"]> = (player, logId, slotIndex) => {
        const inv = services.inventory.getInventoryItems(player);
        if (
            slotIndex !== undefined &&
            slotIndex >= 0 &&
            slotIndex < inv.length &&
            inv[slotIndex]?.itemId === logId &&
            inv[slotIndex]!.quantity > 0
        ) {
            if (services.inventory.consumeItem(player, slotIndex)) return slotIndex;
        }
        const fallback = services.inventory.findInventorySlotWithItem(player, logId);
        if (fallback !== undefined && services.inventory.consumeItem(player, fallback))
            return fallback;
        return undefined;
    };
    services.consumeFiremakingLog = consumeFiremakingLog;

    const previousWalkPlayerAwayFromFire = services.walkPlayerAwayFromFire;
    const walkPlayerAwayFromFire: NonNullable<ScriptServices["walkPlayerAwayFromFire"]> = (player, fireTile) => {
        const westTile = { x: fireTile.x - 1, y: fireTile.y };
        const pathService = services.movement.getPathService();
        const canStep =
            pathService?.canNpcStep?.(
                { x: player.tileX, y: player.tileY, plane: player.level },
                westTile,
            ) ?? true;
        if (canStep && (westTile.x !== player.tileX || westTile.y !== player.tileY)) {
            player.setPath([westTile], false);
        }
    };
    services.walkPlayerAwayFromFire = walkPlayerAwayFromFire;
    registry.registerCleanup(() => {
        if (services.isFiremakingTileBlocked === isFiremakingTileBlocked) {
            services.isFiremakingTileBlocked = previousIsFiremakingTileBlocked;
        }
        if (services.lightFire === lightFire) services.lightFire = previousLightFire;
        if (services.playerHasTinderbox === playerHasTinderbox) {
            services.playerHasTinderbox = previousPlayerHasTinderbox;
        }
        if (services.consumeFiremakingLog === consumeFiremakingLog) {
            services.consumeFiremakingLog = previousConsumeFiremakingLog;
        }
        if (services.walkPlayerAwayFromFire === walkPlayerAwayFromFire) {
            services.walkPlayerAwayFromFire = previousWalkPlayerAwayFromFire;
        }
    });

    const startCampfire = (
        player: PlayerState,
        logItemId: number,
        tile: { x: number; y: number },
        level: number,
        tick: number,
        slot?: number,
    ) => {
        const logDef = getFiremakingLogDefinition(logItemId);
        const fire = fireTracker.getByTile(tile, level);
        if (!logDef || !fire) return;
        const skill = services.skills.getSkill(player, SkillId.Firemaking);
        const effectiveLevel = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
        if (effectiveLevel < logDef.level) {
            services.messaging.sendGameMessage(player, `You need Firemaking level ${logDef.level} to add these logs.`);
            return;
        }

        if (!fire.data.isForestersCampfire) {
            services.location.emitLocChange(fire.data.fireObjectId, FORESTERS_CAMPFIRE_OBJECT_ID, tile, level);
            fire.data.fireObjectId = FORESTERS_CAMPFIRE_OBJECT_ID;
            fire.data.isForestersCampfire = true;
        }
        const accepted = requestSkillAction(
            services,
            player,
            CAMPFIRE_START_ACTION,
            { logItemId, tile: { ...tile }, level, slot },
            tick,
        );
        if (!accepted) services.messaging.sendGameMessage(player, "You're too busy to do that right now.");
    };

    const openCampfireLogSelection = (player: PlayerState, tile: { x: number; y: number }, level: number) => {
        const fire = fireTracker.getByTile(tile, level);
        if (!fire?.data.isForestersCampfire) return;
        const skill = services.skills.getSkill(player, SkillId.Firemaking);
        const effectiveLevel = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
        const choices = services.inventory.getInventoryItems(player)
            .filter((entry) => entry.quantity > 0 && getFiremakingLogDefinition(entry.itemId))
            .map((entry) => ({ entry, log: getFiremakingLogDefinition(entry.itemId)! }))
            .filter((choice, index, all) => all.findIndex((other) => other.log.logId === choice.log.logId) === index)
            .sort((a, b) => a.log.level - b.log.level)
            .slice(0, 5);
        if (choices.length === 0) {
            services.messaging.sendGameMessage(player, "You don't have any logs to add to the campfire.");
            return;
        }
        services.dialog.openDialogOptions(player, {
            id: CAMPFIRE_DIALOG_ID,
            title: "Choose logs to add to the campfire",
            modal: true,
            options: choices.map((choice) => `${choice.log.name} (${choice.entry.quantity})`),
            disabledOptions: choices.map((choice) => effectiveLevel < choice.log.level),
            onSelect: (index) => {
                const choice = choices[index];
                if (!choice) return;
                services.dialog.closeDialog(player, CAMPFIRE_DIALOG_ID);
                startCampfire(
                    player,
                    choice.log.logId,
                    tile,
                    level,
                    services.system.getCurrentTick(),
                    choice.entry.slot,
                );
            },
        });
    };

    for (const logId of FIREMAKING_LOG_IDS) {
        const logDef = getFiremakingLogDefinition(logId);
        if (!logDef) continue;
        for (const tinderboxId of TINDERBOX_ITEM_IDS) {
            registry.registerItemOnItem(
                tinderboxId,
                logDef.logId,
                ({ player, source, target, tick }) => {
                    const skill = services.skills.getSkill(player, SkillId.Firemaking);
                    const level = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
                    if (level < logDef.level) {
                        services.messaging.sendGameMessage(
                            player,
                            `You need Firemaking level ${logDef.level} to light these logs.`,
                        );
                        return;
                    }
                    const slot = source.itemId === logDef.logId ? source.slot : target.slot;
                    const delay = computeFireLightingDelayTicks(level);

                    services.animation.playPlayerSeq(player, FIRE_LIGHTING_ANIMATION);

                    const accepted = requestSkillAction(
                        services,
                        player,
                        firemakingAction(delay),
                        {
                            logItemId: logDef.logId,
                            tile: { x: player.tileX, y: player.tileY },
                            level: player.level,
                            slot,
                            started: false,
                            attempts: 0,
                            previousLocId: 0,
                        },
                        tick,
                    );
                    if (!accepted) {
                        services.messaging.sendGameMessage(
                            player,
                            "You're too busy to do that right now.",
                        );
                    }
                },
            );
        }
        // A log used on a normal fire creates the campfire; using one on a
        // campfire resumes tending it with that selected log type.
        registry.registerItemOnLoc(logDef.logId, 26185, ({ player, source, target, tick }) => {
            startCampfire(player, source.itemId, target.tile, target.level, tick, source.slot);
        });
        registry.registerItemOnLoc(logDef.logId, FORESTERS_CAMPFIRE_OBJECT_ID, ({ player, source, target, tick }) => {
            startCampfire(player, source.itemId, target.tile, target.level, tick, source.slot);
        });
    }

    registry.registerLocInteraction(FORESTERS_CAMPFIRE_OBJECT_ID, (event) => {
        openCampfireLogSelection(event.player, event.tile, event.level);
    }, "tend-to");
}
