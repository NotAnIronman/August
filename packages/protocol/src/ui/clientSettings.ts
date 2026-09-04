/** Small allowlist of settings that require a server-side interface change. */
export enum ClientSettingId {
    DisplayMode = 0,
    XpDrops = 1,
}

export function isValidClientSetting(setting: number, value: number): boolean {
    return Number.isInteger(value) && value >= 0 &&
        ((setting === ClientSettingId.DisplayMode && value <= 2) ||
            (setting === ClientSettingId.XpDrops && value <= 1));
}
