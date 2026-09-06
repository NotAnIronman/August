import type { CommandEvent, IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { addNpcCategoryMapping } from "@server/content/gamemodes/vanilla/slayer/SlayerNpcCategoryMap";
import { SLAYER_CATEGORIES, getSlayerCategory } from "@server/content/gamemodes/vanilla/slayer/SlayerMonsterCategories";
import { completeActiveTaskInstantly } from "@server/content/gamemodes/vanilla/slayer/SlayerService";

const ADD_USAGE = "Usage: ::addslayernpc <categoryKey> <npcTypeId>. See ::slayercategories for valid keys.";

/**
 * Operator tooling for SlayerNpcCategoryMap.ts's authored npcId -> category
 * table. The whole point of moving that table to a JSON catalog file (see
 * SlayerNpcCategoryMap.ts's doc comment) was to make additions like "this
 * server also counts Tstanon Karlak toward black_demons" a one-line command
 * instead of a code patch — these two commands are that interface.
 */
export function registerSlayerAdminCommands(registry: IScriptRegistry, _services: ScriptServices): void {
    registry.registerCommand(
        "addslayernpc",
        (event: CommandEvent) => {
            const [categoryKey, npcIdRaw] = event.args;
            if (!categoryKey || !npcIdRaw) return ADD_USAGE;

            if (!getSlayerCategory(categoryKey)) {
                return `Unknown category "${categoryKey}". Run ::slayercategories to see valid keys.`;
            }

            const npcTypeId = Number(npcIdRaw);
            if (!Number.isInteger(npcTypeId) || npcTypeId < 0) {
                return `"${npcIdRaw}" isn't a valid npc id.`;
            }

            const result = addNpcCategoryMapping(npcTypeId, categoryKey);
            switch (result.kind) {
                case "added":
                    return `Added npc ${npcTypeId} to "${categoryKey}". Takes effect immediately — no restart needed.`;
                case "already-present":
                    return `Npc ${npcTypeId} is already mapped to "${categoryKey}".`;
                case "write-failed":
                    return `Added in memory, but failed to persist to disk — this will be lost on restart. Check server logs.`;
            }
        },
        {
            permission: "admin",
            owner: "content:slayer",
            summary: "Map an npc id to a Slayer task category (persists immediately, no restart).",
        },
    );

    registry.registerCommand(
        "slayercategories",
        () => SLAYER_CATEGORIES.map((c) => c.key).join(", "),
        {
            permission: "admin",
            owner: "content:slayer",
            summary: "List every valid Slayer category key (for use with ::addslayernpc).",
        },
    );

    registry.registerCommand(
        "completetask",
        (event: CommandEvent) => {
            const result = completeActiveTaskInstantly(event.player, event.services);
            if (result.kind === "no-task") return "You don't have an active Slayer task.";
            const category = getSlayerCategory(result.task.categoryKey);
            return (
                `Completed as if you killed ${result.task.remainingAmount} more ${category?.displayName ?? result.task.categoryKey} ` +
                `(+${result.xpGranted} Slayer xp). Gained ${result.pointsAwarded} Slayer points ` +
                `(total: ${result.totalPoints}, streak: ${result.streak}).`
            );
        },
        {
            permission: "admin",
            owner: "content:slayer",
            summary: "Instantly complete your active Slayer task for testing (grants xp/points as if all kills landed).",
        },
    );
}
