export interface SelectedSpellPayloadFields {
    selectedSpellWidgetId?: number;
    spellbookGroupId?: number;
    widgetChildId?: number;
    selectedSpellChildIndex?: number;
    selectedSpellItemId?: number;
}

export interface NormalizedSelectedSpellPayload extends SelectedSpellPayloadFields {
    selectedSpellWidgetId: number;
    spellbookGroupId: number;
    widgetChildId: number;
    selectedSpellChildIndex: number;
    selectedSpellItemId: number;
}

function normalizeNonNegativeInt(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0x7fffffff
        ? value
        : undefined;
}

export function buildSelectedSpellPayload(
    selectedSpellWidgetIdRaw: number,
    selectedSpellChildIndexRaw?: number,
    selectedSpellItemIdRaw?: number,
): NormalizedSelectedSpellPayload | undefined {
    const selectedSpellWidgetId = normalizeNonNegativeInt(selectedSpellWidgetIdRaw);
    if (selectedSpellWidgetId === undefined || selectedSpellWidgetId === 0) {
        return undefined;
    }

    const fallbackChildIndex = selectedSpellWidgetId & 0xffff;
    const selectedSpellChildIndex =
        normalizeNonNegativeInt(selectedSpellChildIndexRaw) ?? fallbackChildIndex;
    const selectedSpellItemId =
        normalizeNonNegativeInt(selectedSpellItemIdRaw) ?? -1;

    return {
        selectedSpellWidgetId,
        spellbookGroupId: (selectedSpellWidgetId >>> 16) & 0xffff,
        widgetChildId: selectedSpellChildIndex,
        selectedSpellChildIndex,
        selectedSpellItemId,
    };
}

export function resolveSelectedSpellPayload(
    payload: SelectedSpellPayloadFields,
): SelectedSpellPayloadFields {
    const normalizedWidgetId = normalizeNonNegativeInt(payload.selectedSpellWidgetId);
    const selectedSpellWidgetId =
        normalizedWidgetId !== undefined && normalizedWidgetId > 0 ? normalizedWidgetId : undefined;
    const fallbackChildIndex =
        selectedSpellWidgetId !== undefined ? selectedSpellWidgetId & 0xffff : undefined;
    const selectedSpellChildIndex =
        normalizeNonNegativeInt(payload.selectedSpellChildIndex) ?? fallbackChildIndex;
    const widgetChildId =
        selectedSpellChildIndex ?? normalizeNonNegativeInt(payload.widgetChildId);
    const spellbookGroupId =
        selectedSpellWidgetId !== undefined
            ? (selectedSpellWidgetId >>> 16) & 0xffff
            : normalizeNonNegativeInt(payload.spellbookGroupId);
    const selectedSpellItemId = normalizeNonNegativeInt(payload.selectedSpellItemId);

    return {
        selectedSpellWidgetId,
        spellbookGroupId,
        widgetChildId,
        selectedSpellChildIndex,
        selectedSpellItemId,
    };
}
