import type { PlayerState } from "@server/game/player";

/** Basic supplies from the authored leagues defaults, without its quest-specific dramen staff. */
export const STARTER_LOADOUT = [
    [1351, 1], [1265, 1], [1205, 1], [1277, 1], [1171, 1], // bronze equipment
    [841, 1], [882, 25], [556, 25], [558, 15], // ranged and magic
    [590, 1], [303, 1], [315, 1], // firemaking, fishing, food
    [1925, 1], [1931, 1], [2309, 1], [555, 6], [557, 4], [559, 2],
] as const;

export function grantStarterLoadout(player: PlayerState): void {
    if (player.account.starterLoadoutGranted) return;
    // Called only during first character design, before normal gameplay.
    // Full insertion prevents silently truncating any supply stack.
    const before = player.items.getInventoryEntries().map(entry => ({ ...entry }));
    try {
        for (const [id, quantity] of STARTER_LOADOUT) {
            // Leagues may already have received these through player-defaults.json.
            // Complete the baseline, without duplicating preloaded supplies.
            const existing = player.items.getInventoryEntries().reduce((total, entry) => total + (entry.itemId === id ? entry.quantity : 0), 0);
            const missing = Math.max(0, quantity - existing);
            if (missing > 0 && player.items.addItem(id, missing, { assureFullInsertion: true }).completed !== missing) {
                throw new Error("Unable to insert complete starter loadout");
            }
        }
    } catch (error) {
        before.forEach((entry, slot) => player.items.setInventorySlot(slot, entry.itemId, entry.quantity));
        throw error;
    }
    player.account.starterLoadoutGranted = true;
}
