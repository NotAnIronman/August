
import { LocModelType } from "@august/osrs-engine/config/loctype/LocModelType";
import { getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { isDoorLocType } from "@client/engine/rendering/loc/SceneLocs";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function onLocDel(host: WebGLOsrsRendererHost, tile: { x: number; y: number }, level: number, shape: number, rotation: number): void {

        try {
            const key = `${tile.x},${tile.y},${level},${shape}`;
            host.addedLocs.delete(key);

            // Suppress the base cache-baked loc at this tile so a deregistered
            // object (e.g. a chopped tree) actually disappears - buildScene has
            // no other way to know a cache loc was removed.
            host.locOverrides.set(`${tile.x | 0},${tile.y | 0},${level | 0},-1`, {
                newId: 0,
                matchType: shape as LocModelType,
            });

            if (host.instanceActive) {
                // Instance geometry is an expanded transformed scene, not the
                // ordinary map square identified by this world tile. Rebuild
                // from the updated deletion snapshot through the coalesced
                // instance transaction instead of applying overworld loc data.
                host.scheduleInstanceLocRebuild();
                return;
            }

            const mapX = Math.floor(tile.x / 64);
            const mapY = Math.floor(tile.y / 64);
            // LOC_DEL does not carry an object id. Resolve it from the current
            // per-tile loc index so deletes can stay on the same partial path.
            const deletedLoc = host.getLocIdsAtTileAllLevels(tile.x, tile.y).find((loc) => {
                if ((loc.level | 0) !== (level | 0)) return false;
                const typeRot = loc.typeRot;
                return (
                    typeRot !== undefined &&
                    ((typeRot | 0) & 0x3f) === ((shape | 0) & 0x3f) &&
                    ((typeRot >> 6) & 0x3) === ((rotation | 0) & 0x3)
                );
            });
            const locType =
                deletedLoc && (deletedLoc.id | 0) > 0
                    ? host.osrsClient.locTypeLoader.load(deletedLoc.id | 0)
                    : undefined;
            host.scheduleLocGeometryUpdate(
                mapX,
                mapY,
                locType ? (isDoorLocType(locType) ? "door" : "loc") : "full",
            );
        } catch (err) {
            console.warn("onLocDel error", err);
        }
    
}

export function onLocAnim(host: WebGLOsrsRendererHost, 
        locId: number,
        tile: { x: number; y: number },
        level: number,
        shape: number,
        rotation: number,
        animId: number,
    ): void {

        try {
            if ((shape | 0) < 0) return;
            const exactKey = `${tile.x | 0},${tile.y | 0},${level | 0},${locId | 0}`;
            const matchKey = `${tile.x | 0},${tile.y | 0},${level | 0},-1`;
            for (const key of [exactKey, matchKey]) {
                const existingTimer = host.locAnimTimers.get(key);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                    host.locAnimTimers.delete(key);
                }
            }

            if (
                host.interactHighlightActiveTarget?.kind === "loc" &&
                (host.interactHighlightActiveTarget.plane | 0) === (level | 0) &&
                (host.interactHighlightActiveTarget.tileX | 0) === (tile.x | 0) &&
                (host.interactHighlightActiveTarget.tileY | 0) === (tile.y | 0)
            ) {
                host.clearInteractHighlightActiveTarget();
            }
            if (
                host.interactHighlightHoverTarget?.kind === "loc" &&
                (host.interactHighlightHoverTarget.plane | 0) === (level | 0) &&
                (host.interactHighlightHoverTarget.tileX | 0) === (tile.x | 0) &&
                (host.interactHighlightHoverTarget.tileY | 0) === (tile.y | 0)
            ) {
                host.clearInteractHighlightHoverTarget();
            }

            host.locOverrides.set(exactKey, {
                newId: locId | 0,
                newRotation: rotation & 0x3,
                seqId: animId | 0,
                seqRandomStart: false,
            });
            host.locOverrides.set(matchKey, {
                newId: -1,
                newRotation: rotation & 0x3,
                seqId: animId | 0,
                seqRandomStart: false,
                matchType: shape as LocModelType,
                matchRotation: rotation & 0x3,
            });
            host.reloadLocAnimationTile(tile, locId);

            const durationMs = host.getLocAnimationDurationMs(animId);
            const timer = setTimeout(() => {
                let changed = false;
                for (const key of [exactKey, matchKey]) {
                    const current = host.locOverrides.get(key);
                    if (
                        current &&
                        typeof current.seqId === "number" &&
                        (current.seqId | 0) === (animId | 0)
                    ) {
                        host.locOverrides.delete(key);
                        changed = true;
                    }
                    host.locAnimTimers.delete(key);
                }
                if (changed) {
                    host.reloadLocAnimationTile(tile, locId);
                }
            }, durationMs);
            host.locAnimTimers.set(exactKey, timer);
            host.locAnimTimers.set(matchKey, timer);
        } catch (err) {
            console.warn("onLocAnim error", err);
        }
    
}

export function reloadLocAnimationTile(host: WebGLOsrsRendererHost, tile: { x: number; y: number }, locId: number): void {

        const mapX = Math.floor((tile.x | 0) / 64);
        const mapY = Math.floor((tile.y | 0) / 64);
        if (host.instanceActive) {
            host.scheduleInstanceLocRebuild();
            return;
        }
        const locType = host.osrsClient.locTypeLoader.load(locId | 0);
        host.scheduleLocGeometryUpdate(
            mapX,
            mapY,
            locType && isDoorLocType(locType) ? "door" : "loc",
        );
    
}

export function getLocAnimationDurationMs(host: WebGLOsrsRendererHost, seqId: number): number {

        const fallbackMs = 2400;
        try {
            const seqType = host.osrsClient.seqTypeLoader.load(seqId | 0) as any;
            if (!seqType) return fallbackMs;
            let cycles = 0;
            const isSkeletal =
                (typeof seqType.isSkeletalSeq === "function" && seqType.isSkeletalSeq()) ||
                (seqType.skeletalId ?? -1) >= 0;
            if (isSkeletal) {
                const duration =
                    typeof seqType.getSkeletalDuration === "function"
                        ? seqType.getSkeletalDuration()
                        : 0;
                cycles = Math.max(1, duration | 0);
            } else if (Array.isArray(seqType.frameLengths)) {
                for (const frameLength of seqType.frameLengths) {
                    cycles += Math.max(1, Number(frameLength) | 0);
                }
            }
            if (!(cycles > 0)) return fallbackMs;
            return Math.max(600, Math.min(10000, cycles * 20 + 120));
        } catch {
            return fallbackMs;
        }
    
}

export function scheduleLocReload(host: WebGLOsrsRendererHost, mapX: number, mapY: number): void {

        const id = getMapSquareId(mapX, mapY);
        host.pendingLocReloadMaps.set(id, { mapX: mapX | 0, mapY: mapY | 0 });
        if (host.pendingLocReloadFlushTimer) return;
        const flush = () => {
            host.pendingLocReloadFlushTimer = undefined;
            if (host.pendingLocReloadMaps.size === 0) return;
            const batch = Array.from(host.pendingLocReloadMaps.values());
            host.pendingLocReloadMaps.clear();
            host.beginLocReloadBatch(batch);
        };
        host.pendingLocReloadFlushTimer = setTimeout(
            flush,
            RENDER_CONSTANTS.LOC_RELOAD_FLUSH_DELAY_MS,
        );
    
}
