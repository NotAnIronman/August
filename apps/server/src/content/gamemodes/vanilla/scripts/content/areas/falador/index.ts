import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerFaladorShopHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/falador/shops";
import { registerWysonHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/falador/wyson";

export function registerFaladorAreaHandlers(registry: IScriptRegistry): void {
    registerWysonHandlers(registry);
    registerFaladorShopHandlers(registry);
}
