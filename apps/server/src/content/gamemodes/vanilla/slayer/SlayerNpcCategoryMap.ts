/**
 * Authoritative npcTypeId -> Slayer category mapping.
 *
 * Loaded from data/catalogs/server/slayer-npc-categories.json — a plain
 * JSON file, NOT compiled TypeScript, so it can be hand-edited or edited
 * via the in-game ::addslayernpc admin command WITHOUT a code patch/
 * redeploy. This replaced an earlier runtime name-match against
 * npc-spawns.json, which turned out to be unworkable for two reasons
 * found in testing:
 *
 *   1. Cache-vs-reference-data drift: a server's live cache can assign
 *      different names/ids than whatever cache the committed reference
 *      JSON snapshots were exported from (see CacheEnv.ts's cache-
 *      selection fix).
 *   2. More fundamentally: which monsters count toward which Slayer task
 *      is a SERVER DESIGN DECISION, not something derivable from names at
 *      all. E.g. this server counts Tstanon Karlak (Zamorak GWD), Demonic
 *      gorillas, and Stunted demonic gorillas toward "black_demons" tasks
 *      alongside actual black demons — real OSRS doesn't do this, and no
 *      amount of name-matching against monster names would ever produce
 *      that mapping. It has to be authored.
 *
 * TO ADD A NEW MONSTER: either edit slayer-npc-categories.json directly
 * (npcTypeId string -> array of category keys from
 * SlayerMonsterCategories.ts), or in-game run:
 *     ::addslayernpc <categoryKey> <npcTypeId>
 * (see SlayerAdminCommands.ts) — this appends to the same JSON file, so
 * the change survives restarts and no server code needs to change.
 *
 * TO FIND AN UNMAPPED MONSTER'S REAL ID: kill it while a Slayer task
 * matching its intended category is active. SlayerCombatHooks.ts sends
 * an in-game "[Slayer debug]" message showing the kill's real npcTypeId
 * whenever it doesn't match the active task — copy that id into
 * ::addslayernpc.
 */
import fs from "fs";
import { serverCatalogPath } from "@server/paths";
import { logger } from "@server/observability/logger";

const CATALOG_PATH = serverCatalogPath("slayer-npc-categories.json");

let cache: Map<number, string[]> | undefined;
let inverseCache: Map<string, number[]> | undefined;

function loadFromDisk(): Map<number, string[]> {
    const map = new Map<number, string[]>();
    try {
        const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as Record<string, string[]>;
        for (const [npcIdStr, categories] of Object.entries(raw)) {
            const npcId = Number(npcIdStr);
            if (!Number.isInteger(npcId) || npcId < 0) continue;
            if (!Array.isArray(categories)) continue;
            map.set(
                npcId,
                categories.filter((c): c is string => typeof c === "string"),
            );
        }
        logger.info(`[slayer] loaded ${map.size} npc->category mappings from ${CATALOG_PATH}`);
    } catch (error) {
        logger.warn(`[slayer] failed to load ${CATALOG_PATH} — starting with an empty category map`, error);
    }
    return map;
}

function getCache(): Map<number, string[]> {
    if (!cache) cache = loadFromDisk();
    return cache;
}

function invalidateInverse(): void {
    inverseCache = undefined;
}

export function getCategoryKeysForNpcId(npcTypeId: number): readonly string[] {
    return getCache().get(npcTypeId) ?? [];
}

/** Inverse index, built once on first use and rebuilt after any mutation. */
export function getNpcIdsForCategory(categoryKey: string): readonly number[] {
    if (!inverseCache) {
        const map = new Map<string, number[]>();
        for (const [npcId, categories] of getCache().entries()) {
            for (const category of categories) {
                const list = map.get(category);
                if (list) list.push(npcId);
                else map.set(category, [npcId]);
            }
        }
        inverseCache = map;
    }
    return inverseCache.get(categoryKey) ?? [];
}

export type AddNpcCategoryMappingResult =
    | { kind: "added" }
    | { kind: "already-present" }
    | { kind: "write-failed"; error: unknown };

/**
 * Adds one npcId -> categoryKey mapping and persists it back to
 * slayer-npc-categories.json immediately, so it survives a restart.
 * Does NOT validate that categoryKey is a real SlayerCategoryDefinition
 * key — callers (SlayerAdminCommands.ts) are expected to check that
 * against SlayerMonsterCategories.getSlayerCategory first, so this stays
 * a plain data-layer function.
 */
export function addNpcCategoryMapping(npcTypeId: number, categoryKey: string): AddNpcCategoryMappingResult {
    const map = getCache();
    const existing = map.get(npcTypeId) ?? [];
    if (existing.includes(categoryKey)) return { kind: "already-present" };

    const updated = [...existing, categoryKey].sort();
    map.set(npcTypeId, updated);
    invalidateInverse();

    try {
        const serializable: Record<string, string[]> = {};
        for (const [id, categories] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
            serializable[String(id)] = categories;
        }
        fs.writeFileSync(CATALOG_PATH, JSON.stringify(serializable, null, 2) + "\n");
    } catch (error) {
        logger.error(`[slayer] failed to persist ${CATALOG_PATH} after adding npc ${npcTypeId} -> ${categoryKey}`, error);
        return { kind: "write-failed", error };
    }

    logger.info(`[slayer] added npc ${npcTypeId} -> "${categoryKey}" (persisted to ${CATALOG_PATH})`);
    return { kind: "added" };
}
