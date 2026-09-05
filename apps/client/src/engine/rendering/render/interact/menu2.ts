import { mat4,vec3,vec4 } from "gl-matrix";

import { MenuTargetType,OsrsMenuEntry } from "@august/osrs-engine/MenuEntry";
import { Ray } from "@client/engine/game/math/Raycast";
import {
    resolveGroundItemStackPlane
} from "@client/engine/game/scene/PlaneResolver";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function isBridgeSurfaceTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, plane: number): boolean {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (!map || typeof map.isBridgeSurface !== "function") return false;
        const local = host.getMapLocalTile(map, tileX, tileY);
        if (!local) {
            return false;
        }
        return map.isBridgeSurface(plane, local.x, local.y);
    
}

export function toCssEvent(host: WebGLOsrsRendererHost, 
        gx?: number,
        gy?: number,
        frameCount?: number,
    ): { clientX: number; clientY: number } | undefined {

        if (typeof gx !== "number" || typeof gy !== "number") return undefined;
        // Update cached rect once per frame (or first call)
        if (frameCount !== undefined && frameCount !== host.cachedCanvasRectFrame) {
            host.cachedCanvasRect = host.canvas.getBoundingClientRect();
            host.cachedCanvasRectFrame = frameCount;
        } else if (!host.cachedCanvasRect) {
            host.cachedCanvasRect = host.canvas.getBoundingClientRect();
        }
        const rect = host.cachedCanvasRect;
        host.cachedCssEventResult.clientX = rect.left + gx;
        host.cachedCssEventResult.clientY = rect.top + gy;
        return host.cachedCssEventResult;
    
}

export function isMouseInUIRegion(host: WebGLOsrsRendererHost, mx: number, my: number): boolean {

        return host.osrsClient.isPointOverWidget(mx, my);
    
}

export function screenToRay(host: WebGLOsrsRendererHost, mouseX: number, mouseY: number): Ray | null {

        if (!host.app || !host.osrsClient.camera?.viewProjMatrix) return null;

        const camera = host.osrsClient.camera;
        if (!camera.containsScreenPoint(mouseX, mouseY)) return null;
        const width = camera.screenWidth || host.app.width;
        const height = camera.screenHeight || host.app.height;
        if (width <= 0 || height <= 0) return null;

        // Normalize to NDC
        const nx = (2 * mouseX) / width - 1;
        const ny = 1 - (2 * mouseY) / height;

        // Unproject from NDC to world using inverse view-projection
        mat4.invert(host.tmpInvViewProj, camera.viewProjMatrix);
        host.tmpNear[0] = nx;
        host.tmpNear[1] = ny;
        host.tmpNear[2] = -1;
        host.tmpNear[3] = 1;
        host.tmpFar[0] = nx;
        host.tmpFar[1] = ny;
        host.tmpFar[2] = 1;
        host.tmpFar[3] = 1;
        vec4.transformMat4(host.tmpNear, host.tmpNear, host.tmpInvViewProj);
        vec4.transformMat4(host.tmpFar, host.tmpFar, host.tmpInvViewProj);

        // Perspective divide
        const nearW = host.tmpNear[3] || 1.0;
        const farW = host.tmpFar[3] || 1.0;
        host.tmpNear[0] /= nearW;
        host.tmpNear[1] /= nearW;
        host.tmpNear[2] /= nearW;
        host.tmpFar[0] /= farW;
        host.tmpFar[1] /= farW;
        host.tmpFar[2] /= farW;

        // Create ray
        const origin = vec3.fromValues(host.tmpNear[0], host.tmpNear[1], host.tmpNear[2]);
        const farPos = vec3.fromValues(host.tmpFar[0], host.tmpFar[1], host.tmpFar[2]);
        const direction = vec3.create();
        vec3.subtract(direction, farPos, origin);
        vec3.normalize(direction, direction);

        return new Ray(origin, direction);
    
}

export function appendGroundItemMenuEntries(host: WebGLOsrsRendererHost, 
        menuEntries: OsrsMenuEntry[],
        examineEntries: OsrsMenuEntry[],
    ): void {

        const focusTile = host.osrsClient.menuTile ?? host.osrsClient.hoveredTile;
        if (!focusTile) return;
        // Ground item stacks are stored on the raw client plane even when bridge tiles render above it.
        const plane = resolveGroundItemStackPlane(host.getPlayerRawPlane() | 0);
        const stacks = host.osrsClient.getGroundItemsAt(
            focusTile.tileX | 0,
            focusTile.tileY | 0,
            plane | 0,
        );
        if (!stacks || stacks.length === 0) return;
        for (const stack of stacks) {
            const label = stack.quantity > 1 ? `${stack.name} x ${stack.quantity}` : stack.name;
            const tile = {
                tileX: stack.tile.x | 0,
                tileY: stack.tile.y | 0,
                plane: stack.tile.level | 0,
            };
            menuEntries.push({
                option: "Take",
                targetId: stack.itemId,
                targetType: MenuTargetType.OBJ,
                targetName: label,
                targetLevel: stack.tile.level | 0,
                tile,
                onClick: () => host.osrsClient.takeGroundItem(stack),
            });
            examineEntries.push({
                option: "Examine",
                targetId: stack.itemId,
                targetType: MenuTargetType.OBJ,
                targetName: stack.name,
                targetLevel: stack.tile.level | 0,
                tile,
                onClick: () => host.osrsClient.examineGroundItem(stack),
            });
        }
    
}
