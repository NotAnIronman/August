/**
 * BinaryBridge - Helper functions for binary protocol detection
 *
 * The conversion functions have been moved to PacketHandler.ts as parsePacketsAsMessages()
 * which decodes OSRS packets directly to ClientToServer messages.
 */

import { isClientMessageId } from "@august/protocol/transport/messages/ClientMessage";

/**
 * Check if data is binary packet data vs JSON string
 *
 * The ws library returns all messages as Buffer, so we need to check
 * the content. JSON messages start with '{' (0x7B = 123) or '[' (0x5B = 91).
 * Binary packets start with an opcode which we control and won't be these values.
 */
export function isBinaryData(raw: unknown): raw is Buffer | ArrayBuffer {
    // Not a buffer/arraybuffer at all
    if (!(raw instanceof ArrayBuffer) && !Buffer.isBuffer(raw)) {
        return false;
    }

    // Check first byte to distinguish JSON from binary packets
    let firstByte: number;
    if (raw instanceof ArrayBuffer) {
        if (raw.byteLength === 0) return false;
        firstByte = new Uint8Array(raw)[0];
    } else {
        if (raw.length === 0) return false;
        firstByte = raw[0];
    }

    // JSON starts with '{' (123) or '[' (91). Genuine JSON payloads from this
    // client are always produced by JSON.stringify(), which never emits leading
    // whitespace — so checking for whitespace bytes here is unnecessary AND
    // dangerous: several real legacy binary opcodes fall in that byte range
    // (9 = EXAMINE_NPC, 10 = OPPLAYER7, 13 = IF_BUTTON, 32 = OPPLAYER_T), and
    // any packet starting with one of those opcodes was being silently
    // misclassified as JSON and dropped before ever reaching the parser.
    const isJsonStart = firstByte === 123 || firstByte === 91;

    return !isJsonStart;
}

/**
 * Convert raw data to Uint8Array
 */
export function toUint8Array(raw: Buffer | ArrayBuffer): Uint8Array {
    if (raw instanceof ArrayBuffer) {
        return new Uint8Array(raw);
    }
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

/** Select the August message decoder instead of the OSRS action-packet decoder. */
export function isClientMessagePacket(raw: Buffer | ArrayBuffer): boolean {
    let firstByte: number;
    if (raw instanceof ArrayBuffer) {
        if (raw.byteLength === 0) return false;
        firstByte = new Uint8Array(raw)[0];
    } else {
        if (raw.length === 0) return false;
        firstByte = raw[0];
    }
    return isClientMessageId(firstByte);
}
