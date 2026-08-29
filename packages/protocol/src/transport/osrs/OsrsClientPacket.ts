/**
 * Client-to-server packet IDs for the OSRS action stream.
 *
 * This registry is consumed by the client's PacketWriter and the server's PacketHandler.
 * It is independent from the project-specific message stream in transport/messages.
 * Names follow OSRS conventions: IF_BUTTON for widget clicks,
 * OPNPC/OPLOC/OPOBJ for entity interactions, etc.
 *
 * Length values:
 *   >= 0: Fixed length packet
 *   -1: Variable length (1 byte size prefix)
 *   -2: Variable length (2 byte size prefix)
 */

export enum OsrsClientPacketId {
    // Widget drag
    IF_BUTTOND = 1, // Widget drag to widget (16 bytes)

    // Widget target on location
    OPLOC_T = 2, // Widget target on location (15 bytes)

    // Player options
    OPPLAYER5 = 6, // Player option 5 (3 bytes)
    OPPLAYER7 = 10, // Player option 7 (3 bytes)
    OPPLAYER8 = 21, // Player option 8 (3 bytes)
    OPPLAYER1 = 44, // Player option 1 - Attack (3 bytes)
    OPPLAYER2 = 45, // Player option 2 - Trade (3 bytes)
    OPPLAYER3 = 46, // Player option 3 - Follow (3 bytes)
    OPPLAYER6 = 48, // Player option 6 (3 bytes)
    OPPLAYER4 = 73, // Player option 4 (3 bytes)
    OPPLAYER_T = 32, // Widget target on player (11 bytes)
    OPPLAYER_U = 65, // Item use on player (11 bytes)

    // NPC options
    EXAMINE_NPC = 9, // Examine NPC (2 bytes)
    OPNPC2 = 12, // NPC option 2 (3 bytes)
    OPNPC3 = 34, // NPC option 3 (3 bytes)
    OPNPC_U = 36, // Item use on NPC (11 bytes)
    OPNPC5 = 50, // NPC option 5 (3 bytes)
    OPNPC1 = 57, // NPC option 1 (3 bytes)
    OPNPC4 = 70, // NPC option 4 (3 bytes)
    OPNPC_T = 75, // Widget target on NPC (11 bytes)
    OPNPC1_ALT = 76, // NPC option 1 alt (3 bytes)

    // Interface buttons (widget clicks with slot/item data)
    IF_BUTTON6 = 11, // Interface button 6 (8 bytes)
    IF_BUTTON = 13, // Interface button - simple click (4 bytes)
    IF_BUTTON7 = 14, // Interface button 7 (8 bytes)
    IF_BUTTON8 = 19, // Interface button 8 (8 bytes)
    IF_BUTTON9 = 20, // Interface button 9 (8 bytes)
    IF_BUTTON1 = 23, // Interface button 1 (8 bytes)
    IF_BUTTON2 = 25, // Interface button 2 (8 bytes)
    IF_BUTTON3 = 31, // Interface button 3 (8 bytes)
    IF_BUTTON4 = 63, // Interface button 4 (8 bytes)
    IF_BUTTON5 = 69, // Interface button 5 (8 bytes)
    IF_BUTTON10 = 84, // Interface button 10 (8 bytes)
    IF_TRIGGEROPLOCAL = 30, // IF_TRIGGEROPLOCAL (var-short)
    IF_BUTTONT = 90, // Widget target on widget (16 bytes)
    IF_BUTTON_SUB = 89, // Interface button via op submenu (10 bytes)

    // Movement
    MOVE_GAMECLICK = 16, // Walk/Move (7 bytes)
    WORLD_MAP_CLICK = 105, // World map click (4 bytes, packed coord)

    // Location/Object options
    OPLOC1 = 96, // Loc option 1 (7 bytes)
    OPLOC2 = 28, // Loc option 2 (7 bytes)
    OPLOC4 = 38, // Loc option 4 (7 bytes)
    OPLOC3 = 42, // Loc option 3 (7 bytes)
    OPLOC5 = 51, // Loc option 5 (7 bytes)
    EXAMINE_LOC = 85, // Examine location (2 bytes)
    OPLOCU = 86, // Item use on loc (15 bytes)
    OPLOC_T_ALT = 94, // Widget target on ground item (15 bytes)

    // Ground item options
    OPOBJ2 = 43, // Ground item option 2 (7 bytes)
    OPOBJ4 = 56, // Ground item option 4 (7 bytes)
    OPOBJ_U = 79, // Item use on ground item (15 bytes)
    OPOBJ5 = 82, // Ground item option 5 (7 bytes)
    OPOBJ1 = 102, // Ground item option 1 - Take (7 bytes)
    OPOBJ3 = 103, // Ground item option 3 (7 bytes)
    EXAMINE_OBJ = 104, // Examine ground item (6 bytes)

    // Interface close
    IF_CLOSE = 55, // Close interface (0 bytes)

    // Player appearance
    // Submit player design / appearance selection (id=37, len=13)
    // Payload: gender (1), kits[7] (7), colors[5] (5)
    APPEARANCE_SET = 37,

    // Dialog
    RESUME_PAUSEBUTTON = 62, // Dialog continue (6 bytes)
}

/**
 * Packet length lookup table
 * -1 = variable byte, -2 = variable short
 */
export const OSRS_CLIENT_PACKET_LENGTHS: Record<number, number> = {
    [OsrsClientPacketId.IF_BUTTOND]: 16,
    [OsrsClientPacketId.OPLOC_T]: 15,
    [OsrsClientPacketId.OPPLAYER5]: 3,
    [OsrsClientPacketId.EXAMINE_NPC]: 2,
    [OsrsClientPacketId.OPPLAYER7]: 3,
    [OsrsClientPacketId.IF_BUTTON6]: 8,
    [OsrsClientPacketId.OPNPC2]: 3,
    [OsrsClientPacketId.IF_BUTTON]: 4,
    [OsrsClientPacketId.IF_BUTTON7]: 8,
    [OsrsClientPacketId.MOVE_GAMECLICK]: 7,
    [OsrsClientPacketId.WORLD_MAP_CLICK]: 4,
    [OsrsClientPacketId.IF_BUTTON8]: 8,
    [OsrsClientPacketId.IF_BUTTON9]: 8,
    [OsrsClientPacketId.OPPLAYER8]: 3,
    [OsrsClientPacketId.IF_BUTTON1]: 8,
    [OsrsClientPacketId.IF_BUTTON2]: 8,
    [OsrsClientPacketId.OPLOC1]: 7,
    [OsrsClientPacketId.OPLOC2]: 7,
    [OsrsClientPacketId.IF_BUTTON3]: 8,
    [OsrsClientPacketId.OPPLAYER_T]: 11,
    [OsrsClientPacketId.OPNPC3]: 3,
    [OsrsClientPacketId.OPNPC_U]: 11,
    [OsrsClientPacketId.OPLOC4]: 7,
    [OsrsClientPacketId.OPLOC3]: 7,
    [OsrsClientPacketId.OPOBJ2]: 7,
    [OsrsClientPacketId.OPPLAYER1]: 3,
    [OsrsClientPacketId.OPPLAYER2]: 3,
    [OsrsClientPacketId.OPPLAYER3]: 3,
    [OsrsClientPacketId.OPPLAYER6]: 3,
    [OsrsClientPacketId.OPNPC5]: 3,
    [OsrsClientPacketId.APPEARANCE_SET]: 13,
    [OsrsClientPacketId.OPLOC5]: 7,
    [OsrsClientPacketId.IF_CLOSE]: 0,
    [OsrsClientPacketId.OPOBJ4]: 7,
    [OsrsClientPacketId.OPNPC1]: 3,
    [OsrsClientPacketId.RESUME_PAUSEBUTTON]: 6,
    [OsrsClientPacketId.IF_BUTTON4]: 8,
    [OsrsClientPacketId.OPPLAYER_U]: 11,
    [OsrsClientPacketId.IF_BUTTON5]: 8,
    [OsrsClientPacketId.OPNPC4]: 3,
    [OsrsClientPacketId.OPPLAYER4]: 3,
    [OsrsClientPacketId.OPNPC_T]: 11,
    [OsrsClientPacketId.OPNPC1_ALT]: 3,
    [OsrsClientPacketId.OPOBJ_U]: 15,
    [OsrsClientPacketId.OPOBJ5]: 7,
    [OsrsClientPacketId.IF_BUTTON10]: 8,
    [OsrsClientPacketId.IF_TRIGGEROPLOCAL]: -2,
    [OsrsClientPacketId.EXAMINE_LOC]: 2,
    [OsrsClientPacketId.EXAMINE_OBJ]: 6,
    [OsrsClientPacketId.OPLOCU]: 15,
    [OsrsClientPacketId.IF_BUTTONT]: 16,
    [OsrsClientPacketId.IF_BUTTON_SUB]: 10,
    [OsrsClientPacketId.OPLOC_T_ALT]: 15,
    [OsrsClientPacketId.OPOBJ1]: 7,
    [OsrsClientPacketId.OPOBJ3]: 7,
};

/**
 * Get packet length by ID
 */
export function getOsrsClientPacketLength(id: OsrsClientPacketId): number {
    return OSRS_CLIENT_PACKET_LENGTHS[id] ?? -1;
}

/**
 * Check if packet has variable length
 */
export function isOsrsClientPacketVariableLength(id: OsrsClientPacketId): boolean {
    const len = OSRS_CLIENT_PACKET_LENGTHS[id];
    return len === -1 || len === -2;
}

/**
 * Check if packet uses 2-byte length prefix
 */
export function isOsrsClientPacketVariableShort(id: OsrsClientPacketId): boolean {
    return OSRS_CLIENT_PACKET_LENGTHS[id] === -2;
}
