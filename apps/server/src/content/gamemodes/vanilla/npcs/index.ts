import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { registerLumbridgeNpcHandlers } from "@server/content/gamemodes/vanilla/npcs/areas/lumbridge";
import { registerVanillaDialogueActions } from "@server/content/gamemodes/vanilla/npcs/dialogueActions";
import { registerBankerHandlers } from "@server/content/gamemodes/vanilla/npcs/generic/banker";
import { registerGenericPersonHandlers } from "@server/content/gamemodes/vanilla/npcs/generic/person";
import { registerSlayerHandlers } from "@server/content/gamemodes/vanilla/slayer";

/**
 * Registers portable OpenRune/RSMod Talk-to content:
 * Lumbridge NPCs, Varrock shop greeters, generic Man/Woman, bankers.
 */
export function registerNpcDialogueHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    registerVanillaDialogueActions(services);
    registerGenericPersonHandlers(registry);
    registerBankerHandlers(registry);
    registerLumbridgeNpcHandlers(registry);
    registerSlayerHandlers(registry, services);
}
