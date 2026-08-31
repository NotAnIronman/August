import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { register as registerPicklock } from "@server/content/gamemodes/vanilla/skills/thieving/picklock";
import { register as registerPickpocket } from "@server/content/gamemodes/vanilla/skills/thieving/pickpocket";

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerPickpocket(registry, services);
    registerPicklock(registry, services);
}
