import { readLocalStorageBool, writeLocalStorageBool } from "@client/core/storage/localStorage";

const DEBUG_IDS_KEY = "august.development.debugIds";

export function loadDebugIds(): boolean {
    return readLocalStorageBool(DEBUG_IDS_KEY, false);
}

export function saveDebugIds(enabled: boolean): void {
    writeLocalStorageBool(DEBUG_IDS_KEY, enabled);
}
