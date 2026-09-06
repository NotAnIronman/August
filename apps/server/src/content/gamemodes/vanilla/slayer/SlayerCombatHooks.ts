import { logger } from "@server/observability/logger";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { handleNpcKilled } from "@server/content/gamemodes/vanilla/slayer/SlayerService";

/**
 * Registers the Slayer progress tracker against the confirmed-kill hook —
 * the same choke point used by boss-killcounts and the Achievement Diary's
 * AchievementTaskTracker.checkKillTrigger (services.combat.registerOnNpcKilled).
 */
export function registerSlayerCombatHooks(registry: IScriptRegistry, services: ScriptServices): void {
    if (!services.combat.registerOnNpcKilled) {
        logger.warn(
            "[slayer] services.combat.registerOnNpcKilled is not available on this build — " +
                "the Slayer kill hook cannot attach at all.",
        );
        return;
    }

    const unregister = services.combat.registerOnNpcKilled((killer, npc) => {
        let outcome;
        try {
            outcome = handleNpcKilled(killer, npc, services);
        } catch (error) {
            logger.error(`[slayer] handleNpcKilled threw for npcTypeId=${npc.typeId}`, error);
            return;
        }

        if (outcome.kind === "progress") {
            services.messaging.sendGameMessage(
                killer,
                `[Slayer] Progress: ${outcome.task.remainingAmount} left.`,
            );
        } else if (outcome.kind === "completed") {
            services.messaging.sendGameMessage(
                killer,
                `You've completed your Slayer task! You gained ${outcome.pointsAwarded} Slayer points (streak: ${outcome.streak}).`,
            );
        } else if (outcome.kind === "not-a-match") {
            // The killed npcTypeId isn't in SlayerNpcCategoryMap.ts under the
            // active task's category. Every mismatch reports the real id/name
            // so an operator can fix it in one command, no code patch needed:
            //     ::addslayernpc <category> <npcTypeId>
            logger.info(
                `[slayer] unmapped kill: npcTypeId=${outcome.npcTypeId} name=${JSON.stringify(outcome.npcName)} ` +
                    `expectedCategory=${outcome.expectedCategoryKey} player=${killer.id}`,
            );
            services.messaging.sendGameMessage(
                killer,
                `[Slayer] "${outcome.npcName ?? "That"}" (npc id ${outcome.npcTypeId}) doesn't count toward your ` +
                    `"${outcome.expectedCategoryKey}" task. If it should, an admin can run: ` +
                    `::addslayernpc ${outcome.expectedCategoryKey} ${outcome.npcTypeId}`,
            );
        }
    });
    logger.info("[slayer] combat kill hook registered successfully.");
    if (unregister) registry.registerCleanup(unregister);
}
