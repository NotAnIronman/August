/**
 * Object-specific interaction distances for scenery whose visible model or
 * collision prevents ordinary adjacent routing (bridges, gaps, etc.).
 */
export const LOC_INTERACTION_RANGE_OVERRIDES: Readonly<Record<number, number>> =
    Object.freeze({
        // Ice bridge into Zamorak's Fortress. The south bank is separated from
        // its clickable anchor tile by water/collision, so adjacent routing
        // can never complete.
        26518: 3,
        // Verzik's vault stairs sit on the throne; the nearest walkable floor
        // is three tiles south. Keep client and server approach routing aligned.
        32995: 3,
        // Lunar chest has a large collision footprint; its Claim interaction
        // should be reachable from the rim rather than requiring its centre.
        51346: 2,
        53003: 2,
        53004: 2,
    });

export function getLocInteractionRangeOverride(locId: number): number | undefined {
    return LOC_INTERACTION_RANGE_OVERRIDES[Math.trunc(locId)];
}

/**
 * Exact approach tiles for scenery with an interaction point that is not on
 * the visible object's perimeter. This keeps the normal click-to-interact
 * flow intact while preventing a player from routing into blocked stair art.
 */
export const LOC_INTERACTION_APPROACH_OVERRIDES: Readonly<
    Record<number, { x: number; y: number; level: number }>
> = Object.freeze({
    // Barrows crypt staircases.
    20668: { x: 3556, y: 9718, level: 3 },
    20671: { x: 3568, y: 9683, level: 3 },
    20672: { x: 3578, y: 9706, level: 3 },
    20667: { x: 3557, y: 9703, level: 3 },
    20669: { x: 3534, y: 9704, level: 3 },
    20670: { x: 3546, y: 9684, level: 3 },
});

export function getLocInteractionApproachOverride(
    locId: number,
    level: number,
): { x: number; y: number; level: number } | undefined {
    const override = LOC_INTERACTION_APPROACH_OVERRIDES[Math.trunc(locId)];
    return override?.level === Math.trunc(level) ? override : undefined;
}
