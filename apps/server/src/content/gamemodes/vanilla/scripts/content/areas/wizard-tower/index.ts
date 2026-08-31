import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerSedridorHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/wizard-tower/sedridor";

export function registerWizardTowerAreaHandlers(registry: IScriptRegistry): void {
    registerSedridorHandlers(registry);
}
