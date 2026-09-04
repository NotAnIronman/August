/**
 * Server-to-client IDs for August's project-specific binary message stream.
 *
 * ServerBinaryEncoder and ServerBinaryDecoder share this registry. These messages replaced
 * JSON payloads and are not part of the OSRS action-packet registry.
 */
export const enum ServerMessageId {
    // ========================================
    // CORE PROTOCOL (0-19)
    // ========================================
    WELCOME = 0,
    TICK = 1,
    HANDSHAKE = 2,
    LOGIN_RESPONSE = 3,
    LOGOUT_RESPONSE = 4,
    PATH_RESPONSE = 5,

    // ========================================
    // PLAYER/NPC SYNC (20-39)
    // ========================================
    PLAYER_SYNC = 20,
    NPC_INFO = 21,
    ANIM = 22,

    // ========================================
    // VARPS/VARBITS (40-49)
    // ========================================
    VARP_SMALL = 40, // varp with value 0-255
    VARP_LARGE = 41, // varp with value outside byte range
    VARBIT = 42,
    VARP_BATCH = 43, // multiple varps in one packet

    // ========================================
    // INVENTORY/ITEMS (50-69)
    // ========================================
    INVENTORY_SNAPSHOT = 50,
    INVENTORY_SLOT = 51,
    BANK_SNAPSHOT = 52,
    BANK_SLOT = 53,
    GROUND_ITEMS = 54,
    GROUND_ITEMS_DELTA = 55,

    // ========================================
    // SKILLS (70-79)
    // ========================================
    SKILLS_SNAPSHOT = 70,
    SKILLS_DELTA = 71,

    // ========================================
    // COMBAT/EFFECTS (80-99)
    // ========================================
    COMBAT_STATE = 80,
    RUN_ENERGY = 81,
    HITSPLAT = 82,
    SPOT_ANIM = 83,
    PROJECTILES = 84,
    SPELL_RESULT = 85,
    DEBUG_PACKET = 86,
    DESTINATION = 87,

    // ========================================
    // INTERFACES/WIDGETS (100-119)
    // ========================================
    WIDGET_OPEN = 100,
    WIDGET_CLOSE = 101,
    WIDGET_SET_ROOT = 102,
    WIDGET_OPEN_SUB = 103,
    WIDGET_CLOSE_SUB = 104,
    WIDGET_SET_TEXT = 105,
    WIDGET_SET_HIDDEN = 106,
    WIDGET_SET_ITEM = 107,
    WIDGET_SET_NPC_HEAD = 108,
    WIDGET_SET_FLAGS_RANGE = 109,
    WIDGET_RUN_SCRIPT = 110,
    WIDGET_SET_FLAGS = 111,
    WIDGET_SET_TRANSPARENCY = 112,
    WIDGET_SET_ANIMATION = 114,
    WIDGET_SET_PLAYER_HEAD = 115,
    WIDGET_SET_QUEST_LIST = 116,
    WIDGET_SET_SPRITE = 117,
    WIDGET_SET_BOSS_HEALTH_BAR = 118,

    // ========================================
    // CHAT/MESSAGES (120-129)
    // ========================================
    CHAT_MESSAGE = 120,
    FRIENDS_CHAT_UPDATE = 121,

    // ========================================
    // WORLD UPDATES (130-149)
    // ========================================
    LOC_CHANGE = 130,
    LOC_ADD_CHANGE = 134,
    LOC_DEL = 135,
    LOC_ANIM = 136,
    CAMERA_CONTROL = 137,
    SOUND = 131,
    PLAY_JINGLE = 132,
    PLAY_SONG = 133,
    REBUILD_REGION = 140,
    REBUILD_NORMAL = 141,
    REBUILD_WORLDENTITY = 142,
    WORLDENTITY_INFO = 143,

    // ========================================
    // SHOP/TRADE (150-169)
    // ========================================
    SHOP_OPEN = 150,
    SHOP_SLOT = 151,
    SHOP_CLOSE = 152,
    SHOP_MODE = 153,
    TRADE_REQUEST = 154,
    TRADE_OPEN = 155,
    TRADE_UPDATE = 156,
    TRADE_CLOSE = 157,

    // ========================================
    // SCRIPTS (170-179)
    // ========================================
    RUN_CLIENT_SCRIPT = 170,

    // ========================================
    // SMITHING (180-189)
    // ========================================
    SMITHING_OPEN = 180,
    SMITHING_MODE = 181,
    SMITHING_CLOSE = 182,

    // ========================================
    // COLLECTION LOG (190-199)
    // ========================================
    COLLECTION_LOG_SNAPSHOT = 190,
    COLLECTION_LOG_CATEGORY_COMPLETION = 191,

    // ========================================
    // NOTIFICATIONS (200-209)
    // ========================================
    NOTIFICATION = 200,

    // ========================================
    // GAMEMODE (210-219)
    // ========================================
    GAMEMODE_DATA = 210,

    // ========================================
    // DEBUG (250-255)
    // ========================================
    DEBUG = 250,
}

/**
 * Packet length constants
 * -1 = variable byte (1 byte length prefix)
 * -2 = variable short (2 byte length prefix)
 * positive = fixed length
 */
export const SERVER_MESSAGE_LENGTHS: Record<ServerMessageId, number> = {
    [ServerMessageId.WELCOME]: 8, // tickMs(4) + serverTime(4)
    [ServerMessageId.TICK]: 8, // tick(4) + time(4)
    [ServerMessageId.HANDSHAKE]: -1,
    [ServerMessageId.LOGIN_RESPONSE]: -1,
    [ServerMessageId.LOGOUT_RESPONSE]: -1,
    [ServerMessageId.PATH_RESPONSE]: -1,

    [ServerMessageId.PLAYER_SYNC]: -2,
    [ServerMessageId.NPC_INFO]: -2,
    [ServerMessageId.ANIM]: 22, // 11 shorts for animation IDs

    [ServerMessageId.VARP_SMALL]: 3, // varpId(2) + value(1)
    [ServerMessageId.VARP_LARGE]: 6, // varpId(2) + value(4)
    [ServerMessageId.VARBIT]: 6, // varbitId(2) + value(4)
    [ServerMessageId.VARP_BATCH]: -1,

    [ServerMessageId.INVENTORY_SNAPSHOT]: -2,
    // Quantity is encoded OSRS-style: 1 byte, or 255 + int (variable length).
    [ServerMessageId.INVENTORY_SLOT]: -1,
    [ServerMessageId.BANK_SNAPSHOT]: -2,
    [ServerMessageId.BANK_SLOT]: -1,
    [ServerMessageId.GROUND_ITEMS]: -2,
    [ServerMessageId.GROUND_ITEMS_DELTA]: -2,

    [ServerMessageId.SKILLS_SNAPSHOT]: -1,
    [ServerMessageId.SKILLS_DELTA]: -1,

    [ServerMessageId.COMBAT_STATE]: -1,
    [ServerMessageId.RUN_ENERGY]: 2, // percent(1) + running(1)
    [ServerMessageId.HITSPLAT]: -1,
    [ServerMessageId.SPOT_ANIM]: -1,
    [ServerMessageId.PROJECTILES]: -2,
    [ServerMessageId.SPELL_RESULT]: -2,
    [ServerMessageId.DEBUG_PACKET]: -2,
    [ServerMessageId.DESTINATION]: 4, // worldX(2) + worldY(2)

    [ServerMessageId.WIDGET_OPEN]: 3, // groupId(2) + modal(1)
    [ServerMessageId.WIDGET_CLOSE]: 2, // groupId(2)
    [ServerMessageId.WIDGET_SET_ROOT]: 2, // groupId(2)
    // Custom open_sub payload can include initial varp/varbit/hidden UID state.
    [ServerMessageId.WIDGET_OPEN_SUB]: -2,
    [ServerMessageId.WIDGET_CLOSE_SUB]: 4, // targetUid(4)
    [ServerMessageId.WIDGET_SET_TEXT]: -2,
    [ServerMessageId.WIDGET_SET_HIDDEN]: 5, // uid(4) + hidden(1)
    [ServerMessageId.WIDGET_SET_ITEM]: 10, // uid(4) + itemId(2) + quantity(4)
    [ServerMessageId.WIDGET_SET_NPC_HEAD]: 6, // uid(4) + npcId(2)
    [ServerMessageId.WIDGET_SET_FLAGS_RANGE]: 12, // uid(4) + fromSlot(2) + toSlot(2) + flags(4)
    [ServerMessageId.WIDGET_RUN_SCRIPT]: -2, // scriptId(4) + args (variable)
    [ServerMessageId.WIDGET_SET_FLAGS]: 8, // uid(4) + flags(4)
    [ServerMessageId.WIDGET_SET_TRANSPARENCY]: 5, // uid(4) + transparency(1)
    [ServerMessageId.WIDGET_SET_ANIMATION]: 6, // uid(4) + animId(2)
    [ServerMessageId.WIDGET_SET_PLAYER_HEAD]: 4, // uid(4)
    [ServerMessageId.WIDGET_SET_QUEST_LIST]: -2,
    [ServerMessageId.WIDGET_SET_SPRITE]: 28, // uid(4) + archiveId(4) + frame(4) + x(4) + y(4) + width(4) + height(4), -1 = unchanged
    // active(1), then identity/health/name and marker[percent basis points/style/label].
    [ServerMessageId.WIDGET_SET_BOSS_HEALTH_BAR]: -2,

    [ServerMessageId.CHAT_MESSAGE]: -1,
    [ServerMessageId.FRIENDS_CHAT_UPDATE]: -2,

    [ServerMessageId.LOC_CHANGE]: -1,
    [ServerMessageId.LOC_ADD_CHANGE]: -1,
    [ServerMessageId.LOC_DEL]: -1,
    [ServerMessageId.LOC_ANIM]: 10, // locId(2) + x(2) + y(2) + level(1) + shape/rot(1) + animId(2)
    [ServerMessageId.CAMERA_CONTROL]: -1,
    [ServerMessageId.SOUND]: -1,
    [ServerMessageId.PLAY_JINGLE]: 5, // jingleId(2) + delay(3, IME)
    // Music fade params: trackId, outDelay, outDur, inDelay, inDur
    [ServerMessageId.PLAY_SONG]: 10, // trackId(2) + outDelay(2) + outDur(2) + inDelay(2) + inDur(2)

    [ServerMessageId.REBUILD_REGION]: -2,
    [ServerMessageId.REBUILD_NORMAL]: -2,
    [ServerMessageId.REBUILD_WORLDENTITY]: -2,
    [ServerMessageId.WORLDENTITY_INFO]: -1, // count(1) + per-entity updates + new spawns

    [ServerMessageId.SHOP_OPEN]: -2,
    [ServerMessageId.SHOP_SLOT]: -1,
    [ServerMessageId.SHOP_CLOSE]: 0,
    [ServerMessageId.SHOP_MODE]: -1,
    [ServerMessageId.TRADE_REQUEST]: -1,
    [ServerMessageId.TRADE_OPEN]: -2,
    [ServerMessageId.TRADE_UPDATE]: -2,
    [ServerMessageId.TRADE_CLOSE]: -1,

    [ServerMessageId.RUN_CLIENT_SCRIPT]: -2,

    [ServerMessageId.SMITHING_OPEN]: -2, // mode(1) + title(var) + options(var) + quantityMode(1) + customQuantity(4)
    [ServerMessageId.SMITHING_MODE]: 5, // quantityMode(1) + customQuantity(4)
    [ServerMessageId.SMITHING_CLOSE]: 0,

    [ServerMessageId.COLLECTION_LOG_SNAPSHOT]: -2, // count(2) + slots(var)
    [ServerMessageId.COLLECTION_LOG_CATEGORY_COMPLETION]: -2, // tabCount(1) + per-tab[tabIndex(1) + categoryCount(2) + flags(var)]

    [ServerMessageId.NOTIFICATION]: -1, // kind(1) + title(var) + message(var) + itemId(2) + quantity(4) + durationMs(2)

    [ServerMessageId.GAMEMODE_DATA]: -2,

    [ServerMessageId.DEBUG]: -2,
};
