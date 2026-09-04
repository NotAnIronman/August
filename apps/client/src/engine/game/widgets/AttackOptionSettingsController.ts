import {
    VARP_OPTION_ATTACK_PRIORITY_NPC,
    VARP_OPTION_ATTACK_PRIORITY_PLAYER,
} from "@august/game-model/state/vars";
import type { WidgetManager } from "@client/ui/widgets/WidgetManager";
import {
    getWidgetTargetLabel,
    sanitizeText,
} from "@client/ui/widgets/menu/WidgetInteractionResolver";
import {
    resolveWidgetIdentifiers,
    type WidgetActionEvent,
} from "@client/engine/game/widgets/widgetActionPayload";
import type { AttackOptionMode } from "@client/engine/game/menu/AttackOptionPolicy";

const SETTINGS_SIDE_GROUP_ID = 116;
const PLAYER_ATTACK_ROW_UID = (SETTINGS_SIDE_GROUP_ID << 16) | 6;
const NPC_ATTACK_ROW_UID = (SETTINGS_SIDE_GROUP_ID << 16) | 7;
const DROPDOWN_LIST_UIDS = new Set<number>([
    (SETTINGS_SIDE_GROUP_ID << 16) | 38,
    (SETTINGS_SIDE_GROUP_ID << 16) | 39,
    (SETTINGS_SIDE_GROUP_ID << 16) | 40,
    (SETTINGS_SIDE_GROUP_ID << 16) | 41,
]);

const OPTION_VALUE_BY_LABEL = new Map<string, AttackOptionMode>([
    ["depends on combat levels", 0],
    ["always right-click", 1],
    ["always right click", 1],
    ["left-click where available", 2],
    ["left click where available", 2],
    ["hidden", 3],
]);

export interface AttackOptionSettingSelection {
    varpId: number;
    value: AttackOptionMode;
}

/**
 * Bridges the cache-created settings dropdown to the varp system.
 *
 * Opening these dropdowns is a client-only CS2 action, so a server handler cannot reliably infer
 * whether the shared option list belongs to the player or NPC setting. Remembering that state on
 * the client lets the normal transmit-varp path persist the selection without depending on
 * transient dynamic-widget packet IDs.
 */
export class AttackOptionSettingsController {
    private activeVarpId: number | undefined;

    observeAction(
        widgetManager: WidgetManager | undefined,
        event: WidgetActionEvent,
    ): AttackOptionSettingSelection | undefined {
        const widget = event.widget;
        const identifiers = resolveWidgetIdentifiers(widgetManager, widget);
        if (!identifiers) {
            this.activeVarpId = undefined;
            return undefined;
        }

        if (identifiers.widgetId === PLAYER_ATTACK_ROW_UID) {
            this.activeVarpId = VARP_OPTION_ATTACK_PRIORITY_PLAYER;
            return undefined;
        }
        if (identifiers.widgetId === NPC_ATTACK_ROW_UID) {
            this.activeVarpId = VARP_OPTION_ATTACK_PRIORITY_NPC;
            return undefined;
        }

        const isDropdownSelection =
            DROPDOWN_LIST_UIDS.has(identifiers.widgetId) &&
            sanitizeText(event.option)?.toLowerCase() === "select";
        if (isDropdownSelection) {
            const varpId = this.activeVarpId;
            this.activeVarpId = undefined;
            if (varpId === undefined) return undefined;
            const value = this.resolveSelectedValue(
                widgetManager,
                identifiers.widgetId,
                widget,
                event,
            );
            return value === undefined ? undefined : { varpId, value };
        }

        // Any other settings action supersedes a previously opened shared dropdown.
        if (identifiers.groupId === SETTINGS_SIDE_GROUP_ID) {
            this.activeVarpId = undefined;
        }
        return undefined;
    }

    private resolveSelectedValue(
        widgetManager: WidgetManager | undefined,
        parentUid: number,
        widget: any,
        event: WidgetActionEvent,
    ): AttackOptionMode | undefined {
        const labels = [event.target, getWidgetTargetLabel(widget)];
        for (const label of labels) {
            const normalized = sanitizeText(label)?.toLowerCase();
            if (!normalized) continue;
            const value = OPTION_VALUE_BY_LABEL.get(normalized);
            if (value !== undefined) return value;
        }

        // Text is occasionally absent from primary-click events. Rank only children carrying the
        // Select operation, rather than assuming CS2's dynamic child indexes start at zero or one.
        const parent = widgetManager?.getWidgetByUid?.(parentUid);
        const children = Array.isArray((parent as any)?.children)
            ? ((parent as any).children as any[])
            : [];
        const optionChildren = children
            .filter((child) => {
                if (!child || (child.fileId | 0) !== -1) return false;
                const actions = Array.isArray(child.actions) ? child.actions : [];
                return actions.some(
                    (action: unknown) => sanitizeText(String(action ?? ""))?.toLowerCase() === "select",
                );
            })
            .sort((left, right) => {
                const yDifference = ((left.y ?? 0) | 0) - ((right.y ?? 0) | 0);
                return yDifference || ((left.childIndex ?? 0) | 0) - ((right.childIndex ?? 0) | 0);
            });
        const selectedChildIndex =
            typeof widget?.childIndex === "number"
                ? widget.childIndex | 0
                : typeof event.slot === "number"
                  ? event.slot | 0
                  : -1;
        const selectedIndex = optionChildren.findIndex(
            (child) =>
                child === widget ||
                (selectedChildIndex >= 0 && (child.childIndex | 0) === selectedChildIndex),
        );
        return selectedIndex >= 0 && selectedIndex <= 3
            ? (selectedIndex as AttackOptionMode)
            : undefined;
    }
}
