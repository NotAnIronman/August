import type { NpcType } from "../../../../client/rs/config/npctype/NpcType";
import type { NpcTypeLoader } from "../../../../client/rs/config/npctype/NpcTypeLoader";
import { logger } from "../../utils/logger";
import { normalizeName, resolveDropTable } from "./helpers";
import { MANUAL_NPC_DROP_OVERRIDES } from "./manualTables";
import { loadMonstersCompleteDefinitions } from "./monstersCompleteSource";
import type { NpcDropTable } from "./types";

type ImportedLookup = {
    byNpcTypeId: Map<number, NpcDropTable>;
    exact: Map<string, NpcDropTable>;
    byName: Map<string, NpcDropTable[]>;
};

function makeCombatKey(name: string, combatLevel: number | undefined): string {
    return `${normalizeName(name)}::${combatLevel ?? -1}`;
}

function buildImportedLookup(): ImportedLookup {
    const byNpcTypeId = new Map<number, NpcDropTable>();
    const exact = new Map<string, NpcDropTable>();
    // A number of OSRSBox records are literal duplicate rows for the same
    // name/combat pair (for example General Graardor and Commander Zilyana).
    // Collapse those before the name-only fallback; otherwise a cache combat
    // level variant would make a perfectly valid table look ambiguous.
    const byNameAndCombat = new Map<string, Map<string, NpcDropTable>>();
    for (const entry of loadMonstersCompleteDefinitions()) {
        // The bootstrap reference marks many otherwise-usable rows as incomplete.
        // Keep them available until a manual override replaces them.
        if (entry.duplicate) continue;
        const table = resolveDropTable(entry.table);
        if (!table) continue;
        const nameKey = normalizeName(entry.name);
        if (!nameKey) continue;
        const combatKey = makeCombatKey(entry.name, entry.combatLevel);
        if (entry.npcTypeId !== undefined && !byNpcTypeId.has(entry.npcTypeId)) {
            byNpcTypeId.set(entry.npcTypeId, table);
        }
        if (!exact.has(combatKey)) exact.set(combatKey, table);
        const bucket = byNameAndCombat.get(nameKey) ?? new Map<string, NpcDropTable>();
        if (!bucket.has(combatKey)) bucket.set(combatKey, table);
        byNameAndCombat.set(nameKey, bucket);
    }
    const byName = new Map<string, NpcDropTable[]>();
    for (const [name, entries] of byNameAndCombat) {
        byName.set(name, [...entries.values()]);
    }
    return { byNpcTypeId, exact, byName };
}

export class NpcDropRegistry {
    private readonly resolvedByNpcTypeId = new Map<number, NpcDropTable | null>();
    private readonly manualByNpcTypeId = new Map<number, NpcDropTable>();
    private readonly imported = buildImportedLookup();

    constructor(private readonly npcTypeLoader: NpcTypeLoader) {
        for (const override of MANUAL_NPC_DROP_OVERRIDES) {
            const table = resolveDropTable(override.table);
            if (!table) continue;
            for (const npcTypeId of override.npcTypeIds) {
                this.manualByNpcTypeId.set(npcTypeId, table);
            }
        }
    }

    get(npcTypeId: number): NpcDropTable | undefined {
        const normalized = npcTypeId;
        const cached = this.resolvedByNpcTypeId.get(normalized);
        if (cached !== undefined) return cached ?? undefined;

        const manual = this.manualByNpcTypeId.get(normalized);
        if (manual) {
            this.resolvedByNpcTypeId.set(normalized, manual);
            return manual;
        }

        // This is the authoritative OSRSBox join: its top-level record ID is
        // the cache NPC type ID. Name/combat matching below remains only for
        // cache variants or incomplete data sets without an ID.
        const importedById = this.imported.byNpcTypeId.get(normalized);
        if (importedById) {
            this.resolvedByNpcTypeId.set(normalized, importedById);
            return importedById;
        }

        let npcType: NpcType | undefined;
        try {
            npcType = this.npcTypeLoader.load(normalized);
        } catch (err) {
            logger.warn(`[drops] failed to load npc type ${normalized} for drop lookup`, err);
            this.resolvedByNpcTypeId.set(normalized, null);
            return undefined;
        }
        const resolved = this.resolveImported(npcType);
        this.resolvedByNpcTypeId.set(normalized, resolved ?? null);
        return resolved;
    }

    private resolveImported(npcType: NpcType | undefined): NpcDropTable | undefined {
        const name = String(npcType?.name ?? "").trim();
        if (!name || name === "null") return undefined;
        const exact = this.imported.exact.get(makeCombatKey(name, npcType?.combatLevel));
        if (exact) return exact;
        const fallback = this.imported.byName.get(normalizeName(name));
        if (fallback?.length === 1) return fallback[0];
        return undefined;
    }
}
