import { readLocalStorageJson, writeLocalStorageJson } from "@client/core/storage/localStorage";
import type { MenuEntrySwapperConfig, MenuEntrySwapperPersistence } from "./MenuEntrySwapperPlugin";

export function createBrowserMenuEntrySwapperPersistence(): MenuEntrySwapperPersistence {
    const key = "osrs.plugin.menu_entry_swapper.v1";
    return {
        load: () => readLocalStorageJson<MenuEntrySwapperConfig>(key) ?? undefined,
        save: config => { writeLocalStorageJson(key, config); },
    };
}
