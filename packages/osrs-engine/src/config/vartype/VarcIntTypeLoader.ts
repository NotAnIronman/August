import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, DummyTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { VarcIntType } from "@august/osrs-engine/config/vartype/VarcIntType";

export type VarcIntTypeLoader = TypeLoader<VarcIntType>;

export class EmptyVarcIntTypeLoader extends DummyTypeLoader<VarcIntType> {
    constructor(cacheInfo: CacheInfo) {
        super(cacheInfo, VarcIntType);
    }
}

export class ArchiveVarcIntTypeLoader
    extends ArchiveTypeLoader<VarcIntType>
    implements VarcIntTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(VarcIntType, cacheInfo, archive);
    }
}
