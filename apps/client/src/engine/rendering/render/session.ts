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
import { cleanUpRenderer } from "@client/engine/rendering/render/handlers";

export function clearSessionCaches(host: WebGLOsrsRendererHost, ): void {

        // Clear NPC type caches (grow with each unique NPC type seen)
        host.npcDefaultHeightCache.clear();
        host.npcNameCache.clear();

        // Clear hitsplat/health bar state
        host.npcHitsplats.clear();
        host.playerHitsplats.clear();
        host.npcHealthBars.clear();
        host.playerHealthBars.clear();
        host.hitsplatSeenNpc.clear();
        host.actorServerTilesSeenNpc.clear();

        // Clear loc overrides and spawns (door state changes accumulate)
        host.locOverrides.clear();
        for (const timer of host.locAnimTimers.values()) {
            clearTimeout(timer);
        }
        host.locAnimTimers.clear();
        host.locSpawns.clear();
        host.terrainOverrides.clear();
        host.gamemodeWorldLocOverrideKeys.clear();
        host.gamemodeWorldLocSpawnKeys.clear();
        host.gamemodeWorldTerrainOverrideKeys.clear();
        host.mapsToLoad.clear();
        host.pendingStreamMapsByGeneration.clear();
        host.observedGridRevision = -1;
        host.activeStreamGeneration = 0;
        host.activeStreamExpectedMapIds.clear();
        host.pendingLocUpdates.clear();
        host.pendingLocGeometryUpdates.clear();
        host.pendingDoorLocUpdates.clear();
        host.pendingLocReloadMaps.clear();
        host.pendingLocReloadBatches.clear();
        host.queuedLocReloadBatchByMap.clear();
        host.nextLocReloadBatchId = 1;
        if (host.pendingLocReloadFlushTimer) {
            clearTimeout(host.pendingLocReloadFlushTimer);
            host.pendingLocReloadFlushTimer = undefined;
        }

        // Clear ground item rendering caches
        host.groundItemStacks.clear();
        host.groundItemStackHashes.clear();
        host.clearInteractHighlightActiveTarget();
        host.clearInteractHighlightHoverTarget();
        host.interactHighlightDrawTargets.length = 0;

        // Clear minimap icons
        host.minimapIcons.clear();

        // Clear cached overlay state
        host.cachedSceneOverlayUpdateArgs = null;
        host.cachedOverlayUpdateArgs = null;

        // Clear debug counts
        host.projectileRenderDebugCounts.clear();

        // Clear cached type IDs
        host.cachedLocIds.clear();
        host.cachedObjIds.clear();
        host.cachedNpcIds.clear();
        host.interactLocModelLoader?.clearCache();
        host.interactNpcModelLoader?.clearCache();
        host.sceneRaycaster?.clearCache();
        host.clearDynamicNpcAnimRuntimeState();

        // Reset camera follow state for next login
        host.followCamFocalInitialized = false;
        host.followCamFocalLastClientCycle = -1;
        host.cameraTerrainPitchPressure = 0;
        host.clearCameraShake();
        host.mapDataLoadedNotified = false;
        host.heightValidAtTime = undefined;
    
}

export async function cleanUp(host: WebGLOsrsRendererHost, ): Promise<void> {

        cleanUpRenderer(host);
        host.canvas.removeEventListener("touchstart", host.onCanvasTouchStart, true);
        if (isMobileMode && typeof window !== "undefined") {
            window.removeEventListener("resize", host.onMobileLoginViewportChange);
            window.removeEventListener("orientationchange", host.onMobileLoginViewportChange);
            window.visualViewport?.removeEventListener("resize", host.onMobileLoginViewportChange);
            window.visualViewport?.removeEventListener("scroll", host.onMobileLoginViewportChange);
        }
        host.destroyMobileLoginInput();
        host.playerHealthBars.clear();
        try {
            host.overlayManager?.dispose();
            host.hitsplatTickUnsub?.();
            host.hitsplatTickUnsub = undefined;
        } catch {}
        host.overlayManager = undefined;
        host.interactHighlightOverlay = undefined;
        host.healthBarOverlay = undefined;
        host.tileMarkerOverlay = undefined;
        host.clearInteractHighlightActiveTarget();
        host.clearInteractHighlightHoverTarget();
        host.interactHighlightDrawTargets.length = 0;
        host.interactLocModelLoader = undefined;
        host.interactNpcModelLoader = undefined;
        host.npcHealthBars.clear();
        host.osrsClient.workerPool.resetLoader(host.dataLoader);

        host.quadArray?.delete();
        host.quadArray = undefined;

        host.quadPositions?.delete();
        host.quadPositions = undefined;

        // Uniforms
        host.sceneUniformBuffer?.delete();
        host.sceneUniformBuffer = undefined;

        // Framebuffers
        host.framebuffer?.delete();
        host.framebuffer = undefined;

        host.colorTarget?.delete();
        host.colorTarget = undefined;

        host.depthTarget?.delete();
        host.depthTarget = undefined;

        host.textureFramebuffer?.delete();
        host.textureFramebuffer = undefined;

        host.textureColorTarget?.delete();
        host.textureColorTarget = undefined;

        host.textureDepthTarget?.delete();
        host.textureDepthTarget = undefined;

        // Textures
        host.textureArray?.delete();
        host.textureArray = undefined;

        host.textureMaterials?.delete();
        host.textureMaterials = undefined;

        host.waterTextures?.delete();
        host.waterTextures = undefined;

        host.drawBackend?.dispose();
        host.drawBackend = undefined;

        // Unified actor texture cleanup handled by actorDataTextureBuffer below
        for (const texture of host.actorDataTextureBuffer) {
            texture?.delete();
        }

        host.clearMaps();
        host.disposeDynamicNpcAnimState();

        if (host.shadersPromise) {
            for (const shader of await host.shadersPromise) {
                shader.delete();
            }
            host.shadersPromise = undefined;
        }
        console.log("Renderer cleaned up");
    
}
