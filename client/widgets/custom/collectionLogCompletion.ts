import type { WidgetManager, WidgetNode } from "../WidgetManager";

export const COLLECTION_LOG_COMPLETE_COLOR = 0x00ff00;

const COLOR_TAG = /<col=[0-9a-f]{1,8}>/gi;

function recolorMarkup(text: string): string {
    const recolored = text.replace(COLOR_TAG, "<col=00ff00>");
    return recolored === text && !/<col=00ff00>/i.test(text)
        ? `<col=00ff00>${text}</col>`
        : recolored;
}

function orderedDynamicChildren(
    widgetManager: WidgetManager,
    parent: WidgetNode,
): WidgetNode[] {
    return widgetManager
        .getDynamicChildrenByParent(parent)
        .slice()
        .sort(
            (left, right) =>
                ((left.childIndex ?? 0) | 0) - ((right.childIndex ?? 0) | 0),
        );
}

function collectTree(
    widgetManager: WidgetManager,
    root: WidgetNode,
): WidgetNode[] {
    const result: WidgetNode[] = [];
    const seen = new Set<WidgetNode>();
    const stack: WidgetNode[] = [root];
    while (stack.length > 0) {
        const widget = stack.pop();
        if (!widget || seen.has(widget)) continue;
        seen.add(widget);
        result.push(widget);

        const children = [
            ...widgetManager.getStaticChildrenByParentUid(widget.uid),
            ...orderedDynamicChildren(widgetManager, widget),
        ];
        for (let index = children.length - 1; index >= 0; index--) {
            stack.push(children[index]);
        }
    }
    return result;
}

function colorWidget(widgetManager: WidgetManager, widget: WidgetNode): boolean {
    const isTextWidget =
        widget.type === 4 ||
        widget.type === 8 ||
        (typeof widget.text === "string" && widget.text.length > 0) ||
        (typeof widget.text2 === "string" && widget.text2.length > 0);
    if (!isTextWidget) return false;

    let changed = false;
    for (const field of [
        "textColor",
        "color2",
        "mouseOverColor",
        "mouseOverColor2",
    ] as const) {
        if (widget[field] !== COLLECTION_LOG_COMPLETE_COLOR) {
            widget[field] = COLLECTION_LOG_COMPLETE_COLOR;
            changed = true;
        }
    }
    for (const field of ["text", "text2"] as const) {
        const text = widget[field];
        if (typeof text !== "string" || text.length === 0) continue;
        const recolored = recolorMarkup(text);
        if (recolored !== text) {
            widget[field] = recolored;
            changed = true;
        }
    }
    if (changed) {
        widgetManager.invalidateWidgetRender(
            widget,
            "collection-log-category-complete",
        );
    }
    return changed;
}

/**
 * Cache script 2731 builds a category from multiple sibling containers: one
 * can own visible text while another owns its hover/click row. Search every
 * corresponding row for text so normal, selected, and hover rendering all
 * stay green without recoloring row backgrounds.
 */
export function applyCollectionLogCompletionColors(
    widgetManager: WidgetManager,
    containerUids: readonly number[],
    completion: readonly boolean[],
): number {
    const changedWidgets = new Set<WidgetNode>();

    for (const uid of containerUids) {
        if (!Number.isFinite(uid) || uid <= 0) continue;
        const container = widgetManager.getWidgetByUid(uid);
        if (!container) continue;
        const rows = orderedDynamicChildren(widgetManager, container);

        for (let categoryIndex = 0; categoryIndex < completion.length; categoryIndex++) {
            if (!completion[categoryIndex]) continue;
            // Dynamic category rows are keyed by childIndex. Match those even
            // when a cache revision also creates decorative/support children
            // in the same container. Positional fallback is safe only for the
            // historical one-row-per-category shape.
            const indexedRow = rows.find(
                (candidate) => ((candidate.childIndex ?? -1) | 0) === categoryIndex,
            );
            const row = indexedRow ??
                (rows.length === completion.length ? rows[categoryIndex] : undefined);
            if (!row) continue;
            for (const widget of collectTree(widgetManager, row)) {
                if (colorWidget(widgetManager, widget)) changedWidgets.add(widget);
            }
        }

        // Some cache revisions create a flat text list whose child indices do
        // not match the parallel click rows. Preserve its visual order and map
        // the category completion array onto text nodes directly.
        const textWidgets = collectTree(widgetManager, container)
            .filter(
                (widget) =>
                    widget !== container &&
                    (widget.type === 4 || widget.type === 8) &&
                    typeof widget.text === "string" &&
                    widget.text.length > 0,
            );
        if (textWidgets.length === completion.length) {
            for (let categoryIndex = 0; categoryIndex < completion.length; categoryIndex++) {
                if (!completion[categoryIndex]) continue;
                const textWidget = textWidgets[categoryIndex];
                if (textWidget && colorWidget(widgetManager, textWidget)) {
                    changedWidgets.add(textWidget);
                }
            }
        }
    }

    return changedWidgets.size;
}
