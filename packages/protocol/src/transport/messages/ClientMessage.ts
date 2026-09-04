/**
 * Client-to-server IDs for August's project-specific binary message stream.
 *
 * The ClientBinaryEncoder/ClientBinaryDecoder pair uses this registry for high-level
 * application messages that replaced JSON payloads. It is independent from the OSRS action
 * packets in transport/osrs and occupies the one-byte range 180-255.
 */
export const enum ClientMessageId {
    // ========================================
    // CORE PROTOCOL (200-209)
    // ========================================
    HELLO = 200,
    PING = 201,
    HANDSHAKE = 202,
    LOGOUT = 203,
    LOGIN = 204,

    // ========================================
    // MOVEMENT (210-219)
    // ========================================
    WALK = 210,
    FACE = 211,
    TELEPORT = 212,
    PATHFIND = 213,

    // ========================================
    // INTERACTION (230-239)
    // ========================================
    LOC_INTERACT = 231,
    GROUND_ITEM_ACTION = 232,
    INTERACT = 233,
    INTERACT_STOP = 234,

    // ========================================
    // INVENTORY (240-249)
    // ========================================
    INVENTORY_USE = 240,
    INVENTORY_USE_ON = 241,
    INVENTORY_MOVE = 242,
    BANK_DEPOSIT_INVENTORY = 243,
    BANK_DEPOSIT_EQUIPMENT = 244,
    BANK_MOVE = 245,
    ITEM_SPAWNER_SEARCH = 246,

    // ========================================
    // WIDGETS/UI (250-254)
    // The opcode 250 used to conflict with DEBUG, moved to 255
    // ========================================
    WIDGET = 250,
    WIDGET_ACTION = 251,
    RESUME_PAUSEBUTTON = 252,
    IF_BUTTOND = 253,
    EMOTE = 254,

    // ========================================
    // DEBUG (255 - special)
    // ========================================
    DEBUG = 255,

    // ========================================
    // TRADE (180-189) - moved to avoid 250 range
    // ========================================
    TRADE_ACTION = 180,

    // ========================================
    // CHAT/VARPS (190-199)
    // ========================================
    CHAT = 190,
    VARP_TRANSMIT = 191,
    RESUME_COUNTDIALOG = 192,
    RESUME_NAMEDIALOG = 193,
    RESUME_STRINGDIALOG = 194,
    MAP_EDIT = 195,
    FRIENDS_CHAT_ACTION = 196,
    CLIENT_SETTING = 197,
}

/**
 * Packet length constants
 * -1 = variable byte (1 byte length prefix)
 * -2 = variable short (2 byte length prefix)
 * positive = fixed length
 */
export const CLIENT_MESSAGE_LENGTHS: Record<ClientMessageId, number> = {
    [ClientMessageId.HELLO]: -1,
    [ClientMessageId.PING]: 4, // time(4)
    [ClientMessageId.HANDSHAKE]: -1,
    [ClientMessageId.LOGOUT]: 0,
    [ClientMessageId.LOGIN]: -2, // username + password (variable)

    [ClientMessageId.WALK]: 5, // x(2) + y(2) + flags(1)
    [ClientMessageId.FACE]: -1,
    [ClientMessageId.TELEPORT]: 5, // x(2) + y(2) + level(1)
    [ClientMessageId.PATHFIND]: -1,

    [ClientMessageId.LOC_INTERACT]: -1,
    [ClientMessageId.GROUND_ITEM_ACTION]: -1,
    [ClientMessageId.INTERACT]: -1,
    [ClientMessageId.INTERACT_STOP]: 0,

    [ClientMessageId.INVENTORY_USE]: -1,
    [ClientMessageId.INVENTORY_USE_ON]: -1,
    [ClientMessageId.INVENTORY_MOVE]: 4, // from(2) + to(2)

    [ClientMessageId.BANK_DEPOSIT_INVENTORY]: 0,
    [ClientMessageId.BANK_DEPOSIT_EQUIPMENT]: 0,
    [ClientMessageId.BANK_MOVE]: -1,
    [ClientMessageId.ITEM_SPAWNER_SEARCH]: -1,

    [ClientMessageId.WIDGET]: -1,
    [ClientMessageId.WIDGET_ACTION]: -1,
    [ClientMessageId.RESUME_PAUSEBUTTON]: 6, // widgetId(4) + childIndex(2)
    [ClientMessageId.IF_BUTTOND]: 16, // target item(2) + target widget(4) + source item(2) + source slot(2) + source widget(4) + target slot(2)
    [ClientMessageId.EMOTE]: 3, // index(2) + loop(1)

    [ClientMessageId.TRADE_ACTION]: -1,

    [ClientMessageId.CHAT]: -1,
    [ClientMessageId.VARP_TRANSMIT]: 6, // varpId(2) + value(4)
    [ClientMessageId.CLIENT_SETTING]: 2, // setting(1) + value(1)
    [ClientMessageId.RESUME_COUNTDIALOG]: 4, // value(4)
    [ClientMessageId.RESUME_NAMEDIALOG]: -1, // value(string)
    [ClientMessageId.RESUME_STRINGDIALOG]: -1, // value(string)
    [ClientMessageId.MAP_EDIT]: -1, // action(1) + tile(4) + level/type/rotation/id(var)
    [ClientMessageId.FRIENDS_CHAT_ACTION]: -1,

    [ClientMessageId.DEBUG]: -2,
};

/** Select the project message decoder for a valid one-byte client opcode. */
export function isClientMessageId(opcode: number): boolean {
    return (
        Number.isInteger(opcode) &&
        opcode >= 0 &&
        opcode <= 0xff &&
        CLIENT_MESSAGE_LENGTHS[opcode as ClientMessageId] !== undefined
    );
}
