import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerCrystalChestHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/taverley/crystalChest";

export function registerTaverleyAreaHandlers(registry: IScriptRegistry): void {
    registerCrystalChestHandlers(registry);
}
