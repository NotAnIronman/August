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
import { RENDER_CONSTANTS, InteractHighlightTarget, LocHighlightTarget } from "@client/engine/rendering/render/constants";

export function getInteractHighlightDrawTargets(host: WebGLOsrsRendererHost, ): ReadonlyArray<InteractHighlightDrawTarget> {

        const out = host.interactHighlightDrawTargets;
        out.length = 0;

        const config = host.osrsClient.interactHighlightPlugin.getConfig();
        if (!config.enabled) return out;

        host.syncInteractHighlightActiveTargetFromLocalInteraction();
        host.maybeExpireInteractHighlightTarget();

        const getWeTransform = (target: InteractHighlightTarget): Float32Array | undefined => {
            if (target.kind === "npc") {
                const wvId = host.osrsClient.npcEcs.getWorldViewId?.(target.ecsId) ?? -1;
                if (wvId >= 0) return host.worldEntityAnimator?.getTransform(wvId);
            }
            if (target.kind === "loc" && !target.overworldProxy) {
                const map = host.getPreferredMapForWorldTile(target.tileX, target.tileY);
                if (map && host.mapManager.worldEntityMapIds.has(map.id)) {
                    const weIdx = host.getWorldEntityIndexForMapId(map.id);
                    if (weIdx !== undefined) return host.worldEntityAnimator?.getTransform(weIdx);
                }
            }
            return undefined;
        };

        if (config.showInteract && host.interactHighlightActiveTarget) {
            const trianglePoints = host.buildHighlightTrianglePoints(
                host.interactHighlightActiveTarget,
            );
            if (trianglePoints && trianglePoints.length >= 3) {
                out.push({
                    trianglePoints,
                    color: config.interactColor,
                    alpha: 0.45,
                    worldEntityTransform: getWeTransform(host.interactHighlightActiveTarget),
                });
            }
        }

        if (config.showHover && host.interactHighlightHoverTarget) {
            const showingActive =
                config.showInteract &&
                host.isSameInteractHighlightTarget(
                    host.interactHighlightHoverTarget,
                    host.interactHighlightActiveTarget,
                );
            if (!showingActive) {
                const trianglePoints = host.buildHighlightTrianglePoints(
                    host.interactHighlightHoverTarget,
                );
                if (trianglePoints && trianglePoints.length >= 3) {
                    out.push({
                        trianglePoints,
                        color: config.hoverColor,
                        alpha: 0.45,
                        worldEntityTransform: getWeTransform(host.interactHighlightHoverTarget),
                    });
                }
            }
        }

        return out;
    
}

export function syncInteractHighlightActiveTargetFromLocalInteraction(host: WebGLOsrsRendererHost, ): void {

        const interactionTarget = host.resolveInteractHighlightTargetFromLocalInteraction();
        if (interactionTarget) {
            if (
                !host.isSameInteractHighlightTarget(
                    interactionTarget,
                    host.interactHighlightActiveTarget,
                )
            ) {
                host.interactHighlightActiveTarget = interactionTarget;
            }
            host.interactHighlightClickTick = -1;
            host.interactHighlightActiveFromInteraction = true;
            return;
        }

        if (host.interactHighlightActiveFromInteraction) {
            host.clearInteractHighlightActiveTarget();
        }
    
}

export function resolveInteractHighlightTargetFromLocalInteraction(host: WebGLOsrsRendererHost, ):
        | InteractHighlightTarget
        | undefined {

        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        if (controlledServerId < 0) return undefined;

        const playerEcs = host.osrsClient.playerEcs;
        const controlledEcsId = playerEcs.getIndexForServerId(controlledServerId);
        if (controlledEcsId === undefined) return undefined;

        const interactionIndex = playerEcs.getInteractionIndex(controlledEcsId) | 0;
        if (interactionIndex < 0) return undefined;

        const decoded = decodeInteractionIndex(interactionIndex);
        if (!decoded) return undefined;
        if (decoded.type !== "npc") return undefined;

        return host.resolveNpcHighlightTargetFromServerId(decoded.id | 0);
    
}

export function maybeExpireInteractHighlightTarget(host: WebGLOsrsRendererHost, ): void {

        if (!host.interactHighlightActiveTarget) return;
        if (host.interactHighlightActiveTarget.kind === "loc") {
            if (!host.isLocHighlightTargetStillPresent(host.interactHighlightActiveTarget)) {
                host.clearInteractHighlightActiveTarget();
                return;
            }
        }
        if (host.interactHighlightActiveFromInteraction) return;
        const clickTick = host.interactHighlightClickTick | 0;
        if (clickTick < 0) return;
        if (!host.hasActiveDestinationMarker() && (getCurrentTick() | 0) > clickTick) {
            host.clearInteractHighlightActiveTarget();
        }
    
}

export function isLocHighlightTargetStillPresent(host: WebGLOsrsRendererHost, target: LocHighlightTarget): boolean {

        // Clear highlight if the player changed planes (e.g. climbing stairs)
        if ((host.getPlayerBasePlane() | 0) !== (target.plane | 0)) {
            return false;
        }
        const typeRot = host.resolveLocTypeRotAtTile(
            target.locId | 0,
            target.tileX | 0,
            target.tileY | 0,
            target.plane | 0,
        );
        if (typeof typeRot !== "number") {
            return false;
        }
        target.locModelType = (typeRot & 0x3f) | 0;
        target.locRotation = ((typeRot >> 6) & 0x3) | 0;
        return true;
    
}

export function hasActiveDestinationMarker(host: WebGLOsrsRendererHost, ): boolean {

        return (ClientState.destinationX | 0) !== 0 || (ClientState.destinationY | 0) !== 0;
    
}

export function isSameInteractHighlightTarget(host: WebGLOsrsRendererHost, 
        a: InteractHighlightTarget | undefined,
        b: InteractHighlightTarget | undefined,
    ): boolean {

        if (!a || !b) return false;
        if (a.kind !== b.kind) return false;
        if (a.kind === "loc" && b.kind === "loc") {
            return (
                (a.locId | 0) === (b.locId | 0) &&
                (a.tileX | 0) === (b.tileX | 0) &&
                (a.tileY | 0) === (b.tileY | 0) &&
                (a.plane | 0) === (b.plane | 0)
            );
        }
        if (a.kind === "npc" && b.kind === "npc") {
            return (a.serverId | 0) === (b.serverId | 0);
        }
        return false;
    
}

export function buildHighlightTrianglePoints(host: WebGLOsrsRendererHost, 
        target: InteractHighlightTarget,
    ): ReadonlyArray<readonly [number, number, number]> | undefined {

        if (target.kind === "loc") {
            return host.buildLocModelHighlightTriangles(target);
        }
        return host.buildNpcModelHighlightTriangles(target);
    
}

export function getInteractLocModelLoader(host: WebGLOsrsRendererHost, ): LocModelLoader | undefined {

        if (host.interactLocModelLoader) {
            return host.interactLocModelLoader;
        }
        const textureLoader = host.osrsClient.textureLoader;
        const modelLoader = host.osrsClient.modelLoader;
        const locTypeLoader = host.osrsClient.locTypeLoader;
        const seqTypeLoader = host.osrsClient.seqTypeLoader;
        const seqFrameLoader = host.osrsClient.seqFrameLoader;
        if (!textureLoader || !modelLoader || !locTypeLoader || !seqTypeLoader || !seqFrameLoader) {
            return undefined;
        }
        host.interactLocModelLoader = new LocModelLoader(
            locTypeLoader,
            modelLoader,
            textureLoader,
            seqTypeLoader,
            seqFrameLoader,
            host.osrsClient.skeletalSeqLoader,
        );
        return host.interactLocModelLoader;
    
}

export function getInteractNpcModelLoader(host: WebGLOsrsRendererHost, ): NpcModelLoader | undefined {

        if (host.interactNpcModelLoader) {
            return host.interactNpcModelLoader;
        }
        const textureLoader = host.osrsClient.textureLoader;
        const modelLoader = host.osrsClient.modelLoader;
        const npcTypeLoader = host.osrsClient.npcTypeLoader;
        const seqTypeLoader = host.osrsClient.seqTypeLoader;
        const seqFrameLoader = host.osrsClient.seqFrameLoader;
        if (!textureLoader || !modelLoader || !npcTypeLoader || !seqTypeLoader || !seqFrameLoader) {
            return undefined;
        }
        host.interactNpcModelLoader = new NpcModelLoader(
            npcTypeLoader,
            modelLoader,
            textureLoader,
            seqTypeLoader,
            seqFrameLoader,
            host.osrsClient.skeletalSeqLoader,
            host.osrsClient.varManager,
        );
        return host.interactNpcModelLoader;
    
}

export function hasNoVisibleFaces(host: WebGLOsrsRendererHost, model: Model): boolean {

        if (!model.faceAlphas) return false;
        for (let i = 0; i < model.faceAlphas.length; i++) {
            if ((model.faceAlphas[i] & 0xff) < 254) return false;
        }
        return true;
    
}

export function findVisualProxyModel(host: WebGLOsrsRendererHost, 
        locModelLoader: LocModelLoader,
        target: LocHighlightTarget,
        modelType: number,
        modelRotation: number,
    ): Model | undefined {

        for (let mi = 0; mi < host.mapManager.visibleMapCount; mi++) {
            const map = host.mapManager.visibleMaps[mi];
            if (!map) continue;
            const local = host.getMapLocalTile(map, target.tileX, target.tileY);
            if (!local) continue;
            const rsX = (local.x * 128 + 64) | 0;
            const rsY = (local.y * 128 + 64) | 0;
            for (const anim of map.locsAnimated) {
                if (anim.id === (target.locId | 0)) continue;
                if (anim.x !== rsX || anim.y !== rsY) continue;
                const proxyType = host.osrsClient.locTypeLoader.load(anim.id);
                if (!proxyType) continue;
                const proxyModel =
                    locModelLoader.getModelAnimated(
                        proxyType,
                        LocModelType.NORMAL,
                        anim.rotation ?? 0,
                        anim.seqType?.id ?? -1,
                        anim.frame | 0,
                    ) ??
                    locModelLoader.getModelAnimated(
                        proxyType,
                        modelType as LocModelType,
                        modelRotation,
                        anim.seqType?.id ?? -1,
                        anim.frame | 0,
                    );
                if (proxyModel && !host.hasNoVisibleFaces(proxyModel)) {
                    return proxyModel;
                }
            }
        }
        return undefined;
    
}
