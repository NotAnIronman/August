export const LILY_PAD_QUEST_KEY = "lily_pad_labour_dispute";

/** Cache varbit: RIBBITING_TALE_OF_A_LILY_PAD_LABOUR_DISPUTE_STATE. */
export const VARBIT_LILY_PAD_QUEST = 9844;
/** Cache varbit: Children of the Sun's explicit quest-completion type. */
export const VARBIT_CHILDREN_OF_THE_SUN_COMPLETE = 9645;
export const CHILDREN_OF_THE_SUN_COMPLETE_VALUE = 2;

// The cache quest-state progression increments by two at each milestone.
export const STAGE_NOT_STARTED = 0;
export const STAGE_SPEAK_TO_BLUE_FROGS = 2;
export const STAGE_RETURN_TO_MARCELLUS = 4;
export const STAGE_SPEAK_TO_FROG_LEADER = 6;
export const STAGE_SPEAK_TO_ORANGE_FROGS = 8;
export const STAGE_CHOP_ORANGE_TREE = 10;
export const STAGE_SABOTAGE_LILY_PAD = 12;
export const STAGE_REPORT_SABOTAGE = 14;
export const STAGE_START_CUTSCENE = 16;
export const STAGE_SPEAK_TO_MARCELLUS_ABOUT_FLIES = 18;
export const STAGE_FRAME_THE_FLIES = 20;
export const STAGE_FIND_EVIDENCE = 22;
export const STAGE_PLANT_EVIDENCE = 24;
export const STAGE_DEFEAT_CUTHBERT = 26;
export const STAGE_REPORT_TO_MARCELLUS = 28;
export const STAGE_RETURN_TO_FROGS = 30;
export const STAGE_COMPLETE = 32;

export const NPC = {
    marcellus: [12935, 12936],
    blueFrogs: [12938, 12939, 12946, 12947],
    orangeFrogs: [12942, 12943, 12950, 12951],
    cuthbert: 12957,
} as const;

export const LOC = {
    logsWithAxe: 5581,
    orangeTree: 50888,
    lilyPad: 50892,
    chest: 50895,
    dungPlantEvidence: 50898,
    dungInspect: 50899,
} as const;

export const ITEM = {
    bronzeAxe: 1351,
    loveLetter: 28986,
    plushy: 28987,
} as const;

export const TILE = {
    cuthbert: { x: 1688, y: 2977, level: 0 },
} as const;
