import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { register as registerAgility } from "@server/content/gamemodes/vanilla/skills/agility/index";
import { register as registerConsumables } from "@server/content/gamemodes/vanilla/skills/consumables/index";
import { register as registerCrafting } from "@server/content/gamemodes/vanilla/skills/crafting/index";
import { register as registerFiremaking } from "@server/content/gamemodes/vanilla/skills/firemaking/index";
import { register as registerFishing } from "@server/content/gamemodes/vanilla/skills/fishing/index";
import { register as registerFletching } from "@server/content/gamemodes/vanilla/skills/fletching/index";
import { register as registerHerblore } from "@server/content/gamemodes/vanilla/skills/herblore/index";
import { register as registerMining } from "@server/content/gamemodes/vanilla/skills/mining/index";
import { register as registerPrayer } from "@server/content/gamemodes/vanilla/skills/prayer/index";
import { register as registerProduction } from "@server/content/gamemodes/vanilla/skills/production/index";
import { register as registerRunecrafting } from "@server/content/gamemodes/vanilla/skills/runecrafting/index";
import { register as registerSailing } from "@server/content/gamemodes/vanilla/skills/sailing/index";
import { register as registerSmithing } from "@server/content/gamemodes/vanilla/skills/smithing/index";
import { register as registerThieving } from "@server/content/gamemodes/vanilla/skills/thieving/index";
import { register as registerWoodcutting } from "@server/content/gamemodes/vanilla/skills/woodcutting/index";

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerAgility(registry);
    registerRunecrafting(registry);
    registerThieving(registry, services);
    registerHerblore(registry, services);
    registerPrayer(registry, services);
    registerFletching(registry, services);
    registerCrafting(registry, services);
    registerFiremaking(registry, services);
    registerWoodcutting(registry, services);
    registerMining(registry, services);
    registerFishing(registry, services);
    registerProduction(registry, services);
    registerSmithing(registry, services);
    registerConsumables(registry, services);
    registerSailing(registry, services);
}
