import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { NpcType } from "@august/osrs-engine/config/npctype/NpcType";
import type { NpcTypeLoader } from "@august/osrs-engine/config/npctype/NpcTypeLoader";
import { getFollowerDefinitionByNpcTypeId } from "@august/custom-content/npcs/followerDefinitions";

export const STATIONARY_EGG_IDS: ReadonlySet<number> = new Set([13670, 13672, 13674]);
export class CustomNpcTypeLoader implements NpcTypeLoader {
    private readonly overrides = new Map<number, NpcType>();
    constructor(private readonly base: NpcTypeLoader, private readonly info: CacheInfo) {}
    load(id: number): NpcType {
        const cached = this.overrides.get(id);
        if (cached) return cached;
        const source = this.base.load(id);
        if (this.info.game !== "oldschool") return source;
        const egg = STATIONARY_EGG_IDS.has(id);
        const pet = !!getFollowerDefinitionByNpcTypeId(id);
        if (!egg && !pet) return source;
        const npc = Object.assign(new NpcType(id, this.info), source);
        if (pet) npc.isFollower = true;
        if (egg) {
            npc.basTypeId = -1;
            // Includes pre-baked map frames, not just the active movement sequence.
            for (const key of Object.keys(npc)) {
                if (key.endsWith("SeqId")) (npc as unknown as Record<string, unknown>)[key] = -1;
            }
            npc.rotationSpeed = 0;
            // One frame only: the closed-egg pose hides the other hatch stages.
            npc.idleSeqId = 11507;
        }
        this.overrides.set(id, npc);
        return npc;
    }
    getCount(): number { return this.base.getCount(); }
    clearCache(): void { this.overrides.clear(); this.base.clearCache(); }
}
