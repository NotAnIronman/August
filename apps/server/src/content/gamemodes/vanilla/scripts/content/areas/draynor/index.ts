/**
 * Diango — Draynor toy store greeter (LostCity diango.rs2 shop path).
 */
import type { IScriptRegistry } from "@server/game/scripts/types";
import { registerShopTalkMany } from "@server/content/gamemodes/vanilla/npcs/shopTalk";

const DIANGO = 8693;

export function registerDraynorAreaHandlers(registry: IScriptRegistry): void {
    registerShopTalkMany(registry, [
        {
            npcIds: [DIANGO],
            greeting: ["Howdy there partner!", "Want to see my toy horseys?"],
            openShopOptions: ["Toy horseys?"],
            declineOption: "I'm fine, thanks.",
        },
    ]);
}
