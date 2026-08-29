import type { CollectionLogServerPayload, InventoryServerUpdate } from "@client/core/network/server-connection/types/index";
import { state } from "@client/core/network/server-connection/state";

export function cloneCollectionLogCategoryCompletion(
    completionByTab: Record<number, boolean[]>,
): Record<number, boolean[]> {
    const clone: Record<number, boolean[]> = {};
    for (const [tabIndex, completion] of Object.entries(completionByTab)) {
        const parsedTabIndex = Number(tabIndex);
        if (!Number.isInteger(parsedTabIndex) || parsedTabIndex < 0) continue;
        if (!Array.isArray(completion)) continue;
        clone[parsedTabIndex] = completion.map((isComplete) => isComplete === true);
    }
    return clone;
}

export function emitInventory(update: InventoryServerUpdate): void {
    if (update.kind === "snapshot") {
        state.lastInventorySnapshot = update.slots.map((slot) => ({ ...slot }));
    } else if (update.kind === "slot") {
        if (!state.lastInventorySnapshot) state.lastInventorySnapshot = [];
        const idx = state.lastInventorySnapshot.findIndex(
            (s) => (s.slot | 0) === (update.slot.slot | 0),
        );
        if (idx >= 0) state.lastInventorySnapshot[idx] = { ...update.slot };
        else state.lastInventorySnapshot.push({ ...update.slot });
    }

    for (const listener of state.inventoryListeners) {
        try {
            if (update.kind === "snapshot") {
                listener({ kind: "snapshot", slots: update.slots.map((slot) => ({ ...slot })) });
            } else if (update.kind === "slot") {
                listener({ kind: "slot", slot: { ...update.slot } });
            }
        } catch (err) {
            console.warn("inventory listener error", err);
        }
    }
}

export function emitCollectionLog(update: CollectionLogServerPayload): void {
    if (update.kind === "snapshot") {
        state.lastCollectionLogSnapshot = update.slots.map((slot) => ({ ...slot }));
    } else if (update.kind === "category_completion") {
        state.lastCollectionLogCategoryCompletion =
            cloneCollectionLogCategoryCompletion(update.completionByTab);
    }

    for (const listener of state.collectionLogListeners) {
        try {
            if (update.kind === "snapshot") {
                listener({ kind: "snapshot", slots: update.slots.map((slot) => ({ ...slot })) });
            } else if (update.kind === "category_completion") {
                listener({
                    kind: "category_completion",
                    completionByTab: cloneCollectionLogCategoryCompletion(
                        update.completionByTab,
                    ),
                });
            }
        } catch (err) {
            console.warn("collection log listener error", err);
        }
    }
}
