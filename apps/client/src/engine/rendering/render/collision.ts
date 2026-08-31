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

export function getCollisionFlagAt(host: WebGLOsrsRendererHost, level: number, tileX: number, tileY: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY) as any;
        if (!map || typeof (map as any).getCollisionFlag !== "function") {
            return CollisionFlag.OBJECT_ROUTE_BLOCKER;
        }
        const local = host.getMapLocalTile(map, tileX, tileY);
        if (!local) return CollisionFlag.OBJECT_ROUTE_BLOCKER;
        return (map as any).getCollisionFlag(level | 0, local.x, local.y) | 0;
    
}

export function getLocIdsAtTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number[] {

        try {
            const map = host.getPreferredMapForWorldTile(tileX, tileY) as any;
            if (!map || typeof (map as any).getLocIdsAtLocal !== "function") return [];
            const local = host.getMapLocalTile(map, tileX, tileY);
            if (!local) return [];
            const effPlane = host.getEffectivePlaneForTile(tileX, tileY, basePlane) | 0;
            return (map as any).getLocIdsAtLocal(effPlane, local.x, local.y) as number[];
        } catch {
            return [];
        }
    
}

export function getLocIdsAtTileAllLevels(host: WebGLOsrsRendererHost, 
        tileX: number,
        tileY: number,
    ): { id: number; level: number; typeRot?: number }[] {

        try {
            const map = host.getPreferredMapForWorldTile(tileX, tileY) as any;
            if (!map || typeof (map as any).getLocIdsAtLocal !== "function") return [];
            const local = host.getMapLocalTile(map, tileX, tileY);
            if (!local) return [];
            const out: { id: number; level: number; typeRot?: number }[] = [];
            for (let lvl = 0; lvl < 4; lvl++) {
                const ids = (map as any).getLocIdsAtLocal(lvl, local.x, local.y) as number[];
                const typeRots =
                    typeof (map as any).getLocTypeRotsAtLocal === "function"
                        ? ((map as any).getLocTypeRotsAtLocal(lvl, local.x, local.y) as number[])
                        : undefined;
                if (!ids) continue;
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i] | 0;
                    const typeRot =
                        typeRots && i < typeRots.length ? (typeRots[i] | 0) & 0xff : undefined;
                    out.push({ id, level: lvl | 0, typeRot });
                }
            }
            return out;
        } catch {
            return [];
        }
    
}

export function resolveLocInteractionTile(host: WebGLOsrsRendererHost, 
        locId: number,
        approx: { tileX: number; tileY: number; plane?: number },
    ): { tileX: number; tileY: number; plane?: number; typeRot?: number } {

        const basePlane = host.getPlayerBasePlane() | 0;
        const fallbackPlane =
            typeof approx.plane === "number" ? (approx.plane as number) | 0 : basePlane;
        const match = host.findNearestLocTile(locId, approx.tileX | 0, approx.tileY | 0, basePlane);
        if (match) {
            return match;
        }
        return {
            tileX: approx.tileX | 0,
            tileY: approx.tileY | 0,
            plane: fallbackPlane,
            typeRot: host.resolveLocTypeRotAtTile(
                locId | 0,
                approx.tileX | 0,
                approx.tileY | 0,
                fallbackPlane | 0,
            ),
        };
    
}

export function isLocalPlayerAdjacentToLoc(host: WebGLOsrsRendererHost, 
        locId: number,
        tile: { tileX: number; tileY: number },
    ): boolean {

        const playerTile = host.getLocalPlayerTile();
        if (!playerTile) return false;
        const size = host.getLocSize(locId | 0);
        if (!size) return false;
        const minX = tile.tileX | 0;
        const minY = tile.tileY | 0;
        const maxX = minX + Math.max(1, size.sizeX | 0) - 1;
        const maxY = minY + Math.max(1, size.sizeY | 0) - 1;
        const clampedX = clamp(playerTile.x | 0, minX, maxX);
        const clampedY = clamp(playerTile.y | 0, minY, maxY);
        const dx = Math.abs((playerTile.x | 0) - clampedX);
        const dy = Math.abs((playerTile.y | 0) - clampedY);
        return dx <= 1 && dy <= 1;
    
}

export function getLocalPlayerTile(host: WebGLOsrsRendererHost, ): { x: number; y: number } | undefined {

        const serverId = host.osrsClient.controlledPlayerServerId | 0;
        if (!(serverId >= 0)) return undefined;
        const state = host.osrsClient.playerMovementSync?.getState?.(serverId);
        if (!state) return undefined;
        return { x: state.tileX | 0, y: state.tileY | 0 };
    
}

export function getLocSize(host: WebGLOsrsRendererHost, locId: number): { sizeX: number; sizeY: number } | undefined {

        const loader: any = (host.osrsClient as any)?.locTypeLoader;
        if (!loader?.load) return undefined;
        try {
            const loc = loader.load(locId | 0);
            if (!loc) return undefined;
            const sizeX = Math.max(1, Number(loc.sizeX ?? 1));
            const sizeY = Math.max(1, Number(loc.sizeY ?? 1));
            return { sizeX, sizeY };
        } catch {
            return undefined;
        }
    
}

export function findNearestLocTile(host: WebGLOsrsRendererHost, 
        locId: number,
        tileX: number,
        tileY: number,
        basePlane: number,
        maxRadius: number = 8,
    ): { tileX: number; tileY: number; plane: number; typeRot?: number } | undefined {

        const targetId = locId | 0;
        for (let radius = 0; radius <= maxRadius; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const cx = tileX + dx;
                    const cy = tileY + dy;
                    const locs = host.getLocIdsAtTileAllLevels(cx, cy);
                    if (!locs.length) continue;
                    let bestPlane: number | undefined;
                    let bestTypeRot: number | undefined;
                    let bestScore = Number.POSITIVE_INFINITY;
                    for (const loc of locs) {
                        if ((loc.id | 0) !== targetId) continue;
                        const diff = Math.abs((loc.level | 0) - (basePlane | 0));
                        if (diff < bestScore) {
                            bestScore = diff;
                            bestPlane = loc.level | 0;
                            bestTypeRot =
                                typeof loc.typeRot === "number"
                                    ? (loc.typeRot | 0) & 0xff
                                    : undefined;
                        }
                    }
                    if (bestPlane !== undefined) {
                        return { tileX: cx, tileY: cy, plane: bestPlane, typeRot: bestTypeRot };
                    }
                }
            }
        }
        return undefined;
    
}

export function resolveLocTypeRotAtTile(host: WebGLOsrsRendererHost, 
        locId: number,
        tileX: number,
        tileY: number,
        plane: number,
    ): number | undefined {

        try {
            const tryMap = (map: any): number | undefined => {
                if (!map || typeof map.getLocIdsAtLocal !== "function") return undefined;
                if (typeof map.getLocTypeRotsAtLocal !== "function") return undefined;
                const local = host.getMapLocalTile(map, tileX, tileY);
                if (!local) return undefined;
                const level = Math.max(0, Math.min(Scene.MAX_LEVELS - 1, plane | 0));
                const ids = map.getLocIdsAtLocal(level, local.x, local.y) as number[];
                const typeRots = map.getLocTypeRotsAtLocal(level, local.x, local.y) as number[];
                for (let i = 0; i < ids.length; i++) {
                    if ((ids[i] | 0) !== (locId | 0)) continue;
                    if (i < typeRots.length) {
                        return (typeRots[i] | 0) & 0xff;
                    }
                    break;
                }
                return undefined;
            };
            // Check preferred map first, then fall back to all visible maps.
            const preferred = host.getPreferredMapForWorldTile(tileX, tileY);
            const result = tryMap(preferred);
            if (result !== undefined) return result;
            for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
                const map = host.mapManager.visibleMaps[i];
                if (map === preferred) continue;
                const r = tryMap(map);
                if (r !== undefined) return r;
            }
            return undefined;
        } catch {
            return undefined;
        }
    
}

export function updateCustomLabels(host: WebGLOsrsRendererHost, ): void {

        const labels = host.osrsClient.customLabels;
        const screens: { x: number; y: number; text: string }[] = [];
        const basePlane = host.getPlayerRawPlane() | 0;
        for (const label of labels) {
            const h = host.getApproxTileHeight(label.x + 0.5, label.y + 0.5, basePlane);
            const screen = host.worldToScreen(label.x + 0.5, h - 0.3, label.y + 0.5);
            if (screen) {
                screens.push({
                    x: screen[0],
                    y: screen[1],
                    text: label.text,
                });
            }
        }

        // Destination tile label now rendered via TileTextOverlay using bitmap font
        host.osrsClient.customLabelScreens = screens;
    
}
