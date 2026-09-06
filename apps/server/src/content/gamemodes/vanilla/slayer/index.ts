import { logger } from "@server/observability/logger";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { registerSlayerAdminCommands } from "@server/content/gamemodes/vanilla/slayer/SlayerAdminCommands";
import { registerSlayerCombatHooks } from "@server/content/gamemodes/vanilla/slayer/SlayerCombatHooks";
import { registerSlayerMasterTalk } from "@server/content/gamemodes/vanilla/slayer/SlayerMasterTalk";
import { registerSlayerRewardsPanelHandlers } from "@server/content/gamemodes/vanilla/slayer/SlayerRewardsPanel";
import { registerSlayerTaskCommand } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskCommand";
import { registerSlayerDialogueActions } from "@server/content/gamemodes/vanilla/slayer/slayerDialogueActions";

export { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";
export * from "@server/content/gamemodes/vanilla/slayer/types";

/**
 * Registers the whole Slayer skill: master dialogue (Talk-to/Assignment/
 * Trade/Rewards), the slayer.* DialogueActionRegistry bridge, the custom
 * Slayer Rewards panel, and the confirmed-kill hook that drives task
 * progress, XP, and points.
 *
 * Player-state persistence (task/points/streak/unlocks) is NOT registered
 * here — it hooks into VanillaGamemode.initializePlayer/serializePlayerState/
 * deserializePlayerState directly (see content/gamemodes/vanilla/index.ts),
 * the same way achievementTaskTracker does, since content modules have no
 * generic per-player persistence hook of their own.
 */
export function registerSlayerHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    logger.info("[slayer] registerSlayerHandlers() called — Slayer module is being wired up.");
    registerSlayerDialogueActions(services);
    registerSlayerMasterTalk(registry, services);
    registerSlayerCombatHooks(registry, services);
    registerSlayerTaskCommand(registry, services);
    registerSlayerAdminCommands(registry, services);
    registerSlayerRewardsPanelHandlers(registry, services);
}
