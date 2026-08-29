import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerLumbridgeCookHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/lumbridge/cook";
import { registerDukeHoracioHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/lumbridge/dukeHoracio";
import { registerFatherAereckHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/lumbridge/fatherAereck";
import { registerFatherUrhneyHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/lumbridge/fatherUrhney";

export function registerLumbridgeAreaHandlers(registry: IScriptRegistry): void {
    registerFatherAereckHandlers(registry);
    registerFatherUrhneyHandlers(registry);
    registerDukeHoracioHandlers(registry);
    registerLumbridgeCookHandlers(registry);
}
