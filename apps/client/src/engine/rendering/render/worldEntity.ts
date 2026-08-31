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

export async function loadWorldEntityScene(host: WebGLOsrsRendererHost, 
        entityIndex: number,
        templateChunks: number[][][],
        regionX: number,
        regionY: number,
        worldX: number,
        worldY: number,
        sizeX: number,
        sizeZ: number,
        extraLocs: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }>,
        configId: number = -1,
        extraNpcs?: Array<{ id: number; x: number; y: number; level: number }>,
        basePlane: number = 0,
    ): Promise<void> {

        if (!host.osrsClient.loadedCache) return;

        const loadToken = host.nextWorldEntityLoadToken++;
        host.worldEntityLoadTokens.set(entityIndex, loadToken);
        if (host.worldEntityOverlays.has(entityIndex)) {
            host.clearWorldEntity(entityIndex);
            host.worldEntityLoadTokens.set(entityIndex, loadToken);
        }

        const sceneTilesX = (templateChunks[0]?.length ?? 13) * 8;
        const sceneTilesY = (templateChunks[0]?.[0]?.length ?? 13) * 8;
        const sceneSizeHalf = sceneTilesX / 2;
        const entityWorldBaseX = worldX - sceneSizeHalf;
        const entityWorldBaseY = worldY - sceneTilesY / 2;

        // Use a unique mapX/Y for the overlay that won't collide with real map squares
        const overlayMapX = 200 + entityIndex;
        const overlayMapY = 200 + entityIndex;
        const overlayMapId = getMapSquareId(overlayMapX, overlayMapY);
        host.mapManager.loadingMapIds.add(overlayMapId);

        console.log(
            `[WebGLOsrsRenderer] Loading world entity overlay: entity=${entityIndex} config=${configId} source=(${regionX},${regionY}) worldPos=(${worldX},${worldY}) renderBase=(${entityWorldBaseX},${entityWorldBaseY})`,
        );

        host.worldEntityOverlays.set(entityIndex, {
            entityIndex,
            configId,
            templateChunks,
            regionX,
            regionY,
            worldX,
            worldY,
            sizeX,
            sizeZ,
            extraLocs,
            extraNpcs,
            basePlane,
        });

        // Register with WorldViewManager
        host.osrsClient.worldViewManager.createWorldView(entityIndex, sceneTilesX, sceneTilesY, {
            baseX: Math.floor(entityWorldBaseX),
            baseY: Math.floor(entityWorldBaseY),
            configId,
            templateChunks,
            regionX,
            regionY,
            worldX,
            worldY,
            sizeXEntity: sizeX,
            sizeZEntity: sizeZ,
            extraLocs,
            extraNpcs,
        });

        if (configId >= 0) {
            host.ensureWorldEntityAnimator();
            host.worldEntityAnimator?.addEntity(entityIndex, configId, host.lastTick);
        }

        // Collect extra locs from addedLocs that fall within the source region
        const CHUNK_SIZE = 8;
        const sceneBaseX = (regionX - 6) * CHUNK_SIZE;
        const sceneBaseY = (regionY - 6) * CHUNK_SIZE;
        const sceneMaxX = sceneBaseX + 13 * CHUNK_SIZE;
        const sceneMaxY = sceneBaseY + 13 * CHUNK_SIZE;
        const allExtraLocs: typeof extraLocs = [...extraLocs];
        for (const loc of host.addedLocs.values()) {
            if (
                loc.x >= sceneBaseX &&
                loc.x < sceneMaxX &&
                loc.y >= sceneBaseY &&
                loc.y < sceneMaxY
            ) {
                allExtraLocs.push({
                    id: loc.locId,
                    x: loc.x,
                    y: loc.y,
                    level: loc.level,
                    shape: loc.shape,
                    rotation: loc.rotation,
                });
            }
        }
        console.log(
            `[WebGLOsrsRenderer] World entity overlay: ${allExtraLocs.length} extra locs, ${
                extraNpcs?.length ?? 0
            } extra NPCs`,
        );

        const input: SdMapLoaderInput = {
            mapX: overlayMapX,
            mapY: overlayMapY,
            maxLevel: Math.max(0, Math.min(Scene.MAX_LEVELS - 1, host.maxLevel | 0)),
            loadNpcs: host.loadNpcs,
            smoothTerrain: host.smoothTerrain,
            minimizeDrawCalls: !host.hasMultiDraw,
            loadedTextureIds: host.loadedTextureIds,
            instance: { templateChunks, regionX, regionY },
            overrideRenderPos: { x: entityWorldBaseX, y: entityWorldBaseY },
            extraLocs: allExtraLocs.length > 0 ? allExtraLocs : undefined,
            extraNpcs: extraNpcs && extraNpcs.length > 0 ? extraNpcs : undefined,
        };

        const mapData = await host.osrsClient.workerPool.queueLoad<
            SdMapLoaderInput,
            SdMapData | undefined,
            SdMapDataLoader
        >(host.dataLoader, input);

        if (host.worldEntityLoadTokens.get(entityIndex) !== loadToken) {
            return;
        }

        if (mapData) {
            console.log(
                `[WebGLOsrsRenderer] World entity overlay loaded: entity=${entityIndex} vertices=${
                    mapData.vertices?.length ?? 0
                }`,
            );
            host.mapsToLoad.push(mapData);
            host.mapManager.loadingMapIds.add(overlayMapId);
            host.mapManager.worldEntityMapIds.add(overlayMapId);
        } else {
            host.mapManager.loadingMapIds.delete(overlayMapId);
        }
    
}

export function ensureWorldEntityOverlaysLoaded(host: WebGLOsrsRendererHost, nowMs: number): void {

        for (const [entityIndex, overlay] of host.worldEntityOverlays) {
            const overlayMapX = 200 + entityIndex;
            const overlayMapY = 200 + entityIndex;
            const overlayMapId = getMapSquareId(overlayMapX, overlayMapY);
            if (host.mapManager.mapSquares.has(overlayMapId)) continue;
            if (host.mapManager.loadingMapIds.has(overlayMapId)) continue;

            const retryAfter = host.worldEntityReloadAfterMs.get(entityIndex) ?? 0;
            if (nowMs < retryAfter) continue;

            host.worldEntityReloadAfterMs.set(entityIndex, nowMs + 250);
            console.warn(
                `[WebGLOsrsRenderer] Missing world entity overlay map, reloading entity=${entityIndex}`,
            );
            void host.loadWorldEntityScene(
                overlay.entityIndex,
                overlay.templateChunks,
                overlay.regionX,
                overlay.regionY,
                overlay.worldX,
                overlay.worldY,
                overlay.sizeX,
                overlay.sizeZ,
                overlay.extraLocs,
                overlay.configId,
                overlay.extraNpcs,
                overlay.basePlane,
            );
        }
    
}

export function scheduleWorldEntityLocRebuild(host: WebGLOsrsRendererHost, entityIndex: number): void {

        if (host.worldEntityLocRebuildTimer !== null) return;
        host.worldEntityLocRebuildTimer = setTimeout(() => {
            host.worldEntityLocRebuildTimer = null;
            const overlay = host.worldEntityOverlays.get(entityIndex);
            if (!overlay) return;
            console.log(`[WebGLOsrsRenderer] Rebuilding world entity overlay with deferred locs`);
            host.loadWorldEntityScene(
                overlay.entityIndex,
                overlay.templateChunks,
                overlay.regionX,
                overlay.regionY,
                overlay.worldX,
                overlay.worldY,
                overlay.sizeX,
                overlay.sizeZ,
                overlay.extraLocs,
                overlay.configId,
                overlay.extraNpcs,
                overlay.basePlane,
            );
        }, 150);
    
}

export function ensureWorldEntityAnimator(host: WebGLOsrsRendererHost, ): void {

        if (host.worldEntityAnimator) return;
        host.worldEntityAnimator = new WorldEntityAnimator(
            host.osrsClient.worldEntityTypeLoader,
            host.osrsClient.seqTypeLoader,
            host.osrsClient.skeletalSeqLoader,
        );
    
}

export function getWorldEntityIndexForMapId(host: WebGLOsrsRendererHost, mapId: number): number | undefined {

        for (const [entityIndex] of host.worldEntityOverlays) {
            const overlayMapX = 200 + entityIndex;
            const overlayMapY = 200 + entityIndex;
            if (getMapSquareId(overlayMapX, overlayMapY) === mapId) {
                return entityIndex;
            }
        }
        return undefined;
    
}

export function getOverlayMapForEntity(host: WebGLOsrsRendererHost, entityIndex: number): WebGLMapSquare | undefined {

        const overlayMapId = getMapSquareId(200 + entityIndex, 200 + entityIndex);
        return host.mapManager.mapSquares.get(overlayMapId);
    
}

export function getWorldEntityTransformForMap(host: WebGLOsrsRendererHost, map: WebGLMapSquare): Float32Array {

        if (!host.mapManager.worldEntityMapIds.has(map.id)) {
            return WebGLMapSquare.IDENTITY_MAT4;
        }
        const entityIndex = host.getWorldEntityIndexForMapId(map.id);
        if (entityIndex === undefined) return WebGLMapSquare.IDENTITY_MAT4;
        return host.worldEntityAnimator?.getTransform(entityIndex) ?? WebGLMapSquare.IDENTITY_MAT4;
    
}

export function getWorldEntityTransformForMapOrOverlap(host: WebGLOsrsRendererHost, map: WebGLMapSquare): Float32Array {

        const direct = host.getWorldEntityTransformForMap(map);
        if (direct !== WebGLMapSquare.IDENTITY_MAT4) return direct;
        for (const [entityIndex, overlay] of host.worldEntityOverlays) {
            const entityMapX = Math.floor(overlay.worldX / 64) | 0;
            const entityMapY = Math.floor(overlay.worldY / 64) | 0;
            if (map.mapX === entityMapX && map.mapY === entityMapY) {
                return (
                    host.worldEntityAnimator?.getTransform(entityIndex) ??
                    WebGLMapSquare.IDENTITY_MAT4
                );
            }
        }
        return WebGLMapSquare.IDENTITY_MAT4;
    
}

export function getWorldEntityDeckHeight(host: WebGLOsrsRendererHost, _overworldTileX: number, _overworldTileY: number): number {

        for (const [, overlay] of host.worldEntityOverlays) {
            if (overlay.deckHeight !== undefined && overlay.deckHeight !== 0) {
                return overlay.deckHeight;
            }
        }
        return 0;
    
}

export function getNpcModelYOffset(host: WebGLOsrsRendererHost, deckHeight: number = 0): number {

        // npc.vert.glsl subtracts this uniform. Invert the shared clearance so
        // NPCs use the same effective world-space offset as players.
        return -(deckHeight + RENDER_CONSTANTS.ACTOR_GROUND_CLEARANCE_MODEL_UNITS);
    
}

export function getWorldEntityTransformForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number): Float32Array {

        for (const [entityIndex, overlay] of host.worldEntityOverlays) {
            const halfSize = (overlay.sizeX * 8) / 2;
            const minX = overlay.worldX - halfSize;
            const maxX = overlay.worldX + halfSize;
            const minY = overlay.worldY - halfSize;
            const maxY = overlay.worldY + halfSize;
            if (tileX >= minX && tileX < maxX && tileY >= minY && tileY < maxY) {
                return (
                    host.worldEntityAnimator?.getTransform(entityIndex) ??
                    WebGLMapSquare.IDENTITY_MAT4
                );
            }
        }
        return WebGLMapSquare.IDENTITY_MAT4;
    
}

export function clearWorldEntity(host: WebGLOsrsRendererHost, entityIndex: number): void {

        const overlayMapX = 200 + entityIndex;
        const overlayMapY = 200 + entityIndex;
        const overlayMapId = getMapSquareId(overlayMapX, overlayMapY);
        host.mapManager.worldEntityMapIds.delete(overlayMapId);
        host.mapManager.loadingMapIds.delete(overlayMapId);
        host.mapManager.removeMap(overlayMapX, overlayMapY);
        host.worldEntityOverlays.delete(entityIndex);
        host.worldEntityLoadTokens.delete(entityIndex);
        host.worldEntityReloadAfterMs.delete(entityIndex);
        host.worldEntityAnimator?.removeEntity(entityIndex);
        host.osrsClient.worldViewManager.removeWorldView(entityIndex);
    
}
