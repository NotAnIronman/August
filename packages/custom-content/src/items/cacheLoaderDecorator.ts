import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import type { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import {
    getCacheLoaderFactory as createCacheLoaderFactory,
    type CacheLoaderFactory,
} from "@august/osrs-engine/cache/loader/CacheLoaderFactory";
import type { ObjTypeLoader } from "@august/osrs-engine/config/objtype/ObjTypeLoader";

import { CustomObjTypeLoader } from "@august/custom-content/items/CustomObjTypeLoader";
import { CustomNpcTypeLoader } from "@august/custom-content/npcs/CustomNpcTypeLoader";
import { ThievingLocTypeLoader } from "@august/custom-content/locs/ThievingLocTypeLoader";
import { TheatreLocTypeLoader } from "@august/custom-content/locs/TheatreLocTypeLoader";
import { BossEntranceLocTypeLoader } from "@august/custom-content/locs/BossEntranceLocTypeLoader";
import { TheatreSpotAnimTypeLoader } from "@august/custom-content/locs/TheatreSpotAnimTypeLoader";

export type { CacheLoaderFactory } from "@august/osrs-engine/cache/loader/CacheLoaderFactory";

/** Application adapter that keeps custom-item behavior out of the cache package. */
export function decorateCustomObjTypeLoader(
    base: ObjTypeLoader,
    cacheInfo: CacheInfo,
): ObjTypeLoader {
    return new CustomObjTypeLoader(base, cacheInfo);
}

/** Canonical application factory: cache primitives plus August custom-content decoration. */
export function getCacheLoaderFactory(
    cacheInfo: CacheInfo,
    cacheSystem: CacheSystem,
): CacheLoaderFactory {
    const factory = createCacheLoaderFactory(cacheInfo, cacheSystem, {
        decorateObjTypeLoader: decorateCustomObjTypeLoader,
        decorateLocTypeLoader: (base, info) => new BossEntranceLocTypeLoader(new TheatreLocTypeLoader(new ThievingLocTypeLoader(base, info), info), info),
    });
    const getBaseNpcLoader = factory.getNpcTypeLoader.bind(factory);
    factory.getNpcTypeLoader = () => new CustomNpcTypeLoader(getBaseNpcLoader(), cacheInfo);
    const getBaseSpotLoader = factory.getSpotAnimTypeLoader.bind(factory);
    factory.getSpotAnimTypeLoader = () => new TheatreSpotAnimTypeLoader(getBaseSpotLoader(), cacheInfo);
    return factory;
}
