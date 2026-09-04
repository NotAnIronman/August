export interface FollowerVariantDefinition {
    npcTypeId: number;
}

export interface FollowerItemDefinition {
    itemId: number;
    npcTypeId: number;
    variants?: readonly FollowerVariantDefinition[];
}

export const LIL_CREATOR_ITEM_ID = 25348;
export const LIL_CREATOR_NPC_TYPE_ID = 3566;
export const LIL_DESTRUCTOR_NPC_TYPE_ID = 5008;

type FollowerItemDefinitionGroup = readonly [
    npcTypeId: number,
    itemIds: readonly number[],
];

function createFollowerItemDefinitions(
    groups: readonly FollowerItemDefinitionGroup[],
): FollowerItemDefinition[] {
    return groups.flatMap(([npcTypeId, itemIds]) =>
        itemIds.map((itemId) => ({ itemId, npcTypeId })),
    );
}

/**
 * Cache-backed pet inventory forms. The item and NPC names are not reliably
 * identical (for example, boss pets use their "Jr." NPC types), so keep this
 * mapping explicit rather than guessing from display names at runtime.
 *
 * Multiple item ids in a group are cache variants of the same pet. They share
 * its base NPC form for now; individual metamorph appearances can be added as
 * follower variants without changing the drop/summon flow.
 */
const PET_FOLLOWER_ITEM_DEFINITIONS = createFollowerItemDefinitions([
    // Revision 237: kitten, grown, and overgrown inventory forms, in colour order.
    [5591, [1555]],
    [5592, [1556]],
    [5593, [1557]],
    [5594, [1558]],
    [5595, [1559]],
    [5596, [1560]],
    [1619, [1561]],
    [1620, [1562]],
    [1621, [1563]],
    [1622, [1564]],
    [1623, [1565]],
    [1624, [1566]],
    [5598, [1567]],
    [5599, [1568]],
    [5600, [1569]],
    [5601, [1570]],
    [5602, [1571]],
    [5603, [1572]],
    [2055, [11995]], // Chaos Elemental Jr.
    [6626, [12643]], // Dagannoth Supreme Jr.
    [6627, [12644]], // Dagannoth Prime Jr.
    [6630, [12645]], // Dagannoth Rex Jr.
    [6635, [12646]], // Baby Mole
    [6637, [12647, 12654]], // Kalphite Princess
    [6639, [12648, 22663]], // Smoke Devil
    [6631, [12649]], // Kree'arra Jr.
    [6632, [12650]], // General Graardor Jr.
    [6633, [12651]], // Zilyana Jr.
    [6634, [12652]], // K'ril Tsutsaroth Jr.
    [6636, [12653]], // Prince Black Dragon
    [6640, [12655]], // Kraken
    [6642, [12703]], // Penance Pet
    [318, [12816]], // Dark Core
    [2127, [12921, 12939, 12940]], // Snakeling
    [4001, [13071]], // Chompy Chick
    [495, [13177, 27648]], // Venenatis Spiderling
    [497, [13178, 27649]], // Callisto Cub
    [5536, [13179, 13180, 27650, 27651]], // Vet'ion Jr.
    [5547, [13181]], // Scorpia's Offspring
    [5892, [13225]], // TzRek-Jad
    [964, [13247]], // Hellpuppy
    [5883, [13262]], // Abyssal Orphan
    [6715, [13320]], // Heron
    [
        2182,
        [
            13321, 21187, 21188, 21189, 21190, 21191, 21192, 21193, 21194, 21195, 21196,
            21197, 21340, 21358, 21359, 21360, 31276, 31277, 31278,
        ],
    ], // Rock Golem
    [
        12169,
        [13322, 28229, 28230, 28231, 28232, 28233, 28234, 28235, 28236, 28237, 31279, 31280, 31281, 31282],
    ], // Beaver
    [6718, [13323, 13324, 13325, 13326]], // Baby Chinchompa
    [6296, [19730]], // Bloodhound
    [7334, [20659]], // Giant Squirrel
    [
        7335,
        [20661, 24555, 24556, 24557, 24558, 24559, 24560, 24561, 24562, 24563, 24564],
    ], // Tangleroot
    [7336, [20663]], // Rocky
    [
        7337,
        [
            20665, 20667, 20669, 20671, 20673, 20675, 20677, 20679, 20681, 20683, 20685,
            20687, 20689, 20691, 21990, 21991,
        ],
    ], // Rift Guardian
    [3077, [20693, 24483, 24484, 24485, 24486]], // Phoenix
    [7519, [20851]], // Olmlet
    [425, [21273]], // Skotos
    [7674, [21291]], // Jal-Nib-Rek
    [7759, [21509, 21510]], // Herbi
    [7891, [21748, 21749]], // Noon
    [7890, [21750, 21751]], // Midnight
    [8025, [21992, 21993]], // Vorki
    [8008, [22318]], // Corporeal Critter
    [8009, [22319]], // TzRek-Zuk
    [8196, [22376, 22377]], // Puppadile
    [8197, [22378, 22379]], // Tektiny
    [8198, [22380, 22381]], // Vanguard
    [8199, [22382, 22383]], // Vasa Minirio
    [8200, [22384, 22385]], // Vespina
    [8336, [22473, 22474]], // Lil' Zik
    [8492, [22746, 22747, 22748, 22749, 22750, 22751, 22752, 22753]], // Ikkle Hydra
    [2143, [23495, 23496, 25842, 25843]], // Sraracha
    [8729, [23757, 23758]], // Youngllef
    [8730, [23759]], // Corrupted Youngllef
    [8731, [23760, 23761]], // Smolcano
    [9398, [24491, 24492]], // Little Nightmare
    [9511, [24656, 24657]], // Enraged Tektiny
    [9512, [24658, 24659]], // Flying Vespina
    [9637, [24701]], // Dark Squirrel
    [9850, [24847, 24848]], // Red
    [9851, [24849, 24850]], // Ziggy
    [10620, [25519, 25520]], // JalRek-Jad
    [6817, [25600, 25601]], // Great Blue Heron
    [10562, [25602, 25603]], // Tiny Tempor
    [10650, [25613, 25614]], // Baby Mole-Rat
    [10761, [25748]], // Lil' Maiden
    [10762, [25749]], // Lil' Bloat
    [10763, [25750]], // Lil' Nylo
    [10764, [25751]], // Lil' Sot
    [10765, [25752]], // Lil' Xarp
    [8183, [25836]], // Little Parasite
    [11276, [26348, 26349]], // Nexling
    [11401, [26899, 26900]], // Greatish Guardian
    [11402, [26901, 26902]], // Abyssal Protector
    [11652, [27352, 27353]], // Tumeken's Guardian
    [11653, [27354]], // Elidinis' Guardian
    [11840, [27382]], // Akkhito
    [11841, [27383]], // Babi
    [11842, [27384]], // Kephriti
    [11843, [27385]], // Zebo
    [11844, [27386]], // Tumeken's Damaged Guardian
    [11845, [27387]], // Elidinis' Damaged Guardian
    [12005, [27590, 27591, 27592, 27593]], // Muphin
    [12153, [28246, 28247]], // Wisp
    [12154, [28248, 28249]], // Butch
    [12155, [28250, 28251]], // Baron
    [12156, [28252, 28253]], // Lil'viathan
    [12547, [28669]], // Pheasant
    [12548, [28670]], // Fox
    [7219, [28801, 28802]], // Scurry
    [12767, [28960, 28961]], // Smol Heredit
    [12768, [28962, 28963]], // Quetzin
    [13518, [29519, 29520]], // Broav
    [13681, [29836, 29837]], // Nid
    [13682, [29838, 29839]], // Rax
    [14032, [30151]], // Bone Squirrel
    [14033, [30152, 30153]], // Huberte
    [14034, [30154, 30155]], // Moxi
    [10476, [30622, 30623]], // Bran
    [12592, [30624, 30625]], // Ric
    [14203, [30888, 30889]], // Yami
    [14519, [31130, 31131]], // Dom
    [14815, [31225, 31226]], // Spooky Chair
    [14930, [31283, 31284]], // Soup
    [14931, [31285, 31286]], // Gull
    [14932, [31287]], // Gulliver
    [15050, [31331, 31332]], // Mayor of Catherby
    [6657, [3695]], // Pet Rock
]);

export const FOLLOWER_ITEM_DEFINITIONS: readonly FollowerItemDefinition[] = [
    ...PET_FOLLOWER_ITEM_DEFINITIONS,
    {
        itemId: LIL_CREATOR_ITEM_ID,
        npcTypeId: LIL_CREATOR_NPC_TYPE_ID,
        variants: [
            {
                npcTypeId: LIL_CREATOR_NPC_TYPE_ID,
            },
            {
                npcTypeId: LIL_DESTRUCTOR_NPC_TYPE_ID,
            },
        ],
    },
];

const followerByItemId = new Map<number, FollowerItemDefinition>(
    FOLLOWER_ITEM_DEFINITIONS.map((definition) => [definition.itemId, definition]),
);
const followerByNpcTypeId = new Map<number, FollowerItemDefinition>();

for (const definition of FOLLOWER_ITEM_DEFINITIONS) {
    followerByNpcTypeId.set(definition.npcTypeId, definition);
    for (const variant of definition.variants ?? []) {
        followerByNpcTypeId.set(variant.npcTypeId, definition);
    }
}

export function getFollowerDefinitionByItemId(itemId: number): FollowerItemDefinition | undefined {
    return followerByItemId.get(itemId | 0);
}

export function getFollowerDefinitionByNpcTypeId(
    npcTypeId: number,
): FollowerItemDefinition | undefined {
    return followerByNpcTypeId.get(npcTypeId | 0);
}

export function getFollowerVariant(
    definition: FollowerItemDefinition,
    npcTypeId: number,
): FollowerVariantDefinition | undefined {
    return (definition.variants ?? []).find((variant) => variant.npcTypeId === (npcTypeId | 0));
}

export function getDefaultFollowerVariant(
    definition: FollowerItemDefinition,
): FollowerVariantDefinition {
    return (
        getFollowerVariant(definition, definition.npcTypeId) ?? {
            npcTypeId: definition.npcTypeId,
        }
    );
}
