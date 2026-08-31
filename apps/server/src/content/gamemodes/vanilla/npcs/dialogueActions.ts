import type { ScriptServices } from "@server/game/scripts/types";

/**
 * Reusable trusted effects for persisted/imported dialogue trees. Content
 * systems add domain-specific keys (for example Slayer task assignment) next
 * to these general-purpose actions when those systems are implemented.
 */
export function registerVanillaDialogueActions(services: ScriptServices): void {
    const actions = services.dialogueActions;
    if (!actions) return;

    if (!actions.has("bank.open")) {
        actions.register("bank.open", ({ player, args }) => {
            const mode = args.mode === "collect" ? "collect" : "bank";
            services.banking?.openBank?.(player, { mode });
            return "stop";
        });
    }

    if (!actions.has("shop.openForNpc")) {
        actions.register("shop.openForNpc", ({ player, npcId }) => {
            services.shopping?.openShop?.(player, { npcTypeId: npcId });
            return "stop";
        });
    }

    if (!actions.has("message.send")) {
        actions.register("message.send", ({ player, args }) => {
            if (typeof args.text === "string" && args.text.trim()) {
                services.messaging.sendGameMessage(player, args.text);
            }
        });
    }
}
