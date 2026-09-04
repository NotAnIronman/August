/**
 * ServerBinaryDecoder - Decode August server messages
 *
 * Replaces JSON.parse for server-to-client messages.
 * Returns the same message format as the JSON protocol for compatibility.
 */
import {
    INSTANCE_CHUNK_COUNT,
    PLANE_COUNT,
    deriveRegionsFromCenter,
    deriveRegionsFromTemplates,
} from "@august/game-model/world/instance/InstanceTypes";
import { SERVER_MESSAGE_LENGTHS, ServerMessageId } from "@august/protocol/transport/messages/ServerMessage";
import type { ProjectileLaunch } from "@august/protocol/projectiles/ProjectileLaunch";
import type { FriendsChatSnapshot } from "@august/protocol/social/FriendsChat";
import {
    bossHealthBarMarkerStyleFromId,
    type BossHealthBarMarker,
} from "@august/protocol/ui/bossHealthBar";
import type { WorldEntityBuildArea } from "@august/protocol/worldentity/WorldEntityTypes";

const GROUND_ITEM_METADATA_MAGIC = 0x4749; // "GI"
const GROUND_ITEM_METADATA_VERSION = 1;
const GROUND_ITEM_META_NAME = 1 << 0;
const GROUND_ITEM_META_VALUE = 1 << 1;
const GROUND_ITEM_META_HIGH_ALCH = 1 << 2;
const GROUND_ITEM_META_BOOLS = 1 << 3;
const GROUND_ITEM_META_TRADEABLE = 1 << 4;
const GROUND_ITEM_META_STACKABLE = 1 << 5;
const GROUND_ITEM_META_NOTED = 1 << 6;
const GROUND_ITEM_META_UNNOTED_ID = 1 << 7;

/**
 * Binary packet buffer for client decoding
 */
export class ServerPacketReader {
    readonly data: Uint8Array;
    offset: number = 0;
    private bitPos: number = 0;
    private limit: number;

    constructor(data: Uint8Array | ArrayBuffer) {
        this.data = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        this.limit = this.data.length;
    }

    get remaining(): number {
        return this.limit - this.offset;
    }

    /** Restrict reads to one declared packet, even when its frame has trailing packets. */
    setLimit(endExclusive: number): void {
        if (
            !Number.isSafeInteger(endExclusive) ||
            endExclusive < this.offset ||
            endExclusive > this.data.length
        ) {
            throw new RangeError("Invalid server packet boundary");
        }
        this.limit = endExclusive;
    }

    initBitAccess(): void {
        this.bitPos = this.offset * 8;
    }

    readBits(count: number): number {
        if (
            !Number.isSafeInteger(count) ||
            count < 0 ||
            count > 32 ||
            this.bitPos + count > this.limit * 8
        ) {
            throw new RangeError("Server packet ended during bit access");
        }
        let bytePos = this.bitPos >> 3;
        let bitOffset = 8 - (this.bitPos & 7);
        let value = 0;
        this.bitPos += count;
        while (count > bitOffset) {
            value += (this.data[bytePos++] & ((1 << bitOffset) - 1)) << (count - bitOffset);
            count -= bitOffset;
            bitOffset = 8;
        }
        if (count === bitOffset) {
            value += this.data[bytePos] & ((1 << bitOffset) - 1);
        } else {
            value += (this.data[bytePos] >> (bitOffset - count)) & ((1 << count) - 1);
        }
        return value;
    }

    finishBitAccess(): void {
        this.offset = (this.bitPos + 7) >> 3;
    }

    private ensureRemaining(bytes: number, op: string): void {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || this.remaining < bytes) {
            throw new RangeError(
                `Buffer exhausted (${op} need=${bytes} offset=${this.offset} len=${this.data.length})`,
            );
        }
    }

    // ========================================
    // READ METHODS
    // ========================================

    readByte(): number {
        this.ensureRemaining(1, "readByte");
        return this.data[this.offset++] & 0xff;
    }

    readSignedByte(): number {
        this.ensureRemaining(1, "readSignedByte");
        const v = this.data[this.offset++];
        return v > 127 ? v - 256 : v;
    }

    readShort(): number {
        this.ensureRemaining(2, "readShort");
        this.offset += 2;
        return ((this.data[this.offset - 2] & 0xff) << 8) | (this.data[this.offset - 1] & 0xff);
    }

    readSignedShort(): number {
        const v = this.readShort();
        return v > 32767 ? v - 65536 : v;
    }

    readUnsignedMediumIME(): number {
        this.ensureRemaining(3, "readUnsignedMediumIME");
        this.offset += 3;
        return (
            ((this.data[this.offset - 3] & 0xff) << 16) |
            ((this.data[this.offset - 1] & 0xff) << 8) |
            (this.data[this.offset - 2] & 0xff)
        );
    }

    readInt(): number {
        this.ensureRemaining(4, "readInt");
        this.offset += 4;
        return (
            ((this.data[this.offset - 4] & 0xff) << 24) |
            ((this.data[this.offset - 3] & 0xff) << 16) |
            ((this.data[this.offset - 2] & 0xff) << 8) |
            (this.data[this.offset - 1] & 0xff)
        );
    }

    readBoolean(): boolean {
        return this.readByte() !== 0;
    }

    readString(): string {
        let str = "";
        while (true) {
            this.ensureRemaining(1, "readString");
            const b = this.data[this.offset++] & 0xff;
            if (b === 0) break;
            str += String.fromCharCode(b);
        }
        return str;
    }

    readSmartByteShort(): number {
        this.ensureRemaining(1, "readSmartByteShort");
        const peek = this.data[this.offset] & 0xff;
        if (peek < 128) {
            return this.readByte();
        }
        return this.readShort() - 32768;
    }

    readBytes(length: number): Uint8Array {
        this.ensureRemaining(length, "readBytes");
        const result = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
    }

    /** Read unsigned byte with ADD decoding: (value - 128) & 0xFF */
    readByteAdd(): number {
        this.ensureRemaining(1, "readByteAdd");
        return (this.data[this.offset++] - 128) & 0xff;
    }

    /** Read unsigned byte with NEG decoding: (0 - value) & 0xFF */
    readByteNeg(): number {
        this.ensureRemaining(1, "readByteNeg");
        return (0 - this.data[this.offset++]) & 0xff;
    }

    /** Read unsigned byte with SUB decoding: (128 - value) & 0xFF */
    readByteSub(): number {
        this.ensureRemaining(1, "readByteSub");
        return (128 - this.data[this.offset++]) & 0xff;
    }

    /** Read signed byte with ADD decoding */
    readSignedByteAdd(): number {
        this.ensureRemaining(1, "readSignedByteAdd");
        return ((this.data[this.offset++] - 128) << 24) >> 24;
    }

    /** Read signed byte with NEG decoding */
    readSignedByteNeg(): number {
        this.ensureRemaining(1, "readSignedByteNeg");
        return ((0 - this.data[this.offset++]) << 24) >> 24;
    }

    /** Read signed byte with SUB decoding */
    readSignedByteSub(): number {
        this.ensureRemaining(1, "readSignedByteSub");
        return ((128 - this.data[this.offset++]) << 24) >> 24;
    }

    /** Read unsigned short little-endian: [low, high] */
    readShortLE(): number {
        this.ensureRemaining(2, "readShortLE");
        this.offset += 2;
        return (this.data[this.offset - 2] & 0xff) | ((this.data[this.offset - 1] & 0xff) << 8);
    }

    /** Read unsigned short with ADD decoding: [high, low+128] -> big-endian */
    readShortAdd(): number {
        this.ensureRemaining(2, "readShortAdd");
        this.offset += 2;
        return (
            ((this.data[this.offset - 2] & 0xff) << 8) | ((this.data[this.offset - 1] - 128) & 0xff)
        );
    }

    /** Read unsigned short with ADD LE decoding: [low+128, high] -> little-endian */
    readShortAddLE(): number {
        this.ensureRemaining(2, "readShortAddLE");
        this.offset += 2;
        return (
            ((this.data[this.offset - 2] - 128) & 0xff) | ((this.data[this.offset - 1] & 0xff) << 8)
        );
    }

    /** Read signed short little-endian */
    readSignedShortLE(): number {
        const v = this.readShortLE();
        return v > 32767 ? v - 65536 : v;
    }

    /** Read unsigned int little-endian: [b0, b1, b2, b3] */
    readIntLE(): number {
        this.ensureRemaining(4, "readIntLE");
        this.offset += 4;
        return (
            ((this.data[this.offset - 4] & 0xff) |
                ((this.data[this.offset - 3] & 0xff) << 8) |
                ((this.data[this.offset - 2] & 0xff) << 16) |
                ((this.data[this.offset - 1] & 0xff) << 24)) >>>
            0
        );
    }

    /** Read unsigned int middle-endian: [b1, b0, b3, b2] */
    readIntME(): number {
        this.ensureRemaining(4, "readIntME");
        this.offset += 4;
        return (
            (((this.data[this.offset - 2] & 0xff) << 24) |
                ((this.data[this.offset - 1] & 0xff) << 16) |
                ((this.data[this.offset - 4] & 0xff) << 8) |
                (this.data[this.offset - 3] & 0xff)) >>>
            0
        );
    }

    /** Read unsigned int inverse middle-endian: [b2, b3, b0, b1] */
    readIntIME(): number {
        this.ensureRemaining(4, "readIntIME");
        this.offset += 4;
        return (
            (((this.data[this.offset - 3] & 0xff) << 24) |
                ((this.data[this.offset - 4] & 0xff) << 16) |
                ((this.data[this.offset - 1] & 0xff) << 8) |
                (this.data[this.offset - 2] & 0xff)) >>>
            0
        );
    }
}

/**
 * Decoded message type (same format as JSON messages)
 */
export type DecodedServerMessage = {
    type: string;
    payload: any;
};

export const MAX_GAMEMODE_DATA_JSON_BYTES = 32 * 1024 * 1024;
export const MAX_BATCHED_SERVER_PACKETS = 4_096;
export const MAX_BATCHED_SERVER_BYTES = 64 * 1024 * 1024;

function inflateGamemodeData(
    compressedBytes: Uint8Array,
    declaredLength: number,
): Uint8Array {
    if (
        !Number.isSafeInteger(declaredLength) ||
        declaredLength < 0 ||
        declaredLength > MAX_GAMEMODE_DATA_JSON_BYTES
    ) {
        throw new RangeError("Gamemode data declares an unsupported JSON size");
    }

    type PakoInflate = {
        err: number;
        msg: string;
        onData: (chunk: Uint8Array) => void;
        push(data: Uint8Array, final: boolean): boolean;
    };
    const pako = require("pako") as {
        Inflate: new (options?: { chunkSize?: number }) => PakoInflate;
    };
    const inflater = new pako.Inflate({ chunkSize: 64 * 1024 });
    const chunks: Uint8Array[] = [];
    let total = 0;
    inflater.onData = (chunk) => {
        total += chunk.byteLength;
        if (total > declaredLength || total > MAX_GAMEMODE_DATA_JSON_BYTES) {
            throw new RangeError("Gamemode data expands beyond its declared JSON size");
        }
        chunks.push(chunk);
    };
    if (!inflater.push(compressedBytes, true) || inflater.err !== 0 || total !== declaredLength) {
        throw new Error(inflater.msg || "Invalid compressed gamemode data");
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/**
 * Decode a single binary packet
 */
export function decodeServerPacket(data: Uint8Array | ArrayBuffer): DecodedServerMessage | null {
    try {
        return decodeServerPacketUnchecked(data);
    } catch {
        // A configured community server is an external input boundary. Bad
        // counts, truncated fields, and compressed payloads must not crash or
        // corrupt the browser client.
        return null;
    }
}

function decodeServerPacketUnchecked(
    data: Uint8Array | ArrayBuffer,
): DecodedServerMessage | null {
    const reader = new ServerPacketReader(data);

    if (reader.remaining < 1) return null;

    const opcode = reader.readByte() as ServerMessageId;
    const fixedLength = SERVER_MESSAGE_LENGTHS[opcode];
    if (fixedLength === undefined) return null;

    // Read length for variable packets
    let packetLength: number;
    if (fixedLength === -1) {
        if (reader.remaining < 1) return null;
        packetLength = reader.readByte();
    } else if (fixedLength === -2) {
        if (reader.remaining < 2) return null;
        packetLength = reader.readShort();
    } else {
        packetLength = fixedLength;
    }

    if (!Number.isSafeInteger(packetLength) || packetLength < 0 || reader.remaining < packetLength) {
        return null;
    }
    reader.setLimit(reader.offset + packetLength);

    const readGroundItemStack = (): any => {
        const id = reader.readInt();
        const itemId = reader.readShort();
        const quantity = reader.readInt();
        const tileX = reader.readShort();
        const tileY = reader.readShort();
        const tileLevel = reader.readByte();
        const createdTickRaw = reader.readInt();
        const privateUntilTickRaw = reader.readInt();
        const expiresTickRaw = reader.readInt();
        const ownerIdRaw = reader.readInt();
        const isPrivateRaw = reader.readBoolean();
        const ownershipRaw = reader.readByte();

        const createdTick = createdTickRaw >= 0 ? createdTickRaw : undefined;
        const privateUntilTick = privateUntilTickRaw > 0 ? privateUntilTickRaw : undefined;
        const expiresTick = expiresTickRaw > 0 ? expiresTickRaw : undefined;
        const ownerId = ownerIdRaw >= 0 ? ownerIdRaw : undefined;
        const isPrivate = !!isPrivateRaw;
        const ownership = (
            ownershipRaw === 1 || ownershipRaw === 2 || ownershipRaw === 3 ? ownershipRaw : 0
        ) as 0 | 1 | 2 | 3;
        return {
            id,
            itemId,
            quantity,
            tile: {
                x: tileX,
                y: tileY,
                level: tileLevel,
            },
            createdTick,
            privateUntilTick,
            expiresTick,
            ownerId,
            isPrivate,
            ownership,
        };
    };

    const readGroundItemMetadata = (stacks: any[]): void => {
        // Legacy servers end the packet after the base stack records. Metadata
        // is therefore optional, but a present trailer must be complete.
        if (reader.remaining === 0) return;
        if (reader.readShort() !== GROUND_ITEM_METADATA_MAGIC) {
            throw new RangeError("Invalid ground-item metadata marker");
        }
        if (reader.readByte() !== GROUND_ITEM_METADATA_VERSION) {
            throw new RangeError("Unsupported ground-item metadata version");
        }
        const count = reader.readShort();
        if (count > stacks.length) {
            throw new RangeError("Invalid ground-item metadata count");
        }
        const stacksById = new Map<number, any>();
        for (const stack of stacks) stacksById.set(stack.id | 0, stack);
        const seen = new Set<number>();
        for (let i = 0; i < count; i++) {
            const stackId = reader.readInt();
            if (seen.has(stackId)) {
                throw new RangeError("Duplicate ground-item metadata entry");
            }
            seen.add(stackId);
            const stack = stacksById.get(stackId);
            if (!stack) {
                throw new RangeError("Ground-item metadata references an unknown stack");
            }
            const flags = reader.readByte();
            if ((flags & GROUND_ITEM_META_NAME) !== 0) stack.name = reader.readString();
            if ((flags & GROUND_ITEM_META_VALUE) !== 0) {
                const value = reader.readInt();
                if (value < 0) throw new RangeError("Invalid ground-item value");
                stack.value = value;
            }
            if ((flags & GROUND_ITEM_META_HIGH_ALCH) !== 0) {
                const highAlch = reader.readInt();
                if (highAlch < 0) throw new RangeError("Invalid ground-item high-alch value");
                stack.highAlch = highAlch;
            }
            if ((flags & GROUND_ITEM_META_BOOLS) !== 0) {
                stack.tradeable = (flags & GROUND_ITEM_META_TRADEABLE) !== 0;
                stack.stackable = (flags & GROUND_ITEM_META_STACKABLE) !== 0;
                stack.noted = (flags & GROUND_ITEM_META_NOTED) !== 0;
            }
            if ((flags & GROUND_ITEM_META_UNNOTED_ID) !== 0) {
                const unnotedItemId = reader.readInt();
                if (unnotedItemId <= 0) {
                    throw new RangeError("Invalid canonical ground-item id");
                }
                stack.unnotedItemId = unnotedItemId;
            }
        }
        if (reader.remaining !== 0) {
            throw new RangeError("Trailing ground-item metadata bytes");
        }
    };

    switch (opcode) {
        case ServerMessageId.WELCOME:
            return {
                type: "welcome",
                payload: {
                    tickMs: reader.readInt(),
                    serverTime: reader.readInt(),
                },
            };

        case ServerMessageId.TICK:
            return {
                type: "tick",
                payload: {
                    tick: reader.readInt(),
                    time: reader.readInt(),
                },
            };

        case ServerMessageId.DESTINATION:
            return {
                type: "destination",
                payload: {
                    worldX: reader.readShort(),
                    worldY: reader.readShort(),
                },
            };

        case ServerMessageId.REBUILD_REGION: {
            const rebuildRegionY = reader.readShort();
            const rebuildForceReload = reader.readByte() === 1;
            const rebuildRegionX = reader.readShort();
            const numXteaKeys = reader.readShort();

            const templateChunks: number[][][] = new Array(PLANE_COUNT);
            for (let p = 0; p < PLANE_COUNT; p++) {
                templateChunks[p] = new Array(INSTANCE_CHUNK_COUNT);
                for (let cx = 0; cx < INSTANCE_CHUNK_COUNT; cx++) {
                    templateChunks[p][cx] = new Array(INSTANCE_CHUNK_COUNT);
                }
            }

            reader.initBitAccess();
            for (let p = 0; p < PLANE_COUNT; p++) {
                for (let cx = 0; cx < INSTANCE_CHUNK_COUNT; cx++) {
                    for (let cy = 0; cy < INSTANCE_CHUNK_COUNT; cy++) {
                        const present = reader.readBits(1);
                        if (present === 1) {
                            templateChunks[p][cx][cy] = reader.readBits(26);
                        } else {
                            templateChunks[p][cx][cy] = -1;
                        }
                    }
                }
            }
            reader.finishBitAccess();

            const xteaKeys: number[][] = new Array(numXteaKeys);
            for (let i = 0; i < numXteaKeys; i++) {
                xteaKeys[i] = [
                    reader.readInt(),
                    reader.readInt(),
                    reader.readInt(),
                    reader.readInt(),
                ];
            }

            const mapRegions = deriveRegionsFromTemplates(templateChunks);

            return {
                type: "rebuild_region",
                payload: {
                    regionX: rebuildRegionX,
                    regionY: rebuildRegionY,
                    forceReload: rebuildForceReload,
                    templateChunks,
                    xteaKeys,
                    mapRegions,
                },
            };
        }

        case ServerMessageId.REBUILD_NORMAL: {
            const normalRegionX = reader.readShort();
            const normalRegionY = reader.readShort();
            const normalForceReload = reader.readByte() === 0;
            const normalNumXtea = reader.readShort();

            const normalXteaKeys: number[][] = new Array(normalNumXtea);
            for (let i = 0; i < normalNumXtea; i++) {
                normalXteaKeys[i] = [
                    reader.readInt(),
                    reader.readInt(),
                    reader.readInt(),
                    reader.readInt(),
                ];
            }

            const normalMapRegions = deriveRegionsFromCenter(normalRegionX, normalRegionY);

            return {
                type: "rebuild_normal",
                payload: {
                    regionX: normalRegionX,
                    regionY: normalRegionY,
                    forceReload: normalForceReload,
                    xteaKeys: normalXteaKeys,
                    mapRegions: normalMapRegions,
                },
            };
        }

        case ServerMessageId.WORLDENTITY_INFO: {
            const weInfoOldCount = reader.readByte() & 0xff;

            interface WeOldUpdate {
                updateType: number;
                positionDelta?: { x: number; y: number; z: number; orientation: number };
                mask?: { animationId?: number; sequenceFrame?: number; actionMask?: number };
            }
            const weOldUpdates: WeOldUpdate[] = [];
            for (let i = 0; i < weInfoOldCount; i++) {
                const updateType = reader.readByte() & 0xff;
                let positionDelta: WeOldUpdate["positionDelta"];
                if (updateType >= 2) {
                    positionDelta = readPositionDelta(reader);
                }
                let mask: WeOldUpdate["mask"];
                if (updateType !== 0) {
                    mask = readMaskUpdate(reader);
                }
                weOldUpdates.push({ updateType, positionDelta, mask });
            }

            interface WeNewSpawn {
                entityIndex: number;
                sizeX: number;
                sizeZ: number;
                configId: number;
                drawMode: number;
                position: { x: number; y: number; z: number; orientation: number };
                mask?: { animationId?: number; sequenceFrame?: number; actionMask?: number };
            }
            const weInfoNewSpawns: WeNewSpawn[] = [];
            while (reader.remaining > 0) {
                const entityIndex = reader.readShort() & 0xffff;
                const sizeX = reader.readByte() & 0xff;
                const sizeZ = reader.readByte() & 0xff;
                const configId = reader.readShort();
                const position = readPositionDelta(reader);
                const drawMode = reader.readByte() & 0xff;
                const mask = readMaskUpdate(reader);
                weInfoNewSpawns.push({
                    entityIndex,
                    sizeX,
                    sizeZ,
                    configId,
                    drawMode,
                    position,
                    mask,
                });
            }
            return {
                type: "worldentity_info",
                payload: {
                    oldCount: weInfoOldCount,
                    oldUpdates: weOldUpdates,
                    newSpawns: weInfoNewSpawns,
                },
            };
        }

        case ServerMessageId.REBUILD_WORLDENTITY: {
            const weEntityIndex = reader.readShort();
            const weConfigId = reader.readShort();
            const weSizeX = reader.readByte() & 0xff;
            const weSizeZ = reader.readByte() & 0xff;
            const weZoneX = reader.readShort();
            const weZoneZ = reader.readShort();
            const weRegionY = reader.readShort();
            const weForceReload = reader.readByte() === 1;
            const weRegionX = reader.readShort();
            const weNumXteaKeys = reader.readShort();

            // Build areas
            const weNumBuildAreas = reader.readByte() & 0xff;
            const weBuildAreas: WorldEntityBuildArea[] = [];
            for (let i = 0; i < weNumBuildAreas; i++) {
                weBuildAreas.push({
                    sourceBaseX: reader.readShort(),
                    sourceBaseY: reader.readShort(),
                    destBaseX: reader.readShort(),
                    destBaseY: reader.readShort(),
                    planes: reader.readByte() & 0xff,
                    rotation: reader.readByte() & 0xff,
                });
            }

            // Bit-packed template chunks: 4 planes × 13 × 13
            const weTemplateChunks: number[][][] = new Array(PLANE_COUNT);
            for (let p = 0; p < PLANE_COUNT; p++) {
                weTemplateChunks[p] = new Array(INSTANCE_CHUNK_COUNT);
                for (let cx = 0; cx < INSTANCE_CHUNK_COUNT; cx++) {
                    weTemplateChunks[p][cx] = new Array(INSTANCE_CHUNK_COUNT);
                }
            }

            reader.initBitAccess();
            for (let p = 0; p < PLANE_COUNT; p++) {
                for (let cx = 0; cx < INSTANCE_CHUNK_COUNT; cx++) {
                    for (let cy = 0; cy < INSTANCE_CHUNK_COUNT; cy++) {
                        const present = reader.readBits(1);
                        if (present === 1) {
                            weTemplateChunks[p][cx][cy] = reader.readBits(26);
                        } else {
                            weTemplateChunks[p][cx][cy] = -1;
                        }
                    }
                }
            }
            reader.finishBitAccess();

            const weXteaKeys: number[][] = new Array(weNumXteaKeys);
            for (let i = 0; i < weNumXteaKeys; i++) {
                weXteaKeys[i] = [
                    reader.readInt(),
                    reader.readInt(),
                    reader.readInt(),
                    reader.readInt(),
                ];
            }

            const weMapRegions = deriveRegionsFromTemplates(weTemplateChunks);

            return {
                type: "rebuild_worldentity",
                payload: {
                    entityIndex: weEntityIndex,
                    configId: weConfigId,
                    sizeX: weSizeX,
                    sizeZ: weSizeZ,
                    zoneX: weZoneX,
                    zoneZ: weZoneZ,
                    regionX: weRegionX,
                    regionY: weRegionY,
                    forceReload: weForceReload,
                    templateChunks: weTemplateChunks,
                    xteaKeys: weXteaKeys,
                    mapRegions: weMapRegions,
                    buildAreas: weBuildAreas,
                },
            };
        }

        case ServerMessageId.HANDSHAKE: {
            const id = reader.readInt();
            const name = reader.readString();
            const hasAppearance = reader.readBoolean();
            let appearance: any = undefined;
            if (hasAppearance) {
                appearance = { gender: reader.readByte() };
                const colorCount = reader.readByte();
                appearance.colors = [];
                for (let i = 0; i < colorCount; i++) {
                    appearance.colors.push(reader.readByte());
                }
                const kitCount = reader.readByte();
                appearance.kits = [];
                for (let i = 0; i < kitCount; i++) {
                    appearance.kits.push(reader.readSignedShort()); // kits can be -1
                }
                const equipCount = reader.readByte();
                appearance.equip = [];
                for (let i = 0; i < equipCount; i++) {
                    appearance.equip.push(reader.readSignedShort()); // equip uses -1 for empty
                }
            }
            let chatIcons: number[] | undefined = undefined;
            let chatPrefix: string | undefined = undefined;
            let isAdmin: boolean | undefined = undefined;
            if (reader.remaining > 0) {
                const iconCount = reader.readByte() | 0;
                const icons: number[] = [];
                for (let i = 0; i < iconCount && reader.remaining > 0; i++) {
                    icons.push(reader.readByte() | 0);
                }
                chatIcons = icons;
                if (reader.remaining > 0) {
                    const prefix = reader.readString();
                    chatPrefix = prefix || undefined;
                }
                if (reader.remaining > 0) {
                    isAdmin = reader.readBoolean();
                }
            }
            return {
                type: "handshake",
                payload: { id, name: name || undefined, appearance, chatIcons, chatPrefix, isAdmin },
            };
        }

        case ServerMessageId.VARP_SMALL:
            return {
                type: "varp",
                payload: {
                    varpId: reader.readShort(),
                    value: reader.readByte(),
                },
            };

        case ServerMessageId.VARP_LARGE:
            return {
                type: "varp",
                payload: {
                    varpId: reader.readShort(),
                    value: reader.readInt(),
                },
            };

        case ServerMessageId.VARBIT:
            return {
                type: "varbit",
                payload: {
                    varbitId: reader.readShort(),
                    value: reader.readInt(),
                },
            };

        case ServerMessageId.PLAYER_SYNC: {
            const baseX = reader.readShort();
            const baseY = reader.readShort();
            const localIndex = reader.readShort();
            const loopCycle = reader.readInt();
            const packetLen = reader.readShort();
            const packet = reader.readBytes(packetLen);
            return {
                type: "player_sync",
                payload: { baseX, baseY, localIndex, loopCycle, packet },
            };
        }

        case ServerMessageId.NPC_INFO: {
            const loopCycle = reader.readInt();
            const large = reader.readBoolean();
            const anchorX = reader.readShort();
            const anchorY = reader.readShort();
            const anchorLevel = reader.readByte();
            const packetLen = reader.readShort();
            const packet = reader.readBytes(packetLen);
            return {
                type: "npc_info",
                payload: { loopCycle, large, anchorX, anchorY, anchorLevel, packet },
            };
        }

        case ServerMessageId.INVENTORY_SNAPSHOT: {
            const count = reader.readShort();
            const slots: any[] = [];
            for (let i = 0; i < count; i++) {
                const slot = reader.readShort();
                const itemId = reader.readShort() - 1; // -1 for 0=empty convention
                let quantity = reader.readByte();
                if (quantity === 255) {
                    quantity = reader.readInt();
                }
                slots.push({ slot, itemId, quantity });
            }
            return {
                type: "inventory",
                payload: { kind: "snapshot", slots },
            };
        }

        case ServerMessageId.INVENTORY_SLOT: {
            const slot = reader.readShort();
            const itemId = reader.readShort() - 1;
            let quantity = reader.readByte();
            if (quantity === 255) {
                quantity = reader.readInt();
            }
            return {
                type: "inventory",
                payload: { kind: "slot", slot: { slot, itemId, quantity } },
            };
        }

        case ServerMessageId.SKILLS_SNAPSHOT:
        case ServerMessageId.SKILLS_DELTA: {
            const kind = opcode === ServerMessageId.SKILLS_SNAPSHOT ? "snapshot" : "delta";
            const count = reader.readByte();
            const skills: any[] = [];
            for (let i = 0; i < count; i++) {
                skills.push({
                    id: reader.readByte(),
                    xp: reader.readInt(),
                    baseLevel: reader.readByte(),
                    virtualLevel: reader.readByte(),
                    boost: reader.readByte() - 128, // unsigned -> signed
                    currentLevel: reader.readByte(),
                });
            }
            const totalLevel = reader.readShort();
            const combatLevel = reader.readByte();
            return {
                type: "skills",
                payload: { kind, skills, totalLevel, combatLevel },
            };
        }

        case ServerMessageId.RUN_ENERGY:
            return {
                type: "run_energy",
                payload: {
                    percent: reader.readByte(),
                    running: reader.readBoolean(),
                },
            };

        case ServerMessageId.SPOT_ANIM: {
            const spotId = reader.readShort();
            const targetType = reader.readByte();
            let playerId: number | undefined;
            let npcId: number | undefined;
            let tile: { x: number; y: number; level?: number } | undefined;
            if (targetType === 0) {
                playerId = reader.readShort();
            } else if (targetType === 1) {
                npcId = reader.readShort();
            } else if (targetType === 2) {
                tile = {
                    x: reader.readShort(),
                    y: reader.readShort(),
                    level: reader.readByte(),
                };
            }
            const height = reader.readByte();
            const delay = reader.readShort();
            return {
                type: "spot",
                payload: { spotId, playerId, npcId, tile, height, delay },
            };
        }

        case ServerMessageId.WIDGET_OPEN:
            return {
                type: "widget",
                payload: {
                    action: "open",
                    groupId: reader.readShort(),
                    modal: reader.readBoolean(),
                },
            };

        case ServerMessageId.WIDGET_CLOSE:
            return {
                type: "widget",
                payload: {
                    action: "close",
                    groupId: reader.readShort(),
                },
            };

        case ServerMessageId.WIDGET_SET_ROOT:
            return {
                type: "widget",
                payload: {
                    action: "set_root",
                    groupId: reader.readShort(),
                },
            };

        case ServerMessageId.WIDGET_OPEN_SUB: {
            const targetUid = reader.readInt();
            const groupId = reader.readShort();
            const type = reader.readByte();

            const varpCount = reader.readByte();
            const varps: Record<number, number> = {};
            for (let i = 0; i < varpCount; i++) {
                const id = reader.readShort();
                varps[id] = reader.readInt();
            }

            const varbitCount = reader.readByte();
            const varbits: Record<number, number> = {};
            for (let i = 0; i < varbitCount; i++) {
                const id = reader.readShort();
                varbits[id] = reader.readInt();
            }

            const hiddenUidCount = reader.readByte();
            const hiddenUids: number[] = [];
            for (let i = 0; i < hiddenUidCount; i++) {
                hiddenUids.push(reader.readInt() | 0);
            }

            const readScriptList = (): Array<{ scriptId: number; args: (number | string)[] }> => {
                const scriptCount = reader.readByte();
                const scripts: Array<{ scriptId: number; args: (number | string)[] }> = [];
                for (let i = 0; i < scriptCount; i++) {
                    const scriptId = reader.readInt();
                    const argCount = reader.readByte();
                    const args: (number | string)[] = [];
                    for (let j = 0; j < argCount; j++) {
                        const argType = reader.readByte();
                        if (argType === 0) {
                            args.push(reader.readString());
                        } else {
                            args.push(reader.readInt());
                        }
                    }
                    scripts.push({ scriptId, args });
                }
                return scripts;
            };

            const preScripts = readScriptList();
            const postScripts = readScriptList();

            return {
                type: "widget",
                payload: {
                    action: "open_sub",
                    targetUid,
                    groupId,
                    type,
                    varps: Object.keys(varps).length > 0 ? varps : undefined,
                    varbits: Object.keys(varbits).length > 0 ? varbits : undefined,
                    hiddenUids: hiddenUids.length > 0 ? hiddenUids : undefined,
                    preScripts: preScripts.length > 0 ? preScripts : undefined,
                    postScripts: postScripts.length > 0 ? postScripts : undefined,
                },
            };
        }

        case ServerMessageId.WIDGET_CLOSE_SUB:
            return {
                type: "widget",
                payload: {
                    action: "close_sub",
                    targetUid: reader.readInt(),
                },
            };

        case ServerMessageId.WIDGET_SET_TEXT:
            return {
                type: "widget",
                payload: {
                    action: "set_text",
                    uid: reader.readInt(),
                    text: reader.readString(),
                },
            };

        case ServerMessageId.WIDGET_SET_HIDDEN:
            return {
                type: "widget",
                payload: {
                    action: "set_hidden",
                    uid: reader.readInt(),
                    hidden: reader.readBoolean(),
                },
            };

        case ServerMessageId.WIDGET_SET_ITEM:
            return {
                type: "widget",
                payload: {
                    action: "set_item",
                    uid: reader.readInt(),
                    itemId: reader.readSignedShort(), // -1 means clear item
                    quantity: reader.readInt(),
                },
            };

        case ServerMessageId.WIDGET_SET_SPRITE:
            return {
                type: "widget",
                payload: {
                    action: "set_sprite",
                    uid: reader.readInt(),
                    archiveId: reader.readInt(),
                    frame: reader.readInt(),
                    x: reader.readInt(),
                    y: reader.readInt(),
                    width: reader.readInt(),
                    height: reader.readInt(),
                },
            };

        case ServerMessageId.WIDGET_SET_TRANSPARENCY:
            return {
                type: "widget",
                payload: {
                    action: "set_transparency",
                    uid: reader.readInt(),
                    transparency: reader.readByte(),
                },
            };

        case ServerMessageId.WIDGET_SET_BOSS_HEALTH_BAR: {
            const active = reader.readBoolean();
            if (!active) {
                return {
                    type: "widget",
                    payload: { action: "set_boss_health_bar", active: false },
                };
            }
            const npcTypeId = reader.readInt();
            const current = reader.readInt();
            const maximum = reader.readInt();
            const name = reader.readString();
            const markerCount = reader.readByte();
            const markers: BossHealthBarMarker[] = [];
            for (let index = 0; index < markerCount; index++) {
                const percent = reader.readShort() / 100;
                const style = bossHealthBarMarkerStyleFromId(reader.readByte());
                const label = reader.readString() || undefined;
                markers.push({
                    percent,
                    ...(label ? { label } : {}),
                    ...(style ? { style } : {}),
                });
            }
            return {
                type: "widget",
                payload: {
                    action: "set_boss_health_bar",
                    active: true,
                    npcTypeId,
                    name,
                    current,
                    maximum,
                    markers,
                },
            };
        }

        case ServerMessageId.WIDGET_SET_NPC_HEAD:
            return {
                type: "widget",
                payload: {
                    action: "set_npc_head",
                    uid: reader.readInt(),
                    npcId: reader.readSignedShort(),
                },
            };

        case ServerMessageId.WIDGET_SET_FLAGS_RANGE:
            return {
                type: "widget",
                payload: {
                    action: "set_flags_range",
                    uid: reader.readInt(),
                    fromSlot: reader.readShort(),
                    toSlot: reader.readShort(),
                    flags: reader.readInt(),
                },
            };

        case ServerMessageId.WIDGET_RUN_SCRIPT: {
            const scriptId = reader.readInt();
            const argCount = reader.readByte();
            const args: any[] = [];
            for (let i = 0; i < argCount; i++) {
                const argType = reader.readByte();
                if (argType === 0) {
                    args.push(reader.readString());
                } else {
                    args.push(reader.readInt());
                }
            }
            const readVars = (): Record<number, number> | undefined => {
                if (reader.remaining < 2) return undefined;
                const count = reader.readShort();
                if (count <= 0) return undefined;
                const vars: Record<number, number> = {};
                for (let i = 0; i < count && reader.remaining >= 8; i++) {
                    vars[reader.readInt()] = reader.readInt();
                }
                return vars;
            };
            const varps = readVars();
            const varbits = readVars();
            return {
                type: "widget",
                payload: {
                    action: "run_script",
                    scriptId,
                    args,
                    varps,
                    varbits,
                },
            };
        }

        case ServerMessageId.WIDGET_SET_FLAGS:
            return {
                type: "widget",
                payload: {
                    action: "set_flags",
                    uid: reader.readInt(),
                    flags: reader.readInt(),
                },
            };

        case ServerMessageId.WIDGET_SET_ANIMATION:
            return {
                type: "widget",
                payload: {
                    action: "set_animation",
                    uid: reader.readInt(),
                    animationId: reader.readSignedShort(),
                },
            };

        case ServerMessageId.WIDGET_SET_PLAYER_HEAD:
            return {
                type: "widget",
                payload: {
                    action: "set_player_head",
                    uid: reader.readInt(),
                },
            };

        case ServerMessageId.WIDGET_SET_QUEST_LIST: {
            const groupCount = reader.readShort();
            const groups: Array<{
                title: string;
                quests: Array<{ key: string; slot: number; status: number; displayName: string }>;
            }> = [];
            for (let i = 0; i < groupCount; i++) {
                const title = reader.readString();
                const questCount = reader.readShort();
                const quests: Array<{
                    key: string;
                    slot: number;
                    status: number;
                    displayName: string;
                }> = [];
                for (let j = 0; j < questCount; j++) {
                    quests.push({
                        slot: reader.readShort(),
                        status: reader.readByte(),
                        key: reader.readString(),
                        displayName: reader.readString(),
                    });
                }
                groups.push({ title, quests });
            }
            return {
                type: "widget",
                payload: {
                    action: "set_quest_list",
                    groups,
                },
            };
        }

        case ServerMessageId.CHAT_MESSAGE: {
            const messageTypes = [
                "game",
                "public",
                "private_in",
                "private_out",
                "channel",
                "clan",
                "trade",
                "server",
            ];
            const text = reader.readString();
            const chatType = reader.readByte();
            const messageType = messageTypes[chatType] || "game";
            const from = reader.readString() || undefined;
            const prefix = reader.readString() || undefined;
            const playerId = reader.readSignedShort();
            return {
                type: "chat",
                payload: {
                    messageType,
                    text,
                    from,
                    prefix,
                    playerId: playerId >= 0 ? playerId : undefined,
                    chatType,
                },
            };
        }

        case ServerMessageId.FRIENDS_CHAT_UPDATE: {
            let channel: FriendsChatSnapshot["channel"];
            if (reader.readBoolean()) {
                const name = reader.readString();
                const owner = reader.readString();
                const minKickRank = reader.readSignedByte();
                const localRank = reader.readSignedByte();
                const memberCount = reader.readShort();
                const members = [];
                for (let i = 0; i < memberCount; i++) {
                    members.push({
                        name: reader.readString(),
                        world: reader.readShort(),
                        rank: reader.readSignedByte(),
                    });
                }
                channel = { name, owner, minKickRank, localRank, members };
            }
            const friendCount = reader.readShort();
            const friends = [];
            for (let i = 0; i < friendCount; i++) {
                friends.push({
                    name: reader.readString(),
                    previousName: reader.readString(),
                    world: reader.readShort(),
                    rank: reader.readSignedByte(),
                    isOnline: reader.readBoolean(),
                });
            }
            const ignoreCount = reader.readShort();
            const ignores = [];
            for (let i = 0; i < ignoreCount; i++) {
                ignores.push({
                    name: reader.readString(),
                    previousName: reader.readString(),
                });
            }
            return { type: "friends_chat", payload: { channel, friends, ignores } };
        }

        case ServerMessageId.SOUND: {
            const soundId = reader.readShort();
            const hasPosition = reader.readBoolean();
            let x: number | undefined;
            let y: number | undefined;
            let level: number | undefined;
            if (hasPosition) {
                x = reader.readShort();
                y = reader.readShort();
                level = reader.readByte();
            }
            const loops = reader.readByte();
            const delay = reader.readShort();
            const radius = reader.readByte();
            const attenuation = reader.readByte();
            return {
                type: "sound",
                payload: { soundId, x, y, level, loops, delay, radius, attenuation },
            };
        }

        case ServerMessageId.PLAY_JINGLE:
            return {
                type: "play_jingle",
                payload: {
                    jingleId: reader.readShort(),
                    delay: reader.readUnsignedMediumIME(),
                },
            };

        case ServerMessageId.PLAY_SONG:
            return {
                type: "play_song",
                payload: {
                    trackId: reader.readShort(),
                    fadeOutDelay: reader.readShort(),
                    fadeOutDuration: reader.readShort(),
                    fadeInDelay: reader.readShort(),
                    fadeInDuration: reader.readShort(),
                },
            };

        case ServerMessageId.RUN_CLIENT_SCRIPT: {
            const scriptId = reader.readShort();
            const argCount = reader.readByte();
            const args: (number | string)[] = [];
            for (let i = 0; i < argCount; i++) {
                const type = reader.readByte();
                if (type === 0) {
                    args.push(reader.readString());
                } else {
                    args.push(reader.readInt());
                }
            }
            return {
                type: "runClientScript",
                payload: { scriptId, args },
            };
        }

        // ========================================
        // BANK
        // ========================================

        case ServerMessageId.BANK_SNAPSHOT: {
            const capacity = reader.readShort();
            const count = reader.readShort();
            const slots: any[] = [];
            for (let i = 0; i < count; i++) {
                const slot = reader.readShort();
                const itemId = reader.readShort() - 1;
                let quantity = reader.readByte();
                if (quantity === 255) {
                    quantity = reader.readInt();
                }
                const flags = reader.readByte();
                const placeholder = (flags & 1) !== 0;
                const tab = flags >> 1;
                slots.push({ slot, itemId, quantity, placeholder, tab });
            }
            return {
                type: "bank",
                payload: { kind: "snapshot", capacity, slots },
            };
        }

        case ServerMessageId.BANK_SLOT: {
            const slot = reader.readShort();
            const itemId = reader.readShort() - 1;
            let quantity = reader.readByte();
            if (quantity === 255) {
                quantity = reader.readInt();
            }
            const flags = reader.readByte();
            const placeholder = (flags & 1) !== 0;
            const tab = flags >> 1;
            return {
                type: "bank",
                payload: { kind: "slot", slot: { slot, itemId, quantity, placeholder, tab } },
            };
        }

        // ========================================
        // GROUND ITEMS
        // ========================================

        case ServerMessageId.GROUND_ITEMS: {
            const serial = reader.readInt();
            const count = reader.readShort();
            const stacks: any[] = [];
            for (let i = 0; i < count; i++) {
                stacks.push(readGroundItemStack());
            }
            readGroundItemMetadata(stacks);
            return {
                type: "ground_items",
                payload: { kind: "snapshot", serial, stacks },
            };
        }

        case ServerMessageId.GROUND_ITEMS_DELTA: {
            const serial = reader.readInt();
            const upsertCount = reader.readShort();
            const upserts: any[] = [];
            for (let i = 0; i < upsertCount; i++) {
                upserts.push(readGroundItemStack());
            }
            const removeCount = reader.readShort();
            const removes: number[] = [];
            for (let i = 0; i < removeCount; i++) {
                removes.push(reader.readInt());
            }
            readGroundItemMetadata(upserts);
            return {
                type: "ground_items",
                payload: { kind: "delta", serial, upserts, removes },
            };
        }

        // ========================================
        // PROJECTILES
        // ========================================

        case ServerMessageId.PROJECTILES: {
            const count = reader.readShort();
            const list: ProjectileLaunch[] = [];
            const decodeActorRef = (
                actorType: number,
                serverId: number,
            ): ProjectileLaunch["source"]["actor"] | undefined => {
                if (actorType === 1) {
                    return { kind: "player", serverId };
                }
                if (actorType === 2) {
                    return { kind: "npc", serverId };
                }
                return undefined;
            };
            for (let i = 0; i < count; i++) {
                list.push({
                    projectileId: reader.readShort(),
                    source: {
                        tileX: reader.readShort(),
                        tileY: reader.readShort(),
                        plane: reader.readByte(),
                        actor: undefined,
                    },
                    sourceHeight: reader.readShort(),
                    target: {
                        tileX: reader.readShort(),
                        tileY: reader.readShort(),
                        plane: reader.readByte(),
                        actor: undefined,
                    },
                    endHeight: reader.readShort(),
                    slope: reader.readByte(),
                    startPos: reader.readShort(),
                    startCycleOffset: reader.readShort(),
                    endCycleOffset: reader.readShort(),
                });
                const sourceActorType = reader.readByte();
                const sourceActorId = reader.readShort();
                const targetActorType = reader.readByte();
                const targetActorId = reader.readShort();
                const launch = list[i];
                launch.source.actor = decodeActorRef(sourceActorType, sourceActorId);
                launch.target.actor = decodeActorRef(targetActorType, targetActorId);
            }
            return {
                type: "projectiles",
                payload: { list },
            };
        }

        // ========================================
        // LOC CHANGE
        // ========================================

        case ServerMessageId.LOC_CHANGE: {
            const oldId = reader.readShort();
            const newId = reader.readShort();
            const tile = { x: reader.readShort(), y: reader.readShort() };
            const level = reader.readByte();
            const oldRotation = reader.readByte();
            const newRotation = reader.readByte();
            const hasNewTile = reader.readBoolean();
            let newTile: { x: number; y: number } | undefined;
            if (hasNewTile) {
                newTile = { x: reader.readShort(), y: reader.readShort() };
            }
            return {
                type: "loc_change",
                payload: {
                    oldId,
                    newId,
                    tile,
                    level,
                    oldTile: tile,
                    newTile,
                    oldRotation,
                    newRotation,
                },
            };
        }

        case ServerMessageId.LOC_ADD_CHANGE: {
            const locId = reader.readShort();
            const addTile = { x: reader.readShort(), y: reader.readShort() };
            const addLevel = reader.readByte();
            const shapeRot = reader.readByte();
            return {
                type: "loc_add_change",
                payload: {
                    locId,
                    tile: addTile,
                    level: addLevel,
                    shape: shapeRot >> 2,
                    rotation: shapeRot & 3,
                },
            };
        }

        case ServerMessageId.LOC_DEL: {
            const delTile = { x: reader.readShort(), y: reader.readShort() };
            const delLevel = reader.readByte();
            const delShapeRot = reader.readByte();
            return {
                type: "loc_del",
                payload: {
                    tile: delTile,
                    level: delLevel,
                    shape: delShapeRot >> 2,
                    rotation: delShapeRot & 3,
                },
            };
        }

        case ServerMessageId.LOC_ANIM: {
            const locId = reader.readShort();
            const tile = { x: reader.readShort(), y: reader.readShort() };
            const level = reader.readByte();
            const shapeRot = reader.readByte();
            const animId = reader.readShort();
            return {
                type: "loc_anim",
                payload: {
                    locId,
                    tile,
                    level,
                    shape: shapeRot >> 2,
                    rotation: shapeRot & 3,
                    animId,
                },
            };
        }

        case ServerMessageId.CAMERA_CONTROL: {
            const mode = reader.readByte();
            if (mode === 0) {
                return { type: "camera", payload: { mode: "reset" } };
            }
            if (mode === 1 || mode === 2) {
                return {
                    type: "camera",
                    payload: {
                        mode: mode === 1 ? "move" : "look",
                        x: reader.readShort(),
                        y: reader.readShort(),
                        height: reader.readShort(),
                        instant: reader.readBoolean(),
                    },
                };
            }
            if (mode === 3) {
                return {
                    type: "camera",
                    payload: {
                        mode: "shake",
                        slot: reader.readByte(),
                        randomAmplitude: reader.readShort(),
                        sineAmplitude: reader.readShort(),
                        sineFrequency: reader.readShort(),
                    },
                };
            }
            return null;
        }

        // ========================================
        // COMBAT STATE
        // ========================================

        case ServerMessageId.COMBAT_STATE: {
            const weaponCategory = reader.readByte();
            const weaponItemId = reader.readSignedShort();
            const autoRetaliate = reader.readBoolean();
            const activeStyle = reader.readByte();
            const activeSpellId = reader.readSignedShort();
            const specialEnergy = reader.readByte();
            const specialActivated = reader.readBoolean();
            const quickPrayersEnabled = reader.readBoolean();
            const activePrayersStr = reader.readString();
            const quickPrayersStr = reader.readString();
            return {
                type: "combat",
                payload: {
                    weaponCategory,
                    weaponItemId: weaponItemId >= 0 ? weaponItemId : undefined,
                    autoRetaliate,
                    activeStyle,
                    activeSpellId: activeSpellId >= 0 ? activeSpellId : undefined,
                    specialEnergy,
                    specialActivated,
                    quickPrayersEnabled,
                    activePrayers: activePrayersStr ? activePrayersStr.split(",") : [],
                    quickPrayers: quickPrayersStr ? quickPrayersStr.split(",") : [],
                },
            };
        }

        // ========================================
        // PLAYER ANIMATIONS
        // ========================================

        case ServerMessageId.ANIM: {
            const readAnim = () => {
                const v = reader.readSignedShort();
                return v >= 0 ? v : undefined;
            };
            return {
                type: "anim",
                payload: {
                    idle: readAnim(),
                    walk: readAnim(),
                    walkBack: readAnim(),
                    walkLeft: readAnim(),
                    walkRight: readAnim(),
                    run: readAnim(),
                    runBack: readAnim(),
                    runLeft: readAnim(),
                    runRight: readAnim(),
                    turnLeft: readAnim(),
                    turnRight: readAnim(),
                },
            };
        }

        // ========================================
        // PATH RESPONSE
        // ========================================

        case ServerMessageId.PATH_RESPONSE: {
            const id = reader.readInt();
            const ok = reader.readBoolean();
            const waypointCount = reader.readShort();
            const waypoints: Array<{ x: number; y: number }> = [];
            for (let i = 0; i < waypointCount; i++) {
                waypoints.push({ x: reader.readShort(), y: reader.readShort() });
            }
            const message = reader.readString() || undefined;
            return {
                type: "path",
                payload: {
                    id,
                    ok,
                    waypoints: waypoints.length > 0 ? waypoints : undefined,
                    message,
                },
            };
        }

        // ========================================
        // LOGIN/LOGOUT RESPONSE
        // ========================================

        case ServerMessageId.LOGIN_RESPONSE: {
            const success = reader.readBoolean();
            const errorCodeRaw = reader.readInt();
            const error = reader.readString() || undefined;
            const displayName = reader.readString() || undefined;
            const errorCode = errorCodeRaw >= 0 ? errorCodeRaw | 0 : undefined;
            return {
                type: "login_response",
                payload: { success, errorCode, error, displayName },
            };
        }

        case ServerMessageId.LOGOUT_RESPONSE: {
            const success = reader.readBoolean();
            const reason = reader.readString() || undefined;
            return {
                type: "logout_response",
                payload: { success, reason },
            };
        }

        // ========================================
        // SHOP
        // ========================================

        case ServerMessageId.SHOP_OPEN: {
            const shopId = reader.readString();
            const name = reader.readString();
            const currencyItemId = reader.readShort();
            const generalStore = reader.readBoolean();
            const buyMode = reader.readByte();
            const sellMode = reader.readByte();
            const stockCount = reader.readShort();
            const stock: any[] = [];
            for (let i = 0; i < stockCount; i++) {
                stock.push({
                    slot: reader.readShort(),
                    itemId: reader.readShort(),
                    quantity: reader.readInt(),
                    defaultQuantity: reader.readInt(),
                    priceEach: reader.readInt(),
                    sellPrice: reader.readInt(),
                });
            }
            return {
                type: "shop",
                payload: {
                    kind: "open",
                    shopId,
                    name,
                    currencyItemId,
                    generalStore,
                    buyMode,
                    sellMode,
                    stock,
                },
            };
        }

        case ServerMessageId.SHOP_SLOT: {
            const shopId = reader.readString();
            return {
                type: "shop",
                payload: {
                    kind: "slot",
                    shopId,
                    slot: {
                        slot: reader.readShort(),
                        itemId: reader.readShort(),
                        quantity: reader.readInt(),
                        defaultQuantity: reader.readInt(),
                        priceEach: reader.readInt(),
                        sellPrice: reader.readInt(),
                    },
                },
            };
        }

        case ServerMessageId.SHOP_CLOSE:
            return {
                type: "shop",
                payload: { kind: "close" },
            };

        case ServerMessageId.SHOP_MODE: {
            const shopId = reader.readString();
            return {
                type: "shop",
                payload: {
                    kind: "mode",
                    shopId,
                    buyMode: reader.readByte(),
                    sellMode: reader.readByte(),
                },
            };
        }

        // ========================================
        // TRADE
        // ========================================

        case ServerMessageId.TRADE_REQUEST: {
            const fromId = reader.readShort();
            const fromName = reader.readString() || undefined;
            return {
                type: "trade",
                payload: { kind: "request", fromId, fromName },
            };
        }

        case ServerMessageId.TRADE_OPEN:
        case ServerMessageId.TRADE_UPDATE: {
            const sessionId = reader.readString();
            const stage = reader.readByte() === 0 ? "offer" : "confirm";
            const info = reader.readString() || undefined;

            const readParty = () => {
                const playerId = reader.readSignedShort();
                const name = reader.readString() || undefined;
                const accepted = reader.readBoolean();
                const confirmAccepted = reader.readBoolean();
                const offerCount = reader.readByte();
                const offers: any[] = [];
                for (let i = 0; i < offerCount; i++) {
                    offers.push({
                        slot: reader.readShort(),
                        itemId: reader.readShort(),
                        quantity: reader.readInt(),
                    });
                }
                return {
                    playerId: playerId >= 0 ? playerId : undefined,
                    name,
                    offers,
                    accepted,
                    confirmAccepted,
                };
            };

            const self = readParty();
            const other = readParty();

            return {
                type: "trade",
                payload: {
                    kind: opcode === ServerMessageId.TRADE_OPEN ? "open" : "update",
                    sessionId,
                    stage,
                    self,
                    other,
                    info,
                },
            };
        }

        case ServerMessageId.TRADE_CLOSE: {
            const reason = reader.readString() || undefined;
            return {
                type: "trade",
                payload: { kind: "close", reason },
            };
        }

        // ========================================
        // SPELL RESULT
        // ========================================

        case ServerMessageId.SPELL_RESULT: {
            const casterId = reader.readShort();
            const spellId = reader.readShort();
            const outcome = reader.readByte() === 1 ? "success" : "failure";
            const reason = reader.readString() || undefined;

            const targetTypes = ["npc", "player", "loc", "obj", "tile", "item"];
            const targetType = targetTypes[reader.readByte()] as
                | "npc"
                | "player"
                | "loc"
                | "obj"
                | "tile"
                | "item";
            const targetIdRaw = reader.readSignedShort();
            const targetId = targetIdRaw >= 0 ? targetIdRaw : undefined;

            const hasTile = reader.readBoolean();
            let tile: { x: number; y: number; plane?: number } | undefined;
            if (hasTile) {
                tile = {
                    x: reader.readShort(),
                    y: reader.readShort(),
                    plane: reader.readByte(),
                };
            }

            const modFlags = reader.readByte();
            const castMode = reader.readString() || undefined;
            const modifiers: any = {};
            if (modFlags & 1) modifiers.isAutocast = true;
            if (modFlags & 2) modifiers.defensive = true;
            if (modFlags & 4) modifiers.queued = true;
            if (castMode) modifiers.castMode = castMode;

            const consumedCount = reader.readByte();
            const runesConsumed: Array<{ itemId: number; quantity: number }> = [];
            for (let i = 0; i < consumedCount; i++) {
                runesConsumed.push({
                    itemId: reader.readShort(),
                    quantity: reader.readInt(),
                });
            }

            const refundedCount = reader.readByte();
            const runesRefunded: Array<{ itemId: number; quantity: number }> = [];
            for (let i = 0; i < refundedCount; i++) {
                runesRefunded.push({
                    itemId: reader.readShort(),
                    quantity: reader.readInt(),
                });
            }

            const hitDelay = reader.readSignedShort();
            const impactSpotAnim = reader.readSignedShort();
            const castSpotAnim = reader.readSignedShort();
            const splashSpotAnim = reader.readSignedShort();
            const damage = reader.readSignedShort();
            const maxHit = reader.readSignedShort();
            const accuracy = reader.readSignedShort();

            return {
                type: "spell_result",
                payload: {
                    casterId,
                    spellId,
                    outcome,
                    reason,
                    targetType,
                    targetId,
                    tile,
                    modifiers: Object.keys(modifiers).length > 0 ? modifiers : undefined,
                    runesConsumed: runesConsumed.length > 0 ? runesConsumed : undefined,
                    runesRefunded: runesRefunded.length > 0 ? runesRefunded : undefined,
                    hitDelay: hitDelay >= 0 ? hitDelay : undefined,
                    impactSpotAnim: impactSpotAnim >= 0 ? impactSpotAnim : undefined,
                    castSpotAnim: castSpotAnim >= 0 ? castSpotAnim : undefined,
                    splashSpotAnim: splashSpotAnim >= 0 ? splashSpotAnim : undefined,
                    damage: damage >= 0 ? damage : undefined,
                    maxHit: maxHit >= 0 ? maxHit : undefined,
                    accuracy: accuracy >= 0 ? accuracy : undefined,
                },
            };
        }

        // ========================================
        // SMITHING
        // ========================================

        case ServerMessageId.SMITHING_OPEN: {
            const mode = reader.readByte() === 1 ? "forge" : "smelt";
            const title = reader.readString();
            const optionCount = reader.readShort();
            const options: any[] = [];
            for (let i = 0; i < optionCount; i++) {
                const recipeId = reader.readString();
                const name = reader.readString();
                const level = reader.readByte();
                const itemId = reader.readShort();
                const outputQuantity = reader.readShort();
                const available = reader.readShort();
                const canMake = reader.readBoolean();
                const xp = reader.readShort();
                const ingredientsLabel = reader.readString() || undefined;
                const optMode = reader.readByte() === 1 ? "forge" : "smelt";
                const barItemId = reader.readSignedShort();
                const barCount = reader.readByte();
                const flags = reader.readByte();
                const requiresHammer = (flags & 1) !== 0;
                const hasHammer = (flags & 2) !== 0;
                options.push({
                    recipeId,
                    name,
                    level,
                    itemId,
                    outputQuantity,
                    available,
                    canMake,
                    xp: xp > 0 ? xp : undefined,
                    ingredientsLabel,
                    mode: optMode,
                    barItemId: barItemId >= 0 ? barItemId : undefined,
                    barCount: barCount > 0 ? barCount : undefined,
                    requiresHammer: requiresHammer || undefined,
                    hasHammer: hasHammer || undefined,
                });
            }
            const quantityMode = reader.readByte();
            const customQuantity = reader.readInt();
            return {
                type: "smithing",
                payload: {
                    kind: "open",
                    mode,
                    title,
                    options,
                    quantityMode,
                    customQuantity: customQuantity > 0 ? customQuantity : undefined,
                },
            };
        }

        case ServerMessageId.SMITHING_MODE: {
            const quantityMode = reader.readByte();
            const customQuantity = reader.readInt();
            return {
                type: "smithing",
                payload: {
                    kind: "mode",
                    quantityMode,
                    customQuantity: customQuantity > 0 ? customQuantity : undefined,
                },
            };
        }

        case ServerMessageId.SMITHING_CLOSE:
            return {
                type: "smithing",
                payload: { kind: "close" },
            };

        // ========================================
        // COLLECTION LOG
        // ========================================

        case ServerMessageId.COLLECTION_LOG_SNAPSHOT: {
            const count = reader.readShort();
            const slots: Array<{ slot: number; itemId: number; quantity: number }> = [];
            for (let i = 0; i < count; i++) {
                slots.push({
                    slot: reader.readShort(),
                    itemId: reader.readShort(),
                    quantity: reader.readInt(),
                });
            }
            return {
                type: "collection_log",
                payload: { kind: "snapshot", slots },
            };
        }

        case ServerMessageId.COLLECTION_LOG_CATEGORY_COMPLETION: {
            // Mirrors encodeCollectionLogCategoryCompletion in
            // apps/server/src/network/packet/ServerBinaryEncoder.ts exactly:
            // [tabCount:byte] then per tab [tabIndex:byte, categoryCount:short, ...categoryCount x isComplete:byte]
            const tabCount = reader.readByte();
            const completionByTab: Record<number, boolean[]> = {};
            for (let i = 0; i < tabCount; i++) {
                const tabIndex = reader.readByte();
                const categoryCount = reader.readShort();
                const completion: boolean[] = [];
                for (let j = 0; j < categoryCount; j++) {
                    completion.push(reader.readByte() === 1);
                }
                completionByTab[tabIndex] = completion;
            }
            return {
                type: "collection_log",
                payload: { kind: "category_completion", completionByTab },
            };
        }

        // ========================================
        // NOTIFICATIONS
        // ========================================

        case ServerMessageId.NOTIFICATION: {
            const kinds = [
                "loot",
                "achievement",
                "level_up",
                "quest",
                "warning",
                "info",
                "league_task",
                "collection_log",
            ];
            const kind = kinds[reader.readByte()] || "info";
            const title = reader.readString();
            const message = reader.readString();
            const itemId = reader.readShort();
            const quantity = reader.readInt();
            const durationMs = reader.readShort();
            return {
                type: "notification",
                payload: {
                    kind,
                    title,
                    message,
                    itemId,
                    quantity,
                    durationMs,
                },
            };
        }

        // ========================================
        // DEBUG
        // ========================================

        case ServerMessageId.DEBUG_PACKET: {
            const jsonStr = reader.readString();
            try {
                const payload = JSON.parse(jsonStr);
                return {
                    type: "debug",
                    payload,
                };
            } catch {
                return {
                    type: "debug",
                    payload: { raw: jsonStr },
                };
            }
        }

        case ServerMessageId.GAMEMODE_DATA: {
            const flags = reader.readByte();
            const jsonLength = reader.readInt() >>> 0;
            if (jsonLength > MAX_GAMEMODE_DATA_JSON_BYTES) return null;
            const compressed = (flags & 1) !== 0;
            const rawBytes = reader.readBytes(reader.remaining);
            const jsonBytes = compressed
                ? inflateGamemodeData(rawBytes, jsonLength)
                : rawBytes;
            if (jsonBytes.byteLength !== jsonLength) return null;
            const jsonStr = new TextDecoder().decode(jsonBytes);
            try {
                const payload = JSON.parse(jsonStr);
                return {
                    type: "gamemode_data",
                    payload,
                };
            } catch {
                console.log("[gamemode_data] failed to parse JSON payload");
                return null;
            }
        }

        default:
            console.warn(`Unknown server packet opcode: ${opcode}`);
            return null;
    }
}

/**
 * Check if data is binary (starts with valid opcode) or JSON (starts with '{')
 */
export function isBinaryPacket(data: ArrayBuffer | string): boolean {
    if (typeof data === "string") {
        return false;
    }
    const view = new Uint8Array(data);
    if (view.length === 0) return false;
    // JSON starts with '{' (0x7B)
    return view[0] !== 0x7b;
}

/**
 * Decode multiple batched packets from a single ArrayBuffer
 * Server may concatenate multiple packets into one message for efficiency
 */
export function decodeBatchedServerPackets(data: Uint8Array | ArrayBuffer): DecodedServerMessage[] {
    const messages: DecodedServerMessage[] = [];
    const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    if (buffer.byteLength > MAX_BATCHED_SERVER_BYTES) return messages;
    let offset = 0;
    let packetCount = 0;

    while (offset < buffer.length) {
        if (++packetCount > MAX_BATCHED_SERVER_PACKETS) return [];
        const remaining = buffer.length - offset;
        if (remaining < 1) break;

        const opcode = buffer[offset] as ServerMessageId;
        const fixedLength = SERVER_MESSAGE_LENGTHS[opcode];

        let packetLength: number;
        let headerSize: number;

        if (fixedLength === undefined) {
            // Unknown opcode - can't continue parsing
            console.warn(`[batch] Unknown opcode ${opcode} at offset ${offset}`);
            break;
        } else if (fixedLength === -1) {
            // Variable byte length
            if (remaining < 2) break;
            packetLength = buffer[offset + 1];
            headerSize = 2;
        } else if (fixedLength === -2) {
            // Variable short length
            if (remaining < 3) break;
            packetLength = (buffer[offset + 1] << 8) | buffer[offset + 2];
            headerSize = 3;
        } else {
            // Fixed length
            packetLength = fixedLength;
            headerSize = 1;
        }

        const totalPacketSize = headerSize + packetLength;
        if (remaining < totalPacketSize) {
            console.warn(
                `[batch] Incomplete packet at offset ${offset}, need ${totalPacketSize}, have ${remaining}`,
            );
            break;
        }

        // Extract this packet and decode it
        const packetData = buffer.slice(offset, offset + totalPacketSize);
        const decoded = decodeServerPacket(packetData);
        if (decoded) {
            messages.push(decoded);
        }

        offset += totalPacketSize;
    }

    return messages;
}

/**
 * Read a position delta using the OSRS typed-value tag format.
 * Flags byte packs encoding width (0=zero, 1=byte, 2=short, 3=int)
 * for x (bits 0-1), y (bits 2-3), z (bits 4-5), orientation (bits 6-7).
 */
function readPositionDelta(reader: ServerPacketReader): {
    x: number;
    y: number;
    z: number;
    orientation: number;
} {
    const flags = reader.readSignedByte();
    if (flags === 0) return { x: 0, y: 0, z: 0, orientation: 0 };
    const x = readTypedValue(reader, flags, 0);
    const y = readTypedValue(reader, flags, 2);
    const z = readTypedValue(reader, flags, 4);
    const orientation = readTypedValue(reader, flags, 6);
    return { x, y, z, orientation };
}

function readTypedValue(reader: ServerPacketReader, flags: number, bitShift: number): number {
    const encoding = (flags >> bitShift) & 3;
    if (encoding === 3) return reader.readInt();
    if (encoding === 2) return reader.readSignedShort();
    if (encoding === 1) return reader.readSignedByte();
    return 0;
}

function readMaskUpdate(
    reader: ServerPacketReader,
): { animationId?: number; sequenceFrame?: number; actionMask?: number } | undefined {
    const maskByte = reader.readByte() & 0xff;
    if (maskByte === 0) return undefined;
    let animationId: number | undefined;
    let sequenceFrame: number | undefined;
    let actionMask: number | undefined;
    if (maskByte & 1) {
        animationId = reader.readShort() & 0xffff;
        sequenceFrame = reader.readByte() & 0xff;
    }
    if (maskByte & 2) {
        actionMask = reader.readByte() & 0xff;
    }
    return { animationId, sequenceFrame, actionMask };
}
