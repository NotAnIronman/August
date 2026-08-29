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
import type { WebGLOsrsRenderer } from "@client/engine/rendering/WebGLOsrsRenderer";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";

export function ensureOverlayUpdateArgs(host: WebGLOsrsRendererHost, scenePass: boolean): OverlayUpdateArgs {

        const key = scenePass ? "cachedSceneOverlayUpdateArgs" : "cachedOverlayUpdateArgs";
        let args = host[key];
        if (!args) {
            args = {
                time: 0,
                delta: 0,
                resolution: { width: 0, height: 0 },
                state: {
                    hoverEnabled: false,
                    hoverTile: { x: 0, y: 0 },
                    playerLevel: 0,
                    playerRawLevel: 0,
                    destTile: undefined,
                    currentTile: undefined,
                    tileHighlights: undefined,
                    clientTickPhase: 0,
                    playerWorldX: undefined,
                    playerWorldZ: undefined,
                    actorServerTiles: undefined,
                },
                helpers: host.getOverlayHelpers(),
            };
            host[key] = args;
        }
        return args;
    
}

export function syncTileMarkerOverlayConfig(host: WebGLOsrsRendererHost, tileMarkersConfig: TileMarkersPluginConfig): void {

        if (!host.tileMarkerOverlay) {
            return;
        }
        host.tileMarkerOverlay.setDestinationColor(tileMarkersConfig.destinationTileColor);
        host.tileMarkerOverlay.setCurrentTileColor(tileMarkersConfig.currentTileColor);
    
}

export function populateTileMarkerOverlayState(host: WebGLOsrsRendererHost, 
        state: OverlayUpdateArgs["state"],
        tileMarkersConfig: TileMarkersPluginConfig,
        playerLevel: number,
        playerRawLevel: number,
    ): void {
        state.hoverEnabled = !!host.osrsClient.hoverOverlayEnabled;
        if (host.hoverTileX !== -1 && host.hoverTileY !== -1) {
            if (!state.hoverTile) {
                state.hoverTile = { x: 0, y: 0 };
            }
            state.hoverTile.x = host.hoverTileX | 0;
            state.hoverTile.y = host.hoverTileY | 0;
            const picked = host.osrsClient.hoveredTile;
            state.hoverTile.plane =
                picked &&
                (picked.tileX | 0) === state.hoverTile.x &&
                (picked.tileY | 0) === state.hoverTile.y
                    ? picked.plane
                    : undefined;
        } else {
            state.hoverTile = undefined;
        }

        state.playerLevel = playerLevel;
        state.playerRawLevel = playerRawLevel;
        state.destTile = undefined;
        state.currentTile = undefined;

        const destWorldX = ClientState.destinationWorldX | 0;
        const destWorldY = ClientState.destinationWorldY | 0;
        let activeDestX = destWorldX;
        let activeDestY = destWorldY;
        if (activeDestX === 0 && activeDestY === 0) {
            const destLocalX = ClientState.destinationX | 0;
            const destLocalY = ClientState.destinationY | 0;
            if (destLocalX !== 0 || destLocalY !== 0) {
                activeDestX = ClientState.localToWorldX(destLocalX) | 0;
                activeDestY = ClientState.localToWorldY(destLocalY) | 0;
            }
        }
        const hasActiveDestination = activeDestX !== 0 || activeDestY !== 0;
        const nativeTileHighlights = host.osrsClient.tileHighlightManager.getRenderEntries();
        const shouldOwnDestinationTile =
            tileMarkersConfig.enabled &&
            tileMarkersConfig.showDestinationTile &&
            hasActiveDestination;
        const destinationColor = tileMarkersConfig.destinationTileColor & 0xffffff;
        const defaultNativeDestinationColor = 0xa9a753;
        const visibleTileHighlights = shouldOwnDestinationTile
            ? nativeTileHighlights.filter((highlight) => {
                if ((highlight.slot | 0) === 4) {
                    return false;
                }
                const color = highlight.colorRgb & 0xffffff;
                return color !== destinationColor && color !== defaultNativeDestinationColor;
            })
            : nativeTileHighlights;
        state.tileHighlights = visibleTileHighlights.length > 0 ? visibleTileHighlights : undefined;

        if (!tileMarkersConfig.enabled) {
            return;
        }

        const nativeHasCurrentTile = visibleTileHighlights.some(
            (highlight) => (highlight.slot | 0) === 3,
        );
        if (tileMarkersConfig.showDestinationTile && hasActiveDestination) {
            if (!state.destTile) {
                state.destTile = { x: 0, y: 0 };
            }
            state.destTile.x = activeDestX;
            state.destTile.y = activeDestY;
        }

        if (!tileMarkersConfig.showCurrentTile || nativeHasCurrentTile) {
            return;
        }

        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        if (controlledServerId <= 0) {
            return;
        }

        const movementState = host.osrsClient.playerMovementSync?.getState?.(controlledServerId);
        if (!movementState) {
            return;
        }

        const ecsIndex = movementState.ecsIndex | 0;
        const isMoving = ecsIndex >= 0 && host.osrsClient.playerEcs.isMoving(ecsIndex);
        if (!isMoving) {
            return;
        }

        if (!state.currentTile) {
            state.currentTile = { x: 0, y: 0, plane: 0 };
        }
        state.currentTile.x = movementState.tileX | 0;
        state.currentTile.y = movementState.tileY | 0;
        state.currentTile.plane = host.getHeightSamplePlaneForTile(
            movementState.tileX | 0,
            movementState.tileY | 0,
            host.getPlayerRawPlane() | 0,
        );
    }

export function drawSceneTileOverlays(host: WebGLOsrsRendererHost, time: number, deltaTime: number): void {

        if (host.uiHidden || !host.overlayManager || !host.tileMarkerOverlay) {
            return;
        }

        const tileMarkersConfig = host.osrsClient.tileMarkersPlugin.getConfig();
        host.syncTileMarkerOverlayConfig(tileMarkersConfig);

        const playerLevel = host.getPlayerBasePlane() | 0;
        const playerRawLevel = host.getPlayerRawPlane() | 0;
        const args = host.ensureOverlayUpdateArgs(true);
        args.time = time;
        args.delta = deltaTime;
        args.resolution.width = host.app.width;
        args.resolution.height = host.app.height;
        host.populateTileMarkerOverlayState(
            args.state,
            tileMarkersConfig,
            playerLevel,
            playerRawLevel,
        );
        args.state.clientTickPhase = host.clientTickPhase;
        args.state.playerWorldX = undefined;
        args.state.playerWorldZ = undefined;
        args.state.actorServerTiles = undefined;
        args.state.hitsplats = undefined;
        args.state.healthBars = undefined;
        args.state.overheadTexts = undefined;
        args.state.overheadPrayers = undefined;
        args.state.groundItems = undefined;
        host.overlayManager.update(args);
        host.overlayManager.draw(RenderPhase.ToSceneFramebuffer);
    
}

export function getOverlayHelpers(host: WebGLOsrsRendererHost, ): NonNullable<WebGLOsrsRenderer["cachedOverlayHelpers"]> {

        if (!host.cachedOverlayHelpers) {
            host.cachedOverlayHelpers = {
                getTileHeightAtPlane: host.getTileHeightAtPlane.bind(host),
                getMinTileHeightInRadius: host.getMinTileHeightInRadius.bind(host),
                sampleHeightAtExactPlane: host.sampleHeightAtExactPlane.bind(host),
                getHeightSamplePlaneForTile: host.getHeightSamplePlaneForTile.bind(host),
                getEffectivePlaneForTile: host.getEffectivePlaneForTile.bind(host),
                getOccupancyPlaneForTile: host.getOccupancyPlaneForTile.bind(host),
                getTileRenderFlagAt: host.getTileRenderFlagAt.bind(host),
                isBridgeSurfaceTile: host.isBridgeSurfaceTile.bind(host),
                worldToScreen: host.worldToScreen.bind(host),
                getCollisionFlagAt: host.getCollisionFlagAt.bind(host),
            };
        }
        return host.cachedOverlayHelpers;
    
}

export function getTileRenderFlagAt(host: WebGLOsrsRendererHost, level: number, tileX: number, tileY: number): number {

        return lookupTileRenderFlagAt(host.mapManager, level, tileX, tileY);
    
}
