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
