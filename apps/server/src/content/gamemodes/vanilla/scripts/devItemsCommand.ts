import type { CommandEvent, IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

const USAGE = "Usage: ::items <itemId> <itemId> ... — gives 1 of each listed item.";

/**
 * ::items <id> <id> ... — companion to the built-in ::item <id> <qty>
 * (see chatHandler.ts's inline `cmd.startsWith("item ")` handler). ::item
 * takes one id plus a quantity; this takes many ids, always 1 each, for
 * quickly assembling a test kit without repeating ::item N times.
 */
export function registerDevItemsCommand(registry: IScriptRegistry, _services: ScriptServices): void {
    registry.registerCommand(
        "items",
        (event: CommandEvent) => {
            const { player, args } = event;
            if (args.length === 0) return USAGE;

            const given: string[] = [];
            const failed: string[] = [];
            for (const raw of args) {
                const itemId = Number(raw);
                if (!Number.isInteger(itemId) || itemId < 0) {
                    failed.push(`"${raw}" (not a valid id)`);
                    continue;
                }
                const tx = player.items.addItem(itemId, 1, { assureFullInsertion: false });
                if (tx.completed > 0) given.push(`1 x ${itemId}`);
                else failed.push(`${itemId} (inventory full)`);
            }

            const parts: string[] = [];
            if (given.length > 0) parts.push(`Gave: ${given.join(", ")}.`);
            if (failed.length > 0) parts.push(`Failed: ${failed.join(", ")}.`);
            return parts.join(" ") || USAGE;
        },
        {
            permission: "developer",
            owner: "developer:inventory",
            summary: "Give 1 of each listed item id, e.g. ::items 5152 1223 45235.",
        },
    );
}
