export const GAMEMODE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const GAMEMODE_ID_REQUIREMENT =
    "1-64 lowercase letters, numbers, underscores, or hyphens, beginning with a letter or number";

/** Gamemode IDs are portable directory names, never arbitrary paths. */
export function isValidGamemodeId(value: string): boolean {
    return GAMEMODE_ID_PATTERN.test(value);
}
