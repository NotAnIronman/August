export const BOSS_HEALTH_BAR_GROUP_ID = 30033;
export const BOSS_HEALTH_BAR_SEGMENT_COUNT = 20;

export const BossHealthBarComponent = Object.freeze({
    Root: 0,
    Name: 1,
    Frame: 2,
    Empty: 3,
    // Keep the value above the fill segments in the cache-style file-id draw order.
    Value: 40,
    SegmentStart: 10,
});

export function bossHealthBarUid(componentId: number): number {
    return (BOSS_HEALTH_BAR_GROUP_ID << 16) | (componentId & 0xffff);
}
