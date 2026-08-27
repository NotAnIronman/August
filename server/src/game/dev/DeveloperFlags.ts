import type { PlayerState } from "../player";

export const DEVELOPER_GODMODE_STATE_KEY = "developer.godmode";

export function isDeveloperGodmodeEnabled(player: Pick<PlayerState, "gamemodeState">): boolean {
    return player.gamemodeState.get(DEVELOPER_GODMODE_STATE_KEY) === true;
}

export function setDeveloperGodmodeEnabled(
    player: Pick<PlayerState, "gamemodeState">,
    enabled: boolean,
): void {
    if (enabled) {
        player.gamemodeState.set(DEVELOPER_GODMODE_STATE_KEY, true);
    } else {
        player.gamemodeState.delete(DEVELOPER_GODMODE_STATE_KEY);
    }
}
