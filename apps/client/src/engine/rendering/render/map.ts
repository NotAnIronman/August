import {
    Program,
    Texture,
    UniformBuffer
} from "picogl";

import { getMapPlaneId,getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { Scene } from "@august/osrs-engine/scene/Scene";
import {
    getClientCycle
} from "@client/core/network/ServerConnection";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import { SdMapData,type MinimapIcon } from "@client/engine/rendering/loader/SdMapData";
import { HD_SKY_COLOR_VEC4 } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function resolveLocReloadBatchMap(host: WebGLOsrsRendererHost, 
        batchId: number,
        mapId: number,
        mapData: SdMapData | undefined,
    ): void {

        const batch = host.pendingLocReloadBatches.get(batchId);
        if (!batch) {
            if (mapData) {
                host.mapsToLoad.push(mapData);
            }
            return;
        }

        if (mapData) {
            batch.loaded.set(mapId, mapData);
        }
        batch.pendingMapIds.delete(mapId);

        if (batch.pendingMapIds.size > 0) {
            return;
        }

        // Commit the whole loc-reload batch together so multi-square gates don't show half-updates.
        for (const expectedMapId of batch.mapIds) {
            const ready = batch.loaded.get(expectedMapId);
            if (!ready) continue;
            host.mapsToLoad.push(ready);
            host.queuedLocReloadBatchByMap.set(expectedMapId, batch.id);
        }
        host.pendingLocReloadBatches.delete(batchId);
    
}

export function beginLocReloadBatch(host: WebGLOsrsRendererHost, maps: Array<{ mapX: number; mapY: number }>): void {

        if (maps.length === 0) return;

        const ordered = maps
            .map((map) => ({
                mapX: map.mapX | 0,
                mapY: map.mapY | 0,
                mapId: getMapSquareId(map.mapX, map.mapY),
            }))
            .sort((a, b) => a.mapId - b.mapId);
        const mapIds = ordered.map((entry) => entry.mapId);
        const batchId = host.nextLocReloadBatchId++;
        host.pendingLocReloadBatches.set(batchId, {
            id: batchId,
            mapIds,
            pendingMapIds: new Set<number>(mapIds),
            loaded: new Map<number, SdMapData>(),
        });

        for (const entry of ordered) {
            void host.queueLoadMap(entry.mapX, entry.mapY, undefined, batchId);
        }
    
}

export function loadMap(host: WebGLOsrsRendererHost, 
        mainProgram: Program,
        mainAlphaProgram: Program,
        npcProgram: Program,
        textureArray: Texture,
        textureMaterials: Texture,
        waterTextures: Texture,
        sceneUniformBuffer: UniformBuffer,
        mapData: SdMapData,
        time: number,
    ): void {

        const { mapX, mapY } = mapData;
        const mapId = getMapSquareId(mapX, mapY);
        const existing = host.mapManager.getMap(mapX, mapY);
        // An instance payload is always a complete scene replacement. A loc
        // update queued for the previously resident overworld map may share the
        // same map id; treating the instance payload as that partial update
        // would mutate the old map in place and falsely report a commit.
        const isInstanceScenePayload = mapData.instanceSceneGeneration !== undefined;
        const isLocUpdate = !isInstanceScenePayload && host.pendingLocUpdates.has(mapId);
        const isLocGeometryUpdate =
            !isInstanceScenePayload &&
            !isLocUpdate &&
            host.pendingLocGeometryUpdates.has(mapId);
        const isDoorOnlyUpdate =
            !isInstanceScenePayload &&
            !isLocUpdate &&
            !isLocGeometryUpdate &&
            host.pendingDoorLocUpdates.has(mapId);

        // A door-only payload is valid only while the original map square is
        // still resident and no broader loc update has superseded it.
        if (mapData.doorOnly && (!isDoorOnlyUpdate || !(existing instanceof WebGLMapSquare))) {
            host.pendingDoorLocUpdates.delete(mapId);
            host.pendingLocUpdates.add(mapId);
            void host.queueLoadMap(mapX, mapY);
            return;
        }
        if (mapData.locOnly && (!isLocGeometryUpdate || !(existing instanceof WebGLMapSquare))) {
            host.pendingLocGeometryUpdates.delete(mapId);
            host.pendingLocUpdates.add(mapId);
            void host.queueLoadMap(mapX, mapY);
            return;
        }

        if (
            (isLocUpdate || isLocGeometryUpdate || isDoorOnlyUpdate) &&
            existing instanceof WebGLMapSquare
        ) {
            if (isDoorOnlyUpdate && mapData.doorOnly) {
                existing.refreshDoorGeometry(
                    host.app,
                    mainProgram,
                    mainAlphaProgram,
                    textureArray,
                    textureMaterials,
                    waterTextures,
                    sceneUniformBuffer,
                    mapData,
                    existing.timeLoaded,
                );
            } else if (isLocGeometryUpdate && mapData.locOnly) {
                existing.refreshLocGeometry(
                    host.osrsClient.seqTypeLoader,
                    host.app,
                    mainProgram,
                    mainAlphaProgram,
                    textureArray,
                    textureMaterials,
                    waterTextures,
                    sceneUniformBuffer,
                    mapData,
                    getClientCycle() | 0,
                    existing.timeLoaded,
                );
            } else {
                existing.refreshSceneGeometry(
                    host.osrsClient.seqTypeLoader,
                    host.osrsClient.seqFrameLoader,
                    host.app,
                    mainProgram,
                    mainAlphaProgram,
                    textureArray,
                    textureMaterials,
                    waterTextures,
                    sceneUniformBuffer,
                    mapData,
                    getClientCycle() | 0,
                    existing.timeLoaded,
                );
            }

            if (!mapData.doorOnly) {
                host.registerMinimapData(mapData);
            }

            host.mapManager.addMap(mapX, mapY, existing);
            if (!mapData.doorOnly && !mapData.locOnly) {
                if (host.rebuildGroundItemsForMap(existing, host.groundItemStacks.get(mapId))) {
                    host.groundItemStackHashes.delete(mapId);
                }
            }
            host.pendingLocUpdates.delete(mapId);
            host.pendingLocGeometryUpdates.delete(mapId);
            host.pendingDoorLocUpdates.delete(mapId);
            host.updateTextureArray(mapData.loadedTextures);
            return;
        }

        host.registerMinimapData(mapData);

        const frameCount = host.stats.frameCount;
        // -1.0 makes loadAlpha = 1.0 immediately in the vertex shader,
        // skipping the 1-second fog fade-in for teleport-loaded maps.
        const reuseTime =
            existing instanceof WebGLMapSquare
                ? existing.timeLoaded
                : host.skipMapFadeIn
                    ? -1.0
                    : time;
        const reuseFrame = existing instanceof WebGLMapSquare ? existing.frameLoaded : frameCount;

        const loadedMap = WebGLMapSquare.load(
            host.osrsClient.seqTypeLoader,
            host.osrsClient.seqFrameLoader,
            host.osrsClient.npcTypeLoader,
            host.osrsClient.basTypeLoader,
            host.app,
            mainProgram,
            mainAlphaProgram,
            npcProgram,
            textureArray,
            textureMaterials,
            waterTextures,
            sceneUniformBuffer,
            mapData,
            reuseTime,
            getClientCycle() | 0,
            reuseFrame,
            host.osrsClient.npcEcs,
        );

        // For instances, set base world position for height sampling.
        // The height data is at source coordinates, not instance coordinates.
        if (mapData.renderPosX != null) {
            (loadedMap as any).baseWorldX =
                (mapData.renderPosX - mapData.borderSize / Scene.MAP_SQUARE_SIZE) *
                Scene.MAP_SQUARE_SIZE;
            (loadedMap as any).baseWorldY =
                (mapData.renderPosY! - mapData.borderSize / Scene.MAP_SQUARE_SIZE) *
                Scene.MAP_SQUARE_SIZE;
        }
        host.mapManager.addMap(mapX, mapY, loadedMap);
        if (host.rebuildGroundItemsForMap(loadedMap, host.groundItemStacks.get(mapId))) {
            host.groundItemStackHashes.delete(mapId);
        }

        host.updateTextureArray(mapData.loadedTextures);

        host.pendingLocUpdates.delete(mapId);
        host.pendingLocGeometryUpdates.delete(mapId);
        host.pendingDoorLocUpdates.delete(mapId);
    
}

export function isValidMapData(host: WebGLOsrsRendererHost, mapData: SdMapData): boolean {

        const isCurrentInstanceGeneration =
            mapData.instanceSceneGeneration === undefined ||
            (host.instanceActive &&
                mapData.instanceSceneGeneration === host.instanceSceneGeneration);

        const expectedInstanceMapX =
            ((host.instanceRegionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const expectedInstanceMapY =
            ((host.instanceRegionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const isTerrainOnlyInstancePayload =
            host.instanceActive &&
            host.loadNpcs &&
            !mapData.loadNpcs &&
            mapData.mapX === expectedInstanceMapX &&
            mapData.mapY === expectedInstanceMapY &&
            mapData.renderPosX != null &&
            mapData.renderPosY != null;

        return (
            isCurrentInstanceGeneration &&
            mapData.cacheName === host.osrsClient.loadedCache?.info?.name &&
            (mapData.loadNpcs === host.loadNpcs || isTerrainOnlyInstancePayload) &&
            mapData.smoothTerrain === host.smoothTerrain
        );
    
}

export function clearMaps(host: WebGLOsrsRendererHost, ): void {

        host.mapManager.cleanUp();
        host.mapsToLoad.clear();
        host.pendingStreamMapsByGeneration.clear();
        host.observedGridRevision = -1;
        host.skipMapFadeIn = false;
        // Safety net: if a load/teleport is torn down mid-flight (e.g. an
        // instance closing), don't leave the darkened loading clear color
        // stuck on screen.
        host.skyColor[0] = HD_SKY_COLOR_VEC4[0];
        host.skyColor[1] = HD_SKY_COLOR_VEC4[1];
        host.skyColor[2] = HD_SKY_COLOR_VEC4[2];
        host.activeStreamGeneration = 0;
        host.activeStreamExpectedMapIds.clear();
        host.pendingLocUpdates.clear();
        host.pendingLocGeometryUpdates.clear();
        host.pendingDoorLocUpdates.clear();
        host.pendingLocReloadMaps.clear();
        host.pendingLocReloadBatches.clear();
        host.queuedLocReloadBatchByMap.clear();
        host.nextLocReloadBatchId = 1;
        if (host.pendingLocReloadFlushTimer) {
            clearTimeout(host.pendingLocReloadFlushTimer);
            host.pendingLocReloadFlushTimer = undefined;
        }
        host.minimapIcons.clear();
        host.clearDynamicNpcAnimRuntimeState();
    
}

export function getMinimapIcons(host: WebGLOsrsRendererHost, mapX: number, mapY: number, level: number = 0): MinimapIcon[] | undefined {

        return host.minimapIcons.get(getMapPlaneId(mapX | 0, mapY | 0, level | 0));
    
}

export function setMaxLevel(host: WebGLOsrsRendererHost, maxLevel: number): void {

        const updated = host.maxLevel !== maxLevel;
        host.maxLevel = maxLevel;
        if (updated) {
            host.clearMaps();
        }
    
}
