
import { getMapIndexFromTile } from "@august/osrs-engine/map/MapFileIndex";
import {
    resolveCollisionSamplePlaneForLocal
} from "@client/engine/game/scene/PlaneResolver";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function tickPass(host: WebGLOsrsRendererHost, 
        time: number,
        ticksElapsed: number,
        clientTicksElapsed: number,
        clientCycle: number,
    ): void {

        const seqFrameLoader = host.osrsClient.seqFrameLoader;

        host.actorRenderCount = 0;

        // Core client-cycle ticking is handled by OsrsClient's tick loop so it continues even when
        // rendering is throttled (e.g., alt-tab/background). This pass is render-focused only.

        // Reuse buffers instead of allocating new arrays each frame
        const visibleMaps = host.visibleMapsBuffer;
        visibleMaps.length = 0;

        host.gfxManager?.resetWorldBindings?.();
        // PERF: Use cached callback to avoid per-frame closure allocation
        // Throttle ambient sound collection to reduce tick cost
        host.ambientSoundFrameCounter++;
        const shouldCollectAmbient =
            host.ambientSoundFrameCounter >= RENDER_CONSTANTS.AMBIENT_SOUND_THROTTLE_FRAMES;
        if (shouldCollectAmbient) {
            host.ambientSoundFrameCounter = 0;
            // Reset only on collect frames; between collects the previous
            // instances stay live so volumes keep tracking the listener
            host.ambientSoundBufferIndex = 0;
        }
        for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
            const map = host.mapManager.visibleMaps[i];
            visibleMaps.push(map);

            for (const loc of map.locsAnimated) {
                // DynamicObject/loc animation timing is based on Client.cycle (20ms each).
                loc.update(seqFrameLoader, clientCycle | 0, host.seqSoundCallback);
            }

            // Collect ambient sounds only every N frames (throttled)
            if (shouldCollectAmbient) {
                host.collectAmbientSounds(map);
            }

            host._ecsUpdateNpcClient(map, clientTicksElapsed);
            host._ecsUpdatePlayerOccupancy(map);

            // ECS is authoritative; legacy sync removed

            // Fully clear per-map actor offset rings to avoid any stale indices leaking
            for (let r = 0; r < map.playerDataTextureOffsets.length; r++)
                map.playerDataTextureOffsets[r] = -1;
            for (let r = 0; r < map.npcDataTextureOffsets.length; r++)
                map.npcDataTextureOffsets[r] = -1;
            for (let r = 0; r < map.worldGfxDataTextureOffsets.length; r++)
                map.worldGfxDataTextureOffsets[r] = -1;

            host.addNpcRenderData(map);
            host.addPlayerRenderData(map);
            host.addProjectileRenderData(map);
            host.addWorldGfxRenderData(map);
        }

        // A server spawn reaches ECS before its asynchronous map batch rebuild.
        // Give those NPCs actor-data slots immediately so the dynamic fallback
        // pass can draw them during that gap.
        host.addUnbatchedNpcRenderData();

        host.worldEntityAnimator?.tick(clientCycle);
        host.osrsClient.worldViewManager.interpolateEntities(clientCycle, host.clientTickPhase);

        // Propagate listener position for positional audio and advance ambient loops.
        const soundSystem = host.osrsClient.soundEffectSystem;
        if (soundSystem) {
            try {
                const peListener = host.osrsClient.playerEcs;
                const idxListener = peListener.getIndexForServerId(
                    host.osrsClient.controlledPlayerServerId,
                );
                if (idxListener !== undefined) {
                    const px = peListener.getX(idxListener) | 0;
                    const py = peListener.getY(idxListener) | 0;
                    const level = peListener.getLevel(idxListener) | 0;
                    soundSystem.updateListenerPosition(px, py, level * 128);
                } else {
                    // z is the listener plane (level * 128), not a world height
                    soundSystem.updateListenerPosition(
                        host.osrsClient.camera.getPosX() * 128,
                        host.osrsClient.camera.getPosZ() * 128,
                        0,
                    );
                }
            } catch {
                soundSystem.updateListenerPosition(
                    host.osrsClient.camera.getPosX() * 128,
                    host.osrsClient.camera.getPosZ() * 128,
                    0,
                );
            }
            // Truncate the buffer only on collect frames; the update itself
            // runs every frame so volumes track the listener continuously
            if (shouldCollectAmbient) {
                host.ambientSoundBuffer.length = host.ambientSoundBufferIndex;
            }
            soundSystem.updateAmbientSounds(host.ambientSoundBuffer);
        }

        // animation stepping is handled by the client tick loop (`PlayerEcs` + `PlayerAnimController`).
    
}

export function _ecsUpdatePlayerOccupancy(host: WebGLOsrsRendererHost, map: WebGLMapSquare): void {

        const pe = host.osrsClient.playerEcs;
        const n = pe.size?.() ?? (pe as any).size?.() ?? 0;
        if (!n) return;
        for (let i = 0; i < n; i++) {
            const px = pe.getX(i) | 0;
            const py = pe.getY(i) | 0;
            const tileX = (px / 128) | 0;
            const tileY = (py / 128) | 0;
            const worldViewId = pe.getWorldViewId(i) | 0;
            let occMapX = map.mapX | 0;
            let occMapY = map.mapY | 0;
            const overlayView =
                worldViewId >= 0
                    ? host.osrsClient.worldViewManager.getWorldView(worldViewId)
                    : undefined;
            if (overlayView) {
                if ((overlayView.overlayMapId | 0) !== (map.id | 0)) continue;
            } else {
                if (worldViewId >= 0 && !host.instanceActive) continue;
                const mapX = getMapIndexFromTile(tileX);
                const mapY = getMapIndexFromTile(tileY);
                if (mapX !== map.mapX || mapY !== map.mapY) continue;
                occMapX = mapX | 0;
                occMapY = mapY | 0;
            }

            // Compute effective plane using bridge flag
            const local = host.getMapLocalTile(map, tileX, tileY);
            if (!local) continue;
            const localTileX = local.x;
            const localTileY = local.y;
            const plane = resolveCollisionSamplePlaneForLocal(
                map,
                pe.getLevel(i) | 0,
                localTileX,
                localTileY,
            );

            const oldPlane = pe.getOccPlane(i) | 0;
            const oldMapX = pe.getOccMapX?.(i) ?? 255;
            const oldMapY = pe.getOccMapY?.(i) ?? 255;
            const oldTileX = pe.getOccTileX(i) | 0;
            const oldTileY = pe.getOccTileY(i) | 0;

            // First-time init: set occ to current and inc
            if (oldPlane === 255) {
                map.incPlayerOcc(plane, localTileX, localTileY);
                pe.setOccTileWithMap?.(i, occMapX, occMapY, localTileX, localTileY, plane);
                continue;
            }

            // If map changed, dec on old map (if loaded), inc on new
            if (oldMapX !== occMapX || oldMapY !== occMapY) {
                const oldMap = host.mapManager.getMap(oldMapX as number, oldMapY as number) as
                    | WebGLMapSquare
                    | undefined;
                if (oldMap) oldMap.decPlayerOcc(oldPlane, oldTileX, oldTileY);
                map.incPlayerOcc(plane, localTileX, localTileY);
                pe.setOccTileWithMap?.(i, occMapX, occMapY, localTileX, localTileY, plane);
                continue;
            }

            // Same map: if plane and tile the same, nothing to do
            if (
                oldPlane === (plane | 0) &&
                oldTileX === (localTileX | 0) &&
                oldTileY === (localTileY | 0)
            ) {
                continue;
            }

            // Same map: delta row/column if single-tile and same plane, else full
            if (
                oldPlane === (plane | 0) &&
                Math.abs(localTileX - oldTileX) <= 1 &&
                Math.abs(localTileY - oldTileY) <= 1 &&
                (localTileX !== oldTileX || localTileY !== oldTileY)
            ) {
                const dx = localTileX - oldTileX;
                const dy = localTileY - oldTileY;
                if (dx !== 0) {
                    const trailX = oldTileX; // size 1: trailing is the whole old footprint
                    map.decPlayerOcc(oldPlane, trailX, oldTileY);
                    const leadX = localTileX;
                    map.incPlayerOcc(plane, leadX, localTileY);
                }
                if (dy !== 0) {
                    const trailY = oldTileY;
                    map.decPlayerOcc(oldPlane, oldTileX, trailY);
                    const leadY = localTileY;
                    map.incPlayerOcc(plane, localTileX, leadY);
                }
            } else {
                map.decPlayerOcc(oldPlane, oldTileX, oldTileY);
                map.incPlayerOcc(plane, localTileX, localTileY);
            }
            pe.setOccTileWithMap?.(i, occMapX, occMapY, localTileX, localTileY, plane);
        }
    
}

export function resetActorTileSelectionFrameIfNeeded(host: WebGLOsrsRendererHost, ): void {

        const frameId = (host.stats?.frameCount ?? 0) | 0;
        if (frameId === host.frameActorTileSelectionId) {
            return;
        }

        host.frameActorTileSelectionId = frameId;
        host.frameActorTileSelectionBuilt = false;
        host.frameWinningActorByTile.clear();
    
}

export function getActorTileSelectionKey(host: WebGLOsrsRendererHost, tileX: number, tileY: number, plane: number): number {

        return ((plane & 0x3) * 0x40000000 + ((tileX & 0x7fff) * 0x8000 + (tileY & 0x7fff))) >>> 0;
    
}

export function shouldReplaceTileWinner(host: WebGLOsrsRendererHost, 
        current: { kind: "player" | "npc"; id: number; priority: number },
        kind: "player" | "npc",
        id: number,
        priority: number,
    ): boolean {

        if (priority !== current.priority) return priority > current.priority;
        // PID values are random, but keep the result deterministic if a
        // collision ever occurs instead of depending on collection order.
        return id > current.id;
    
}

export function registerActorTileCandidate(host: WebGLOsrsRendererHost, 
        kind: "player" | "npc",
        id: number,
        tileX: number,
        tileY: number,
        plane: number,
        priority: number,
    ): void {

        const key = host.getActorTileSelectionKey(tileX | 0, tileY | 0, plane | 0);
        const current = host.frameWinningActorByTile.get(key);
        if (current && !host.shouldReplaceTileWinner(current, kind, id | 0, priority)) {
            return;
        }

        host.frameWinningActorByTile.set(key, {
            kind: kind,
            id: id | 0,
            priority,
        });
    
}

export function registerPlayerSceneTileCandidate(host: WebGLOsrsRendererHost, pid: number, priority: number): void {

        const pe = host.osrsClient.playerEcs;
        if (pe.getIsHidden(pid | 0)) {
            return;
        }
        host.registerActorTileCandidate(
            "player",
            pid | 0,
            (pe.getX(pid) >> 7) | 0,
            (pe.getY(pid) >> 7) | 0,
            pe.getLevel(pid) | 0,
            priority,
        );
    
}

export function collectRenderableNpcIds(host: WebGLOsrsRendererHost, ): Set<number> {

        const renderable = new Set<number>();
        for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
            const map = host.mapManager.visibleMaps[i];
            const ids = map?.npcEntityIds;
            if (!ids || ids.length === 0) {
                continue;
            }

            for (let j = 0; j < ids.length; j++) {
                const ecsId = ids[j] | 0;
                if (host.shouldRenderNpcOwnershipFromMap(map, ecsId)) {
                    renderable.add(ecsId);
                }
            }
        }
        return renderable;
    
}
