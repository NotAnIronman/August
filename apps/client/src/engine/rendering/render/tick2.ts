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

export function registerNpcSceneTileCandidatesByPriority(host: WebGLOsrsRendererHost, 
        drawPriority: NpcDrawPriority,
        priority: number,
        renderableNpcIds: Set<number>,
    ): void {
        // NPCs do not take part in the normal player-on-player winner
        // selection. A local observer should only suppress a 1x1 NPC that is
        // directly underneath *their own* player; remote observers see both
        // actors. Keep this exported no-op for the existing render call sites.
        void host;
        void drawPriority;
        void priority;
        void renderableNpcIds;
    
}

export function isPlayerSceneTileMarkerCandidate(host: WebGLOsrsRendererHost, pid: number): boolean {

        const pe = host.osrsClient.playerEcs;
        const px = pe.getX(pid) | 0;
        const py = pe.getY(pid) | 0;
        return (px & 127) === 64 && (py & 127) === 64;
    
}

export function isNpcSceneTileMarkerCandidate(host: WebGLOsrsRendererHost, ecsId: number): boolean {

        const npcEcs = host.osrsClient.npcEcs;
        if ((npcEcs.getSize(ecsId) | 0) !== 1) {
            return false;
        }

        const worldX = npcEcs.getWorldX(ecsId) | 0;
        const worldY = npcEcs.getWorldY(ecsId) | 0;
        return (worldX & 127) === 64 && (worldY & 127) === 64;
    
}

export function getEffectiveNpcType(host: WebGLOsrsRendererHost, npcTypeId: number): NpcType | undefined {

        if (npcTypeId < 0) {
            return undefined;
        }

        try {
            const base = host.osrsClient.npcTypeLoader.load(npcTypeId);
            if (!base) {
                return undefined;
            }
            if (!base.transforms) {
                return base;
            }
            return base.transform(host.osrsClient.varManager, host.osrsClient.npcTypeLoader);
        } catch {
            return undefined;
        }
    
}

export function getCombatTargetPlayerEcsIndex(host: WebGLOsrsRendererHost, ): number | undefined {

        const targetServerId = ClientState.combatTargetPlayerIndex | 0;
        if ((targetServerId | 0) < 0) {
            return undefined;
        }

        return host.osrsClient.playerEcs.getIndexForServerId(targetServerId | 0);
    
}

export function shouldRenderPlayerIndex(host: WebGLOsrsRendererHost, pid: number): boolean {

        const renderSelf = host.osrsClient.renderSelf !== false;
        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        const controlledPid =
            controlledServerId >= 0
                ? host.osrsClient.playerEcs.getIndexForServerId(controlledServerId)
                : undefined;
        if (!renderSelf && controlledPid !== undefined && (pid | 0) === (controlledPid | 0)) {
            return false;
        }
        if (host.osrsClient.playerEcs.getIsHidden(pid | 0)) {
            return false;
        }
        if (!host.isPlayerSceneTileMarkerCandidate(pid)) {
            return true;
        }

        host.ensureActorTileSelectionForFrame();
        const pe = host.osrsClient.playerEcs;
        const tileKey = host.getActorTileSelectionKey(
            (pe.getX(pid) >> 7) | 0,
            (pe.getY(pid) >> 7) | 0,
            pe.getLevel(pid) | 0,
        );
        const winner = host.frameWinningActorByTile.get(tileKey);
        return winner?.kind === "player" && (winner.id | 0) === (pid | 0);
    
}

export function shouldRenderNpcOwnershipFromMap(host: WebGLOsrsRendererHost, map: WebGLMapSquare, ecsId: number): boolean {

        const ecs = host.osrsClient.npcEcs;
        if (!ecs.isActive(ecsId) || !ecs.isLinked(ecsId)) return false;

        const worldViewId = ecs.getWorldViewId(ecsId) | 0;
        if (worldViewId >= 0) {
            const worldView = host.osrsClient.worldViewManager.getWorldView(worldViewId);
            if (!worldView) {
                // Private map instances use world-view IDs for server isolation,
                // but they render in the ordinary instance scene rather than a
                // sailing/world-entity overlay map.
                if (!host.instanceActive) return false;
            } else {
                if ((map.id | 0) === (worldView.overlayMapId | 0)) {
                    return true;
                }

                const overlayMap = host.mapManager.mapSquares.get(worldView.overlayMapId) as
                    | WebGLMapSquare
                    | undefined;
                if (overlayMap?.npcEntityIds?.indexOf(ecsId | 0) !== -1) {
                    for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
                        if (host.mapManager.visibleMaps[i] === overlayMap) {
                            return false;
                        }
                    }
                }
            }
        }

        const ownerMapX = ecs.getMapX(ecsId) | 0;
        const ownerMapY = ecs.getMapY(ecsId) | 0;
        if ((ownerMapX | 0) === (map.mapX | 0) && (ownerMapY | 0) === (map.mapY | 0)) {
            return true;
        }

        const ownerMap = host.mapManager.getMap(ownerMapX, ownerMapY) as WebGLMapSquare | undefined;
        if (!ownerMap?.npcEntityIds || ownerMap.npcEntityIds.indexOf(ecsId | 0) === -1) {
            return true;
        }

        for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
            if (host.mapManager.visibleMaps[i] === ownerMap) {
                return false;
            }
        }

        return true;
    
}

export function shouldRenderNpcFromMap(host: WebGLOsrsRendererHost, map: WebGLMapSquare, ecsId: number): boolean {

        if (!host.shouldRenderNpcOwnershipFromMap(map, ecsId)) {
            return false;
        }
        if (!host.getEffectiveNpcType(host.osrsClient.npcEcs.getNpcTypeId(ecsId) | 0)) {
            return false;
        }
        if (!host.isNpcSceneTileMarkerCandidate(ecsId)) {
            return true;
        }

        const npcEcs = host.osrsClient.npcEcs;
        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        const controlledPid =
            controlledServerId >= 0
                ? host.osrsClient.playerEcs.getIndexForServerId(controlledServerId)
                : undefined;
        if (controlledPid === undefined || !host.isPlayerSceneTileMarkerCandidate(controlledPid)) {
            return true;
        }

        const players = host.osrsClient.playerEcs;
        return !(
            (players.getX(controlledPid) >> 7) === (npcEcs.getWorldX(ecsId) >> 7) &&
            (players.getY(controlledPid) >> 7) === (npcEcs.getWorldY(ecsId) >> 7) &&
            (players.getLevel(controlledPid) | 0) === (npcEcs.getLevel(ecsId) | 0)
        );
    
}
