import type { SqliteDatabase } from "@server/game/state/SqliteDatabase";

export type ExamineKind = "npc" | "loc" | "obj";

export interface ExamineOverride {
    kind: ExamineKind;
    typeId: number;
    text: string;
    updatedBy: string;
    updatedAt: string;
}

/**
 * Persists manually-curated examine text, keyed by (kind, typeId). This exists
 * because this cache revision's NpcType/LocType config data doesn't carry
 * examine text the way this project's decoder expects (see examine
 * investigation notes) — items work fine off the cache directly, NPCs and
 * locs currently don't. Rather than block on reverse-engineering the exact
 * cache format, examineHandler tries the real cache first and falls back to
 * this table. If the cache ever starts resolving text on its own (revision
 * change, decoder fix, whatever), it wins automatically — this is purely a
 * gap-filler, never an override of working data.
 *
 * Reads go through an in-memory cache (examine is a hot, frequent action);
 * writes go straight to SQLite and update the cache immediately so
 * ::setexamine changes apply without a restart.
 */
export class ExamineOverrideStore {
    private readonly cache = new Map<string, ExamineOverride>();
    private loaded = false;

    constructor(private readonly database: SqliteDatabase) {}

    private key(kind: ExamineKind, typeId: number): string {
        return `${kind}:${typeId}`;
    }

    private ensureLoaded(): void {
        if (this.loaded) return;
        this.loaded = true;
        const rows = this.database.connection
            .prepare(
                "SELECT kind, type_id AS typeId, text, updated_by AS updatedBy, updated_at AS updatedAt " +
                    "FROM examine_overrides",
            )
            .all() as unknown as ExamineOverride[];
        for (const row of rows) {
            this.cache.set(this.key(row.kind, row.typeId), row);
        }
    }

    get(kind: ExamineKind, typeId: number): string | undefined {
        this.ensureLoaded();
        return this.cache.get(this.key(kind, typeId))?.text;
    }

    set(kind: ExamineKind, typeId: number, text: string, editedBy: string): void {
        this.ensureLoaded();
        const trimmed = text.trim();
        const updatedAt = new Date().toISOString();
        this.database.connection
            .prepare(
                `INSERT INTO examine_overrides (kind, type_id, text, updated_by, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(kind, type_id) DO UPDATE SET
                    text = excluded.text,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at`,
            )
            .run(kind, typeId, trimmed, editedBy, updatedAt);
        this.cache.set(this.key(kind, typeId), {
            kind,
            typeId,
            text: trimmed,
            updatedBy: editedBy,
            updatedAt,
        });
    }

    delete(kind: ExamineKind, typeId: number): boolean {
        this.ensureLoaded();
        const result = this.database.connection
            .prepare("DELETE FROM examine_overrides WHERE kind = ? AND type_id = ?")
            .run(kind, typeId);
        this.cache.delete(this.key(kind, typeId));
        return result.changes > 0;
    }

    /** Bulk-load {typeId: text} pairs for one kind — used for wiki-sourced seed data. */
    setMany(kind: ExamineKind, entries: Record<number, string>, editedBy: string): number {
        let count = 0;
        for (const [idStr, text] of Object.entries(entries)) {
            this.set(kind, Number(idStr), text, editedBy);
            count++;
        }
        return count;
    }
}
