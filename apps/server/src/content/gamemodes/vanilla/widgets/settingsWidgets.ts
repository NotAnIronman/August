import { VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE } from "@august/game-model/state/vars";
import {
    type IScriptRegistry,
    type ScriptServices,
} from "@server/game/scripts/types";

/**
 * Settings widget handlers - handles button clicks on the settings tab (widget 116)
 * and the settings modal (widget 134)
 *
 * When the "All Settings" button is clicked, the server sends IF_OPENSUB
 * to open the full settings modal (widget 134) in the mainmodal container.
 * When the close button is clicked, the server sends IF_CLOSESUB to close it.
 */

const SETTINGS_SIDE_GROUP_ID = 116;
const SETTINGS_MODAL_GROUP_ID = 134;
const ALL_SETTINGS_BUTTON_CHILD_ID = 32;
const MUSIC_UNLOCK_MESSAGE_TOGGLE_CHILD_ID = 127;

export function registerSettingsWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    // Handle "All Settings" button click in settings_side (widget 116)
    // Opens the settings modal (134) in the mainmodal container
    registry.registerWidgetAction({
        handler: ({ player, groupId, childId, services: svc }) => {
            // Only handle clicks on the "All Settings" button (child 32) in settings_side widget
            if (groupId !== SETTINGS_SIDE_GROUP_ID) return;
            if (childId !== ALL_SETTINGS_BUTTON_CHILD_ID) return;

            // Open the settings modal (134) in the mainmodal container
            // Use display-mode-aware helper to get correct mount target for mobile vs desktop
            const mainmodalUid = services.viewport.getMainmodalUid(player.displayMode ?? 1);

            svc.dialog.openSubInterface(player, mainmodalUid, SETTINGS_MODAL_GROUP_ID, 0);

            svc.system.logger.info?.(
                `[settings-widgets] Opened settings modal for player=${player.id}`,
            );
        },
    });

    // Handle "Toggle unlock message" checkbox click in settings_side (widget 116:127)
    // Toggles varbit 10078 (music_unlock_text_toggle) - controls whether unlock messages are shown
    registry.registerWidgetAction({
        widgetId: (SETTINGS_SIDE_GROUP_ID << 16) | MUSIC_UNLOCK_MESSAGE_TOGGLE_CHILD_ID,
        option: "Toggle unlock message",
        handler: ({ player, services: svc }) => {
            // Toggle the varbit value (0 <-> 1)
            const currentValue = player.varps.getVarbitValue(VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE);
            const newValue = currentValue === 0 ? 1 : 0;

            player.varps.setVarbitValue(VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE, newValue);
            svc.variables.sendVarbit?.(player, VARBIT_MUSIC_UNLOCK_TEXT_TOGGLE, newValue);

            svc.system.logger.info?.(
                `[settings-widgets] Music unlock message toggle: player=${player.id} value=${newValue}`,
            );
        },
    });

    // Handle close button click in settings modal (widget 134, child 4, op 1)
    // The close button fires op=1 with an empty option string (runs clientscript if_close).
    registry.registerWidgetAction({
        widgetId: (SETTINGS_MODAL_GROUP_ID << 16) | 4,
        handler: ({ player, groupId, services: svc }) => {
            // Only handle clicks on settings modal
            if (groupId !== SETTINGS_MODAL_GROUP_ID) return;

            // Close the settings modal in the mainmodal container
            const mainmodalUid = services.viewport.getMainmodalUid(player.displayMode ?? 1);

            svc.dialog.closeSubInterface(player, mainmodalUid);

            svc.system.logger.info?.(
                `[settings-widgets] Closed settings modal for player=${player.id}`,
            );
        },
    });
}
