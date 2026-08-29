import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { register as registerPandemonium } from "@server/content/gamemodes/vanilla/skills/sailing/pandemonium";

export {
    isPlayerOnDockedSailingBoat,
    restoreDockedSailingState,
    restoreSailingInstanceUi,
    handleSailingPlayerRestore,
    resetSailingState,
} from "@server/content/gamemodes/vanilla/skills/sailing/pandemonium";

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerPandemonium(registry, services);
}
