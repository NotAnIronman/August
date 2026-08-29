import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { register as registerAltars } from "@server/content/gamemodes/vanilla/skills/prayer/altars";
import { register as registerPrayer } from "@server/content/gamemodes/vanilla/skills/prayer/prayer";

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerPrayer(registry, services);
    registerAltars(registry, services);
}
