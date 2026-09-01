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

export function _resolveNpcAnimation(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        npcIndex: number,
        ecs: NpcEcs,
        ecsId: number,
    ): AnimationFrames {

        const extraAnimMap = map.npcExtraAnims?.[npcIndex];
        const seqId = ecs.getSeqId(ecsId) | 0;
        const seqDelay = ecs.getSeqDelay?.(ecsId) | 0;
        if (seqId >= 0 && seqDelay === 0) {
            const extraAnim = extraAnimMap?.[seqId];
            if (extraAnim) {
                return extraAnim;
            }
        }
        const movementSeqId = host.resolveNpcMovementSequenceIds(ecs, ecsId).movementSeqId | 0;
        if (movementSeqId >= 0) {
            const extraMovementAnim = extraAnimMap?.[movementSeqId];
            if (extraMovementAnim) {
                return extraMovementAnim;
            }
        }
        const useWalk = ecs.isWalking(ecsId);
        return ((useWalk ? map.npcWalkFrames[npcIndex] : undefined) ??
            map.npcIdleFrames[npcIndex]) as AnimationFrames;
    
}

const NPC_IDLE_SEQUENCE_OVERRIDES: ReadonlyMap<number, number> = new Map([
    [13011, 10995], // Blood Moon
    [13012, 11016], // Eclipse Moon
    [13013, 10995], // Blue Moon
]);

export function resolveNpcMovementSequenceIds(host: WebGLOsrsRendererHost, 
        ecs: NpcEcs,
        ecsId: number,
    ): { movementSeqId: number; idleSeqId: number; walkSeqId: number } {

        let movementSeqId = -1;
        let idleSeqId = -1;
        let walkSeqId = -1;
        const npcTypeId = ecs.getNpcTypeId?.(ecsId);
        if (typeof npcTypeId !== "number" || npcTypeId < 0) {
            return { movementSeqId, idleSeqId, walkSeqId };
        }

        try {
            const npcType = host.osrsClient.npcTypeLoader.load(npcTypeId | 0);
            if (!npcType) {
                return { movementSeqId, idleSeqId, walkSeqId };
            }

            const movementSet = npcType.getMovementSeqSet(host.osrsClient.basTypeLoader);
            // Moon encounter idle overrides are server-side today; use the
            // matching presentation override until that field is carried by
            // NPC synchronization.
            idleSeqId = NPC_IDLE_SEQUENCE_OVERRIDES.get(npcTypeId | 0) ?? (movementSet.idle | 0);
            walkSeqId = movementSet.walk | 0;
            const pathLength = ecs.getPathLengthLike?.(ecsId) | 0;
            if (pathLength <= 0) {
                movementSeqId = idleSeqId;
                // Turn-in-place: while still rotating toward the target
                // orientation, play the idle-rotate sequence (walk fallback).
                const rot = ecs.getRotation(ecsId) | 0;
                const targetRot = ecs.getTargetRot(ecsId) | 0;
                const delta = (targetRot - rot) & 2047;
                if (delta !== 0) {
                    const rotSpeed = ecs.getRotationSpeed(ecsId) | 0;
                    const stillTurning =
                        rotSpeed > 0 && delta >= rotSpeed && delta <= 2048 - rotSpeed;
                    if (stillTurning) {
                        const turnSeq =
                            delta > 1024 ? movementSet.turnLeft | 0 : movementSet.turnRight | 0;
                        const resolved = turnSeq >= 0 ? turnSeq : walkSeqId;
                        if (resolved >= 0) movementSeqId = resolved;
                    }
                }
                return { movementSeqId, idleSeqId, walkSeqId };
            }

            const movementOrientation = ecs.getCurrentStepRot(ecsId);
            if (movementOrientation === undefined) {
                movementSeqId = walkSeqId >= 0 ? walkSeqId : idleSeqId;
                return { movementSeqId, idleSeqId, walkSeqId };
            }

            let yaw = ((movementOrientation | 0) - (ecs.getRotation(ecsId) | 0)) & 2047;
            if (yaw > 1024) yaw -= 2048;

            let nextSeq = movementSet.walkBack | 0;
            if (yaw >= -256 && yaw <= 256) nextSeq = movementSet.walk | 0;
            else if (yaw >= 256 && yaw < 768) nextSeq = movementSet.walkRight | 0;
            else if (yaw >= -768 && yaw <= -256) nextSeq = movementSet.walkLeft | 0;
            if (nextSeq === -1) {
                nextSeq = movementSet.walk | 0;
            }

            let speed = 4;
            if (!!npcType.isClipped) {
                if (
                    (movementOrientation | 0) !== (ecs.getRotation(ecsId) | 0) &&
                    (ecs.getInteractionIndex?.(ecsId) | 0) < 0 &&
                    (ecs.getRotationSpeed(ecsId) | 0) !== 0
                ) {
                    speed = 2;
                }
                if (pathLength > 2) speed = 6;
                if (pathLength > 3) speed = 8;
                if ((ecs.getMovementDelayCounter?.(ecsId) | 0) > 0 && pathLength > 1) {
                    speed = 8;
                }
            } else {
                if (pathLength > 1) speed = 6;
                if (pathLength > 2) speed = 8;
                if ((ecs.getMovementDelayCounter?.(ecsId) | 0) > 0 && pathLength > 1) {
                    speed = 8;
                }
            }

            const rawTraversal = ecs.getCurrentStepSpeed(ecsId) | 0;
            if (rawTraversal >= 8) speed <<= 1;
            else if (rawTraversal <= 2) speed >>= 1;

            if (speed >= 8) {
                if (nextSeq === (movementSet.walk | 0) && (movementSet.run | 0) !== -1) {
                    nextSeq = movementSet.run | 0;
                } else if (
                    nextSeq === (movementSet.walkBack | 0) &&
                    (movementSet.runBack | 0) !== -1
                ) {
                    nextSeq = movementSet.runBack | 0;
                } else if (
                    nextSeq === (movementSet.walkLeft | 0) &&
                    (movementSet.runLeft | 0) !== -1
                ) {
                    nextSeq = movementSet.runLeft | 0;
                } else if (
                    nextSeq === (movementSet.walkRight | 0) &&
                    (movementSet.runRight | 0) !== -1
                ) {
                    nextSeq = movementSet.runRight | 0;
                }
            } else if (speed <= 2) {
                if (nextSeq === (movementSet.walk | 0) && (movementSet.crawl | 0) !== -1) {
                    nextSeq = movementSet.crawl | 0;
                } else if (
                    nextSeq === (movementSet.walkBack | 0) &&
                    (movementSet.crawlBack | 0) !== -1
                ) {
                    nextSeq = movementSet.crawlBack | 0;
                } else if (
                    nextSeq === (movementSet.walkLeft | 0) &&
                    (movementSet.crawlLeft | 0) !== -1
                ) {
                    nextSeq = movementSet.crawlLeft | 0;
                } else if (
                    nextSeq === (movementSet.walkRight | 0) &&
                    (movementSet.crawlRight | 0) !== -1
                ) {
                    nextSeq = movementSet.crawlRight | 0;
                }
            }

            movementSeqId = nextSeq | 0;
            if (movementSeqId < 0) {
                movementSeqId = walkSeqId >= 0 ? walkSeqId : idleSeqId;
            }
        } catch {}

        return { movementSeqId, idleSeqId, walkSeqId };
    
}

export function shouldLayerNpcMovementSequence(host: WebGLOsrsRendererHost, 
        actionSeqId: number,
        movementSeqId: number,
        idleSeqId: number,
    ): boolean {

        if (
            (actionSeqId | 0) < 0 ||
            (movementSeqId | 0) < 0 ||
            (movementSeqId | 0) === (idleSeqId | 0)
        ) {
            return false;
        }

        try {
            const seqType = host.osrsClient.seqTypeLoader.load(actionSeqId | 0) as any;
            if (seqType?.isSkeletalSeq?.()) {
                return Array.isArray(seqType.skeletalMasks);
            }
            return Array.isArray(seqType?.masks) && seqType.masks.length > 0;
        } catch {
            return false;
        }
    
}
