import { logger } from "@server/observability/logger";
import { NpcManager } from "@server/game/npcManager";
import { PlayerManager } from "@server/game/player";

export class MovementSystem {
    constructor(
        private readonly players: PlayerManager,
        private readonly npcManager?: NpcManager,
    ) {}

    runPreMovement(tick: number): void {
        // Update follow positions BEFORE processing following logic
        // This stores where each player is NOW, so followers can path to their last position
        try {
            this.players.forEach((ws, player) => {
                player.followX = player.tileX;
                player.followZ = player.tileY;
            });
            this.players.forEachBot((bot) => {
                bot.followX = bot.tileX;
                bot.followZ = bot.tileY;
            });
            // NPCs need the same pre-movement snapshot as players so combat's
            // approach-tile calculation (walkToAttackRange) can path toward an
            // NPC target's followX/followZ instead of its live tileX/tileY.
            // Without this, two melee combatants closing distance on each other
            // both compute their "nearest cardinal attack tile" from the other's
            // still-updating current position every tick; on a diagonal approach
            // this produces a symmetric tie that flips which side each one picks,
            // so they perpetually step toward and away from each other without
            // ever landing adjacent (the "melee dance").
            this.npcManager?.forEach((npc) => {
                npc.followX = npc.tileX;
                npc.followZ = npc.tileY;
            });
        } catch (err) {
            logger.warn("[movement-system] failed to update follow positions", err);
        }

        try {
            this.players.updateFollowing(tick);
        } catch (err) {
            logger.warn("[movement-system] failed to update following", err);
        }
        try {
            this.players.updateNpcInteractions(tick, (npcId) => this.npcManager?.getById(npcId));
        } catch (err) {
            logger.warn("[movement-system] failed to update npc interactions (pre)", err);
        }
        try {
            this.players.updateLocInteractions(tick);
        } catch (err) {
            logger.warn("[movement-system] failed to update loc interactions", err);
        }
        try {
            this.players.updateGroundItemInteractions(tick);
        } catch (err) {
            logger.warn("[movement-system] failed to update ground item interactions (pre)", err);
        }
    }

    runPostMovement(tick: number): void {
        try {
            this.players.updateGroundItemInteractions(tick);
        } catch (err) {
            logger.warn("[movement-system] failed to update ground item interactions (post)", err);
        }
        try {
            this.players.updateNpcInteractions(tick, (npcId) => this.npcManager?.getById(npcId));
        } catch (err) {
            logger.warn("[movement-system] failed to update npc interactions (post)", err);
        }
    }
}
