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
import { RENDER_CONSTANTS, HD_SKY_COLOR_VEC4 } from "@client/engine/rendering/render/constants";

export function resolveLocReloadBatchMap(host: WebGLOsrsRendererHost, 
        batchId: number,
        mapId: number,
        mapData: SdMapData | undefined,
    ): void {

        const batch = host.pendingLocReloadBatches.get(batchId);
        if (!batch) {
            if (mapData) {
                host.mapsToLoad.push(mapData);
            }
            return;
        }

        if (mapData) {
            batch.loaded.set(mapId, mapData);
        }
        batch.pendingMapIds.delete(mapId);

        if (batch.pendingMapIds.size > 0) {
            return;
        }

        // Commit the whole loc-reload batch together so multi-square gates don't show half-updates.
        for (const expectedMapId of batch.mapIds) {
            const ready = batch.loaded.get(expectedMapId);
            if (!ready) continue;
            host.mapsToLoad.push(ready);
            host.queuedLocReloadBatchByMap.set(expectedMapId, batch.id);
        }
        host.pendingLocReloadBatches.delete(batchId);
    
}

export function beginLocReloadBatch(host: WebGLOsrsRendererHost, maps: Array<{ mapX: number; mapY: number }>): void {

        if (maps.length === 0) return;

        const ordered = maps
            .map((map) => ({
                mapX: map.mapX | 0,
                mapY: map.mapY | 0,
                mapId: getMapSquareId(map.mapX, map.mapY),
            }))
            .sort((a, b) => a.mapId - b.mapId);
        const mapIds = ordered.map((entry) => entry.mapId);
        const batchId = host.nextLocReloadBatchId++;
        host.pendingLocReloadBatches.set(batchId, {
            id: batchId,
            mapIds,
            pendingMapIds: new Set<number>(mapIds),
            loaded: new Map<number, SdMapData>(),
        });

        for (const entry of ordered) {
            void host.queueLoadMap(entry.mapX, entry.mapY, undefined, batchId);
        }
    
}

export function loadMap(host: WebGLOsrsRendererHost, 
        mainProgram: Program,
        mainAlphaProgram: Program,
        npcProgram: Program,
        textureArray: Texture,
        textureMaterials: Texture,
        waterTextures: Texture,
        sceneUniformBuffer: UniformBuffer,
        mapData: SdMapData,
        time: number,
    ): void {

        const { mapX, mapY } = mapData;
        const mapId = getMapSquareId(mapX, mapY);
        const existing = host.mapManager.getMap(mapX, mapY);
        // An instance payload is always a complete scene replacement. A loc
        // update queued for the previously resident overworld map may share the
        // same map id; treating the instance payload as that partial update
        // would mutate the old map in place and falsely report a commit.
        const isInstanceScenePayload = mapData.instanceSceneGeneration !== undefined;
        const isLocUpdate = !isInstanceScenePayload && host.pendingLocUpdates.has(mapId);
        const isLocGeometryUpdate =
            !isInstanceScenePayload &&
            !isLocUpdate &&
            host.pendingLocGeometryUpdates.has(mapId);
        const isDoorOnlyUpdate =
            !isInstanceScenePayload &&
            !isLocUpdate &&
            !isLocGeometryUpdate &&
            host.pendingDoorLocUpdates.has(mapId);

        // A door-only payload is valid only while the original map square is
        // still resident and no broader loc update has superseded it.
        if (mapData.doorOnly && (!isDoorOnlyUpdate || !(existing instanceof WebGLMapSquare))) {
            host.pendingDoorLocUpdates.delete(mapId);
            host.pendingLocUpdates.add(mapId);
            void host.queueLoadMap(mapX, mapY);
            return;
        }
        if (mapData.locOnly && (!isLocGeometryUpdate || !(existing instanceof WebGLMapSquare))) {
            host.pendingLocGeometryUpdates.delete(mapId);
            host.pendingLocUpdates.add(mapId);
            void host.queueLoadMap(mapX, mapY);
            return;
        }

        if (
            (isLocUpdate || isLocGeometryUpdate || isDoorOnlyUpdate) &&
            existing instanceof WebGLMapSquare
        ) {
            if (isDoorOnlyUpdate && mapData.doorOnly) {
                existing.refreshDoorGeometry(
                    host.app,
                    mainProgram,
                    mainAlphaProgram,
                    textureArray,
                    textureMaterials,
                    waterTextures,
                    sceneUniformBuffer,
                    mapData,
                    existing.timeLoaded,
                );
            } else if (isLocGeometryUpdate && mapData.locOnly) {
                existing.refreshLocGeometry(
                    host.osrsClient.seqTypeLoader,
                    host.app,
                    mainProgram,
                    mainAlphaProgram,
                    textureArray,
                    textureMaterials,
                    waterTextures,
                    sceneUniformBuffer,
                    mapData,
                    getClientCycle() | 0,
                    existing.timeLoaded,
                );
            } else {
                existing.refreshSceneGeometry(
                    host.osrsClient.seqTypeLoader,
                    host.osrsClient.seqFrameLoader,
                    host.app,
                    mainProgram,
                    mainAlphaProgram,
                    textureArray,
                    textureMaterials,
                    waterTextures,
                    sceneUniformBuffer,
                    mapData,
                    getClientCycle() | 0,
                    existing.timeLoaded,
                );
            }

            if (!mapData.doorOnly) {
                host.registerMinimapData(mapData);
            }

            host.mapManager.addMap(mapX, mapY, existing);
            if (!mapData.doorOnly && !mapData.locOnly) {
                if (host.rebuildGroundItemsForMap(existing, host.groundItemStacks.get(mapId))) {
                    host.groundItemStackHashes.delete(mapId);
                }
            }
            host.pendingLocUpdates.delete(mapId);
            host.pendingLocGeometryUpdates.delete(mapId);
            host.pendingDoorLocUpdates.delete(mapId);
            host.updateTextureArray(mapData.loadedTextures);
            return;
        }

        host.registerMinimapData(mapData);

        const frameCount = host.stats.frameCount;
        // -1.0 makes loadAlpha = 1.0 immediately in the vertex shader,
        // skipping the 1-second fog fade-in for teleport-loaded maps.
        const reuseTime =
            existing instanceof WebGLMapSquare
                ? existing.timeLoaded
                : host.skipMapFadeIn
                    ? -1.0
                    : time;
        const reuseFrame = existing instanceof WebGLMapSquare ? existing.frameLoaded : frameCount;

        const loadedMap = WebGLMapSquare.load(
            host.osrsClient.seqTypeLoader,
            host.osrsClient.seqFrameLoader,
            host.osrsClient.npcTypeLoader,
            host.osrsClient.basTypeLoader,
            host.app,
            mainProgram,
            mainAlphaProgram,
            npcProgram,
            textureArray,
            textureMaterials,
            waterTextures,
            sceneUniformBuffer,
            mapData,
            reuseTime,
            getClientCycle() | 0,
            reuseFrame,
            host.osrsClient.npcEcs,
        );

        // For instances, set base world position for height sampling.
        // The height data is at source coordinates, not instance coordinates.
        if (mapData.renderPosX != null) {
            (loadedMap as any).baseWorldX =
                (mapData.renderPosX - mapData.borderSize / Scene.MAP_SQUARE_SIZE) *
                Scene.MAP_SQUARE_SIZE;
            (loadedMap as any).baseWorldY =
                (mapData.renderPosY! - mapData.borderSize / Scene.MAP_SQUARE_SIZE) *
                Scene.MAP_SQUARE_SIZE;
        }
        host.mapManager.addMap(mapX, mapY, loadedMap);
        if (host.rebuildGroundItemsForMap(loadedMap, host.groundItemStacks.get(mapId))) {
            host.groundItemStackHashes.delete(mapId);
        }

        host.updateTextureArray(mapData.loadedTextures);

        host.pendingLocUpdates.delete(mapId);
        host.pendingLocGeometryUpdates.delete(mapId);
        host.pendingDoorLocUpdates.delete(mapId);
    
}

export function isValidMapData(host: WebGLOsrsRendererHost, mapData: SdMapData): boolean {

        const isCurrentInstanceGeneration =
            mapData.instanceSceneGeneration === undefined ||
            (host.instanceActive &&
                mapData.instanceSceneGeneration === host.instanceSceneGeneration);

        const expectedInstanceMapX =
            ((host.instanceRegionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const expectedInstanceMapY =
            ((host.instanceRegionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const isTerrainOnlyInstancePayload =
            host.instanceActive &&
            host.loadNpcs &&
            !mapData.loadNpcs &&
            mapData.mapX === expectedInstanceMapX &&
            mapData.mapY === expectedInstanceMapY &&
            mapData.renderPosX != null &&
            mapData.renderPosY != null;

        return (
            isCurrentInstanceGeneration &&
            mapData.cacheName === host.osrsClient.loadedCache?.info?.name &&
            (mapData.loadNpcs === host.loadNpcs || isTerrainOnlyInstancePayload) &&
            mapData.smoothTerrain === host.smoothTerrain
        );
    
}

export function clearMaps(host: WebGLOsrsRendererHost, ): void {

        host.mapManager.cleanUp();
        host.mapsToLoad.clear();
        host.pendingStreamMapsByGeneration.clear();
        host.observedGridRevision = -1;
        host.skipMapFadeIn = false;
        // Safety net: if a load/teleport is torn down mid-flight (e.g. an
        // instance closing), don't leave the darkened loading clear color
        // stuck on screen.
        host.skyColor[0] = HD_SKY_COLOR_VEC4[0];
        host.skyColor[1] = HD_SKY_COLOR_VEC4[1];
        host.skyColor[2] = HD_SKY_COLOR_VEC4[2];
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
        host.minimapIcons.clear();
        host.clearDynamicNpcAnimRuntimeState();
    
}

export function getMinimapIcons(host: WebGLOsrsRendererHost, mapX: number, mapY: number, level: number = 0): MinimapIcon[] | undefined {

        return host.minimapIcons.get(getMapPlaneId(mapX | 0, mapY | 0, level | 0));
    
}

export function setMaxLevel(host: WebGLOsrsRendererHost, maxLevel: number): void {

        const updated = host.maxLevel !== maxLevel;
        host.maxLevel = maxLevel;
        if (updated) {
            host.clearMaps();
        }
    
}
