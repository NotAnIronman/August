import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";

/**
 * Complete, inert gamemode contract for tests that exercise core systems.
 * Individual tests can override only the behavior they intentionally cover.
 */
export function createTestGamemode(
    id: string,
    name: string,
    overrides: Partial<GamemodeDefinition> = {},
): GamemodeDefinition {
    return {
        id,
        name,
        getSkillXpMultiplier: () => 1,
        getDropRateMultiplier: () => 1,
        transformDropItemId: (_npcTypeId, itemId) => itemId,
        canInteract: () => true,
        initializePlayer: () => undefined,
        serializePlayerState: () => undefined,
        deserializePlayerState: () => undefined,
        onNpcKill: () => undefined,
        isTutorialActive: () => false,
        getSpawnLocation: () => ({ x: 3200, y: 3200, level: 0 }),
        onPlayerHandshake: () => undefined,
        onPlayerLogin: () => undefined,
        getPlayerTypes: () => [],
        registerHandlers: () => undefined,
        shouldLoadDefaultNpcSpawns: () => false,
        initialize: () => undefined,
        ...overrides,
    };
}
