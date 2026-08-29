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

export function renderTransparentNpcPass(host: WebGLOsrsRendererHost, 
        npcDataTextureIndex: number,
        npcDataTexture: Texture | undefined,
    ): void {

        if (!npcDataTexture || !host.loadNpcs) {
            return;
        }
        const cullTile = host.getRenderCullTile();
        const renderDistanceTiles = Math.max(0, host.getFrameRenderDistanceTiles() | 0);
        const renderDistancePadTiles = 0;

        // Collect dynamic NPCs for second pass
        const dynamicNpcs: Array<{
            map: WebGLMapSquare;
            npcIndex: number;
            ecsId: number;
            npcTypeId: number;
            seqId: number;
            overlaySeqId: number;
            overlayFrameId: number;
            dataOffset: number;
            frameId: number;
            geometry: DynamicNpcFrameGeometry;
        }> = [];

        for (let i = host.mapManager.visibleMapCount - 1; i >= 0; i--) {
            const map = host.mapManager.visibleMaps[i];
            if (
                !host.isMapWithinRenderDistance(
                    map,
                    cullTile.x,
                    cullTile.y,
                    renderDistanceTiles,
                    renderDistancePadTiles,
                )
            ) {
                continue;
            }
            const npcCount = map.npcEntityIds?.length ?? 0;
            if (npcCount === 0) continue;

            const dataOffset = map.npcDataTextureOffsets[npcDataTextureIndex];
            if (dataOffset === -1) {
                continue;
            }

            const npcBatch = map.drawCallNpc;
            if (!npcBatch) continue;
            const { drawCall, drawRanges } = npcBatch;

            drawCall
                .uniform("u_npcDataOffset", dataOffset)
                .uniform("u_modelYOffset", host.getNpcModelYOffset())
                .uniform("u_worldEntityTransform", WebGLMapSquare.IDENTITY_MAT4)
                .texture("u_npcDataTexture", npcDataTexture);

            {
                const ecs = host.osrsClient.npcEcs;
                const ids: number[] = map.npcEntityIds as any;
                const weNpcIndices: number[] = [];

                for (let j = 0; j < npcCount; j++) {
                    const id = ids[j] | 0;
                    if (!host.shouldRenderNpcFromMap(map, id)) {
                        (drawCall as any).offsets[j] = 0;
                        (drawCall as any).numElements[j] = 0;
                        drawRanges[j] = NULL_DRAW_RANGE;
                        continue;
                    }

                    // Draw world-entity NPCs separately so their transparent faces
                    // receive the same deck height and transform as their opaque faces.
                    const npcWorldViewId = ecs.getWorldViewId(id);
                    const isWorldEntityNpc =
                        npcWorldViewId >= 0 &&
                        !!host.osrsClient.worldViewManager.getWorldView(npcWorldViewId);
                    if (isWorldEntityNpc) {
                        weNpcIndices.push(j);
                        (drawCall as any).offsets[j] = 0;
                        (drawCall as any).numElements[j] = 0;
                        drawRanges[j] = NULL_DRAW_RANGE;
                        continue;
                    }

                    const seqId = ecs.getSeqId(id) | 0;
                    const seqDelay = ecs.getSeqDelay?.(id) | 0;
                    const npcTypeId = (ecs.getNpcTypeId?.(id) ?? -1) | 0;
                    const { movementSeqId, idleSeqId, walkSeqId } =
                        host.resolveNpcMovementSequenceIds(ecs, id);
                    const actionActive = seqId >= 0 && seqDelay === 0;
                    const renderSeqId = actionActive ? seqId | 0 : movementSeqId | 0;
                    const overlaySeqId =
                        actionActive &&
                        host.shouldLayerNpcMovementSequence(
                            seqId | 0,
                            movementSeqId | 0,
                            idleSeqId | 0,
                        )
                            ? movementSeqId | 0
                            : -1;
                    const frameId = actionActive
                        ? ecs.getFrameIndex(id) | 0
                        : ecs.getMovementFrameIndex?.(id) | 0;
                    const overlayFrameId =
                        overlaySeqId >= 0 ? ecs.getMovementFrameIndex?.(id) | 0 : -1;
                    const hasStaticMovementAnim =
                        (movementSeqId | 0) === (idleSeqId | 0) ||
                        (movementSeqId | 0) === (walkSeqId | 0) ||
                        !!map.npcExtraAnims?.[j]?.[movementSeqId | 0];
                    const forceDynamic =
                        overlaySeqId >= 0 || (!actionActive && !hasStaticMovementAnim);
                    const dynamicMeta =
                        renderSeqId >= 0 && npcTypeId >= 0
                            ? host.ensureNpcDynamicSequenceMeta(
                                map,
                                j,
                                npcTypeId,
                                renderSeqId,
                                forceDynamic,
                            )
                            : undefined;

                    if (dynamicMeta) {
                        const geometry = host.dynamicNpcAnimLoader?.getFrameGeometry(
                            npcTypeId,
                            renderSeqId | 0,
                            frameId,
                            overlaySeqId | 0,
                            overlayFrameId | 0,
                        );
                        const hasDynamicGraphics =
                            !!geometry &&
                            ((geometry.opaqueVertices.length > 0 &&
                                geometry.opaqueIndices.length > 0) ||
                                (geometry.alphaVertices.length > 0 &&
                                    geometry.alphaIndices.length > 0));
                        if (geometry && hasDynamicGraphics) {
                            (drawCall as any).offsets[j] = 0;
                            (drawCall as any).numElements[j] = 0;
                            drawRanges[j] = NULL_DRAW_RANGE;
                            dynamicNpcs.push({
                                map,
                                npcIndex: j,
                                ecsId: id,
                                npcTypeId,
                                seqId: renderSeqId | 0,
                                overlaySeqId: overlaySeqId | 0,
                                overlayFrameId: overlayFrameId | 0,
                                dataOffset,
                                frameId,
                                geometry,
                            });
                            continue;
                        }
                    }

                    const anim = host._resolveNpcAnimation(map, j, ecs, id);
                    let frame: DrawRange = NULL_DRAW_RANGE;
                    if (anim.framesAlpha) {
                        frame =
                            anim.framesAlpha[
                                Math.max(0, Math.min((anim.framesAlpha.length - 1) | 0, frameId))
                                ];
                    }
                    (drawCall as any).offsets[j] = frame[0];
                    (drawCall as any).numElements[j] = frame[1];
                    drawRanges[j] = frame;
                }

                host.draw(drawCall, drawRanges);

                if (weNpcIndices.length > 0) {
                    const firstWeId = ids[weNpcIndices[0]] | 0;
                    const weEntityIdx = ecs.getWorldViewId(firstWeId);
                    const weTransform =
                        host.worldEntityAnimator?.getTransform(weEntityIdx) ??
                        WebGLMapSquare.IDENTITY_MAT4;
                    const weDeckH = host.getWorldEntityDeckHeight(0, 0);

                    drawCall
                        .uniform("u_modelYOffset", host.getNpcModelYOffset(weDeckH))
                        .uniform("u_worldEntityTransform", weTransform);

                    for (let j = 0; j < npcCount; j++) {
                        (drawCall as any).offsets[j] = 0;
                        (drawCall as any).numElements[j] = 0;
                        drawRanges[j] = NULL_DRAW_RANGE;
                    }
                    for (const wj of weNpcIndices) {
                        const wid = ids[wj] | 0;
                        const anim = host._resolveNpcAnimation(map, wj, ecs, wid);
                        const wFrameId =
                            ecs.getSeqId(wid) >= 0 && ecs.getSeqDelay?.(wid) === 0
                                ? ecs.getFrameIndex(wid) | 0
                                : ecs.getMovementFrameIndex?.(wid) | 0;
                        let frame: DrawRange = NULL_DRAW_RANGE;
                        if (anim.framesAlpha) {
                            frame =
                                anim.framesAlpha[
                                    Math.max(
                                        0,
                                        Math.min((anim.framesAlpha.length - 1) | 0, wFrameId),
                                    )
                                    ];
                        }
                        (drawCall as any).offsets[wj] = frame[0];
                        (drawCall as any).numElements[wj] = frame[1];
                        drawRanges[wj] = frame;
                    }
                    host.draw(drawCall, drawRanges);
                }
            }

            try {
                if (host.gfxRenderer) {
                    // Reuse object to avoid per-call allocation
                    host.gfxRenderPassOffsets.player = undefined;
                    host.gfxRenderPassOffsets.npc = dataOffset;
                    host.gfxRenderPassOffsets.world =
                        map.worldGfxDataTextureOffsets[npcDataTextureIndex];
                    host.gfxRenderer.renderMapPass(
                        map,
                        npcDataTexture,
                        "alpha",
                        host.gfxRenderPassOffsets,
                    );
                }
            } catch {}
        }

        for (const entry of host.unbatchedNpcRenderEntries) {
            if (
                !host.isMapWithinRenderDistance(
                    entry.map,
                    cullTile.x,
                    cullTile.y,
                    renderDistanceTiles,
                    renderDistancePadTiles,
                )
            ) {
                continue;
            }
            const geometry = host.resolveUnbatchedNpcGeometry(entry.ecsId);
            if (!geometry) continue;
            dynamicNpcs.push({
                map: entry.map,
                npcIndex: 0,
                ecsId: entry.ecsId,
                npcTypeId: geometry.npcTypeId,
                seqId: geometry.seqId,
                overlaySeqId: geometry.overlaySeqId ?? -1,
                overlayFrameId: geometry.overlayFrameId ?? -1,
                dataOffset: entry.dataOffset,
                frameId: geometry.frameId,
                geometry,
            });
        }

        if (dynamicNpcs.length > 0 && npcDataTexture) {
            for (const dyn of dynamicNpcs) {
                const indexCount = host.uploadDynamicNpcGeometry(dyn.geometry, true);
                if (indexCount <= 0 || !host.dynamicNpcDrawCall) {
                    continue;
                }

                const dynDrawCall = host.dynamicNpcDrawCall;
                dynDrawCall.texture("u_npcDataTexture", npcDataTexture);
                const npcDataOffset = dyn.dataOffset + dyn.npcIndex;

                dynDrawCall.uniform("u_npcDataOffset", npcDataOffset);
                dynDrawCall.uniform("u_mapPos", [dyn.map.renderPosX, dyn.map.renderPosY]);
                dynDrawCall.uniform("u_timeLoaded", dyn.map.timeLoaded);
                {
                    const dynWvId = host.osrsClient.npcEcs.getWorldViewId(dyn.ecsId);
                    if (
                        dynWvId >= 0 &&
                        host.osrsClient.worldViewManager.getWorldView(dynWvId)
                    ) {
                        const dynDeckH = host.getWorldEntityDeckHeight(0, 0);
                        dynDrawCall.uniform("u_modelYOffset", host.getNpcModelYOffset(dynDeckH));
                        dynDrawCall.uniform(
                            "u_worldEntityTransform",
                            host.worldEntityAnimator?.getTransform(dynWvId) ??
                            WebGLMapSquare.IDENTITY_MAT4,
                        );
                    } else {
                        dynDrawCall.uniform("u_modelYOffset", host.getNpcModelYOffset());
                        dynDrawCall.uniform("u_worldEntityTransform", WebGLMapSquare.IDENTITY_MAT4);
                    }
                }

                // Set height map texture from the map
                const heightMapTex = (dyn.map as any).heightMapTexture;
                if (heightMapTex) {
                    dynDrawCall.texture("u_heightMap", heightMapTex);
                    dynDrawCall.uniform("u_sceneBorderSize", (dyn.map as any).borderSize ?? 6);
                }
                const waterMaskTex = (dyn.map as any).waterMaskTexture;
                if (waterMaskTex) {
                    dynDrawCall.texture("u_waterMask", waterMaskTex);
                }

                host.dynamicNpcSingleDrawRange[0] = 0;
                host.dynamicNpcSingleDrawRange[1] = indexCount | 0;
                host.dynamicNpcSingleDrawRange[2] = 1;
                (dynDrawCall as any).offsets[0] = 0;
                (dynDrawCall as any).numElements[0] = indexCount | 0;
                host.draw(dynDrawCall, host.dynamicNpcSingleDrawRanges);
            }
        }
    
}
