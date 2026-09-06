import type { ScriptServices } from "@server/game/scripts/types";
import { getSlayerCategory } from "@server/content/gamemodes/vanilla/slayer/SlayerMonsterCategories";
import { openSlayerRewardsPanel } from "@server/content/gamemodes/vanilla/slayer/SlayerRewardsPanel";
import { assignTask, cancelTask, describeTask } from "@server/content/gamemodes/vanilla/slayer/SlayerService";
import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";
import { getSlayerPoints } from "@server/content/gamemodes/vanilla/slayer/SlayerVarbitSync";

/**
 * Registers the `slayer.*` DialogueActionRegistry keys referenced by the
 * dialogue system's own README example. Hand-authored master conversations
 * (SlayerMasterTalk.ts) call SlayerService directly, but these keys let the
 * same behaviour be triggered from persisted/editor-authored dialogue trees
 * (::editdialogue) or future Wiki-imported Slayer master transcripts.
 */
export function registerSlayerDialogueActions(services: ScriptServices): void {
    const actions = services.dialogueActions;
    if (!actions) return;

    if (!actions.has("slayer.assignTask")) {
        actions.register("slayer.assignTask", ({ player, args, services: svc }) => {
            const masterId = typeof args.master === "string" ? args.master : undefined;
            if (!masterId) return;
            const existing = slayerTaskTracker.getTask(player.id);
            if (existing) {
                svc.messaging.sendGameMessage(player, `You're already hunting ${describeTask(existing)}.`);
                return;
            }
            const result = assignTask(player, masterId, svc);
            if (result.kind === "assigned") {
                const category = getSlayerCategory(result.task.categoryKey);
                svc.messaging.sendGameMessage(
                    player,
                    `Your new task is to kill ${result.task.assignedAmount} ${category?.displayName ?? result.task.categoryKey}.`,
                );
            } else if (result.kind === "level-too-low") {
                svc.messaging.sendGameMessage(
                    player,
                    `You need a combat level of ${result.requiredCombatLevel} for this master.`,
                );
            } else {
                svc.messaging.sendGameMessage(player, "You don't qualify for any of this master's tasks yet.");
            }
        });
    }

    if (!actions.has("slayer.checkTask")) {
        actions.register("slayer.checkTask", ({ player, services: svc }) => {
            const task = slayerTaskTracker.getTask(player.id);
            svc.messaging.sendGameMessage(
                player,
                task ? `Your task: kill ${describeTask(task)}.` : "You don't have an active Slayer task.",
            );
        });
    }

    if (!actions.has("slayer.cancelTask")) {
        actions.register("slayer.cancelTask", ({ player, services: svc }) => {
            cancelTask(player);
            svc.messaging.sendGameMessage(player, "Your Slayer task has been cancelled.");
        });
    }

    if (!actions.has("slayer.checkPoints")) {
        actions.register("slayer.checkPoints", ({ player, services: svc }) => {
            svc.messaging.sendGameMessage(player, `You have ${getSlayerPoints(player)} Slayer reward points.`);
        });
    }

    if (!actions.has("slayer.openRewardShop")) {
        actions.register("slayer.openRewardShop", ({ player, services: svc }) => {
            openSlayerRewardsPanel(player, svc);
            return "stop";
        });
    }
}
