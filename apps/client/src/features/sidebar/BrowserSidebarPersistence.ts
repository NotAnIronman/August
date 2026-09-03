import type { SidebarPersistedState, SidebarPersistence } from "@client/features/sidebar/types";
import { createBrowserJsonPersistence } from "@client/core/storage/localStorage";

export function createBrowserSidebarPersistence(
    storageKey: string,
): SidebarPersistence | undefined {
    const storage = createBrowserJsonPersistence<Partial<SidebarPersistedState>, SidebarPersistedState>(
        storageKey,
    );
    if (!storage) return undefined;
    return {
        load: (): SidebarPersistedState | undefined => {
            const parsed = storage.load();
            if (!parsed) return undefined;
            try {
                return {
                    open: parsed.open === true,
                    selectedId: typeof parsed.selectedId === "string" ? parsed.selectedId : null,
                };
            } catch {
                return undefined;
            }
        },
        save: (state: SidebarPersistedState): void => storage.save(state),
    };
}
