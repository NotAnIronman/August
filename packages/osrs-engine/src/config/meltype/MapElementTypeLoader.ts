import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { MapElementType } from "@august/osrs-engine/config/meltype/MapElementType";

export type MapElementTypeLoader = TypeLoader<MapElementType>;

export class ArchiveMapElementTypeLoader
    extends ArchiveTypeLoader<MapElementType>
    implements MapElementTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(MapElementType, cacheInfo, archive);
    }
}
