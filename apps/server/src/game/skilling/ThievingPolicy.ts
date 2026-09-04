import type { ItemAmount } from "@server/game/skilling/InventoryTransform";
import { pickWeighted } from "@server/game/skilling/GatheringSkill";

export interface ThievingLootEntry {
    itemId: number;
    minAmount: number;
    maxAmount: number;
    weight: number;
}

export type ThievingFailurePolicy =
    | { kind: "stun" }
    | { kind: "combat"; guardTypeIds?: readonly number[]; guardRadius?: number }
    | {
          kind: "relocate";
          destinations: readonly { x: number; y: number; level: number }[];
          chance: number;
          message: string;
          /** Some areas eject only after repeated detection, across NPC variants. */
          threshold?: number;
          counterKey?: string;
          avoidance?: { skillId: number; lowChance: number; highChance: number };
          resetArea?: { minX: number; maxX: number; minY: number; maxY: number; level: number };
      };

export interface ThievingChancePolicy {
    lowChance?: number;
    highChance?: number;
    /** Provisional fallback tuning, not an assertion of OSRS per-target odds. */
    minimumChance?: number;
    maximumChance?: number;
}

/**
 * Wiki's current skilling-success formula: round the combined interpolation,
 * add one successful roll, divide by 256. Endpoint bonuses truncate first.
 * https://oldschool.runescape.wiki/w/Template:Skilling_success_chart
 * Explicit curves replace provisional defaults per target. Boosted levels are
 * passed through; OSRS's above-99 Thieving caller behavior remains unverified.
 */
export function getThievingSuccessChance(
    level: number,
    requiredLevel: number,
    policy: ThievingChancePolicy,
    successMultiplier = 1,
): number {
    if (!Number.isFinite(level) || level < requiredLevel) return 0;
    let chance: number;
    if (policy.lowChance !== undefined && policy.highChance !== undefined) {
        const low = Math.trunc(policy.lowChance * successMultiplier);
        const high = Math.trunc(policy.highChance * successMultiplier);
        const interpolated = (low * (99 - level) + high * (level - 1)) / 98;
        chance = (Math.floor(interpolated + 0.5) + 1) / 256;
    } else {
        const low = policy.minimumChance ?? 0.55;
        const high = policy.maximumChance ?? 0.95;
        const fraction = (level - requiredLevel) / Math.max(1, 99 - requiredLevel);
        chance = (low + (high - low) * fraction) * successMultiplier;
    }
    return Number.isFinite(chance) ? Math.max(0, Math.min(1, chance)) : 0;
}

/** Guaranteed bundles and one weighted selection are separate, then commit together. */
export function rollThievingLoot(
    table: readonly ThievingLootEntry[],
    guaranteed: readonly ThievingLootEntry[] = [],
    random: () => number = Math.random,
): ItemAmount[] {
    const selected = pickWeighted(table, random);
    return [...guaranteed, ...(selected ? [selected] : [])].map((entry) => ({
        itemId: entry.itemId,
        quantity: entry.minAmount + Math.floor(random() * (entry.maxAmount - entry.minAmount + 1)),
    }));
}
