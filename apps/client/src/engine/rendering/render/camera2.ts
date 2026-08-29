import Denque from "denque";
import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { button, folder } from "leva";
import { Schema } from "leva/dist/declarations/src/types";
import {
    DrawCall,
    Framebuffer,
    App as PicoApp,
    PicoGL,
    Program,
    Renderbuffer,
    Texture,
    Timer,
    UniformBuffer,
    VertexArray,
    VertexBuffer,
} from "picogl";

import {
    getClientCycle,
    getCurrentTick,
    getServerTickPhaseNow,
    isServerConnected,
    sendEmote,
    sendInteractFollow,
    sendInteractStop,
    subscribeTick,
} from "@client/core/network/ServerConnection";
import { sendLogin } from "@client/core/network/ServerConnection";
import { flushPackets } from "@client/core/network/packet/index";
import { createTextureArray } from "@client/engine/rendering/picogl/PicoTexture";
import { RS_TO_RADIANS } from "@august/osrs-engine/MathConstants";
import { CollisionFlag } from "@august/game-model/collision/CollisionFlag";
import { isInWilderness } from "@august/game-model/world/Wilderness";
import {
    getWorldLocChanges,
    getWorldLocSpawns,
    getWorldTerrainOverrides,
} from "@client/features/content/GamemodeContentStore";
import { OsrsMenuEntry } from "@august/osrs-engine/MenuEntry";
import { MenuTargetType } from "@august/osrs-engine/MenuEntry";
import type { OverlayFloorType } from "@august/osrs-engine/config/floortype/OverlayFloorType";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { LocModelType } from "@august/osrs-engine/config/loctype/LocModelType";
import { NpcModelLoader } from "@august/osrs-engine/config/npctype/NpcModelLoader";
import { NpcDrawPriority, NpcType } from "@august/osrs-engine/config/npctype/NpcType";
import { PlayerAppearance } from "@august/osrs-engine/config/player/PlayerAppearance";
import { PlayerModelLoader } from "@august/osrs-engine/config/player/PlayerModelLoader";
import { decodeInteractionIndex } from "@august/osrs-engine/interaction/InteractionIndex";
import { getMapIndexFromTile, getMapPlaneId, getMapSquareId } from "@august/osrs-engine/map/MapFileIndex";
import { Model } from "@august/osrs-engine/model/Model";
import { ModelData } from "@august/osrs-engine/model/ModelData";
import { Scene } from "@august/osrs-engine/scene/Scene";
import { getUiScale } from "@client/ui/runtime/UiScale";
import { ClickCrossOverlay } from "@client/engine/rendering/overlays/ClickCrossOverlay";
import { GroundItemOverlay } from "@client/engine/rendering/overlays/GroundItemOverlay";
import { HealthBarOverlay } from "@client/engine/rendering/overlays/HealthBarOverlay";
import { HitsplatOverlay } from "@client/engine/rendering/overlays/HitsplatOverlay";
import {
    InteractHighlightDrawTarget,
    InteractHighlightOverlay,
} from "@client/engine/rendering/overlays/InteractHighlightOverlay";
import { LoadingMessageOverlay } from "@client/engine/rendering/overlays/LoadingMessageOverlay";
import { LoginOverlay } from "@client/engine/rendering/overlays/LoginOverlay";
import { OverheadPrayerOverlay } from "@client/engine/rendering/overlays/OverheadPrayerOverlay";
import { OverheadTextOverlay } from "@client/engine/rendering/overlays/OverheadTextOverlay";
import {
    HealthBarEntry,
    HitsplatEntry,
    OverheadPrayerEntry,
    OverheadTextEntry,
    type OverlayUpdateArgs,
    RenderPhase,
} from "@client/engine/rendering/overlays/Overlay";
import { OverlayManager } from "@client/engine/rendering/overlays/OverlayManager";
import type { TileMarkerOverlay } from "@client/engine/rendering/overlays/TileMarkerOverlay";
import { TileTextOverlay } from "@client/engine/rendering/overlays/TileTextOverlay";
import { WidgetsOverlay } from "@client/engine/rendering/overlays/WidgetsOverlay";
import { MENU_ACTION_DEPRIORITIZE_OFFSET, MenuAction, menuAction } from "@client/ui/runtime/menu/MenuAction";
import { worldEntriesToSimple } from "@client/ui/runtime/menu/MenuBridge";
import type { MenuClickContext, SimpleMenuEntry } from "@client/ui/runtime/menu/MenuEngine";
import { chooseDefaultMenuEntry, shouldLeftClickOpenMenu } from "@client/ui/runtime/menu/MenuEngine";
import { MenuOpcode } from "@client/ui/runtime/menu/MenuState";
import { Model2DRenderer } from "@client/ui/runtime/model/Model2DRenderer";
import {
    canTargetGroundItem,
    canTargetNpc,
    canTargetObject,
    canTargetPlayer,
} from "@client/ui/widgets/WidgetFlags";
import { WidgetLoader } from "@client/ui/widgets/WidgetLoader";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { layoutWidgets } from "@client/ui/widgets/layout/WidgetLayout";
import { collectWidgetsAtPoint } from "@client/ui/widgets/menu/WidgetInteractionResolver";
import {
    getCanvasCssSize,
    isIos,
    isMobileMode,
    isTouchDevice,
    isWebGL2Supported,
} from "@client/core/platform/device/DeviceUtil";
import { clamp } from "@august/game-model/math/MathUtil";
import { ClientState } from "@client/engine/game/ClientState";
import { GameRenderer } from "@client/engine/rendering/core/GameRenderer";
import type { HitsplatEventPayload } from "@client/engine/rendering/core/GameRenderer";
import { OsrsRendererType, WEBGL } from "@client/engine/rendering/core/GameRenderers";
import { ClickMode, getMousePos } from "@client/core/input/InputManager";
import { OsrsClient } from "@client/engine/game/OsrsClient";
import { ActorAnimationClip } from "@client/engine/game/actor/ActorAnimation";
import {
    ActorHealthBarsState,
    ActorHitsplatState,
    HealthBarBarState,
    HealthBarDefinitionState,
    HealthBarUpdateState,
    MAX_HITSPLAT_SLOTS,
    createActorHealthBarsState,
    createActorHitsplatState,
} from "@client/engine/game/actor/ActorOverlayState";
import type { ClientGroundItemStack, GroundItemOverlayEntry } from "@client/engine/game/data/ground/GroundItemStore";
import { NpcEcs } from "@client/engine/game/ecs/NpcEcs";
import type { PlayerAnimKey } from "@client/engine/game/ecs/PlayerEcs";
import { GameState, LoginIndex } from "@client/features/login/index";
import { Ray, rayIntersectsBox } from "@client/engine/game/math/Raycast";
import { isMouseInUIRegion as checkMouseInUIRegion } from "@client/engine/game/menu/WorldMenuBuilder";
import {
    advanceAnimation,
    computeMovementOrientation,
    computeMovementStep,
    interpolateRotation,
    parseInteractionTarget,
} from "@client/engine/game/movement/NpcClientTick";
import type { TileMarkersPluginConfig } from "@client/features/plugins/tilemarkers/types";
import { computeRoofPlaneLimit } from "@client/engine/game/roof/RoofVisibility";
import { sampleBridgeHeightForWorldTile } from "@client/engine/game/scene/BridgeHeightSampler";
import {
    BridgePlaneStrategy,
    resolveBridgePromotedPlane,
    resolveCollisionSamplePlaneForLocal,
    resolveCollisionSamplePlaneForWorldTile,
    resolveGroundItemStackPlane,
    resolveHeightSamplePlaneForLocal,
    resolveInteractionPlaneForLocal,
    resolveInteractionPlaneForWorldTile,
} from "@client/engine/game/scene/PlaneResolver";
import { SceneRaycastHit, SceneRaycaster } from "@client/engine/game/scene/SceneRaycaster";
import {
    TILE_FLAG_BRIDGE,
    getTileRenderFlagAt as lookupTileRenderFlagAt,
} from "@client/engine/game/scene/TileRenderFlags";
import { LoadingRequirement } from "@client/engine/game/state/LoadingTracker";
import type { PlayerSpotAnimationEvent } from "@client/engine/game/sync/PlayerSyncTypes";
import { RAD_TO_RS_UNITS, computeFacingRotation } from "@client/engine/game/movement/FacingRotation";
import { AnimationFrames } from "@client/engine/rendering/AnimationFrames";
import { ChatheadFactory } from "@client/engine/rendering/ChatheadFactory";
import { type DrawBackend, createDrawBackend } from "@client/engine/rendering/DrawBackend";
import { DrawRange, NULL_DRAW_RANGE, newDrawRange } from "@client/engine/rendering/DrawRange";
import { InteractType } from "@client/engine/rendering/InteractType";
import { profiler } from "@client/engine/rendering/PerformanceProfiler";
import { PlayerChatheadFactory } from "@client/engine/rendering/PlayerChatheadFactory";
import { resolveFogRange } from "@client/engine/rendering/RenderDistancePolicy";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import { WorldEntityAnimator } from "@client/engine/rendering/WorldEntityAnimator";
import { SceneBuffer } from "@client/engine/rendering/buffer/SceneBuffer";
import { getModelFaces, isModelFaceTransparent } from "@client/engine/rendering/buffer/SceneBuffer";
import { GfxManager } from "@client/engine/rendering/gfx/GfxManager";
import { GfxRenderer } from "@client/engine/rendering/gfx/GfxRenderer";
import { buildGroundItemGeometry } from "@client/engine/rendering/ground/GroundItemMeshBuilder";
import { type MinimapIcon, SdMapData } from "@client/engine/rendering/loader/SdMapData";
import { SdMapDataLoader } from "@client/engine/rendering/loader/SdMapDataLoader";
import { SdMapLoaderInput } from "@client/engine/rendering/loader/SdMapLoaderInput";
import { isDoorLocType } from "@client/engine/rendering/loc/SceneLocs";
import {
    DynamicNpcAnimLoader,
    DynamicNpcFrameGeometry,
    DynamicNpcSequenceMeta,
} from "@client/engine/rendering/npc/DynamicNpcAnimLoader";
import { PlayerRenderer } from "@client/engine/rendering/player/PlayerRenderer";
import { ProjectileManager } from "@client/engine/rendering/projectiles/ProjectileManager";
import { ProjectileRenderer } from "@client/engine/rendering/projectiles/ProjectileRenderer";
import {
    FRAME_FXAA_PROGRAM,
    FRAME_PROGRAM,
    createMainProgram,
    createNpcProgram,
    createPlayerProgram,
    createProjectileProgram,
} from "@client/engine/rendering/shaders/Shaders";
import { KNOWN_WATER_TEXTURE_IDS } from "@client/engine/rendering/water/WaterTextureIds";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";

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
