import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { activeWorld, config } from "@server/config";
import { damageTracker } from "@server/game/combat/DamageTracker";
import { createGamemode } from "@server/game/gamemodes/GamemodeRegistry";
import { NpcManager } from "@server/game/npcManager";
import { initSpellWidgetMapping } from "@server/game/spells/SpellDataProvider";
import { GameTicker } from "@server/game/ticker";
import { WSServer } from "@server/network/wsServer";
import { serverGeneratedDataPath, serverVarPath } from "@server/paths";
import { PathService } from "@server/pathfinding/PathService";
import { logger } from "@server/observability/logger";
import { setViewportEnumService } from "@server/widgets/viewport";
import { ViewportEnumService } from "@server/widgets/viewport/ViewportEnumService";
import { initCacheEnv } from "@server/world/CacheEnv";
import { MapCollisionService } from "@server/world/MapCollisionService";

async function main() {
    logger.info(
        `Boot: starting server with tickMs=${config.tickMs}, host=${config.host}, port=${config.port}`,
    );
    const ticker = new GameTicker(config.tickMs);

    // Initialize cache + collision + path services
    logger.info("Boot: initializing cache environment (var/cache/osrs)...");
    const cacheEnv = initCacheEnv(serverVarPath("cache", "osrs"));
    logger.info(`Boot: cache ready (rev=${cacheEnv.info.revision}, name=${cacheEnv.info.name})`);

    // Build full scenes like the editor (models included) so server has parity
    logger.info("Boot: creating map collision service (precomputed=true)...");
    const mapService = new MapCollisionService(cacheEnv, false, {
        precomputedRoot: serverVarPath("cache", "collision"),
        usePrecomputed: true,
    });
    logger.info("Boot: map collision service ready");
    const pathService = new PathService(mapService);
    logger.info("Boot: path service ready");

    const cacheFactory = getCacheLoaderFactory(cacheEnv.info, cacheEnv.cacheSystem);
    const npcTypeLoader = cacheFactory.getNpcTypeLoader();
    const basTypeLoader = cacheFactory.getBasTypeLoader();

    // A world is a complete game-server process. Gamemode providers are process-global,
    // so running different gamemodes in one WSServer would mix their rules and state.
    // Start this entry point once per configured world (see the root `pnpm server` script).
    const gamemode = createGamemode(activeWorld.gamemode);
    logger.info(
        `Boot: World ${activeWorld.id} "${activeWorld.name}" using gamemode "${gamemode.name}" on port ${config.port}`,
    );

    // Initialize viewport enum service for display mode component mapping
    const enumTypeLoader = cacheFactory.getEnumTypeLoader();
    if (enumTypeLoader) {
        const viewportEnumService = new ViewportEnumService(enumTypeLoader);
        setViewportEnumService(viewportEnumService);
        logger.info("Boot: viewport enum service ready (enum 1745 loaded)");
    } else {
        logger.warn("Boot: viewport enum service unavailable, using hardcoded fallbacks");
    }

    const npcManager = new NpcManager(mapService, pathService, npcTypeLoader, basTypeLoader);

    if (gamemode.shouldLoadDefaultNpcSpawns()) {
        npcManager.loadFromFile(serverGeneratedDataPath("npc-spawns.json"));
        logger.info("Boot: NPC manager ready (default spawns loaded)");
    } else {
        logger.info(
            `Boot: NPC manager ready (default spawns disabled by ${gamemode.id})`,
        );
    }

    logger.info("Boot: constructing WebSocket server...");
    const server = new WSServer({
        host: config.host,
        port: config.port,
        tickMs: config.tickMs,
        ticker,
        pathService,
        mapService,
        npcManager,
        cacheEnv,
        serverName: config.serverName,
        maxPlayers: config.maxPlayers,
        gamemode,
    });
    logger.info("Boot: WebSocket server constructed");

    // Initialize spell-widget mappings from cache (must happen after gamemode registers SpellDataProvider)
    logger.info("Boot: initializing spell-widget mappings from cache...");
    initSpellWidgetMapping(cacheEnv.info, cacheEnv.cacheSystem);
    logger.info("Boot: spell-widget mappings initialized");

    // Start the game tick
    ticker.start();
    logger.info("Boot: game ticker started");

    // Graceful shutdown
    let shuttingDown = false;
    const shutdown = (signal: string) => async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`Received ${signal}, shutting down...`);
        ticker.stop();
        try {
            server.evacuateInstancedPlayers();
        } catch (err) {
            logger.warn("Failed to evacuate instanced players before shutdown", err);
        }
        try {
            await server.flushPlayerSaves();
        } catch (err) {
            logger.warn("Final player save failed", err);
        }
        gamemode.dispose?.();
        process.exit(0);
    };
    process.on("SIGINT", shutdown("SIGINT"));
    process.on("SIGTERM", shutdown("SIGTERM"));
}

main().catch((err) => {
    logger.error(err);
    process.exit(1);
});
