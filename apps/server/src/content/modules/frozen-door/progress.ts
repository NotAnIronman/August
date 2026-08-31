import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

/** Reserved server-authored progress varps for GWD traversal and Frozen Door access. */
export const VARP_FROZEN_DOOR_COMPLETE = 19997;
export const VARP_SARADOMIN_FIRST_ROPE = 19998;
export const VARP_SARADOMIN_SECOND_ROPE = 19999;

export function isFrozenDoorComplete(player: PlayerState): boolean {
    return player.varps.getVarpValue(VARP_FROZEN_DOOR_COMPLETE) >= 1;
}

export function setAccountProgress(player: PlayerState, services: ScriptServices, varpId: number): void {
    player.varps.setVarpValue(varpId, 1);
    services.variables.sendVarp(player, varpId, 1);
}
