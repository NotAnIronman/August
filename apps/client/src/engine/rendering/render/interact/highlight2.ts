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
import { RENDER_CONSTANTS, LocHighlightTarget, NpcHighlightTarget } from "@client/engine/rendering/render/constants";

export function buildLocModelHighlightTriangles(host: WebGLOsrsRendererHost, 
        target: LocHighlightTarget,
    ): ReadonlyArray<readonly [number, number, number]> | undefined {

        const locModelLoader = host.getInteractLocModelLoader();
        if (!locModelLoader) return undefined;

        let locType = host.osrsClient.locTypeLoader.load(target.locId | 0);
        if (!locType) return undefined;
        let sizeX = Math.max(1, Number(locType.sizeX ?? 1));
        let sizeY = Math.max(1, Number(locType.sizeY ?? 1));
        if (locType.transforms) {
            const transformed = locType.transform(
                host.osrsClient.varManager,
                host.osrsClient.locTypeLoader,
            );
            if (transformed) {
                locType = transformed;
            }
        }

        const rawType =
            typeof target.locModelType === "number" ? (target.locModelType | 0) & 0x3f : undefined;
        const rawRotation =
            typeof target.locRotation === "number" ? (target.locRotation | 0) & 0x3 : undefined;
        if (rawType === undefined || rawRotation === undefined) {
            return undefined;
        }

        let modelType = rawType;
        let modelRotation = rawRotation;
        if (modelType === LocModelType.NORMAL_DIAGIONAL) {
            modelType = LocModelType.NORMAL;
            modelRotation = (rawRotation + 4) & 0x7;
        }

        // Find the current animation frame from the map's animated loc list.
        // LocAnimated x/y are in RS sub-tile units (localTile * 128 + 64).
        let seqId = locType.seqId ?? -1;
        let seqFrame = 0;
        const locMap = host.getPreferredMapForWorldTile(target.tileX, target.tileY);
        if (locMap) {
            const localTile = host.getMapLocalTile(locMap, target.tileX, target.tileY);
            if (localTile) {
                const rsX = (localTile.x * 128 + 64) | 0;
                const rsY = (localTile.y * 128 + 64) | 0;
                for (const anim of locMap.locsAnimated) {
                    if (
                        anim.id === (target.locId | 0) &&
                        anim.x === rsX &&
                        anim.y === rsY &&
                        anim.level === (target.plane | 0)
                    ) {
                        seqId = anim.seqType?.id ?? seqId;
                        seqFrame = anim.frame | 0;
                        break;
                    }
                }
            }
        }
        let model = locModelLoader.getModelAnimated(
            locType,
            modelType as LocModelType,
            modelRotation,
            seqId,
            seqFrame,
        );

        // Invisible interaction volumes (all faces fully transparent) use a
        // visual proxy loc at the same tile for the highlight outline.
        if (model && host.hasNoVisibleFaces(model)) {
            const proxy = host.findVisualProxyModel(
                locModelLoader,
                target,
                modelType,
                modelRotation,
            );
            if (proxy) {
                model = proxy;
                target.overworldProxy = true;
            }
        }

        if (!model || !model.verticesX || !model.verticesY || !model.verticesZ) {
            return undefined;
        }

        if (rawRotation === 1 || rawRotation === 3) {
            const tmp = sizeX;
            sizeX = sizeY;
            sizeY = tmp;
        }
        const entityX = (target.tileX << 7) + (sizeX << 6);
        const entityZ = (target.tileY << 7) + (sizeY << 6);
        // For world entity overlay locs, sample overworld height (plane 0) — the GPU
        // renders at the overlay's source plane height which sits at sea level, not a
        // full UNITS_LEVEL_HEIGHT below.
        const heightMap = host.getPreferredMapForWorldTile(target.tileX, target.tileY);
        const isOverlay = !target.overworldProxy && heightMap && heightMap.interactionPlane >= 0;
        const heightPlane = isOverlay ? 0 : target.plane | 0;
        let baseY = sampleBridgeHeightForWorldTile(
            host.mapManager,
            entityX / 128.0,
            entityZ / 128.0,
            heightPlane,
            BridgePlaneStrategy.RENDER,
        ).height;
        if (isOverlay) {
            baseY += host.getWorldEntityDeckHeight(0, 0) / 128.0;
        }
        return host.buildModelTrianglePoints(model, (i) => ({
            x: (entityX + model.verticesX[i]) / 128.0,
            y: baseY + model.verticesY[i] / 128.0,
            z: (entityZ + model.verticesZ[i]) / 128.0,
        }));
    
}

export function buildNpcModelHighlightTriangles(host: WebGLOsrsRendererHost, 
        target: NpcHighlightTarget,
    ): ReadonlyArray<readonly [number, number, number]> | undefined {

        const npcEcs = host.osrsClient.npcEcs;
        const ecsId = target.ecsId | 0;
        if (!npcEcs.isActive(ecsId) || !npcEcs.isLinked(ecsId)) return undefined;
        if ((npcEcs.getServerId(ecsId) | 0) !== (target.serverId | 0)) return undefined;

        const npcModelLoader = host.getInteractNpcModelLoader();
        if (!npcModelLoader) return undefined;

        const npcTypeId = npcEcs.getNpcTypeId(ecsId) | 0;
        const npcType = host.osrsClient.npcTypeLoader.load(npcTypeId);
        if (!npcType) return undefined;

        const actionSeqId = npcEcs.getSeqId(ecsId) | 0;
        const actionDelay = npcEcs.getSeqDelay?.(ecsId) | 0;
        const { movementSeqId, idleSeqId } = host.resolveNpcMovementSequenceIds(npcEcs, ecsId);
        const actionActive = actionSeqId >= 0 && actionDelay === 0;
        const seqId = actionActive ? actionSeqId : movementSeqId;
        const frame = Math.max(
            0,
            actionActive
                ? npcEcs.getFrameIndex(ecsId) | 0
                : npcEcs.getMovementFrameIndex?.(ecsId) | 0,
        );
        const movementFrame = Math.max(0, npcEcs.getMovementFrameIndex?.(ecsId) | 0);
        const overlaySeqId =
            actionActive &&
            host.shouldLayerNpcMovementSequence(actionSeqId | 0, movementSeqId | 0, idleSeqId | 0)
                ? movementSeqId | 0
                : -1;

        let model =
            seqId >= 0
                ? npcModelLoader.getModel(
                    npcType,
                    seqId | 0,
                    frame | 0,
                    overlaySeqId | 0,
                    (overlaySeqId >= 0 ? movementFrame : -1) | 0,
                )
                : undefined;
        if (!model) {
            model = npcModelLoader.getModel(npcType, -1, -1);
        }
        if (!model || !model.verticesX || !model.verticesY || !model.verticesZ) {
            return undefined;
        }
        const modelForTriangles = model;

        const mapId = npcEcs.getMapId(ecsId) | 0;
        const mapX = (mapId >> 8) & 0xff;
        const mapY = mapId & 0xff;
        const centerSceneX = (mapX << 13) + (npcEcs.getX(ecsId) | 0);
        const centerSceneZ = (mapY << 13) + (npcEcs.getY(ecsId) | 0);
        const plane = npcEcs.getLevel(ecsId) | 0;
        target.plane = plane;
        // Match NPC rendering height: bridge-aware sampling, ground clearance,
        // and deck height for world entities.
        let baseY = sampleBridgeHeightForWorldTile(
            host.mapManager,
            centerSceneX / 128.0,
            centerSceneZ / 128.0,
            plane | 0,
            BridgePlaneStrategy.RENDER,
        ).height;
        baseY += RENDER_CONSTANTS.ACTOR_GROUND_CLEARANCE_MODEL_UNITS / 128.0;
        const wvId = npcEcs.getWorldViewId?.(ecsId) ?? -1;
        if (wvId >= 0 && host.osrsClient.worldViewManager.getWorldView(wvId)) {
            const deckH = host.getWorldEntityDeckHeight(0, 0);
            baseY += deckH / 128.0;
        }
        const angle = (npcEcs.getRotation(ecsId) | 0) * RS_TO_RADIANS;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return host.buildModelTrianglePoints(modelForTriangles, (i) => {
            const vx = modelForTriangles.verticesX[i] | 0;
            const vz = modelForTriangles.verticesZ[i] | 0;
            // Match npc.vert.glsl exactly:
            // vec4(vertex.pos, 1.0) * rotationY(angle)
            const rx = vx * cos + vz * sin;
            const rz = -vx * sin + vz * cos;
            return {
                x: (centerSceneX + rx) / 128.0,
                y: baseY + modelForTriangles.verticesY[i] / 128.0,
                z: (centerSceneZ + rz) / 128.0,
            };
        });
    
}
