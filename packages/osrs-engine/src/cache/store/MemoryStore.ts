import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { ApiType } from "@august/osrs-engine/cache/ApiType";
import { CacheFiles } from "@august/osrs-engine/cache/CacheFiles";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheStore } from "@august/osrs-engine/cache/store/CacheStore";
import { Sector } from "@august/osrs-engine/cache/store/Sector";
import { SectorCluster } from "@august/osrs-engine/cache/store/SectorCluster";
import { MAX_CACHE_INDEX_COUNT } from "@august/osrs-engine/cache/CacheLimits";

const CANONICAL_DECIMAL_ID = /^(?:0|[1-9]\d*)$/;

/** Parse a canonical cache index filename without permitting sparse-array abuse. */
export function parseCacheIndexFileId(name: string): number | undefined {
    if (!name.startsWith(CacheFiles.INDEX_FILE_PREFIX)) return undefined;
    const suffix = name.slice(CacheFiles.INDEX_FILE_PREFIX.length);
    if (!CANONICAL_DECIMAL_ID.test(suffix)) return undefined;
    const id = Number(suffix);
    return Number.isSafeInteger(id) && id >= 0 && id < MAX_CACHE_INDEX_COUNT
        ? id
        : undefined;
}

export class MemoryStore implements CacheStore<ApiType.SYNC> {
    static fromFiles(cacheFiles: CacheFiles, indicesToLoad: number[] = []): MemoryStore {
        const files = cacheFiles.files;

        const indexFiles: ArrayBuffer[] = [];
        const indicesSet = new Set(indicesToLoad);
        for (const [name, data] of files.entries()) {
            if (
                name !== CacheFiles.META_FILE_NAME &&
                name.startsWith(CacheFiles.INDEX_FILE_PREFIX)
            ) {
                const indexId = parseCacheIndexFileId(name);
                if (indexId === undefined) continue;
                if (indicesSet.size === 0 || indicesSet.has(indexId)) {
                    indexFiles[indexId] = data;
                }
            }
        }

        const dataFile =
            files.get(CacheFiles.DAT2_FILE_NAME) || files.get(CacheFiles.DAT_FILE_NAME);
        if (!dataFile) {
            throw new Error("main_file_cache data file not found");
        }
        const metaFile = files.get(CacheFiles.META_FILE_NAME);
        return new MemoryStore(dataFile, indexFiles, metaFile);
    }

    constructor(
        readonly dataFile: ArrayBuffer,
        readonly indexFiles: (ArrayBuffer | undefined)[],
        readonly metaFile?: ArrayBuffer,
    ) {}

    /** Add an index file dynamically (for incremental loading) */
    addIndexFile(indexId: number, data: ArrayBuffer): void {
        if (!Number.isInteger(indexId) || indexId < 0 || indexId >= MAX_CACHE_INDEX_COUNT) {
            throw new RangeError(`Cache index ID out of range: ${indexId}`);
        }
        this.indexFiles[indexId] = data;
    }

    getIndexFile(indexId: number): ArrayBuffer | undefined {
        if (indexId === CacheIndex.META_INDEX_ID) {
            return this.metaFile;
        }
        return this.indexFiles[indexId];
    }

    getSectorIndexId(indexId: number): number {
        if (this.metaFile) {
            return indexId;
        }
        return indexId + 1;
    }

    read(indexId: number, archiveId: number): Int8Array {
        if (!Number.isSafeInteger(indexId) || indexId < 0) {
            throw new Error("Index id must be a non-negative integer");
        }
        if (!Number.isSafeInteger(archiveId) || archiveId < 0) {
            throw new Error("Archive id must be a non-negative integer");
        }
        const indexFile = this.getIndexFile(indexId);
        if (!indexFile) {
            throw new Error(`Index ${indexId} not found`);
        }

        const sectorIndexId = this.getSectorIndexId(indexId);

        const clusterPtr = archiveId * SectorCluster.SIZE;
        if (clusterPtr < 0 || clusterPtr + SectorCluster.SIZE > indexFile.byteLength) {
            throw new Error(
                `Invalid ptr: ${clusterPtr}, fileSize: ${indexFile.byteLength}, indexId: ${indexId}, archiveId: ${archiveId}`,
            );
        }

        const extended = archiveId > 65535;

        const sectorClusterBuf = new ByteBuffer(
            new Int8Array(indexFile, clusterPtr, SectorCluster.SIZE),
        );
        const sectorCluster = SectorCluster.decode(sectorClusterBuf);

        const data = new Int8Array(sectorCluster.size);
        let chunk = 0;
        let remaining = sectorCluster.size;
        let sectorPtr = sectorCluster.sector * Sector.SIZE;

        const sectorBuffer = new ByteBuffer(0);
        const sector = new Sector();

        while (remaining > 0) {
            const headerSize = extended ? Sector.EXTENDED_HEADER_SIZE : Sector.HEADER_SIZE;
            const dataSize = extended ? Sector.EXTENDED_DATA_SIZE : Sector.DATA_SIZE;

            const actualDataSize = Math.min(dataSize, remaining);

            sectorBuffer._data = new Int8Array(
                this.dataFile,
                sectorPtr,
                headerSize + actualDataSize,
            );
            sectorBuffer.offset = 0;

            if (extended) {
                Sector.decodeExtended(sector, sectorBuffer, actualDataSize);
            } else {
                Sector.decode(sector, sectorBuffer, actualDataSize);
            }
            if (sector.indexId !== sectorIndexId) {
                throw new Error(
                    `Sector index id mismatch. expected: ${sectorIndexId} got: ${sector.indexId}`,
                );
            }
            if (sector.archiveId !== archiveId) {
                throw new Error(
                    `Sector archive id mismatch. expected: ${archiveId} got: ${sector.archiveId}`,
                );
            }
            if (sector.chunk !== chunk) {
                throw new Error(`Sector chunk mismatch. expected: ${chunk} got: ${sector.chunk}`);
            }

            data.set(sector.data.subarray(0, actualDataSize), sectorCluster.size - remaining);
            if (remaining > dataSize) {
                chunk++;
                if (sector.nextSector <= 0) {
                    throw new Error(`Sector chain ended before archive ${archiveId} was complete`);
                }
                sectorPtr = sector.nextSector * Sector.SIZE;
            }
            remaining -= dataSize;
        }

        return data;
    }
}
