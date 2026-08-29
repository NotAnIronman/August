import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { MapSceneType } from "@august/osrs-engine/config/mapscenetype/MapSceneType";

export class MapSceneTypeLoader extends ArchiveTypeLoader<MapSceneType> {
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(MapSceneType, cacheInfo, archive);
    }
}
