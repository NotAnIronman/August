export type Vec2 = { x: number; y: number };

export interface FiremakingLogDefinition {
    logId: number;
    name: string;
    level: number;
    xp: number;
    burnTicks: { min: number; max: number };
    fireObjectId: number;
    /** Firelighter-treated logs never fail their ignition roll. */
    alwaysIgnites?: boolean;
}

const DEFAULT_FIRE_OBJECT_ID = 26185;
const DEFAULT_BURN_TICKS = { min: 75, max: 120 }; // ≈45–72 seconds at 600ms ticks

const LOG_DEFINITIONS: FiremakingLogDefinition[] = [
    { logId: 1511, name: "logs", level: 1, xp: 40 },
    // Cache variants used by content that supplies ordinary, unnoted logs.
    { logId: 2511, name: "logs", level: 1, xp: 40 },
    { logId: 24650, name: "logs", level: 1, xp: 40 },
    { logId: 2862, name: "achey logs", level: 1, xp: 40 },
    { logId: 1521, name: "oak logs", level: 15, xp: 60 },
    { logId: 1519, name: "willow logs", level: 30, xp: 90 },
    { logId: 6333, name: "teak logs", level: 35, xp: 105 },
    { logId: 32902, name: "jatoba logs", level: 40, xp: 120 },
    { logId: 32903, name: "jatoba logs", level: 40, xp: 120 },
    { logId: 10810, name: "arctic pine logs", level: 42, xp: 125 },
    { logId: 1517, name: "maple logs", level: 45, xp: 135 },
    { logId: 6332, name: "mahogany logs", level: 50, xp: 157.5 },
    { logId: 1515, name: "yew logs", level: 60, xp: 202.5 },
    { logId: 24691, name: "blisterwood logs", level: 62, xp: 96 },
    { logId: 24692, name: "blisterwood logs", level: 62, xp: 96 },
    { logId: 32904, name: "camphor logs", level: 66, xp: 180 },
    { logId: 32906, name: "camphor logs", level: 66, xp: 180 },
    { logId: 1513, name: "magic logs", level: 75, xp: 303.8 },
    { logId: 32907, name: "ironwood logs", level: 80, xp: 220.5 },
    { logId: 32909, name: "ironwood logs", level: 80, xp: 220.5 },
    { logId: 19669, name: "redwood logs", level: 90, xp: 350 },
    { logId: 32910, name: "rosewood logs", level: 92, xp: 268 },
    { logId: 32912, name: "rosewood logs", level: 92, xp: 268 },
    // Coloured logs are created by adding a firelighter to regular logs. The
    // distinctive flame treatment can be layered on later; they already use
    // the normal tinderbox action and award their authentic 50 XP.
    { logId: 7404, name: "red logs", level: 1, xp: 50, alwaysIgnites: true },
    { logId: 7405, name: "green logs", level: 1, xp: 50, alwaysIgnites: true },
    { logId: 7406, name: "blue logs", level: 1, xp: 50, alwaysIgnites: true },
    { logId: 10328, name: "white logs", level: 1, xp: 50, alwaysIgnites: true },
    { logId: 10329, name: "purple logs", level: 1, xp: 50, alwaysIgnites: true },
].map((entry) => ({
    burnTicks: DEFAULT_BURN_TICKS,
    fireObjectId: DEFAULT_FIRE_OBJECT_ID,
    ...entry,
}));

const LOGS_BY_ID = new Map<number, FiremakingLogDefinition>();
for (const def of LOG_DEFINITIONS) {
    LOGS_BY_ID.set(def.logId, def);
}

export const FIREMAKING_LOG_IDS = LOG_DEFINITIONS.map((def) => def.logId);

export const FIRE_LIGHTING_ANIMATION = 733;

export const TINDERBOX_ITEM_IDS: number[] = [590, 2946];

export const ASHES_ITEM_ID = 592;

export function getFiremakingLogDefinition(itemId: number): FiremakingLogDefinition | undefined {
    return LOGS_BY_ID.get(itemId);
}

export function computeFireLightingDelayTicks(level: number): number {
    const normalized = Math.max(1, Math.floor(level));
    const deduction = Math.floor(Math.max(0, normalized - 15) / 20);
    return Math.max(2, 4 - deduction);
}

export interface FireNodeData {
    fireObjectId: number;
    previousLocId: number;
    logItemId: number;
    ownerId?: number;
    isForestersCampfire?: boolean;
}
