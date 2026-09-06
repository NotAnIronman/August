import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";
/**
 * Slayer reward catalog + perk multipliers.
 *
 * Points are a per-account virtual counter (SlayerTaskTracker.getPoints/
 * addPoints/spendPoints) — deliberately NOT an item. Real items don't
 * exist for most of these rewards (they're passive account unlocks), and
 * inventing custom items for them was explicitly rejected: a fabricated
 * item id is one more thing that can collide, get lost, or misbehave
 * downstream, where a plain per-account number can't. `itemId` below is
 * used ONLY as a display icon in the rewards panel (SlayerRewardsPanel.ts)
 * — it is never granted, traded, or otherwise touched as a real item,
 * except for the one reward whose whole point IS a real, already-existing
 * game item (the Slayer helmet), which the panel grants directly.
 */
export type SlayerRewardKind = "item" | "perk";

export interface SlayerRewardDefinition {
    key: string;
    name: string;
    description: string;
    cost: number;
    kind: SlayerRewardKind;
    /** Display icon in the rewards panel. For kind "item" this is also the real item granted. */
    itemId: number;
    itemQuantity?: number;
    /** Perks and the one-off item are one-time; repeatable purchases (none yet) would omit this. */
    oneTime?: boolean;
}

export const SLAYER_REWARD_CATALOG: readonly SlayerRewardDefinition[] = [
    {
        key: "slayer_helmet",
        name: "Slayer helmet",
        description: "A combined helmet granting slayer-specific bonuses against your current task.",
        cost: 500,
        kind: "item",
        itemId: 11864,
        itemQuantity: 1,
        oneTime: true,
    },
    {
        key: "extended_tasks",
        name: "Extended tasks",
        description: "Permanently increases assigned task quantities by 20%.",
        cost: 300,
        kind: "perk",
        itemId: 4160, // Broad arrows — thematically slayer-flavoured, display-only icon.
        oneTime: true,
    },
    {
        key: "bigger_and_badder",
        name: "Bigger and Badder",
        description: "Permanently increases Slayer points earned per completed task by 10%.",
        cost: 350,
        kind: "perk",
        itemId: 6706, // Slayer's staff — display-only icon.
        oneTime: true,
    },
    {
        key: "malevolent_masquerade",
        name: "Malevolent Masquerade",
        description: "Your Slayer helmet (once obtained) can be worn as a fashion override without losing its effect.",
        cost: 200,
        kind: "perk",
        itemId: 11864, // Same visual as the helmet reward — display-only icon.
        oneTime: true,
    },
] as const;

const rewardsByKey = new Map(SLAYER_REWARD_CATALOG.map((reward) => [reward.key, reward]));

export function getSlayerReward(key: string): SlayerRewardDefinition | undefined {
    return rewardsByKey.get(key);
}

export function getAllSlayerRewards(): readonly SlayerRewardDefinition[] {
    return SLAYER_REWARD_CATALOG;
}

/** Read by SlayerService.assignTask to apply the "Extended tasks" perk. */
export function getTaskQuantityMultiplier(playerId: number): number {
    return slayerTaskTracker.hasUnlock(playerId, "extended_tasks") ? 1.2 : 1;
}

/** Read by SlayerService.handleNpcKilled to apply the "Bigger and Badder" perk. */
export function getPointsMultiplier(playerId: number): number {
    return slayerTaskTracker.hasUnlock(playerId, "bigger_and_badder") ? 1.1 : 1;
}
