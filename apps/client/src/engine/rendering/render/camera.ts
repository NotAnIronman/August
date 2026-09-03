
import { Scene } from "@august/osrs-engine/scene/Scene";
import { sampleBridgeHeightForWorldTile } from "@client/engine/game/scene/BridgeHeightSampler";
import {
    BridgePlaneStrategy
} from "@client/engine/game/scene/PlaneResolver";
import {
    getTileRenderFlagAt as lookupTileRenderFlagAt,
    TILE_FLAG_BRIDGE,
} from "@client/engine/game/scene/TileRenderFlags";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function updateCameraTerrainPitchPressure(host: WebGLOsrsRendererHost, 
        focalSubX: number,
        focalSubZ: number,
        basePlane: number,
        cycles: number,
    ): void {

        if (cycles <= 0) {
            return;
        }
        const focalHeight = sampleBridgeHeightForWorldTile(
            host.mapManager,
            focalSubX / 128,
            focalSubZ / 128,
            basePlane,
            BridgePlaneStrategy.RENDER,
        );
        if (!focalHeight.valid) {
            return;
        }

        const focalTileX = focalSubX >> 7;
        const focalTileY = focalSubZ >> 7;
        const focalHeightWorldUnits = Math.round(focalHeight.height * 128);
        let maxDelta = 0;

        for (let tileX = focalTileX - 4; tileX <= focalTileX + 4; tileX++) {
            for (let tileY = focalTileY - 4; tileY <= focalTileY + 4; tileY++) {
                let samplePlane = Math.max(0, Math.min(3, basePlane | 0));
                if (
                    samplePlane < 3 &&
                    (lookupTileRenderFlagAt(host.mapManager, 1, tileX, tileY) &
                        TILE_FLAG_BRIDGE) !==
                    0
                ) {
                    samplePlane++;
                }
                const tileHeightWorldUnits = host.sampleTileVertexHeightWorldUnits(
                    tileX,
                    tileY,
                    samplePlane,
                );
                if (tileHeightWorldUnits === undefined) continue;

                const delta = focalHeightWorldUnits - tileHeightWorldUnits;
                if (delta > maxDelta) {
                    maxDelta = delta;
                }
            }
        }

        let target = maxDelta * 192;
        if (target > 98048) target = 98048;
        if (target < 32768) target = 32768;

        for (let i = 0; i < cycles; i++) {
            const current = host.cameraTerrainPitchPressure | 0;
            if (target > current) {
                host.cameraTerrainPitchPressure = current + (((target - current) / 24) | 0);
            } else if (target < current) {
                host.cameraTerrainPitchPressure = current + (((target - current) / 80) | 0);
            } else {
                break;
            }
        }
    
}

export function sampleTileVertexHeightWorldUnits(host: WebGLOsrsRendererHost, 
        tileX: number,
        tileY: number,
        plane: number,
    ): number | undefined {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (!map) return undefined;

        const local = host.getMapLocalTile(map, tileX, tileY);
        if (!local) return undefined;

        const size = map.heightMapSize | 0;
        if (size <= 0) return undefined;
        const samplePlane = Math.max(0, Math.min(3, plane | 0));
        const base = samplePlane * size * size;
        const ix = local.x + map.borderSize;
        const iz = local.y + map.borderSize;
        const data = map.heightMapData as Int16Array;
        const texel = data[base + iz * size + ix] ?? 0;
        const worldUnits = (texel * Scene.UNITS_TILE_HEIGHT_BASIS) | 0;
        // World Y is negative-up.
        return -worldUnits;
    
}

export function setCameraShakeSlot(host: WebGLOsrsRendererHost, 
        slot: number,
        randomAmplitude: number,
        waveAmplitude: number,
        waveSpeed: number,
        phase: number = 0,
    ): void {

        const idx = slot | 0;
        if (idx < 0 || idx >= 5) return;
        host.cameraShakeEnabled[idx] = true;
        host.cameraShakeRandomAmplitude[idx] = randomAmplitude | 0;
        host.cameraShakeWaveAmplitude[idx] = waveAmplitude | 0;
        host.cameraShakeWaveSpeed[idx] = waveSpeed | 0;
        host.cameraShakeWavePhase[idx] = phase | 0;
        host.cameraShakeLastClientCycle = -1;
    
}

export function clearCameraShakeSlot(host: WebGLOsrsRendererHost, slot: number): void {

        const idx = slot | 0;
        if (idx < 0 || idx >= 5) return;
        host.cameraShakeEnabled[idx] = false;
        host.cameraShakeRandomAmplitude[idx] = 0;
        host.cameraShakeWaveAmplitude[idx] = 0;
        host.cameraShakeWaveSpeed[idx] = 0;
        host.cameraShakeWavePhase[idx] = 0;
    
}

export function clearCameraShake(host: WebGLOsrsRendererHost, ): void {

        for (let i = 0; i < 5; i++) {
            host.clearCameraShakeSlot(i);
        }
        host.cameraShakeLastClientCycle = -1;
    
}

export function computeCameraShakeOffsets(host: WebGLOsrsRendererHost, clientCycle: number): {
        x: number;
        y: number;
        z: number;
        yaw: number;
        pitch: number;
        active: boolean;
    } {

        if (host.cameraShakeLastClientCycle < 0) {
            host.cameraShakeLastClientCycle = clientCycle;
        }
        let cyclesElapsed = (clientCycle - host.cameraShakeLastClientCycle) | 0;
        if (cyclesElapsed < 0 || cyclesElapsed > 200) {
            cyclesElapsed = 1;
        }
        if (cyclesElapsed > 0) {
            host.cameraShakeLastClientCycle = clientCycle;
        }

        let x = 0;
        let y = 0;
        let z = 0;
        let yaw = 0;
        let pitch = 0;
        let active = false;

        for (let i = 0; i < 5; i++) {
            if (!host.cameraShakeEnabled[i]) continue;
            active = true;
            if (cyclesElapsed > 0) {
                host.cameraShakeWavePhase[i] = (host.cameraShakeWavePhase[i] + cyclesElapsed) | 0;
            }
            const randomAmp = host.cameraShakeRandomAmplitude[i] | 0;
            const waveAmp = host.cameraShakeWaveAmplitude[i] | 0;
            const waveSpeed = host.cameraShakeWaveSpeed[i] | 0;
            const randomTerm = Math.random() * (randomAmp * 2 + 1) - randomAmp;
            const waveTerm = Math.sin((host.cameraShakeWavePhase[i] * waveSpeed) / 100.0) * waveAmp;
            const value = (randomTerm + waveTerm) | 0;

            switch (i) {
                case 0:
                    x += value;
                    break;
                case 1:
                    y += value;
                    break;
                case 2:
                    z += value;
                    break;
                case 3:
                    yaw += value;
                    break;
                case 4:
                    pitch += value;
                    break;
            }
        }

        return { x, y, z, yaw, pitch, active };
    
}
