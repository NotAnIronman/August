import path from "path";

import { CacheFiles } from "@august/osrs-engine/cache/CacheFiles";
import { CacheIndexDat2 } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo, getLatestCache } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { detectCacheType } from "@august/osrs-engine/cache/CacheType";
import { IndexType } from "@august/osrs-engine/cache/IndexType";
import { MemoryStore } from "@august/osrs-engine/cache/store/MemoryStore";
import { Dat2MapIndex, MapFileIndex } from "@august/osrs-engine/map/MapFileIndex";
import { logger } from "@server/observability/logger";
import { loadDat2CacheFiles, readJson } from "@server/world/cacheFs";

export type CacheEnv = {
    info: CacheInfo;
    store: MemoryStore;
    cacheSystem: CacheSystem;
    indices: {
        maps: CacheIndexDat2;
        configs: CacheIndexDat2;
        models?: CacheIndexDat2;
    };
    mapFileIndex: MapFileIndex;
    xteas: Map<number, number[]>;
    root: string;
};

type CacheFolderInfo = {
    name?: string;
    game?: CacheInfo["game"];
    environment?: string;
    revision?: number;
    timestamp?: string;
    size?: number;
    builds?: Array<{ major?: number }>;
};

export function initCacheEnv(rootDir: string, name?: string): CacheEnv {
    const cacheRoot = path.resolve(rootDir);
    // If name is not provided, read from caches/caches.json and choose latest; default to single entry
    const cachesJsonPath = path.join(cacheRoot, "caches.json");
    const cachesList = readJson<CacheInfo[]>(cachesJsonPath);
    // Bug fix: this used to take cachesList[0] literally — the raw array
    // order in caches.json — despite this comment's stated intent to
    // "choose latest". Every cache-export tool (see tools/cache/client/
    // load-util.ts -> loadCacheList) already resolves "latest" via
    // getLatestCache (sorted by revision/timestamp, newest first). With
    // more than one cache registered and caches.json not happening to list
    // the newest one first, the server booted a DIFFERENT cache than the
    // one every committed data/generated/* reference file was exported
    // from — same npc/item ids, silently different names/definitions.
    // Aligning this with the tooling's selection makes "which cache did we
    // boot" match "which cache did we generate reference data from".
    const selectedName = name ?? getLatestCache(cachesList)?.name ?? cachesList[0]?.name;
    if (!selectedName) throw new Error("No cache name provided and caches.json empty");

    const folder = { rootDir: cacheRoot, name: selectedName };
    // Read cache metadata + keys first (needed to detect cache type)
    const infoPath = path.join(cacheRoot, selectedName, "info.json");
    const keysPath = path.join(cacheRoot, selectedName, "keys.json");
    // Prefer the entry from caches.json (has revision) and fall back to folder info.json
    const listInfo = cachesList.find((cache) => cache.name === selectedName);
    let info: CacheInfo;
    if (listInfo?.revision !== undefined) {
        info = listInfo;
    } else {
        const rawInfo = readJson<CacheFolderInfo>(infoPath);
        const revision = rawInfo.revision ?? rawInfo.builds?.[0]?.major ?? 0;
        const size = rawInfo.size ?? listInfo?.size ?? 0;
        info = {
            name: selectedName,
            game: rawInfo.game ?? listInfo?.game ?? "oldschool",
            environment: rawInfo.environment ?? listInfo?.environment ?? "live",
            revision: Math.trunc(revision),
            timestamp: rawInfo.timestamp ?? new Date().toISOString(),
            size: Math.trunc(size),
        } as CacheInfo;
    }
    const xteasObj = readJson<Record<string, number[]>>(keysPath);
    const xteas = new Map<number, number[]>(
        Object.entries(xteasObj).map(([k, v]) => [parseInt(k, 10), v]),
    );

    // Load cache files into a MemoryStore and construct a CacheSystem over all indices
    const fileMap = loadDat2CacheFiles(folder);
    const store = MemoryStore.fromFiles(new CacheFiles(fileMap));
    const cacheType = detectCacheType(info);
    const sys = new CacheSystem(
        CacheSystem.loadIndicesFromStore(cacheType === "dat" ? "dat" : "dat2", store),
    );

    const maps = CacheIndexDat2.fromStore(IndexType.DAT2.maps, store);
    const configs = CacheIndexDat2.fromStore(IndexType.DAT2.configs, store);
    let models: CacheIndexDat2 | undefined = undefined;
    try {
        models = CacheIndexDat2.fromStore(IndexType.DAT2.models, store);
    } catch (err) {
        logger.warn("[cache] failed to load models index", err);
    }

    const mapFileIndex: MapFileIndex = new Dat2MapIndex(maps);

    return {
        info,
        store,
        cacheSystem: sys,
        indices: { maps, configs, models },
        mapFileIndex,
        xteas,
        root: cacheRoot,
    };
}
