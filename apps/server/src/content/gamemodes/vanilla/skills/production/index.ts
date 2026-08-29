import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { executeBoltEnchantAction } from "@server/content/gamemodes/vanilla/skills/production/boltEnchant";
import { executeCookAction, registerCookingInteractions } from "@server/content/gamemodes/vanilla/skills/production/cooking";
import { getCookingRecipeByRawItemId } from "@server/content/gamemodes/vanilla/skills/production/cookingData";
import { executeTanAction, registerTanningInteractions } from "@server/content/gamemodes/vanilla/skills/production/tanning";

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerActionHandler("skill.cook", executeCookAction);
    registry.registerActionHandler("skill.tan", executeTanAction);
    registry.registerActionHandler("skill.bolt_enchant", executeBoltEnchantAction);

    services.getCookingRecipeByRawItemId = (itemId) => {
        const recipe = getCookingRecipeByRawItemId(itemId);
        if (!recipe) return undefined;
        return { cookedItemId: recipe.cookedItemId, xp: recipe.xp };
    };

    registerCookingInteractions(registry, services);
    registerTanningInteractions(registry, services);
}
