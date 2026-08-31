import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import type { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import {
    getCacheLoaderFactory as createCacheLoaderFactory,
    type CacheLoaderFactory,
} from "@august/osrs-engine/cache/loader/CacheLoaderFactory";
import type { ObjTypeLoader } from "@august/osrs-engine/config/objtype/ObjTypeLoader";

import { CustomObjTypeLoader } from "@august/custom-content/items/CustomObjTypeLoader";

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
    return createCacheLoaderFactory(cacheInfo, cacheSystem, {
        decorateObjTypeLoader: decorateCustomObjTypeLoader,
    });
}
