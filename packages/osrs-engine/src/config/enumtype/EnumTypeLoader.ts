import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, IndexTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { EnumType } from "@august/osrs-engine/config/enumtype/EnumType";

export type EnumTypeLoader = TypeLoader<EnumType>;

export class ArchiveEnumTypeLoader extends ArchiveTypeLoader<EnumType> implements EnumTypeLoader {
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(EnumType, cacheInfo, archive);
    }
}

export class IndexEnumTypeLoader extends IndexTypeLoader<EnumType> implements EnumTypeLoader {
    constructor(cacheInfo: CacheInfo, index: CacheIndex, fileIdBits: number = 8) {
        super(EnumType, cacheInfo, index, fileIdBits);
    }
}
