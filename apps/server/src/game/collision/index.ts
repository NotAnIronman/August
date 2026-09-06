/**
 * Collision System Exports
 *
 * OSRS-accurate collision handling including:
 * - Dynamic entity occupation tracking
 * - NPCs that ignore collision
 * - NPCs that block line of sight
 */

export {
    EntityCollisionService,
    entityCollisionService,
    EntityType,
    COLLISION_IGNORING_NPCS,
    LINE_OF_SIGHT_BLOCKING_NPCS,
    TALK_THROUGH_OBSTACLE_NPCS,
    shouldIgnoreEntityCollision,
    shouldBlockLineOfSight,
    canTalkThroughObstacles,
} from "@server/game/collision/EntityCollisionService";
