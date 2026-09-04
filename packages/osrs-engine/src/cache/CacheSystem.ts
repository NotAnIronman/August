import { CacheNameHash } from "@august/osrs-engine/cache/hashing/CacheNameHash";
import { ApiType } from "@august/osrs-engine/cache/ApiType";
import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheFiles } from "@august/osrs-engine/cache/CacheFiles";
import { CacheIndex, CacheIndexDat, CacheIndexDat2, LegacyCacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheType } from "@august/osrs-engine/cache/CacheType";
import { IndexType } from "@august/osrs-engine/cache/IndexType";
import { PresenceBitset } from "@august/osrs-engine/cache/js5/PresenceBitset";
import { MemoryStore } from "@august/osrs-engine/cache/store/MemoryStore";
import { SparseMemoryStore } from "@august/osrs-engine/cache/store/SparseMemoryStore";
import { UnsupportedOperationError } from "@august/osrs-engine/util/UnsupportedOperationError";

export class CacheSystem<A extends ApiType = ApiType.SYNC> {
    static loadIndicesFromStore(cacheType: "dat" | "dat2", store: MemoryStore) {
        return store.indexFiles.map((indexFile, id) => {
            if (!indexFile) {
                return undefined;
            }
            if (cacheType === "dat") {
                return CacheIndexDat.fromStore(id, store, indexFile);
            } else {
                return CacheIndexDat2.fromStore(id, store);
            }
        });
    }

    /** Load a single index from an ArrayBuffer and add it to the system */
    static loadIndexFromData(
        cacheType: "dat" | "dat2",
        store: MemoryStore,
        indexId: number,
        data: ArrayBuffer,
    ): CacheIndex<ApiType.SYNC> | undefined {
        // Add to the store first
        store.addIndexFile(indexId, data);

        // Create the index
        if (cacheType === "dat") {
            return CacheIndexDat.fromStore(indexId, store, data);
        } else {
            return CacheIndexDat2.fromStore(indexId, store);
        }
    }

    static loadLegacy(cacheFiles: CacheFiles): CacheSystem {
        const configData = cacheFiles.files.get("config");
        if (!configData) {
            throw new Error("Missing config file");
        }
        const configArchive = Archive.decodeOld(0, new Int8Array(configData), true);
        const configIndex = new LegacyCacheIndex(IndexType.LEGACY.configs, [configArchive]);

        const mediaData = cacheFiles.files.get("media");
        if (!mediaData) {
            throw new Error("Missing media file");
        }
        const mediaArchive = Archive.decodeOld(0, new Int8Array(mediaData), true);
        const mediaIndex = new LegacyCacheIndex(IndexType.LEGACY.media, [mediaArchive]);

        const textureData = cacheFiles.files.get("textures");
        if (!textureData) {
            throw new Error("Missing textures file");
        }
        const textureArchive = Archive.decodeOld(0, new Int8Array(textureData), true);
        const textureIndex = new LegacyCacheIndex(IndexType.LEGACY.textures, [textureArchive]);

        const modelData = cacheFiles.files.get("models");
        if (!modelData) {
            throw new Error("Missing models file");
        }
        const modelArchive = Archive.decodeOld(0, new Int8Array(modelData), true);
        const modelIndex = new LegacyCacheIndex(IndexType.LEGACY.models, [modelArchive]);

        const mapsPrefix = "maps/";
        const mapArchives: Archive[] = [];
        const mapArchiveNameHashes = new Map<number, number>();
        for (const [name, data] of cacheFiles.files) {
            if (!name.startsWith(mapsPrefix)) {
                continue;
            }
            const archiveName = name.substring(mapsPrefix.length);
            const archiveId = mapArchives.length;
            mapArchives.push(Archive.create(archiveId, new Int8Array(data)));
            mapArchiveNameHashes.set(CacheNameHash.hashOld(archiveName), archiveId);
        }
        const mapIndex = new LegacyCacheIndex(
            IndexType.LEGACY.maps,
            mapArchives,
            mapArchiveNameHashes,
        );

        return new CacheSystem([configIndex, mediaIndex, textureIndex, modelIndex, mapIndex]);
    }

    static fromFiles(
        cacheType: CacheType,
        cacheFiles: CacheFiles,
        indicesToLoad: number[] = [],
        /** When set, builds a SparseMemoryStore over a partially-downloaded dat2. */
        presence?: PresenceBitset,
    ): CacheSystem {
        switch (cacheType) {
            case "classic":
                throw new UnsupportedOperationError(
                    'CacheSystem.fromFiles does not support the "classic" cache format',
                );
            case "legacy":
                return CacheSystem.loadLegacy(cacheFiles);
            case "dat":
            case "dat2":
                const store =
                    presence && cacheType === "dat2"
                        ? SparseMemoryStore.fromSparseFiles(cacheFiles, presence, indicesToLoad)
                        : MemoryStore.fromFiles(cacheFiles, indicesToLoad);
                const indices = CacheSystem.loadIndicesFromStore(cacheType, store);
                return new CacheSystem(indices, store, cacheType);
        }
    }

    readonly indices: (CacheIndex<A> | undefined)[];
    private readonly store?: MemoryStore;
    private readonly cacheType?: "dat" | "dat2";

    constructor(
        indices: (CacheIndex<A> | undefined)[],
        store?: MemoryStore,
        cacheType?: "dat" | "dat2",
    ) {
        this.indices = indices;
        this.store = store;
        this.cacheType = cacheType;
    }

    /**
     * Dynamically add an index from raw data.
     * Used for incremental loading during LOADING phase.
     */
    addIndexFromData(indexId: number, data: ArrayBuffer): boolean {
        if (!this.store || !this.cacheType) {
            console.warn("[CacheSystem] Cannot add index - no store available");
            return false;
        }

        const index = CacheSystem.loadIndexFromData(this.cacheType, this.store, indexId, data);
        if (index) {
            (this.indices as (CacheIndex<A> | undefined)[])[indexId] = index as CacheIndex<A>;
            return true;
        }
        return false;
    }

    getStore(): MemoryStore | undefined {
        return this.store;
    }

    indexExists(indexId: number): boolean {
        return !!this.indices[indexId];
    }

    getIndex(indexId: number): CacheIndex<A> {
        const index = this.indices[indexId];
        if (!index) {
            throw new Error("Index not found: " + indexId);
        }
        return index;
    }
}
