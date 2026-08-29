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

export function _ecsUpdateNpcClient(host: WebGLOsrsRendererHost, map: WebGLMapSquare, clientTicksElapsed: number): void {

        const ids: number[] = map.npcEntityIds || ([] as any);
        if (ids.length === 0 || clientTicksElapsed <= 0) return;
        const ecs = host.osrsClient.npcEcs;
        const pe = host.osrsClient.playerEcs;

        for (let t = 0; t < clientTicksElapsed; t++) {
            for (let j = 0; j < ids.length; j++) {
                const id = ids[j] | 0;
                if (!ecs.isActive(id) || !ecs.isLinked(id)) continue;
                if (!host.shouldRenderNpcOwnershipFromMap(map, id)) continue;

                const walkingNow = ecs.shouldUseWalkAnim(id);
                const movementOrientation = walkingNow ? ecs.getCurrentStepRot(id) : undefined;
                ecs.setWalking(id, walkingNow);

                const npcWorldX = ecs.getWorldX(id) | 0;
                const npcWorldY = ecs.getWorldY(id) | 0;
                let desiredFacing: number | undefined;

                const npcInteractionIndex = ecs.getInteractionIndex?.(id);
                const npcInteraction =
                    typeof npcInteractionIndex === "number" && npcInteractionIndex >= 0
                        ? decodeInteractionIndex(npcInteractionIndex)
                        : null;
                if (npcInteraction) {
                    if (npcInteraction.type === "player") {
                        const targetIdx = pe.getIndexForServerId?.(npcInteraction.id | 0);
                        if (targetIdx != null) {
                            const px = pe.getX(targetIdx) | 0;
                            const py = pe.getY(targetIdx) | 0;
                            const dxFacing = (npcWorldX - px) | 0;
                            const dyFacing = (npcWorldY - py) | 0;
                            const facing = computeFacingRotation(dxFacing, dyFacing);
                            if (facing !== undefined) desiredFacing = facing;
                        }
                    } else if (npcInteraction.type === "npc") {
                        const targetEcs = ecs.getEcsIdForServer?.(npcInteraction.id | 0);
                        if (targetEcs != null && ecs.isLinked(targetEcs | 0)) {
                            const targetMapId = ecs.getMapId(targetEcs | 0) | 0;
                            const targetMapX = (targetMapId >> 8) & 0xff;
                            const targetMapY = targetMapId & 0xff;
                            const targetWorldX =
                                ((targetMapX << 13) + (ecs.getX(targetEcs | 0) | 0)) | 0;
                            const targetWorldY =
                                ((targetMapY << 13) + (ecs.getY(targetEcs | 0) | 0)) | 0;
                            const dxFacing = (npcWorldX - targetWorldX) | 0;
                            const dyFacing = (npcWorldY - targetWorldY) | 0;
                            const facing = computeFacingRotation(dxFacing, dyFacing);
                            if (facing !== undefined) desiredFacing = facing;
                        }
                    }
                }
                if (
                    desiredFacing === undefined &&
                    walkingNow &&
                    movementOrientation !== undefined
                ) {
                    desiredFacing = movementOrientation;
                }
                if (desiredFacing !== undefined) {
                    ecs.setTargetRot(id, desiredFacing);
                }

                // Rotate toward target orientation with rotation speed
                const rot = ecs.getRotation(id) | 0;
                const targetRot = ecs.getTargetRot(id) | 0;
                if (rot !== targetRot) {
                    const step = ecs.getRotationSpeed(id) | 0;
                    const newRot = interpolateRotation(rot, targetRot, step);
                    ecs.setRotation(id, newRot);
                }

                const seqId = ecs.getSeqId(id) | 0;
                const seqDelay = ecs.getSeqDelay?.(id) | 0;
                const extraAnimMap = map.npcExtraAnims?.[j];
                const extraLenMap = map.npcExtraFrameLengths?.[j];
                const { movementSeqId, idleSeqId, walkSeqId } = host.resolveNpcMovementSequenceIds(
                    ecs,
                    id,
                );
                const movementAnim =
                    (movementSeqId | 0) === (idleSeqId | 0)
                        ? (map.npcIdleFrames[j] as AnimationFrames | undefined)
                        : (movementSeqId | 0) === (walkSeqId | 0)
                            ? (((map.npcWalkFrames[j] ?? map.npcIdleFrames[j]) as AnimationFrames) ??
                                undefined)
                            : undefined;
                let movementLengths =
                    (movementSeqId | 0) === (idleSeqId | 0)
                        ? (map.npcIdleFrameLengths[j] as number[] | undefined)
                        : (movementSeqId | 0) === (walkSeqId | 0)
                            ? (((map.npcWalkFrameLengths[j] ??
                                map.npcIdleFrameLengths[j]) as number[]) ?? undefined)
                            : undefined;
                const currentMovementSeqId = ecs.getMovementSeqId?.(id) | 0;

                if ((movementSeqId | 0) !== (currentMovementSeqId | 0)) {
                    ecs.setMovementSeqId?.(id, movementSeqId | 0);
                    ecs.setMovementFrameIndex?.(id, 0);
                    ecs.setMovementAnimTick?.(id, 0);
                    ecs.setMovementLoopCount?.(id, 0);
                }

                let movementSeqType: any | undefined;
                if (movementSeqId >= 0) {
                    try {
                        movementSeqType = host.osrsClient.seqTypeLoader.load(movementSeqId | 0);
                    } catch {}
                }

                let movementFrameCount = Math.max(1, (movementAnim?.frames.length ?? 0) | 0);
                if (movementFrameCount <= 1 && movementSeqId >= 0) {
                    if (
                        !!movementSeqType?.isSkeletalSeq?.() ||
                        (movementSeqType?.skeletalId ?? -1) >= 0
                    ) {
                        movementFrameCount = Math.max(
                            1,
                            movementSeqType?.getSkeletalDuration?.() | 0,
                        );
                    } else if (Array.isArray(movementSeqType?.frameIds)) {
                        movementFrameCount = Math.max(1, movementSeqType.frameIds.length | 0);
                        if (!movementLengths) {
                            movementLengths = new Array<number>(movementFrameCount).fill(1);
                            for (let k = 0; k < movementFrameCount; k++) {
                                try {
                                    movementLengths[k] =
                                        movementSeqType.getFrameLength(
                                            host.osrsClient.seqFrameLoader,
                                            k | 0,
                                        ) | 0;
                                } catch {}
                            }
                        }
                    }
                }
                const movementStep = host.stepNpcSequenceTrack(
                    ecs.getMovementFrameIndex?.(id) | 0,
                    ecs.getMovementAnimTick?.(id) | 0,
                    ecs.getMovementLoopCount?.(id) | 0,
                    movementFrameCount | 0,
                    movementLengths,
                    movementSeqType,
                    false,
                );
                ecs.setMovementFrameIndex?.(id, movementStep.frameIndex | 0);
                ecs.setMovementAnimTick?.(id, movementStep.animTick | 0);
                ecs.setMovementLoopCount?.(id, movementStep.loopCount | 0);

                if (movementStep.frameAdvanced && movementSeqType?.frameSounds?.size) {
                    try {
                        host.osrsClient.handleSeqFrameSounds(
                            movementSeqType,
                            movementStep.frameIndex | 0,
                            {
                                position: {
                                    x: npcWorldX,
                                    y: npcWorldY,
                                    z: (ecs.getLevel(id) | 0) * 128,
                                },
                                isLocalPlayer: false,
                            },
                        );
                    } catch {}
                }

                if (seqId >= 0 && seqDelay === 0) {
                    let actionLengths = extraLenMap?.[seqId];
                    let actionFrameCount = 1;
                    let actionSeqType: any | undefined;
                    try {
                        actionSeqType = host.osrsClient.seqTypeLoader.load(seqId | 0);
                    } catch {}

                    const seqAnim = extraAnimMap?.[seqId];
                    if (seqAnim) {
                        actionFrameCount = Math.max(1, seqAnim.frames.length | 0);
                    } else if (
                        !!actionSeqType?.isSkeletalSeq?.() ||
                        (actionSeqType?.skeletalId ?? -1) >= 0
                    ) {
                        actionFrameCount = Math.max(1, actionSeqType?.getSkeletalDuration?.() | 0);
                    } else if (Array.isArray(actionSeqType?.frameIds)) {
                        actionFrameCount = Math.max(1, actionSeqType.frameIds.length | 0);
                        if (!actionLengths) {
                            actionLengths = new Array<number>(actionFrameCount).fill(1);
                            for (let k = 0; k < actionFrameCount; k++) {
                                try {
                                    actionLengths[k] =
                                        actionSeqType.getFrameLength(
                                            host.osrsClient.seqFrameLoader,
                                            k | 0,
                                        ) | 0;
                                } catch {}
                            }
                        }
                    }

                    const actionStep = host.stepNpcSequenceTrack(
                        ecs.getFrameIndex(id) | 0,
                        ecs.getAnimTick(id) | 0,
                        ecs.getLoopCount(id) | 0,
                        actionFrameCount | 0,
                        actionLengths,
                        actionSeqType,
                        true,
                    );

                    // Reference: updateActorAnimationState stops the sequence the
                    // moment it finishes (actor animation state reverts to none);
                    // corpse poses persist via the death seq's own frame lengths
                    // and the server despawning the NPC at the animation's end.
                    if (actionStep.cleared) {
                        ecs.clearSeq(id);
                    } else {
                        ecs.setFrameIndex(id, actionStep.frameIndex | 0);
                        ecs.setAnimTick(id, actionStep.animTick | 0);
                        ecs.setLoopCount(id, actionStep.loopCount | 0);
                    }

                    if (actionStep.frameAdvanced && actionSeqType?.frameSounds?.size) {
                        try {
                            host.osrsClient.handleSeqFrameSounds(
                                actionSeqType,
                                actionStep.frameIndex | 0,
                                {
                                    position: {
                                        x: npcWorldX,
                                        y: npcWorldY,
                                        z: (ecs.getLevel(id) | 0) * 128,
                                    },
                                    isLocalPlayer: false,
                                },
                            );
                        } catch {}
                    }
                }
            }
        }
    
}

export function _ecsUpdatePlayerServer(host: WebGLOsrsRendererHost, ): void {

        return;
    
}
