import type { PlayerState } from "@server/game/player";

/** Retains a fixture's precise fields while making its PlayerState role explicit. */
export function createTestPlayerState<T extends object>(state: T): T & PlayerState {
    return state as T & PlayerState;
}
