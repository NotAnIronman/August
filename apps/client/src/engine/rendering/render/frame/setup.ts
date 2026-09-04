
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function clearSceneFramebuffer(host: WebGLOsrsRendererHost, viewportRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    }): void {

        host.app.clearColor(0.0, 0.0, 0.0, 1.0);
        host.app.clear();

        const left = Math.max(0, viewportRect.x | 0);
        const top = Math.max(0, viewportRect.y | 0);
        const right = Math.min(
            host.sceneRenderWidth | 0,
            (viewportRect.x + viewportRect.width) | 0,
        );
        const bottom = Math.min(
            host.sceneRenderHeight | 0,
            (viewportRect.y + viewportRect.height) | 0,
        );
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        if (width <= 0 || height <= 0) {
            return;
        }

        host.gl.enable(host.gl.SCISSOR_TEST);
        host.gl.scissor(left, (host.sceneRenderHeight | 0) - bottom, width, height);
        host.gl.clearColor(host.skyColor[0], host.skyColor[1], host.skyColor[2], host.skyColor[3]);
        host.gl.clear(host.gl.COLOR_BUFFER_BIT | host.gl.DEPTH_BUFFER_BIT);
        host.gl.disable(host.gl.SCISSOR_TEST);
    
}

export function updateHoveredTile(host: WebGLOsrsRendererHost, ): void {

        const input = host.osrsClient.inputManager;
        if (!host.osrsClient.hoverOverlayEnabled) {
            host.hoverTileX = -1;
            host.hoverTileY = -1;
            host.osrsClient.hoveredTile = undefined;
            host.osrsClient.hoveredTileScreen = undefined;
            return;
        }
        if (input.isPointerLock()) {
            host.hoverTileX = -1;
            host.hoverTileY = -1;
            host.osrsClient.hoveredTile = undefined;
            host.osrsClient.hoveredTileScreen = undefined;
            return;
        }
        // While the context menu is visible, lock hover to the right-click position
        const useMenuAnchor = !!host.osrsClient.menuOpen;

        const mouseX = useMenuAnchor ? host.osrsClient.menuX : input.mouseX;
        const mouseY = useMenuAnchor ? host.osrsClient.menuY : input.mouseY;
        if ((mouseX === -1 || mouseY === -1) && !useMenuAnchor) {
            host.hoverTileX = -1;
            host.hoverTileY = -1;
            host.osrsClient.hoveredTile = undefined;
            host.osrsClient.hoveredTileScreen = undefined;
            return;
        }
        if (!host.osrsClient.camera.containsScreenPoint(mouseX, mouseY)) {
            host.hoverTileX = -1;
            host.hoverTileY = -1;
            host.osrsClient.hoveredTile = undefined;
            host.osrsClient.hoveredTileScreen = undefined;
            return;
        }

        const resolved = host.computeTileAt(mouseX, mouseY);
        if (!resolved) {
            host.hoverTileX = -1;
            host.hoverTileY = -1;
            host.osrsClient.hoveredTile = undefined;
            host.osrsClient.hoveredTileScreen = undefined;
            return;
        }
        const tileX = resolved.tileX;
        const tileY = resolved.tileY;
        const effPlane = resolved.plane;
        host.hoverTileX = tileX;
        host.hoverTileY = tileY;

        // Update screen-space label position using tile center
        const centerX = tileX + 0.5;
        const centerY = tileY + 0.5;
        // Use exact plane height without promotion to match the tile we resolved
        const centerWorldY = host.sampleHeightAtExactPlane(centerX, centerY, effPlane);
        const screen = host.worldToScreen(centerX, centerWorldY - 0.1, centerY); // small offset up
        if (screen) {
            host.osrsClient.hoveredTile = { tileX, tileY, plane: effPlane };
            host.osrsClient.hoveredTileScreen = {
                x: screen[0],
                y: screen[1],
            };
        } else {
            host.osrsClient.hoveredTile = undefined;
            host.osrsClient.hoveredTileScreen = undefined;
        }
    
}
