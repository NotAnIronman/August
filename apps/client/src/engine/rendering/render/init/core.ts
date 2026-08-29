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
import { isSafari } from "@client/core/platform/device/DeviceUtil";
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
import { RENDER_CONSTANTS, optimizeAssumingFlatsHaveSameFirstAndLastData } from "@client/engine/rendering/render/constants";
import { initRenderer } from "@client/engine/rendering/render/handlers";

export async function init(host: WebGLOsrsRendererHost, ): Promise<void> {

        await initRenderer(host);
        host.canvas.addEventListener("touchstart", host.onCanvasTouchStart, {
            passive: false,
            capture: true,
        });
        if (isMobileMode) {
            host.ensureMobileLoginInput();
            host.updateMobileLoginViewportBaseline();
            window.addEventListener("resize", host.onMobileLoginViewportChange);
            window.addEventListener("orientationchange", host.onMobileLoginViewportChange);
            window.visualViewport?.addEventListener("resize", host.onMobileLoginViewportChange);
            window.visualViewport?.addEventListener("scroll", host.onMobileLoginViewportChange);
        }

        host.app = PicoGL.createApp(host.canvas);
        // Ensure app dimensions are initialized from canvas
        (host.app as any).width = host.canvas.width;
        (host.app as any).height = host.canvas.height;
        host.gl = host.app.gl as WebGL2RenderingContext;

        // Initialize widget manager with the active UI layout space.
        if (host.osrsClient.widgetManager) {
            const metrics = host.computeUiRenderMetrics(
                host.canvas.width | 0,
                host.canvas.height | 0,
            );
            host.osrsClient.widgetManager.resize(metrics.layoutW, metrics.layoutH);
        }

        host.hitsplatTickUnsub = subscribeTick((tick) => host.onServerTick(tick));

        // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_webgl_provoking_vertex_when_its_available
        optimizeAssumingFlatsHaveSameFirstAndLastData(host.gl);

        host.timer = host.app.createTimer();

        // Prefer the multi-draw extension when available; fall back to explicit single draws otherwise.
        // Safari's Metal ANGLE advertises WEBGL_multi_draw but then fails at draw time with
        // attribute-type mismatches in glMultiDrawArraysInstancedANGLE.
        const state: any = host.app.state;
        const ext = isSafari ? null : host.gl.getExtension("WEBGL_multi_draw");
        PicoGL.WEBGL_INFO.MULTI_DRAW_INSTANCED = ext;
        state.extensions.multiDrawInstanced = ext;

        host.hasMultiDraw = !!ext;
        host.drawBackend?.dispose();
        host.drawBackend = createDrawBackend(host.hasMultiDraw);
        host.drawBackend.init(host.app, host.gl);

        if (!ext) {
            console.warn(
                isSafari
                    ? "Disabling WEBGL_multi_draw on Safari/WebKit; using single-draw fallback."
                    : "WEBGL_multi_draw extension not available! Rendering may not work correctly. " +
                      "Falling back to single-draw rendering; this is slower but supported.",
            );
        }

        host.osrsClient.workerPool.initLoader(host.dataLoader);

        host.gl.getExtension("EXT_float_blend");

        host.app.enable(PicoGL.CULL_FACE);
        host.app.enable(PicoGL.DEPTH_TEST);
        host.app.depthFunc(PicoGL.LEQUAL);

        host.app.enable(PicoGL.BLEND);
        host.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);
        host.app.clearColor(host.skyColor[0], host.skyColor[1], host.skyColor[2], host.skyColor[3]);

        host.quadPositions = host.app.createVertexBuffer(
            PicoGL.FLOAT,
            2,
            new Float32Array([-1, 1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1]),
        );
        host.quadArray = host.app.createVertexArray().vertexAttributeBuffer(0, host.quadPositions);

        host.shadersPromise = host.initShaders();

        host.sceneUniformBuffer = host.app.createUniformBuffer([
            PicoGL.FLOAT_MAT4, // mat4 u_viewProjMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_viewMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_projectionMatrix;
            PicoGL.FLOAT_VEC4, // vec4 u_skyColor;
            PicoGL.FLOAT_VEC4, // vec4 u_sceneHslOverride;
            PicoGL.FLOAT_VEC2, // vec2 u_cameraPos;
            PicoGL.FLOAT_VEC2, // vec2 u_playerPos;
            PicoGL.FLOAT, // float u_renderDistance;
            PicoGL.FLOAT, // float u_fogDepth;
            PicoGL.FLOAT, // float u_currentTime;
            PicoGL.FLOAT, // float u_brightness;
            PicoGL.FLOAT, // float u_colorBanding;
            PicoGL.FLOAT, // float u_isNewTextureAnim;
        ]);

        host.initFramebuffers();
        await host.initWaterTextures();

        host.initTextures();

        console.log("Renderer init");

        // Build player geometry once (uses current cache + textures)
        try {
            await host.playerRenderer.initGeometry();
        } catch (e) {
            console.warn("Failed to init player geometry", e);
        }

        // Initialize dynamic NPC animation loader ( - load animations at render time)
        host.initDynamicNpcAnimLoader();

        try {
            host.osrsClient.notifyRendererReady();
        } catch {}
    
}
