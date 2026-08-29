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
    });

export function getLocInteractionRangeOverride(locId: number): number | undefined {
    return LOC_INTERACTION_RANGE_OVERRIDES[Math.trunc(locId)];
}
