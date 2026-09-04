import type { WidgetActionEvent } from "./widgetActionPayload";

/** Rev 237 settings dropdown callback 3852: type, label-widget, value, ... setting-id. */
export function getNativeSettingSelection(event: WidgetActionEvent): { type: number; id: number; value: number } | undefined {
    const widget = event.widget;
    if ((widget?.groupId ?? (widget?.uid >>> 16)) !== 134 ||
        String(event.option).toLowerCase() !== "select") return undefined;
    const handler = widget.eventHandlers?.onOp;
    const legacy = widget.onOp;
    const scriptId = handler?.scriptId ?? legacy?.[0];
    if (scriptId !== 3852) return undefined;
    const args = handler?.intArgs ?? legacy?.slice(1).filter((value: unknown) => typeof value === "number");
    if (!args || args.length < 14) return undefined;
    const [type, , value] = args;
    const id = args[10];
    if (![type, value, id].every(Number.isInteger)) return undefined;
    return { type, id, value };
}
