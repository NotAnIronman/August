import type { NotesPluginConfig, NotesPluginPersistence } from "@client/features/plugins/notes/types";
import {
    canUseLocalStorage,
    readLocalStorageItem,
    readLocalStorageJson,
    writeLocalStorageJson,
} from "@client/core/storage/localStorage";

export function createBrowserNotesPluginPersistence(
    storageKey: string,
    legacyNotesKey?: string,
): NotesPluginPersistence | undefined {
    if (!canUseLocalStorage()) return undefined;

    return {
        load: (): Partial<NotesPluginConfig> | undefined => {
            const stored = readLocalStorageJson<Partial<NotesPluginConfig>>(storageKey);
            if (stored) return stored;

            if (typeof legacyNotesKey === "string" && legacyNotesKey.length > 0) {
                const legacyNotes = readLocalStorageItem(legacyNotesKey);
                if (typeof legacyNotes === "string") {
                    return { notes: legacyNotes };
                }
            }
            return undefined;
        },
        save: (config: NotesPluginConfig): void => {
            writeLocalStorageJson(storageKey, config);
        },
    };
}
