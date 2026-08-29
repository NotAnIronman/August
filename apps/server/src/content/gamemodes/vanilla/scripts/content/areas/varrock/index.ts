import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerBaraekHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/varrock/baraek";
import { registerReldoHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/varrock/reldo";

export function registerVarrockAreaHandlers(registry: IScriptRegistry): void {
    registerReldoHandlers(registry);
    registerBaraekHandlers(registry);
}
