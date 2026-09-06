import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { registerBossHealthHudPreviewCommand } from "@server/content/gamemodes/vanilla/scripts/bossHealthHudPreview";
import { registerDevItemsCommand } from "@server/content/gamemodes/vanilla/scripts/devItemsCommand";
import { registerDevNpcSpawnCommand } from "@server/content/gamemodes/vanilla/scripts/devNpcSpawnCommand";
import { registerNpcAnimationReviewCommands } from "@server/content/gamemodes/vanilla/scripts/npcAnimationReview";
import { registerModelViewerCommands } from "@server/content/gamemodes/vanilla/scripts/modelViewer";

export function registerVanillaCommandHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registerBossHealthHudPreviewCommand(registry, services);
    registerNpcAnimationReviewCommands(registry, services);
    registerModelViewerCommands(registry, services);
    registerDevItemsCommand(registry, services);
    registerDevNpcSpawnCommand(registry, services);
}
