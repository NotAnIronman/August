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

export function sampleHeightAtExactPlane(host: WebGLOsrsRendererHost, worldX: number, worldZ: number, plane: number): number {

        const map = host.getPreferredMapForWorldTile(Math.floor(worldX), Math.floor(worldZ));
        if (!map || !map.heightMapData) {
            return 0;
        }

        const localPxX = Math.floor((worldX - map.getRenderBaseWorldX()) * 128);
        const localPxZ = Math.floor((worldZ - map.getRenderBaseWorldY()) * 128);
        const mapTileSpan = map.getLocalTileSpan();

        let tileX = localPxX >> 7;
        let tileZ = localPxZ >> 7;
        if (tileX < 0 || tileZ < 0 || tileX >= mapTileSpan || tileZ >= mapTileSpan) {
            return 0;
        }
        tileX = Math.max(0, Math.min(mapTileSpan - 1, tileX));
        tileZ = Math.max(0, Math.min(mapTileSpan - 1, tileZ));

        const offX = localPxX & 0x7f;
        const offZ = localPxZ & 0x7f;

        const size = map.heightMapSize as number;
        // Use the plane directly without any promotion - this is the key difference
        const samplePlane = Math.max(0, Math.min(3, plane | 0));
        const base = samplePlane * size * size;

        const ix = tileX + map.borderSize;
        const iz = tileZ + map.borderSize;
        const ix1 = Math.min(ix + 1, size - 1);
        const iz1 = Math.min(iz + 1, size - 1);

        const data = map.heightMapData as Int16Array;
        // Match GPU height sampling (see `height-map.glsl`): texel * 8 gives world-unit magnitude.
        // Scale into world units before interpolation to preserve OSRS integer truncation behavior.
        const h00 = ((data[base + iz * size + ix] || 0) * Scene.UNITS_TILE_HEIGHT_BASIS) | 0;
        const h10 = ((data[base + iz * size + ix1] || 0) * Scene.UNITS_TILE_HEIGHT_BASIS) | 0;
        const h01 = ((data[base + iz1 * size + ix] || 0) * Scene.UNITS_TILE_HEIGHT_BASIS) | 0;
        const h11 = ((data[base + iz1 * size + ix1] || 0) * Scene.UNITS_TILE_HEIGHT_BASIS) | 0;

        const delta0 = (h00 * (128 - offX) + h10 * offX) >> 7;
        const delta1 = (h01 * (128 - offX) + h11 * offX) >> 7;
        const hWorld = (delta0 * (128 - offZ) + delta1 * offZ) >> 7;
        return -(hWorld / 128.0);
    
}

export function intersectTerrainPickTriangle(host: WebGLOsrsRendererHost, 
        ray: Ray,
        vertices: Float32Array,
        vertexOffset: number,
        baseX: number,
        baseZ: number,
    ): number | undefined {

        const ax = baseX + vertices[vertexOffset];
        const ay = vertices[vertexOffset + 1];
        const az = baseZ + vertices[vertexOffset + 2];
        const bx = baseX + vertices[vertexOffset + 3];
        const by = vertices[vertexOffset + 4];
        const bz = baseZ + vertices[vertexOffset + 5];
        const cx = baseX + vertices[vertexOffset + 6];
        const cy = vertices[vertexOffset + 7];
        const cz = baseZ + vertices[vertexOffset + 8];

        const edge1x = bx - ax;
        const edge1y = by - ay;
        const edge1z = bz - az;
        const edge2x = cx - ax;
        const edge2y = cy - ay;
        const edge2z = cz - az;

        const dirx = ray.direction[0];
        const diry = ray.direction[1];
        const dirz = ray.direction[2];
        const px = diry * edge2z - dirz * edge2y;
        const py = dirz * edge2x - dirx * edge2z;
        const pz = dirx * edge2y - diry * edge2x;
        const det = edge1x * px + edge1y * py + edge1z * pz;
        if (det > -1e-6 && det < 1e-6) return undefined;

        const invDet = 1 / det;
        const tx = ray.origin[0] - ax;
        const ty = ray.origin[1] - ay;
        const tz = ray.origin[2] - az;
        const u = (tx * px + ty * py + tz * pz) * invDet;
        if (u < 0 || u > 1) return undefined;

        const qx = ty * edge1z - tz * edge1y;
        const qy = tz * edge1x - tx * edge1z;
        const qz = tx * edge1y - ty * edge1x;
        const v = (dirx * qx + diry * qy + dirz * qz) * invDet;
        if (v < 0 || u + v > 1) return undefined;

        const t = (edge2x * qx + edge2y * qy + edge2z * qz) * invDet;
        return t > 1e-6 ? t : undefined;
    
}

export function computeTerrainTileAt(host: WebGLOsrsRendererHost, 
        mouseX: number,
        mouseY: number,
    ): { tileX: number; tileY: number; plane: number } | undefined {

        const ray = host.screenToRay(mouseX, mouseY);
        if (!ray) return undefined;

        let bestT = Number.POSITIVE_INFINITY;
        let bestTileX = -1;
        let bestTileY = -1;
        let bestPlane = 0;
        let bestFromOverride = false;

        // A tile is a valid pick target only while it is drawn (draw plane within the
        // roof plane limit) and not above the player's plane; among the candidates the
        // nearest hit along the ray wins.
        const selectLimit = Math.min(host.getPlayerRawPlane() | 0, host.getRoofPlaneLimit() | 0);

        const visibleCount = host.mapManager.visibleMapCount | 0;
        const visibleMaps = host.mapManager.visibleMaps;
        for (let i = 0; i < visibleCount; i++) {
            const map = visibleMaps[i] as WebGLMapSquare | undefined;
            if (!map) continue;

            const offsets = map.terrainPickTileOffsets;
            const vertices = map.terrainPickVertices;
            if (!offsets || !vertices || offsets.length <= 1 || vertices.length === 0) continue;

            const effectiveRay = host.getWorldEntityAdjustedTerrainRay(ray, map);
            const baseX = map.getRenderBaseWorldX();
            const baseZ = map.getRenderBaseWorldY();
            const mapTileSpan = map.getLocalTileSpan();
            if (offsets.length < mapTileSpan * mapTileSpan + 1) continue;
            const planeOverride = map.interactionPlane >= 0 ? map.interactionPlane | 0 : -1;

            const hitBox = rayIntersectsBox(
                effectiveRay,
                [baseX, -1000, baseZ],
                [baseX + mapTileSpan, 1000, baseZ + mapTileSpan],
            );
            if (!hitBox) continue;

            const tEnter = Math.max(hitBox.tMin, 0);
            const tExit = Math.min(hitBox.tMax, bestT);
            if (tEnter > tExit || tExit <= 0) continue;

            const entry = host.tmpTerrainEntryPoint;
            effectiveRay.at(Math.min(tEnter + 1e-6, tExit), entry);

            let localX = Math.max(0, Math.min(mapTileSpan - 1, Math.floor(entry[0] - baseX)));
            let localY = Math.max(0, Math.min(mapTileSpan - 1, Math.floor(entry[2] - baseZ)));

            const dirX = effectiveRay.direction[0];
            const dirZ = effectiveRay.direction[2];
            const stepX = dirX > 1e-8 ? 1 : dirX < -1e-8 ? -1 : 0;
            const stepY = dirZ > 1e-8 ? 1 : dirZ < -1e-8 ? -1 : 0;
            const tDeltaX = stepX !== 0 ? Math.abs(1 / dirX) : Number.POSITIVE_INFINITY;
            const tDeltaY = stepY !== 0 ? Math.abs(1 / dirZ) : Number.POSITIVE_INFINITY;
            const nextBoundaryX = baseX + (stepX > 0 ? localX + 1 : localX);
            const nextBoundaryY = baseZ + (stepY > 0 ? localY + 1 : localY);
            let tMaxX =
                stepX !== 0
                    ? (nextBoundaryX - effectiveRay.origin[0]) / dirX
                    : Number.POSITIVE_INFINITY;
            let tMaxY =
                stepY !== 0
                    ? (nextBoundaryY - effectiveRay.origin[2]) / dirZ
                    : Number.POSITIVE_INFINITY;
            if (tMaxX < tEnter) tMaxX = tEnter;
            if (tMaxY < tEnter) tMaxY = tEnter;

            const maxSteps = mapTileSpan * 2 + 4;
            for (let steps = 0; steps < maxSteps; steps++) {
                if (localX < 0 || localY < 0 || localX >= mapTileSpan || localY >= mapTileSpan) {
                    break;
                }

                const tileIndex = localY * mapTileSpan + localX;
                const triStart = offsets[tileIndex] | 0;
                const triEnd = offsets[tileIndex + 1] | 0;
                for (let tri = triStart; tri < triEnd; tri++) {
                    const packedPlanes = map.terrainPickPlanes[tri] | 0;
                    if (planeOverride < 0 && packedPlanes >> 2 > selectLimit) {
                        continue;
                    }
                    const t = host.intersectTerrainPickTriangle(
                        effectiveRay,
                        vertices,
                        tri * 9,
                        baseX,
                        baseZ,
                    );
                    if (t === undefined || t < tEnter - 1e-4 || t > tExit + 1e-4) {
                        continue;
                    }
                    if (t < bestT) {
                        bestT = t;
                        bestTileX = (map.getRenderBaseTileX() + localX) | 0;
                        bestTileY = (map.getRenderBaseTileY() + localY) | 0;
                        bestPlane = planeOverride >= 0 ? planeOverride : packedPlanes & 0x3;
                        bestFromOverride = planeOverride >= 0;
                    }
                }

                if (tMaxX === Number.POSITIVE_INFINITY && tMaxY === Number.POSITIVE_INFINITY) {
                    break;
                }
                const nextT = Math.min(tMaxX, tMaxY);
                if (nextT > tExit || nextT > bestT) {
                    break;
                }
                if (tMaxX < tMaxY) {
                    localX += stepX;
                    tMaxX += tDeltaX;
                } else if (tMaxY < tMaxX) {
                    localY += stepY;
                    tMaxY += tDeltaY;
                } else {
                    localX += stepX;
                    localY += stepY;
                    tMaxX += tDeltaX;
                    tMaxY += tDeltaY;
                }
            }
        }

        if (!Number.isFinite(bestT) || bestTileX < 0 || bestTileY < 0) {
            return undefined;
        }

        // Far clicks are pulled toward the player so the target lands at most
        // 70 tiles away; the pulled tile reports the height plane at the
        // player's plane instead of the picked triangle's plane.
        if (!bestFromOverride) {
            const playerTile = host.getPlayerTileXY();
            const overDistance =
                Math.floor(Math.hypot(playerTile.x - bestTileX, playerTile.y - bestTileY)) - 70;
            if (overDistance > 0) {
                bestTileX = Math.floor(
                    (bestTileX * 70 + overDistance * playerTile.x) / (overDistance + 70),
                );
                bestTileY = Math.floor(
                    (bestTileY * 70 + overDistance * playerTile.y) / (overDistance + 70),
                );
                bestPlane = host.getHeightSamplePlaneForTile(
                    bestTileX,
                    bestTileY,
                    host.getPlayerRawPlane() | 0,
                );
            }
        }

        return { tileX: bestTileX, tileY: bestTileY, plane: bestPlane };
    
}

export function computeTileAt(host: WebGLOsrsRendererHost, 
        mouseX: number,
        mouseY: number,
    ): { tileX: number; tileY: number; plane: number } | undefined {

        return host.computeTerrainTileAt(mouseX, mouseY);
    
}

export function worldToScreen(host: WebGLOsrsRendererHost, x: number, y: number, z: number): number[] | Float32Array | undefined {

        const camera = host.osrsClient.camera;
        const p = vec4.fromValues(x, y, z, 1);
        const out = vec4.create();
        vec4.transformMat4(out, p, camera.viewMatrix);
        vec4.transformMat4(out, out, camera.projectionMatrix);
        if (out[3] === 0) return undefined;
        const ndcX = out[0] / out[3];
        const ndcY = out[1] / out[3];
        const screenWidth = camera.screenWidth || host.app.width;
        const screenHeight = camera.screenHeight || host.app.height;
        const sx = (ndcX + 1) * 0.5 * screenWidth;
        const sy = (1 - (ndcY + 1) * 0.5) * screenHeight;
        // Return as array instead of vec2
        return [sx, sy];
    
}
