
import { LocModelType } from "@august/osrs-engine/config/loctype/LocModelType";
import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { SdMapData } from "@client/engine/rendering/loader/SdMapData";
import { HD_SKY_COLOR_VEC4,LOADING_CLEAR_COLOR_VEC4,StreamMapBatch } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import {
    getWorldLocChanges,
    getWorldLocSpawns,
    getWorldTerrainOverrides,
} from "@client/features/content/GamemodeContentStore";

export function getPendingStreamMapCount(host: WebGLOsrsRendererHost, ): number {

        let count = 0;
        for (const batch of host.pendingStreamMapsByGeneration.values()) {
            count += batch.size;
        }
        return count | 0;
    
}

export function hasPendingMapStreamingWork(host: WebGLOsrsRendererHost, ): boolean {

        if (host.mapsToLoad.length > 0) return true;
        if (host.mapManager.loadingMapIds.size > 0) return true;
        return host.getPendingStreamMapCount() > 0;
    
}

export function syncStreamGenerationFromMapManager(host: WebGLOsrsRendererHost, ): void {

        const revision = host.mapManager.getGridRevision() | 0;
        if (revision === host.observedGridRevision) return;
        const nextExpected = new Set(host.mapManager.getGridMapIdsSnapshot());
        let carryForward: StreamMapBatch | undefined;
        for (const [generation, batch] of host.pendingStreamMapsByGeneration.entries()) {
            if ((generation | 0) >= revision) continue;
            for (const [mapId, mapData] of batch.entries()) {
                if (nextExpected.has(mapId)) {
                    if (!carryForward) carryForward = new Map<number, SdMapData>();
                    carryForward.set(mapId, mapData);
                } else {
                    host.mapManager.loadingMapIds.delete(mapId);
                }
            }
            host.pendingStreamMapsByGeneration.delete(generation);
        }
        host.observedGridRevision = revision;

        // Detect cross-region teleport: if none of the new maps are loaded,
        // skip the fog fade-in so they appear instantly.
        let hasOverlap = false;
        for (const mapId of nextExpected) {
            if (host.mapManager.mapSquares.has(mapId)) {
                hasOverlap = true;
                break;
            }
        }
        if (!hasOverlap && nextExpected.size > 0) {
            host.skipMapFadeIn = true;
            // Mask the raw bright clear color while nothing from the
            // destination region has streamed in yet - see
            // LOADING_CLEAR_COLOR_VEC4 for why.
            host.skyColor[0] = LOADING_CLEAR_COLOR_VEC4[0];
            host.skyColor[1] = LOADING_CLEAR_COLOR_VEC4[1];
            host.skyColor[2] = LOADING_CLEAR_COLOR_VEC4[2];
        }

        host.activeStreamGeneration = revision;
        host.activeStreamExpectedMapIds = nextExpected;
        if (carryForward && carryForward.size > 0) {
            const active =
                host.pendingStreamMapsByGeneration.get(revision) ?? new Map<number, SdMapData>();
            for (const [mapId, mapData] of carryForward.entries()) {
                active.set(mapId, mapData);
            }
            host.pendingStreamMapsByGeneration.set(revision, active);
        }
    
}

export function queueStreamMapData(host: WebGLOsrsRendererHost, mapData: SdMapData, streamGeneration?: number): void {

        // Reject normal map data while an instance scene is active
        if (host.instanceActive) return;

        const mapId = getMapSquareId(mapData.mapX, mapData.mapY);
        const inTargetGrid = host.mapManager.isMapInTargetGrid(mapData.mapX, mapData.mapY);
        if (!inTargetGrid) {
            host.mapManager.loadingMapIds.delete(mapId);
            return;
        }

        const currentGeneration = host.activeStreamGeneration | 0;
        const queuedGeneration = typeof streamGeneration === "number" ? streamGeneration | 0 : 0;
        const targetGeneration =
            queuedGeneration > currentGeneration
                ? queuedGeneration
                : queuedGeneration > 0 && queuedGeneration < currentGeneration
                    ? currentGeneration
                    : Math.max(currentGeneration, queuedGeneration);

        let batch = host.pendingStreamMapsByGeneration.get(targetGeneration);
        if (!batch) {
            batch = new Map<number, SdMapData>();
            host.pendingStreamMapsByGeneration.set(targetGeneration, batch);
        }
        batch.set(mapId, mapData);
    
}

export function applyReadyStreamGenerationBatch(host: WebGLOsrsRendererHost, time: number): number {

        const generation = host.activeStreamGeneration | 0;
        const expected = host.activeStreamExpectedMapIds;
        const pending = host.pendingStreamMapsByGeneration.get(generation);
        if (!pending || expected.size === 0) return 0;
        if (
            !host.mainProgram ||
            !host.mainAlphaProgram ||
            !host.npcProgram ||
            !host.textureArray ||
            !host.textureMaterials ||
            !host.waterTextures ||
            !host.sceneUniformBuffer
        ) {
            return 0;
        }
        const mainProgram = host.mainProgram;
        const mainAlphaProgram = host.mainAlphaProgram;
        const npcProgram = host.npcProgram;
        const textureArray = host.textureArray;
        const textureMaterials = host.textureMaterials;
        const waterTextures = host.waterTextures;
        const sceneUniformBuffer = host.sceneUniformBuffer;

        // Apply maps as they arrive, but never apply surrounding chunks before
        // the player's own chunk (index 0 in the ordered grid).  This ensures the
        // map square the player is standing on always renders first.
        let applied = 0;
        let allReady = true;
        const orderedMapIds = host.mapManager.getGridMapIdsSnapshot();
        let playerChunkReady = false;
        if (orderedMapIds.length > 0) {
            const firstId = orderedMapIds[0];
            const firstMx = firstId >> 8;
            const firstMy = firstId & 0xff;
            playerChunkReady =
                !!pending.get(firstId) ||
                !!host.mapManager.getMap(firstMx, firstMy) ||
                host.mapManager.invalidMapIds.has(firstId);
        }
        for (const mapId of orderedMapIds) {
            const mapData = pending.get(mapId);
            if (!mapData) {
                const mx = mapId >> 8;
                const my = mapId & 0xff;
                if (!host.mapManager.getMap(mx, my) && !host.mapManager.invalidMapIds.has(mapId)) {
                    allReady = false;
                }
                continue;
            }
            if (!playerChunkReady) {
                allReady = false;
                continue;
            }
            if (!host.isValidMapData(mapData)) continue;
            pending.delete(mapId);
            applied++;
            host.loadMap(
                mainProgram,
                mainAlphaProgram,
                npcProgram,
                textureArray,
                textureMaterials,
                waterTextures,
                sceneUniformBuffer,
                mapData,
                time,
            );
        }
        if (allReady || pending.size === 0) {
            host.pendingStreamMapsByGeneration.delete(generation);
        }
        if (allReady) {
            host.skipMapFadeIn = false;
            // Restore the real sky color now that the destination region has
            // actually streamed in and is about to render for the first time.
            host.skyColor[0] = HD_SKY_COLOR_VEC4[0];
            host.skyColor[1] = HD_SKY_COLOR_VEC4[1];
            host.skyColor[2] = HD_SKY_COLOR_VEC4[2];
        }
        return applied | 0;
    
}

export function getMapIdForWorldTile(host: WebGLOsrsRendererHost, x: number, y: number): number {

        return getMapSquareId(Math.floor((x | 0) / 64), Math.floor((y | 0) / 64));
    
}

export function applyGamemodeWorldLocs(host: WebGLOsrsRendererHost, ): Set<number> {

        const affectedMapIds = new Set<number>();
        const nextOverrideKeys = new Set<string>();
        const nextSpawnKeys = new Set<string>();

        for (const change of getWorldLocChanges()) {
            const x = change.x | 0;
            const y = change.y | 0;
            const level = change.level | 0;
            const oldId = change.oldId | 0;
            const key = `${x},${y},${level},${oldId}`;
            nextOverrideKeys.add(key);
            affectedMapIds.add(host.getMapIdForWorldTile(x, y));

            host.locOverrides.set(key, {
                newId: change.newId | 0,
                newRotation:
                    typeof change.newRotation === "number" ? change.newRotation & 0x3 : undefined,
                moveToX: typeof change.moveToX === "number" ? change.moveToX | 0 : undefined,
                moveToY: typeof change.moveToY === "number" ? change.moveToY | 0 : undefined,
                matchType:
                    typeof change.matchType === "number"
                        ? (change.matchType as LocModelType)
                        : undefined,
                matchRotation:
                    typeof change.matchRotation === "number"
                        ? change.matchRotation & 0x3
                        : undefined,
            });
        }

        for (const spawn of getWorldLocSpawns()) {
            const x = spawn.x | 0;
            const y = spawn.y | 0;
            const level = spawn.level | 0;
            const key = `${x},${y},${level},${spawn.locId | 0},${spawn.shape | 0},${
                spawn.rotation & 0x3
            }`;
            nextSpawnKeys.add(key);
            affectedMapIds.add(host.getMapIdForWorldTile(x, y));

            host.locSpawns.set(key, {
                id: spawn.locId | 0,
                type: spawn.shape | 0,
                rotation: spawn.rotation & 0x3,
            });
        }

        const nextTerrainKeys = new Set<string>();
        for (const terrain of getWorldTerrainOverrides()) {
            const x = terrain.x | 0;
            const y = terrain.y | 0;
            const level = terrain.level | 0;
            const key = `${x},${y},${level}`;
            nextTerrainKeys.add(key);
            affectedMapIds.add(host.getMapIdForWorldTile(x, y));

            host.terrainOverrides.set(key, {
                underlay:
                    typeof terrain.underlay === "number" ? terrain.underlay | 0 : undefined,
                overlay: typeof terrain.overlay === "number" ? terrain.overlay | 0 : undefined,
                shape: typeof terrain.shape === "number" ? terrain.shape | 0 : undefined,
                rotation:
                    typeof terrain.rotation === "number" ? terrain.rotation & 0x3 : undefined,
                renderFlags:
                    typeof terrain.renderFlags === "number"
                        ? terrain.renderFlags & 0xff
                        : undefined,
            });
        }

        for (const key of host.gamemodeWorldLocOverrideKeys) {
            if (nextOverrideKeys.has(key)) continue;
            host.locOverrides.delete(key);
            const [xRaw, yRaw] = key.split(",");
            affectedMapIds.add(host.getMapIdForWorldTile(Number(xRaw) | 0, Number(yRaw) | 0));
        }
        for (const key of host.gamemodeWorldLocSpawnKeys) {
            if (nextSpawnKeys.has(key)) continue;
            host.locSpawns.delete(key);
            const [xRaw, yRaw] = key.split(",");
            affectedMapIds.add(host.getMapIdForWorldTile(Number(xRaw) | 0, Number(yRaw) | 0));
        }
        for (const key of host.gamemodeWorldTerrainOverrideKeys) {
            if (nextTerrainKeys.has(key)) continue;
            host.terrainOverrides.delete(key);
            const [xRaw, yRaw] = key.split(",");
            affectedMapIds.add(host.getMapIdForWorldTile(Number(xRaw) | 0, Number(yRaw) | 0));
        }

        host.gamemodeWorldLocOverrideKeys = nextOverrideKeys;
        host.gamemodeWorldLocSpawnKeys = nextSpawnKeys;
        host.gamemodeWorldTerrainOverrideKeys = nextTerrainKeys;

        return affectedMapIds;
    
}

export function refreshGamemodeWorldLocs(host: WebGLOsrsRendererHost, ): void {

        const affectedMapIds = host.applyGamemodeWorldLocs();
        if (affectedMapIds.size === 0 || !host.osrsClient.loadedCache || host.instanceActive) {
            return;
        }

        for (const mapId of affectedMapIds) {
            if (!host.mapManager.mapSquares.has(mapId) && !host.mapManager.loadingMapIds.has(mapId)) {
                continue;
            }
            const mapX = mapId >> 8;
            const mapY = mapId & 0xff;
            host.pendingLocUpdates.add(mapId);
            host.scheduleLocReload(mapX, mapY);
        }
    
}
