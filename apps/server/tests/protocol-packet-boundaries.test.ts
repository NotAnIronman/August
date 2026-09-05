import assert from "node:assert/strict";

import {
    CLIENT_MESSAGE_LENGTHS,
    ClientMessageId,
    isClientMessageId,
} from "@august/protocol/transport/messages/ClientMessage";
import {
    OSRS_CLIENT_PACKET_LENGTHS,
    OsrsClientPacketId,
    getOsrsClientPacketLength,
    isOsrsClientPacketVariableLength,
    isOsrsClientPacketVariableShort,
} from "@august/protocol/transport/osrs/OsrsClientPacket";

type WireRow = readonly [name: string, actualId: number, stableId: number, length: number];

const osrsActionPackets: readonly WireRow[] = [
    ["IF_BUTTOND", OsrsClientPacketId.IF_BUTTOND, 1, 16],
    ["OPLOC_T", OsrsClientPacketId.OPLOC_T, 2, 15],
    ["OPPLAYER5", OsrsClientPacketId.OPPLAYER5, 6, 3],
    ["EXAMINE_NPC", OsrsClientPacketId.EXAMINE_NPC, 9, 2],
    ["OPPLAYER7", OsrsClientPacketId.OPPLAYER7, 10, 3],
    ["IF_BUTTON6", OsrsClientPacketId.IF_BUTTON6, 11, 8],
    ["OPNPC2", OsrsClientPacketId.OPNPC2, 12, 3],
    ["IF_BUTTON", OsrsClientPacketId.IF_BUTTON, 13, 4],
    ["IF_BUTTON7", OsrsClientPacketId.IF_BUTTON7, 14, 8],
    ["MOVE_GAMECLICK", OsrsClientPacketId.MOVE_GAMECLICK, 16, 7],
    ["IF_BUTTON8", OsrsClientPacketId.IF_BUTTON8, 19, 8],
    ["IF_BUTTON9", OsrsClientPacketId.IF_BUTTON9, 20, 8],
    ["OPPLAYER8", OsrsClientPacketId.OPPLAYER8, 21, 3],
    ["IF_BUTTON1", OsrsClientPacketId.IF_BUTTON1, 23, 8],
    ["IF_BUTTON2", OsrsClientPacketId.IF_BUTTON2, 25, 8],
    ["OPLOC2", OsrsClientPacketId.OPLOC2, 28, 7],
    ["IF_TRIGGEROPLOCAL", OsrsClientPacketId.IF_TRIGGEROPLOCAL, 30, -2],
    ["IF_BUTTON3", OsrsClientPacketId.IF_BUTTON3, 31, 8],
    ["OPPLAYER_T", OsrsClientPacketId.OPPLAYER_T, 32, 11],
    ["OPNPC3", OsrsClientPacketId.OPNPC3, 34, 3],
    ["OPNPC_U", OsrsClientPacketId.OPNPC_U, 36, 11],
    ["APPEARANCE_SET", OsrsClientPacketId.APPEARANCE_SET, 37, 13],
    ["OPLOC4", OsrsClientPacketId.OPLOC4, 38, 7],
    ["OPLOC3", OsrsClientPacketId.OPLOC3, 42, 7],
    ["OPOBJ2", OsrsClientPacketId.OPOBJ2, 43, 7],
    ["OPPLAYER1", OsrsClientPacketId.OPPLAYER1, 44, 3],
    ["OPPLAYER2", OsrsClientPacketId.OPPLAYER2, 45, 3],
    ["OPPLAYER3", OsrsClientPacketId.OPPLAYER3, 46, 3],
    ["OPPLAYER6", OsrsClientPacketId.OPPLAYER6, 48, 3],
    ["OPNPC5", OsrsClientPacketId.OPNPC5, 50, 3],
    ["OPLOC5", OsrsClientPacketId.OPLOC5, 51, 7],
    ["IF_CLOSE", OsrsClientPacketId.IF_CLOSE, 55, 0],
    ["OPOBJ4", OsrsClientPacketId.OPOBJ4, 56, 7],
    ["OPNPC1", OsrsClientPacketId.OPNPC1, 57, 3],
    ["RESUME_PAUSEBUTTON", OsrsClientPacketId.RESUME_PAUSEBUTTON, 62, 6],
    ["IF_BUTTON4", OsrsClientPacketId.IF_BUTTON4, 63, 8],
    ["OPPLAYER_U", OsrsClientPacketId.OPPLAYER_U, 65, 11],
    ["IF_BUTTON5", OsrsClientPacketId.IF_BUTTON5, 69, 8],
    ["OPNPC4", OsrsClientPacketId.OPNPC4, 70, 3],
    ["OPPLAYER4", OsrsClientPacketId.OPPLAYER4, 73, 3],
    ["OPNPC_T", OsrsClientPacketId.OPNPC_T, 75, 11],
    ["OPNPC1_ALT", OsrsClientPacketId.OPNPC1_ALT, 76, 3],
    ["OPOBJ_U", OsrsClientPacketId.OPOBJ_U, 79, 15],
    ["OPOBJ5", OsrsClientPacketId.OPOBJ5, 82, 7],
    ["IF_BUTTON10", OsrsClientPacketId.IF_BUTTON10, 84, 8],
    ["EXAMINE_LOC", OsrsClientPacketId.EXAMINE_LOC, 85, 2],
    ["OPLOCU", OsrsClientPacketId.OPLOCU, 86, 15],
    ["IF_BUTTON_SUB", OsrsClientPacketId.IF_BUTTON_SUB, 89, 10],
    ["IF_BUTTONT", OsrsClientPacketId.IF_BUTTONT, 90, 16],
    ["OPLOC_T_ALT", OsrsClientPacketId.OPLOC_T_ALT, 94, 15],
    ["OPLOC1", OsrsClientPacketId.OPLOC1, 96, 7],
    ["OPOBJ1", OsrsClientPacketId.OPOBJ1, 102, 7],
    ["OPOBJ3", OsrsClientPacketId.OPOBJ3, 103, 7],
    ["EXAMINE_OBJ", OsrsClientPacketId.EXAMINE_OBJ, 104, 6],
    ["WORLD_MAP_CLICK", OsrsClientPacketId.WORLD_MAP_CLICK, 105, 4],
];

const augustClientMessages: readonly WireRow[] = [
    ["TRADE_ACTION", ClientMessageId.TRADE_ACTION, 180, -1],
    ["CHAT", ClientMessageId.CHAT, 190, -1],
    ["VARP_TRANSMIT", ClientMessageId.VARP_TRANSMIT, 191, 6],
    ["RESUME_COUNTDIALOG", ClientMessageId.RESUME_COUNTDIALOG, 192, 4],
    ["RESUME_NAMEDIALOG", ClientMessageId.RESUME_NAMEDIALOG, 193, -1],
    ["RESUME_STRINGDIALOG", ClientMessageId.RESUME_STRINGDIALOG, 194, -1],
    ["MAP_EDIT", ClientMessageId.MAP_EDIT, 195, -1],
    ["FRIENDS_CHAT_ACTION", ClientMessageId.FRIENDS_CHAT_ACTION, 196, -1],
    ["CLIENT_SETTING", ClientMessageId.CLIENT_SETTING, 197, 2],
    ["PET_EXAMINE", ClientMessageId.PET_EXAMINE, 198, 4],
    ["HELLO", ClientMessageId.HELLO, 200, -1],
    ["PING", ClientMessageId.PING, 201, 4],
    ["HANDSHAKE", ClientMessageId.HANDSHAKE, 202, -1],
    ["LOGOUT", ClientMessageId.LOGOUT, 203, 0],
    ["LOGIN", ClientMessageId.LOGIN, 204, -2],
    ["WALK", ClientMessageId.WALK, 210, 5],
    ["FACE", ClientMessageId.FACE, 211, -1],
    ["TELEPORT", ClientMessageId.TELEPORT, 212, 5],
    ["PATHFIND", ClientMessageId.PATHFIND, 213, -1],
    ["LOC_INTERACT", ClientMessageId.LOC_INTERACT, 231, -1],
    ["GROUND_ITEM_ACTION", ClientMessageId.GROUND_ITEM_ACTION, 232, -1],
    ["INTERACT", ClientMessageId.INTERACT, 233, -1],
    ["INTERACT_STOP", ClientMessageId.INTERACT_STOP, 234, 0],
    ["INVENTORY_USE", ClientMessageId.INVENTORY_USE, 240, -1],
    ["INVENTORY_USE_ON", ClientMessageId.INVENTORY_USE_ON, 241, -1],
    ["INVENTORY_MOVE", ClientMessageId.INVENTORY_MOVE, 242, 4],
    ["BANK_DEPOSIT_INVENTORY", ClientMessageId.BANK_DEPOSIT_INVENTORY, 243, 0],
    ["BANK_DEPOSIT_EQUIPMENT", ClientMessageId.BANK_DEPOSIT_EQUIPMENT, 244, 0],
    ["BANK_MOVE", ClientMessageId.BANK_MOVE, 245, -1],
    ["ITEM_SPAWNER_SEARCH", ClientMessageId.ITEM_SPAWNER_SEARCH, 246, -1],
    ["WIDGET", ClientMessageId.WIDGET, 250, -1],
    ["WIDGET_ACTION", ClientMessageId.WIDGET_ACTION, 251, -1],
    ["RESUME_PAUSEBUTTON", ClientMessageId.RESUME_PAUSEBUTTON, 252, 6],
    ["IF_BUTTOND", ClientMessageId.IF_BUTTOND, 253, 16],
    ["EMOTE", ClientMessageId.EMOTE, 254, 3],
    ["DEBUG", ClientMessageId.DEBUG, 255, -2],
];

assert.equal(Object.keys(OSRS_CLIENT_PACKET_LENGTHS).length, osrsActionPackets.length);
assert.equal(Object.keys(CLIENT_MESSAGE_LENGTHS).length, augustClientMessages.length);

const osrsIds = new Set<number>();
for (const [name, actualId, stableId, length] of osrsActionPackets) {
    assert.equal(actualId, stableId, `${name} OSRS packet ID changed`);
    assert.equal(getOsrsClientPacketLength(actualId), length, `${name} OSRS packet length changed`);
    assert.equal(isOsrsClientPacketVariableLength(actualId), length === -1 || length === -2);
    assert.equal(isOsrsClientPacketVariableShort(actualId), length === -2);
    assert.equal(isClientMessageId(actualId), false, `${name} entered the August message range`);
    osrsIds.add(actualId);
}

for (const [name, actualId, stableId, length] of augustClientMessages) {
    assert.equal(actualId, stableId, `${name} August message ID changed`);
    assert.equal(CLIENT_MESSAGE_LENGTHS[actualId as ClientMessageId], length, `${name} message length changed`);
    assert.equal(isClientMessageId(actualId), true, `${name} left the August message range`);
    assert.equal(osrsIds.has(actualId), false, `${name} overlaps an OSRS action packet`);
}
