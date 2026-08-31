import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheIndex } from "@august/osrs-engine/cache/CacheIndex";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, DatTypeLoader, IndexTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { SeqType } from "@august/osrs-engine/config/seqtype/SeqType";

export type SeqTypeLoader = TypeLoader<SeqType>;

export class DatSeqTypeLoader {
    static load(cacheInfo: CacheInfo, configArchive: Archive): SeqTypeLoader {
        return DatTypeLoader.load(SeqType, cacheInfo, configArchive, "seq");
    }
}

export class ArchiveSeqTypeLoader extends ArchiveTypeLoader<SeqType> implements SeqTypeLoader {
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(SeqType, cacheInfo, archive);
    }
}

export class IndexSeqTypeLoader extends IndexTypeLoader<SeqType> implements SeqTypeLoader {
    constructor(cacheInfo: CacheInfo, index: CacheIndex) {
        super(SeqType, cacheInfo, index, 7);
    }
}
