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

export function getControlledPlayerEcsIndex(host: WebGLOsrsRendererHost, ): number | undefined {

        const playerEcs = host.osrsClient.playerEcs;
        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;

        if (controlledServerId > 0) {
            try {
                const controlledIndex = playerEcs.getIndexForServerId(controlledServerId);
                if (controlledIndex !== undefined) {
                    return controlledIndex | 0;
                }
            } catch {}
        }

        try {
            const size = playerEcs.size?.() ?? (playerEcs as any).size?.() ?? 0;
            if (size > 0) {
                return 0;
            }
        } catch {}

        return undefined;
    
}

export function getPlayerBasePlane(host: WebGLOsrsRendererHost, ): number {

        let rawPlane = 0;
        const idx = host.getControlledPlayerEcsIndex();
        if (idx !== undefined) {
            rawPlane = host.osrsClient.playerEcs.getLevel(idx) | 0;
        }

        // If the plane above has the bridge flag, the player renders at that plane.
        const playerTile = host.getPlayerTileXY();
        if (!playerTile) {
            return rawPlane; // Can't check for bridges if we don't know the player's tile
        }

        return resolveBridgePromotedPlane(host.mapManager, rawPlane, playerTile);
    
}

export function getPlayerRawPlane(host: WebGLOsrsRendererHost, ): number {

        const idx = host.getControlledPlayerEcsIndex();
        if (idx !== undefined) return host.osrsClient.playerEcs.getLevel(idx) | 0;
        return 0;
    
}

export function getPlayerTileXY(host: WebGLOsrsRendererHost, ): { x: number; y: number } {

        const controlledIndex = host.getControlledPlayerEcsIndex();
        if (controlledIndex !== undefined) {
            return {
                x: (host.osrsClient.playerEcs.getX(controlledIndex) / 128) | 0,
                y: (host.osrsClient.playerEcs.getY(controlledIndex) / 128) | 0,
            };
        }
        // Fallback to camera tile if no player
        return {
            x: Math.floor(host.osrsClient.camera.getPosX()),
            y: Math.floor(host.osrsClient.camera.getPosZ()),
        };
    
}

export function getCameraTileXY(host: WebGLOsrsRendererHost, ): { x: number; y: number } {

        return {
            x: Math.floor(host.osrsClient.camera.getPosX()),
            y: Math.floor(host.osrsClient.camera.getPosZ()),
        };
    
}

export function clampCullTileToGridBounds(host: WebGLOsrsRendererHost, tile: { x: number; y: number }): { x: number; y: number } {

        const bounds = host.mapManager.getGridTileBounds();
        if (!bounds) {
            return { x: tile.x | 0, y: tile.y | 0 };
        }
        const minX = bounds.minX | 0;
        const minY = bounds.minY | 0;
        // Grid bounds use exclusive max edge in world tiles.
        const maxX = Math.max(minX, (bounds.maxX | 0) - 1);
        const maxY = Math.max(minY, (bounds.maxY | 0) - 1);
        return {
            x: Math.max(minX, Math.min(maxX, tile.x | 0)),
            y: Math.max(minY, Math.min(maxY, tile.y | 0)),
        };
    
}

export function getRenderCullTile(host: WebGLOsrsRendererHost, ): { x: number; y: number } {

        // Scene draw-distance is camera-anchored, then clamped to the loaded grid bounds.
        return host.clampCullTileToGridBounds(host.getCameraTileXY());
    
}

export function getRoofTargetTile(host: WebGLOsrsRendererHost, 
        playerTile: { x: number; y: number },
        cameraTile: { x: number; y: number },
    ): { x: number; y: number } {

        // In follow mode the camera focal point tracks the player tile. In free-camera
        // mode there is no focal state, so the camera tile stands in for it.
        return host.osrsClient.followPlayerCamera ? playerTile : cameraTile;
    
}

export function getCameraPitchRs(host: WebGLOsrsRendererHost, ): number {

        const pitch = clamp(host.osrsClient.camera.pitch | 0, 0, 512);
        return 128 + Math.floor((pitch * 255) / 512);
    
}

export function computeFrameRoofPlaneLimit(host: WebGLOsrsRendererHost, ): number {

        const cameraTile = host.getCameraTileXY();
        const playerTile = host.getPlayerTileXY();

        return computeRoofPlaneLimit(host.mapManager, host.maxLevel, {
            playerRawPlane: host.getPlayerBasePlane() | 0,
            cameraPitch: host.getCameraPitchRs(),
            roofsHidden: host.osrsClient.roofsHidden,
            cameraTile,
            playerTile,
            targetTile: host.getRoofTargetTile(playerTile, cameraTile),
        });
    
}

export function getRoofPlaneLimit(host: WebGLOsrsRendererHost, ): number {

        if (host.roofPlaneLimit === undefined) {
            host.roofPlaneLimit = host.computeFrameRoofPlaneLimit();
        }
        return host.roofPlaneLimit;
    
}

export function invalidateRoofState(host: WebGLOsrsRendererHost, ): void {

        host.roofPlaneLimit = undefined;
    
}

export function getControlledPlayerWorldViewId(host: WebGLOsrsRendererHost, ): number {

        const idx = host.osrsClient.playerEcs.getIndexForServerId(
            host.osrsClient.controlledPlayerServerId,
        );
        return idx !== undefined ? host.osrsClient.playerEcs.getWorldViewId(idx) | 0 : -1;
    
}
