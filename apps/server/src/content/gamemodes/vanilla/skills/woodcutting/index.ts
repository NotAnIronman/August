import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    ScriptActionHandlerContext,
    ScriptServices,
} from "@server/game/scripts/types";
import { defineGatheringSkill } from "@server/game/skilling/GatheringSkill";
import { ResourceNodeTracker, buildTileKey } from "@server/game/skilling/ResourceNodeTracker";
import {
    SKILL_ERROR_SOUND,
    buildMessageEffect,
    describeItem,
    failGatheringPrecheck,
    hasAnyCarriedItem,
} from "@server/content/gamemodes/vanilla/skills/gatheringPrecheck";
import {
    type HatchetDefinition,
    type WoodcuttingTreeDefinition,
    buildWoodcuttingLocMap,
    getWoodcuttingTreeById,
    getWoodcuttingTreeFromMap,
    selectHatchetByLevel,
} from "@server/content/gamemodes/vanilla/skills/woodcutting/woodcuttingData";

// Generic handlers are intentionally limited to the three ordinary labels.
// Less common cache verbs (Cut/Cut down) are registered only against the
// loc IDs proven to be ordinary trees by the cache scan below.
const WOODCUT_ACTIONS = ["chop", "chop down", "chop-down"];
const WOODCUTTING_DEPLETE_SOUND = 2734;
const ECHO_AXE_ITEM_IDS = [25110];
const WOODCUTTING_GUILD_BOUNDS = { minX: 1560, maxX: 1664, minY: 3460, maxY: 3528 };
const WOODCUTTING_GUILD_INVISIBLE_BOOST = 7;

interface WoodcuttingActionData {
    treeLocId: number;
    treeId?: string;
    stumpId: number;
    tile: { x: number; y: number };
    level: number;
    started: boolean;
    ticksInSwing: number;
}

const WOODCUTTING_SKILL = defineGatheringSkill<
    WoodcuttingTreeDefinition,
    HatchetDefinition,
    undefined
>({
    name: "woodcut",
    timing: { delayTicks: 1 },
    success: {
        kind: "linear-255",
        // Axe accuracy modifies only the low endpoint; level interpolation and
        // the tree's ratio remain identical to the established implementation.
        low: (tree, hatchet) =>
            tree.chopChance * (1 + (Math.max(1, hatchet.accuracy) - 1) * 0.25),
        ratio: (tree) => tree.chopRatio,
    },
    depletion: {
        chance: (tree) => 1 / Math.max(1, tree.depleteRoll ?? 1),
    },
    respawn: { duration: (tree) => tree.respawnTicks },
});

function isInWoodcuttingGuild(player: PlayerState): boolean {
    return (
        player.level === 0 &&
        player.tileX >= WOODCUTTING_GUILD_BOUNDS.minX &&
        player.tileX <= WOODCUTTING_GUILD_BOUNDS.maxX &&
        player.tileY >= WOODCUTTING_GUILD_BOUNDS.minY &&
        player.tileY <= WOODCUTTING_GUILD_BOUNDS.maxY
    );
}

function executeWoodcutAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as WoodcuttingActionData;

    const locId = data.treeLocId;
    const treeId = data.treeId;
    const tree =
        (treeId ? getWoodcuttingTreeById(treeId) : undefined) ??
        (services.getWoodcuttingTree?.(locId) as WoodcuttingTreeDefinition | undefined);

    if (!tree) {
        return failGatheringPrecheck(player, services, "You can't chop that tree.");
    }

    const tile = { x: data.tile.x, y: data.tile.y };
    const plane = data.level;
    const nodeKey = buildTileKey(tile, plane);

    if (services.gathering?.getTracker("woodcutting")?.has(nodeKey)) {
        return failGatheringPrecheck(player, services, "The tree has no logs left.");
    }

    if (!services.location.isAdjacentToLoc(player, locId, tile, plane)) {
        return failGatheringPrecheck(player, services, "You stop chopping the tree.");
    }

    const skill = services.skills.getSkill(player, SkillId.Woodcutting);
    const visibleLevel = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));

    // The Guild boost helps the roll only. It is invisible and never bypasses
    // a tree's actual Woodcutting requirement.
    if (visibleLevel < tree.level) {
        return failGatheringPrecheck(
            player,
            services,
            `You need Woodcutting level ${tree.level} to chop this tree.`,
            { errorSound: true },
        );
    }

    const effectiveLevel = visibleLevel +
        (isInWoodcuttingGuild(player) ? WOODCUTTING_GUILD_INVISIBLE_BOOST : 0);

    const hatchetIds = services.inventory.collectCarriedItemIds(player) ?? [];
    const hatchet = selectHatchetByLevel(hatchetIds, effectiveLevel);
    if (!hatchet) {
        return failGatheringPrecheck(
            player,
            services,
            "You need an axe that you have the Woodcutting level to use.",
            { errorSound: true },
        );
    }
    const hasEchoAxePerk = hasAnyCarriedItem(hatchetIds, ECHO_AXE_ITEM_IDS);

    if (!hasEchoAxePerk && !services.inventory.hasInventorySlot(player)) {
        const logName = describeItem(services, tree.logItemId);
        return failGatheringPrecheck(
            player,
            services,
            `Your inventory is too full to hold any more ${logName}.`,
            { errorSound: true },
        );
    }

    const stumpId = data.stumpId;
    const effects: ActionEffect[] = [];

    if (!data.started) {
        services.location.faceTile(player, tile);
        services.animation.playPlayerSeq(player, hatchet.animation);
        effects.push(buildMessageEffect(player, "You swing your axe at the tree."));
        const reschedule = WOODCUTTING_SKILL.repeat(
            services,
            player,
            {
                treeId: tree.id,
                treeLocId: locId,
                stumpId,
                tile: { x: tile.x, y: tile.y },
                level: plane,
                started: true,
                ticksInSwing: 0,
            },
            tick,
        );
        if (!reschedule) {
            services.stopGatheringInteraction?.(player);
            effects.push(buildMessageEffect(player, "You stop chopping the tree."));
        }
        return { ok: true, cooldownTicks: 1, groups: ["skill.woodcut"], effects };
    }

    const ticksInSwing = data.ticksInSwing + 1;
    const shouldRoll = ticksInSwing === 2;

    if (ticksInSwing === 0) {
        services.location.faceTile(player, tile);
        services.animation.playPlayerSeq(player, hatchet.animation);
    }

    let treeDepleted = false;
    let inventorySnapshot = false;
    let bankSnapshot = false;

    let success = shouldRoll && WOODCUTTING_SKILL.rollSuccess(effectiveLevel, tree, hatchet);
    if (!success && shouldRoll && hasEchoAxePerk && Math.random() < 0.5) {
        success = true;
    }
    if (success) {
        if (hasEchoAxePerk) {
            const banked = services.banking?.addItemToBank?.(player, tree.logItemId, 1);
            if (!banked) {
                const logName = describeItem(services, tree.logItemId);
                return failGatheringPrecheck(
                    player,
                    services,
                    `Your bank is too full to hold any more ${logName}.`,
                    { errorSound: true },
                );
            }
            bankSnapshot = true;
        } else {
            const result = services.inventory.addItemToInventory(player, tree.logItemId, 1);
            if (result.added <= 0) {
                const logName = describeItem(services, tree.logItemId);
                return failGatheringPrecheck(
                    player,
                    services,
                    `Your inventory is too full to hold any more ${logName}.`,
                    { errorSound: true },
                );
            }
            inventorySnapshot = true;
        }

        const logName = describeItem(services, tree.logItemId);
        effects.push(buildMessageEffect(player, `You get some ${logName}.`));
        if (hasEchoAxePerk) {
            const capitalizedLogName = logName.charAt(0).toUpperCase() + logName.slice(1);
            effects.push(
                buildMessageEffect(
                    player,
                    `1x ${capitalizedLogName} were sent straight to your bank.`,
                ),
            );
        }
        services.skills.addSkillXp(player, SkillId.Woodcutting, tree.xp);

        const shouldDeplete = WOODCUTTING_SKILL.rollDepletion(tree, undefined);
        if (shouldDeplete) {
            treeDepleted = true;
            if (locId > 0) {
                services.gathering
                    ?.getTracker<any>("woodcutting")
                    ?.addWithRandomDuration(
                        nodeKey,
                        tile,
                        plane,
                        tick,
                        WOODCUTTING_SKILL.respawnDuration(tree) ?? tree.respawnTicks,
                        {
                        locId,
                        stumpId,
                        treeId: tree.id,
                        },
                    );
                services.location.emitLocChange(locId, stumpId, tile, plane);
                services.sound.enqueueSoundBroadcast(
                    WOODCUTTING_DEPLETE_SOUND,
                    tile.x,
                    tile.y,
                    plane,
                );
                services.stopGatheringInteraction?.(player);
            }
            effects.push(buildMessageEffect(player, "The tree has run out of logs."));
        }
    }

    if (inventorySnapshot) {
        effects.push({ type: "inventorySnapshot", playerId: player.id });
    }
    if (bankSnapshot) {
        services.banking?.queueBankSnapshot?.(player);
    }

    let continueChopping =
        !treeDepleted && !services.gathering?.getTracker("woodcutting")?.has(nodeKey);
    if (continueChopping) {
        if (!hasEchoAxePerk && !services.inventory.hasInventorySlot(player)) {
            continueChopping = false;
            const logName = describeItem(services, tree.logItemId);
            services.sound.sendSound(player, SKILL_ERROR_SOUND);
            effects.push(
                buildMessageEffect(
                    player,
                    `Your inventory is too full to hold any more ${logName}.`,
                ),
            );
        } else if (!services.location.isAdjacentToLoc(player, locId, tile, plane)) {
            continueChopping = false;
        }
    }

    if (!continueChopping) {
        services.stopGatheringInteraction?.(player);
    }

    if (continueChopping) {
        const nextTicksInSwing = ticksInSwing >= 3 ? -1 : ticksInSwing;
        const reschedule = WOODCUTTING_SKILL.repeat(
            services,
            player,
            {
                treeId: tree.id,
                treeLocId: locId,
                stumpId,
                tile: { x: tile.x, y: tile.y },
                level: plane,
                started: true,
                ticksInSwing: nextTicksInSwing,
            },
            tick,
        );
        if (!reschedule) {
            services.stopGatheringInteraction?.(player);
            effects.push(buildMessageEffect(player, "You stop chopping the tree."));
        }
    }

    return { ok: true, cooldownTicks: 1, groups: ["skill.woodcut"], effects };
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler("skill.woodcut", executeWoodcutAction);

    const wcTracker = new ResourceNodeTracker<{ locId: number; stumpId: number; treeId: string }>();
    const disposeTracker = services.gathering?.registerTracker("woodcutting", wcTracker, (node, gatheringSvc) => {
        gatheringSvc.emitLocChange(node.data.stumpId, node.data.locId, node.tile, node.level);
    });
    if (disposeTracker) registry.registerCleanup(disposeTracker);

    const locTypeLoader = services.data.getLocTypeLoader();
    const wcLocMap = buildWoodcuttingLocMap(locTypeLoader);
    const previousTreeProvider = services.getWoodcuttingTree;
    const treeProvider = (locId: number) => getWoodcuttingTreeFromMap(locId, wcLocMap);
    services.getWoodcuttingTree = treeProvider;
    registry.registerCleanup(() => {
        if (services.getWoodcuttingTree === treeProvider) {
            services.getWoodcuttingTree = previousTreeProvider;
        }
    });

    const startWoodcutting = (event: {
        locId: number;
        player: PlayerState;
        tile: { x: number; y: number };
        level: number;
        tick: number;
    }) => {
            const tree = services.getWoodcuttingTree?.(event.locId) as
                | WoodcuttingTreeDefinition
                | undefined;
            if (!tree) return;
            const result = WOODCUTTING_SKILL.request(
                services,
                event.player,
                {
                    treeId: tree.id,
                    treeLocId: event.locId,
                    stumpId: tree.stumpId,
                    tile: { x: event.tile.x, y: event.tile.y },
                    level: event.level,
                    started: false,
                    ticksInSwing: 0,
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
    };

    for (const action of WOODCUT_ACTIONS) {
        registry.registerLocAction(action, startWoodcutting);
    }
    for (const locId of wcLocMap.map.keys()) {
        registry.registerLocInteraction(locId, startWoodcutting, "cut");
        registry.registerLocInteraction(locId, startWoodcutting, "cut down");
        registry.registerLocInteraction(locId, startWoodcutting, "cut-down");
    }
}
