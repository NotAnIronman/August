export const LOC_ACTION_OVERRIDES: Readonly<Record<number, readonly (string | null)[]>> =
    Object.freeze({
        26503: Object.freeze([
            "Open",
            "Peek",
            "Enter Solo",
            "Enter Party",
            "Join Party",
        ]),
        26504: Object.freeze([
            "Open",
            "Peek",
            "Enter Solo",
            "Enter Party",
            "Join Party",
        ]),
        26505: Object.freeze([
            "Open",
            "Peek",
            "Enter Solo",
            "Enter Party",
            "Join Party",
        ]),
        26502: Object.freeze([
            "Open",
            "Peek",
            "Enter Solo",
            "Enter Party",
            "Join Party",
        ]),
        // Scurrius' native bars use normal/private/peek wording.  The lair
        // follows the same explicit party-instance contract as the GWD doors.
        14203: Object.freeze([
            "Open",
            "Peek",
            "Enter Solo",
            "Enter Party",
            "Join Party",
        ]),
        // Moons statues begin only a solo encounter. This must mirror the
        // server registration exactly: menu labels are action identifiers.
        51372: Object.freeze(["Start solo"]),
        51373: Object.freeze(["Start solo"]),
        51374: Object.freeze(["Start solo"]),
    });

export function resolveLocActions(
    locId: number,
    cacheActions?: readonly (string | null | undefined)[],
): readonly (string | null | undefined)[] {
    return LOC_ACTION_OVERRIDES[Math.trunc(locId)] ?? cacheActions ?? [];
}
