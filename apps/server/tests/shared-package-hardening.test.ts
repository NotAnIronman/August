import assert from "node:assert/strict";

import { CustomItemBuilder } from "@august/custom-content/items/CustomItemBuilder";
import { CustomItemRegistryStore } from "@august/custom-content/items/CustomItemRegistry";
import { CustomObjTypeLoader } from "@august/custom-content/items/CustomObjTypeLoader";
import { isPowerOfTwo, nextIntJagex } from "@august/game-model/math/MathUtil";
import {
    MovementDirection,
    deltaToDirection,
    deltaToRunDirection,
    directionToDelta,
    runDirectionToDelta,
} from "@august/game-model/movement/Direction";
import {
    deriveRegionsFromCenter,
    deriveRegionsFromTemplates,
    packTemplateChunk,
} from "@august/game-model/world/instance/InstanceTypes";
import { formatBytes } from "@august/protocol/binary/ByteSizeFormatter";
import { XxHasher } from "@august/protocol/hashing/XxHash";
import { buildSelectedSpellPayload } from "@august/protocol/spells/selectedSpellPayload";
import { isClientMessageId } from "@august/protocol/transport/messages/ClientMessage";
import { normalizeBossHealth } from "@august/protocol/ui/bossHealthBar";
import { BoundedLruCache } from "@august/osrs-engine/cache/BoundedLruCache";
import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheFiles } from "@august/osrs-engine/cache/CacheFiles";
import { GroupMissingError } from "@august/osrs-engine/cache/js5/GroupMissingError";
import { PresenceBitset } from "@august/osrs-engine/cache/js5/PresenceBitset";
import { ReferenceTable } from "@august/osrs-engine/cache/ref/ReferenceTable";
import {
    MemoryStore,
    parseCacheIndexFileId,
} from "@august/osrs-engine/cache/store/MemoryStore";
import { Sector } from "@august/osrs-engine/cache/store/Sector";
import { SparseMemoryStore } from "@august/osrs-engine/cache/store/SparseMemoryStore";
import { BaseTypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { Type } from "@august/osrs-engine/config/Type";
import { ObjType } from "@august/osrs-engine/config/objtype/ObjType";
import { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import type { VarBitTypeLoader } from "@august/osrs-engine/config/vartype/bit/VarBitTypeLoader";
import {
    MAX_INTERACTION_INDEX,
    MAX_INTERACTION_TARGET_ID,
    NO_INTERACTION,
    decodeInteractionIndex,
    encodeInteractionIndex,
} from "@august/osrs-engine/interaction/InteractionIndex";
import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { MatrixPool } from "@august/osrs-engine/model/skeletal/MatrixPool";
import { QuatPool } from "@august/osrs-engine/model/skeletal/QuatPool";
import { CollisionMap } from "@august/osrs-engine/scene/CollisionMap";

const cacheInfo: CacheInfo = {
    name: "test",
    game: "oldschool",
    environment: "live",
    revision: 237,
    timestamp: "2026-01-01T00:00:00.000Z",
    size: 0,
};

function pushShort(output: number[], value: number): void {
    output.push((value >>> 8) & 0xff, value & 0xff);
}

function pushInt(output: number[], value: number): void {
    output.push(
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    );
}

function writeMedium(output: Uint8Array, offset: number, value: number): void {
    output[offset] = (value >>> 16) & 0xff;
    output[offset + 1] = (value >>> 8) & 0xff;
    output[offset + 2] = value & 0xff;
}

function writeShort(output: Uint8Array, offset: number, value: number): void {
    output[offset] = (value >>> 8) & 0xff;
    output[offset + 1] = value & 0xff;
}

function testMathAndMovementContracts(): void {
    assert.equal(isPowerOfTwo(0), false);
    assert.equal(isPowerOfTwo(-2), false);
    assert.equal(isPowerOfTwo(2 ** 40), true);
    assert.equal(isPowerOfTwo(2 ** 40 + 1), false);
    assert.throws(() => nextIntJagex(null as never, 0), RangeError);
    assert.throws(() => nextIntJagex(null as never, 1.5), RangeError);

    assert.equal(deltaToDirection(1, 1), MovementDirection.NorthEast);
    assert.equal(deltaToDirection(0.5, 1), undefined);
    assert.equal(deltaToRunDirection(2, -1), 6);
    assert.equal(deltaToRunDirection(1, 1), -1);
    assert.equal(runDirectionToDelta(16), undefined);
    assert.deepEqual(directionToDelta(MovementDirection.West), { dx: -1, dy: 0 });
    assert.equal(Object.isFrozen(directionToDelta(MovementDirection.West)), true);
}

function testInstanceInputValidation(): void {
    const partial = [[[packTemplateChunk(0, 48, 400, 0)]]];
    assert.deepEqual(deriveRegionsFromTemplates(partial), [(6 << 8) | 50]);
    assert.deepEqual(deriveRegionsFromTemplates([]), []);
    assert.deepEqual(deriveRegionsFromCenter(Number.POSITIVE_INFINITY, 0), []);
}

function testProtocolNormalization(): void {
    assert.equal(formatBytes(0.5), "0.5 Bytes");
    assert.equal(formatBytes(Number.NaN), "0 Bytes");
    assert.match(formatBytes(Number.MAX_VALUE, 10_000), / YB$/);

    assert.equal(isClientMessageId(180), true);
    assert.equal(isClientMessageId(181), false);
    assert.equal(isClientMessageId(256), false);

    const spell = buildSelectedSpellPayload(0x12340005);
    assert.equal(spell?.spellbookGroupId, 0x1234);
    assert.equal(spell?.selectedSpellChildIndex, 5);
    assert.equal(buildSelectedSpellPayload(0x80000000), undefined);
    assert.equal(buildSelectedSpellPayload(1.25), undefined);

    assert.deepEqual(normalizeBossHealth(1e308, 1e308), {
        current: 1e308,
        maximum: 1e308,
        percent: 100,
    });
}

async function testXxHashFallbackAndFastPath(): Promise<void> {
    const encoder = new TextEncoder();
    const vectors: Array<[string, bigint]> = [
        ["", 0xef46db3751d8e999n],
        ["a", 0xd24ec4f1a98c6e5bn],
        ["abc", 0x44bc2cf5ad770999n],
    ];
    for (const [input, expected] of vectors) {
        assert.equal(XxHasher.hash64js(encoder.encode(input)), expected);
    }
    const wrapped = encoder.encode("--abc++");
    assert.equal(XxHasher.hash64js(wrapped.subarray(2, 5)), vectors[2][1]);
    assert.equal(XxHasher.hash64js(encoder.encode("repeat")), XxHasher.hash64js(encoder.encode("repeat")));

    const api = await XxHasher.init();
    for (const [input, expected] of vectors) {
        assert.equal(api.h64Raw(encoder.encode(input)), expected);
        assert.equal(XxHasher.hash64(encoder.encode(input)), expected);
    }
    for (let length = 0; length <= 96; length++) {
        const input = Uint8Array.from({ length }, (_, index) => (index * 31 + length) & 0xff);
        assert.equal(XxHasher.hash64js(input), api.h64Raw(input), `XXH64 length ${length}`);
    }
}

function testByteBufferBoundsAndViews(): void {
    const backing = new Uint8Array([99, 1, 2, 3, 4, 88]);
    const buffer = new ByteBuffer(backing.subarray(1, 5));
    assert.deepEqual([...buffer.readUnsignedBytes(4)], [1, 2, 3, 4]);
    assert.throws(() => buffer.readByte(), /Buffer overflow/);

    const randomAccess = new ByteBuffer(new Int8Array([1, 2, 3, 4]));
    assert.equal(randomAccess.getInt(0), 0x01020304);
    assert.throws(() => randomAccess.getInt(1), /Buffer overflow/);
    assert.throws(() => randomAccess.getByte(-1), /Buffer overflow/);

    const output = new ByteBuffer(4);
    output.writeInt(0x01020304);
    assert.deepEqual([...output.data], [1, 2, 3, 4]);
    assert.throws(() => output.writeInt(0), /Buffer overflow/);
    assert.throws(() => output.setInt(1, 0), /Buffer overflow/);
}

function testProtocol7ReferenceTableLayout(): void {
    const encoded: number[] = [];
    encoded.push(7);
    pushInt(encoded, 42);
    encoded.push(0xf);
    pushShort(encoded, 1); // archive count (small big-smart)
    pushShort(encoded, 2); // archive id delta
    pushInt(encoded, 0x10203040); // archive name hash
    pushInt(encoded, 0x11223344); // compressed CRC
    pushInt(encoded, 0x556677); // uncompressed CRC (currently not exposed)
    for (let i = 0; i < 64; i++) encoded.push(i); // Whirlpool digest
    pushInt(encoded, 123); // compressed length
    pushInt(encoded, 456); // uncompressed length
    pushInt(encoded, 0x12345678); // archive revision
    pushShort(encoded, 1); // file count
    pushShort(encoded, 0); // first file id delta
    pushInt(encoded, 0x01020304); // file name hash

    const payload = Uint8Array.from(encoded);
    const wrapped = new Uint8Array(payload.length + 9);
    wrapped.set(payload, 5);
    const buffer = new ByteBuffer(wrapped.subarray(5, 5 + payload.length));
    const table = ReferenceTable.decode(buffer);
    const reference = table.getArchiveReference(2);

    assert.ok(reference);
    assert.equal(reference.crc, 0x11223344);
    assert.equal(reference.revision, 0x12345678);
    assert.equal(reference.whirlpool.length, 64);
    assert.equal(reference.whirlpool[63], 63);
    assert.equal(reference.getFileReference(0)?.nameHash, 0x01020304);
    assert.equal(buffer.offset, payload.length);
    assert.equal(table.getArchiveReference(2), reference, "archive references should be memoized");
}

function testMemoryStoreSectorValidation(): void {
    const index = new Uint8Array(6);
    writeMedium(index, 0, 513);
    writeMedium(index, 3, 1);

    const dat = new Uint8Array(Sector.SIZE * 3);
    const first = Sector.SIZE;
    writeShort(dat, first, 0);
    writeShort(dat, first + 2, 0);
    writeMedium(dat, first + 4, 2);
    dat[first + 7] = 1;
    for (let i = 0; i < 512; i++) dat[first + 8 + i] = i & 0xff;

    const second = Sector.SIZE * 2;
    writeShort(dat, second, 0);
    writeShort(dat, second + 2, 1);
    writeMedium(dat, second + 4, 0);
    dat[second + 7] = 1;
    dat[second + 8] = 77;

    const store = new MemoryStore(dat.buffer, [index.buffer]);
    const data = store.read(0, 0);
    assert.equal(data.length, 513);
    assert.equal(data[512], 77);

    writeShort(dat, second + 2, 2);
    assert.throws(() => store.read(0, 0), /Sector chunk mismatch/);
    writeShort(dat, second + 2, 1);
    writeMedium(dat, first + 4, 0);
    assert.throws(() => store.read(0, 0), /chain ended/);
}

function testCacheIndexAndPresenceBounds(): void {
    assert.equal(parseCacheIndexFileId("main_file_cache.idx0"), 0);
    assert.equal(parseCacheIndexFileId("main_file_cache.idx254"), 254);
    assert.equal(parseCacheIndexFileId("main_file_cache.idx01"), undefined);
    assert.equal(parseCacheIndexFileId("main_file_cache.idx1junk"), undefined);
    assert.equal(parseCacheIndexFileId("main_file_cache.idx256"), undefined);

    const files = new Map<string, ArrayBuffer>([
        [CacheFiles.DAT2_FILE_NAME, new ArrayBuffer(Sector.SIZE)],
        ["main_file_cache.idx0", new ArrayBuffer(0)],
        ["main_file_cache.idx4294967294", new ArrayBuffer(0)],
    ]);
    const store = MemoryStore.fromFiles(new CacheFiles(files));
    assert.equal(store.indexFiles.length, 1, "invalid filenames must not expand the index array");
    assert.throws(() => store.addIndexFile(256, new ArrayBuffer(0)), RangeError);

    assert.throws(() => PresenceBitset.forSectorCount(Number.NaN, false), RangeError);
    assert.throws(
        () => PresenceBitset.forSectorCount(Number.MAX_SAFE_INTEGER, false),
        RangeError,
    );
    const presence = PresenceBitset.forSectorCount(9, false);
    const sparseStore = SparseMemoryStore.fromSparseFiles(new CacheFiles(files), presence);
    assert.equal(sparseStore.indexFiles.length, 1);
    presence.markSectors(0, Number.MAX_SAFE_INTEGER);
    assert.equal(presence.hasSectors(0, 16), true);
    assert.equal(presence.hasSectors(0, Number.MAX_SAFE_INTEGER), false);
    assert.equal(presence.hasSectors(Number.NaN, 1), false);
}

class TestType extends Type {
    value = 0;

    override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
        if (opcode !== 1) throw new Error(`unexpected opcode ${opcode}`);
        this.value = buffer.readUnsignedByte();
    }
}

class RetryTypeLoader extends BaseTypeLoader<TestType> {
    attempts = 0;

    constructor() {
        super(TestType, cacheInfo);
    }

    override getDataBuffer(): ByteBuffer {
        this.attempts++;
        if (this.attempts === 1) throw new GroupMissingError(2, 3, 4, 5);
        return new ByteBuffer(new Int8Array([1, 42, 0]));
    }

    override getCount(): number {
        return 1;
    }
}

function testTransientTypeLoadsAreRetryable(): void {
    const loader = new RetryTypeLoader();
    assert.throws(() => loader.load(0), GroupMissingError);
    const loaded = loader.load(0);
    assert.equal(loaded.value, 42);
    assert.equal(loader.load(0), loaded);
    assert.equal(loader.attempts, 2);
}

function testBoundedCachesAndCustomRegistryRefresh(): void {
    const lru = new BoundedLruCache<number, string>(2);
    lru.set(1, "one").set(2, "two");
    assert.equal(lru.get(1), "one");
    lru.set(3, "three");
    assert.equal(lru.has(1), true);
    assert.equal(lru.has(2), false);

    const recolorFrom = [1];
    const builder = CustomItemBuilder.create(50_000).name("First").recolor(recolorFrom, [2]);
    recolorFrom[0] = 99;
    const firstDefinition = builder.build();
    assert.deepEqual(firstDefinition.objType.recolorFrom, [1]);
    firstDefinition.objType.recolorFrom![0] = 88;
    assert.deepEqual(builder.build().objType.recolorFrom, [1]);

    const registry = new CustomItemRegistryStore();
    registry.register(builder.build());
    assert.equal(registry.getMaxCustomId(), 50_000);

    const baseLoader = {
        load: (id: number) => new ObjType(id, cacheInfo),
        getCount: () => 100,
        clearCache: () => {},
    };
    const loader = new CustomObjTypeLoader(baseLoader, cacheInfo, registry, 1);
    assert.equal(loader.load(50_000).name, "First");
    registry.clear();
    registry.register(CustomItemBuilder.create(50_000).name("Reloaded").build());
    assert.equal(loader.load(50_000).name, "Reloaded");
}

function testVarInteractionAndCollisionBounds(): void {
    const emptyVarbits: VarBitTypeLoader = {
        load: () => undefined as never,
        getCount: () => 0,
        clearCache: () => {},
    };
    const vars = new VarManager(emptyVarbits);
    assert.equal(vars.getVarp(-1), 0);
    assert.equal(vars.setVarp(-1, 1), false);
    vars.registerVarbit(1, 0, 0, 1);
    assert.equal(vars.setVarbit(1, 3), true);
    assert.equal(vars.getVarbit(1), 3);
    assert.throws(() => vars.registerVarbit(2, 0, 31, 32), RangeError);

    assert.equal(encodeInteractionIndex("npc", MAX_INTERACTION_TARGET_ID), MAX_INTERACTION_TARGET_ID);
    assert.equal(encodeInteractionIndex("player", MAX_INTERACTION_TARGET_ID), MAX_INTERACTION_INDEX);
    assert.equal(encodeInteractionIndex("npc", MAX_INTERACTION_TARGET_ID + 1), NO_INTERACTION);
    assert.equal(decodeInteractionIndex(1.5), null);

    const collision = new CollisionMap(8, 8);
    assert.equal(collision.isWithinBounds(1.5, 1), false);
    assert.equal(collision.getFlag(-1, 1), 0xffffff);
    assert.equal(collision.getFlag(8, 1), 0xffffff);
}

function testPoolCapacity(): void {
    MatrixPool.init(1);
    MatrixPool.release(MatrixPool.get());
    MatrixPool.release(MatrixPool.get());
    assert.equal(MatrixPool.matrixIndex, 1);
    MatrixPool.init(100);

    QuatPool.init(1);
    QuatPool.release(QuatPool.get());
    QuatPool.release(QuatPool.get());
    assert.equal(QuatPool.quatIndex, 1);
    QuatPool.init(100);
}

async function main(): Promise<void> {
    testMathAndMovementContracts();
    testInstanceInputValidation();
    testProtocolNormalization();
    await testXxHashFallbackAndFastPath();
    testByteBufferBoundsAndViews();
    testProtocol7ReferenceTableLayout();
    testMemoryStoreSectorValidation();
    testCacheIndexAndPresenceBounds();
    testTransientTypeLoadsAreRetryable();
    testBoundedCachesAndCustomRegistryRefresh();
    testVarInteractionAndCollisionBounds();
    testPoolCapacity();
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
