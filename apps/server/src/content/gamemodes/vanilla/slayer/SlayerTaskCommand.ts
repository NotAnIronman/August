import type { CommandEvent, IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";
import { getSlayerCategory } from "@server/content/gamemodes/vanilla/slayer/SlayerMonsterCategories";
import { cancelTask, describeTask } from "@server/content/gamemodes/vanilla/slayer/SlayerService";
import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";
import { getSlayerPoints, getSlayerStreak } from "@server/content/gamemodes/vanilla/slayer/SlayerVarbitSync";

const USAGE = "Usage: ::task [cancel]. Shows your current Slayer assignment and points.";

function buildStatusMessage(player: PlayerState): string {
    const task = slayerTaskTracker.getTask(player.id);
    const points = getSlayerPoints(player);
    const streak = getSlayerStreak(player);
    if (!task) {
        return `You don't have a Slayer task. Points: ${points} (streak: ${streak}).`;
    }
    const category = getSlayerCategory(task.categoryKey);
    return `Task: kill ${describeTask(task)}. Points: ${points} (streak: ${streak}).${
        category?.locationHint ? ` Hint: ${category.locationHint}` : ""
    }`;
}

/**
 * Player-facing ::task command — the person reported no way to check their
 * assignment outside the master's dialogue. Registered at "player"
 * permission (unlike the ::bosshud-style developer commands elsewhere in
 * this file's siblings) since this is regular Slayer UX, not a dev tool.
 */
export function registerSlayerTaskCommand(registry: IScriptRegistry, _services: ScriptServices): void {
    registry.registerCommand(
        "task",
        (event: CommandEvent) => {
            const { player, args } = event;
            const sub = args[0]?.toLowerCase();
            if (sub === "cancel") {
                if (!slayerTaskTracker.getTask(player.id)) return "You don't have a Slayer task to cancel.";
                cancelTask(player);
                return "Your Slayer task has been cancelled.";
            }
            if (sub === "help") return USAGE;
            return buildStatusMessage(player);
        },
        {
            permission: "player",
            owner: "content:slayer",
            summary: "Check your current Slayer task and reward points.",
        },
    );
}
