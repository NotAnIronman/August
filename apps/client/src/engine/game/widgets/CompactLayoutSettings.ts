import type { ScriptEvent, WidgetEventType } from "@client/engine/cs2/Cs2Vm";
import type { WidgetNode } from "@client/ui/widgets/WidgetManager";

/** Revision 237 settings_side: script 4569 selects a one-based dropdown child. */
export function getCompactLayoutSelection(
    widget: WidgetNode,
    eventType: WidgetEventType,
    event?: Partial<ScriptEvent>,
): number | undefined {
    if (!widget || eventType !== "onOp" || event?.opIndex !== 1 ||
        (widget.groupId ?? (widget.uid >>> 16)) !== 116) return undefined;
    const handler = widget.eventHandlers?.onOp;
    const legacy = widget.onOp;
    if ((handler?.scriptId ?? legacy?.[0]) !== 4569) return undefined;
    const args = handler?.intArgs ?? legacy?.slice(1);
    // This callback is shared by other compact settings. Match BOTH the layout
    // enum (3509) and setting ID (12), not a translated label or synthetic UID.
    if (!args || args.length !== 9 || args[6] !== 3509 || args[7] !== 12) return undefined;
    const child = widget.childIndex;
    return typeof child === "number" && Number.isInteger(child) && child >= 1 && child <= 3
        ? child - 1 : undefined;
}
