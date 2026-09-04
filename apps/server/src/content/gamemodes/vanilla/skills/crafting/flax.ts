import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    ScriptActionHandlerContext,
    ScriptServices,
} from "@server/game/scripts/types";
import { defineGatheringSkill } from "@server/game/skilling/GatheringSkill";
import { ResourceNodeTracker, buildTileKey } from "@server/game/skilling/ResourceNodeTracker";
import { FLAX_LOC_IDS, FLAX_PICK_DELAY_TICKS, isFlaxLocId } from "@server/content/gamemodes/vanilla/skills/crafting/flaxData";

const FLAX_ACTIONS = ["pick", "pick-flax"];
const FLAX_GROUP = "skill.flax";
const FLAX_ITEM_ID = 1779;
const FLAX_PICK_ANIMATION = 827;
const FLAX_PICK_SOUND = 2581;
const FLAX_RESPAWN_TICKS = 25;

const FLAX_GATHERING = defineGatheringSkill<{ respawnTicks: number }, undefined>({
    name: "flax",
    timing: { delayTicks: 0, cooldownTicks: FLAX_PICK_DELAY_TICKS },
    success: { kind: "custom", roll: () => true },
    depletion: { chance: () => 1 },
    respawn: {
        duration: (resource) => ({ min: resource.respawnTicks, max: resource.respawnTicks }),
    },
});

let flaxTracker: ResourceNodeTracker<{ locId: number }> | undefined;

interface FlaxActionData {
    locId: number;
    tile: { x: number; y: number };
    level: number;
}

function buildMessageEffect(player: PlayerState, message: string): ActionEffect {
    return { type: "message", playerId: player.id, message };
}

function executeFlaxAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as FlaxActionData;
    const tile = { x: data.tile.x, y: data.tile.y };
    const plane = data.level;
    const locId = data.locId;

    if (flaxTracker?.hasTile(tile, plane)) {
        services.stopGatheringInteraction?.(player);
        return { ok: true, effects: [] };
    }

    if (!services.inventory.hasInventorySlot(player)) {
        services.stopGatheringInteraction?.(player);
        return {
            ok: true,
            effects: [
                buildMessageEffect(player, "Your inventory is too full to hold any more flax."),
            ],
        };
    }

    const effects: ActionEffect[] = [];

    services.location.faceTile(player, tile);
    services.animation.playPlayerSeq(player, FLAX_PICK_ANIMATION);

    services.sound.enqueueSoundBroadcast(FLAX_PICK_SOUND, tile.x, tile.y, plane);

    const result = services.inventory.addItemToInventory(player, FLAX_ITEM_ID, 1);
    if (result.added <= 0) {
        services.stopGatheringInteraction?.(player);
        return {
            ok: true,
            effects: [
                buildMessageEffect(player, "Your inventory is too full to hold any more flax."),
            ],
        };
    }
    effects.push({ type: "inventorySnapshot", playerId: player.id });

    if (FLAX_GATHERING.rollDepletion({ respawnTicks: FLAX_RESPAWN_TICKS }, undefined)) {
        const duration = FLAX_GATHERING.respawnDuration({
            respawnTicks: FLAX_RESPAWN_TICKS,
        }) ?? { min: FLAX_RESPAWN_TICKS, max: FLAX_RESPAWN_TICKS };
        flaxTracker?.addWithRandomDuration(
            buildTileKey(tile, plane),
            tile,
            plane,
            tick,
            duration,
            { locId },
        );
        services.location.emitLocChange(locId, 0, tile, plane);
    }

    effects.push(buildMessageEffect(player, "You pick some flax."));

    services.sound.sendSound(player, FLAX_PICK_SOUND);

    return {
        ok: true,
        cooldownTicks: FLAX_PICK_DELAY_TICKS,
        groups: [FLAX_GROUP],
        effects,
    };
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler("skill.flax", executeFlaxAction);

    flaxTracker = new ResourceNodeTracker<{ locId: number }>();
    const registeredTracker = flaxTracker;
    const disposeTracker = services.gathering?.registerTracker("flax", registeredTracker, (node, gatheringSvc) => {
        gatheringSvc.emitLocChange(0, node.data.locId, node.tile, node.level);
    });
    registry.registerCleanup(() => {
        disposeTracker?.();
        if (flaxTracker === registeredTracker) flaxTracker = undefined;
    });

    const registerLoc = (locId: number, action: string) => {
        registry.registerLocInteraction(
            locId,
            (event) => {
                if (!isFlaxLocId(event.locId)) return;
                const result = FLAX_GATHERING.request(
                    services,
                    event.player,
                    {
                        locId: event.locId,
                        tile: { x: event.tile.x, y: event.tile.y },
                        level: event.level,
                    },
                    event.tick,
                );
                if (!result) {
                    services.messaging.sendGameMessage(
                        event.player,
                        "You're too busy to pick flax right now.",
                    );
                }
            },
            action,
        );
    };

    for (const locId of FLAX_LOC_IDS) {
        for (const action of FLAX_ACTIONS) {
            registerLoc(locId, action);
        }
    }
}
