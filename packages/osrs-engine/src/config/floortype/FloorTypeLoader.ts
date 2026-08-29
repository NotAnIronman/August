import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, DatTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { FloorType } from "@august/osrs-engine/config/floortype/FloorType";
import { OverlayFloorType } from "@august/osrs-engine/config/floortype/OverlayFloorType";
import { UnderlayFloorType } from "@august/osrs-engine/config/floortype/UnderlayFloorType";

export type FloorTypeLoader = TypeLoader<FloorType>;

export type UnderlayFloorTypeLoader = TypeLoader<UnderlayFloorType>;
export type OverlayFloorTypeLoader = TypeLoader<OverlayFloorType>;

export class ArchiveUnderlayFloorTypeLoader
    extends ArchiveTypeLoader<UnderlayFloorType>
    implements UnderlayFloorTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(UnderlayFloorType, cacheInfo, archive);
    }
}

export class ArchiveOverlayFloorTypeLoader
    extends ArchiveTypeLoader<OverlayFloorType>
    implements OverlayFloorTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(OverlayFloorType, cacheInfo, archive);
    }
}

export class DatFloorTypeLoader {
    static load(cacheInfo: CacheInfo, configArchive: Archive): OverlayFloorTypeLoader {
        return DatTypeLoader.load(OverlayFloorType, cacheInfo, configArchive, "flo");
    }
}
