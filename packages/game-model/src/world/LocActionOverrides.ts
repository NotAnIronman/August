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
        // Blue Moon brazier morph controllers (moons-of-peril). The client
        // fakes a "Light" menu entry for these two tiles purely from the
        // storm varbit (see apps/client .../render/interact/check.ts), but
        // that never touches this table. Without an explicit override here,
        // the server independently resolves the clicked action from these
        // IDs' own cache-defined actions instead - which is either empty or
        // an unrelated action from a coincidentally-numbered real object -
        // so the click silently fails to match any registered handler.
        // This override forces the server to agree with what the client
        // shows, exactly like the "Start solo" statues above.
        52992: Object.freeze(["Light"]),
        52993: Object.freeze(["Light"]),
    });

export function resolveLocActions(
    locId: number,
    cacheActions?: readonly (string | null | undefined)[],
): readonly (string | null | undefined)[] {
    return LOC_ACTION_OVERRIDES[Math.trunc(locId)] ?? cacheActions ?? [];
}
