/**
 * Packet encoding module for OSRS-style sync packets.
 *
 * This module extracts the binary packet encoding logic from wsServer
 * into dedicated encoder classes following the service interface pattern.
 */

export * from "@server/network/encoding/constants";
export * from "@server/network/encoding/types";
export { NpcPacketEncoder, type NpcTickFrameData } from "@server/network/encoding/NpcPacketEncoder";
export {
    PlayerPacketEncoder,
    type PlayerTickFrameData,
    type MovementInfo,
} from "@server/network/encoding/PlayerPacketEncoder";
