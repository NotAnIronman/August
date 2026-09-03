
import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { Scene } from "@august/osrs-engine/scene/Scene";
import { SdMapData } from "@client/engine/rendering/loader/SdMapData";
import { SdMapDataLoader } from "@client/engine/rendering/loader/SdMapDataLoader";
import { SdMapLoaderInput } from "@client/engine/rendering/loader/SdMapLoaderInput";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export async function queueLoadMap(host: WebGLOsrsRendererHost, 
        mapX: number,
        mapY: number,
        streamGeneration?: number,
        locReloadBatchId?: number,
    ): Promise<void> {

        // Don't try to load maps before cache is initialized
        if (!host.osrsClient.loadedCache) return;

        // Suppress normal map streaming while an instance scene is active
        if (host.instanceActive && typeof locReloadBatchId !== "number") return;

        host.applyGamemodeWorldLocs();

        const mapId = getMapSquareId(mapX, mapY);
        const doorOnly =
            typeof locReloadBatchId === "number" &&
            !host.pendingLocUpdates.has(mapId) &&
            !host.pendingLocGeometryUpdates.has(mapId) &&
            host.pendingDoorLocUpdates.has(mapId);
        const locOnly =
            typeof locReloadBatchId === "number" &&
            !host.pendingLocUpdates.has(mapId) &&
            !host.pendingDoorLocUpdates.has(mapId) &&
            host.pendingLocGeometryUpdates.has(mapId);
        const input: SdMapLoaderInput = {
            mapX,
            mapY,
            maxLevel: Math.max(0, Math.min(Scene.MAX_LEVELS - 1, host.maxLevel | 0)),
            loadNpcs: host.loadNpcs,
            smoothTerrain: host.smoothTerrain,
            minimizeDrawCalls: !host.hasMultiDraw,
            doorOnly,
            locOnly,
            loadedTextureIds: host.loadedTextureIds,
            locOverrides: host.locOverrides,
            extraLocs: host.getExtraLocsForMap(mapX, mapY),
            locSpawns: host.locSpawns,
            terrainOverrides: host.terrainOverrides,
        };

        const mapData = await host.osrsClient.workerPool.queueLoad<
            SdMapLoaderInput,
            SdMapData | undefined,
            SdMapDataLoader
        >(host.dataLoader, input);

        if (mapData && host.isValidMapData(mapData)) {
            if (typeof locReloadBatchId === "number") {
                host.resolveLocReloadBatchMap(locReloadBatchId, mapId, mapData);
                return;
            }
            host.queueStreamMapData(mapData, streamGeneration);
        } else {
            if (!mapData) {
                host.mapManager.addInvalidMap(mapX, mapY);
            } else {
                host.mapManager.loadingMapIds.delete(mapId);
            }
            host.pendingLocUpdates.delete(mapId);
            host.pendingLocGeometryUpdates.delete(mapId);
            host.pendingDoorLocUpdates.delete(mapId);
            host.queuedLocReloadBatchByMap.delete(mapId);
            if (typeof locReloadBatchId === "number") {
                host.resolveLocReloadBatchMap(locReloadBatchId, mapId, undefined);
            }
        }
    
}
