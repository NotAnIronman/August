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

export function shouldUseMobileLoginInput(host: WebGLOsrsRendererHost, ): boolean {

        const state = host.osrsClient.loginState;
        return (
            isMobileMode &&
            host.osrsClient.isOnLoginScreen() &&
            state.loginIndex === LoginIndex.LOGIN_FORM &&
            state.virtualKeyboardVisible === true
        );
    
}

export function getCanvasTouchPos(host: WebGLOsrsRendererHost, touch: Touch): { x: number; y: number } {

        const [x, y] = getMousePos(host.canvas, touch);
        return {
            x: x | 0,
            y: y | 0,
        };
    
}

export function resolveLoginFieldAt(host: WebGLOsrsRendererHost, y: number): 0 | 1 | undefined {

        if (y >= host.LOGIN_FIELD_BASE_Y - 12 && y < host.LOGIN_FIELD_BASE_Y + 3) {
            return 0;
        }
        if (y >= host.LOGIN_FIELD_BASE_Y + 3 && y < host.LOGIN_FIELD_BASE_Y + 18) {
            return 1;
        }
        return undefined;
    
}

export function resolveLoginFieldAtCanvasPoint(host: WebGLOsrsRendererHost, x: number, y: number): 0 | 1 | undefined {

        const loginRenderer = host.osrsClient.loginRenderer;
        const uiMetrics = host.computeUiRenderMetrics(host.canvas.width, host.canvas.height);
        loginRenderer.syncMobileViewportState(
            host.osrsClient.loginState,
            host.isMobileLoginKeyboardOpen(),
        );
        loginRenderer.updateLayout(
            uiMetrics.layoutW,
            uiMetrics.layoutH,
            host.canvas.width,
            host.canvas.height,
        );
        loginRenderer.setMousePosition(x, y);
        const content = loginRenderer.mapPointerToContent(
            loginRenderer.mouseX,
            loginRenderer.mouseY,
        );
        return host.resolveLoginFieldAt(content.y);
    
}

export function isMobileLoginInputActive(host: WebGLOsrsRendererHost, ): boolean {

        return host.isMobileLoginKeyboardOpen();
    
}

export function readMobileLoginViewportMetrics(host: WebGLOsrsRendererHost, ):
        | { width: number; height: number; offsetLeft: number; offsetTop: number }
        | undefined {

        if (typeof window === "undefined") {
            return undefined;
        }

        const viewport = window.visualViewport;
        const width = Math.round(viewport?.width ?? window.innerWidth ?? 0);
        const height = Math.round(viewport?.height ?? window.innerHeight ?? 0);
        if (!(width > 0) || !(height > 0)) {
            return undefined;
        }

        return {
            width,
            height,
            offsetLeft: Math.round(viewport?.offsetLeft ?? 0),
            offsetTop: Math.round(viewport?.offsetTop ?? 0),
        };
    
}

export function updateMobileLoginViewportBaseline(host: WebGLOsrsRendererHost, force: boolean = false): void {

        const viewport = host.readMobileLoginViewportMetrics();
        if (!viewport) {
            return;
        }

        const widthChanged =
            host.mobileLoginViewportBaselineWidth <= 0 ||
            Math.abs(viewport.width - host.mobileLoginViewportBaselineWidth) > 40;
        if (
            force ||
            widthChanged ||
            !host.mobileLoginInputFocused ||
            !host.mobileLoginKeyboardOpen ||
            viewport.height > host.mobileLoginViewportBaselineHeight
        ) {
            host.mobileLoginViewportBaselineWidth = viewport.width;
            host.mobileLoginViewportBaselineHeight = viewport.height;
        }
    
}

export function refreshMobileLoginKeyboardState(host: WebGLOsrsRendererHost, ): boolean {

        if (!host.mobileLoginInputFocused) {
            host.mobileLoginKeyboardOpen = false;
            host.updateMobileLoginViewportBaseline(true);
            return false;
        }

        if (typeof window === "undefined") {
            host.mobileLoginKeyboardOpen = true;
            return true;
        }

        const viewport = window.visualViewport;
        if (!viewport) {
            host.mobileLoginKeyboardOpen = true;
            return true;
        }

        const width = Math.round(viewport.width);
        const height = Math.round(viewport.height);
        const offsetTop = Math.round(viewport.offsetTop ?? 0);
        const widthChanged =
            host.mobileLoginViewportBaselineWidth <= 0 ||
            Math.abs(width - host.mobileLoginViewportBaselineWidth) > 40;
        if (widthChanged) {
            host.mobileLoginViewportBaselineWidth = width;
            host.mobileLoginViewportBaselineHeight = height;
            host.mobileLoginKeyboardOpen = false;
            return false;
        }

        if (height >= host.mobileLoginViewportBaselineHeight - 20 && offsetTop < 20) {
            host.mobileLoginViewportBaselineHeight = height;
        }

        const heightDelta = host.mobileLoginViewportBaselineHeight - height;
        host.mobileLoginKeyboardOpen = heightDelta >= 80 || offsetTop >= 40;
        return host.mobileLoginKeyboardOpen;
    
}

export function isMobileLoginKeyboardOpen(host: WebGLOsrsRendererHost, ): boolean {

        return host.refreshMobileLoginKeyboardState();
    
}

export function syncMobileLoginInputPosition(host: WebGLOsrsRendererHost, ): void {

        const input = host.mobileLoginInput;
        if (!input) {
            return;
        }

        const viewport = host.readMobileLoginViewportMetrics();
        if (!viewport) {
            input.style.left = "50%";
            input.style.top = "46%";
            input.style.transform = "translate(-50%, -50%)";
            return;
        }

        const focusRatioY = 0.46;
        input.style.left = `${viewport.offsetLeft + Math.round(viewport.width / 2)}px`;
        input.style.top = `${viewport.offsetTop + Math.round(viewport.height * focusRatioY)}px`;
        input.style.transform = "translate(-50%, -50%)";
    
}

export function requestMobileLoginKeyboard(host: WebGLOsrsRendererHost, field: 0 | 1): void {

        const state = host.osrsClient.loginState;
        state.currentLoginField = field;
        state.onMobile = true;
        state.virtualKeyboardVisible = true;
        if (!host.mobileLoginInputFocused && !host.mobileLoginKeyboardOpen) {
            host.updateMobileLoginViewportBaseline(true);
        }
        const input = host.ensureMobileLoginInput();
        if (
            input &&
            typeof document !== "undefined" &&
            document.activeElement === input &&
            !host.isMobileLoginKeyboardOpen()
        ) {
            host.allowMobileLoginInputBlur = true;
            host.preserveMobileLoginInputModeOnBlur = true;
            input.blur();
        }
        host.syncMobileLoginInput(true);
    
}

export function syncLoginRendererLayoutForCanvas(host: WebGLOsrsRendererHost, ): void {

        const loginRenderer = host.osrsClient.loginRenderer;
        const uiMetrics = host.computeUiRenderMetrics(host.canvas.width, host.canvas.height);
        loginRenderer.syncMobileViewportState(
            host.osrsClient.loginState,
            host.isMobileLoginKeyboardOpen(),
        );
        loginRenderer.updateLayout(
            uiMetrics.layoutW,
            uiMetrics.layoutH,
            host.canvas.width,
            host.canvas.height,
        );
    
}

export function getActiveLoginFieldValue(host: WebGLOsrsRendererHost, ): string {

        const state = host.osrsClient.loginState;
        return state.currentLoginField === 0 ? state.username : state.password;
    
}

export function setActiveLoginFieldValue(host: WebGLOsrsRendererHost, raw: string): void {

        const state = host.osrsClient.loginState;
        if (state.currentLoginField === 0) {
            state.username = raw.slice(0, 320);
        } else {
            state.password = raw.slice(0, 20);
        }
        state.savePersistedLoginState();
    
}

export function ensureMobileLoginInput(host: WebGLOsrsRendererHost, ): HTMLInputElement | undefined {

        if (!isMobileMode) return undefined;

        const existing = host.mobileLoginInput;
        if (existing && existing.isConnected) {
            return existing;
        }

        if (typeof document === "undefined") return undefined;

        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.autocapitalize = "none";
        input.setAttribute("autocorrect", "off");
        input.spellcheck = false;
        input.inputMode = "email";
        (input as any).enterKeyHint = "next";
        input.tabIndex = -1;
        input.style.position = "fixed";
        input.style.width = "16px";
        input.style.height = "16px";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        input.style.border = "0";
        input.style.margin = "0";
        input.style.padding = "0";
        input.style.background = "transparent";
        input.style.color = "transparent";
        input.style.caretColor = "transparent";
        input.style.fontSize = "16px";

        input.addEventListener("input", host.onMobileLoginInput);
        input.addEventListener("keydown", host.onMobileLoginKeyDown);
        input.addEventListener("focus", host.onMobileLoginInputFocus);
        input.addEventListener("blur", host.onMobileLoginInputBlur);
        document.body.appendChild(input);
        host.mobileLoginInput = input;
        host.syncMobileLoginInputPosition();
        return input;
    
}

export function destroyMobileLoginInput(host: WebGLOsrsRendererHost, ): void {

        const input = host.mobileLoginInput;
        if (!input) return;
        input.removeEventListener("input", host.onMobileLoginInput);
        input.removeEventListener("keydown", host.onMobileLoginKeyDown);
        input.removeEventListener("focus", host.onMobileLoginInputFocus);
        input.removeEventListener("blur", host.onMobileLoginInputBlur);
        try {
            input.remove();
        } catch {}
        host.mobileLoginInput = undefined;
        host.mobileLoginInputFocused = false;
        host.mobileLoginKeyboardOpen = false;
    
}

export function syncMobileLoginInput(host: WebGLOsrsRendererHost, focus: boolean): void {

        if (!host.shouldUseMobileLoginInput()) {
            const input = host.mobileLoginInput;
            if (input && document.activeElement === input) {
                host.allowMobileLoginInputBlur = true;
                host.preserveMobileLoginInputModeOnBlur = false;
                input.blur();
            }
            return;
        }

        const input = host.ensureMobileLoginInput();
        if (!input) return;

        const state = host.osrsClient.loginState;
        const wantsPassword = state.currentLoginField === 1;
        const nextType = wantsPassword ? "password" : "text";
        if (input.type !== nextType) {
            input.type = nextType;
        }
        input.inputMode = wantsPassword ? "text" : "email";
        (input as any).enterKeyHint = wantsPassword ? "go" : "next";

        const value = host.getActiveLoginFieldValue();
        if (input.value !== value) {
            input.value = value;
        }

        host.syncMobileLoginInputPosition();

        if (focus && document.activeElement !== input) {
            try {
                input.focus({ preventScroll: true });
            } catch {
                input.focus();
            }
        }
        if (focus) {
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }
    
}
