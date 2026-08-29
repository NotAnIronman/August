import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import {
    ArchiveTypeLoader,
    IndexTypeLoader,
    IndexedDatTypeLoader,
    TypeLoader,
} from "@august/osrs-engine/config/TypeLoader";
import { LocType } from "@august/osrs-engine/config/loctype/LocType";

export type LocTypeLoader = TypeLoader<LocType>;

export class DatLocTypeLoader {
    static load(cacheInfo: CacheInfo, configArchive: Archive): LocTypeLoader {
        return IndexedDatTypeLoader.load(LocType, cacheInfo, configArchive, "loc");
    }
}

export class ArchiveLocTypeLoader extends ArchiveTypeLoader<LocType> implements LocTypeLoader {
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(LocType, cacheInfo, archive);
    }
}

export class IndexLocTypeLoader extends IndexTypeLoader<LocType> implements LocTypeLoader {
    constructor(cacheInfo: CacheInfo, index: CacheIndex) {
        super(LocType, cacheInfo, index);
    }
}
