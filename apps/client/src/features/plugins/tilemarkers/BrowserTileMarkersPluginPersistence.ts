import type { TileMarkersPluginConfig, TileMarkersPluginPersistence } from "@client/features/plugins/tilemarkers/types";
import { createBrowserJsonPersistence } from "@client/core/storage/localStorage";

export function createBrowserTileMarkersPluginPersistence(
    storageKey: string,
): TileMarkersPluginPersistence | undefined {
    return createBrowserJsonPersistence<Partial<TileMarkersPluginConfig>, TileMarkersPluginConfig>(
        storageKey,
    );
}
