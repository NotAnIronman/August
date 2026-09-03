
import { clamp } from "@august/game-model/math/MathUtil";
import { computeRoofPlaneLimit } from "@client/engine/game/roof/RoofVisibility";
import {
    resolveBridgePromotedPlane
} from "@client/engine/game/scene/PlaneResolver";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function getControlledPlayerEcsIndex(host: WebGLOsrsRendererHost, ): number | undefined {

        const playerEcs = host.osrsClient.playerEcs;
        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;

        if (controlledServerId > 0) {
            try {
                const controlledIndex = playerEcs.getIndexForServerId(controlledServerId);
                if (controlledIndex !== undefined) {
                    return controlledIndex | 0;
                }
            } catch {}
        }

        try {
            const size = playerEcs.size?.() ?? (playerEcs as any).size?.() ?? 0;
            if (size > 0) {
                return 0;
            }
        } catch {}

        return undefined;
    
}

export function getPlayerBasePlane(host: WebGLOsrsRendererHost, ): number {

        let rawPlane = 0;
        const idx = host.getControlledPlayerEcsIndex();
        if (idx !== undefined) {
            rawPlane = host.osrsClient.playerEcs.getLevel(idx) | 0;
        }

        // If the plane above has the bridge flag, the player renders at that plane.
        const playerTile = host.getPlayerTileXY();
        if (!playerTile) {
            return rawPlane; // Can't check for bridges if we don't know the player's tile
        }

        return resolveBridgePromotedPlane(host.mapManager, rawPlane, playerTile);
    
}

export function getPlayerRawPlane(host: WebGLOsrsRendererHost, ): number {

        const idx = host.getControlledPlayerEcsIndex();
        if (idx !== undefined) return host.osrsClient.playerEcs.getLevel(idx) | 0;
        return 0;
    
}

export function getPlayerTileXY(host: WebGLOsrsRendererHost, ): { x: number; y: number } {

        const controlledIndex = host.getControlledPlayerEcsIndex();
        if (controlledIndex !== undefined) {
            return {
                x: (host.osrsClient.playerEcs.getX(controlledIndex) / 128) | 0,
                y: (host.osrsClient.playerEcs.getY(controlledIndex) / 128) | 0,
            };
        }
        // Fallback to camera tile if no player
        return {
            x: Math.floor(host.osrsClient.camera.getPosX()),
            y: Math.floor(host.osrsClient.camera.getPosZ()),
        };
    
}

export function getCameraTileXY(host: WebGLOsrsRendererHost, ): { x: number; y: number } {

        return {
            x: Math.floor(host.osrsClient.camera.getPosX()),
            y: Math.floor(host.osrsClient.camera.getPosZ()),
        };
    
}

export function clampCullTileToGridBounds(host: WebGLOsrsRendererHost, tile: { x: number; y: number }): { x: number; y: number } {

        const bounds = host.mapManager.getGridTileBounds();
        if (!bounds) {
            return { x: tile.x | 0, y: tile.y | 0 };
        }
        const minX = bounds.minX | 0;
        const minY = bounds.minY | 0;
        // Grid bounds use exclusive max edge in world tiles.
        const maxX = Math.max(minX, (bounds.maxX | 0) - 1);
        const maxY = Math.max(minY, (bounds.maxY | 0) - 1);
        return {
            x: Math.max(minX, Math.min(maxX, tile.x | 0)),
            y: Math.max(minY, Math.min(maxY, tile.y | 0)),
        };
    
}

export function getRenderCullTile(host: WebGLOsrsRendererHost, ): { x: number; y: number } {

        // Scene draw-distance is camera-anchored, then clamped to the loaded grid bounds.
        return host.clampCullTileToGridBounds(host.getCameraTileXY());
    
}

export function getRoofTargetTile(host: WebGLOsrsRendererHost, 
        playerTile: { x: number; y: number },
        cameraTile: { x: number; y: number },
    ): { x: number; y: number } {

        // In follow mode the camera focal point tracks the player tile. In free-camera
        // mode there is no focal state, so the camera tile stands in for it.
        return host.osrsClient.followPlayerCamera ? playerTile : cameraTile;
    
}

export function getCameraPitchRs(host: WebGLOsrsRendererHost, ): number {

        const pitch = clamp(host.osrsClient.camera.pitch | 0, 0, 512);
        return 128 + Math.floor((pitch * 255) / 512);
    
}

export function computeFrameRoofPlaneLimit(host: WebGLOsrsRendererHost, ): number {

        const cameraTile = host.getCameraTileXY();
        const playerTile = host.getPlayerTileXY();

        return computeRoofPlaneLimit(host.mapManager, host.maxLevel, {
            playerRawPlane: host.getPlayerBasePlane() | 0,
            cameraPitch: host.getCameraPitchRs(),
            roofsHidden: host.osrsClient.roofsHidden,
            cameraTile,
            playerTile,
            targetTile: host.getRoofTargetTile(playerTile, cameraTile),
        });
    
}

export function getRoofPlaneLimit(host: WebGLOsrsRendererHost, ): number {

        if (host.roofPlaneLimit === undefined) {
            host.roofPlaneLimit = host.computeFrameRoofPlaneLimit();
        }
        return host.roofPlaneLimit;
    
}

export function invalidateRoofState(host: WebGLOsrsRendererHost, ): void {

        host.roofPlaneLimit = undefined;
    
}

export function getControlledPlayerWorldViewId(host: WebGLOsrsRendererHost, ): number {

        const idx = host.osrsClient.playerEcs.getIndexForServerId(
            host.osrsClient.controlledPlayerServerId,
        );
        return idx !== undefined ? host.osrsClient.playerEcs.getWorldViewId(idx) | 0 : -1;
    
}
