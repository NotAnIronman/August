import type { DropEligibility } from "./DamageTracker";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { DamageType } from "./DamageTracker";

/** Pre-death interception runs before the lethal hit enters the damage tracker. */
export function includeLethalContribution(original: DropEligibility, player: PlayerState, damage: number, tick: number): DropEligibility {
    if (!Number.isFinite(damage) || damage <= 0) return original;
    const damageSummaries = original.damageSummaries.map(s => ({...s, damageByType: new Map(s.damageByType)}));
    const previous = damageSummaries.find(s => s.player === player);
    if (previous) { previous.totalDamage += damage; previous.hitCount++; previous.lastHitTick = tick;
        previous.damageByType.set(DamageType.Other,(previous.damageByType.get(DamageType.Other) ?? 0)+damage); }
    else damageSummaries.push({player, playerId: player.id, totalDamage: damage, hitCount: 1, firstHitTick: tick, lastHitTick: tick,
        damageByType: new Map([[DamageType.Other, damage]])});
    damageSummaries.sort((a,b)=>b.totalDamage-a.totalDamage);
    return {...original, damageSummaries, totalDamage: original.totalDamage + damage};
}

export function partyDamageThreshold(size: number): number {
    return [0, 0, 0.30, 0.25, 0.20, 0.15][Math.min(5, Math.max(1, Math.trunc(size)))];
}

/** Thresholds use boss maximum HP, not relative ranking or overkill damage. */
export function partyLootEligibility(npc: NpcState, original: DropEligibility,
    members: readonly PlayerState[], partySize = members.length): DropEligibility {
    const required = npc.getMaxHitpoints() * partyDamageThreshold(partySize);
    const allowed = new Set(members.filter(p => p.worldViewId === npc.worldViewId && p.level === npc.level));
    const eligibleLooters = original.damageSummaries.filter(s => allowed.has(s.player) && s.totalDamage > 0 && s.totalDamage >= required).map(s => s.player);
    return { ...original, eligibleLooters, primaryLooter: eligibleLooters[0] ?? null };
}
