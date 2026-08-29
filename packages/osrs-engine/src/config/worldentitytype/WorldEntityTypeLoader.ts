import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { WorldEntityType } from "@august/osrs-engine/config/worldentitytype/WorldEntityType";

export type WorldEntityTypeLoader = TypeLoader<WorldEntityType>;

export class ArchiveWorldEntityTypeLoader
    extends ArchiveTypeLoader<WorldEntityType>
    implements WorldEntityTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(WorldEntityType, cacheInfo, archive);
    }
}
