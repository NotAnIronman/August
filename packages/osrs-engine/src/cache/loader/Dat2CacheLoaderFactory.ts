import {
    ArchiveBasTypeLoader,
    BasTypeLoader,
    DummyBasTypeLoader,
} from "@august/osrs-engine/config/bastype/BasTypeLoader";
import { GraphicsDefaults } from "@august/osrs-engine/config/defaults/GraphicsDefaults";
import {
    ArchiveEnumTypeLoader,
    EnumTypeLoader,
    IndexEnumTypeLoader,
} from "@august/osrs-engine/config/enumtype/EnumTypeLoader";
import {
    ArchiveOverlayFloorTypeLoader,
    ArchiveUnderlayFloorTypeLoader,
    FloorTypeLoader,
    OverlayFloorTypeLoader,
} from "@august/osrs-engine/config/floortype/FloorTypeLoader";
import { ArchiveIdkTypeLoader, IdkTypeLoader } from "@august/osrs-engine/config/idktype/IdkTypeLoader";
import {
    ArchiveLocTypeLoader,
    IndexLocTypeLoader,
    LocTypeLoader,
} from "@august/osrs-engine/config/loctype/LocTypeLoader";
import { MapSceneTypeLoader } from "@august/osrs-engine/config/mapscenetype/MapSceneTypeLoader";
import {
    ArchiveMapElementTypeLoader,
    MapElementTypeLoader,
} from "@august/osrs-engine/config/meltype/MapElementTypeLoader";
import {
    ArchiveNpcTypeLoader,
    IndexNpcTypeLoader,
    NpcTypeLoader,
} from "@august/osrs-engine/config/npctype/NpcTypeLoader";
import {
    ArchiveObjTypeLoader,
    IndexObjTypeLoader,
    ObjTypeLoader,
    PostProcessedObjTypeLoader,
} from "@august/osrs-engine/config/objtype/ObjTypeLoader";
import { ArchiveParamTypeLoader, ParamTypeLoader } from "@august/osrs-engine/config/paramtype/ParamTypeLoader";
import {
    ArchiveSeqTypeLoader,
    IndexSeqTypeLoader,
    SeqTypeLoader,
} from "@august/osrs-engine/config/seqtype/SeqTypeLoader";
import {
    ArchiveSpotAnimTypeLoader,
    IndexSpotAnimTypeLoader,
    SpotAnimTypeLoader,
} from "@august/osrs-engine/config/spotanimtype/SpotAnimTypeLoader";
import {
    ArchiveStructTypeLoader,
    IndexStructTypeLoader,
    StructTypeLoader,
} from "@august/osrs-engine/config/structtype/StructTypeLoader";
import {
    ArchiveVarcIntTypeLoader,
    VarcIntTypeLoader,
} from "@august/osrs-engine/config/vartype/VarcIntTypeLoader";
import {
    ArchiveVarBitTypeLoader,
    IndexVarBitTypeLoader,
    VarBitTypeLoader,
} from "@august/osrs-engine/config/vartype/bit/VarBitTypeLoader";
import {
    ArchiveWorldEntityTypeLoader,
    WorldEntityTypeLoader,
} from "@august/osrs-engine/config/worldentitytype/WorldEntityTypeLoader";
import { Dat2MapIndex, MapFileIndex } from "@august/osrs-engine/map/MapFileIndex";
import { MapFileLoader } from "@august/osrs-engine/map/MapFileLoader";
import { IndexModelLoader, ModelLoader } from "@august/osrs-engine/model/ModelLoader";
import { IndexSeqBaseLoader, SeqBaseLoader } from "@august/osrs-engine/model/seq/SeqBaseLoader";
import { Dat2SeqFrameLoader, SeqFrameLoader } from "@august/osrs-engine/model/seq/SeqFrameLoader";
import { IndexSkeletalSeqLoader, SkeletalSeqLoader } from "@august/osrs-engine/model/skeletal/SkeletalSeqLoader";
import { IndexedSprite } from "@august/osrs-engine/sprite/IndexedSprite";
import { SpriteLoader } from "@august/osrs-engine/sprite/SpriteLoader";
import { EmbeddedMaterialProceduralTextureLoader } from "@august/osrs-engine/texture/EmbeddedMaterialProceduralTextureLoader";
import { ProceduralTextureLoader } from "@august/osrs-engine/texture/ProceduralTextureLoader";
import { SpriteTextureLoader } from "@august/osrs-engine/texture/SpriteTextureLoader";
import { TextureLoader } from "@august/osrs-engine/texture/TextureLoader";
import { ApiType } from "@august/osrs-engine/cache/ApiType";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { CacheType } from "@august/osrs-engine/cache/CacheType";
import { ConfigType } from "@august/osrs-engine/cache/ConfigType";
import { IndexType } from "@august/osrs-engine/cache/IndexType";
import { CacheLoaderFactory, CacheLoaderFactoryOptions } from "@august/osrs-engine/cache/loader/CacheLoaderFactory";
import { isGroupMissingError } from "@august/osrs-engine/cache/js5/GroupMissingError";

export class Dat2CacheLoaderFactory implements CacheLoaderFactory {
    constructor(
        readonly cacheInfo: CacheInfo,
        readonly cacheType: CacheType,
        readonly cacheSystem: CacheSystem,
        readonly options: CacheLoaderFactoryOptions = {},
    ) {}

    isIndexConfigs(): boolean {
        return this.cacheInfo.game === "runescape" && this.cacheInfo.revision >= 488;
    }

    getUnderlayTypeLoader(): FloorTypeLoader {
        const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
        const underlaysArchive = configIndex.getArchive(ConfigType.DAT2.underlays);
        return new ArchiveUnderlayFloorTypeLoader(this.cacheInfo, underlaysArchive);
    }

    getOverlayTypeLoader(): OverlayFloorTypeLoader {
        const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
        const overlaysArchive = configIndex.getArchive(ConfigType.DAT2.overlays);
        return new ArchiveOverlayFloorTypeLoader(this.cacheInfo, overlaysArchive);
    }

    getVarBitTypeLoader(): VarBitTypeLoader {
        if (this.isIndexConfigs()) {
            const varbitsIndex = this.cacheSystem.getIndex(IndexType.RS2.varbits);
            return new IndexVarBitTypeLoader(this.cacheInfo, varbitsIndex);
        } else {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            const varbitsArchive = configIndex.getArchive(ConfigType.DAT2.varbits);
            return new ArchiveVarBitTypeLoader(this.cacheInfo, varbitsArchive);
        }
    }

    getVarcIntTypeLoader(): VarcIntTypeLoader {
        const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
        const varcArchive = configIndex.getArchive(ConfigType.DAT2.varClient);
        return new ArchiveVarcIntTypeLoader(this.cacheInfo, varcArchive);
    }

    getLocTypeLoader(): LocTypeLoader {
        let baseLoader: LocTypeLoader;
        if (this.isIndexConfigs()) {
            const locsIndex = this.cacheSystem.getIndex(IndexType.RS2.locs);
            baseLoader = new IndexLocTypeLoader(this.cacheInfo, locsIndex);
        } else {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            const locsArchive = configIndex.getArchive(ConfigType.DAT2.locs);
            baseLoader = new ArchiveLocTypeLoader(this.cacheInfo, locsArchive);
        }
        return this.options.decorateLocTypeLoader?.(baseLoader, this.cacheInfo) ?? baseLoader;
    }

    getNpcTypeLoader(): NpcTypeLoader {
        if (this.isIndexConfigs()) {
            const npcIndex = this.cacheSystem.getIndex(IndexType.RS2.npcs);
            return new IndexNpcTypeLoader(this.cacheInfo, npcIndex);
        } else {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            const npcsArchive = configIndex.getArchive(ConfigType.DAT2.npcs);
            return new ArchiveNpcTypeLoader(this.cacheInfo, npcsArchive);
        }
    }

    getObjTypeLoader(): ObjTypeLoader {
        let baseLoader: ObjTypeLoader;
        if (this.isIndexConfigs()) {
            const objIndex = this.cacheSystem.getIndex(IndexType.RS2.objs);
            baseLoader = new PostProcessedObjTypeLoader(
                new IndexObjTypeLoader(this.cacheInfo, objIndex),
            );
        } else {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            const objsArchive = configIndex.getArchive(ConfigType.DAT2.objs);
            baseLoader = new PostProcessedObjTypeLoader(
                new ArchiveObjTypeLoader(this.cacheInfo, objsArchive),
            );
        }
        return this.options.decorateObjTypeLoader?.(baseLoader, this.cacheInfo) ?? baseLoader;
    }

    getSeqTypeLoader(): SeqTypeLoader {
        if (this.isIndexConfigs()) {
            const seqIndex = this.cacheSystem.getIndex(IndexType.RS2.seqs);
            return new IndexSeqTypeLoader(this.cacheInfo, seqIndex);
        } else {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            const seqsArchive = configIndex.getArchive(ConfigType.DAT2.seqs);
            return new ArchiveSeqTypeLoader(this.cacheInfo, seqsArchive);
        }
    }

    getSpotAnimTypeLoader(): SpotAnimTypeLoader {
        if (this.isIndexConfigs()) {
            const spotIndex = this.cacheSystem.getIndex(IndexType.RS2.spotAnims);
            return new IndexSpotAnimTypeLoader(this.cacheInfo, spotIndex);
        } else {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            const spotArchive = configIndex.getArchive(ConfigType.DAT2.spotAnims);
            return new ArchiveSpotAnimTypeLoader(this.cacheInfo, spotArchive);
        }
    }

    getBasTypeLoader(): BasTypeLoader {
        if (this.cacheInfo.game === "runescape" && this.cacheInfo.revision >= 530) {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            try {
                const basArchive = configIndex.getArchive(ConfigType.RS2.bas);
                return new ArchiveBasTypeLoader(this.cacheInfo, basArchive);
            } catch (e) {
                if (isGroupMissingError(e)) {
                    throw e;
                }
                console.error("Failed to load bastype archive", e);
            }
        }
        return new DummyBasTypeLoader(this.cacheInfo);
    }

    getParamTypeLoader(): ParamTypeLoader {
        const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
        const paramsArchive = configIndex.getArchive(ConfigType.DAT2.params);
        return new ArchiveParamTypeLoader(this.cacheInfo, paramsArchive);
    }

    getIdkTypeLoader(): IdkTypeLoader {
        const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
        const idkArchive = configIndex.getArchive(ConfigType.DAT2.identkits);
        return new ArchiveIdkTypeLoader(this.cacheInfo, idkArchive);
    }

    getEnumTypeLoader(): EnumTypeLoader | undefined {
        try {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            if (configIndex.archiveExists(ConfigType.DAT2.enums)) {
                const enumsArchive = configIndex.getArchive(ConfigType.DAT2.enums);
                return new ArchiveEnumTypeLoader(this.cacheInfo, enumsArchive);
            }
        } catch (e) {
            if (isGroupMissingError(e)) {
                throw e;
            }
            console.error("Failed to load enum archive", e);
        }
        return undefined;
    }

    getStructTypeLoader(): StructTypeLoader | undefined {
        try {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            // Structs are at archive 34 for OSRS caches
            if (
                this.cacheInfo.game === "oldschool" &&
                configIndex.archiveExists(ConfigType.OSRS.struct)
            ) {
                const structsArchive = configIndex.getArchive(ConfigType.OSRS.struct);
                return new ArchiveStructTypeLoader(this.cacheInfo, structsArchive);
            }
        } catch (e) {
            if (isGroupMissingError(e)) {
                throw e;
            }
            console.error("Failed to load struct archive", e);
        }
        return undefined;
    }

    getTextureLoader(): TextureLoader {
        const textureIndex = this.cacheSystem.getIndex(IndexType.DAT2.textures);
        const spriteIndex = this.cacheSystem.getIndex(IndexType.DAT2.sprites);
        if (
            this.cacheInfo.game === "oldschool" ||
            (this.cacheInfo.game === "runescape" && this.cacheInfo.revision < 474)
        ) {
            const isSimplified =
                this.cacheInfo.game === "oldschool" && this.cacheInfo.revision >= 233;
            return SpriteTextureLoader.load(textureIndex, spriteIndex, isSimplified);
        } else if (this.cacheSystem.indexExists(IndexType.RS2.materials)) {
            // materials starting 499 or 500
            const materialIndex = this.cacheSystem.getIndex(IndexType.RS2.materials);

            return ProceduralTextureLoader.load(
                this.cacheInfo.revision,
                materialIndex,
                textureIndex,
                spriteIndex,
            );
        } else {
            return EmbeddedMaterialProceduralTextureLoader.load(textureIndex, spriteIndex);
        }
    }

    getModelLoader(): ModelLoader {
        const modelIndex = this.cacheSystem.getIndex(IndexType.DAT2.models);
        return new IndexModelLoader(modelIndex);
    }

    getSeqBaseLoader(): SeqBaseLoader {
        const index = this.cacheSystem.getIndex(IndexType.DAT2.skeletons);
        return new IndexSeqBaseLoader(this.cacheInfo, index);
    }

    getSeqFrameLoader(): SeqFrameLoader {
        const index = this.cacheSystem.getIndex(IndexType.DAT2.animations);
        return new Dat2SeqFrameLoader(this.cacheInfo, index, this.getSeqBaseLoader());
    }

    getSkeletalSeqLoader(): SkeletalSeqLoader | undefined {
        if (this.cacheInfo.game === "oldschool" && this.cacheInfo.revision >= 229) {
            const index = this.cacheSystem.getIndex(IndexType.OSRS.animKeyFrames);
            return new IndexSkeletalSeqLoader(index, this.getSeqBaseLoader());
        }
        const index = this.cacheSystem.getIndex(IndexType.DAT2.animations);
        return new IndexSkeletalSeqLoader(index, this.getSeqBaseLoader());
    }

    getWorldEntityTypeLoader(): WorldEntityTypeLoader | undefined {
        try {
            const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
            const archive = configIndex.getArchive(ConfigType.OSRS.worldEntity);
            return new ArchiveWorldEntityTypeLoader(this.cacheInfo, archive);
        } catch (e) {
            if (isGroupMissingError(e)) {
                throw e;
            }
            return undefined;
        }
    }

    getMapFileLoader(): MapFileLoader {
        const mapIndex = this.cacheSystem.getIndex(IndexType.DAT2.maps);
        const mapFileIndex = new Dat2MapIndex(mapIndex);
        return new MapFileLoader(mapIndex, mapFileIndex);
    }

    getMapScenes(): IndexedSprite[] {
        const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
        const spriteIndex = this.cacheSystem.getIndex(IndexType.DAT2.sprites);

        if (
            this.cacheInfo.game === "runescape" &&
            configIndex.archiveExists(ConfigType.RS2.mapScenes)
        ) {
            const mapScenesArchive = configIndex.getArchive(ConfigType.RS2.mapScenes);
            const mapSceneTypeLoader = new MapSceneTypeLoader(this.cacheInfo, mapScenesArchive);

            const mapSceneSprites = new Array<IndexedSprite>(mapScenesArchive.lastFileId);
            for (const id of mapScenesArchive.fileIds) {
                const mapScene = mapSceneTypeLoader.load(id);
                if (mapScene.spriteId === -1) {
                    continue;
                }
                const sprite = SpriteLoader.loadIntoIndexedSprite(spriteIndex, mapScene.spriteId);
                if (sprite) {
                    mapSceneSprites[id] = sprite;
                }
            }

            return mapSceneSprites;
        } else {
            const graphicDefaults = GraphicsDefaults.load(this.cacheInfo, this.cacheSystem);
            if (graphicDefaults.mapScenes === -1) {
                return [];
            }
            const mapScenes = SpriteLoader.loadIntoIndexedSprites(
                spriteIndex,
                graphicDefaults.mapScenes,
            );
            if (!mapScenes) {
                throw new Error("Failed to load map scenes");
            }

            return mapScenes;
        }
    }

    loadMapElementSprites(
        spriteIndex: CacheIndex,
        mapElementTypeLoader: MapElementTypeLoader,
    ): IndexedSprite[] {
        const mapElementSprites = new Array<IndexedSprite>(mapElementTypeLoader.getCount());
        for (let i = 0; i < mapElementSprites.length; i++) {
            const mapElement = mapElementTypeLoader.load(i);
            if (mapElement.spriteId === -1) {
                continue;
            }
            const sprite = SpriteLoader.loadIntoIndexedSprite(spriteIndex, mapElement.spriteId);
            if (sprite) {
                mapElementSprites[i] = sprite;
            }
        }
        return mapElementSprites;
    }

    getMapFunctions(): IndexedSprite[] {
        const configIndex = this.cacheSystem.getIndex(IndexType.DAT2.configs);
        const spriteIndex = this.cacheSystem.getIndex(IndexType.DAT2.sprites);

        if (
            this.cacheInfo.game === "oldschool" &&
            configIndex.archiveExists(ConfigType.OSRS.mapFunctions)
        ) {
            const mapElementArchive = configIndex.getArchive(ConfigType.OSRS.mapFunctions);
            const mapElementTypeLoader = new ArchiveMapElementTypeLoader(
                this.cacheInfo,
                mapElementArchive,
            );

            return this.loadMapElementSprites(spriteIndex, mapElementTypeLoader);
        } else if (
            this.cacheInfo.game === "runescape" &&
            configIndex.archiveExists(ConfigType.RS2.mapFunctions)
        ) {
            const mapElementArchive = configIndex.getArchive(ConfigType.RS2.mapFunctions);
            const mapElementTypeLoader = new ArchiveMapElementTypeLoader(
                this.cacheInfo,
                mapElementArchive,
            );

            return this.loadMapElementSprites(spriteIndex, mapElementTypeLoader);
        } else {
            const graphicDefaults = GraphicsDefaults.load(this.cacheInfo, this.cacheSystem);
            if (graphicDefaults.mapFunctions === -1) {
                return [];
            }

            const mapFunctions = SpriteLoader.loadIntoIndexedSprites(
                spriteIndex,
                graphicDefaults.mapFunctions,
            );

            if (!mapFunctions) {
                throw new Error("Failed to load map functions");
            }

            return mapFunctions;
        }
    }
}
