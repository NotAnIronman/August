import type { InteractHighlightPluginConfig, InteractHighlightPluginPersistence } from "@client/features/plugins/interacthighlight/types";
import { createBrowserJsonPersistence } from "@client/core/storage/localStorage";

export function createBrowserInteractHighlightPluginPersistence(
    storageKey: string,
): InteractHighlightPluginPersistence | undefined {
    return createBrowserJsonPersistence<
        Partial<InteractHighlightPluginConfig>,
        InteractHighlightPluginConfig
    >(storageKey);
}
