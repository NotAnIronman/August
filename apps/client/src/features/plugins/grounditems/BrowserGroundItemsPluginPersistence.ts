import type { GroundItemsPluginConfig, GroundItemsPluginPersistence } from "@client/features/plugins/grounditems/types";
import { createBrowserJsonPersistence } from "@client/core/storage/localStorage";

export function createBrowserGroundItemsPluginPersistence(
    storageKey: string,
): GroundItemsPluginPersistence | undefined {
    return createBrowserJsonPersistence<Partial<GroundItemsPluginConfig>, GroundItemsPluginConfig>(
        storageKey,
    );
}
