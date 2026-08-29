import { Archive } from "@august/osrs-engine/cache/Archive";
import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { ArchiveTypeLoader, TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import { HealthBarDefinition } from "@august/osrs-engine/config/healthbar/HealthBarDefinition";

export type HealthBarDefinitionLoader = TypeLoader<HealthBarDefinition>;

export class ArchiveHealthBarDefinitionLoader
    extends ArchiveTypeLoader<HealthBarDefinition>
    implements HealthBarDefinitionLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(HealthBarDefinition, cacheInfo, archive);
    }
}
