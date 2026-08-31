import { StatusHitsplat } from "@server/game/combat/HitEffects";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";

export class StatusEffectSystem {
    processPlayer(
        player: PlayerState,
        tick: number,
        hasHitpointsCapeRegen: boolean = false,
    ): StatusHitsplat[] | undefined {
        return player.skillSystem.tickHitpoints(tick, hasHitpointsCapeRegen);
    }

    processNpc(npc: NpcState, tick: number): StatusHitsplat[] | undefined {
        return npc.tickStatusEffects(tick);
    }
}
