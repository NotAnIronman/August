import type { UiActionId } from "@august/protocol/uikit/contracts";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

/**
 * Registers server-authoritative actions for a UIKit panel. Browser clicks
 * are only intents: an action is ignored unless its panel is currently open
 * for that authenticated player. Do not put progression, reward, or hidden
 * data decisions in client code.
 */
export type UiPanelAction = {
    componentId: number;
    actionId: UiActionId;
    handle: Parameters<IScriptRegistry["onButton"]>[2];
};

export function registerUiPanelActions(
    registry: IScriptRegistry,
    services: ScriptServices,
    groupId: number,
    actions: readonly UiPanelAction[],
): void {
    const seen = new Set<number>();
    for (const action of actions) {
        if (!Number.isInteger(action.componentId) || action.componentId < 0) {
            throw new RangeError(`Invalid UIKit component id for action ${action.actionId}`);
        }
        if (!action.actionId.trim() || seen.has(action.componentId)) {
            throw new Error(`Duplicate or empty UIKit action for panel ${groupId}`);
        }
        seen.add(action.componentId);
        registry.onButton(groupId, action.componentId, (event) => {
            // A forged packet can name any group/component. Require the panel
            // to be open before allowing its server handler to run.
            if (!services.dialog.getInterfaceService()?.isModalOpen(event.player, groupId)) return;
            action.handle(event);
        });
    }
}
