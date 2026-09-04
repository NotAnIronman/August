
import { CollisionFlag } from "@august/game-model/collision/CollisionFlag";
import { clamp } from "@august/game-model/math/MathUtil";
import { Scene } from "@august/osrs-engine/scene/Scene";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function getCollisionFlagAt(host: WebGLOsrsRendererHost, level: number, tileX: number, tileY: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY) as any;
        if (!map || typeof (map as any).getCollisionFlag !== "function") {
            return CollisionFlag.OBJECT_ROUTE_BLOCKER;
        }
        const local = host.getMapLocalTile(map, tileX, tileY);
        if (!local) return CollisionFlag.OBJECT_ROUTE_BLOCKER;
        return (map as any).getCollisionFlag(level | 0, local.x, local.y) | 0;
    
}

export function getLocIdsAtTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number[] {

        try {
            const map = host.getPreferredMapForWorldTile(tileX, tileY) as any;
            if (!map || typeof (map as any).getLocIdsAtLocal !== "function") return [];
            const local = host.getMapLocalTile(map, tileX, tileY);
            if (!local) return [];
            const effPlane = host.getEffectivePlaneForTile(tileX, tileY, basePlane) | 0;
            return (map as any).getLocIdsAtLocal(effPlane, local.x, local.y) as number[];
        } catch {
            return [];
        }
    
}

export function getLocIdsAtTileAllLevels(host: WebGLOsrsRendererHost, 
        tileX: number,
        tileY: number,
    ): { id: number; level: number; typeRot?: number }[] {

        try {
            const map = host.getPreferredMapForWorldTile(tileX, tileY) as any;
            if (!map || typeof (map as any).getLocIdsAtLocal !== "function") return [];
            const local = host.getMapLocalTile(map, tileX, tileY);
            if (!local) return [];
            const out: { id: number; level: number; typeRot?: number }[] = [];
            for (let lvl = 0; lvl < 4; lvl++) {
                const ids = (map as any).getLocIdsAtLocal(lvl, local.x, local.y) as number[];
                const typeRots =
                    typeof (map as any).getLocTypeRotsAtLocal === "function"
                        ? ((map as any).getLocTypeRotsAtLocal(lvl, local.x, local.y) as number[])
                        : undefined;
                if (!ids) continue;
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i] | 0;
                    const typeRot =
                        typeRots && i < typeRots.length ? (typeRots[i] | 0) & 0xff : undefined;
                    out.push({ id, level: lvl | 0, typeRot });
                }
            }
            return out;
        } catch {
            return [];
        }
    
}

export function resolveLocInteractionTile(host: WebGLOsrsRendererHost, 
        locId: number,
        approx: { tileX: number; tileY: number; plane?: number },
    ): { tileX: number; tileY: number; plane?: number; typeRot?: number } {

        const basePlane = host.getPlayerBasePlane() | 0;
        const fallbackPlane =
            typeof approx.plane === "number" ? (approx.plane as number) | 0 : basePlane;
        const match = host.findNearestLocTile(locId, approx.tileX | 0, approx.tileY | 0, basePlane);
        if (match) {
            return match;
        }
        return {
            tileX: approx.tileX | 0,
            tileY: approx.tileY | 0,
            plane: fallbackPlane,
            typeRot: host.resolveLocTypeRotAtTile(
                locId | 0,
                approx.tileX | 0,
                approx.tileY | 0,
                fallbackPlane | 0,
            ),
        };
    
}

export function isLocalPlayerAdjacentToLoc(host: WebGLOsrsRendererHost, 
        locId: number,
        tile: { tileX: number; tileY: number },
    ): boolean {

        const playerTile = host.getLocalPlayerTile();
        if (!playerTile) return false;
        const size = host.getLocSize(locId | 0);
        if (!size) return false;
        const minX = tile.tileX | 0;
        const minY = tile.tileY | 0;
        const maxX = minX + Math.max(1, size.sizeX | 0) - 1;
        const maxY = minY + Math.max(1, size.sizeY | 0) - 1;
        const clampedX = clamp(playerTile.x | 0, minX, maxX);
        const clampedY = clamp(playerTile.y | 0, minY, maxY);
        const dx = Math.abs((playerTile.x | 0) - clampedX);
        const dy = Math.abs((playerTile.y | 0) - clampedY);
        return dx <= 1 && dy <= 1;
    
}

export function getLocalPlayerTile(host: WebGLOsrsRendererHost, ): { x: number; y: number } | undefined {

        const serverId = host.osrsClient.controlledPlayerServerId | 0;
        if (!(serverId >= 0)) return undefined;
        const state = host.osrsClient.playerMovementSync?.getState?.(serverId);
        if (!state) return undefined;
        return { x: state.tileX | 0, y: state.tileY | 0 };
    
}

export function getLocSize(host: WebGLOsrsRendererHost, locId: number): { sizeX: number; sizeY: number } | undefined {

        const loader: any = (host.osrsClient as any)?.locTypeLoader;
        if (!loader?.load) return undefined;
        try {
            const loc = loader.load(locId | 0);
            if (!loc) return undefined;
            const sizeX = Math.max(1, Number(loc.sizeX ?? 1));
            const sizeY = Math.max(1, Number(loc.sizeY ?? 1));
            return { sizeX, sizeY };
        } catch {
            return undefined;
        }
    
}

export function findNearestLocTile(host: WebGLOsrsRendererHost, 
        locId: number,
        tileX: number,
        tileY: number,
        basePlane: number,
        maxRadius: number = 8,
    ): { tileX: number; tileY: number; plane: number; typeRot?: number } | undefined {

        const targetId = locId | 0;
        for (let radius = 0; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const cx = tileX + dx;
                    const cy = tileY + dy;
                    const locs = host.getLocIdsAtTileAllLevels(cx, cy);
                    if (!locs.length) continue;
                    let bestPlane: number | undefined;
                    let bestTypeRot: number | undefined;
                    let bestScore = Number.POSITIVE_INFINITY;
                    for (const loc of locs) {
                        if ((loc.id | 0) !== targetId) continue;
                        const diff = Math.abs((loc.level | 0) - (basePlane | 0));
                        if (diff < bestScore) {
                            bestScore = diff;
                            bestPlane = loc.level | 0;
                            bestTypeRot =
                                typeof loc.typeRot === "number"
                                    ? (loc.typeRot | 0) & 0xff
                                    : undefined;
                        }
                    }
                    if (bestPlane !== undefined) {
                        return { tileX: cx, tileY: cy, plane: bestPlane, typeRot: bestTypeRot };
                    }
                }
            }
        }
        return undefined;
    
}

export function resolveLocTypeRotAtTile(host: WebGLOsrsRendererHost, 
        locId: number,
        tileX: number,
        tileY: number,
        plane: number,
    ): number | undefined {

        try {
            const tryMap = (map: any): number | undefined => {
                if (!map || typeof map.getLocIdsAtLocal !== "function") return undefined;
                if (typeof map.getLocTypeRotsAtLocal !== "function") return undefined;
                const local = host.getMapLocalTile(map, tileX, tileY);
                if (!local) return undefined;
                const level = Math.max(0, Math.min(Scene.MAX_LEVELS - 1, plane | 0));
                const ids = map.getLocIdsAtLocal(level, local.x, local.y) as number[];
                const typeRots = map.getLocTypeRotsAtLocal(level, local.x, local.y) as number[];
                for (let i = 0; i < ids.length; i++) {
                    if ((ids[i] | 0) !== (locId | 0)) continue;
                    if (i < typeRots.length) {
                        return (typeRots[i] | 0) & 0xff;
                    }
                    break;
                }
                return undefined;
            };
            // Check preferred map first, then fall back to all visible maps.
            const preferred = host.getPreferredMapForWorldTile(tileX, tileY);
            const result = tryMap(preferred);
            if (result !== undefined) return result;
            for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
                const map = host.mapManager.visibleMaps[i];
                if (map === preferred) continue;
                const r = tryMap(map);
                if (r !== undefined) return r;
            }
            return undefined;
        } catch {
            return undefined;
        }
    
}

export function updateCustomLabels(host: WebGLOsrsRendererHost, ): void {

        const labels = host.osrsClient.customLabels;
        const screens: { x: number; y: number; text: string }[] = [];
        const basePlane = host.getPlayerRawPlane() | 0;
        for (const label of labels) {
            const h = host.getApproxTileHeight(label.x + 0.5, label.y + 0.5, basePlane);
            const screen = host.worldToScreen(label.x + 0.5, h - 0.3, label.y + 0.5);
            if (screen) {
                screens.push({
                    x: screen[0],
                    y: screen[1],
                    text: label.text,
                });
            }
        }

        // Destination tile label now rendered via TileTextOverlay using bitmap font
        host.osrsClient.customLabelScreens = screens;
    
}
