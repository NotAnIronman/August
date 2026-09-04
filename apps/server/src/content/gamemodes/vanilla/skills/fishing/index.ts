import { SkillId } from "@august/osrs-engine/skill/skills";
import type { ActionEffect, ActionExecutionResult } from "@server/game/actions/types";
import { defineGatheringSkill } from "@server/game/skilling/GatheringSkill";
import { countInventoryItem, applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import { logger } from "@server/observability/logger";
import {
    type IScriptRegistry,
    type NpcInteractionEvent,
    type ScriptActionHandlerContext,
    type ScriptServices,
} from "@server/game/scripts/types";
import {
    type FishingSpotDefinition,
    type FishingToolDefinition,
    type FishingToolId,
    buildFishingSpotMap,
    findFishingMethodByAction,
    getFishingMethodById,
    getFishingSpotById,
    getFishingToolDefinition,
    pickFishingCatch,
    selectFishingTool,
} from "@server/content/gamemodes/vanilla/skills/fishing/fishingData";
import {
    buildMessageEffect,
    describeItem,
    failGatheringPrecheck,
    hasAnyCarriedItem,
} from "@server/content/gamemodes/vanilla/skills/gatheringPrecheck";

const FISHING_ACTIONS = [
    "small net",
    "net",
    "big net",
    "cage",
    "harpoon",
    "lure",
    "bait",
    "use-rod",
    "fish",
];

const KYLIE_MINNOW_IDS = [7727, 7728];
const MINNOW_ITEM_ID = 21356;
const RAW_SHARK_ITEM_ID = 383;
const MINNOWS_PER_SHARK = 40;

const ECHO_HARPOON_ITEM_IDS = [25059, 25061, 25114, 25115, 25367, 25368, 25373, 25374];
const ECHO_HARPOON_SUBSTITUTABLE_TOOL_IDS = new Set([
    "small_net",
    "big_net",
    "fishing_rod",
    "fly_fishing_rod",
    "lobster_pot",
    "harpoon",
    "heavy_rod",
]);

interface FishingActionData {
    npcId: number;
    npcTypeId: number;
    npcSize: number;
    spotId?: string;
    methodId: string;
    level: number;
    started: boolean;
}

type FishingRollResource = { catchLevel: number };
const FISHING_SKILL = defineGatheringSkill<FishingRollResource, FishingToolDefinition>({
    name: "fish",
    timing: { delayTicks: 1 },
    success: {
        kind: "custom",
        roll: (level, resource, tool, random) => {
            const ratio = Math.max(1, level) / Math.max(1, resource.catchLevel);
            const baseChance = Math.min(0.85, Math.max(0.05, ratio * 0.3));
            return random() < baseChance * tool.accuracy;
        },
    },
});

function executeFishAction(ctx: ScriptActionHandlerContext): ActionExecutionResult {
    const { player, tick, services } = ctx;
    const data = ctx.data as FishingActionData;
    const npcId = data.npcId;
    const npcTypeId = data.npcTypeId;
    const methodId = data.methodId;
    const priorSpotId = data.spotId;

    if (!(npcId > 0) || !(npcTypeId > 0) || !methodId) {
        return failGatheringPrecheck(player, services, "You stop fishing.");
    }

    const npc = services.combat.getNpc(npcId);
    if (!npc || npc.typeId !== npcTypeId) {
        return failGatheringPrecheck(player, services, "The fishing spot drifts out of reach.");
    }

    const spot =
        (priorSpotId ? getFishingSpotById(priorSpotId) : undefined) ??
        (services.getFishingSpot?.(npc.typeId) as FishingSpotDefinition | undefined);
    if (!spot) {
        return failGatheringPrecheck(player, services, "You can't fish here.");
    }

    const method = getFishingMethodById(spot, methodId);
    if (!method) {
        return failGatheringPrecheck(player, services, "You can't fish here.");
    }

    const tile = { x: npc.tileX, y: npc.tileY };
    const plane = npc.level;

    if (player.level !== plane) {
        return failGatheringPrecheck(player, services, "You stop fishing.");
    }

    if (!services.location.isAdjacentToNpc(player, npc)) {
        return failGatheringPrecheck(player, services, "You stop fishing.");
    }

    const skill = services.skills.getSkill(player, SkillId.Fishing);
    const effectiveLevel = Math.max(1, (skill?.baseLevel ?? 1) + (skill?.boost ?? 0));
    const catchDef = pickFishingCatch(method, effectiveLevel);

    if (!catchDef) {
        const minLevel = method.catches.reduce(
            (min, entry) => Math.min(min, entry.level),
            Number.MAX_SAFE_INTEGER,
        );
        return failGatheringPrecheck(
            player,
            services,
            `You need Fishing level ${minLevel} to fish here.`,
        );
    }

    const carriedIds = services.inventory.collectCarriedItemIds(player) ?? [];
    const hasEchoHarpoonPerk = hasAnyCarriedItem(carriedIds, ECHO_HARPOON_ITEM_IDS);
    const methodToolId = String(method.toolId ?? "")
        .trim()
        .toLowerCase();
    let tool = selectFishingTool(method.toolId, carriedIds);
    if (!tool && hasEchoHarpoonPerk && ECHO_HARPOON_SUBSTITUTABLE_TOOL_IDS.has(methodToolId)) {
        tool = getFishingToolDefinition("harpoon" as FishingToolId);
    }
    if (!tool) {
        const requiredTool = getFishingToolDefinition(method.toolId);
        return failGatheringPrecheck(
            player,
            services,
            `You need a ${requiredTool?.name ?? "fishing tool"} to fish here.`,
        );
    }

    let baitSlot: number | undefined;
    let baitItemId: number | undefined;
    if (Array.isArray(method.baitItemIds) && method.baitItemIds.length > 0) {
        for (const baitId of method.baitItemIds) {
            const slot = services.inventory.findInventorySlotWithItem(player, baitId);
            if (slot !== undefined) {
                baitSlot = slot;
                baitItemId = baitId;
                break;
            }
        }
        if (baitSlot === undefined) {
            const baitLabel = method.baitName ?? "bait";
            return failGatheringPrecheck(player, services, `You don't have any ${baitLabel}.`);
        }
    }

    const catchItemId = catchDef.itemId;
    if (!hasEchoHarpoonPerk && !services.inventory.canStoreItem(player, catchItemId)) {
        return failGatheringPrecheck(
            player,
            services,
            "Your inventory is too full to hold any more fish.",
        );
    }

    const effects: ActionEffect[] = [];

    if (!data.started) {
        effects.push(buildMessageEffect(player, "You attempt to catch some fish."));
    }

    services.location.faceTile(player, tile);
    services.animation.playPlayerSeq(player, tool.animation);

    let inventorySnapshot = false;
    let bankSnapshot = false;
    let success = FISHING_SKILL.rollSuccess(
        effectiveLevel,
        { catchLevel: catchDef.level },
        tool,
    );
    if (!success && hasEchoHarpoonPerk && Math.random() < 0.5) {
        success = true;
    }
    const quantity = catchDef.quantity !== undefined ? Math.max(1, catchDef.quantity) : 1;

    if (success) {
        let rewardItemId = catchItemId;
        let autoCooked = false;
        if (hasEchoHarpoonPerk) {
            const cookingRecipe = services.getCookingRecipeByRawItemId?.(catchItemId);
            if (cookingRecipe && Math.random() < 0.5) {
                rewardItemId = cookingRecipe.cookedItemId;
                autoCooked = true;
                services.skills.addSkillXp(player, SkillId.Cooking, cookingRecipe.xp);
            }
        }

        if (hasEchoHarpoonPerk) {
            const banked = services.banking?.addItemToBank?.(player, rewardItemId, quantity);
            if (!banked) {
                return failGatheringPrecheck(
                    player,
                    services,
                    "Your bank is too full to hold any more fish.",
                );
            }
            bankSnapshot = true;
        } else {
            if (baitItemId === undefined) {
                const stored =
                    services.inventory.addItemToInventory(player, rewardItemId, quantity).added ===
                    quantity;
                if (!stored) {
                    return failGatheringPrecheck(
                        player,
                        services,
                        "Your inventory is too full to hold any more fish.",
                    );
                }
            } else {
                const exchange = applyInventoryTransform(services.inventory, player, {
                    inputs: [{ itemId: baitItemId, quantity: 1 }],
                    outputs: [{ itemId: rewardItemId, quantity }],
                });
                if (!exchange.ok) {
                    return failGatheringPrecheck(
                        player,
                        services,
                        exchange.reason === "missing-inputs"
                            ? "You fumble your bait and stop fishing."
                            : "Your inventory is too full to hold any more fish.",
                    );
                }
            }
            inventorySnapshot = true;
        }

        const fishName = describeItem(services, rewardItemId);
        effects.push(
            buildMessageEffect(
                player,
                hasEchoHarpoonPerk && autoCooked
                    ? `You catch and cook some ${fishName}.`
                    : `You catch some ${fishName}.`,
            ),
        );
        if (hasEchoHarpoonPerk) {
            const capitalizedFishName = fishName.charAt(0).toUpperCase() + fishName.slice(1);
            effects.push(
                buildMessageEffect(
                    player,
                    `${quantity}x ${capitalizedFishName} were sent straight to your bank.`,
                ),
            );
        }
        services.skills.addSkillXp(player, SkillId.Fishing, catchDef.xp);

        if (
            hasEchoHarpoonPerk &&
            baitSlot !== undefined &&
            Array.isArray(method.baitItemIds)
        ) {
            if (!services.inventory.consumeItem(player, baitSlot)) {
                return failGatheringPrecheck(
                    player,
                    services,
                    "You fumble your bait and stop fishing.",
                );
            }
            inventorySnapshot = true;
        }
    } else {
        effects.push(buildMessageEffect(player, "You fail to catch anything."));
    }

    if (inventorySnapshot) {
        effects.push({ type: "inventorySnapshot", playerId: player.id });
    }
    if (bankSnapshot) {
        services.banking?.queueBankSnapshot?.(player);
    }

    let continueFishing = true;
    if (!hasEchoHarpoonPerk && !services.inventory.canStoreItem(player, catchItemId)) {
        continueFishing = false;
        effects.push(
            buildMessageEffect(player, "Your inventory is too full to hold any more fish."),
        );
    }

    if (continueFishing && Array.isArray(method.baitItemIds) && method.baitItemIds.length > 0) {
        const hasBait = method.baitItemIds.some((baitId) =>
            services.inventory.playerHasItem(player, baitId),
        );
        if (!hasBait) {
            continueFishing = false;
            const baitLabel = method.baitName ?? "bait";
            effects.push(buildMessageEffect(player, `You have run out of ${baitLabel}.`));
        }
    }

    const baseSwingTicks = method.swingTicks;
    const swingTicks =
        hasEchoHarpoonPerk && baseSwingTicks > 1 ? baseSwingTicks - 1 : baseSwingTicks;
    if (continueFishing) {
        const npcSize = npc.size;
        const reschedule = FISHING_SKILL.repeat(
            services,
            player,
            {
                npcId: npc.id,
                npcTypeId: npc.typeId,
                npcSize,
                spotId: spot.id,
                methodId: method.id,
                level: plane,
                started: true,
            },
            tick,
            { delayTicks: swingTicks, cooldownTicks: swingTicks },
        );
        if (!reschedule) {
            effects.push(buildMessageEffect(player, "You stop fishing."));
        }
    }

    return { ok: true, cooldownTicks: swingTicks, groups: ["skill.fish"], effects };
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler("skill.fish", executeFishAction);

    const npcTypeLoader = services.data.getNpcTypeLoader();
    if (npcTypeLoader) {
        const fishingMap = buildFishingSpotMap(npcTypeLoader);
        const previousFishingSpotProvider = services.getFishingSpot;
        const fishingSpotProvider = (npcTypeId: number) => {
            const spotId = fishingMap.map.get(npcTypeId);
            if (!spotId) return undefined;
            return getFishingSpotById(spotId);
        };
        services.getFishingSpot = fishingSpotProvider;
        registry.registerCleanup(() => {
            if (services.getFishingSpot === fishingSpotProvider) {
                services.getFishingSpot = previousFishingSpotProvider;
            }
        });
    }

    if (!services.getFishingSpot) {
        logger.warn("[script:fishing] fishing spot lookup unavailable; module disabled");
        return;
    }
    for (const action of FISHING_ACTIONS) {
        registry.registerNpcAction(action, (event) => {
            handleFishingAction(event.option ?? action, event, services);
        });
    }

    for (const npcId of KYLIE_MINNOW_IDS) {
        registry.registerNpcInteraction(npcId, (event) => {
            handleMinnowExchange(event, services);
        });
    }
}

function handleFishingAction(option: string, event: NpcInteractionEvent, services: ScriptServices) {
    const spot = services.getFishingSpot?.(event.npc.typeId) as FishingSpotDefinition | undefined;
    if (!spot) {
        services.messaging.sendGameMessage(event.player, "Nothing interesting happens.");
        return;
    }
    const method = findFishingMethodByAction(spot, option);
    if (!method) {
        services.messaging.sendGameMessage(event.player, "You can't fish there.");
        return;
    }
    const delay = method.swingTicks;
    const result = FISHING_SKILL.request(
        services,
        event.player,
        {
            npcId: event.npc.id,
            npcTypeId: event.npc.typeId,
            npcSize: event.npc.size,
            spotId: spot.id,
            methodId: method.id,
            level: event.npc.level,
            started: false,
        },
        event.tick,
        { delayTicks: delay, cooldownTicks: delay },
    );
    if (!result) {
        services.messaging.sendGameMessage(event.player, "You're too busy to do that right now.");
    }
}

function handleMinnowExchange(event: NpcInteractionEvent, services: ScriptServices): void {
    const getInventory = services.inventory.getInventoryItems;
    const inventory = getInventory(event.player);
    const minnowCount = countInventoryItem(inventory, MINNOW_ITEM_ID);
    if (minnowCount < MINNOWS_PER_SHARK) {
        services.messaging.sendGameMessage(
            event.player,
            "You need at least 40 minnows to exchange for a raw shark.",
        );
        return;
    }
    const emptySlots = inventory.filter((entry) => entry.itemId <= 0 || entry.quantity <= 0).length;
    const maxConversions = Math.min(Math.floor(minnowCount / MINNOWS_PER_SHARK), emptySlots);
    if (maxConversions <= 0) {
        services.messaging.sendGameMessage(
            event.player,
            "You need some free inventory space before exchanging minnows.",
        );
        return;
    }

    let converted = 0;
    for (let i = 0; i < maxConversions; i++) {
        const exchange = applyInventoryTransform(services.inventory, event.player, {
            inputs: [{ itemId: MINNOW_ITEM_ID, quantity: MINNOWS_PER_SHARK }],
            outputs: [{ itemId: RAW_SHARK_ITEM_ID, quantity: 1 }],
        });
        if (!exchange.ok) break;
        converted++;
    }

    if (converted > 0) {
        const totalMinnows = converted * MINNOWS_PER_SHARK;
        const suffix = converted === 1 ? "" : "s";
        services.messaging.sendGameMessage(
            event.player,
            `Kylie swaps ${totalMinnows} minnows for ${converted} raw shark${suffix}.`,
        );
        services.inventory.snapshotInventoryImmediate(event.player);
    } else {
        services.messaging.sendGameMessage(event.player, "No exchange occurred.");
    }
}
