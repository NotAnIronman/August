import { mat4,vec3 } from "gl-matrix";

import { clamp } from "@august/game-model/math/MathUtil";
import { RS_TO_RADIANS } from "@august/osrs-engine/MathConstants";
import {
    getClientCycle
} from "@client/core/network/ServerConnection";
import { sampleBridgeHeightForWorldTile } from "@client/engine/game/scene/BridgeHeightSampler";
import {
    BridgePlaneStrategy
} from "@client/engine/game/scene/PlaneResolver";
import { LoadingRequirement } from "@client/engine/game/state/LoadingTracker";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function updateCameraFollow(host: WebGLOsrsRendererHost, deltaTime?: number, timeSec?: number): void {

        const pe = host.osrsClient.playerEcs;
        const playerEcsIndex = host.getControlledPlayerEcsIndex();
        if (playerEcsIndex === undefined) return;

        const px = pe.getX(playerEcsIndex) | 0;
        const py = pe.getY(playerEcsIndex) | 0;
        const playerX = px / 128;
        const playerZ = py / 128;

        // Update player position for fog calculation (use actual player pos)
        host.playerPosUni[0] = playerX;
        host.playerPosUni[1] = playerZ;

        // OSRS follow camera uses a smoothed focal point (oculusOrbFocalPointX/Y) that eases toward the player.
        // Important: update is tick-based (integer math), not frame-delta based; otherwise the camera/focal timebase
        // diverges from the tick interpolation timebase and introduces visible jitter at high refresh rates.
        const clientCycle = getClientCycle() | 0;
        const targetSubX = px;
        const targetSubZ = py;

        let smoothingCycles = 0;
        if (!host.followCamFocalInitialized || host.followCamFocalLastClientCycle < 0) {
            host.followCamFocalXSub = targetSubX;
            host.followCamFocalZSub = targetSubZ;
            host.followCamFocalLastClientCycle = clientCycle;
            host.followCamFocalInitialized = true;
        } else {
            const cyclesElapsed = (clientCycle - host.followCamFocalLastClientCycle) | 0;
            // If we fell behind a lot (tab background / stall), just resync.
            if (cyclesElapsed < 0 || cyclesElapsed > 32) {
                host.followCamFocalXSub = targetSubX;
                host.followCamFocalZSub = targetSubZ;
                host.followCamFocalLastClientCycle = clientCycle;
                smoothingCycles = 1;
            } else if (cyclesElapsed > 0) {
                smoothingCycles = cyclesElapsed;
                for (let i = 0; i < cyclesElapsed; i++) {
                    const dxFocal = targetSubX - host.followCamFocalXSub;
                    const dzFocal = targetSubZ - host.followCamFocalZSub;
                    // OSRS: snap focal if >500 sub-units away.
                    if (dxFocal < -500 || dxFocal > 500 || dzFocal < -500 || dzFocal > 500) {
                        host.followCamFocalXSub = targetSubX;
                        host.followCamFocalZSub = targetSubZ;
                    } else {
                        // OSRS: focal += (target - focal) / 16 (integer division).
                        if (dxFocal !== 0) host.followCamFocalXSub += (dxFocal / 16) | 0;
                        if (dzFocal !== 0) host.followCamFocalZSub += (dzFocal / 16) | 0;
                    }
                }
                host.followCamFocalLastClientCycle = clientCycle;
            }
        }

        const focalSubX = host.followCamFocalXSub;
        const focalSubZ = host.followCamFocalZSub;
        const basePlane = pe.getLevel(playerEcsIndex) | 0;
        const onWorldEntity = host.getControlledPlayerWorldViewId() >= 0;
        // Pitch pressure eases on the client-cycle timebase like the focal point;
        // per-frame easing would converge several times faster than OSRS at high refresh rates.
        if (!onWorldEntity) {
            host.updateCameraTerrainPitchPressure(focalSubX, focalSubZ, basePlane, smoothingCycles);
        } else {
            // On a world entity (ship) the deck is flat; let pressure decay to the minimum
            // so it doesn't artificially restrict the camera pitch.
            for (let i = 0; i < smoothingCycles; i++) {
                const current = host.cameraTerrainPitchPressure | 0;
                if (current <= 32768) break;
                host.cameraTerrainPitchPressure = current + (((32768 - current) / 80) | 0);
            }
        }

        const targetX = focalSubX / 128;
        const targetZ = focalSubZ / 128;

        // OSRS: vertical follow uses the player's height, not the smoothed focal point height.
        // (X/Z lag slightly, Y follows the player with camFollowHeight-style offset).
        const playerHeightSample = sampleBridgeHeightForWorldTile(
            host.mapManager,
            playerX,
            playerZ,
            basePlane,
            BridgePlaneStrategy.RENDER,
        );

        const camera = host.osrsClient.camera;
        // OSRS uses the effective viewport height after viewport-shape clamping,
        // not the raw canvas height, to derive follow-camera distance.
        const sceneViewport = host.getSceneViewportWidgetRect();
        const viewportWidth = sceneViewport.width || camera.viewportWidth || host.app.width;
        const viewportHeight = sceneViewport.height || camera.viewportHeight || host.app.height;
        const { viewportHeight: effectiveViewportHeight } = camera.computeViewportMetricsForSize(
            viewportWidth,
            viewportHeight,
        );

        // OSRS pitch -> distance mapping, with viewport-dependent zoom scaling
        // zoom = (zoomWidth - zoomHeight) * clamp(viewportHeight - 334, 0..100) / 100 + zoomHeight
        const v = clamp(effectiveViewportHeight - 334, 0, 100);
        const zoom =
            (host.osrsClient.zoomWidth - host.osrsClient.zoomHeight) * (v / 100) +
            host.osrsClient.zoomHeight;
        let camAngleX = camera.getScenePitchAngle();
        const terrainMinCamAngleX = (host.cameraTerrainPitchPressure | 0) >> 8;
        if (terrainMinCamAngleX > camAngleX) {
            camAngleX = terrainMinCamAngleX;
        }
        // active pitch-shake also raises the minimum camera angle for orbit distance.
        if (host.cameraShakeEnabled[4]) {
            const shakeMinCamAngleX = (host.cameraShakeWaveAmplitude[4] | 0) + 128;
            if (shakeMinCamAngleX > camAngleX) {
                camAngleX = shakeMinCamAngleX;
            }
        }

        const yawRad = (camera.yaw - 1024) * RS_TO_RADIANS;
        const pitchRad = -camAngleX * RS_TO_RADIANS;

        // Build rotation matrix identical to the scene camera order (no translation).
        const rot = host.followCamRot;
        mat4.identity(rot);
        mat4.rotateY(rot, rot, yawRad);
        mat4.rotateZ(rot, rot, Math.PI);
        mat4.rotateX(rot, rot, pitchRad);

        // Camera forward in world space (camera looks down -Z).
        const forward = host.followCamForward;
        vec3.transformMat4(forward, host.followCamForwardAxis, rot);
        vec3.normalize(forward, forward);

        const baseRadius = 600 + 3 * camAngleX; // world units (1 tile = 128 units)
        const radius = (baseRadius * zoom) / 256; // world units
        const dist = radius / 128; // tiles
        let desiredPosX = targetX - forward[0] * dist;
        let desiredPosZ = targetZ - forward[2] * dist;
        // Keep camera in integer sub-tile units (1/128 tile) to match OSRS camera math and prevent shimmer.
        desiredPosX = Math.round(desiredPosX * 128) / 128;
        desiredPosZ = Math.round(desiredPosZ * 128) / 128;

        // Always snap X/Z for tight player follow (prevents stutter/drift vs player)
        camera.snapToPosition(desiredPosX, undefined, desiredPosZ);

        // If height data isn't valid yet (map not loaded), skip Y updates entirely.
        // This prevents the camera from snapping to height=0 then jumping when data loads.
        if (!playerHeightSample.valid) {
            return;
        }

        // Track when height data first became valid, then wait for fog animation to complete
        // (fog fade-in takes 1 second: smoothstep over u_currentTime - u_timeLoaded)
        if (!host.mapDataLoadedNotified && timeSec !== undefined) {
            if (host.heightValidAtTime === undefined) {
                // First frame with valid height - record the time
                host.heightValidAtTime = timeSec;
            } else if (timeSec - host.heightValidAtTime >= 1.0) {
                // Fog animation complete (1 second elapsed) - notify loading tracker
                host.mapDataLoadedNotified = true;
                host.osrsClient.loadingTracker.markComplete(LoadingRequirement.MAP_DATA_LOADED);
            }
        }

        const focusHeightTiles = (host.osrsClient.camFollowHeight | 0) / 128.0;
        const targetY = playerHeightSample.height - focusHeightTiles;
        // Camera Y is purely the orbit position around the focal point; terrain clipping is
        // handled by the pitch clamp pressure, never by raising the camera off its orbit.
        const desiredPosY = Math.round((targetY - forward[1] * dist) * 128) / 128;

        // Tight follow: snap camera height to the computed orbit position to keep the target stable in view.
        camera.snapToPosition(undefined, desiredPosY, undefined);
    
}
