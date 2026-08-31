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
import {
    DatVarBitTypeLoader,
    DummyVarBitTypeLoader,
    VarBitTypeLoader,
} from "@august/osrs-engine/config/vartype/bit/VarBitTypeLoader";
import { DatMapFileIndex } from "@august/osrs-engine/map/MapFileIndex";
import { MapFileLoader } from "@august/osrs-engine/map/MapFileLoader";
import { IndexModelLoader, ModelLoader } from "@august/osrs-engine/model/ModelLoader";
import { DatSeqFrameLoader, SeqFrameLoader } from "@august/osrs-engine/model/seq/SeqFrameLoader";
import { SkeletalSeqLoader } from "@august/osrs-engine/model/skeletal/SkeletalSeqLoader";
import { IndexedSprite } from "@august/osrs-engine/sprite/IndexedSprite";
import { SpriteLoader } from "@august/osrs-engine/sprite/SpriteLoader";
import { DatTextureLoader } from "@august/osrs-engine/texture/DatTextureLoader";
import { TextureLoader } from "@august/osrs-engine/texture/TextureLoader";
import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { CacheType } from "@august/osrs-engine/cache/CacheType";
import { ConfigType } from "@august/osrs-engine/cache/ConfigType";
import { IndexType } from "@august/osrs-engine/cache/IndexType";
import { CacheLoaderFactory } from "@august/osrs-engine/cache/loader/CacheLoaderFactory";

export function loadMapSprites(mediaArchive: Archive, name: string): IndexedSprite[] {
    // TODO: maybe there is a way to check how many sprites there are
    const sprites = new Array<IndexedSprite>();
    for (let i = 0; i < 100; i++) {
        try {
            sprites[i] = SpriteLoader.loadIndexedSpriteDat(mediaArchive, name, i);
        } catch (e) {
            break;
        }
    }

    return sprites;
}

export function loadMapScenes(mediaArchive: Archive): IndexedSprite[] {
    return loadMapSprites(mediaArchive, "mapscene");
}

export function loadMapFunctions(mediaArchive: Archive): IndexedSprite[] {
    return loadMapSprites(mediaArchive, "mapfunction");
}

export class DatCacheLoaderFactory implements CacheLoaderFactory {
    configIndex: CacheIndex;
    configArchive: Archive;
    mediaArchive: Archive;

    floTypeLoader?: OverlayFloorTypeLoader;

    constructor(
        readonly cacheInfo: CacheInfo,
        readonly cacheType: CacheType,
        readonly cacheSystem: CacheSystem,
    ) {
        this.configIndex = cacheSystem.getIndex(IndexType.DAT.configs);
        this.configArchive = this.configIndex.getArchive(ConfigType.DAT.configs);
        this.mediaArchive = this.configIndex.getArchive(ConfigType.DAT.media);
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
        if (this.cacheInfo.revision < 254) {
            return new DummyVarBitTypeLoader(this.cacheInfo);
        }
        return DatVarBitTypeLoader.load(this.cacheInfo, this.configArchive);
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
        const textureArchive = this.configIndex.getArchive(ConfigType.DAT.textures);
        const animatedTextureIds = [DatTextureLoader.WATER_DROPLETS_TEXTURE_ID, 24];
        if (this.cacheInfo.revision > 289) {
            animatedTextureIds.push(34, 40);
        }
        return new DatTextureLoader(textureArchive, animatedTextureIds);
    }

    getModelLoader(): ModelLoader {
        const modelIndex = this.cacheSystem.getIndex(IndexType.DAT.models);
        return new IndexModelLoader(modelIndex);
    }

    getSeqFrameLoader(): SeqFrameLoader {
        const seqFrameIndex = this.cacheSystem.getIndex(IndexType.DAT.animations);
        return DatSeqFrameLoader.load(seqFrameIndex);
    }

    getSkeletalSeqLoader(): SkeletalSeqLoader | undefined {
        return undefined;
    }

    getWorldEntityTypeLoader(): undefined {
        return undefined;
    }

    getMapFileLoader(): MapFileLoader {
        const mapIndex = this.cacheSystem.getIndex(IndexType.DAT.maps);
        const versionListArchive = this.configIndex.getArchive(ConfigType.DAT.versionList);
        const mapFileIndex = DatMapFileIndex.load(versionListArchive);
        return new MapFileLoader(mapIndex, mapFileIndex);
    }

    getMapScenes(): IndexedSprite[] {
        return loadMapScenes(this.mediaArchive);
    }

    getMapFunctions(): IndexedSprite[] {
        return loadMapFunctions(this.mediaArchive);
    }
}
