import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { registerBossHealthHudPreviewCommand } from "@server/content/gamemodes/vanilla/scripts/bossHealthHudPreview";
import { registerNpcAnimationReviewCommands } from "@server/content/gamemodes/vanilla/scripts/npcAnimationReview";
import { registerModelViewerCommands } from "@server/content/gamemodes/vanilla/scripts/modelViewer";

export function registerVanillaCommandHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registerBossHealthHudPreviewCommand(registry, services);
    registerNpcAnimationReviewCommands(registry, services);
    registerModelViewerCommands(registry, services);
}
