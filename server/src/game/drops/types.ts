import type { PendingNpcDrop } from "../npcManager";
import type { PlayerState } from "../player";

export type QuantityInput = number | string | readonly [number, number];
export type ProbabilityInput = number | string;

export type DropQuantity = {
    min: number;
    max: number;
};

export type DropConditionDefinition = {
    /** The defeated monster must be in a Wilderness drop area. */
    wildernessOnly?: boolean;
    /** The recipient must be physically inside a Wilderness drop area. */
    recipientWildernessOnly?: boolean;
    wildernessGodWarsDungeonOnly?: boolean;
    slayerTaskOnly?: boolean;
    requiredSlayerMaster?: string;
    minimumQuestPoints?: number;
    requiredAnyEquippedItemIds?: number[];
};

export type NpcDropEntryDefinition = {
    itemId?: number;
    itemName?: string;
    quantity?: QuantityInput;
    rarity?: ProbabilityInput;
    altRarity?: ProbabilityInput;
    condition?: DropConditionDefinition;
    altCondition?: DropConditionDefinition;
    dropBoostEligible?: boolean;
    /** Entries with the same id are one weighted outcome and are awarded together. */
    outcomeId?: string;
};

export type NpcDropPoolDefinition = {
    kind: "weighted" | "independent";
    category:
        | "main"
        | "pre_roll"
        | "unique"
        | "secondary"
        | "tertiary"
        | "shared"
        | "weapons_armour"
        | "runes_ammo"
        | "coins"
        | "other";
    /** Weighted pools with the same id and roll count are one exclusive table. */
    rollGroupId?: string;
    /**
     * Weighted stages with the same chain id are attempted in ascending order.
     * A successful stage short-circuits the later stages for that roll cycle.
     */
    rollChainId?: string;
    rollChainOrder?: number;
    rolls?: number;
    entries: NpcDropEntryDefinition[];
};

export type NpcDropTableDefinition = {
    always?: NpcDropEntryDefinition[];
    pools?: NpcDropPoolDefinition[];
};

export type NpcDropEntry = {
    itemId: number;
    quantity: DropQuantity;
    probability?: number;
    altProbability?: number;
    condition?: DropConditionDefinition;
    altCondition?: DropConditionDefinition;
    dropBoostEligible: boolean;
    /** Entries with the same id are one weighted outcome and are awarded together. */
    outcomeId?: string;
};

export type NpcDropPool = {
    kind: "weighted" | "independent";
    category:
        | "main"
        | "pre_roll"
        | "unique"
        | "secondary"
        | "tertiary"
        | "shared"
        | "weapons_armour"
        | "runes_ammo"
        | "coins"
        | "other";
    /** Weighted pools with the same id and roll count are one exclusive table. */
    rollGroupId?: string;
    /** See NpcDropPoolDefinition.rollChainId. */
    rollChainId?: string;
    rollChainOrder?: number;
    rolls: number;
    entries: NpcDropEntry[];
    nothingProbability: number;
};

export type NpcDropTable = {
    always: NpcDropEntry[];
    pools: NpcDropPool[];
};

export type DropRecipient = {
    ownerId?: number;
    player?: PlayerState;
    /** The recipient's position at the instant the NPC death is resolved. */
    tile?: { x: number; y: number; level: number };
    dropRateMultiplier: number;
};

export type DropContext = {
    npcTypeId: number;
    npcName: string;
    tile: { x: number; y: number; level: number };
    isWilderness: boolean;
    recipients: DropRecipient[];
    worldViewId?: number;
    transformItemId?: (npcTypeId: number, itemId: number, recipient: DropRecipient) => number;
    /** Gamemode/content eligibility checked before an entry participates in a roll. */
    canReceiveItem?: (
        npcTypeId: number,
        itemId: number,
        recipient: DropRecipient,
    ) => boolean;
    /** Gamemode-provided drop table override (bypasses NpcDropRegistry). */
    tableOverride?: NpcDropTableDefinition;
};

export type DropRollResult = PendingNpcDrop[];

export type ImportedMonsterDefinition = {
    /** The cache NPC type ID: OSRSBox stores it as the record's top-level key/id. */
    npcTypeId?: number;
    name: string;
    combatLevel?: number;
    duplicate?: boolean;
    incomplete?: boolean;
    /** A current Wiki snapshot is exact-ID only and is rejected when its page
     * parser reports an unsafe partial table. */
    source?: "wiki" | "legacy";
    table: NpcDropTableDefinition;
};
