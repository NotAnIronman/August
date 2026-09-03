import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";

import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { Scene } from "@august/osrs-engine/scene/Scene";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import { WorldEntityAnimator } from "@client/engine/rendering/WorldEntityAnimator";
import { SdMapData } from "@client/engine/rendering/loader/SdMapData";
import { SdMapDataLoader } from "@client/engine/rendering/loader/SdMapDataLoader";
import { SdMapLoaderInput } from "@client/engine/rendering/loader/SdMapLoaderInput";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export async function loadWorldEntityScene(host: WebGLOsrsRendererHost, 
        entityIndex: number,
        templateChunks: number[][][],
        regionX: number,
        regionY: number,
        worldX: number,
        worldY: number,
        sizeX: number,
        sizeZ: number,
        extraLocs: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }>,
        configId: number = -1,
        extraNpcs?: Array<{ id: number; x: number; y: number; level: number }>,
        basePlane: number = 0,
    ): Promise<void> {

        if (!host.osrsClient.loadedCache) return;

        const loadToken = host.nextWorldEntityLoadToken++;
        host.worldEntityLoadTokens.set(entityIndex, loadToken);
        if (host.worldEntityOverlays.has(entityIndex)) {
            host.clearWorldEntity(entityIndex);
            host.worldEntityLoadTokens.set(entityIndex, loadToken);
        }

        const sceneTilesX = (templateChunks[0]?.length ?? 13) * 8;
        const sceneTilesY = (templateChunks[0]?.[0]?.length ?? 13) * 8;
        const sceneSizeHalf = sceneTilesX / 2;
        const entityWorldBaseX = worldX - sceneSizeHalf;
        const entityWorldBaseY = worldY - sceneTilesY / 2;

        // Use a unique mapX/Y for the overlay that won't collide with real map squares
        const overlayMapX = 200 + entityIndex;
        const overlayMapY = 200 + entityIndex;
        const overlayMapId = getMapSquareId(overlayMapX, overlayMapY);
        host.mapManager.loadingMapIds.add(overlayMapId);

        clientDebugLog(
            `[WebGLOsrsRenderer] Loading world entity overlay: entity=${entityIndex} config=${configId} source=(${regionX},${regionY}) worldPos=(${worldX},${worldY}) renderBase=(${entityWorldBaseX},${entityWorldBaseY})`,
        );

        host.worldEntityOverlays.set(entityIndex, {
            entityIndex,
            configId,
            templateChunks,
            regionX,
            regionY,
            worldX,
            worldY,
            sizeX,
            sizeZ,
            extraLocs,
            extraNpcs,
            basePlane,
        });

        // Register with WorldViewManager
        host.osrsClient.worldViewManager.createWorldView(entityIndex, sceneTilesX, sceneTilesY, {
            baseX: Math.floor(entityWorldBaseX),
            baseY: Math.floor(entityWorldBaseY),
            configId,
            templateChunks,
            regionX,
            regionY,
            worldX,
            worldY,
            sizeXEntity: sizeX,
            sizeZEntity: sizeZ,
            extraLocs,
            extraNpcs,
        });

        if (configId >= 0) {
            host.ensureWorldEntityAnimator();
            host.worldEntityAnimator?.addEntity(entityIndex, configId, host.lastTick);
        }

        // Collect extra locs from addedLocs that fall within the source region
        const CHUNK_SIZE = 8;
        const sceneBaseX = (regionX - 6) * CHUNK_SIZE;
        const sceneBaseY = (regionY - 6) * CHUNK_SIZE;
        const sceneMaxX = sceneBaseX + 13 * CHUNK_SIZE;
        const sceneMaxY = sceneBaseY + 13 * CHUNK_SIZE;
        const allExtraLocs: typeof extraLocs = [...extraLocs];
        for (const loc of host.addedLocs.values()) {
            if (
                loc.x >= sceneBaseX &&
                loc.x < sceneMaxX &&
                loc.y >= sceneBaseY &&
                loc.y < sceneMaxY
            ) {
                allExtraLocs.push({
                    id: loc.locId,
                    x: loc.x,
                    y: loc.y,
                    level: loc.level,
                    shape: loc.shape,
                    rotation: loc.rotation,
                });
            }
        }
        clientDebugLog(
            `[WebGLOsrsRenderer] World entity overlay: ${allExtraLocs.length} extra locs, ${
                extraNpcs?.length ?? 0
            } extra NPCs`,
        );

        const input: SdMapLoaderInput = {
            mapX: overlayMapX,
            mapY: overlayMapY,
            maxLevel: Math.max(0, Math.min(Scene.MAX_LEVELS - 1, host.maxLevel | 0)),
            loadNpcs: host.loadNpcs,
            smoothTerrain: host.smoothTerrain,
            minimizeDrawCalls: !host.hasMultiDraw,
            loadedTextureIds: host.loadedTextureIds,
            instance: { templateChunks, regionX, regionY },
            overrideRenderPos: { x: entityWorldBaseX, y: entityWorldBaseY },
            extraLocs: allExtraLocs.length > 0 ? allExtraLocs : undefined,
            extraNpcs: extraNpcs && extraNpcs.length > 0 ? extraNpcs : undefined,
        };

        const mapData = await host.osrsClient.workerPool.queueLoad<
            SdMapLoaderInput,
            SdMapData | undefined,
            SdMapDataLoader
        >(host.dataLoader, input);

        if (host.worldEntityLoadTokens.get(entityIndex) !== loadToken) {
            return;
        }

        if (mapData) {
            clientDebugLog(
                `[WebGLOsrsRenderer] World entity overlay loaded: entity=${entityIndex} vertices=${
                    mapData.vertices?.length ?? 0
                }`,
            );
            host.mapsToLoad.push(mapData);
            host.mapManager.loadingMapIds.add(overlayMapId);
            host.mapManager.worldEntityMapIds.add(overlayMapId);
        } else {
            host.mapManager.loadingMapIds.delete(overlayMapId);
        }
    
}

export function ensureWorldEntityOverlaysLoaded(host: WebGLOsrsRendererHost, nowMs: number): void {

        for (const [entityIndex, overlay] of host.worldEntityOverlays) {
            const overlayMapX = 200 + entityIndex;
            const overlayMapY = 200 + entityIndex;
            const overlayMapId = getMapSquareId(overlayMapX, overlayMapY);
            if (host.mapManager.mapSquares.has(overlayMapId)) continue;
            if (host.mapManager.loadingMapIds.has(overlayMapId)) continue;

            const retryAfter = host.worldEntityReloadAfterMs.get(entityIndex) ?? 0;
            if (nowMs < retryAfter) continue;

            host.worldEntityReloadAfterMs.set(entityIndex, nowMs + 250);
            console.warn(
                `[WebGLOsrsRenderer] Missing world entity overlay map, reloading entity=${entityIndex}`,
            );
            void host.loadWorldEntityScene(
                overlay.entityIndex,
                overlay.templateChunks,
                overlay.regionX,
                overlay.regionY,
                overlay.worldX,
                overlay.worldY,
                overlay.sizeX,
                overlay.sizeZ,
                overlay.extraLocs,
                overlay.configId,
                overlay.extraNpcs,
                overlay.basePlane,
            );
        }
    
}

export function scheduleWorldEntityLocRebuild(host: WebGLOsrsRendererHost, entityIndex: number): void {

        if (host.worldEntityLocRebuildTimer !== null) return;
        host.worldEntityLocRebuildTimer = setTimeout(() => {
            host.worldEntityLocRebuildTimer = null;
            const overlay = host.worldEntityOverlays.get(entityIndex);
            if (!overlay) return;
            clientDebugLog(
                `[WebGLOsrsRenderer] Rebuilding world entity overlay with deferred locs`,
            );
            host.loadWorldEntityScene(
                overlay.entityIndex,
                overlay.templateChunks,
                overlay.regionX,
                overlay.regionY,
                overlay.worldX,
                overlay.worldY,
                overlay.sizeX,
                overlay.sizeZ,
                overlay.extraLocs,
                overlay.configId,
                overlay.extraNpcs,
                overlay.basePlane,
            );
        }, 150);
    
}

export function ensureWorldEntityAnimator(host: WebGLOsrsRendererHost, ): void {

        if (host.worldEntityAnimator) return;
        host.worldEntityAnimator = new WorldEntityAnimator(
            host.osrsClient.worldEntityTypeLoader,
            host.osrsClient.seqTypeLoader,
            host.osrsClient.skeletalSeqLoader,
        );
    
}

export function getWorldEntityIndexForMapId(host: WebGLOsrsRendererHost, mapId: number): number | undefined {

        for (const [entityIndex] of host.worldEntityOverlays) {
            const overlayMapX = 200 + entityIndex;
            const overlayMapY = 200 + entityIndex;
            if (getMapSquareId(overlayMapX, overlayMapY) === mapId) {
                return entityIndex;
            }
        }
        return undefined;
    
}

export function getOverlayMapForEntity(host: WebGLOsrsRendererHost, entityIndex: number): WebGLMapSquare | undefined {

        const overlayMapId = getMapSquareId(200 + entityIndex, 200 + entityIndex);
        return host.mapManager.mapSquares.get(overlayMapId);
    
}

export function getWorldEntityTransformForMap(host: WebGLOsrsRendererHost, map: WebGLMapSquare): Float32Array {

        if (!host.mapManager.worldEntityMapIds.has(map.id)) {
            return WebGLMapSquare.IDENTITY_MAT4;
        }
        const entityIndex = host.getWorldEntityIndexForMapId(map.id);
        if (entityIndex === undefined) return WebGLMapSquare.IDENTITY_MAT4;
        return host.worldEntityAnimator?.getTransform(entityIndex) ?? WebGLMapSquare.IDENTITY_MAT4;
    
}

export function getWorldEntityTransformForMapOrOverlap(host: WebGLOsrsRendererHost, map: WebGLMapSquare): Float32Array {

        const direct = host.getWorldEntityTransformForMap(map);
        if (direct !== WebGLMapSquare.IDENTITY_MAT4) return direct;
        for (const [entityIndex, overlay] of host.worldEntityOverlays) {
            const entityMapX = Math.floor(overlay.worldX / 64) | 0;
            const entityMapY = Math.floor(overlay.worldY / 64) | 0;
            if (map.mapX === entityMapX && map.mapY === entityMapY) {
                return (
                    host.worldEntityAnimator?.getTransform(entityIndex) ??
                    WebGLMapSquare.IDENTITY_MAT4
                );
            }
        }
        return WebGLMapSquare.IDENTITY_MAT4;
    
}

export function getWorldEntityDeckHeight(host: WebGLOsrsRendererHost, _overworldTileX: number, _overworldTileY: number): number {

        for (const [, overlay] of host.worldEntityOverlays) {
            if (overlay.deckHeight !== undefined && overlay.deckHeight !== 0) {
                return overlay.deckHeight;
            }
        }
        return 0;
    
}

export function getNpcModelYOffset(host: WebGLOsrsRendererHost, deckHeight: number = 0): number {

        // npc.vert.glsl subtracts this uniform. Invert the shared clearance so
        // NPCs use the same effective world-space offset as players.
        return -(deckHeight + RENDER_CONSTANTS.ACTOR_GROUND_CLEARANCE_MODEL_UNITS);
    
}

export function getWorldEntityTransformForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number): Float32Array {

        for (const [entityIndex, overlay] of host.worldEntityOverlays) {
            const halfSize = (overlay.sizeX * 8) / 2;
            const minX = overlay.worldX - halfSize;
            const maxX = overlay.worldX + halfSize;
            const minY = overlay.worldY - halfSize;
            const maxY = overlay.worldY + halfSize;
            if (tileX >= minX && tileX < maxX && tileY >= minY && tileY < maxY) {
                return (
                    host.worldEntityAnimator?.getTransform(entityIndex) ??
                    WebGLMapSquare.IDENTITY_MAT4
                );
            }
        }
        return WebGLMapSquare.IDENTITY_MAT4;
    
}

export function clearWorldEntity(host: WebGLOsrsRendererHost, entityIndex: number): void {

        const overlayMapX = 200 + entityIndex;
        const overlayMapY = 200 + entityIndex;
        const overlayMapId = getMapSquareId(overlayMapX, overlayMapY);
        host.mapManager.worldEntityMapIds.delete(overlayMapId);
        host.mapManager.loadingMapIds.delete(overlayMapId);
        host.mapManager.removeMap(overlayMapX, overlayMapY);
        host.worldEntityOverlays.delete(entityIndex);
        host.worldEntityLoadTokens.delete(entityIndex);
        host.worldEntityReloadAfterMs.delete(entityIndex);
        host.worldEntityAnimator?.removeEntity(entityIndex);
        host.osrsClient.worldViewManager.removeWorldView(entityIndex);
    
}
