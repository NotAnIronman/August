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

export function buildModelTrianglePoints(host: WebGLOsrsRendererHost, 
        model: Model,
        mapVertex: (index: number) => { x: number; y: number; z: number },
    ): ReadonlyArray<readonly [number, number, number]> | undefined {

        if (!model.indices1 || !model.indices2 || !model.indices3) {
            return undefined;
        }
        const vertexCount = model.verticesCount | 0;
        if (vertexCount <= 0) return undefined;
        const faceCount = Math.min(
            model.faceCount | 0,
            model.indices1.length | 0,
            model.indices2.length | 0,
            model.indices3.length | 0,
        );
        if (faceCount <= 0) return undefined;

        const cachedX = new Float32Array(vertexCount);
        const cachedY = new Float32Array(vertexCount);
        const cachedZ = new Float32Array(vertexCount);
        const cachedState = new Uint8Array(vertexCount); // 0 unknown, 1 valid, 2 invalid
        const getWorldVertex = (index: number): { x: number; y: number; z: number } | undefined => {
            const state = cachedState[index] | 0;
            if (state === 1) {
                return {
                    x: cachedX[index],
                    y: cachedY[index],
                    z: cachedZ[index],
                };
            }
            if (state === 2) {
                return undefined;
            }
            const v = mapVertex(index);
            if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
                cachedState[index] = 2;
                return undefined;
            }
            cachedX[index] = v.x;
            cachedY[index] = v.y;
            cachedZ[index] = v.z;
            cachedState[index] = 1;
            return v;
        };

        const out: Array<readonly [number, number, number]> = [];
        for (let i = 0; i < faceCount; i++) {
            if (
                (model.faceColors3 && model.faceColors3[i] === -2) ||
                (model.faceAlphas && (model.faceAlphas[i] & 0xff) >= 254)
            ) {
                continue;
            }
            const a = model.indices1[i] | 0;
            const b = model.indices2[i] | 0;
            const c = model.indices3[i] | 0;
            if (
                a < 0 ||
                b < 0 ||
                c < 0 ||
                a >= vertexCount ||
                b >= vertexCount ||
                c >= vertexCount
            ) {
                continue;
            }

            const va = getWorldVertex(a);
            const vb = getWorldVertex(b);
            const vc = getWorldVertex(c);
            if (!va || !vb || !vc) continue;

            const abx = vb.x - va.x;
            const aby = vb.y - va.y;
            const abz = vb.z - va.z;
            const acx = vc.x - va.x;
            const acy = vc.y - va.y;
            const acz = vc.z - va.z;
            const nx = aby * acz - abz * acy;
            const ny = abz * acx - abx * acz;
            const nz = abx * acy - aby * acx;
            if (nx * nx + ny * ny + nz * nz <= 1e-10) continue;

            out.push([va.x, va.y, va.z], [vb.x, vb.y, vb.z], [vc.x, vc.y, vc.z]);
        }

        return out.length >= 3 ? out : undefined;
    
}

export function clearInteractHighlightActiveTarget(host: WebGLOsrsRendererHost, ): void {

        host.interactHighlightActiveTarget = undefined;
        host.interactHighlightActiveFromInteraction = false;
        host.interactHighlightClickTick = -1;
    
}

export function clearInteractHighlightHoverTarget(host: WebGLOsrsRendererHost, ): void {

        host.interactHighlightHoverTarget = undefined;
    
}

export function resolveLocHighlightTargetFromEntry(host: WebGLOsrsRendererHost, 
        entry: Pick<SimpleMenuEntry, "targetType" | "targetId" | "mapX" | "mapY"> | undefined,
        fallbackTile?: { tileX: number; tileY: number; plane?: number },
    ): LocHighlightTarget | undefined {

        if (!entry) return undefined;
        if (entry.targetType !== MenuTargetType.LOC) return undefined;
        if (typeof entry.targetId !== "number") return undefined;

        const baseX = ClientState.baseX | 0;
        const baseY = ClientState.baseY | 0;
        const fallback =
            fallbackTile ??
            (host.osrsClient.menuTile
                ? {
                    tileX: host.osrsClient.menuTile.tileX | 0,
                    tileY: host.osrsClient.menuTile.tileY | 0,
                    plane:
                        typeof host.osrsClient.menuTile.plane === "number"
                            ? host.osrsClient.menuTile.plane | 0
                            : undefined,
                }
                : undefined);
        let approx: { tileX: number; tileY: number; plane?: number } | undefined;
        if (typeof entry.mapX === "number" && typeof entry.mapY === "number") {
            approx = {
                tileX: (baseX + (entry.mapX | 0)) | 0,
                tileY: (baseY + (entry.mapY | 0)) | 0,
                plane:
                    typeof fallback?.plane === "number"
                        ? fallback.plane | 0
                        : host.getPlayerBasePlane() | 0,
            };
        } else if (fallback) {
            approx = {
                tileX: fallback.tileX | 0,
                tileY: fallback.tileY | 0,
                plane:
                    typeof fallback.plane === "number"
                        ? fallback.plane | 0
                        : host.getPlayerBasePlane() | 0,
            };
        }

        if (!approx) return undefined;

        const locId = entry.targetId | 0;
        const resolved = host.resolveLocInteractionTile(locId, approx);
        const plane =
            typeof resolved.plane === "number" ? resolved.plane | 0 : host.getPlayerBasePlane();
        const resolvedTypeRot =
            typeof resolved.typeRot === "number"
                ? (resolved.typeRot | 0) & 0xff
                : host.resolveLocTypeRotAtTile(
                    locId,
                    resolved.tileX | 0,
                    resolved.tileY | 0,
                    plane | 0,
                );
        return {
            kind: "loc",
            locId,
            tileX: resolved.tileX | 0,
            tileY: resolved.tileY | 0,
            plane: plane | 0,
            locModelType:
                typeof resolvedTypeRot === "number" ? (resolvedTypeRot & 0x3f) | 0 : undefined,
            locRotation:
                typeof resolvedTypeRot === "number"
                    ? ((resolvedTypeRot >> 6) & 0x3) | 0
                    : undefined,
        };
    
}

export function getNpcWorldTile(host: WebGLOsrsRendererHost, ecsId: number): { x: number; y: number } {

        const npcEcs = host.osrsClient.npcEcs;
        const mapId = npcEcs.getMapId(ecsId) | 0;
        const mapX = (mapId >> 8) & 0xff;
        const mapY = mapId & 0xff;
        const worldSubX = (mapX << 13) + (npcEcs.getX(ecsId) | 0);
        const worldSubY = (mapY << 13) + (npcEcs.getY(ecsId) | 0);
        return {
            x: (worldSubX >> 7) | 0,
            y: (worldSubY >> 7) | 0,
        };
    
}

export function resolveNpcHighlightTargetFromEntry(host: WebGLOsrsRendererHost, 
        entry: Pick<SimpleMenuEntry, "targetType" | "targetId" | "mapX" | "mapY"> | undefined,
        fallbackTile?: { tileX: number; tileY: number; plane?: number },
    ): NpcHighlightTarget | undefined {

        if (!entry) return undefined;
        if (entry.targetType !== MenuTargetType.NPC) return undefined;
        const desiredNpcTypeId =
            typeof entry.targetId === "number" ? entry.targetId | 0 : undefined;
        const npcEcs = host.osrsClient.npcEcs;

        const baseX = ClientState.baseX | 0;
        const baseY = ClientState.baseY | 0;
        const fallback = fallbackTile ?? host.osrsClient.menuTile;
        const targetTile =
            typeof entry.mapX === "number" && typeof entry.mapY === "number"
                ? { x: (baseX + (entry.mapX | 0)) | 0, y: (baseY + (entry.mapY | 0)) | 0 }
                : fallback
                    ? { x: fallback.tileX | 0, y: fallback.tileY | 0 }
                    : undefined;

        let bestEcsId: number | undefined;
        let bestScore = Number.POSITIVE_INFINITY;
        const evaluateCandidate = (ecsId: number, enforceTypeMatch: boolean): void => {
            const id = ecsId | 0;
            if (!npcEcs.isActive(id) || !npcEcs.isLinked(id)) return;
            const typeId = npcEcs.getNpcTypeId(id) | 0;
            if (
                enforceTypeMatch &&
                desiredNpcTypeId !== undefined &&
                typeId !== (desiredNpcTypeId | 0)
            ) {
                return;
            }
            let distPenalty = 0;
            if (targetTile) {
                const worldTile = host.getNpcWorldTile(id);
                distPenalty =
                    Math.max(
                        Math.abs((worldTile.x | 0) - (targetTile.x | 0)),
                        Math.abs((worldTile.y | 0) - (targetTile.y | 0)),
                    ) * 10;
            }
            const score = distPenalty;
            if (score < bestScore) {
                bestScore = score;
                bestEcsId = id;
            }
        };

        if (targetTile) {
            const tileCandidates = npcEcs.queryByTile(targetTile.x | 0, targetTile.y | 0);
            for (const id of tileCandidates) {
                evaluateCandidate(id | 0, true);
            }
            if (bestEcsId === undefined && desiredNpcTypeId !== undefined) {
                for (const id of tileCandidates) {
                    evaluateCandidate(id | 0, false);
                }
            }
        }
        if (bestEcsId === undefined) {
            for (const id of npcEcs.getAllActiveIds()) {
                evaluateCandidate(id | 0, true);
            }
            if (bestEcsId === undefined && desiredNpcTypeId !== undefined) {
                for (const id of npcEcs.getAllActiveIds()) {
                    evaluateCandidate(id | 0, false);
                }
            }
        }
        if (bestEcsId === undefined) return undefined;

        const serverId = npcEcs.getServerId(bestEcsId) | 0;
        if (serverId <= 0) return undefined;
        return {
            kind: "npc",
            ecsId: bestEcsId | 0,
            serverId,
            npcTypeId: npcEcs.getNpcTypeId(bestEcsId) | 0,
            plane: npcEcs.getLevel(bestEcsId) | 0,
        };
    
}

export function resolveNpcHighlightTargetFromServerId(host: WebGLOsrsRendererHost, 
        serverId: number,
    ): NpcHighlightTarget | undefined {

        const sid = serverId | 0;
        if (sid <= 0) return undefined;

        const npcEcs = host.osrsClient.npcEcs;
        const ecsId = npcEcs.getEcsIdForServer(sid);
        if (ecsId === undefined) return undefined;
        if (!npcEcs.isActive(ecsId) || !npcEcs.isLinked(ecsId)) return undefined;
        if ((npcEcs.getServerId(ecsId) | 0) !== sid) return undefined;

        return {
            kind: "npc",
            ecsId: ecsId | 0,
            serverId: sid,
            npcTypeId: npcEcs.getNpcTypeId(ecsId) | 0,
            plane: npcEcs.getLevel(ecsId) | 0,
        };
    
}
