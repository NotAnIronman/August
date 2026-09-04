import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    ScriptActionHandlerContext,
    ScriptServices,
} from "@server/game/scripts/types";
import { defineGatheringSkill, pickWeighted } from "@server/game/skilling/GatheringSkill";
import { ResourceNodeTracker, buildTileKey } from "@server/game/skilling/ResourceNodeTracker";
import {
    SKILL_ERROR_SOUND,
    buildMessageEffect,
    describeItem,
    failGatheringPrecheck,
} from "@server/content/gamemodes/vanilla/skills/gatheringPrecheck";
import {
    type MiningRockDefinition,
    type MiningResourceResult,
    type PickaxeDefinition,
    buildMiningLocMap,
    getMiningRockById,
    getMiningRockFromMap,
    selectPickaxeByLevel,
} from "@server/content/gamemodes/vanilla/skills/mining/miningData";

const MINING_ACTIONS = ["mine", "mine rocks"];
// Trailblazer / Echo pickaxe only (league tutor tool set). Do NOT include
// Infernal/Dragon ornament kits — those were incorrectly bank-routing ore.
const ECHO_PICKAXE_ITEM_IDS = [25112];

interface MiningActionData {
    rockLocId: number;
    rockId?: string;
    depletedLocId?: number;
    tile: { x: number; y: number };
    level: number;
    started: boolean;
    echoMinedCount: number;
}

const MINING_SKILL = defineGatheringSkill<
    MiningRockDefinition,
    PickaxeDefinition,
    { canDeplete: boolean }
>({
    name: "mine",
    timing: { delayTicks: 1 },
    success: {
        kind: "linear-255",
        // Pickaxe tier controls roll timing, not the established success curve.
        low: (rock) => rock.mineChance,
        ratio: (rock) => rock.mineRatio,
    },
    depletion: {
        chance: (rock, state) => (state.canDeplete ? rock.depleteChance : 0),
    },
    respawn: { duration: (rock) => rock.respawnTicks },
});

function rollMiningResource(rock: MiningRockDefinition): MiningResourceResult {
    const results = rock.resourceResults;
    if (!results || results.length === 0) {
        return { itemId: rock.oreItemId, xp: rock.xp, weight: 1 };
    }
    return pickWeighted(results) ?? { itemId: rock.oreItemId, xp: rock.xp, weight: 1 };
}

function executeMineAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as MiningActionData;

    const locId = data.rockLocId;
    const rockId = data.rockId;
    const rock =
        (rockId ? getMiningRockById(rockId) : undefined) ??
        (services.getMiningRock?.(locId) as MiningRockDefinition | undefined);

    if (!rock) {
        return failGatheringPrecheck(player, services, "You can't mine that rock.");
    }

    const tile = { x: data.tile.x, y: data.tile.y };
    const plane = data.level;
    const actionDepletedLocId = data.depletedLocId;
    const nodeKey = buildTileKey(tile, plane);

    if (services.gathering?.getTracker("mining")?.has(nodeKey)) {
        return failGatheringPrecheck(player, services, "The rock is depleted of ore.");
    }

    if (!services.location.isAdjacentToLoc(player, locId, tile, plane)) {
        return failGatheringPrecheck(player, services, "You stop mining the rock.");
    }

    const skill = services.skills.getSkill(player, SkillId.Mining);
    const effectiveLevel = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));

    if (effectiveLevel < rock.level) {
        return failGatheringPrecheck(
            player,
            services,
            `You need Mining level ${rock.level} to mine this rock.`,
        );
    }

    const carriedIds = services.inventory.collectCarriedItemIds(player) ?? [];
    const equippedWeaponId = services.equipment.getEquippedItem(player, 3) ?? 0;
    const pickaxe = selectPickaxeByLevel(carriedIds, effectiveLevel, equippedWeaponId);
    if (!pickaxe) {
        return failGatheringPrecheck(
            player,
            services,
            "You need a pickaxe that you have the Mining level to use.",
        );
    }
    const hasEchoPickaxePerk = ECHO_PICKAXE_ITEM_IDS.includes(pickaxe.itemId);

    if (!hasEchoPickaxePerk && !services.inventory.hasInventorySlot(player)) {
        return failGatheringPrecheck(
            player,
            services,
            "Your inventory is too full to hold any more ore.",
        );
    }

    // The pickaxe, not the rock, determines roll frequency.  This is why a
    // rune pickaxe reaches a mining roll every three ticks even on coal.
    const swingTicks = Math.max(1, pickaxe.swingTicks);
    const effects: ActionEffect[] = [];

    if (!data.started) {
        effects.push(buildMessageEffect(player, "You swing your pickaxe at the rock."));
        services.location.faceTile(player, tile);
        services.animation.playPlayerSeq(player, pickaxe.animation);
        const initialSchedule = MINING_SKILL.repeat(
            services,
            player,
            {
                rockId: rock.id,
                rockLocId: locId,
                depletedLocId: actionDepletedLocId,
                tile: { x: tile.x, y: tile.y },
                level: plane,
                started: true,
                echoMinedCount: data.echoMinedCount,
            },
            tick,
            { delayTicks: swingTicks, cooldownTicks: swingTicks },
        );
        if (!initialSchedule) {
            effects.push(buildMessageEffect(player, "You stop mining the rock."));
        }
        return { ok: true, cooldownTicks: 0, groups: ["skill.mine"], effects };
    }

    services.location.faceTile(player, tile);
    services.animation.playPlayerSeq(player, pickaxe.animation);

    let inventorySnapshot = false;
    let bankSnapshot = false;
    const echoMinedCount = data.echoMinedCount;
    let nextEchoMinedCount = echoMinedCount;

    let success = MINING_SKILL.rollSuccess(effectiveLevel, rock, pickaxe);
    if (!success && hasEchoPickaxePerk && Math.random() < 0.5) {
        success = true;
    }

    if (success) {
        const resource = rollMiningResource(rock);
        if (hasEchoPickaxePerk) {
            const banked = services.banking?.addItemToBank?.(player, resource.itemId, 1);
            if (!banked) {
                return failGatheringPrecheck(
                    player,
                    services,
                    "Your bank is too full to hold any more ore.",
                );
            }
            bankSnapshot = true;
        } else {
            const result = services.inventory.addItemToInventory(player, resource.itemId, 1);
            if (result.added <= 0) {
                return failGatheringPrecheck(
                    player,
                    services,
                    "Your inventory is too full to hold any more ore.",
                );
            }
            inventorySnapshot = true;
        }

        const oreName = describeItem(services, resource.itemId);
        effects.push(buildMessageEffect(player, `You manage to mine some ${oreName}.`));
        if (hasEchoPickaxePerk) {
            const capitalizedOreName = oreName.charAt(0).toUpperCase() + oreName.slice(1);
            effects.push(
                buildMessageEffect(
                    player,
                    `1x ${capitalizedOreName} were sent straight to your bank.`,
                ),
            );
        }
        services.skills.addSkillXp(player, SkillId.Mining, resource.xp);

        if (locId > 0) {
            nextEchoMinedCount = hasEchoPickaxePerk ? echoMinedCount + 1 : 0;
            const canDeplete = !hasEchoPickaxePerk || nextEchoMinedCount >= 4;
            const shouldDeplete = MINING_SKILL.rollDepletion(rock, { canDeplete });
            if (shouldDeplete) {
                const depletedLocId =
                    typeof actionDepletedLocId === "number" && actionDepletedLocId > 0
                        ? actionDepletedLocId
                        : undefined;

                services.gathering
                    ?.getTracker<any>("mining")
                    ?.addWithRandomDuration(
                        nodeKey,
                        tile,
                        plane,
                        tick,
                        MINING_SKILL.respawnDuration(rock) ?? rock.respawnTicks,
                        { locId, depletedLocId, rockId: rock.id },
                    );

                if (depletedLocId !== undefined) {
                    services.location.emitLocChange(locId, depletedLocId, tile, plane);
                }
                effects.push(buildMessageEffect(player, "The rock is depleted of its ore."));
                services.stopGatheringInteraction?.(player);
            }
        }
    }

    if (inventorySnapshot) {
        effects.push({ type: "inventorySnapshot", playerId: player.id });
    }
    if (bankSnapshot) {
        services.banking?.queueBankSnapshot?.(player);
    }

    let continueMining = !services.gathering?.getTracker("mining")?.has(nodeKey);
    if (continueMining) {
        if (!hasEchoPickaxePerk && !services.inventory.hasInventorySlot(player)) {
            continueMining = false;
            effects.push(
                buildMessageEffect(player, "Your inventory is too full to hold any more ore."),
            );
        } else if (!services.location.isAdjacentToLoc(player, locId, tile, plane)) {
            continueMining = false;
        }
    }

    if (continueMining) {
        const reschedule = MINING_SKILL.repeat(
            services,
            player,
            {
                rockId: rock.id,
                rockLocId: locId,
                depletedLocId: actionDepletedLocId,
                tile: { x: tile.x, y: tile.y },
                level: plane,
                started: true,
                echoMinedCount: nextEchoMinedCount,
            },
            tick,
            { delayTicks: swingTicks, cooldownTicks: swingTicks },
        );
        if (!reschedule) {
            effects.push(buildMessageEffect(player, "You stop mining the rock."));
        }
    }

    return { ok: true, cooldownTicks: swingTicks, groups: ["skill.mine"], effects };
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler("skill.mine", executeMineAction);

    const miningTracker = new ResourceNodeTracker<{
        locId: number;
        depletedLocId?: number;
        rockId: string;
    }>();
    const disposeTracker = services.gathering?.registerTracker("mining", miningTracker, (node, gatheringSvc) => {
        if (node.data.depletedLocId && node.data.locId > 0) {
            gatheringSvc.emitLocChange(
                node.data.depletedLocId,
                node.data.locId,
                node.tile,
                node.level,
            );
        }
    });
    if (disposeTracker) registry.registerCleanup(disposeTracker);

    const locTypeLoader = services.data.getLocTypeLoader();
    const miningLocMap = buildMiningLocMap(locTypeLoader);
    const previousRockProvider = services.getMiningRock;
    const rockProvider = (locId: number) => getMiningRockFromMap(locId, miningLocMap);
    services.getMiningRock = rockProvider;
    registry.registerCleanup(() => {
        if (services.getMiningRock === rockProvider) {
            services.getMiningRock = previousRockProvider;
        }
    });

    for (const action of MINING_ACTIONS) {
        registry.registerLocAction(action, (event) => {
            const rock = services.getMiningRock?.(event.locId) as
                | MiningRockDefinition
                | undefined;
            if (!rock) return;
            const result = MINING_SKILL.request(
                services,
                event.player,
                {
                    rockId: rock.id,
                    rockLocId: event.locId,
                    depletedLocId: rock.depletedLocId,
                    tile: { x: event.tile.x, y: event.tile.y },
                    level: event.level,
                    started: false,
                    echoMinedCount: 0,
                },
                event.tick,
                { delayTicks: 0, cooldownTicks: 0 },
            );
            if (!result) {
                services.messaging.sendGameMessage(
                    event.player,
                    "You're too busy to do that right now.",
                );
            }
        });
    }
}
