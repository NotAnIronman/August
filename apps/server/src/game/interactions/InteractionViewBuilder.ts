import { RectAdjacentRouteStrategy } from "@server/pathfinding/engine/RouteStrategy";
import { EntityType } from "@server/game/collision/EntityCollisionService";
import { NO_INTERACTION, encodeInteractionIndex } from "@server/game/interactionIndex";
import { NpcState } from "@server/game/npc";
import { PlayerState } from "@server/game/player";
import { FollowInteractionKind, PlayerInteractionState } from "@server/game/interactions/types";

export function deriveInteractionIndex(params: {
    player: PlayerState;
    interaction?: PlayerInteractionState;
    playerLookup: (id: number) => PlayerState | undefined;
    npcLookup: (id: number) => NpcState | undefined;
}): number {
    const { player, interaction, playerLookup, npcLookup } = params;
    if (!interaction) return player.getInteractionIndex();

    switch (interaction.kind) {
        case FollowInteractionKind.Follow:
        case FollowInteractionKind.Trade: {
            const target = playerLookup(interaction.targetId);
            if (!target) return NO_INTERACTION;
            return encodeInteractionIndex(EntityType.Player, target.id);
        }
        case "npcInteract": {
            const npc = npcLookup(interaction.npcId);
            if (!npc) return NO_INTERACTION;
            if (npc.level !== player.level) return NO_INTERACTION;
            return encodeInteractionIndex(EntityType.Npc, npc.id);
        }
        case "npcCombat": {
            const npc = npcLookup(interaction.npcId);
            if (!npc) return NO_INTERACTION;
            if (npc.level !== player.level) return NO_INTERACTION;
            // OSRS target-facing is tied to the active combat target, not to whether
            // auto-repeat is currently enabled. Manual kiting keeps `interactingIndex`
            // until the combat interaction is actually torn down.
            return encodeInteractionIndex(EntityType.Npc, npc.id);
        }
        case "playerCombat": {
            const target = playerLookup(interaction.playerId);
            if (!target) return NO_INTERACTION;
            return encodeInteractionIndex(EntityType.Player, target.id);
        }
        default:
            return NO_INTERACTION;
    }
}
