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
} from "../../network/ServerConnection";
import { sendLogin } from "../../network/ServerConnection";
import { flushPackets } from "../../network/packet";
import { createTextureArray } from "../../picogl/PicoTexture";
import { RS_TO_RADIANS } from "../../rs/MathConstants";
import { CollisionFlag } from "../../common/CollisionFlag";
import { isInWilderness } from "../../common/world/Wilderness";
import {
    getWorldLocChanges,
    getWorldLocSpawns,
    getWorldTerrainOverrides,
} from "../../common/gamemode/GamemodeContentStore";
import { OsrsMenuEntry } from "../../rs/MenuEntry";
import { MenuTargetType } from "../../rs/MenuEntry";
import type { OverlayFloorType } from "../../rs/config/floortype/OverlayFloorType";
import { LocModelLoader } from "../../rs/config/loctype/LocModelLoader";
import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { NpcModelLoader } from "../../rs/config/npctype/NpcModelLoader";
import { NpcDrawPriority, NpcType } from "../../rs/config/npctype/NpcType";
import { PlayerAppearance } from "../../rs/config/player/PlayerAppearance";
import { PlayerModelLoader } from "../../rs/config/player/PlayerModelLoader";
import { decodeInteractionIndex } from "../../rs/interaction/InteractionIndex";
import { getMapIndexFromTile, getMapPlaneId, getMapSquareId } from "../../rs/map/MapFileIndex";
import { Model } from "../../rs/model/Model";
import { ModelData } from "../../rs/model/ModelData";
import { Scene } from "../../rs/scene/Scene";
import { getUiScale } from "../../ui/UiScale";
import { ClickCrossOverlay } from "../../ui/devoverlay/ClickCrossOverlay";
import { GroundItemOverlay } from "../../ui/devoverlay/GroundItemOverlay";
import { HealthBarOverlay } from "../../ui/devoverlay/HealthBarOverlay";
import { HitsplatOverlay } from "../../ui/devoverlay/HitsplatOverlay";
import {
    InteractHighlightDrawTarget,
    InteractHighlightOverlay,
} from "../../ui/devoverlay/InteractHighlightOverlay";
import { LoadingMessageOverlay } from "../../ui/devoverlay/LoadingMessageOverlay";
import { LoginOverlay } from "../../ui/devoverlay/LoginOverlay";
import { OverheadPrayerOverlay } from "../../ui/devoverlay/OverheadPrayerOverlay";
import { OverheadTextOverlay } from "../../ui/devoverlay/OverheadTextOverlay";
import {
    HealthBarEntry,
    HitsplatEntry,
    OverheadPrayerEntry,
    OverheadTextEntry,
    type OverlayUpdateArgs,
    RenderPhase,
} from "../../ui/devoverlay/Overlay";
import { OverlayManager } from "../../ui/devoverlay/OverlayManager";
import type { TileMarkerOverlay } from "../../ui/devoverlay/TileMarkerOverlay";
import { TileTextOverlay } from "../../ui/devoverlay/TileTextOverlay";
import { WidgetsOverlay } from "../../ui/devoverlay/WidgetsOverlay";
import { MENU_ACTION_DEPRIORITIZE_OFFSET, MenuAction, menuAction } from "../../ui/menu/MenuAction";
import { worldEntriesToSimple } from "../../ui/menu/MenuBridge";
import type { MenuClickContext, SimpleMenuEntry } from "../../ui/menu/MenuEngine";
import { chooseDefaultMenuEntry, shouldLeftClickOpenMenu } from "../../ui/menu/MenuEngine";
import { MenuOpcode } from "../../ui/menu/MenuState";
import { Model2DRenderer } from "../../ui/model/Model2DRenderer";
import {
    canTargetGroundItem,
    canTargetNpc,
    canTargetObject,
    canTargetPlayer,
} from "../../widgets/WidgetFlags";
import { WidgetLoader } from "../../widgets/WidgetLoader";
import { WidgetManager } from "../../widgets/WidgetManager";
import { layoutWidgets } from "../../widgets/layout/WidgetLayout";
import { collectWidgetsAtPoint } from "../../widgets/menu/utils";
import {
    getCanvasCssSize,
    isIos,
    isMobileMode,
    isTouchDevice,
    isWebGL2Supported,
} from "../../common/utils/DeviceUtil";
import { clamp } from "../../common/utils/MathUtil";
import { ClientState } from "../../game/ClientState";
import { GameRenderer } from "../../game/GameRenderer";
import type { HitsplatEventPayload } from "../../game/GameRenderer";
import { OsrsRendererType, WEBGL } from "../../game/GameRenderers";
import { ClickMode, getMousePos } from "../../game/InputManager";
import { OsrsClient } from "../../game/OsrsClient";
import { ActorAnimationClip } from "../../game/actor/ActorAnimation";
import {
    ActorHealthBarsState,
    ActorHitsplatState,
    HealthBarBarState,
    HealthBarDefinitionState,
    HealthBarUpdateState,
    MAX_HITSPLAT_SLOTS,
    createActorHealthBarsState,
    createActorHitsplatState,
} from "../../game/actor/ActorOverlayState";
import type { ClientGroundItemStack, GroundItemOverlayEntry } from "../../game/data/ground/GroundItemStore";
import { NpcEcs } from "../../game/ecs/NpcEcs";
import type { PlayerAnimKey } from "../../game/ecs/PlayerEcs";
import { GameState, LoginIndex } from "../../game/login";
import { Ray, rayIntersectsBox } from "../../game/math/Raycast";
import { isMouseInUIRegion as checkMouseInUIRegion } from "../../game/menu/WorldMenuBuilder";
import {
    advanceAnimation,
    computeMovementOrientation,
    computeMovementStep,
    interpolateRotation,
    parseInteractionTarget,
} from "../../game/movement/NpcClientTick";
import type { TileMarkersPluginConfig } from "../../game/plugins/tilemarkers/types";
import { computeRoofPlaneLimit } from "../../game/roof/RoofVisibility";
import { sampleBridgeHeightForWorldTile } from "../../game/scene/BridgeHeightSampler";
import {
    BridgePlaneStrategy,
    resolveBridgePromotedPlane,
    resolveCollisionSamplePlaneForLocal,
    resolveCollisionSamplePlaneForWorldTile,
    resolveGroundItemStackPlane,
    resolveHeightSamplePlaneForLocal,
    resolveInteractionPlaneForLocal,
    resolveInteractionPlaneForWorldTile,
} from "../../game/scene/PlaneResolver";
import { SceneRaycastHit, SceneRaycaster } from "../../game/scene/SceneRaycaster";
import {
    TILE_FLAG_BRIDGE,
    getTileRenderFlagAt as lookupTileRenderFlagAt,
} from "../../game/scene/TileRenderFlags";
import { LoadingRequirement } from "../../game/state/LoadingTracker";
import type { PlayerSpotAnimationEvent } from "../../game/sync/PlayerSyncTypes";
import { RAD_TO_RS_UNITS, computeFacingRotation } from "../../game/utils/rotation";
import { AnimationFrames } from "../AnimationFrames";
import { ChatheadFactory } from "../ChatheadFactory";
import { type DrawBackend, createDrawBackend } from "../DrawBackend";
import { DrawRange, NULL_DRAW_RANGE, newDrawRange } from "../DrawRange";
import { InteractType } from "../InteractType";
import { profiler } from "../PerformanceProfiler";
import { PlayerChatheadFactory } from "../PlayerChatheadFactory";
import { resolveFogRange } from "../RenderDistancePolicy";
import { WebGLMapSquare } from "../WebGLMapSquare";
import { WorldEntityAnimator } from "../WorldEntityAnimator";
import { SceneBuffer } from "../buffer/SceneBuffer";
import { getModelFaces, isModelFaceTransparent } from "../buffer/SceneBuffer";
import { GfxManager } from "../gfx/GfxManager";
import { GfxRenderer } from "../gfx/GfxRenderer";
import { buildGroundItemGeometry } from "../ground/GroundItemMeshBuilder";
import { type MinimapIcon, SdMapData } from "../loader/SdMapData";
import { SdMapDataLoader } from "../loader/SdMapDataLoader";
import { SdMapLoaderInput } from "../loader/SdMapLoaderInput";
import { isDoorLocType } from "../loc/SceneLocs";
import {
    DynamicNpcAnimLoader,
    DynamicNpcFrameGeometry,
    DynamicNpcSequenceMeta,
} from "../npc/DynamicNpcAnimLoader";
import { PlayerRenderer } from "../player/PlayerRenderer";
import { ProjectileManager } from "../projectiles/ProjectileManager";
import { ProjectileRenderer } from "../projectiles/ProjectileRenderer";
import {
    FRAME_FXAA_PROGRAM,
    FRAME_PROGRAM,
    createMainProgram,
    createNpcProgram,
    createPlayerProgram,
    createProjectileProgram,
} from "../shaders/Shaders";
import { KNOWN_WATER_TEXTURE_IDS } from "../water/WaterTextureIds";
import type { WebGLOsrsRendererHost } from "./hostInterface";
import { RENDER_CONSTANTS } from "./constants";

function captureInstanceSceneFallback(host: WebGLOsrsRendererHost) {
    return {
        active: host.instanceActive,
        ready: host.instanceSceneReady,
        templateChunks: host.instanceTemplateChunks,
        regionX: host.instanceRegionX,
        regionY: host.instanceRegionY,
        smoothTerrain: host.smoothTerrain,
        loadNpcs: host.loadNpcs,
    };
}

function applyDeferredInstanceSceneSettings(host: WebGLOsrsRendererHost): void {
    const pending = host.instanceScenePendingSettings;
    if (!pending) return;
    host.instanceScenePendingSettings = null;

    if (host.instanceActive && host.instanceTemplateChunks) {
        host.requestInstanceSceneSettingsRebuild(pending.smoothTerrain, pending.loadNpcs);
        return;
    }

    // A failed initial instance transition may have restored the normal scene
    // while ClientState still awaits a server rebuild. Keep that committed map
    // resident; clearing it here can leave no map and no active streaming path.
    host.smoothTerrain = pending.smoothTerrain;
    host.loadNpcs = pending.loadNpcs;
}

function startPendingInstanceLocRebuild(host: WebGLOsrsRendererHost): void {
    if (!host.instanceLocRebuildPending || host.instanceSceneBuildPending) return;
    if (!host.instanceActive || !host.instanceTemplateChunks) {
        host.instanceLocRebuildPending = false;
        return;
    }

    host.instanceLocRebuildPending = false;
    host.instanceSceneFallbackState = captureInstanceSceneFallback(host);
    host.instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
    const generation = host.instanceSceneGeneration;
    host.instanceSceneBuildPending = true;
    host.instanceSceneReady = false;

    const templateChunks = host.instanceTemplateChunks;
    const regionX = host.instanceRegionX;
    const regionY = host.instanceRegionY;
    const playerMapX = ((regionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
    const playerMapY = ((regionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;

    void host
        .doInstanceSceneBuild(
            templateChunks,
            regionX,
            regionY,
            playerMapX,
            playerMapY,
            true,
            generation,
        )
        .then((loaded) => {
            if (host.instanceSceneGeneration !== generation) return;
            if (!loaded) {
                failCurrentInstanceSceneBuild(
                    host,
                    new Error("instance loc rebuild returned no valid map data"),
                );
            }
        })
        .catch((error) => {
            if (host.instanceSceneGeneration !== generation) return;
            failCurrentInstanceSceneBuild(host, error);
        });
}

function failCurrentInstanceSceneBuild(host: WebGLOsrsRendererHost, error: unknown): void {
    const fallback = host.instanceSceneFallbackState;
    host.instanceSceneBuildPending = false;
    host.instanceSceneFallbackState = null;

    if (fallback) {
        host.instanceActive = fallback.active;
        host.instanceSceneReady = fallback.ready;
        host.instanceTemplateChunks = fallback.templateChunks;
        host.instanceRegionX = fallback.regionX;
        host.instanceRegionY = fallback.regionY;
        host.smoothTerrain = fallback.smoothTerrain;
        host.loadNpcs = fallback.loadNpcs;
    }

    console.error(
        "[WebGLOsrsRenderer] Instance scene build failed; preserving the previous scene",
        error,
    );
    if (host.instanceSceneReady) host.osrsClient.notifyRendererReady();
    applyDeferredInstanceSceneSettings(host);
    startPendingInstanceLocRebuild(host);
}

export async function loadInstanceScene(host: WebGLOsrsRendererHost, 
        templateChunks: number[][][],
        regionX: number,
        regionY: number,
    ): Promise<void> {

        if (!host.osrsClient.loadedCache) return;

        // An overlapping REBUILD_REGION must retain the fallback captured by
        // the first uncommitted transition. Restoring fields from the previous
        // request would otherwise restore another uncommitted scene.
        if (!host.instanceSceneBuildPending || !host.instanceSceneFallbackState) {
            host.instanceSceneFallbackState = captureInstanceSceneFallback(host);
        }

        // A setting requested during the superseded build can safely become
        // the input to this newer generation.
        const pendingSettings = host.instanceScenePendingSettings;
        if (pendingSettings) {
            host.instanceScenePendingSettings = null;
            host.smoothTerrain = pendingSettings.smoothTerrain;
            host.loadNpcs = pendingSettings.loadNpcs;
        }

        const instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
        host.instanceSceneGeneration = instanceSceneGeneration;
        host.instanceSceneBuildPending = true;
        host.instanceSceneReady = false;

        // Suppress normal map streaming while the instance is active
        host.instanceActive = true;
        host.instanceTemplateChunks = templateChunks;
        host.instanceRegionX = regionX;
        host.instanceRegionY = regionY;

        // regionX/Y are chunk coordinates from the REBUILD_REGION packet.
        // The player tile = regionX*8, regionY*8. Map square = tile / 64.
        const playerMapX = ((regionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const playerMapY = ((regionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;

        console.log(
            `[WebGLOsrsRenderer] Loading instance scene at map (${playerMapX}, ${playerMapY}) from region (${regionX}, ${regionY})...`,
        );

        try {
            const loaded = await host.doInstanceSceneBuild(
                templateChunks,
                regionX,
                regionY,
                playerMapX,
                playerMapY,
                true,
                instanceSceneGeneration,
            );
            if (!loaded) {
                // A newer rebuild or clearInstance invalidated this request.
                // Its lifecycle owns the renderer state now.
                if (host.instanceSceneGeneration !== instanceSceneGeneration) return;
                throw new Error("instance scene loader returned no valid map data");
            }
        } catch (error) {
            if (host.instanceSceneGeneration !== instanceSceneGeneration) return;
            failCurrentInstanceSceneBuild(host, error);
            return;
        }

        // LOC_ADD_CHANGE packets arrive after REBUILD_REGION on the same socket.
        // By now they are stored in addedLocs. Schedule a deferred rebuild to
        // include them; the short delay batches any remaining in-flight packets.
        if (host.addedLocs.size > 0) {
            host.scheduleInstanceLocRebuild();
        }
    
}

export async function doInstanceSceneBuild(host: WebGLOsrsRendererHost, 
        templateChunks: number[][][],
        regionX: number,
        regionY: number,
        playerMapX: number,
        playerMapY: number,
        replaceExistingMaps: boolean = false,
        instanceSceneGeneration?: number,
    ): Promise<boolean> {

        const extraLocs = host.getInstanceExtraLocs(playerMapX, playerMapY);

        const controlledWorldViewId = host.getControlledPlayerWorldViewId();
        const input: SdMapLoaderInput = {
            mapX: playerMapX,
            mapY: playerMapY,
            maxLevel: Math.max(0, Math.min(Scene.MAX_LEVELS - 1, host.maxLevel | 0)),
            // REBUILD_REGION can arrive before the local-player sync assigns its
            // private world view. Baking NPCs at that point admits the public
            // overworld spawns at the copied coordinates, leaving frozen,
            // unlinked meshes behind. Start with terrain only; the normal NPC
            // instance flush builds the private geometry once the view id exists.
            loadNpcs: host.loadNpcs && controlledWorldViewId >= 0,
            smoothTerrain: host.smoothTerrain,
            minimizeDrawCalls: !host.hasMultiDraw,
            loadedTextureIds: host.loadedTextureIds,
            instance: {
                templateChunks,
                regionX,
                regionY,
                ...(controlledWorldViewId >= 0 ? { worldViewId: controlledWorldViewId } : {}),
            },
            locOverrides: host.locOverrides,
            locSpawns: host.locSpawns,
            terrainOverrides: host.terrainOverrides,
            extraLocs,
        };

        const mapData = await host.osrsClient.workerPool.queueLoad<
            SdMapLoaderInput,
            SdMapData | undefined,
            SdMapDataLoader
        >(host.dataLoader, input);

        if (
            instanceSceneGeneration !== undefined &&
            (host.instanceSceneGeneration !== instanceSceneGeneration || !host.instanceActive)
        ) {
            return false;
        }

        if (mapData && instanceSceneGeneration !== undefined) {
            mapData.instanceSceneGeneration = instanceSceneGeneration;
            mapData.instanceSceneReplacesExistingMaps = replaceExistingMaps;
        }

        if (mapData && host.isValidMapData(mapData)) {
            console.log(
                `[WebGLOsrsRenderer] Instance scene loaded: vertices=${
                    mapData.vertices?.length ?? 0
                } indices=${mapData.indices?.length ?? 0} mapX=${mapData.mapX} mapY=${
                    mapData.mapY
                } border=${mapData.borderSize} extraLocs=${extraLocs?.length ?? 0}`,
            );
            // Clear any in-flight normal map loads that arrived during the async instance build
            host.mapsToLoad.clear();
            host.pendingStreamMapsByGeneration.clear();
            // Bypass grid/generation checks — instance scenes are always valid
            host.mapsToLoad.push(mapData);
            // Register the map in MapManager so it isn't pruned
            host.mapManager.loadingMapIds.add(getMapSquareId(playerMapX, playerMapY));
            return true;
        } else {
            console.warn(
                "[WebGLOsrsRenderer] Instance scene load returned no valid data",
                mapData
                    ? {
                          mapX: mapData.mapX,
                          mapY: mapData.mapY,
                          loadNpcs: mapData.loadNpcs,
                          expectedLoadNpcs: host.loadNpcs,
                      }
                    : undefined,
            );
            return false;
        }
    
}

/**
 * Completes the instance transition only once its map has actually replaced
 * the old scene. Until this point NPC sync may update ECS/worker state, but its
 * geometry refresh remains pending so it cannot attach to the old map square.
 */
export function markInstanceSceneCommitted(
        host: WebGLOsrsRendererHost,
        mapData: SdMapData,
    ): void {

        const generation = mapData.instanceSceneGeneration;
        if (
            !host.instanceActive ||
            generation === undefined ||
            generation !== host.instanceSceneGeneration
        ) {
            return;
        }

        const expectedMapX = ((host.instanceRegionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const expectedMapY = ((host.instanceRegionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        if (mapData.mapX !== expectedMapX || mapData.mapY !== expectedMapY) return;
        if (host.instanceSceneReady && !host.instanceSceneBuildPending) return;

        // loadMap has already installed the replacement at this point. Only
        // now is it safe to release the prior scene; if map construction threw,
        // this commit hook was never reached and the old scene remains intact.
        if (mapData.instanceSceneReplacesExistingMaps) {
            for (const existing of Array.from(host.mapManager.mapSquares.values())) {
                if (existing.mapX === mapData.mapX && existing.mapY === mapData.mapY) continue;
                host.mapManager.removeMap(existing.mapX, existing.mapY);
            }
            host.mapManager.loadingMapIds.clear();
        }

        host.instanceSceneBuildPending = false;
        host.instanceSceneReady = true;
        host.instanceSceneFallbackState = null;
        host.osrsClient.notifyRendererReady();
        applyDeferredInstanceSceneSettings(host);
        startPendingInstanceLocRebuild(host);

}

/** Restore the last committed scene when GPU/map application fails before commit. */
export function failInstanceSceneCommit(
        host: WebGLOsrsRendererHost,
        mapData: SdMapData,
        error: unknown,
    ): void {
        const generation = mapData.instanceSceneGeneration;
        if (
            generation === undefined ||
            generation !== host.instanceSceneGeneration ||
            !host.instanceSceneBuildPending
        ) {
            return;
        }
        host.mapManager.loadingMapIds.delete(getMapSquareId(mapData.mapX, mapData.mapY));
        failCurrentInstanceSceneBuild(host, error);
}

/**
 * Applies renderer settings transactionally inside an instance. If another
 * scene payload is in flight, retain its exact validation settings and defer
 * the newest request until that payload commits. A committed instance remains
 * resident while the follow-up worker build runs.
 */
export function requestInstanceSceneSettingsRebuild(
        host: WebGLOsrsRendererHost,
        smoothTerrain: boolean,
        loadNpcs: boolean,
    ): void {

        const requested = {
            smoothTerrain: !!smoothTerrain,
            loadNpcs: !!loadNpcs,
        };

        if (host.instanceSceneBuildPending) {
            host.instanceScenePendingSettings = requested;
            return;
        }

        if (!host.instanceActive) {
            const updated =
                host.smoothTerrain !== requested.smoothTerrain ||
                host.loadNpcs !== requested.loadNpcs;
            host.smoothTerrain = requested.smoothTerrain;
            host.loadNpcs = requested.loadNpcs;
            if (updated) host.clearMaps();
            return;
        }

        if (!host.instanceTemplateChunks) {
            // Malformed/incomplete instance state has no safe rebuild input.
            // Retain any resident map instead of suppressing streaming after a
            // destructive clear; the next server rebuild can apply the setting.
            host.smoothTerrain = requested.smoothTerrain;
            host.loadNpcs = requested.loadNpcs;
            return;
        }

        if (
            host.smoothTerrain === requested.smoothTerrain &&
            host.loadNpcs === requested.loadNpcs
        ) {
            return;
        }

        host.instanceSceneFallbackState = captureInstanceSceneFallback(host);
        host.smoothTerrain = requested.smoothTerrain;
        host.loadNpcs = requested.loadNpcs;
        host.instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
        const generation = host.instanceSceneGeneration;
        host.instanceSceneBuildPending = true;
        host.instanceSceneReady = false;

        const templateChunks = host.instanceTemplateChunks;
        const regionX = host.instanceRegionX;
        const regionY = host.instanceRegionY;
        const playerMapX = ((regionX * 8) / Scene.MAP_SQUARE_SIZE) | 0;
        const playerMapY = ((regionY * 8) / Scene.MAP_SQUARE_SIZE) | 0;

        void host
            .doInstanceSceneBuild(
                templateChunks,
                regionX,
                regionY,
                playerMapX,
                playerMapY,
                true,
                generation,
            )
            .then((loaded) => {
                if (host.instanceSceneGeneration !== generation) return;
                if (!loaded) {
                    failCurrentInstanceSceneBuild(
                        host,
                        new Error("instance settings rebuild returned no valid map data"),
                    );
                }
            })
            .catch((error) => {
                if (host.instanceSceneGeneration !== generation) return;
                failCurrentInstanceSceneBuild(host, error);
            });

}

export function getInstanceExtraLocs(host: WebGLOsrsRendererHost, 
        playerMapX: number,
        playerMapY: number,
    ): SdMapLoaderInput["extraLocs"] {

        if (host.addedLocs.size === 0) return undefined;

        // Instance scene is built as a single map square at (playerMapX, playerMapY).
        // Collect all addedLocs — the scene builder will filter by bounds.
        const locs: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }> = [];
        for (const loc of host.addedLocs.values()) {
            locs.push({
                id: loc.locId,
                x: loc.x,
                y: loc.y,
                level: loc.level,
                shape: loc.shape,
                rotation: loc.rotation,
            });
        }
        return locs.length > 0 ? locs : undefined;
    
}

export function scheduleInstanceLocRebuild(host: WebGLOsrsRendererHost, ): void {
        host.instanceLocRebuildPending = true;
        // A scene build snapshots extraLocs before awaiting the worker. Starting
        // another payload with the same generation here allows completion order
        // to restore the older snapshot. Coalesce changes until commit instead;
        // the follow-up build receives its own generation.
        if (host.instanceSceneBuildPending) return;
        if (host.instanceLocRebuildTimer !== null) {
            clearTimeout(host.instanceLocRebuildTimer);
        }
        host.instanceLocRebuildTimer = setTimeout(() => {
            host.instanceLocRebuildTimer = null;
            if (!host.instanceActive || !host.instanceTemplateChunks) {
                host.instanceLocRebuildPending = false;
                return;
            }
            console.log(
                `[WebGLOsrsRenderer] Rebuilding instance scene with ${host.addedLocs.size} extra locs`,
            );
            startPendingInstanceLocRebuild(host);
        }, 100);
    
}

export function clearInstance(host: WebGLOsrsRendererHost, ): void {

        host.instanceSceneGeneration = (host.instanceSceneGeneration + 1) | 0;
        host.instanceSceneBuildPending = false;
        host.instanceSceneReady = false;
        host.instanceScenePendingSettings = null;
        host.instanceSceneFallbackState = null;
        host.instanceLocRebuildPending = false;
        host.instanceActive = false;
        host.instanceTemplateChunks = null;
        if (host.instanceLocRebuildTimer !== null) {
            clearTimeout(host.instanceLocRebuildTimer);
            host.instanceLocRebuildTimer = null;
        }
        host.mapsToLoad.clear();
        host.mapManager.clearMaps();
        console.log("[WebGLOsrsRenderer] Instance cleared, normal map streaming resumed");
    
}
