import { mat4,vec3 } from "gl-matrix";

import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { Ray } from "@client/engine/game/math/Raycast";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function clearAllWorldEntities(host: WebGLOsrsRendererHost, ): void {

        for (const [entityIndex] of host.worldEntityOverlays) {
            const overlayMapX = 200 + entityIndex;
            const overlayMapY = 200 + entityIndex;
            const overlayMapId = getMapSquareId(overlayMapX, overlayMapY);
            host.mapManager.worldEntityMapIds.delete(overlayMapId);
            host.mapManager.loadingMapIds.delete(overlayMapId);
            host.mapManager.removeMap(overlayMapX, overlayMapY);
        }
        if (host.worldEntityLocRebuildTimer !== null) {
            clearTimeout(host.worldEntityLocRebuildTimer);
            host.worldEntityLocRebuildTimer = null;
        }
        host.worldEntityOverlays.clear();
        host.worldEntityLoadTokens.clear();
        host.worldEntityReloadAfterMs.clear();
        host.worldEntityAnimator?.clear();
        host.osrsClient.worldViewManager.clear();
    
}

export function getWorldEntityAdjustedTerrainRay(host: WebGLOsrsRendererHost, ray: Ray, map: WebGLMapSquare): Ray {

        const weTransform = host.getWorldEntityTransformForMap(map);
        if (weTransform === WebGLMapSquare.IDENTITY_MAT4) return ray;

        const viewMatrix = host.osrsClient.camera?.viewMatrix;
        if (!viewMatrix) return ray;

        const weInv = mat4.invert(mat4.create(), weTransform);
        if (!weInv) return ray;
        const viewInv = mat4.invert(mat4.create(), viewMatrix);
        if (!viewInv) return ray;

        const transformInv = mat4.create();
        mat4.multiply(transformInv, weInv, viewMatrix);
        mat4.multiply(transformInv, viewInv, transformInv);

        const newOrigin = vec3.transformMat4(vec3.create(), ray.origin, transformInv);
        const farPoint = vec3.scaleAndAdd(vec3.create(), ray.origin, ray.direction, 1.0);
        const newFar = vec3.transformMat4(vec3.create(), farPoint, transformInv);
        const newDir = vec3.subtract(vec3.create(), newFar, newOrigin);
        vec3.normalize(newDir, newDir);
        return new Ray(newOrigin, newDir);
    
}
