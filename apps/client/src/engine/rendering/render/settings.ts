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

export function setSkyColor(host: WebGLOsrsRendererHost, r: number, g: number, b: number) {

        host.skyColor[0] = r / 255;
        host.skyColor[1] = g / 255;
        host.skyColor[2] = b / 255;
    
}

export function setSceneHslOverride(host: WebGLOsrsRendererHost, hue: number, sat: number, lum: number, amount: number): void {

        host.sceneHslOverride[0] = hue;
        host.sceneHslOverride[1] = sat;
        host.sceneHslOverride[2] = lum;
        host.sceneHslOverride[3] = amount;
    
}

export function setSceneHslOverrideFromPacked(host: WebGLOsrsRendererHost, packedHsl: number, amount: number): void {

        const hue = (packedHsl >> 10) & 63;
        const sat = (packedHsl >> 7) & 7;
        const lum = packedHsl & 127;
        host.setSceneHslOverride(hue, sat, lum, amount);
    
}

export function clearSceneHslOverride(host: WebGLOsrsRendererHost, ): void {

        host.sceneHslOverride[0] = -1;
        host.sceneHslOverride[1] = -1;
        host.sceneHslOverride[2] = -1;
        host.sceneHslOverride[3] = 0;
    
}

export function setSmoothTerrain(host: WebGLOsrsRendererHost, enabled: boolean): void {

        const normalized = !!enabled;
        const effectiveSmoothTerrain =
            host.instanceScenePendingSettings?.smoothTerrain ?? host.smoothTerrain;
        if (effectiveSmoothTerrain === normalized) return;

        if (host.instanceActive) {
            host.requestInstanceSceneSettingsRebuild(
                normalized,
                host.instanceScenePendingSettings?.loadNpcs ?? host.loadNpcs,
            );
            return;
        }

        host.smoothTerrain = normalized;
        host.clearMaps();
    
}

export function setMsaa(host: WebGLOsrsRendererHost, enabled: boolean): void {

        const updated = host.msaaEnabled !== enabled;
        host.msaaEnabled = enabled;
        if (updated) {
            host.needsFramebufferUpdate = true;
        }
    
}

export function setFxaa(host: WebGLOsrsRendererHost, enabled: boolean): void {

        host.fxaaEnabled = enabled;
    
}

export function finishRenderFrame(host: WebGLOsrsRendererHost, 
        camera: any,
        deltaTime: number,
        showDebugTimer: boolean,
        profileGpuTimer: boolean,
    ): void {

        profiler.endFrame(deltaTime);

        let geoBytes = 0;
        for (const map of host.mapManager.mapSquares.values()) {
            geoBytes += (map.interleavedBuffer as any)?.byteLength ?? 0;
            geoBytes += (map.indexBuffer as any)?.byteLength ?? 0;
        }
        try {
            const pr: any = host.playerRenderer as any;
            const vbo = pr.getInterleavedBuffer?.();
            const ibo = pr.getIndexBuffer?.();
            if (vbo) geoBytes += (vbo as any).byteLength ?? 0;
            if (ibo) geoBytes += (ibo as any).byteLength ?? 0;
        } catch {}
        host.stats.geometryGpuBytes = geoBytes;

        host.stats.texturesLoaded = host.loadedTextureIds.size;
        host.stats.texturesTotal = host.textureIds.length;
        host.stats.width = host.app.width | 0;
        host.stats.height = host.app.height | 0;
        host.stats.sceneWidth = host.sceneRenderWidth | 0;
        host.stats.sceneHeight = host.sceneRenderHeight | 0;

        host.stats.cameraPosX = camera.getPosX();
        host.stats.cameraPosY = camera.getPosY();
        host.stats.cameraPosZ = camera.getPosZ();
        host.stats.cameraPitchRS = camera.pitch | 0;
        host.stats.cameraYawRS = camera.getYaw() | 0;
        host.stats.cameraRollRS = 0;

        const debugPlayerIndex = host.getControlledPlayerEcsIndex();
        if (debugPlayerIndex !== undefined) {
            host.stats.playerTileX = (host.osrsClient.playerEcs.getX(debugPlayerIndex) / 128) | 0;
            host.stats.playerTileY = (host.osrsClient.playerEcs.getY(debugPlayerIndex) / 128) | 0;
            host.stats.playerLevel = host.osrsClient.playerEcs.getLevel(debugPlayerIndex) | 0;
        }

        if ((showDebugTimer || profileGpuTimer) && host.timer.ready()) {
            profiler.recordGpuTime(host.timer.gpuTime);
        }

        if (showDebugTimer && host.timer.ready()) {
            host.osrsClient.debugText = `Frame Time GL: ${host.timer.gpuTime.toFixed(
                2,
            )}ms\n JS: ${host.timer.cpuTime.toFixed(2)}ms`;
        }
    
}

export function setLoadNpcs(host: WebGLOsrsRendererHost, enabled: boolean): void {

        const normalized = !!enabled;
        const effectiveLoadNpcs = host.instanceScenePendingSettings?.loadNpcs ?? host.loadNpcs;
        if (effectiveLoadNpcs === normalized) return;

        if (host.instanceActive) {
            host.requestInstanceSceneSettingsRebuild(
                host.instanceScenePendingSettings?.smoothTerrain ?? host.smoothTerrain,
                normalized,
            );
            return;
        }

        host.loadNpcs = normalized;
        host.clearMaps();
    
}

export function onResize(host: WebGLOsrsRendererHost, width: number, height: number): void {

        try {
            // Guard against resize before init
            if (!host.app) {
                return;
            }

            host.app.resize(width, height);

            // Explicitly update app dimensions in case PicoGL doesn't
            (host.app as any).width = width;
            (host.app as any).height = height;

            // Sync widgetManager dimensions with the current UI layout space.
            const uiMetrics = host.computeUiRenderMetrics(width, height);
            host.osrsClient?.widgetManager?.resize(uiMetrics.layoutW, uiMetrics.layoutH);

            // All in-world overlays render in buffer pixel space, so their scale must match
            // renderScaleX (uiScale × DPR) so sprites/text appear the correct physical size.
            const overlayScale = uiMetrics.renderScaleX;
            if (host.overheadTextOverlay) host.overheadTextOverlay.scale = overlayScale;
            if (host.hitsplatOverlay) host.hitsplatOverlay.scale = overlayScale;
            if (host.healthBarOverlay) {
                host.healthBarOverlay.scale =
                    overlayScale * RENDER_CONSTANTS.HEALTH_BAR_VISUAL_SCALE;
            }
            if (host.clickCrossOverlay) host.clickCrossOverlay.scale = overlayScale;
            if (host.groundItemOverlay) host.groundItemOverlay.scale = overlayScale;
            (host.canvas as any).__uiRenderScale = overlayScale;

            // Trigger framebuffer recreation
            host.needsFramebufferUpdate = true;

            host.initTextureFramebuffer(width, height);
        } catch (e) {
            console.warn("[webgl] onResize error", e);
        }
    
}
