import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerCustomsOfficer } from "@server/content/gamemodes/vanilla/scripts/content/travel/boats/customsOfficer";
import { registerEntranaMonks } from "@server/content/gamemodes/vanilla/scripts/content/travel/boats/entranaMonks";
import { registerGangplanks } from "@server/content/gamemodes/vanilla/scripts/content/travel/boats/gangplanks";
import { registerPortSarimSailors } from "@server/content/gamemodes/vanilla/scripts/content/travel/boats/portSarimSailors";

export function registerBoatTravelHandlers(registry: IScriptRegistry): void {
    registerPortSarimSailors(registry);
    registerCustomsOfficer(registry);
    registerEntranaMonks(registry);
    registerGangplanks(registry);
}
