// These inventory models use animated cache materials. They must be rendered
// as models (never as an item-ID-indexed sprite archive), with a bounded
// animation phase in the UI icon cache.
const ANIMATED_ITEM_ICON_IDS = new Set([6570, 21295]); // Fire cape, Infernal cape
const UI_ICON_ANIMATION_FPS = 8;
const UI_ICON_ANIMATION_PERIOD_SECONDS = 128;

export function hasAnimatedItemIcon(itemId: number): boolean {
    return ANIMATED_ITEM_ICON_IDS.has(itemId | 0);
}

export function getAnimatedItemIconTimeSeconds(): number {
    return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
}

/** Phase repeats with the same 128-second material-animation period as the scene shader. */
export function getAnimatedItemIconPhase(timeSeconds: number): number {
    const frameCount = UI_ICON_ANIMATION_PERIOD_SECONDS * UI_ICON_ANIMATION_FPS;
    return Math.floor(Math.max(0, timeSeconds) * UI_ICON_ANIMATION_FPS) % frameCount;
}
