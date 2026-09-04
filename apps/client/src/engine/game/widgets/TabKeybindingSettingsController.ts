import type { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import type { WidgetActionEvent } from "@client/engine/game/widgets/widgetActionPayload";
import { resolveWidgetIdentifiers } from "@client/engine/game/widgets/widgetActionPayload";
import type { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { getNativeSettingSelection } from "./nativeSettingSelection";

// Revision 237 script 984: display row order is not numerical varbit order.
export const TAB_BINDING_VARBITS = [4675, 4676, 4677, 4678, 4679, 4680, 4682,
    4684, 6517, 4689, 4686, 4687, 4683, 4688] as const;

export function setUniqueTabBinding(vars: Pick<VarManager, "getVarbit" | "setVarbit">, row: number, key: number): void {
    if (!Number.isInteger(row) || row < 0 || row >= TAB_BINDING_VARBITS.length ||
        !Number.isInteger(key) || key < 0 || key > 13) return;
    if (key > 0) {
        for (const varbit of TAB_BINDING_VARBITS) {
            if (vars.getVarbit(varbit) === key) vars.setVarbit(varbit, 0);
        }
    }
    vars.setVarbit(TAB_BINDING_VARBITS[row], key);
}

/** Completes the native 121 dropdown, whose onOp (983) only hides the list. */
export class TabKeybindingSettingsController {
    private activeRow?: number;

    observeAction(manager: WidgetManager | undefined, event: WidgetActionEvent): { row: number; key: number } | undefined {
        const native = getNativeSettingSelection(event);
        // Script 3963's setting IDs, in the All Settings grid order.
        const settingsVarbits = [4675,4680,4686,4676,4682,4687,4677,4684,4683,4678,6517,4688,4679,4689];
        if (native?.type === 3 && native.id >= 16 && native.id <= 29 && native.value >= 0 && native.value <= 13) {
            this.activeRow = undefined;
            return { row: TAB_BINDING_VARBITS.indexOf(settingsVarbits[native.id - 16] as typeof TAB_BINDING_VARBITS[number]), key: native.value };
        }
        const ids = resolveWidgetIdentifiers(manager, event.widget);
        if (!ids || ids.groupId !== 121) {
            this.activeRow = undefined;
            return undefined;
        }
        const child = ids.widgetId & 0xffff;
        if (child >= 9 && child <= 100 && (child - 9) % 7 === 0) {
            this.activeRow = (child - 9) / 7;
            return undefined;
        }
        if (child !== 111 || String(event.option).toLowerCase() !== "select") return undefined;
        const row = this.activeRow;
        this.activeRow = undefined;
        // Script 982 uses the enum key itself as the dynamic child index (0=None).
        const key = event.widget.childIndex ?? event.slot;
        return row !== undefined && Number.isInteger(key) && key >= 0 && key <= 13 ? { row, key } : undefined;
    }
}
