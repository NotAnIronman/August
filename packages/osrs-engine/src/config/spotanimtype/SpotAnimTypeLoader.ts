import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import {
    ArchiveTypeLoader,
    IndexTypeLoader,
    IndexedDatTypeLoader,
    TypeLoader,
} from "@august/osrs-engine/config/TypeLoader";
import { SpotAnimType } from "@august/osrs-engine/config/spotanimtype/SpotAnimType";

export type SpotAnimTypeLoader = TypeLoader<SpotAnimType>;

export class DatSpotAnimTypeLoader {
    static load(cacheInfo: CacheInfo, configArchive: Archive): SpotAnimTypeLoader {
        return IndexedDatTypeLoader.load(SpotAnimType, cacheInfo, configArchive, "spotanim");
    }
}

export class ArchiveSpotAnimTypeLoader
    extends ArchiveTypeLoader<SpotAnimType>
    implements SpotAnimTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(SpotAnimType, cacheInfo, archive);
    }
}

export class IndexSpotAnimTypeLoader
    extends IndexTypeLoader<SpotAnimType>
    implements SpotAnimTypeLoader
{
    constructor(cacheInfo: CacheInfo, index: CacheIndex) {
        super(SpotAnimType, cacheInfo, index, 7);
    }
}
