
import { GameRenderer } from "@client/engine/rendering/core/GameRenderer";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function initCache(host: WebGLOsrsRendererHost, ): void {

        GameRenderer.prototype.initCache.call(host);
        if (host.app) {
            host.initTextures();
            // Re-initialize player geometry now that textures are loaded
            // (initial attempt in init() fails because textures aren't ready yet)
            host.playerRenderer.initGeometry().catch((e) => {
                console.warn("Failed to reinit player geometry after initCache", e);
            });

            // Re-initialize DynamicNpcAnimLoader now that loaders are ready
            // (initial attempt in init() fails because loaders aren't set up yet)
            host.initDynamicNpcAnimLoader();
        }
    
}
