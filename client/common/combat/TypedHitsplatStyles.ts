/**
 * Internal hitsplat styles used to carry an attack's damage type through the
 * normal actor-sync protocol. These are intentionally outside the cache's
 * hitsplat-definition range; the client maps them to cached artwork at render
 * time, while older/disabled presentation falls back to normal damage splats.
 */
export const HITSPLAT_STYLE_MAGIC_DAMAGE = 1007;
export const HITSPLAT_STYLE_RANGED_DAMAGE = 1008;
export const HITSPLAT_STYLE_MAGIC_MAX = 1009;
export const HITSPLAT_STYLE_RANGED_MAX = 1010;

export type TypedHitsplatAttackType = "melee" | "ranged" | "magic";

export function resolveTypedHitsplatStyle(
    attackType: TypedHitsplatAttackType,
    maxHit: boolean,
): number | undefined {
    switch (attackType) {
        case "magic":
            return maxHit ? HITSPLAT_STYLE_MAGIC_MAX : HITSPLAT_STYLE_MAGIC_DAMAGE;
        case "ranged":
            return maxHit ? HITSPLAT_STYLE_RANGED_MAX : HITSPLAT_STYLE_RANGED_DAMAGE;
        default:
            return undefined;
    }
}

