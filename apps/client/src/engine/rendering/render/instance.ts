import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";

import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { Scene } from "@august/osrs-engine/scene/Scene";
import { SdMapData } from "@client/engine/rendering/loader/SdMapData";
import { SdMapDataLoader } from "@client/engine/rendering/loader/SdMapDataLoader";
import { SdMapLoaderInput } from "@client/engine/rendering/loader/SdMapLoaderInput";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

function captureInstanceSceneFallback(host: WebGLOsrsRendererHost) {
    return {
        active: host.instanceActive,
        ready: host.instanceSceneReady,
        templateChunks: host.instanceTemplateChunks,
        regionX: host.instanceRegionX,
        regionY: host.instanceRegionY,
        smoothTerrain: host.smoothTerrain,
        loadNpcs: host.loadNpcs,
    };
}

function applyDeferredInstanceSceneSettings(host: WebGLOsrsRendererHost): void {
    const pending = host.instanceScenePendingSettings;
    if (!pending) return;
    host.instanceScenePendingSettings = null;

    if (host.instanceActive && host.instanceTemplateChunks) {
        host.requestInstanceSceneSettingsRebuild(pending.smoothTerrain, pending.loadNpcs);
        return;
    }

    // A failed initial instance transition may have restored the normal scene
    // while ClientState still awaits a server rebuild. Keep that committed map
    // resident; clearing it here can leave no map and no active streaming path.
    host.smoothTerrain = pending.smoothTerrain;
    host.loadNpcs = pending.loadNpcs;
}

function startPendingInstanceLocRebuild(host: WebGLOsrsRendererHost): void {
    if (!host.instanceLocRebuildPending || host.instanceSceneBuildPending) return;
    if (!host.instanceActive || !host.instanceTemplateChunks) {
        host.instanceLocRebuildPending = false;
        return;
    }

    host.instanceLocRebuildPending = false;
    host.instanceSceneFallbackState = captureInstanceSceneFallback(host);
    host.instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
    const generation = host.instanceSceneGeneration;
    host.instanceSceneBuildPending = true;
    host.instanceSceneReady = false;

    const templateChunks = host.instanceTemplateChunks;
    const regionX = host.instanceRegionX;
    const regionY = host.instanceRegionY;
    const playerMapX = ((regionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
    const playerMapY = ((regionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;

    void host
        .doInstanceSceneBuild(
            templateChunks,
            regionX,
            regionY,
            playerMapX,
            playerMapY,
            true,
            generation,
        )
        .then((loaded) => {
            if (host.instanceSceneGeneration !== generation) return;
            if (!loaded) {
                failCurrentInstanceSceneBuild(
                    host,
                    new Error("instance loc rebuild returned no valid map data"),
                );
            }
        })
        .catch((error) => {
            if (host.instanceSceneGeneration !== generation) return;
            failCurrentInstanceSceneBuild(host, error);
        });
}

function failCurrentInstanceSceneBuild(host: WebGLOsrsRendererHost, error: unknown): void {
    const fallback = host.instanceSceneFallbackState;
    host.instanceSceneBuildPending = false;
    host.instanceSceneFallbackState = null;

    if (fallback) {
        host.instanceActive = fallback.active;
        host.instanceSceneReady = fallback.ready;
        host.instanceTemplateChunks = fallback.templateChunks;
        host.instanceRegionX = fallback.regionX;
        host.instanceRegionY = fallback.regionY;
        host.smoothTerrain = fallback.smoothTerrain;
        host.loadNpcs = fallback.loadNpcs;
    }

    console.error(
        "[WebGLOsrsRenderer] Instance scene build failed; preserving the previous scene",
        error,
    );
    if (host.instanceSceneReady) host.osrsClient.notifyRendererReady();
    applyDeferredInstanceSceneSettings(host);
    startPendingInstanceLocRebuild(host);
}

export async function loadInstanceScene(host: WebGLOsrsRendererHost, 
        templateChunks: number[][][],
        regionX: number,
        regionY: number,
    ): Promise<void> {

        if (!host.osrsClient.loadedCache) return;

        // An overlapping REBUILD_REGION must retain the fallback captured by
        // the first uncommitted transition. Restoring fields from the previous
        // request would otherwise restore another uncommitted scene.
        if (!host.instanceSceneBuildPending || !host.instanceSceneFallbackState) {
            host.instanceSceneFallbackState = captureInstanceSceneFallback(host);
        }

        // A setting requested during the superseded build can safely become
        // the input to this newer generation.
        const pendingSettings = host.instanceScenePendingSettings;
        if (pendingSettings) {
            host.instanceScenePendingSettings = null;
            host.smoothTerrain = pendingSettings.smoothTerrain;
            host.loadNpcs = pendingSettings.loadNpcs;
        }

        const instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
        host.instanceSceneGeneration = instanceSceneGeneration;
        host.instanceSceneBuildPending = true;
        host.instanceSceneReady = false;

        // Suppress normal map streaming while the instance is active
        host.instanceActive = true;
        host.instanceTemplateChunks = templateChunks;
        host.instanceRegionX = regionX;
        host.instanceRegionY = regionY;

        // regionX/Y are chunk coordinates from the REBUILD_REGION packet.
        // The player tile = regionX*8, regionY*8. Map square = tile / 64.
        const playerMapX = ((regionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const playerMapY = ((regionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;

        clientDebugLog(
            `[WebGLOsrsRenderer] Loading instance scene at map (${playerMapX}, ${playerMapY}) from region (${regionX}, ${regionY})...`,
        );

        try {
            const loaded = await host.doInstanceSceneBuild(
                templateChunks,
                regionX,
                regionY,
                playerMapX,
                playerMapY,
                true,
                instanceSceneGeneration,
            );
            if (!loaded) {
                // A newer rebuild or clearInstance invalidated this request.
                // Its lifecycle owns the renderer state now.
                if (host.instanceSceneGeneration !== instanceSceneGeneration) return;
                throw new Error("instance scene loader returned no valid map data");
            }
        } catch (error) {
            if (host.instanceSceneGeneration !== instanceSceneGeneration) return;
            failCurrentInstanceSceneBuild(host, error);
            return;
        }

        // LOC_ADD_CHANGE packets arrive after REBUILD_REGION on the same socket.
        // By now they are stored in addedLocs. Schedule a deferred rebuild to
        // include them; the short delay batches any remaining in-flight packets.
        if (host.addedLocs.size > 0) {
            host.scheduleInstanceLocRebuild();
        }
    
}

export async function doInstanceSceneBuild(host: WebGLOsrsRendererHost, 
        templateChunks: number[][][],
        regionX: number,
        regionY: number,
        playerMapX: number,
        playerMapY: number,
        replaceExistingMaps: boolean = false,
        instanceSceneGeneration?: number,
    ): Promise<boolean> {

        const extraLocs = host.getInstanceExtraLocs(playerMapX, playerMapY);

        const controlledWorldViewId = host.getControlledPlayerWorldViewId();
        const input: SdMapLoaderInput = {
            mapX: playerMapX,
            mapY: playerMapY,
            maxLevel: Math.max(0, Math.min(Scene.MAX_LEVELS - 1, host.maxLevel | 0)),
            // REBUILD_REGION can arrive before the local-player sync assigns its
            // private world view. Baking NPCs at that point admits the public
            // overworld spawns at the copied coordinates, leaving frozen,
            // unlinked meshes behind. Start with terrain only; the normal NPC
            // instance flush builds the private geometry once the view id exists.
            loadNpcs: host.loadNpcs && controlledWorldViewId >= 0,
            smoothTerrain: host.smoothTerrain,
            minimizeDrawCalls: !host.hasMultiDraw,
            loadedTextureIds: host.loadedTextureIds,
            instance: {
                templateChunks,
                regionX,
                regionY,
                ...(controlledWorldViewId >= 0 ? { worldViewId: controlledWorldViewId } : {}),
            },
            locOverrides: host.locOverrides,
            locSpawns: host.locSpawns,
            terrainOverrides: host.terrainOverrides,
            extraLocs,
        };

        const mapData = await host.osrsClient.workerPool.queueLoad<
            SdMapLoaderInput,
            SdMapData | undefined,
            SdMapDataLoader
        >(host.dataLoader, input);

        if (
            instanceSceneGeneration !== undefined &&
            (host.instanceSceneGeneration !== instanceSceneGeneration || !host.instanceActive)
        ) {
            return false;
        }

        if (mapData && instanceSceneGeneration !== undefined) {
            mapData.instanceSceneGeneration = instanceSceneGeneration;
            mapData.instanceSceneReplacesExistingMaps = replaceExistingMaps;
        }

        if (mapData && host.isValidMapData(mapData)) {
            clientDebugLog(
                `[WebGLOsrsRenderer] Instance scene loaded: vertices=${
                    mapData.vertices?.length ?? 0
                } indices=${mapData.indices?.length ?? 0} mapX=${mapData.mapX} mapY=${
                    mapData.mapY
                } border=${mapData.borderSize} extraLocs=${extraLocs?.length ?? 0}`,
            );
            // Clear any in-flight normal map loads that arrived during the async instance build
            host.mapsToLoad.clear();
            host.pendingStreamMapsByGeneration.clear();
            // Bypass grid/generation checks — instance scenes are always valid
            host.mapsToLoad.push(mapData);
            // Register the map in MapManager so it isn't pruned
            host.mapManager.loadingMapIds.add(getMapSquareId(playerMapX, playerMapY));
            return true;
        } else {
            console.warn(
                "[WebGLOsrsRenderer] Instance scene load returned no valid data",
                mapData
                    ? {
                          mapX: mapData.mapX,
                          mapY: mapData.mapY,
                          loadNpcs: mapData.loadNpcs,
                          expectedLoadNpcs: host.loadNpcs,
                      }
                    : undefined,
            );
            return false;
        }
    
}

/**
 * Completes the instance transition only once its map has actually replaced
 * the old scene. Until this point NPC sync may update ECS/worker state, but its
 * geometry refresh remains pending so it cannot attach to the old map square.
 */
export function markInstanceSceneCommitted(
        host: WebGLOsrsRendererHost,
        mapData: SdMapData,
    ): void {

        const generation = mapData.instanceSceneGeneration;
        if (
            !host.instanceActive ||
            generation === undefined ||
            generation !== host.instanceSceneGeneration
        ) {
            return;
        }

        const expectedMapX = ((host.instanceRegionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const expectedMapY = ((host.instanceRegionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        if (mapData.mapX !== expectedMapX || mapData.mapY !== expectedMapY) return;
        if (host.instanceSceneReady && !host.instanceSceneBuildPending) return;

        // loadMap has already installed the replacement at this point. Only
        // now is it safe to release the prior scene; if map construction threw,
        // this commit hook was never reached and the old scene remains intact.
        if (mapData.instanceSceneReplacesExistingMaps) {
            for (const existing of Array.from(host.mapManager.mapSquares.values())) {
                if (existing.mapX === mapData.mapX && existing.mapY === mapData.mapY) continue;
                host.mapManager.removeMap(existing.mapX, existing.mapY);
            }
            host.mapManager.loadingMapIds.clear();
        }

        host.instanceSceneBuildPending = false;
        host.instanceSceneReady = true;
        host.instanceSceneFallbackState = null;
        host.osrsClient.notifyRendererReady();
        applyDeferredInstanceSceneSettings(host);
        startPendingInstanceLocRebuild(host);

}

/** Restore the last committed scene when GPU/map application fails before commit. */
export function failInstanceSceneCommit(
        host: WebGLOsrsRendererHost,
        mapData: SdMapData,
        error: unknown,
    ): void {
        const generation = mapData.instanceSceneGeneration;
        if (
            generation === undefined ||
            generation !== host.instanceSceneGeneration ||
            !host.instanceSceneBuildPending
        ) {
            return;
        }
        host.mapManager.loadingMapIds.delete(getMapSquareId(mapData.mapX, mapData.mapY));
        failCurrentInstanceSceneBuild(host, error);
}

/**
 * Applies renderer settings transactionally inside an instance. If another
 * scene payload is in flight, retain its exact validation settings and defer
 * the newest request until that payload commits. A committed instance remains
 * resident while the follow-up worker build runs.
 */
export function requestInstanceSceneSettingsRebuild(
        host: WebGLOsrsRendererHost,
        smoothTerrain: boolean,
        loadNpcs: boolean,
    ): void {

        const requested = {
            smoothTerrain: !!smoothTerrain,
            loadNpcs: !!loadNpcs,
        };

        if (host.instanceSceneBuildPending) {
            host.instanceScenePendingSettings = requested;
            return;
        }

        if (!host.instanceActive) {
            const updated =
                host.smoothTerrain !== requested.smoothTerrain ||
                host.loadNpcs !== requested.loadNpcs;
            host.smoothTerrain = requested.smoothTerrain;
            host.loadNpcs = requested.loadNpcs;
            if (updated) host.clearMaps();
            return;
        }

        if (!host.instanceTemplateChunks) {
            // Malformed/incomplete instance state has no safe rebuild input.
            // Retain any resident map instead of suppressing streaming after a
            // destructive clear; the next server rebuild can apply the setting.
            host.smoothTerrain = requested.smoothTerrain;
            host.loadNpcs = requested.loadNpcs;
            return;
        }

        if (
            host.smoothTerrain === requested.smoothTerrain &&
            host.loadNpcs === requested.loadNpcs
        ) {
            return;
        }

        host.instanceSceneFallbackState = captureInstanceSceneFallback(host);
        host.smoothTerrain = requested.smoothTerrain;
        host.loadNpcs = requested.loadNpcs;
        host.instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
        const generation = host.instanceSceneGeneration;
        host.instanceSceneBuildPending = true;
        host.instanceSceneReady = false;

        const templateChunks = host.instanceTemplateChunks;
        const regionX = host.instanceRegionX;
        const regionY = host.instanceRegionY;
        const playerMapX = ((regionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const playerMapY = ((regionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;

        void host
            .doInstanceSceneBuild(
                templateChunks,
                regionX,
                regionY,
                playerMapX,
                playerMapY,
                true,
                generation,
            )
            .then((loaded) => {
                if (host.instanceSceneGeneration !== generation) return;
                if (!loaded) {
                    failCurrentInstanceSceneBuild(
                        host,
                        new Error("instance settings rebuild returned no valid map data"),
                    );
                }
            })
            .catch((error) => {
                if (host.instanceSceneGeneration !== generation) return;
                failCurrentInstanceSceneBuild(host, error);
            });

}

export function getInstanceExtraLocs(host: WebGLOsrsRendererHost, 
        playerMapX: number,
        playerMapY: number,
    ): SdMapLoaderInput["extraLocs"] {

        if (host.addedLocs.size === 0) return undefined;

        // Instance scene is built as a single map square at (playerMapX, playerMapY).
        // Collect all addedLocs — the scene builder will filter by bounds.
        const locs: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }> = [];
        for (const loc of host.addedLocs.values()) {
            locs.push({
                id: loc.locId,
                x: loc.x,
                y: loc.y,
                level: loc.level,
                shape: loc.shape,
                rotation: loc.rotation,
            });
        }
        return locs.length > 0 ? locs : undefined;
    
}

export function scheduleInstanceLocRebuild(host: WebGLOsrsRendererHost, ): void {
        host.instanceLocRebuildPending = true;
        // A scene build snapshots extraLocs before awaiting the worker. Starting
        // another payload with the same generation here allows completion order
        // to restore the older snapshot. Coalesce changes until commit instead;
        // the follow-up build receives its own generation.
        if (host.instanceSceneBuildPending) return;
        if (host.instanceLocRebuildTimer !== null) {
            clearTimeout(host.instanceLocRebuildTimer);
        }
        host.instanceLocRebuildTimer = setTimeout(() => {
            host.instanceLocRebuildTimer = null;
            if (!host.instanceActive || !host.instanceTemplateChunks) {
                host.instanceLocRebuildPending = false;
                return;
            }
            clientDebugLog(
                `[WebGLOsrsRenderer] Rebuilding instance scene with ${host.addedLocs.size} extra locs`,
            );
            startPendingInstanceLocRebuild(host);
        }, 100);
    
}

export function clearInstance(host: WebGLOsrsRendererHost, ): void {

        host.instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
        host.instanceSceneBuildPending = false;
        host.instanceSceneReady = false;
        host.instanceScenePendingSettings = null;
        host.instanceSceneFallbackState = null;
        host.instanceLocRebuildPending = false;
        host.instanceActive = false;
        host.instanceTemplateChunks = null;
        if (host.instanceLocRebuildTimer !== null) {
            clearTimeout(host.instanceLocRebuildTimer);
            host.instanceLocRebuildTimer = null;
        }
        host.mapsToLoad.clear();
        host.mapManager.clearMaps();
        clientDebugLog("[WebGLOsrsRenderer] Instance cleared, normal map streaming resumed");
    
}
