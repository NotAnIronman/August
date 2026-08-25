import type { NpcType } from "../../../../client/rs/config/npctype/NpcType";
import type { NpcTypeLoader } from "../../../../client/rs/config/npctype/NpcTypeLoader";
import { logger } from "../../utils/logger";
import { normalizeName, resolveDropTable } from "./helpers";
import { MANUAL_NPC_DROP_OVERRIDES } from "./manualTables";
import {
    getMonstersCompleteSourceStatus,
    loadMonstersCompleteDefinitions,
} from "./monstersCompleteSource";
import type { NpcDropTable } from "./types";

type ImportedLookup = {
    byNpcTypeId: Map<number, NpcDropTable>;
    exact: Map<string, NpcDropTable>;
    byName: Map<string, NpcDropTable[]>;
};

// These two live boss spawns have a deliberately small manual safety-net
// table. Prefer their full source-backed tables when present, but never let a
// missing ignored reference make their drops disappear altogether.
const PREFER_IMPORTED_OVER_MANUAL = new Set([2205, 2215]);

export type NpcDropLookupDescription = {
    source: "imported-id" | "imported-name" | "manual" | "none";
    sourceEntries: number;
    sourceError?: string;
    alwaysCount: number;
    poolCount: number;
    entryCount: number;
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

        // OSRSBox's top-level ID is the exact cache NPC type ID and must win
        // for the explicit GWD safety-net entries above.
        const importedById = this.imported.byNpcTypeId.get(normalized);
        if (importedById && PREFER_IMPORTED_OVER_MANUAL.has(normalized)) {
            this.resolvedByNpcTypeId.set(normalized, importedById);
            return importedById;
        }

        const manual = this.manualByNpcTypeId.get(normalized);
        if (manual) {
            this.resolvedByNpcTypeId.set(normalized, manual);
            return manual;
        }

        // This is the authoritative OSRSBox join: its top-level record ID is
        // the cache NPC type ID. Name/combat matching below remains only for
        // cache variants or incomplete data sets without an ID.
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

    describe(npcTypeId: number): NpcDropLookupDescription {
        const source = getMonstersCompleteSourceStatus();
        const table = this.get(npcTypeId);
        const directImported = this.imported.byNpcTypeId.get(npcTypeId);
        const manual = this.manualByNpcTypeId.get(npcTypeId);
        let lookupSource: NpcDropLookupDescription["source"] = "none";
        if (directImported && PREFER_IMPORTED_OVER_MANUAL.has(npcTypeId)) {
            lookupSource = "imported-id";
        } else if (manual) {
            lookupSource = "manual";
        } else if (directImported) {
            lookupSource = "imported-id";
        } else if (table) {
            lookupSource = "imported-name";
        }
        return {
            source: lookupSource,
            sourceEntries: source.entryCount,
            sourceError: source.error,
            alwaysCount: table?.always.length ?? 0,
            poolCount: table?.pools.length ?? 0,
            entryCount:
                (table?.always.length ?? 0) +
                (table?.pools.reduce((count, pool) => count + pool.entries.length, 0) ?? 0),
        };
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
