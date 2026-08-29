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

export function isBridgeSurfaceTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, plane: number): boolean {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (!map || typeof map.isBridgeSurface !== "function") return false;
        const local = host.getMapLocalTile(map, tileX, tileY);
        if (!local) {
            return false;
        }
        return map.isBridgeSurface(plane, local.x, local.y);
    
}

export function toCssEvent(host: WebGLOsrsRendererHost, 
        gx?: number,
        gy?: number,
        frameCount?: number,
    ): { clientX: number; clientY: number } | undefined {

        if (typeof gx !== "number" || typeof gy !== "number") return undefined;
        // Update cached rect once per frame (or first call)
        if (frameCount !== undefined && frameCount !== host.cachedCanvasRectFrame) {
            host.cachedCanvasRect = host.canvas.getBoundingClientRect();
            host.cachedCanvasRectFrame = frameCount;
        } else if (!host.cachedCanvasRect) {
            host.cachedCanvasRect = host.canvas.getBoundingClientRect();
        }
        const rect = host.cachedCanvasRect;
        host.cachedCssEventResult.clientX = rect.left + gx;
        host.cachedCssEventResult.clientY = rect.top + gy;
        return host.cachedCssEventResult;
    
}

export function isMouseInUIRegion(host: WebGLOsrsRendererHost, mx: number, my: number): boolean {

        return checkMouseInUIRegion(mx, my, host.canvas.width, host.canvas.height);
    
}

export function screenToRay(host: WebGLOsrsRendererHost, mouseX: number, mouseY: number): Ray | null {

        if (!host.app || !host.osrsClient.camera?.viewProjMatrix) return null;

        const camera = host.osrsClient.camera;
        if (!camera.containsScreenPoint(mouseX, mouseY)) return null;
        const width = camera.screenWidth || host.app.width;
        const height = camera.screenHeight || host.app.height;
        if (width <= 0 || height <= 0) return null;

        // Normalize to NDC
        const nx = (2 * mouseX) / width - 1;
        const ny = 1 - (2 * mouseY) / height;

        // Unproject from NDC to world using inverse view-projection
        mat4.invert(host.tmpInvViewProj, camera.viewProjMatrix);
        host.tmpNear[0] = nx;
        host.tmpNear[1] = ny;
        host.tmpNear[2] = -1;
        host.tmpNear[3] = 1;
        host.tmpFar[0] = nx;
        host.tmpFar[1] = ny;
        host.tmpFar[2] = 1;
        host.tmpFar[3] = 1;
        vec4.transformMat4(host.tmpNear, host.tmpNear, host.tmpInvViewProj);
        vec4.transformMat4(host.tmpFar, host.tmpFar, host.tmpInvViewProj);

        // Perspective divide
        const nearW = host.tmpNear[3] || 1.0;
        const farW = host.tmpFar[3] || 1.0;
        host.tmpNear[0] /= nearW;
        host.tmpNear[1] /= nearW;
        host.tmpNear[2] /= nearW;
        host.tmpFar[0] /= farW;
        host.tmpFar[1] /= farW;
        host.tmpFar[2] /= farW;

        // Create ray
        const origin = vec3.fromValues(host.tmpNear[0], host.tmpNear[1], host.tmpNear[2]);
        const farPos = vec3.fromValues(host.tmpFar[0], host.tmpFar[1], host.tmpFar[2]);
        const direction = vec3.create();
        vec3.subtract(direction, farPos, origin);
        vec3.normalize(direction, direction);

        return new Ray(origin, direction);
    
}

export function appendGroundItemMenuEntries(host: WebGLOsrsRendererHost, 
        menuEntries: OsrsMenuEntry[],
        examineEntries: OsrsMenuEntry[],
    ): void {

        const focusTile = host.osrsClient.menuTile ?? host.osrsClient.hoveredTile;
        if (!focusTile) return;
        // Ground item stacks are stored on the raw client plane even when bridge tiles render above it.
        const plane = resolveGroundItemStackPlane(host.getPlayerRawPlane() | 0);
        const stacks = host.osrsClient.getGroundItemsAt(
            focusTile.tileX | 0,
            focusTile.tileY | 0,
            plane | 0,
        );
        if (!stacks || stacks.length === 0) return;
        for (const stack of stacks) {
            const label = stack.quantity > 1 ? `${stack.name} x ${stack.quantity}` : stack.name;
            const tile = {
                tileX: stack.tile.x | 0,
                tileY: stack.tile.y | 0,
                plane: stack.tile.level | 0,
            };
            menuEntries.push({
                option: "Take",
                targetId: stack.itemId,
                targetType: MenuTargetType.OBJ,
                targetName: label,
                targetLevel: stack.tile.level | 0,
                tile,
                onClick: () => host.osrsClient.takeGroundItem(stack),
            });
            examineEntries.push({
                option: "Examine",
                targetId: stack.itemId,
                targetType: MenuTargetType.OBJ,
                targetName: stack.name,
                targetLevel: stack.tile.level | 0,
                tile,
                onClick: () => host.osrsClient.examineGroundItem(stack),
            });
        }
    
}
