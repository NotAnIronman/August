import type { SqliteDatabase } from "../state/SqliteDatabase";
import {
    type DialogueTree,
    type DialogueTreeJson,
    validateDialogueTreeJson,
} from "./DialogueTree";

/**
 * Persists developer-edited dialogue trees, keyed by NPC id (not name — many
 * distinct NPC ids share a display name, e.g. "Man" is 3106, 3108, ...; each
 * gets its own independent tree, matching how OSRS dialogue actually varies
 * per id even when the name is shared).
 *
 * Reads go through an in-memory cache (dialogue lookup happens on every
 * Talk-to click, so we don't want a DB round trip in the hot path); writes
 * go straight to SQLite and update the cache immediately so ::editdialogue
 * changes apply without a restart.
 */
export class DialogueOverrideStore {
    private readonly cache = new Map<number, DialogueTree>();
    private loaded = false;

    constructor(private readonly database: SqliteDatabase) {}

    private ensureLoaded(): void {
        if (this.loaded) return;
        this.loaded = true;
        const rows = this.database.connection
            .prepare("SELECT npc_id AS npcId, tree_json AS treeJson, updated_by AS updatedBy, updated_at AS updatedAt FROM dialogue_overrides")
            .all() as Array<{ npcId: number; treeJson: string; updatedBy: string; updatedAt: string }>;
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.treeJson) as DialogueTreeJson;
                this.cache.set(row.npcId, {
                    npcId: row.npcId,
                    steps: parsed.steps,
                    updatedBy: row.updatedBy,
                    updatedAt: row.updatedAt,
                });
            } catch {
                // Corrupt row (shouldn't happen — validated on write). Skip rather than crash.
            }
        }
    }

    /** Returns the override tree for this NPC id, or undefined if none exists. */
    get(npcId: number): DialogueTree | undefined {
        this.ensureLoaded();
        return this.cache.get(npcId);
    }

    has(npcId: number): boolean {
        this.ensureLoaded();
        return this.cache.has(npcId);
    }

    /**
     * Validate and persist a tree for an NPC id. Returns validation errors
     * (empty array on success) — caller is responsible for surfacing these
     * to the developer, e.g. as chat messages.
     */
    set(npcId: number, treeJson: DialogueTreeJson, editedBy: string): string[] {
        const errors = validateDialogueTreeJson(treeJson);
        if (errors.length > 0) {
            return errors.map((e) => `${e.path}: ${e.message}`);
        }
        this.ensureLoaded();
        const updatedAt = new Date().toISOString();
        const serialized = JSON.stringify({ steps: treeJson.steps });
        this.database.connection
            .prepare(
                `INSERT INTO dialogue_overrides (npc_id, tree_json, updated_by, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(npc_id) DO UPDATE SET
                    tree_json = excluded.tree_json,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at`,
            )
            .run(npcId, serialized, editedBy, updatedAt);
        this.cache.set(npcId, { npcId, steps: treeJson.steps, updatedBy: editedBy, updatedAt });
        return [];
    }

    /** Removes an override, reverting that NPC id to its script-authored default dialogue. */
    delete(npcId: number): boolean {
        this.ensureLoaded();
        const result = this.database.connection
            .prepare("DELETE FROM dialogue_overrides WHERE npc_id = ?")
            .run(npcId);
        this.cache.delete(npcId);
        return result.changes > 0;
    }
}
