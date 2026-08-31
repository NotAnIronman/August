import { BasTypeLoader } from "@august/osrs-engine/config/bastype/BasTypeLoader";
import { EnumTypeLoader } from "@august/osrs-engine/config/enumtype/EnumTypeLoader";
import { FloorTypeLoader, OverlayFloorTypeLoader } from "@august/osrs-engine/config/floortype/FloorTypeLoader";
import { IdkTypeLoader } from "@august/osrs-engine/config/idktype/IdkTypeLoader";
import { LocTypeLoader } from "@august/osrs-engine/config/loctype/LocTypeLoader";
import { NpcTypeLoader } from "@august/osrs-engine/config/npctype/NpcTypeLoader";
import { ObjTypeLoader } from "@august/osrs-engine/config/objtype/ObjTypeLoader";
import { ParamTypeLoader } from "@august/osrs-engine/config/paramtype/ParamTypeLoader";
import { SeqTypeLoader } from "@august/osrs-engine/config/seqtype/SeqTypeLoader";
import { SpotAnimTypeLoader } from "@august/osrs-engine/config/spotanimtype/SpotAnimTypeLoader";
import { StructTypeLoader } from "@august/osrs-engine/config/structtype/StructTypeLoader";
import { VarcIntTypeLoader } from "@august/osrs-engine/config/vartype/VarcIntTypeLoader";
import { VarBitTypeLoader } from "@august/osrs-engine/config/vartype/bit/VarBitTypeLoader";
import { WorldEntityTypeLoader } from "@august/osrs-engine/config/worldentitytype/WorldEntityTypeLoader";
import { MapFileIndex } from "@august/osrs-engine/map/MapFileIndex";
import { MapFileLoader } from "@august/osrs-engine/map/MapFileLoader";
import { ModelLoader } from "@august/osrs-engine/model/ModelLoader";
import { SeqFrameLoader } from "@august/osrs-engine/model/seq/SeqFrameLoader";
import { SkeletalSeqLoader } from "@august/osrs-engine/model/skeletal/SkeletalSeqLoader";
import { IndexedSprite } from "@august/osrs-engine/sprite/IndexedSprite";
import { TextureLoader } from "@august/osrs-engine/texture/TextureLoader";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { detectCacheType } from "@august/osrs-engine/cache/CacheType";
import { Dat2CacheLoaderFactory } from "@august/osrs-engine/cache/loader/Dat2CacheLoaderFactory";
import { DatCacheLoaderFactory } from "@august/osrs-engine/cache/loader/DatCacheLoaderFactory";
import { LegacyCacheLoaderFactory } from "@august/osrs-engine/cache/loader/LegacyCacheLoaderFactory";

export interface CacheLoaderFactory {
    getUnderlayTypeLoader(): FloorTypeLoader;
    getOverlayTypeLoader(): OverlayFloorTypeLoader;

    getVarBitTypeLoader(): VarBitTypeLoader;
    getVarcIntTypeLoader(): VarcIntTypeLoader;

    getLocTypeLoader(): LocTypeLoader;
    getNpcTypeLoader(): NpcTypeLoader;
    getObjTypeLoader(): ObjTypeLoader;

    getSeqTypeLoader(): SeqTypeLoader;
    getSpotAnimTypeLoader(): SpotAnimTypeLoader;

    getBasTypeLoader(): BasTypeLoader;

    getParamTypeLoader(): ParamTypeLoader;

    // Player appearance: IdentityKit loader
    getIdkTypeLoader(): IdkTypeLoader;

    getEnumTypeLoader(): EnumTypeLoader | undefined;
    getStructTypeLoader(): StructTypeLoader | undefined;

    getTextureLoader(): TextureLoader;

    getModelLoader(): ModelLoader;
    getSeqFrameLoader(): SeqFrameLoader;
    getSkeletalSeqLoader(): SkeletalSeqLoader | undefined;

    getMapFileLoader(): MapFileLoader;

    getWorldEntityTypeLoader(): WorldEntityTypeLoader | undefined;

    getMapScenes(): IndexedSprite[];
    getMapFunctions(): IndexedSprite[];
}

export interface CacheLoaderFactoryOptions {
    /** Application-owned extension point. Cache code must never import an application feature. */
    decorateObjTypeLoader?: (base: ObjTypeLoader, cacheInfo: CacheInfo) => ObjTypeLoader;
}

export function getCacheLoaderFactory(
    cacheInfo: CacheInfo,
    cacheSystem: CacheSystem,
    options: CacheLoaderFactoryOptions = {},
): CacheLoaderFactory {
    const cacheType = detectCacheType(cacheInfo);
    switch (cacheType) {
        case "legacy":
            return new LegacyCacheLoaderFactory(cacheInfo, cacheSystem);
        case "dat":
            return new DatCacheLoaderFactory(cacheInfo, cacheType, cacheSystem);
        case "dat2":
            return new Dat2CacheLoaderFactory(cacheInfo, cacheType, cacheSystem, options);
    }
    throw new Error("Not implemented");
}
