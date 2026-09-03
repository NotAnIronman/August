import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { register as registerFlax } from "@server/content/gamemodes/vanilla/skills/crafting/flax";
import { register as registerSheepShearing } from "@server/content/gamemodes/vanilla/skills/crafting/sheepShearing";
import { register as registerSpinning } from "@server/content/gamemodes/vanilla/skills/crafting/spinning";
import { registerCraftingProduction } from "@server/content/gamemodes/vanilla/skills/crafting/production";

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerFlax(registry, services);
    registerSheepShearing(registry, services);
    registerSpinning(registry, services);
    registerCraftingProduction(registry, services);
}
