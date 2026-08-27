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
    byNpcTypeId: Map<number, ImportedTable>;
    exact: Map<string, NpcDropTable>;
    byName: Map<string, NpcDropTable[]>;
};

type ImportedTable = {
    name: string;
    table: NpcDropTable;
};

// These two live boss spawns have a deliberately small manual safety-net
// table. Prefer their full source-backed tables when present, but never let a
// missing ignored reference make their drops disappear altogether.
const PREFER_IMPORTED_OVER_MANUAL = new Set([2205, 2215]);

export type NpcDropLookupDescription = {
    source: "imported-id" | "imported-name" | "manual" | "none";
    sourceEntries: number;
    sourcePath: string;
    sourceError?: string;
    runtimeNpcName: string;
    runtimeCombatLevel: number;
    directImportedName?: string;
    nameCandidateCount: number;
    exactNameCombatMatch: boolean;
    alwaysCount: number;
    poolCount: number;
    entryCount: number;
};

function makeCombatKey(name: string, combatLevel: number | undefined): string {
    return `${normalizeName(name)}::${combatLevel ?? -1}`;
}

function buildImportedLookup(): ImportedLookup {
    const byNpcTypeId = new Map<number, ImportedTable>();
    const exact = new Map<string, NpcDropTable>();
    // A number of OSRSBox records are literal duplicate rows for the same
    // name/combat pair (for example General Graardor and Commander Zilyana).
    // Collapse those before the name-only fallback; otherwise a cache combat
    // level variant would make a perfectly valid table look ambiguous.
    const byNameAndCombat = new Map<string, Map<string, NpcDropTable>>();
    for (const entry of loadMonstersCompleteDefinitions()) {
        // Retain verified rows from a current Wiki page even if a few unusual
        // items or shared tables still need a later import pass. The record is
        // exact to this cache NPC ID, which is safer than falling back to an
        // older name-only table or showing no baseline table at all.
        const table = resolveDropTable(entry.table);
        if (!table) continue;
        const nameKey = normalizeName(entry.name);
        if (!nameKey) continue;
        const combatKey = makeCombatKey(entry.name, entry.combatLevel);
        if (entry.npcTypeId !== undefined && !byNpcTypeId.has(entry.npcTypeId)) {
            byNpcTypeId.set(entry.npcTypeId, { name: entry.name, table });
        }
        // Duplicate legacy rows are still useful for an exact NPC ID: get()
        // validates the live cache name before accepting them. Keep them out
        // of name-based fallback, where a duplicate would be ambiguous.
        if (entry.duplicate) continue;
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

        let npcType: NpcType | undefined;
        const getNpcType = (): NpcType | undefined => {
            if (npcType !== undefined) return npcType;
            try {
                npcType = this.npcTypeLoader.load(normalized);
                return npcType;
            } catch (err) {
                logger.warn(`[drops] failed to load npc type ${normalized} for drop lookup`, err);
                return undefined;
            }
        };

        // An imported ID is exact only for the cache revision it came from.
        // Validate the live definition name before using it: older bootstrap
        // data calls ID 2115 "Thing under the bed", while the target cache can
        // use that same numerical ID for General Graardor.
        const importedById = this.imported.byNpcTypeId.get(normalized);
        const directImportedMatchesLiveNpc =
            importedById !== undefined &&
            normalizeName(importedById.name) === normalizeName(String(getNpcType()?.name ?? ""));
        if (importedById && directImportedMatchesLiveNpc && PREFER_IMPORTED_OVER_MANUAL.has(normalized)) {
            this.resolvedByNpcTypeId.set(normalized, importedById.table);
            return importedById.table;
        }

        const manual = this.manualByNpcTypeId.get(normalized);
        if (manual) {
            this.resolvedByNpcTypeId.set(normalized, manual);
            return manual;
        }

        if (importedById && directImportedMatchesLiveNpc) {
            this.resolvedByNpcTypeId.set(normalized, importedById.table);
            return importedById.table;
        }

        npcType = getNpcType();
        if (!npcType) {
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
        let runtimeNpcType: NpcType | undefined;
        try {
            runtimeNpcType = this.npcTypeLoader.load(npcTypeId);
        } catch {
            // Keep ::dropsdebug useful even for a bad cache ID.
        }
        const runtimeNpcName = String(runtimeNpcType?.name ?? "").trim();
        const runtimeCombatLevel = runtimeNpcType?.combatLevel ?? -1;
        const normalizedRuntimeName = normalizeName(runtimeNpcName);
        const nameCandidateCount = normalizedRuntimeName
            ? this.imported.byName.get(normalizedRuntimeName)?.length ?? 0
            : 0;
        const exactNameCombatMatch = Boolean(
            this.imported.exact.get(makeCombatKey(runtimeNpcName, runtimeCombatLevel)),
        );
        let lookupSource: NpcDropLookupDescription["source"] = "none";
        if (directImported && table === directImported.table && PREFER_IMPORTED_OVER_MANUAL.has(npcTypeId)) {
            lookupSource = "imported-id";
        } else if (manual) {
            lookupSource = "manual";
        } else if (directImported && table === directImported.table) {
            lookupSource = "imported-id";
        } else if (table) {
            lookupSource = "imported-name";
        }
        return {
            source: lookupSource,
            sourceEntries: source.entryCount,
            sourcePath: source.path,
            sourceError: source.error,
            runtimeNpcName,
            runtimeCombatLevel,
            directImportedName: directImported?.name,
            nameCandidateCount,
            exactNameCombatMatch,
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
