
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function toGLClickXY(host: WebGLOsrsRendererHost, evt?: MouseEvent): { sx: number; sy: number } {

        if (evt) {
            const rect = host.canvas.getBoundingClientRect();
            const cx = Math.max(0, Math.min(rect.width, evt.clientX - rect.left));
            const cy = Math.max(0, Math.min(rect.height, evt.clientY - rect.top));
            return {
                sx: cx | 0,
                sy: cy | 0,
            };
        }
        // Prefer pinned menu anchor; else current mouse position
        // These values are already in canvas coordinates from InputManager.
        const px =
            host.osrsClient.menuOpen && host.osrsClient.menuX >= 0
                ? host.osrsClient.menuX
                : host.osrsClient.inputManager.leftClickX !== -1
                    ? host.osrsClient.inputManager.leftClickX
                    : host.osrsClient.inputManager.mouseX;
        const py =
            host.osrsClient.menuOpen && host.osrsClient.menuY >= 0
                ? host.osrsClient.menuY
                : host.osrsClient.inputManager.leftClickY !== -1
                    ? host.osrsClient.inputManager.leftClickY
                    : host.osrsClient.inputManager.mouseY;
        return { sx: px | 0, sy: py | 0 };
    
}
