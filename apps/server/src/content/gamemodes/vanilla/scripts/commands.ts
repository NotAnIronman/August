import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { registerNpcAnimationReviewCommands } from "@server/content/gamemodes/vanilla/scripts/npcAnimationReview";

export function registerVanillaCommandHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registerNpcAnimationReviewCommands(registry, services);
}
