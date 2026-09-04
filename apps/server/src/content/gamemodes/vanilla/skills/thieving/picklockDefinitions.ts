import type { ItemAmount } from "@server/game/skilling/InventoryTransform";

export const PICKLOCK_OPTIONS = ["pick-lock", "picklock"] as const;
export const LOCKPICK_ITEM_ID = 1523;
export const THIEVING_SKILL_ID = 17;
export const HAM_TRAPDOOR = {
    locId: 5492, closedId: 5490, openId: 5491, varbitId: 235,
    level: 1, xp: 4, destination: { x: 3149, y: 9652, level: 0 },
} as const;

export interface PicklockChestDefinition {
    locId: number;
    level: number;
    xp: number;
    loot: readonly ItemAmount[];
    respawnTicks: number;
    source: string;
    openedId: number;
    placements: readonly { x: number; y: number; level: number; rotation: number }[];
}

// Fixed bundles only. The overview halves these timers; individual pages say
// 7/15 seconds. Conservative individual-page values until live verification.
// rev237: 171 is an inert Open chest using model1226 (closed model1249).
// Reviewed visual substitution, not a claim of the original server's transform ID.
export const PICKLOCK_CHESTS: readonly PicklockChestDefinition[] = [
    {
        locId: 11737, level: 43, xp: 125,
        loot: [{ itemId: 995, quantity: 50 }], respawnTicks: 75, openedId: 171,
        // ID correlation: wiki nature-chest page identifies southwest companion;
        // rev237 placements below are those exact companion chests.
        placements: [ {x:2671,y:3299,level:1,rotation:1}, {x:3040,y:3949,level:0,rotation:0} ],
        source: "https://oldschool.runescape.wiki/w/Chest_(nature_runes)",
    },
    {
        locId: 11735, level: 13, xp: 7.8,
        loot: [{ itemId: 995, quantity: 10 }], respawnTicks: 12,
        openedId: 171,
        placements: [
            {x:2612,y:3314,level:1,rotation:0}, {x:2673,y:3307,level:0,rotation:1},
            {x:2630,y:3655,level:0,rotation:2}, {x:3044,y:3951,level:0,rotation:3},
            {x:3044,y:3957,level:0,rotation:3}, {x:3188,y:3962,level:0,rotation:2},
            {x:3189,y:3962,level:0,rotation:2}, {x:3193,y:3962,level:0,rotation:2},
        ],
        source: "https://oldschool.runescape.wiki/w/Chest_(10_coins)",
    },
    {
        locId: 11736, level: 28, xp: 25,
        loot: [{ itemId: 561, quantity: 1 }, { itemId: 995, quantity: 3 }], respawnTicks: 25,
        openedId: 171,
        placements: [
            {x:2614,y:3314,level:1,rotation:0}, {x:2671,y:3301,level:1,rotation:1},
            {x:2668,y:3693,level:1,rotation:3}, {x:3042,y:3949,level:0,rotation:0},
        ],
        source: "https://oldschool.runescape.wiki/w/Chest_(nature_runes)",
    },
];

export type PicklockTile = { x: number; y: number };
export interface PicklockDoorSide {
    from: PicklockTile;
    to: PicklockTile;
    policy: "pick" | "free" | "blocked";
    evidence: string;
}
export interface PicklockDoorRoute {
    tile: PicklockTile;
    level: number;
    sides: readonly PicklockDoorSide[];
    rotation: number;
    openedId: number;
}
export interface PicklockDoorDefinition {
    locId: number;
    level: number;
    xp: number;
    lockpick: boolean;
    source: string;
    sidePolicy: "provisional-both-locked" | "needs-verified-route";
    routes?: readonly PicklockDoorRoute[];
}

const THIEVING_SOURCE = "https://oldschool.runescape.wiki/w/Thieving#Doors";
function door(locId: number, level: number, xp: number, lockpick = false): PicklockDoorDefinition {
    return { locId, level, xp, lockpick, source: THIEVING_SOURCE, sidePolicy: "needs-verified-route" };
}

function lockedRoute(x: number, y: number, level: number, rotation: number, openedId: number): PicklockDoorRoute {
    const [dx,dy] = [[-1,0],[0,1],[1,0],[0,-1]][rotation];
    const from = {x,y}, to = {x:x+dx,y:y+dy};
    const evidence = "rev237 mesh and exact real-map path roundtrip verified; both sides locked provisionally (free-exit rule unsourced)";
    return {tile:from,level,rotation,openedId,sides:[{from,to,policy:"pick",evidence},{from:to,to:from,policy:"pick",evidence}]};
}

// Requirement coverage is separate from physical-pair and per-spawn coverage.
// No free inside side is inferred from a name or wall rotation.
export const PICKLOCK_DOORS: readonly PicklockDoorDefinition[] = [
    door(3266, 1, 3), door(3268, 50, 3),
    { ...door(5501, 1, 4), sidePolicy: "needs-verified-route",
      source: "https://oldschool.runescape.wiki/w/Door_(H.A.M._Hideout_Jail)",
      routes:[{tile:{x:3183,y:9611},level:0,rotation:0,openedId:5502,sides:[
          {from:{x:3183,y:9611},to:{x:3182,y:9611},policy:"pick",
           evidence:"Wiki inside-only; rev237 enclosed east24-tile cell vs west73-tile corridor; exact path roundtrip verified"},
          {from:{x:3182,y:9611},to:{x:3183,y:9611},policy:"blocked",evidence:"Wiki prohibits picking from outside"},
      ]}] },
    { ...door(9565, 1, 4), sidePolicy: "needs-verified-route",
      source: "https://oldschool.runescape.wiki/w/Door_(Port_Sarim_jail)" },
    { ...door(11719, 1, 3.8), sidePolicy: "needs-verified-route", routes: [{
        tile: {x:2674,y:3305}, level:0, rotation:1, openedId:1536,
        sides: [
            {from:{x:2674,y:3305},to:{x:2674,y:3306},policy:"pick",evidence:"rev237 edge; entry requirement from Thieving wiki"},
            {from:{x:2674,y:3306},to:{x:2674,y:3305},policy:"pick",evidence:"Provisional locked exit: no verified free-exit source"},
        ],
    }] },
    { ...door(11720, 16, 15), sidePolicy: "needs-verified-route", routes: [{
        tile: {x:2674,y:3304}, level:0, rotation:3, openedId:1536,
        sides: [
            {from:{x:2674,y:3304},to:{x:2674,y:3303},policy:"pick",evidence:"rev237 edge; entry requirement from Thieving wiki"},
            {from:{x:2674,y:3303},to:{x:2674,y:3304},policy:"pick",evidence:"Provisional locked exit: no verified free-exit source"},
        ],
    }] },
    door(11721, 31, 25), door(11722, 31, 25),
    {...door(11723, 46, 37.5),routes:[lockedRoute(2565,3356,0,0,1536)]},
    {...door(11724, 61, 50),routes:[lockedRoute(2572,3288,1,3,1544),lockedRoute(2572,3305,1,1,1544)]},
    door(11726, 23, 22.5, true),
    { ...door(11727, 39, 35, true), source: "https://oldschool.runescape.wiki/w/Door_(Pirates%27_Hideout)",
      routes:[lockedRoute(3038,3956,0,0,3271),lockedRoute(3041,3959,0,1,3271),lockedRoute(3044,3956,0,2,3271)] },
    {...door(11728, 82, 50, true),routes:[lockedRoute(2601,9482,0,3,3271)]}, door(34840, 57, 10),
];

export interface PicklockAuditGroup {
    ids: readonly number[];
    category: "door" | "chest" | "other";
    context: string;
    gap: string;
}

// Exhaustive for the checked-in option snapshot, not the live cache.
export const PICKLOCK_OPTION_AUDIT: readonly PicklockAuditGroup[] = [
    { ids: [3266, 3268], category: "door", context: "Underground Pass gates", gap: "Gate pair/shape and free-exit rules" },
    { ids: [4799, 4800], category: "door", context: "Ape Atoll jail", gap: "Quest/cell/guard state, routes and escape outcomes" },
    { ids: [5490], category: "door", context: "H.A.M. trapdoor (parent 5492)", gap: "HAM behavior retained; odds provisional" },
    { ids: [5501], category: "door", context: "H.A.M. jail", gap: "Inside-only exact route implemented; success/failure odds provisional" },
    { ids: [6848, 6850, 6853, 6883], category: "other", context: "Ogre coffins", gap: "Lock/open phases, loot, quest and failure mechanics" },
    { ids: [7246], category: "door", context: "Rogues' Den shortcut", gap: "80 Thieving; minigame skill drain and routes" },
    { ids: [9565], category: "door", context: "Port Sarim / Black Knights jail", gap: "Inside-only, per-spawn routes, F2P XP and escalating odds" },
    { ids: [11719, 11720, 11721, 11722, 11723, 11724, 11726, 11727, 11728], category: "door", context: "Classic locked doors", gap: "9 exact single-door routes implemented for11719/20/23/24/27/28;11721/22 paired gates and11726 visual pair unresolved; free-exit rules provisional" },
    { ids: [11725], category: "door", context: "Unresolved classic door", gap: "Do not alias to Ross's relocated house without evidence" },
    { ids: [13314, 13317, 13320, 13323, 13326, 13344, 13345, 13346, 13347, 13348, 13349], category: "door", context: "POH challenge doors", gap: "Housing owner/challenge/force state; only first five have catalog pairs" },
    { ids: [15755, 15759], category: "door", context: "H.A.M. storerooms", gap: "Quest state and doors" },
    { ids: [20948], category: "door", context: "Pyramid Plunder tomb door", gap: "Room levels, instance state and traps" },
    { ids: [22681, 22682, 22697, 22698], category: "chest", context: "Dorgesh-Kaan chest candidates", gap: "52/200 average and 78/650 rich; variant classification, complete loot and reset states unverified" },
    { ids: [27771, 27772, 27773, 27774, 27775, 27776], category: "other", context: "Stealing artefacts drawers", gap: "Activity assignment and artefact ownership" },
    { ids: [28783], category: "door", context: "Kruk's Dungeon", gap: "Monkey Madness II keys, route and poison failure" },
    { ids: [34429], category: "chest", context: "Molch stone chest", gap: "64/280; full loot weights and failure teleport destinations" },
    { ids: [34840], category: "door", context: "Grubby Door", gap: "57/10; physical pair and traversal" },
    { ids: [40178], category: "door", context: "Ardougne urban house candidate", gap: "Ross correlation, damage odds and route" },
    { ids: [40739, 41760, 41931], category: "chest", context: "Unresolved modern chests", gap: "Per-ID context, rewards, requirements and quest/minigame ownership" },
    { ids: [46592], category: "chest", context: "Secrets of the North dusty-scroll chest", gap: "Quest-only Mastermind puzzle, not random loot" },
    { ids: [48766, 49614], category: "chest", context: "Unresolved newer stone/chest objects", gap: "Context, puzzle/state and loot; do not alias 48766 to Molch" },
    { ids: [54365], category: "door", context: "Unresolved gate", gap: "Context, requirements and route" },
    { ids: [54773], category: "chest", context: "Unresolved newer chest", gap: "Context, requirements and full loot" },
    { ids: [58096], category: "door", context: "Cell door", gap: "Per-spawn jail/quest state, inside tiles and pair" },
    { ids: [60511, 60512, 60514, 60515, 60517, 60518], category: "chest", context: "Pirate chests", gap: "33/90, 54/122.5, 76/182.5 tier candidates; island variants, loot and failures unverified" },
];

export function normalizePicklockOption(option?: string): string {
    return (option ?? "").trim().toLowerCase().replace(/^pick[- ]?lock$/, "picklock");
}
