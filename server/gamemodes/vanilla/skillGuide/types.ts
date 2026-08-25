import type { SkillId } from "../../../../client/rs/skill/skills";

/**
 * Skill guide data schema.
 *
 * The skill guide panel renders as a Settings-style layout: a sidebar of
 * tabs down the left (e.g. Smithing: "Smelting", "Bronze", "Blurite",
 * "Iron", "Steel", "Mithril", "Adamant", "Rune"), and a scrollable list of
 * entries in the selected tab, each with a level, an item icon, a name,
 * and an optional note (ingredients, requirements, etc).
 *
 * One file per skill lives in ./data/<skillName>.ts, each exporting a
 * single `SkillGuideData` object. The checked-in files are generated from
 * the OSRS Wiki's public `Skill/Level up table` pages by
 * `server/scripts/sync-wiki-skill-guides.ts`; refresh them through that
 * importer rather than hand-editing individual rows.
 */

export interface SkillGuideEntry {
    /**
     * In-game item id used to render the icon next to this entry (same
     * `itemId` field used for item icons everywhere else in the client,
     * e.g. bank slots, the Smithing bar picker). Look real ids up in
     * server/data/items.json by name - don't guess/invent one.
     */
    itemId: number;
    /** Level required. Shown to the left of the icon. */
    level: number;
    /** Display name shown next to the icon (e.g. "Bronze", "Steel"). */
    name: string;
    /**
     * Optional secondary line shown below the name - ingredients,
     * requirements, success chance, quest requirements, etc.
     * e.g. "1 tin ore & 1 copper ore", "(after Knight's Sword quest)".
     * Leave undefined if there's nothing to show.
     */
    description?: string;
}

export interface SkillGuideTab {
    /** Sidebar tab label, e.g. "Smelting", "Bronze". */
    label: string;
    /** Entries in this tab, top to bottom, in display order. */
    entries: SkillGuideEntry[];
}

export interface SkillGuideData {
    skillId: SkillId;
    /** Tabs in sidebar order. An empty array is still safe for a future skill. */
    tabs: SkillGuideTab[];
}
