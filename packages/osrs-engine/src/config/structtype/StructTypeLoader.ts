import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, IndexTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { StructType } from "@august/osrs-engine/config/structtype/StructType";

export type StructTypeLoader = TypeLoader<StructType>;

export class ArchiveStructTypeLoader
    extends ArchiveTypeLoader<StructType>
    implements StructTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(StructType, cacheInfo, archive);
    }
}

export class IndexStructTypeLoader extends IndexTypeLoader<StructType> implements StructTypeLoader {
    constructor(cacheInfo: CacheInfo, index: CacheIndex, fileIdBits: number = 8) {
        super(StructType, cacheInfo, index, fileIdBits);
    }
}
