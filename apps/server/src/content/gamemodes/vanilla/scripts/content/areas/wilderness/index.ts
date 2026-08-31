import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerMuddyChestHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/wilderness/muddyChest";

export function registerWildernessAreaHandlers(registry: IScriptRegistry): void {
    registerMuddyChestHandlers(registry);
}
