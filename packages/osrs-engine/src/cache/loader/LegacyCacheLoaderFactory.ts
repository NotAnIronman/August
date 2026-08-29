import { BasTypeLoader, DummyBasTypeLoader } from "@august/osrs-engine/config/bastype/BasTypeLoader";
import {
    DatFloorTypeLoader,
    FloorTypeLoader,
    OverlayFloorTypeLoader,
} from "@august/osrs-engine/config/floortype/FloorTypeLoader";
import { DatIdkTypeLoader, IdkTypeLoader } from "@august/osrs-engine/config/idktype/IdkTypeLoader";
import { DatLocTypeLoader, LocTypeLoader } from "@august/osrs-engine/config/loctype/LocTypeLoader";
import { DatNpcTypeLoader, NpcTypeLoader } from "@august/osrs-engine/config/npctype/NpcTypeLoader";
import {
    DatObjTypeLoader,
    ObjTypeLoader,
    PostProcessedObjTypeLoader,
} from "@august/osrs-engine/config/objtype/ObjTypeLoader";
import { DummyParamTypeLoader, ParamTypeLoader } from "@august/osrs-engine/config/paramtype/ParamTypeLoader";
import { DatSeqTypeLoader, SeqTypeLoader } from "@august/osrs-engine/config/seqtype/SeqTypeLoader";
import {
    DatSpotAnimTypeLoader,
    SpotAnimTypeLoader,
} from "@august/osrs-engine/config/spotanimtype/SpotAnimTypeLoader";
import { EmptyVarcIntTypeLoader, VarcIntTypeLoader } from "@august/osrs-engine/config/vartype/VarcIntTypeLoader";
import { DummyVarBitTypeLoader, VarBitTypeLoader } from "@august/osrs-engine/config/vartype/bit/VarBitTypeLoader";
import { Dat2MapIndex } from "@august/osrs-engine/map/MapFileIndex";
import { LegacyMapFileLoader, MapFileLoader } from "@august/osrs-engine/map/MapFileLoader";
import { LegacyModelLoader } from "@august/osrs-engine/model/ModelLoader";
import { LegacySeqFrameLoader, SeqFrameLoader } from "@august/osrs-engine/model/seq/SeqFrameLoader";
import { SkeletalSeqLoader } from "@august/osrs-engine/model/skeletal/SkeletalSeqLoader";
import { IndexedSprite } from "@august/osrs-engine/sprite/IndexedSprite";
import { DatTextureLoader } from "@august/osrs-engine/texture/DatTextureLoader";
import { TextureLoader } from "@august/osrs-engine/texture/TextureLoader";
import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { IndexType } from "@august/osrs-engine/cache/IndexType";
import { CacheLoaderFactory } from "@august/osrs-engine/cache/loader/CacheLoaderFactory";
import { loadMapFunctions, loadMapScenes } from "@august/osrs-engine/cache/loader/DatCacheLoaderFactory";

export class LegacyCacheLoaderFactory implements CacheLoaderFactory {
    configIndex: CacheIndex;
    configArchive: Archive;

    mediaIndex: CacheIndex;
    mediaArchive: Archive;

    textureIndex: CacheIndex;
    textureArchive: Archive;

    modelIndex: CacheIndex;
    modelArchive: Archive;

    mapIndex: CacheIndex;

    floTypeLoader?: OverlayFloorTypeLoader;

    constructor(
        readonly cacheInfo: CacheInfo,
        readonly cacheSystem: CacheSystem,
    ) {
        this.configIndex = cacheSystem.getIndex(IndexType.LEGACY.configs);
        this.configArchive = this.configIndex.getArchive(0);

        this.mediaIndex = cacheSystem.getIndex(IndexType.LEGACY.media);
        this.mediaArchive = this.mediaIndex.getArchive(0);

        this.textureIndex = cacheSystem.getIndex(IndexType.LEGACY.textures);
        this.textureArchive = this.textureIndex.getArchive(0);

        this.modelIndex = cacheSystem.getIndex(IndexType.LEGACY.models);
        this.modelArchive = this.modelIndex.getArchive(0);

        this.mapIndex = cacheSystem.getIndex(IndexType.LEGACY.maps);
    }

    getFloTypeLoader(): OverlayFloorTypeLoader {
        if (!this.floTypeLoader) {
            this.floTypeLoader = DatFloorTypeLoader.load(this.cacheInfo, this.configArchive);
        }
        return this.floTypeLoader;
    }

    getUnderlayTypeLoader(): FloorTypeLoader {
        return this.getFloTypeLoader();
    }

    getOverlayTypeLoader(): OverlayFloorTypeLoader {
        return this.getFloTypeLoader();
    }

    getVarBitTypeLoader(): VarBitTypeLoader {
        return new DummyVarBitTypeLoader(this.cacheInfo);
    }

    getVarcIntTypeLoader(): VarcIntTypeLoader {
        return new EmptyVarcIntTypeLoader(this.cacheInfo);
    }

    getLocTypeLoader(): LocTypeLoader {
        return DatLocTypeLoader.load(this.cacheInfo, this.configArchive);
    }

    getNpcTypeLoader(): NpcTypeLoader {
        return DatNpcTypeLoader.load(this.cacheInfo, this.configArchive);
    }

    getObjTypeLoader(): ObjTypeLoader {
        return new PostProcessedObjTypeLoader(
            DatObjTypeLoader.load(this.cacheInfo, this.configArchive),
        );
    }

    getSeqTypeLoader(): SeqTypeLoader {
        return DatSeqTypeLoader.load(this.cacheInfo, this.configArchive);
    }

    getSpotAnimTypeLoader(): SpotAnimTypeLoader {
        return DatSpotAnimTypeLoader.load(this.cacheInfo, this.configArchive);
    }

    getBasTypeLoader(): BasTypeLoader {
        return new DummyBasTypeLoader(this.cacheInfo);
    }

    getParamTypeLoader(): ParamTypeLoader {
        return new DummyParamTypeLoader(this.cacheInfo);
    }

    getIdkTypeLoader(): IdkTypeLoader {
        return DatIdkTypeLoader.load(this.cacheInfo, this.configArchive);
    }

    getEnumTypeLoader(): undefined {
        return undefined;
    }

    getStructTypeLoader(): undefined {
        return undefined;
    }

    getTextureLoader(): TextureLoader {
        const animatedTextureIds = [DatTextureLoader.WATER_DROPLETS_TEXTURE_ID, 24];
        return new DatTextureLoader(this.textureArchive, animatedTextureIds);
    }

    getModelLoader(): LegacyModelLoader {
        return LegacyModelLoader.load(this.modelArchive);
    }

    getSeqFrameLoader(): SeqFrameLoader {
        return LegacySeqFrameLoader.load(this.modelArchive);
    }

    getSkeletalSeqLoader(): SkeletalSeqLoader | undefined {
        return undefined;
    }

    getWorldEntityTypeLoader(): undefined {
        return undefined;
    }

    getMapFileLoader(): MapFileLoader {
        return new LegacyMapFileLoader(this.mapIndex, new Dat2MapIndex(this.mapIndex));
    }

    getMapScenes(): IndexedSprite[] {
        return loadMapScenes(this.mediaArchive);
    }

    getMapFunctions(): IndexedSprite[] {
        return loadMapFunctions(this.mediaArchive);
    }
}
