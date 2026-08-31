/**
 * Packet Module - Binary packet encoding for OSRS protocol
 */

export { PacketBuffer, BITMASKS, type IIsaacCipher } from "@client/core/network/packet/PacketBuffer";
export {
    OsrsClientPacketId,
    OsrsClientPacket,
    OSRS_CLIENT_PACKET_LENGTHS,
    getOsrsClientPacketLength,
    isOsrsClientPacketVariableLength,
    isOsrsClientPacketVariableShort,
} from "@client/core/network/packet/OsrsClientPacket";
export {
    PacketBufferNode,
    PacketWriter,
    IsaacCipher,
    getPacketWriter,
    createPacket,
    queuePacket,
    flushPackets,
    setPacketSocket,
} from "@client/core/network/packet/PacketWriter";
