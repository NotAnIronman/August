import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, DummyTypeLoader, IndexTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { ParamType } from "@august/osrs-engine/config/paramtype/ParamType";

export type ParamTypeLoader = TypeLoader<ParamType>;

export class DummyParamTypeLoader extends DummyTypeLoader<ParamType> {
    constructor(cacheInfo: CacheInfo) {
        super(cacheInfo, ParamType);
    }
}

export class ArchiveParamTypeLoader
    extends ArchiveTypeLoader<ParamType>
    implements ParamTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(ParamType, cacheInfo, archive);
    }
}

export class IndexParamTypeLoader extends IndexTypeLoader<ParamType> implements ParamTypeLoader {
    constructor(cacheInfo: CacheInfo, index: CacheIndex, fileIdBits: number = 8) {
        super(ParamType, cacheInfo, index, fileIdBits);
    }
}
