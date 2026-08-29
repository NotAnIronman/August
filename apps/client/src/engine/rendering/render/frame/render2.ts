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

export function renderGeometryPass(host: WebGLOsrsRendererHost, transparent: boolean): void {

        const roofPlaneLimit = host.getRoofPlaneLimit();
        const cullTile = host.getRenderCullTile();

        const count = host.mapManager.visibleMapCount;
        if (count === 0) {
            if (!transparent) {
                host.lastLodVisibleMapCount = 0;
                host.lastFullDetailVisibleMapCount = 0;
                host.lastDistanceCulledVisibleMapCount = 0;
            }
            return;
        }

        const start = transparent ? count - 1 : 0;
        const end = transparent ? -1 : count;
        const step = transparent ? -1 : 1;
        const renderDistanceTiles = Math.max(0, host.getFrameRenderDistanceTiles() | 0);
        const renderDistancePadTiles = 0;
        // LOD threshold in tiles from player tile to map bounds.
        const lodThresholdTiles = Math.max(0, host.getFrameLodThresholdTiles() | 0);
        let lodVisibleMapCount = 0;
        let fullDetailVisibleMapCount = 0;
        let distanceCulledVisibleMapCount = 0;

        for (let i = start; i !== end; i += step) {
            const map = host.mapManager.visibleMaps[i];
            const tileDistance = host.getMapTileDistanceFromPoint(map, cullTile.x, cullTile.y);
            if (
                !host.isMapWithinRenderDistance(
                    map,
                    cullTile.x,
                    cullTile.y,
                    renderDistanceTiles,
                    renderDistancePadTiles,
                )
            ) {
                distanceCulledVisibleMapCount++;
                continue;
            }

            // GPU interaction readback removed - always use non-interact draw calls
            const isInteract = false;
            const isLod = tileDistance > lodThresholdTiles;
            if (isLod) {
                lodVisibleMapCount++;
            } else {
                fullDetailVisibleMapCount++;
            }

            const { drawCall, drawRanges } = map.getDrawCall(transparent, isInteract, isLod);
            const drawRangePlanes = map.getDrawRangesPlanes(transparent, isInteract, isLod);

            const isWorldEntity = host.mapManager.worldEntityMapIds.has(map.id);
            let weTransform: Float32Array = WebGLMapSquare.IDENTITY_MAT4;
            let weEntityIndex: number | undefined;
            if (isWorldEntity) {
                weEntityIndex = host.getWorldEntityIndexForMapId(map.id);
                if (weEntityIndex !== undefined) {
                    weTransform =
                        host.worldEntityAnimator?.getTransform(weEntityIndex) ??
                        WebGLMapSquare.IDENTITY_MAT4;
                }
            }

            drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
            drawCall.uniform("u_worldEntityTransform", weTransform);
            drawCall.uniform("u_worldEntityOpacity", 1.0);

            host.drawWithRoofPlaneFilter(drawCall, drawRanges, drawRangePlanes, roofPlaneLimit);

            const locBatch = map.getLocDrawCall(transparent, isInteract, isLod);
            if (locBatch) {
                const locDrawRangePlanes = map.getLocDrawRangesPlanes(
                    transparent,
                    isInteract,
                    isLod,
                );
                locBatch.drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
                locBatch.drawCall.uniform("u_worldEntityTransform", weTransform);
                locBatch.drawCall.uniform("u_worldEntityOpacity", 1.0);
                host.updateAnimatedDrawRanges(
                    map,
                    locBatch.drawCall,
                    locBatch.drawRanges,
                    transparent,
                    isInteract,
                    isLod,
                );
                host.drawWithRoofPlaneFilter(
                    locBatch.drawCall,
                    locBatch.drawRanges,
                    locDrawRangePlanes,
                    roofPlaneLimit,
                );
            }

            const groundBatch = map.getGroundItemDrawCall(transparent, isInteract, isLod);
            if (groundBatch) {
                const groundDrawRangePlanes = map.getGroundItemDrawRangesPlanes(
                    transparent,
                    isInteract,
                    isLod,
                );
                groundBatch.drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
                groundBatch.drawCall.uniform("u_worldEntityTransform", weTransform);
                groundBatch.drawCall.uniform("u_worldEntityOpacity", 1.0);
                host.drawWithRoofPlaneFilter(
                    groundBatch.drawCall,
                    groundBatch.drawRanges,
                    groundDrawRangePlanes,
                    roofPlaneLimit,
                );
            }

            const doorBatch = map.getDoorDrawCall(transparent, isInteract, isLod);
            if (doorBatch) {
                const doorDrawRangePlanes = map.getDoorDrawRangesPlanes(
                    transparent,
                    isInteract,
                    isLod,
                );
                doorBatch.drawCall.uniform("u_roofPlaneLimit", roofPlaneLimit);
                doorBatch.drawCall.uniform("u_worldEntityTransform", weTransform);
                host.drawWithRoofPlaneFilter(
                    doorBatch.drawCall,
                    doorBatch.drawRanges,
                    doorDrawRangePlanes,
                    roofPlaneLimit,
                );
            }

            // Mode1 overlap ghost: redraw WE with tint + low opacity when actors overlap
            if (isWorldEntity && weEntityIndex !== undefined && !transparent) {
                const weEntity = host.osrsClient.worldViewManager.getWorldEntity(weEntityIndex);
                if (weEntity && weEntity.drawMode === 1) {
                    const weView = host.osrsClient.worldViewManager.getWorldView(weEntityIndex);
                    const hasOverlap =
                        weView && (weView.npcIds.size > 0 || weView.playerIds.size > 0);
                    if (hasOverlap) {
                        const overlay = host.worldEntityOverlays.get(weEntityIndex);
                        const weType =
                            overlay?.configId !== undefined && overlay.configId >= 0
                                ? host.osrsClient.worldEntityTypeLoader?.load(overlay.configId)
                                : undefined;
                        if (weType && weType.sceneTintHsl > 0 && host.sceneUniformBuffer) {
                            host.setSceneHslOverrideFromPacked(weType.sceneTintHsl, 127);
                            host.sceneUniformBuffer
                                .set(4, host.sceneHslOverride as Float32Array)
                                .update();

                            host.app.enable(PicoGL.BLEND);
                            host.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

                            drawCall.uniform("u_worldEntityOpacity", 0.01);
                            host.drawWithRoofPlaneFilter(
                                drawCall,
                                drawRanges,
                                drawRangePlanes,
                                roofPlaneLimit,
                            );
                            drawCall.uniform("u_worldEntityOpacity", 1.0);

                            host.app.disable(PicoGL.BLEND);

                            host.clearSceneHslOverride();
                            host.sceneUniformBuffer
                                .set(4, host.sceneHslOverride as Float32Array)
                                .update();
                        }
                    }
                }
            }
        }

        if (!transparent) {
            host.lastLodVisibleMapCount = lodVisibleMapCount;
            host.lastFullDetailVisibleMapCount = fullDetailVisibleMapCount;
            host.lastLodThreshold = lodThresholdTiles | 0;
            host.lastDistanceCulledVisibleMapCount = distanceCulledVisibleMapCount;
        }
    
}

export function renderOpaquePass(host: WebGLOsrsRendererHost, ): void {

        host.renderGeometryPass(false);
    
}

export function renderTransparentPass(host: WebGLOsrsRendererHost, ): void {

        host.renderGeometryPass(true);
    
}
