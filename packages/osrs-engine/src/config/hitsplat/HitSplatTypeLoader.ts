import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { HitSplatType } from "@august/osrs-engine/config/hitsplat/HitSplatType";

export type HitSplatTypeLoader = TypeLoader<HitSplatType>;

export class ArchiveHitSplatTypeLoader
    extends ArchiveTypeLoader<HitSplatType>
    implements HitSplatTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(HitSplatType, cacheInfo, archive);
    }
}
