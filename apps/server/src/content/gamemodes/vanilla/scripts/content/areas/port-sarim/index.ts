import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerPortSarimShopHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/port-sarim/shops";

export function registerPortSarimAreaHandlers(registry: IScriptRegistry): void {
    registerPortSarimShopHandlers(registry);
}
