import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";

import { LocModelType } from "@august/osrs-engine/config/loctype/LocModelType";
import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { isDoorLocType } from "@client/engine/rendering/loc/SceneLocs";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function onLocChange(host: WebGLOsrsRendererHost, 
        oldId: number,
        newId: number,
        tile: { x: number; y: number },
        level: number,
        opts?: {
            oldTile?: { x: number; y: number };
            newTile?: { x: number; y: number };
            oldRotation?: number;
            newRotation?: number;
            newShape?: number;
        },
    ): void {

        try {
            clientDebugLog(
                `[WebGLRenderer] Loc change: ${oldId} -> ${newId} at (${tile.x}, ${tile.y}, ${level})`,
            );

            const oldTile = opts?.oldTile ?? tile;
            const newTile = opts?.newTile;
            const oldLocType =
                (oldId | 0) > 0 ? host.osrsClient.locTypeLoader.load(oldId | 0) : undefined;
            const newLocType =
                (newId | 0) > 0 ? host.osrsClient.locTypeLoader.load(newId | 0) : undefined;
            const hasUnknownLocType =
                ((oldId | 0) > 0 && oldLocType === undefined) ||
                ((newId | 0) > 0 && newLocType === undefined);
            const oldIsDoor = oldLocType !== undefined && isDoorLocType(oldLocType);
            const newIsDoor = newLocType !== undefined && isDoorLocType(newLocType);
            // Keeping doors and ordinary locs in separate GPU groups lets us
            // match the game's partial loc-update behaviour. A change that
            // crosses those groups retains the conservative full rebuild.
            const isDoorOnlyUpdate =
                !hasUnknownLocType &&
                (oldId <= 0 || oldIsDoor) &&
                (newId <= 0 || newIsDoor) &&
                (oldIsDoor || newIsDoor);
            const isLocOnlyUpdate = !hasUnknownLocType && !oldIsDoor && !newIsDoor;
            const matchesChangedTile = (target: {
                tileX: number;
                tileY: number;
                plane: number;
            }): boolean => {
                if ((target.plane | 0) !== (level | 0)) return false;
                if (
                    (target.tileX | 0) === (oldTile.x | 0) &&
                    (target.tileY | 0) === (oldTile.y | 0)
                ) {
                    return true;
                }
                if (
                    newTile &&
                    (target.tileX | 0) === (newTile.x | 0) &&
                    (target.tileY | 0) === (newTile.y | 0)
                ) {
                    return true;
                }
                return false;
            };

            if (
                host.interactHighlightActiveTarget?.kind === "loc" &&
                matchesChangedTile(host.interactHighlightActiveTarget)
            ) {
                host.clearInteractHighlightActiveTarget();
            }
            if (
                host.interactHighlightHoverTarget?.kind === "loc" &&
                matchesChangedTile(host.interactHighlightHoverTarget)
            ) {
                host.clearInteractHighlightHoverTarget();
            }
            const overrideRotation =
                typeof opts?.newRotation === "number" ? opts.newRotation & 0x3 : undefined;

            const spawnKey = `${oldTile.x | 0},${oldTile.y | 0},${level | 0}`;
            const existingSpawn = host.locSpawns.get(spawnKey);
            // Use locSpawns for: locs spawned on empty ground (oldId===0) or ongoing lifecycle of a spawned loc
            const isSpawnedLoc =
                (oldId | 0) === 0 ||
                (existingSpawn !== undefined && existingSpawn.id === (oldId | 0));

            const clearOverridesAtTile = (tileX: number, tileY: number): void => {
                const keyPrefix = `${tileX | 0},${tileY | 0},${level},`;
                for (const key of Array.from(host.locOverrides.keys())) {
                    if (key.startsWith(keyPrefix)) {
                        host.locOverrides.delete(key);
                    }
                }
            };
            clearOverridesAtTile(oldTile.x, oldTile.y);
            if (newTile) {
                clearOverridesAtTile(newTile.x, newTile.y);
            }

            if (isSpawnedLoc) {
                // Manage via locSpawns
                if ((newId | 0) === 0) {
                    host.locSpawns.delete(spawnKey);
                } else {
                    // Use the shape from the server (matches loc_add_change_v2 OSRS packet),
                    // or inherit from the existing spawn, or default to NORMAL (10).
                    const spawnType =
                        typeof opts?.newShape === "number"
                            ? (opts.newShape as LocModelType)
                            : (existingSpawn?.type ?? LocModelType.NORMAL);
                    host.locSpawns.set(spawnKey, {
                        id: newId | 0,
                        type: spawnType,
                        rotation: overrideRotation ?? 0,
                    });
                }
            } else {
                // Regular map loc override
                const overrideKey = `${oldTile.x},${oldTile.y},${level},${oldId}`;
                host.locOverrides.set(overrideKey, {
                    newId: newId | 0,
                    newRotation: overrideRotation,
                    moveToX:
                        newTile &&
                        ((newTile.x | 0) !== (oldTile.x | 0) || (newTile.y | 0) !== (oldTile.y | 0))
                            ? newTile.x | 0
                            : undefined,
                    moveToY:
                        newTile &&
                        ((newTile.x | 0) !== (oldTile.x | 0) || (newTile.y | 0) !== (oldTile.y | 0))
                            ? newTile.y | 0
                            : undefined,
                });
            }

            if (host.instanceActive) {
                // The resident instance is one expanded, transformed scene.
                // Loading a normal 64x64 loc payload here can partially apply
                // untransformed overworld geometry over it. Rebuild from the
                // updated locSpawns/locOverrides snapshot transactionally.
                host.scheduleInstanceLocRebuild();
                clientDebugLog("Refreshing active instance via loc scene rebuild");
                return;
            }

            // Moving locs can cross map-square boundaries (e.g., edge gates).
            // Reload both affected map squares so moved geometry can appear on the new side.
            const oldMapX = Math.floor(oldTile.x / 64);
            const oldMapY = Math.floor(oldTile.y / 64);
            const newMapX = Math.floor((newTile?.x ?? oldTile.x) / 64);
            const newMapY = Math.floor((newTile?.y ?? oldTile.y) / 64);
            const mapKeys = new Set<string>([`${oldMapX}:${oldMapY}`, `${newMapX}:${newMapY}`]);

            for (const mapKey of mapKeys) {
                const [mxRaw, myRaw] = mapKey.split(":");
                const mx = Number(mxRaw) | 0;
                const my = Number(myRaw) | 0;
                const mapId = getMapSquareId(mx, my);
                if (
                    isDoorOnlyUpdate &&
                    !host.pendingLocUpdates.has(mapId) &&
                    !host.pendingLocGeometryUpdates.has(mapId)
                ) {
                    host.pendingDoorLocUpdates.add(mapId);
                } else if (
                    isLocOnlyUpdate &&
                    !host.pendingLocUpdates.has(mapId) &&
                    !host.pendingDoorLocUpdates.has(mapId)
                ) {
                    host.pendingLocGeometryUpdates.add(mapId);
                } else {
                    host.pendingLocUpdates.add(mapId);
                    host.pendingLocGeometryUpdates.delete(mapId);
                    host.pendingDoorLocUpdates.delete(mapId);
                }
                host.scheduleLocReload(mx, my);
            }

            const mapSummary = [...mapKeys]
                .map((entry) => {
                    const [mxRaw, myRaw] = entry.split(":");
                    return `(${Number(mxRaw) | 0}, ${Number(myRaw) | 0})`;
                })
                .join(", ");
            clientDebugLog(`Refreshing map square(s) ${mapSummary} via loc geometry refresh`);
        } catch (err) {
            console.warn("onLocChange error", err);
        }
    
}

export function getExtraLocsForMap(host: WebGLOsrsRendererHost, 
        mapX: number,
        mapY: number,
    ):
        | Array<{
        id: number;
        x: number;
        y: number;
        level: number;
        shape: number;
        rotation: number;
    }>
        | undefined {

        if (host.addedLocs.size === 0) return undefined;
        const minX = mapX * 64;
        const minY = mapY * 64;
        const maxX = minX + 64;
        const maxY = minY + 64;
        const locs: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }> = [];
        for (const loc of host.addedLocs.values()) {
            if (loc.x >= minX && loc.x < maxX && loc.y >= minY && loc.y < maxY) {
                locs.push({
                    id: loc.locId,
                    x: loc.x,
                    y: loc.y,
                    level: loc.level,
                    shape: loc.shape,
                    rotation: loc.rotation,
                });
            }
        }
        return locs.length > 0 ? locs : undefined;
    
}

export function scheduleLocGeometryUpdate(host: WebGLOsrsRendererHost, 
        mapX: number,
        mapY: number,
        group: "loc" | "door" | "full",
    ): void {

        const mapId = getMapSquareId(mapX, mapY);
        if (
            group === "door" &&
            !host.pendingLocUpdates.has(mapId) &&
            !host.pendingLocGeometryUpdates.has(mapId)
        ) {
            host.pendingDoorLocUpdates.add(mapId);
        } else if (
            group === "loc" &&
            !host.pendingLocUpdates.has(mapId) &&
            !host.pendingDoorLocUpdates.has(mapId)
        ) {
            host.pendingLocGeometryUpdates.add(mapId);
        } else {
            host.pendingLocUpdates.add(mapId);
            host.pendingLocGeometryUpdates.delete(mapId);
            host.pendingDoorLocUpdates.delete(mapId);
        }
        host.scheduleLocReload(mapX, mapY);
    
}

export function onLocAddChange(host: WebGLOsrsRendererHost, 
        locId: number,
        tile: { x: number; y: number },
        level: number,
        shape: number,
        rotation: number,
    ): void {

        try {
            const key = `${tile.x},${tile.y},${level},${shape}`;
            host.addedLocs.set(key, { locId, x: tile.x, y: tile.y, level, shape, rotation });

            // Suppress the base cache-baked loc at this tile so it doesn't
            // keep rendering alongside (or instead of) the new one - buildScene
            // has no other way to know a cache loc was replaced/removed.
            host.locOverrides.set(`${tile.x | 0},${tile.y | 0},${level | 0},-1`, {
                newId: 0,
                matchType: shape as LocModelType,
            });

            const mapX = Math.floor(tile.x / 64);
            const mapY = Math.floor(tile.y / 64);
            if (host.instanceActive) {
                // In instance mode, schedule a deferred instance scene rebuild
                // that includes the new loc via extraLocs.
                host.scheduleInstanceLocRebuild();
            } else {
                const locType = host.osrsClient.locTypeLoader.load(locId | 0);
                host.scheduleLocGeometryUpdate(
                    mapX,
                    mapY,
                    locType && isDoorLocType(locType) ? "door" : "loc",
                );
            }
            clientDebugLog(
                `[WebGLRenderer] Loc add: ${locId} at (${tile.x}, ${tile.y}, ${level}) shape=${shape} -> map (${mapX}, ${mapY})`,
            );
        } catch (err) {
            console.warn("onLocAddChange error", err);
        }
    
}
