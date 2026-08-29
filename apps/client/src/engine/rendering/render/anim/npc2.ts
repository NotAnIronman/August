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

export function stepNpcSequenceTrack(host: WebGLOsrsRendererHost, 
        frameIndex: number,
        animTick: number,
        loopCount: number,
        frameCount: number,
        lengths: number[] | undefined,
        seqType: any,
        clearOnFinish: boolean,
    ): {
        frameIndex: number;
        animTick: number;
        loopCount: number;
        frameAdvanced: boolean;
        cleared: boolean;
    } {

        let fi = Math.max(0, frameIndex | 0);
        let tick = Math.max(0, animTick | 0);
        let loops = Math.max(0, loopCount | 0);
        const safeFrameCount = Math.max(1, frameCount | 0);
        let frameAdvanced = false;
        let cleared = false;

        if (fi >= safeFrameCount) {
            fi = 0;
        }

        if (!seqType) {
            const currLen = ((lengths ? lengths[fi] : 0) ?? 0) | 0;
            tick = (tick + 1) | 0;
            if (tick > currLen) {
                tick = 1;
                fi++;
                frameAdvanced = true;
            }
            if (fi >= safeFrameCount) {
                if (clearOnFinish) {
                    cleared = true;
                } else {
                    fi = 0;
                    tick = 0;
                    loops = 0;
                }
            }
            return { frameIndex: fi, animTick: tick, loopCount: loops, frameAdvanced, cleared };
        }

        if (!!seqType?.isSkeletalSeq?.() || (seqType?.skeletalId ?? -1) >= 0) {
            const frameStep = (seqType.frameStep ?? -1) | 0;
            const maxLoops = (seqType.maxLoops ?? 0) | 0;

            fi++;
            tick = 0;
            frameAdvanced = true;

            if (fi >= safeFrameCount) {
                if (frameStep > 0) {
                    fi -= frameStep;
                    if (clearOnFinish) {
                        loops++;
                        cleared = loops >= maxLoops || fi < 0 || fi >= safeFrameCount;
                    } else {
                        const looping = !!seqType.looping;
                        if (looping) loops++;
                        if (fi < 0 || fi >= safeFrameCount || (looping && loops >= maxLoops)) {
                            fi = 0;
                            tick = 0;
                            loops = 0;
                        }
                    }
                } else if (clearOnFinish) {
                    cleared = true;
                } else {
                    fi = 0;
                    tick = 0;
                    loops = 0;
                }
            }

            return { frameIndex: fi, animTick: tick, loopCount: loops, frameAdvanced, cleared };
        }

        const frameStep = (seqType.frameStep ?? -1) | 0;
        const maxLoops = (seqType.maxLoops ?? 0) | 0;
        tick = (tick + 1) | 0;
        const safeFrameIndex = lengths ? Math.min(fi, Math.max(0, lengths.length - 1)) : fi;
        const currLen = ((lengths ? lengths[safeFrameIndex] : 0) ?? 0) | 0;
        if (tick > currLen) {
            tick = 1;
            fi++;
            frameAdvanced = true;
        }

        if (fi >= safeFrameCount) {
            if (frameStep > 0) {
                fi -= frameStep;
                if (clearOnFinish) {
                    loops++;
                    cleared = loops >= maxLoops || fi < 0 || fi >= safeFrameCount;
                } else {
                    const looping = !!seqType.looping;
                    if (looping) loops++;
                    if (fi < 0 || fi >= safeFrameCount || (looping && loops >= maxLoops)) {
                        fi = 0;
                        tick = 0;
                        loops = 0;
                    }
                }
            } else if (clearOnFinish) {
                cleared = true;
            } else {
                fi = 0;
                tick = 0;
                loops = 0;
            }
        }

        return { frameIndex: fi, animTick: tick, loopCount: loops, frameAdvanced, cleared };
    
}

export function ensureNpcDynamicSequenceMeta(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        npcIndex: number,
        npcTypeId: number,
        seqId: number,
        forceDynamic: boolean = false,
    ): DynamicNpcSequenceMeta | undefined {

        const extraAnims = map.npcExtraAnims?.[npcIndex];
        if (!forceDynamic && extraAnims?.[seqId]) {
            return undefined;
        }

        if (!host.dynamicNpcAnimLoader?.isReady()) {
            return undefined;
        }

        const meta = host.dynamicNpcAnimLoader.getSequenceMeta(npcTypeId, seqId);
        if (!meta) {
            return undefined;
        }

        if (!map.npcExtraFrameLengths) {
            map.npcExtraFrameLengths = [];
        }
        const extraLengths = map.npcExtraFrameLengths[npcIndex] ?? {};
        extraLengths[seqId] = meta.frameLengths;
        map.npcExtraFrameLengths[npcIndex] = extraLengths;

        return meta;
    
}

export function uploadDynamicNpcGeometry(host: WebGLOsrsRendererHost, 
        geometry: DynamicNpcFrameGeometry,
        transparent: boolean,
    ): number {

        if (!host.npcProgram) return 0;

        const vertices = transparent ? geometry.alphaVertices : geometry.opaqueVertices;
        const indices = transparent ? geometry.alphaIndices : geometry.opaqueIndices;
        if (!vertices || !indices || vertices.length === 0 || indices.length === 0) return 0;

        const uploadKey = `${geometry.key}:${transparent ? "alpha" : "opaque"}`;

        const needsRecreate =
            !host.dynamicNpcInterleavedBuffer ||
            vertices.length > (host.dynamicNpcBufferVertexSize ?? 0) ||
            indices.length > (host.dynamicNpcBufferIndexSize ?? 0);

        if (needsRecreate) {
            if (host.dynamicNpcInterleavedBuffer) {
                host.dynamicNpcInterleavedBuffer.delete();
                host.dynamicNpcIndexBuffer?.delete();
                host.dynamicNpcVertexArray?.delete();
                host.dynamicNpcDrawCall = undefined;
            }

            host.dynamicNpcInterleavedBuffer = host.app.createInterleavedBuffer(12, vertices);
            host.dynamicNpcIndexBuffer = host.app.createIndexBuffer(PicoGL.UNSIGNED_INT, indices);
            host.dynamicNpcBufferVertexSize = vertices.length;
            host.dynamicNpcBufferIndexSize = indices.length;
            host.dynamicNpcUploadedGeometryKey = undefined;

            host.dynamicNpcVertexArray = host.app
                .createVertexArray()
                .vertexAttributeBuffer(0, host.dynamicNpcInterleavedBuffer, {
                    type: PicoGL.UNSIGNED_INT,
                    size: 3,
                    stride: 12,
                    integer: true as any,
                })
                .indexBuffer(host.dynamicNpcIndexBuffer);

            if (host.dynamicNpcVertexArray && host.sceneUniformBuffer) {
                host.dynamicNpcDrawCall = host.configureDrawCall(
                    host.app
                        .createDrawCall(host.npcProgram, host.dynamicNpcVertexArray)
                        .uniformBlock("SceneUniforms", host.sceneUniformBuffer)
                        .drawRanges(host.dynamicNpcSingleDrawRange),
                );
                if (host.textureArray) {
                    host.dynamicNpcDrawCall.texture("u_textures", host.textureArray);
                }
                if (host.textureMaterials) {
                    host.dynamicNpcDrawCall.texture("u_textureMaterials", host.textureMaterials);
                }
                if (host.waterTextures) {
                    host.dynamicNpcDrawCall.texture("u_waterTextures", host.waterTextures);
                }
            }
        }

        if (host.dynamicNpcUploadedGeometryKey !== uploadKey) {
            (host.dynamicNpcInterleavedBuffer as any).data(vertices);
            (host.dynamicNpcIndexBuffer as any).data(indices);
            host.dynamicNpcUploadedGeometryKey = uploadKey;
        }

        return indices.length;
    
}

export function resolveUnbatchedNpcGeometry(
        host: WebGLOsrsRendererHost,
        ecsId: number,
    ): DynamicNpcFrameGeometry | undefined {

        const loader = host.dynamicNpcAnimLoader;
        if (!loader?.isReady()) return undefined;

        const ecs = host.osrsClient.npcEcs;
        const npcTypeId = ecs.getNpcTypeId(ecsId) | 0;
        const actionSeqId = ecs.getSeqId(ecsId) | 0;
        const actionActive = actionSeqId >= 0 && (ecs.getSeqDelay?.(ecsId) | 0) === 0;
        const { movementSeqId, idleSeqId } = host.resolveNpcMovementSequenceIds(ecs, ecsId);
        const renderSeqId = actionActive ? actionSeqId : movementSeqId | 0;
        const overlaySeqId =
            actionActive &&
            host.shouldLayerNpcMovementSequence(
                actionSeqId,
                movementSeqId | 0,
                idleSeqId | 0,
            )
                ? movementSeqId | 0
                : -1;
        const frameId = actionActive
            ? ecs.getFrameIndex(ecsId) | 0
            : ecs.getMovementFrameIndex?.(ecsId) | 0;
        const overlayFrameId =
            overlaySeqId >= 0 ? ecs.getMovementFrameIndex?.(ecsId) | 0 : -1;

        let geometry: DynamicNpcFrameGeometry | undefined;
        try {
            if (renderSeqId >= 0) {
                geometry = loader.getFrameGeometry(
                    npcTypeId,
                    renderSeqId,
                    frameId,
                    overlaySeqId,
                    overlayFrameId,
                );
            }
            const hasGraphics =
                !!geometry &&
                ((geometry.opaqueVertices.length > 0 && geometry.opaqueIndices.length > 0) ||
                    (geometry.alphaVertices.length > 0 && geometry.alphaIndices.length > 0));
            if (!hasGraphics) geometry = loader.getBaseGeometry(npcTypeId);
        } catch {
            try {
                geometry = loader.getBaseGeometry(npcTypeId);
            } catch {
                geometry = undefined;
            }
        }
        return geometry;

}
