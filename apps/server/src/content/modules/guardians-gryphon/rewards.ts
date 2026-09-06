import type { DropEligibility, PlayerDamageSummary } from "@server/game/combat/DamageTracker";
import { partyDamageThreshold } from "@server/game/combat/PartyLootEligibility";
import type { PlayerState } from "@server/game/player";
/** Damage to either Guardian counts toward the combined encounter, never just its final NPC. */
export function encounterEligibility(records: readonly DropEligibility[], members: readonly PlayerState[], maximumHealth: number, partySize: number, worldViewId: number, level: number): DropEligibility {
    const merged = new Map<number, PlayerDamageSummary>();
    for (const record of records)
        for (const summary of record.damageSummaries) {
            const previous = merged.get(summary.playerId);
            if (!previous)
                merged.set(summary.playerId, { ...summary, damageByType: new Map(summary.damageByType) });
            else {
                previous.totalDamage += summary.totalDamage;
                previous.hitCount += summary.hitCount;
                previous.firstHitTick = Math.min(previous.firstHitTick, summary.firstHitTick);
                previous.lastHitTick = Math.max(previous.lastHitTick, summary.lastHitTick);
                for (const [type, damage] of summary.damageByType)
                    previous.damageByType.set(type, (previous.damageByType.get(type) ?? 0) + damage);
            }
        }
    const damageSummaries = [...merged.values()].sort((a, b) => b.totalDamage - a.totalDamage);
    const eligibleLooters = damageSummaries.filter(s => s.totalDamage > 0 && s.totalDamage >= maximumHealth * partyDamageThreshold(partySize))
        .map(s => members.find(p => p === s.player && p.worldViewId === worldViewId && p.level === level)).filter((p): p is PlayerState => !!p);
    return { damageSummaries, totalDamage: damageSummaries.reduce((sum, s) => sum + s.totalDamage, 0), eligibleLooters, primaryLooter: eligibleLooters[0] ?? null };
}
