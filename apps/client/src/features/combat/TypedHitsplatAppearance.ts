import {
    HITSPLAT_STYLE_MAGIC_DAMAGE,
    HITSPLAT_STYLE_MAGIC_MAX,
    HITSPLAT_STYLE_RANGED_DAMAGE,
    HITSPLAT_STYLE_RANGED_MAX,
} from "@august/protocol/combat/TypedHitsplatStyles";

// Cache-backed white hitsplats accept an exact RGB multiply without fighting
// the native red artwork. The max variant retains the max-hit border treatment.
const CACHE_HITSPLAT_DAMAGE_ME = 16;
const CACHE_HITSPLAT_DAMAGE_ME_WHITE = 24;
const CACHE_HITSPLAT_DAMAGE_MAX_ME = 43;
const CACHE_HITSPLAT_DAMAGE_MAX_ME_WHITE = 47;

export const MAGIC_HITSPLAT_COLOR = 0x244f9e;
export const RANGED_HITSPLAT_COLOR = 0x246b39;

export type TypedHitsplatAppearance = Readonly<{
    style: number;
    textColor?: number;
    backgroundTint?: number;
}>;

/** Resolve custom semantic styles into cached artwork and optional tinting. */
export function resolveTypedHitsplatAppearance(
    style: number,
    enabled: boolean,
): TypedHitsplatAppearance {
    switch (style | 0) {
        case HITSPLAT_STYLE_MAGIC_DAMAGE:
            return enabled
                ? {
                      style: CACHE_HITSPLAT_DAMAGE_ME_WHITE,
                      textColor: 0xffffff,
                      backgroundTint: MAGIC_HITSPLAT_COLOR,
                  }
                : { style: CACHE_HITSPLAT_DAMAGE_ME };
        case HITSPLAT_STYLE_RANGED_DAMAGE:
            return enabled
                ? {
                      style: CACHE_HITSPLAT_DAMAGE_ME_WHITE,
                      textColor: 0xffffff,
                      backgroundTint: RANGED_HITSPLAT_COLOR,
                  }
                : { style: CACHE_HITSPLAT_DAMAGE_ME };
        case HITSPLAT_STYLE_MAGIC_MAX:
            return enabled
                ? {
                      style: CACHE_HITSPLAT_DAMAGE_MAX_ME_WHITE,
                      textColor: 0xffffff,
                      backgroundTint: MAGIC_HITSPLAT_COLOR,
                  }
                : { style: CACHE_HITSPLAT_DAMAGE_MAX_ME };
        case HITSPLAT_STYLE_RANGED_MAX:
            return enabled
                ? {
                      style: CACHE_HITSPLAT_DAMAGE_MAX_ME_WHITE,
                      textColor: 0xffffff,
                      backgroundTint: RANGED_HITSPLAT_COLOR,
                  }
                : { style: CACHE_HITSPLAT_DAMAGE_MAX_ME };
        default:
            return { style: style | 0 };
    }
}

