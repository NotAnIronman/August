
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function initOverlays(host: WebGLOsrsRendererHost, ): void {

        if (!host.app || !host.sceneUniformBuffer) return;
        const initArgs = { app: host.app, sceneUniforms: host.sceneUniformBuffer };
        try {
            host.hitsplatOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init hitsplat overlay", e);
        }
        try {
            host.healthBarOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init health bar overlay", e);
        }
        try {
            host.overheadTextOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init overhead text overlay", e);
        }
        try {
            host.overheadPrayerOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init overhead prayer overlay", e);
        }
        try {
            host.clickCrossOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init click cross overlay", e);
        }
        try {
            host.tileTextOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init tile text overlay", e);
        }
        try {
            host.groundItemOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init ground item overlay", e);
        }
        try {
            host.interactHighlightOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init interact highlight overlay", e);
        }
        try {
            host.objectIdOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init object id overlay", e);
        }
        try {
            host.widgetsOverlay?.init(initArgs);
        } catch (e) {
            console.warn("Failed to init widgets overlay", e);
        }
        // Initialize ItemIconRenderer if loaders are now available
        try {
            const objLoader = host.osrsClient.objTypeLoader;
            const modelLoader = host.osrsClient.modelLoader;
            const textureLoader = host.osrsClient.textureLoader;
            if (objLoader && modelLoader && textureLoader && !host.itemIconRenderer) {
                import("@client/ui/runtime/item/ItemIconRenderer").then(({ ItemIconRenderer }) => {
                    if (!host.itemIconRenderer) {
                        host.itemIconRenderer = new ItemIconRenderer(
                            objLoader,
                            modelLoader,
                            textureLoader,
                            host.osrsClient.cacheSystem,
                        );
                    }
                });
            }
        } catch (e) {
            console.warn("Failed to init item icon renderer", e);
        }
    
}
