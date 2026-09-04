import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

/** A player may hold up to fifteen clues (opened or boxed) of each tier. */
export const CLUE_SCROLL_LIMIT = 15;

export type ClueTier = "beginner" | "easy" | "medium" | "hard" | "elite" | "master";

interface ClueScrollDefinition {
    tier: ClueTier;
    boxItemId: number;
    /** The initial cache variant. Future Treasure Trails can replace this with a rolled step. */
    clueItemId: number;
}

export const CLUE_SCROLLS: readonly ClueScrollDefinition[] = [
    { tier: "beginner", boxItemId: 24361, clueItemId: 23182 },
    { tier: "easy", boxItemId: 24362, clueItemId: 2677 },
    { tier: "medium", boxItemId: 24363, clueItemId: 2801 },
    { tier: "hard", boxItemId: 24364, clueItemId: 2722 },
    { tier: "elite", boxItemId: 24365, clueItemId: 12073 },
    { tier: "master", boxItemId: 24366, clueItemId: 19835 },
];

const CLUE_BY_TIER = new Map<ClueTier, ClueScrollDefinition>(
    CLUE_SCROLLS.map((definition) => [definition.tier, definition]),
);

const CLUE_BY_DIRECT_ITEM_ID = new Map<number, ClueScrollDefinition>(
    CLUE_SCROLLS.map((definition) => [definition.clueItemId, definition]),
);

export function getClueScrollDefinitionForDirectItem(
    itemId: number,
): ClueScrollDefinition | undefined {
    return CLUE_BY_DIRECT_ITEM_ID.get(itemId);
}

function isTierItem(itemId: number, tier: ClueTier, services: ScriptServices): boolean {
    const definition = CLUE_BY_TIER.get(tier);
    if (!definition) return false;
    if (itemId === definition.boxItemId) return true;
    const name = services.data.getItemDefinition(itemId)?.name?.trim().toLowerCase();
    return name === `clue scroll (${tier})`;
}

/** Counts boxes as clues too, so banking boxes cannot bypass the per-tier cap. */
export function countCluesForTier(
    player: PlayerState,
    tier: ClueTier,
    services: ScriptServices,
): number {
    let total = 0;
    for (const entry of player.getInventoryEntries()) {
        if (entry.itemId > 0 && entry.quantity > 0 && isTierItem(entry.itemId, tier, services)) {
            total += entry.quantity;
        }
    }
    for (const entry of player.bank.getBankEntries()) {
        if (entry.itemId > 0 && entry.quantity > 0 && isTierItem(entry.itemId, tier, services)) {
            total += entry.quantity;
        }
    }
    return total;
}

/**
 * The one entry point future clue sources should use. It deliberately gives a
 * scroll box rather than a direct clue and applies the shared 15-clue limit.
 */
export function awardClueScrollBox(
    player: PlayerState,
    tier: ClueTier,
    services: ScriptServices,
): boolean {
    const definition = CLUE_BY_TIER.get(tier);
    if (!definition) return false;
    if (countCluesForTier(player, tier, services) >= CLUE_SCROLL_LIMIT) {
        services.messaging.sendGameMessage(
            player,
            "<col=ff0000>You have a feeling you would have received a clue scroll.</col>",
        );
        return false;
    }
    const result = services.inventory.addItemToInventory(player, definition.boxItemId, 1);
    if (result.added !== 1) return false;
    services.inventory.snapshotInventory(player);
    return true;
}

function openBox(
    player: PlayerState,
    slot: number,
    definition: ClueScrollDefinition,
    services: ScriptServices,
): void {
    const inventory = services.inventory.getInventoryItems(player);
    const source = inventory[slot];
    if (!source || source.itemId !== definition.boxItemId || source.quantity <= 0) return;

    // Removing one box creates a slot only when it was the final box in its
    // stack. For a larger stack, require another usable inventory slot first.
    if (source.quantity > 1 && !services.inventory.canStoreItem(player, definition.clueItemId)) {
        services.messaging.sendGameMessage(player, "You need a free inventory space to open this box.");
        return;
    }

    if (!services.inventory.consumeItem(player, slot)) return;
    const received = services.inventory.addItemToInventory(player, definition.clueItemId, 1);
    if (received.added !== 1) {
        // Preserve the box if an unexpected inventory mutation raced the action.
        services.inventory.addItemToInventory(player, definition.boxItemId, 1);
        services.messaging.sendGameMessage(player, "You need a free inventory space to open this box.");
        services.inventory.snapshotInventory(player);
        return;
    }
    services.inventory.snapshotInventory(player);
}

export function registerClueScrollBoxHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    for (const definition of CLUE_SCROLLS) {
        registry.registerItemAction(
            definition.boxItemId,
            ({ player, source }) => openBox(player, source.slot, definition, services),
            "open",
        );
    }
}
