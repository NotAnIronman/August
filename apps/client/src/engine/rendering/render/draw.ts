
import { clamp } from "@august/game-model/math/MathUtil";
import {
    getClientCycle
} from "@client/core/network/ServerConnection";
import {
    resolveHeightSamplePlaneForLocal
} from "@client/engine/game/scene/PlaneResolver";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function addNpcRenderData(host: WebGLOsrsRendererHost, map: WebGLMapSquare) {

        if (!map.drawCallNpc || !map.npcEntityIds || map.npcEntityIds.length === 0) return;

        // Always use slot 0 for double-buffered actor data
        const sampleIdx = 0;

        if (host.unifiedActorData) {
            const ids: number[] = map.npcEntityIds as any;
            const ecs = host.osrsClient.npcEcs;
            const renderBaseTileX = map.getRenderBaseTileX();
            const renderBaseTileY = map.getRenderBaseTileY();
            const mapTileSpan = map.getLocalTileSpan();
            const npcCount = ids.length | 0;

            if (npcCount === 0) {
                map.npcDataTextureOffsets[sampleIdx] = -1;
                return;
            }

            const baseOffset = host.actorRenderCount;
            const required = baseOffset + npcCount;
            if (host.actorRenderData.length / 8 < required) {
                const newData = new Uint16Array(Math.ceil((required * 2) / 16) * 16 * 8);
                newData.set(host.actorRenderData);
                host.actorRenderData = newData;
            }

            map.npcDataTextureOffsets[sampleIdx] = baseOffset;

            for (let i = 0; i < npcCount; i++) {
                const id = ids[i] | 0;
                const offset = (baseOffset + i) * 8;
                if (!host.shouldRenderNpcFromMap(map, id)) {
                    host.actorRenderData[offset + 0] = 0;
                    host.actorRenderData[offset + 1] = 0;
                    host.actorRenderData[offset + 2] = 0;
                    host.actorRenderData[offset + 3] = 0;
                    host.actorRenderData[offset + 4] = 0;
                    host.actorRenderData[offset + 5] = 0;
                    host.actorRenderData[offset + 6] = 0;
                    host.actorRenderData[offset + 7] = 0;
                    continue;
                }
                // Actor coordinates are owned by a synthetic map-square ID, while
                // instance meshes can begin on any 8-tile chunk. Always convert
                // through world space into this mesh's actual render origin.
                const npcX = (ecs.getWorldX(id) - renderBaseTileX * 128) | 0;
                const npcY = (ecs.getWorldY(id) - renderBaseTileY * 128) | 0;
                const localTileX = clamp((npcX >> 7) | 0, 0, Math.max(0, mapTileSpan - 1));
                const localTileY = clamp((npcY >> 7) | 0, 0, Math.max(0, mapTileSpan - 1));
                const renderPlane = resolveHeightSamplePlaneForLocal(
                    map,
                    ecs.getLevel(id) | 0,
                    localTileX,
                    localTileY,
                );
                // Texel 0: position, plane|rotation, interactionId
                host.actorRenderData[offset + 0] = npcX;
                host.actorRenderData[offset + 1] = npcY;
                host.actorRenderData[offset + 2] = renderPlane | (ecs.getRotation(id) << 2);
                host.actorRenderData[offset + 3] = ecs.getServerId(id);
                // Texel 1: per-actor HSL override
                const npcOverride = ecs.getColorOverride(id);
                const clientCycle = getClientCycle() | 0;
                if (
                    npcOverride.amount !== 0 &&
                    clientCycle >= npcOverride.startCycle &&
                    clientCycle < npcOverride.endCycle
                ) {
                    host.actorRenderData[offset + 4] =
                        (npcOverride.hue & 0x7f) | ((npcOverride.sat & 0x7f) << 7);
                    host.actorRenderData[offset + 5] =
                        (npcOverride.lum & 0x7f) | ((npcOverride.amount & 0xff) << 7);
                } else {
                    host.actorRenderData[offset + 4] = 0;
                    host.actorRenderData[offset + 5] = 0;
                }
                host.actorRenderData[offset + 6] = 0;
                host.actorRenderData[offset + 7] = 0;
            }

            host.actorRenderCount = required;
        }
    
}

export function addUnbatchedNpcRenderData(host: WebGLOsrsRendererHost): void {

        const entries = host.unbatchedNpcRenderEntries;
        entries.length = 0;
        if (!host.unifiedActorData || !host.loadNpcs) return;

        const ecs = host.osrsClient.npcEcs;
        const batchedIds = new Set<number>();
        for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
            const map = host.mapManager.visibleMaps[i];
            const ids = map?.npcEntityIds;
            if (!map?.drawCallNpc || !ids) continue;
            for (const id of ids) {
                if (host.shouldRenderNpcFromMap(map, id | 0)) batchedIds.add(id | 0);
            }
        }

        for (const idRaw of ecs.getServerLinkedEcsIds()) {
            const ecsId = idRaw | 0;
            const worldViewId = ecs.getWorldViewId(ecsId) | 0;
            const isWorldEntityNpc =
                worldViewId >= 0 &&
                !!host.osrsClient.worldViewManager.getWorldView(worldViewId);
            if (batchedIds.has(ecsId) || isWorldEntityNpc) continue;
            if (!host.getEffectiveNpcType(ecs.getNpcTypeId(ecsId) | 0)) continue;

            const ownerMapX = ecs.getMapX(ecsId) | 0;
            const ownerMapY = ecs.getMapY(ecsId) | 0;
            let map: WebGLMapSquare | undefined;
            for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
                const candidate = host.mapManager.visibleMaps[i];
                if (
                    (candidate.mapX | 0) === ownerMapX &&
                    (candidate.mapY | 0) === ownerMapY
                ) {
                    map = candidate;
                    break;
                }
            }
            if (!map) continue;

            const dataOffset = host.actorRenderCount | 0;
            const required = dataOffset + 1;
            if (host.actorRenderData.length / 8 < required) {
                const newData = new Uint16Array(Math.ceil((required * 2) / 16) * 16 * 8);
                newData.set(host.actorRenderData);
                host.actorRenderData = newData;
            }

            const offset = dataOffset * 8;
            const npcX = (ecs.getWorldX(ecsId) - map.getRenderBaseTileX() * 128) | 0;
            const npcY = (ecs.getWorldY(ecsId) - map.getRenderBaseTileY() * 128) | 0;
            const mapTileSpan = map.getLocalTileSpan();
            const localTileX = clamp((npcX >> 7) | 0, 0, Math.max(0, mapTileSpan - 1));
            const localTileY = clamp((npcY >> 7) | 0, 0, Math.max(0, mapTileSpan - 1));
            const renderPlane = resolveHeightSamplePlaneForLocal(
                map,
                ecs.getLevel(ecsId) | 0,
                localTileX,
                localTileY,
            );

            host.actorRenderData[offset + 0] = npcX;
            host.actorRenderData[offset + 1] = npcY;
            host.actorRenderData[offset + 2] = renderPlane | (ecs.getRotation(ecsId) << 2);
            host.actorRenderData[offset + 3] = ecs.getServerId(ecsId);

            const npcOverride = ecs.getColorOverride(ecsId);
            const clientCycle = getClientCycle() | 0;
            if (
                npcOverride.amount !== 0 &&
                clientCycle >= npcOverride.startCycle &&
                clientCycle < npcOverride.endCycle
            ) {
                host.actorRenderData[offset + 4] =
                    (npcOverride.hue & 0x7f) | ((npcOverride.sat & 0x7f) << 7);
                host.actorRenderData[offset + 5] =
                    (npcOverride.lum & 0x7f) | ((npcOverride.amount & 0xff) << 7);
            } else {
                host.actorRenderData[offset + 4] = 0;
                host.actorRenderData[offset + 5] = 0;
            }
            host.actorRenderData[offset + 6] = 0;
            host.actorRenderData[offset + 7] = 0;

            host.actorRenderCount = required;
            entries.push({ map, ecsId, dataOffset });
        }

}

export function addPlayerRenderData(host: WebGLOsrsRendererHost, map: WebGLMapSquare) {

        host.playerRenderer.addPlayerRenderData(map);
    
}

export function addProjectileRenderData(host: WebGLOsrsRendererHost, map: WebGLMapSquare) {

        if (!host.projectileManager) return;

        const projectiles = host.projectileManager.getProjectilesForMap(map.mapX, map.mapY);
        const projCount = projectiles.length;
        const key = `${map.mapX},${map.mapY}`;
        const prevCount = host.projectileRenderDebugCounts.get(key) ?? 0;
        if (prevCount !== projCount) {
            /*console.info(
                `[ProjectileRenderer] Map (${map.mapX}, ${map.mapY}) render queue changed from ${prevCount} to ${projCount}`,
            );*/
            host.projectileRenderDebugCounts.set(key, projCount);
        }

        if (projCount === 0) {
            if (map.projectileDataTextureOffsets) {
                map.projectileDataTextureOffsets[0] = -1;
            }
            return;
        }

        // Store the starting offset for this map's projectiles
        const baseOffset = host.actorRenderCount;
        const required = baseOffset + projCount;

        // Ensure buffer capacity (8 uint16s per entry = 2 texels - shared with NPCs/Players)
        if (required * 8 > host.actorRenderData.length) {
            const newCap = Math.max(required * 8, host.actorRenderData.length * 2);
            const newBuf = new Uint16Array(newCap);
            newBuf.set(host.actorRenderData);
            host.actorRenderData = newBuf;
        }

        // Store base offset for rendering
        if (!map.projectileDataTextureOffsets) {
            map.projectileDataTextureOffsets = new Array(2);
        }
        map.projectileDataTextureOffsets[0] = baseOffset;

        // Write projectile data
        const mapWorldX = map.mapX << 13;
        const mapWorldY = map.mapY << 13;

        for (let i = 0; i < projCount; i++) {
            const proj = projectiles[i];
            const offset = (baseOffset + i) * 8;
            const pos = proj.getPosition();

            // Convert from 128-unit coordinates to sub-tile coordinates (relative to map)
            // Map coords are in world 128-units, need to make them relative to this map square
            const relativeXf = pos.x - mapWorldX;
            const relativeYf = pos.y - mapWorldY;
            const baseRelativeX = Math.floor(relativeXf);
            const baseRelativeY = Math.floor(relativeYf);

            const localTileX = clamp((baseRelativeX >> 7) | 0, 0, 63);
            const localTileY = clamp((baseRelativeY >> 7) | 0, 0, 63);
            const renderPlane = resolveHeightSamplePlaneForLocal(
                map,
                proj.plane | 0,
                localTileX,
                localTileY,
            );

            // Get rotation (yaw, pitch, and roll in OSRS units 0-2047)
            const rotation = proj.getRotation();
            const yawOsrs = (rotation.yaw & 2047) | 0; // Clamp to 0-2047
            const pitchOsrs = (rotation.pitch & 2047) | 0; // Clamp to 0-2047
            const rollOsrs = (rotation.roll & 2047) | 0; // Clamp to 0-2047

            // Pack angles: pitch gets 7 bits (original precision), roll gets 3 bits, projectileId gets 9 bits
            const pitchShifted = (pitchOsrs >> 4) & 0x7f; // 7 bits for pitch (128 values, 16-unit precision)
            const pitchHi = (pitchShifted >> 4) & 0x7; // 3 high bits
            const pitchLo = pitchShifted & 0xf; // 4 low bits
            const rollShifted = (rollOsrs >> 8) & 0x7; // 3 bits for roll (8 values, 256-unit precision)

            const plane = renderPlane & 0x3;

            // Texel 0: position, rotation, projectile ID
            host.actorRenderData[offset + 0] = baseRelativeX & 0xffff;
            host.actorRenderData[offset + 1] = baseRelativeY & 0xffff;
            host.actorRenderData[offset + 2] = (plane | (yawOsrs << 2) | (pitchHi << 13)) & 0xffff;
            host.actorRenderData[offset + 3] =
                ((proj.projectileId & 0x1ff) | (pitchLo << 9) | (rollShifted << 13)) & 0xffff;
            // Texel 1: unused for projectiles
            host.actorRenderData[offset + 4] = 0;
            host.actorRenderData[offset + 5] = 0;
            host.actorRenderData[offset + 6] = 0;
            host.actorRenderData[offset + 7] = 0;
        }

        host.actorRenderCount = required;
    
}

export function addWorldGfxRenderData(host: WebGLOsrsRendererHost, map: WebGLMapSquare): void {

        if (!host.gfxManager) return;
        const instances = host.gfxManager.listWorldInstancesForMap(map.mapX, map.mapY);
        // Always use slot 0 for double-buffered actor data
        const sampleIdx = 0;
        if (instances.length === 0) {
            map.worldGfxDataTextureOffsets[sampleIdx] = -1;
            return;
        }
        const baseOffset = host.actorRenderCount;
        const required = baseOffset + instances.length;
        if (host.actorRenderData.length / 8 < required) {
            const newData = new Uint16Array(Math.ceil((required * 2) / 16) * 16 * 8);
            newData.set(host.actorRenderData);
            host.actorRenderData = newData;
        }
        map.worldGfxDataTextureOffsets[sampleIdx] = baseOffset;
        const mapBaseX = map.mapX * 64;
        const mapBaseY = map.mapY * 64;
        for (let i = 0; i < instances.length; i++) {
            const inst = instances[i];
            const world = inst.world;
            if (!world) continue;
            const worldX = (world.tileX | 0) * 128 + 64;
            const worldY = (world.tileY | 0) * 128 + 64;
            const localX = worldX - mapBaseX * 128;
            const localY = worldY - mapBaseY * 128;
            const localTileX = clamp((world.tileX | 0) - mapBaseX, 0, 63);
            const localTileY = clamp((world.tileY | 0) - mapBaseY, 0, 63);
            const renderPlane = resolveHeightSamplePlaneForLocal(
                map,
                world.level | 0,
                localTileX,
                localTileY,
            );
            const offset = (baseOffset + i) * 8;
            host.actorRenderData[offset + 0] = localX;
            host.actorRenderData[offset + 1] = localY;
            host.actorRenderData[offset + 2] = renderPlane;
            host.actorRenderData[offset + 3] = 0;
            // Texel 1: HSL override (zeroed — world GFX have no actor override)
            host.actorRenderData[offset + 4] = 0;
            host.actorRenderData[offset + 5] = 0;
            host.actorRenderData[offset + 6] = 0;
            host.actorRenderData[offset + 7] = 0;
            world.mapId = map.id;
            world.slot = i;
        }
        host.actorRenderCount = required;
    
}
