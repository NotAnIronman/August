import {
    PicoGL
} from "picogl";

import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function renderGeometryPass(host: WebGLOsrsRendererHost, transparent: boolean): void {

        const roofPlaneLimit = host.getRoofPlaneLimit();
        const cullTile = host.getRenderCullTile();

        const count = host.mapManager.visibleMapCount;
        if (count === 0) {
            if (!transparent) {
                host.lastLodVisibleMapCount = 0;
                host.lastFullDetailVisibleMapCount = 0;
                host.lastDistanceCulledVisibleMapCount = 0;
            }
            return;
        }

        const start = transparent ? count - 1 : 0;
        const end = transparent ? -1 : count;
        const step = transparent ? -1 : 1;
        const renderDistanceTiles = Math.max(0, host.getFrameRenderDistanceTiles() | 0);
        const renderDistancePadTiles = 0;
        // LOD threshold in tiles from player tile to map bounds.
        const lodThresholdTiles = Math.max(0, host.getFrameLodThresholdTiles() | 0);
        let lodVisibleMapCount = 0;
        let fullDetailVisibleMapCount = 0;
        let distanceCulledVisibleMapCount = 0;

        for (let i = start; i !== end; i += step) {
            const map = host.mapManager.visibleMaps[i];
            const tileDistance = host.getMapTileDistanceFromPoint(map, cullTile.x, cullTile.y);
            if (
                !host.isMapWithinRenderDistance(
                    map,
                    cullTile.x,
                    cullTile.y,
                    renderDistanceTiles,
                    renderDistancePadTiles,
                )
            ) {
                distanceCulledVisibleMapCount++;
                continue;
            }

            // GPU interaction readback removed - always use non-interact draw calls
            const isInteract = false;
            const isLod = tileDistance > lodThresholdTiles;
            if (isLod) {
                lodVisibleMapCount++;
            } else {
                fullDetailVisibleMapCount++;
            }

            const { drawCall, drawRanges } = map.getDrawCall(transparent, isInteract, isLod);
            const drawRangePlanes = map.getDrawRangesPlanes(transparent, isInteract, isLod);

            const isWorldEntity = host.mapManager.worldEntityMapIds.has(map.id);
            let weTransform: Float32Array = WebGLMapSquare.IDENTITY_MAT4;
            let weEntityIndex: number | undefined;
            if (isWorldEntity) {
                weEntityIndex = host.getWorldEntityIndexForMapId(map.id);
                if (weEntityIndex !== undefined) {
                    weTransform =
                        host.worldEntityAnimator?.getTransform(weEntityIndex) ??
                        WebGLMapSquare.IDENTITY_MAT4;
                }
            }

            drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
            drawCall.uniform("u_worldEntityTransform", weTransform);
            drawCall.uniform("u_worldEntityOpacity", 1.0);

            host.drawWithRoofPlaneFilter(drawCall, drawRanges, drawRangePlanes, roofPlaneLimit);

            const locBatch = map.getLocDrawCall(transparent, isInteract, isLod);
            if (locBatch) {
                const locDrawRangePlanes = map.getLocDrawRangesPlanes(
                    transparent,
                    isInteract,
                    isLod,
                );
                locBatch.drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
                locBatch.drawCall.uniform("u_worldEntityTransform", weTransform);
                locBatch.drawCall.uniform("u_worldEntityOpacity", 1.0);
                host.updateAnimatedDrawRanges(
                    map,
                    locBatch.drawCall,
                    locBatch.drawRanges,
                    transparent,
                    isInteract,
                    isLod,
                );
                host.drawWithRoofPlaneFilter(
                    locBatch.drawCall,
                    locBatch.drawRanges,
                    locDrawRangePlanes,
                    roofPlaneLimit,
                );
            }

            const groundBatch = map.getGroundItemDrawCall(transparent, isInteract, isLod);
            if (groundBatch) {
                const groundDrawRangePlanes = map.getGroundItemDrawRangesPlanes(
                    transparent,
                    isInteract,
                    isLod,
                );
                groundBatch.drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
                groundBatch.drawCall.uniform("u_worldEntityTransform", weTransform);
                groundBatch.drawCall.uniform("u_worldEntityOpacity", 1.0);
                host.drawWithRoofPlaneFilter(
                    groundBatch.drawCall,
                    groundBatch.drawRanges,
                    groundDrawRangePlanes,
                    roofPlaneLimit,
                );
            }

            const doorBatch = map.getDoorDrawCall(transparent, isInteract, isLod);
            if (doorBatch) {
                const doorDrawRangePlanes = map.getDoorDrawRangesPlanes(
                    transparent,
                    isInteract,
                    isLod,
                );
                doorBatch.drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
                doorBatch.drawCall.uniform("u_worldEntityTransform", weTransform);
                host.drawWithRoofPlaneFilter(
                    doorBatch.drawCall,
                    doorBatch.drawRanges,
                    doorDrawRangePlanes,
                    roofPlaneLimit,
                );
            }

            // Mode1 overlap ghost: redraw WE with tint + low opacity when actors overlap
            if (isWorldEntity && weEntityIndex !== undefined && !transparent) {
                const weEntity = host.osrsClient.worldViewManager.getWorldEntity(weEntityIndex);
                if (weEntity && weEntity.drawMode === 1) {
                    const weView = host.osrsClient.worldViewManager.getWorldView(weEntityIndex);
                    const hasOverlap =
                        weView && (weView.npcIds.size > 0 || weView.playerIds.size > 0);
                    if (hasOverlap) {
                        const overlay = host.worldEntityOverlays.get(weEntityIndex);
                        const weType =
                            overlay?.configId !== undefined && overlay.configId >= 0
                                ? host.osrsClient.worldEntityTypeLoader?.load(overlay.configId)
                                : undefined;
                        if (weType && weType.sceneTintHsl > 0 && host.sceneUniformBuffer) {
                            host.setSceneHslOverrideFromPacked(weType.sceneTintHsl, 127);
                            host.sceneUniformBuffer
                                .set(4, host.sceneHslOverride as Float32Array)
                                .update();

                            host.app.enable(PicoGL.BLEND);
                            host.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

                            drawCall.uniform("u_worldEntityOpacity", 0.01);
                            host.drawWithRoofPlaneFilter(
                                drawCall,
                                drawRanges,
                                drawRangePlanes,
                                roofPlaneLimit,
                            );
                            drawCall.uniform("u_worldEntityOpacity", 1.0);

                            host.app.disable(PicoGL.BLEND);

                            host.clearSceneHslOverride();
                            host.sceneUniformBuffer
                                .set(4, host.sceneHslOverride as Float32Array)
                                .update();
                        }
                    }
                }
            }
        }

        if (!transparent) {
            host.lastLodVisibleMapCount = lodVisibleMapCount;
            host.lastFullDetailVisibleMapCount = fullDetailVisibleMapCount;
            host.lastLodThreshold = lodThresholdTiles | 0;
            host.lastDistanceCulledVisibleMapCount = distanceCulledVisibleMapCount;
        }
    
}

export function renderOpaquePass(host: WebGLOsrsRendererHost, ): void {

        host.renderGeometryPass(false);
    
}

export function renderTransparentPass(host: WebGLOsrsRendererHost, ): void {

        host.renderGeometryPass(true);
    
}
