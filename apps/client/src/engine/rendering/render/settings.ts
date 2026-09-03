
import { profiler } from "@client/engine/rendering/PerformanceProfiler";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function setSkyColor(host: WebGLOsrsRendererHost, r: number, g: number, b: number) {

        host.skyColor[0] = r / 255;
        host.skyColor[1] = g / 255;
        host.skyColor[2] = b / 255;
    
}

export function setSceneHslOverride(host: WebGLOsrsRendererHost, hue: number, sat: number, lum: number, amount: number): void {

        host.sceneHslOverride[0] = hue;
        host.sceneHslOverride[1] = sat;
        host.sceneHslOverride[2] = lum;
        host.sceneHslOverride[3] = amount;
    
}

export function setSceneHslOverrideFromPacked(host: WebGLOsrsRendererHost, packedHsl: number, amount: number): void {

        const hue = (packedHsl >> 10) & 63;
        const sat = (packedHsl >> 7) & 7;
        const lum = packedHsl & 127;
        host.setSceneHslOverride(hue, sat, lum, amount);
    
}

export function clearSceneHslOverride(host: WebGLOsrsRendererHost, ): void {

        host.sceneHslOverride[0] = -1;
        host.sceneHslOverride[1] = -1;
        host.sceneHslOverride[2] = -1;
        host.sceneHslOverride[3] = 0;
    
}

export function setSmoothTerrain(host: WebGLOsrsRendererHost, enabled: boolean): void {

        const normalized = !!enabled;
        const effectiveSmoothTerrain =
            host.instanceScenePendingSettings?.smoothTerrain ?? host.smoothTerrain;
        if (effectiveSmoothTerrain === normalized) return;

        if (host.instanceActive) {
            host.requestInstanceSceneSettingsRebuild(
                normalized,
                host.instanceScenePendingSettings?.loadNpcs ?? host.loadNpcs,
            );
            return;
        }

        host.smoothTerrain = normalized;
        host.clearMaps();
    
}

export function setMsaa(host: WebGLOsrsRendererHost, enabled: boolean): void {

        const updated = host.msaaEnabled !== enabled;
        host.msaaEnabled = enabled;
        if (updated) {
            host.needsFramebufferUpdate = true;
        }
    
}

export function setFxaa(host: WebGLOsrsRendererHost, enabled: boolean): void {

        host.fxaaEnabled = enabled;
    
}

export function finishRenderFrame(host: WebGLOsrsRendererHost, 
        camera: any,
        deltaTime: number,
        showDebugTimer: boolean,
        profileGpuTimer: boolean,
    ): void {

        profiler.endFrame(deltaTime);

        // Resource accounting walks every resident map buffer. It is diagnostic
        // work, so keep it entirely out of the normal gameplay hot path.
        if (host.osrsClient.hoverOverlayEnabled || profileGpuTimer) {
            let geoBytes = 0;
            for (const map of host.mapManager.mapSquares.values()) {
                geoBytes += (map.interleavedBuffer as any)?.byteLength ?? 0;
                geoBytes += (map.indexBuffer as any)?.byteLength ?? 0;
            }
            try {
                const pr: any = host.playerRenderer as any;
                const vbo = pr.getInterleavedBuffer?.();
                const ibo = pr.getIndexBuffer?.();
                if (vbo) geoBytes += (vbo as any).byteLength ?? 0;
                if (ibo) geoBytes += (ibo as any).byteLength ?? 0;
            } catch {}
            host.stats.geometryGpuBytes = geoBytes;
        }

        host.stats.texturesLoaded = host.loadedTextureIds.size;
        host.stats.texturesTotal = host.textureIds.length;
        host.stats.width = host.app.width | 0;
        host.stats.height = host.app.height | 0;
        host.stats.sceneWidth = host.sceneRenderWidth | 0;
        host.stats.sceneHeight = host.sceneRenderHeight | 0;

        host.stats.cameraPosX = camera.getPosX();
        host.stats.cameraPosY = camera.getPosY();
        host.stats.cameraPosZ = camera.getPosZ();
        host.stats.cameraPitchRS = camera.pitch | 0;
        host.stats.cameraYawRS = camera.getYaw() | 0;
        host.stats.cameraRollRS = 0;

        const debugPlayerIndex = host.getControlledPlayerEcsIndex();
        if (debugPlayerIndex !== undefined) {
            host.stats.playerTileX = (host.osrsClient.playerEcs.getX(debugPlayerIndex) / 128) | 0;
            host.stats.playerTileY = (host.osrsClient.playerEcs.getY(debugPlayerIndex) / 128) | 0;
            host.stats.playerLevel = host.osrsClient.playerEcs.getLevel(debugPlayerIndex) | 0;
        }

        if ((showDebugTimer || profileGpuTimer) && host.timer.ready()) {
            profiler.recordGpuTime(host.timer.gpuTime);
        }

        if (showDebugTimer && host.timer.ready()) {
            host.osrsClient.debugText = `Frame Time GL: ${host.timer.gpuTime.toFixed(
                2,
            )}ms\n JS: ${host.timer.cpuTime.toFixed(2)}ms`;
        }
    
}

export function setLoadNpcs(host: WebGLOsrsRendererHost, enabled: boolean): void {

        const normalized = !!enabled;
        const effectiveLoadNpcs = host.instanceScenePendingSettings?.loadNpcs ?? host.loadNpcs;
        if (effectiveLoadNpcs === normalized) return;

        if (host.instanceActive) {
            host.requestInstanceSceneSettingsRebuild(
                host.instanceScenePendingSettings?.smoothTerrain ?? host.smoothTerrain,
                normalized,
            );
            return;
        }

        host.loadNpcs = normalized;
        host.clearMaps();
    
}

export function onResize(host: WebGLOsrsRendererHost, width: number, height: number): void {

        try {
            // Guard against resize before init
            if (!host.app) {
                return;
            }

            host.app.resize(width, height);

            // Explicitly update app dimensions in case PicoGL doesn't
            (host.app as any).width = width;
            (host.app as any).height = height;

            // Sync widgetManager dimensions with the current UI layout space.
            const uiMetrics = host.computeUiRenderMetrics(width, height);
            host.osrsClient?.widgetManager?.resize(uiMetrics.layoutW, uiMetrics.layoutH);

            // All in-world overlays render in buffer pixel space, so their scale must match
            // renderScaleX (uiScale × DPR) so sprites/text appear the correct physical size.
            const overlayScale = uiMetrics.renderScaleX;
            if (host.overheadTextOverlay) host.overheadTextOverlay.scale = overlayScale;
            if (host.hitsplatOverlay) host.hitsplatOverlay.scale = overlayScale;
            if (host.healthBarOverlay) {
                host.healthBarOverlay.scale =
                    overlayScale * RENDER_CONSTANTS.HEALTH_BAR_VISUAL_SCALE;
            }
            if (host.clickCrossOverlay) host.clickCrossOverlay.scale = overlayScale;
            if (host.groundItemOverlay) host.groundItemOverlay.scale = overlayScale;
            (host.canvas as any).__uiRenderScale = overlayScale;

            // Trigger framebuffer recreation
            host.needsFramebufferUpdate = true;

            host.initTextureFramebuffer(width, height);
        } catch (e) {
            console.warn("[webgl] onResize error", e);
        }
    
}
