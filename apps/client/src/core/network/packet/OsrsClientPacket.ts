/** Client facade for the shared OSRS action-packet registry. */
import { OsrsClientPacketId } from "@august/protocol/transport/osrs/OsrsClientPacket";

export {
    OsrsClientPacketId,
    OSRS_CLIENT_PACKET_LENGTHS,
    getOsrsClientPacketLength,
    isOsrsClientPacketVariableLength,
    isOsrsClientPacketVariableShort,
} from "@august/protocol/transport/osrs/OsrsClientPacket";

/**
 * Semantic packet type aliases for clearer code
 */
export const OsrsClientPacket = {
    // Location/Object interactions
    OPLOC1: OsrsClientPacketId.OPLOC1,
    OPLOC2: OsrsClientPacketId.OPLOC2,
    OPLOC3: OsrsClientPacketId.OPLOC3,
    OPLOC4: OsrsClientPacketId.OPLOC4,
    OPLOC5: OsrsClientPacketId.OPLOC5,
    OPLOC_T: OsrsClientPacketId.OPLOC_T,
    OPLOC_T_ALT: OsrsClientPacketId.OPLOC_T_ALT,

    // NPC interactions
    OPNPC1: OsrsClientPacketId.OPNPC1,
    OPNPC1_ALT: OsrsClientPacketId.OPNPC1_ALT,
    OPNPC2: OsrsClientPacketId.OPNPC2,
    OPNPC3: OsrsClientPacketId.OPNPC3,
    OPNPC4: OsrsClientPacketId.OPNPC4,
    OPNPC5: OsrsClientPacketId.OPNPC5,
    OPNPC_T: OsrsClientPacketId.OPNPC_T,
    OPNPC_U: OsrsClientPacketId.OPNPC_U,
    EXAMINE_NPC: OsrsClientPacketId.EXAMINE_NPC,

    // Player interactions
    OPPLAYER1: OsrsClientPacketId.OPPLAYER1,
    OPPLAYER2: OsrsClientPacketId.OPPLAYER2,
    OPPLAYER3: OsrsClientPacketId.OPPLAYER3,
    OPPLAYER4: OsrsClientPacketId.OPPLAYER4,
    OPPLAYER5: OsrsClientPacketId.OPPLAYER5,
    OPPLAYER6: OsrsClientPacketId.OPPLAYER6,
    OPPLAYER7: OsrsClientPacketId.OPPLAYER7,
    OPPLAYER8: OsrsClientPacketId.OPPLAYER8,
    OPPLAYER_T: OsrsClientPacketId.OPPLAYER_T,
    OPPLAYER_U: OsrsClientPacketId.OPPLAYER_U,

    // Ground item interactions
    OPOBJ1: OsrsClientPacketId.OPOBJ1,
    OPOBJ2: OsrsClientPacketId.OPOBJ2,
    OPOBJ3: OsrsClientPacketId.OPOBJ3,
    OPOBJ4: OsrsClientPacketId.OPOBJ4,
    OPOBJ5: OsrsClientPacketId.OPOBJ5,
    OPOBJ_T: OsrsClientPacketId.OPLOC_T_ALT,
    OPOBJ_U: OsrsClientPacketId.OPOBJ_U,

    // Use-on aliases
    OPLOCU: OsrsClientPacketId.OPLOCU,
    OPLOCT: OsrsClientPacketId.OPLOC_T,
    OPNPCU: OsrsClientPacketId.OPNPC_U,
    OPNPCT: OsrsClientPacketId.OPNPC_T,
    OPPLAYERU: OsrsClientPacketId.OPPLAYER_U,
    OPPLAYERT: OsrsClientPacketId.OPPLAYER_T,
    OPOBJU: OsrsClientPacketId.OPOBJ_U,
    OPOBJT: OsrsClientPacketId.OPLOC_T_ALT,

    // Examine
    EXAMINE_LOC: OsrsClientPacketId.EXAMINE_LOC,
    EXAMINE_OBJ: OsrsClientPacketId.EXAMINE_OBJ,
    EXAMINE_OBJECT: OsrsClientPacketId.EXAMINE_LOC,

    // Widget interactions
    IF_BUTTON: OsrsClientPacketId.IF_BUTTON,
    IF_BUTTON1: OsrsClientPacketId.IF_BUTTON1,
    IF_BUTTON2: OsrsClientPacketId.IF_BUTTON2,
    IF_BUTTON3: OsrsClientPacketId.IF_BUTTON3,
    IF_BUTTON4: OsrsClientPacketId.IF_BUTTON4,
    IF_BUTTON5: OsrsClientPacketId.IF_BUTTON5,
    IF_BUTTON6: OsrsClientPacketId.IF_BUTTON6,
    IF_BUTTON7: OsrsClientPacketId.IF_BUTTON7,
    IF_BUTTON8: OsrsClientPacketId.IF_BUTTON8,
    IF_BUTTON9: OsrsClientPacketId.IF_BUTTON9,
    IF_BUTTON10: OsrsClientPacketId.IF_BUTTON10,
    IF_TRIGGEROPLOCAL: OsrsClientPacketId.IF_TRIGGEROPLOCAL,
    IF_BUTTOND: OsrsClientPacketId.IF_BUTTOND,
    IF_BUTTONT: OsrsClientPacketId.IF_BUTTONT,

    // Movement
    MOVE_GAMECLICK: OsrsClientPacketId.MOVE_GAMECLICK,
    WORLD_MAP_CLICK: OsrsClientPacketId.WORLD_MAP_CLICK,

    // Dialog
    RESUME_PAUSEBUTTON: OsrsClientPacketId.RESUME_PAUSEBUTTON,

    // Interface close
    IF_CLOSE: OsrsClientPacketId.IF_CLOSE,
} as const;
