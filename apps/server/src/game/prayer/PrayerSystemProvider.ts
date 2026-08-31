import type { PlayerState } from "@server/game/player";

export interface PrayerTickResult {
    prayerDepleted?: boolean;
}

export interface PrayerSystemProvider {
    processPlayer(player: PlayerState): PrayerTickResult | undefined;
}
