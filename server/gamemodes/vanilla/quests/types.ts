import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";

// ============================================================================
// Quest framework types
// ============================================================================

export interface QuestItemRequirement {
    itemId: number;
    quantity: number;
    /** Label shown in the quest journal (e.g. "6 Clay") */
    journalLabel: string;
}

export interface QuestXpReward {
    skillId: number;
    amount: number;
    /** Skill name shown on the completion scroll (e.g. "Mining") */
    label: string;
}

export interface QuestItemReward {
    itemId: number;
    quantity: number;
    /** Label shown on the completion scroll (e.g. "180 Coins") */
    label: string;
}

export interface QuestSkillRequirement {
    skillId: number;
    level: number;
    label: string;
}

export type QuestProgressRequirement = (
    | { varpId: number; varbitId?: never }
    | { varbitId: number; varpId?: never }
) & {
    minValue: number;
    label: string;
};

export interface QuestRequirements {
    questPoints?: number;
    skills?: QuestSkillRequirement[];
    quests?: QuestProgressRequirement[];
}

export interface QuestRewards {
    questPoints: number;
    xp?: QuestXpReward[];
    items?: QuestItemReward[];
    /** Reward lines with no direct grant (e.g. "Use of Doric's anvils") */
    other?: string[];
}

/** Canonical fact sheet shown beside an authored quest journal. */
export interface QuestJournalInfo {
    difficulty: string;
    length: string;
    storyline: string;
}

interface QuestDefinitionBase {
    /** Stable content key used by gamemodes and server systems */
    key: string;
    /** Display name exactly as it appears in the cache quest DB (table 0) */
    name: string;
    /** Whether the quest belongs in the members quest-list group. */
    members?: boolean;
    /** Varp value once the quest has been started */
    startedValue: number;
    /** Varp value once the quest is complete */
    completionValue: number;
    requirements?: QuestRequirements;
    rewards: QuestRewards;
    /** Item model shown on the completion scroll (153:5) */
    rewardItemId?: number;
    /** Start text fragment shown by the quest overview. */
    overviewStartText?: string;
    /** Static facts displayed in the quest journal's right-hand column. */
    journalInfo?: QuestJournalInfo;
    /** Build the quest journal lines for the player's current stage */
    buildJournal(player: PlayerState, services: ScriptServices): string[];
    /** Register the quest's interaction handlers (NPCs, locs, items) */
    register(registry: IScriptRegistry, services: ScriptServices): void;
}

/** A quest whose stage is stored in a varp, optionally using a bit range. */
export interface VarpQuestDefinition extends QuestDefinitionBase {
    /** Quest progress varp. */
    varpId: number;
    varbitId?: never;
    /** Inclusive bit range when quest progress occupies only part of the varp. */
    stageBits?: { start: number; end: number };
}

/** A quest whose cache-defined state is stored directly in a varbit. */
export interface VarbitQuestDefinition extends QuestDefinitionBase {
    varpId?: never;
    /** Quest progress varbit. This value is persisted and synchronized like a varp. */
    varbitId: number;
    stageBits?: never;
}

/** A quest uses exactly one cache-backed progress source. */
export type QuestDefinition = VarpQuestDefinition | VarbitQuestDefinition;
