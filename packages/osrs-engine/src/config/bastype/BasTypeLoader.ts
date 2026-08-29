import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, DummyTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { BasType } from "@august/osrs-engine/config/bastype/BasType";

export type BasTypeLoader = TypeLoader<BasType>;

export class DummyBasTypeLoader extends DummyTypeLoader<BasType> {
    constructor(cacheInfo: CacheInfo) {
        super(cacheInfo, BasType);
    }
}

export class ArchiveBasTypeLoader extends ArchiveTypeLoader<BasType> {
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(BasType, cacheInfo, archive);
    }
}
