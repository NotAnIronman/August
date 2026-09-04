import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";

import {
    isMobileMode
} from "@client/core/platform/device/DeviceUtil";
import { cleanUpRenderer } from "@client/engine/rendering/render/handlers";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function clearSessionCaches(host: WebGLOsrsRendererHost, ): void {

        // Clear NPC type caches (grow with each unique NPC type seen)
        host.npcDefaultHeightCache.clear();
        host.npcNameCache.clear();

        // Clear hitsplat/health bar state
        host.npcHitsplats.clear();
        host.playerHitsplats.clear();
        host.npcHealthBars.clear();
        host.playerHealthBars.clear();
        host.hitsplatSeenNpc.clear();
        host.actorServerTilesSeenNpc.clear();

        // Clear loc overrides and spawns (door state changes accumulate)
        host.locOverrides.clear();
        for (const timer of host.locAnimTimers.values()) {
            clearTimeout(timer);
        }
        host.locAnimTimers.clear();
        host.locSpawns.clear();
        host.terrainOverrides.clear();
        host.gamemodeWorldLocOverrideKeys.clear();
        host.gamemodeWorldLocSpawnKeys.clear();
        host.gamemodeWorldTerrainOverrideKeys.clear();
        host.mapsToLoad.clear();
        host.pendingStreamMapsByGeneration.clear();
        host.observedGridRevision = -1;
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

        // Clear ground item rendering caches
        host.groundItemStacks.clear();
        host.groundItemStackHashes.clear();
        host.clearInteractHighlightActiveTarget();
        host.clearInteractHighlightHoverTarget();
        host.interactHighlightDrawTargets.length = 0;

        // Clear minimap icons
        host.minimapIcons.clear();

        // Clear cached overlay state
        host.cachedSceneOverlayUpdateArgs = null;
        host.cachedOverlayUpdateArgs = null;

        // Clear debug counts
        host.projectileRenderDebugCounts.clear();

        // Clear cached type IDs
        host.cachedLocIds.clear();
        host.cachedObjIds.clear();
        host.cachedNpcIds.clear();
        host.interactLocModelLoader?.clearCache();
        host.interactNpcModelLoader?.clearCache();
        host.sceneRaycaster?.clearCache();
        host.clearDynamicNpcAnimRuntimeState();

        // Reset camera follow state for next login
        host.followCamFocalInitialized = false;
        host.followCamFocalLastClientCycle = -1;
        host.cameraTerrainPitchPressure = 0;
        host.clearCameraShake();
        host.mapDataLoadedNotified = false;
        host.heightValidAtTime = undefined;
    
}

export async function cleanUp(host: WebGLOsrsRendererHost, ): Promise<void> {

        cleanUpRenderer(host);
        host.canvas.removeEventListener("touchstart", host.onCanvasTouchStart, true);
        if (isMobileMode && typeof window !== "undefined") {
            window.removeEventListener("resize", host.onMobileLoginViewportChange);
            window.removeEventListener("orientationchange", host.onMobileLoginViewportChange);
            window.visualViewport?.removeEventListener("resize", host.onMobileLoginViewportChange);
            window.visualViewport?.removeEventListener("scroll", host.onMobileLoginViewportChange);
        }
        host.destroyMobileLoginInput();
        host.playerHealthBars.clear();
        try {
            host.overlayManager?.dispose();
            host.hitsplatTickUnsub?.();
            host.hitsplatTickUnsub = undefined;
        } catch {}
        host.overlayManager = undefined;
        host.interactHighlightOverlay = undefined;
        host.healthBarOverlay = undefined;
        host.tileMarkerOverlay = undefined;
        host.clearInteractHighlightActiveTarget();
        host.clearInteractHighlightHoverTarget();
        host.interactHighlightDrawTargets.length = 0;
        host.interactLocModelLoader = undefined;
        host.interactNpcModelLoader = undefined;
        host.npcHealthBars.clear();
        void host.osrsClient.workerPool.resetLoader(host.dataLoader).catch(() => {
            // The component-level worker pool may already be terminating during
            // HMR/unmount; renderer teardown must not surface that race as an
            // unhandled rejection.
        });

        host.quadArray?.delete();
        host.quadArray = undefined;

        host.quadPositions?.delete();
        host.quadPositions = undefined;

        // Uniforms
        host.sceneUniformBuffer?.delete();
        host.sceneUniformBuffer = undefined;

        // Framebuffers
        host.framebuffer?.delete();
        host.framebuffer = undefined;

        host.colorTarget?.delete();
        host.colorTarget = undefined;

        host.depthTarget?.delete();
        host.depthTarget = undefined;

        host.textureFramebuffer?.delete();
        host.textureFramebuffer = undefined;

        host.textureColorTarget?.delete();
        host.textureColorTarget = undefined;

        host.textureDepthTarget?.delete();
        host.textureDepthTarget = undefined;

        // Textures
        host.textureArray?.delete();
        host.textureArray = undefined;

        host.textureMaterials?.delete();
        host.textureMaterials = undefined;

        host.waterTextures?.delete();
        host.waterTextures = undefined;

        host.drawBackend?.dispose();
        host.drawBackend = undefined;

        // Unified actor texture cleanup handled by actorDataTextureBuffer below
        for (const texture of host.actorDataTextureBuffer) {
            texture?.delete();
        }

        host.clearMaps();
        host.disposeDynamicNpcAnimState();

        // Claim the pending batch before awaiting it. stop()/dispose() can make
        // multiple cleanup passes while initialization is still settling; only one
        // pass should own and delete the programs, and a failed shader compile must
        // not escape as an unhandled teardown rejection.
        const shadersPromise = host.shadersPromise;
        host.shadersPromise = undefined;
        if (shadersPromise) {
            try {
                for (const shader of await shadersPromise) {
                    try {
                        shader.delete();
                    } catch {}
                }
            } catch {}
        }
        clientDebugLog("Renderer cleaned up");
    
}
