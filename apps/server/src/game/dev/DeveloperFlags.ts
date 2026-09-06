import type { PlayerState } from "@server/game/player";

export const DEVELOPER_GODMODE_STATE_KEY = "developer.godmode";
export const DEVELOPER_INSTAKILL_STATE_KEY = "developer.instakill";
export const DEVELOPER_MAXHIT_STATE_KEY = "developer.maxhit";

export function isDeveloperMaxHitEnabled(player: Pick<PlayerState, "gamemodeState">): boolean {
    return player.gamemodeState.get(DEVELOPER_MAXHIT_STATE_KEY) === true;
}

export function setDeveloperMaxHitEnabled(player: Pick<PlayerState, "gamemodeState">, enabled: boolean): void {
    if (enabled) {
        player.gamemodeState.set(DEVELOPER_MAXHIT_STATE_KEY, true);
        setDeveloperInstakillEnabled(player, false);
    } else player.gamemodeState.delete(DEVELOPER_MAXHIT_STATE_KEY);
}

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

export function isDeveloperInstakillEnabled(player: Pick<PlayerState, "gamemodeState">): boolean {
    return player.gamemodeState.get(DEVELOPER_INSTAKILL_STATE_KEY) === true;
}

export function setDeveloperInstakillEnabled(
    player: Pick<PlayerState, "gamemodeState">,
    enabled: boolean,
): void {
    if (enabled) {
        player.gamemodeState.set(DEVELOPER_INSTAKILL_STATE_KEY, true);
    } else {
        player.gamemodeState.delete(DEVELOPER_INSTAKILL_STATE_KEY);
    }
}

/** Keeps misses as misses while making every successful developer hit decisive. */
export function applyDeveloperInstakillDamage(player: PlayerState, damage: number): number {
    return isDeveloperInstakillEnabled(player) && damage > 0 ? 9_999 : damage;
}
