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

export function tickPass(host: WebGLOsrsRendererHost, 
        time: number,
        ticksElapsed: number,
        clientTicksElapsed: number,
        clientCycle: number,
    ): void {

        const seqFrameLoader = host.osrsClient.seqFrameLoader;

        host.actorRenderCount = 0;

        // Core client-cycle ticking is handled by OsrsClient's tick loop so it continues even when
        // rendering is throttled (e.g., alt-tab/background). This pass is render-focused only.

        // Reuse buffers instead of allocating new arrays each frame
        const visibleMaps = host.visibleMapsBuffer;
        visibleMaps.length = 0;

        host.gfxManager?.resetWorldBindings?.();
        // PERF: Use cached callback to avoid per-frame closure allocation
        // Throttle ambient sound collection to reduce tick cost
        host.ambientSoundFrameCounter++;
        const shouldCollectAmbient =
            host.ambientSoundFrameCounter >= RENDER_CONSTANTS.AMBIENT_SOUND_THROTTLE_FRAMES;
        if (shouldCollectAmbient) {
            host.ambientSoundFrameCounter = 0;
            // Reset only on collect frames; between collects the previous
            // instances stay live so volumes keep tracking the listener
            host.ambientSoundBufferIndex = 0;
        }
        for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
            const map = host.mapManager.visibleMaps[i];
            visibleMaps.push(map);

            for (const loc of map.locsAnimated) {
                // DynamicObject/loc animation timing is based on Client.cycle (20ms each).
                loc.update(seqFrameLoader, clientCycle | 0, host.seqSoundCallback);
            }

            // Collect ambient sounds only every N frames (throttled)
            if (shouldCollectAmbient) {
                host.collectAmbientSounds(map);
            }

            host._ecsUpdateNpcClient(map, clientTicksElapsed);
            host._ecsUpdatePlayerOccupancy(map);

            // ECS is authoritative; legacy sync removed

            // Fully clear per-map actor offset rings to avoid any stale indices leaking
            for (let r = 0; r < map.playerDataTextureOffsets.length; r++)
                map.playerDataTextureOffsets[r] = -1;
            for (let r = 0; r < map.npcDataTextureOffsets.length; r++)
                map.npcDataTextureOffsets[r] = -1;
            for (let r = 0; r < map.worldGfxDataTextureOffsets.length; r++)
                map.worldGfxDataTextureOffsets[r] = -1;

            host.addNpcRenderData(map);
            host.addPlayerRenderData(map);
            host.addProjectileRenderData(map);
            host.addWorldGfxRenderData(map);
        }

        // A server spawn reaches ECS before its asynchronous map batch rebuild.
        // Give those NPCs actor-data slots immediately so the dynamic fallback
        // pass can draw them during that gap.
        host.addUnbatchedNpcRenderData();

        host.worldEntityAnimator?.tick(clientCycle);
        host.osrsClient.worldViewManager.interpolateEntities(clientCycle, host.clientTickPhase);

        // Propagate listener position for positional audio and advance ambient loops.
        const soundSystem = host.osrsClient.soundEffectSystem;
        if (soundSystem) {
            try {
                const peListener = host.osrsClient.playerEcs;
                const idxListener = peListener.getIndexForServerId(
                    host.osrsClient.controlledPlayerServerId,
                );
                if (idxListener !== undefined) {
                    const px = peListener.getX(idxListener) | 0;
                    const py = peListener.getY(idxListener) | 0;
                    const level = peListener.getLevel(idxListener) | 0;
                    soundSystem.updateListenerPosition(px, py, level * 128);
                } else {
                    // z is the listener plane (level * 128), not a world height
                    soundSystem.updateListenerPosition(
                        host.osrsClient.camera.getPosX() * 128,
                        host.osrsClient.camera.getPosZ() * 128,
                        0,
                    );
                }
            } catch {
                soundSystem.updateListenerPosition(
                    host.osrsClient.camera.getPosX() * 128,
                    host.osrsClient.camera.getPosZ() * 128,
                    0,
                );
            }
            // Truncate the buffer only on collect frames; the update itself
            // runs every frame so volumes track the listener continuously
            if (shouldCollectAmbient) {
                host.ambientSoundBuffer.length = host.ambientSoundBufferIndex;
            }
            soundSystem.updateAmbientSounds(host.ambientSoundBuffer);
        }

        // animation stepping is handled by the client tick loop (`PlayerEcs` + `PlayerAnimController`).
    
}

export function _ecsUpdatePlayerOccupancy(host: WebGLOsrsRendererHost, map: WebGLMapSquare): void {

        const pe = host.osrsClient.playerEcs;
        const n = pe.size?.() ?? (pe as any).size?.() ?? 0;
        if (!n) return;
        for (let i = 0; i < n; i++) {
            const px = pe.getX(i) | 0;
            const py = pe.getY(i) | 0;
            const tileX = (px / 128) | 0;
            const tileY = (py / 128) | 0;
            const worldViewId = pe.getWorldViewId(i) | 0;
            let occMapX = map.mapX | 0;
            let occMapY = map.mapY | 0;
            const overlayView =
                worldViewId >= 0
                    ? host.osrsClient.worldViewManager.getWorldView(worldViewId)
                    : undefined;
            if (overlayView) {
                if ((overlayView.overlayMapId | 0) !== (map.id | 0)) continue;
            } else {
                if (worldViewId >= 0 && !host.instanceActive) continue;
                const mapX = getMapIndexFromTile(tileX);
                const mapY = getMapIndexFromTile(tileY);
                if (mapX !== map.mapX || mapY !== map.mapY) continue;
                occMapX = mapX | 0;
                occMapY = mapY | 0;
            }

            // Compute effective plane using bridge flag
            const local = host.getMapLocalTile(map, tileX, tileY);
            if (!local) continue;
            const localTileX = local.x;
            const localTileY = local.y;
            const plane = resolveCollisionSamplePlaneForLocal(
                map,
                pe.getLevel(i) | 0,
                localTileX,
                localTileY,
            );

            const oldPlane = pe.getOccPlane(i) | 0;
            const oldMapX = pe.getOccMapX?.(i) ?? 255;
            const oldMapY = pe.getOccMapY?.(i) ?? 255;
            const oldTileX = pe.getOccTileX(i) | 0;
            const oldTileY = pe.getOccTileY(i) | 0;

            // First-time init: set occ to current and inc
            if (oldPlane === 255) {
                map.incPlayerOcc(plane, localTileX, localTileY);
                pe.setOccTileWithMap?.(i, occMapX, occMapY, localTileX, localTileY, plane);
                continue;
            }

            // If map changed, dec on old map (if loaded), inc on new
            if (oldMapX !== occMapX || oldMapY !== occMapY) {
                const oldMap = host.mapManager.getMap(oldMapX as number, oldMapY as number) as
                    | WebGLMapSquare
                    | undefined;
                if (oldMap) oldMap.decPlayerOcc(oldPlane, oldTileX, oldTileY);
                map.incPlayerOcc(plane, localTileX, localTileY);
                pe.setOccTileWithMap?.(i, occMapX, occMapY, localTileX, localTileY, plane);
                continue;
            }

            // Same map: if plane and tile the same, nothing to do
            if (
                oldPlane === (plane | 0) &&
                oldTileX === (localTileX | 0) &&
                oldTileY === (localTileY | 0)
            ) {
                continue;
            }

            // Same map: delta row/column if single-tile and same plane, else full
            if (
                oldPlane === (plane | 0) &&
                Math.abs(localTileX - oldTileX) <= 1 &&
                Math.abs(localTileY - oldTileY) <= 1 &&
                (localTileX !== oldTileX || localTileY !== oldTileY)
            ) {
                const dx = localTileX - oldTileX;
                const dy = localTileY - oldTileY;
                if (dx !== 0) {
                    const trailX = oldTileX; // size 1: trailing is the whole old footprint
                    map.decPlayerOcc(oldPlane, trailX, oldTileY);
                    const leadX = localTileX;
                    map.incPlayerOcc(plane, leadX, localTileY);
                }
                if (dy !== 0) {
                    const trailY = oldTileY;
                    map.decPlayerOcc(oldPlane, oldTileX, trailY);
                    const leadY = localTileY;
                    map.incPlayerOcc(plane, localTileX, leadY);
                }
            } else {
                map.decPlayerOcc(oldPlane, oldTileX, oldTileY);
                map.incPlayerOcc(plane, localTileX, localTileY);
            }
            pe.setOccTileWithMap?.(i, occMapX, occMapY, localTileX, localTileY, plane);
        }
    
}

export function resetActorTileSelectionFrameIfNeeded(host: WebGLOsrsRendererHost, ): void {

        const frameId = (host.stats?.frameCount ?? 0) | 0;
        if (frameId === host.frameActorTileSelectionId) {
            return;
        }

        host.frameActorTileSelectionId = frameId;
        host.frameActorTileSelectionBuilt = false;
        host.frameWinningActorByTile.clear();
    
}

export function getActorTileSelectionKey(host: WebGLOsrsRendererHost, tileX: number, tileY: number, plane: number): number {

        return ((plane & 0x3) * 0x40000000 + ((tileX & 0x7fff) * 0x8000 + (tileY & 0x7fff))) >>> 0;
    
}

export function shouldReplaceTileWinner(host: WebGLOsrsRendererHost, 
        current: { kind: "player" | "npc"; id: number; priority: number },
        kind: "player" | "npc",
        id: number,
        priority: number,
    ): boolean {

        if (priority !== current.priority) return priority > current.priority;
        // PID values are random, but keep the result deterministic if a
        // collision ever occurs instead of depending on collection order.
        return id > current.id;
    
}

export function registerActorTileCandidate(host: WebGLOsrsRendererHost, 
        kind: "player" | "npc",
        id: number,
        tileX: number,
        tileY: number,
        plane: number,
        priority: number,
    ): void {

        const key = host.getActorTileSelectionKey(tileX | 0, tileY | 0, plane | 0);
        const current = host.frameWinningActorByTile.get(key);
        if (current && !host.shouldReplaceTileWinner(current, kind, id | 0, priority)) {
            return;
        }

        host.frameWinningActorByTile.set(key, {
            kind: kind,
            id: id | 0,
            priority,
        });
    
}

export function registerPlayerSceneTileCandidate(host: WebGLOsrsRendererHost, pid: number, priority: number): void {

        const pe = host.osrsClient.playerEcs;
        if (pe.getIsHidden(pid | 0)) {
            return;
        }
        host.registerActorTileCandidate(
            "player",
            pid | 0,
            (pe.getX(pid) >> 7) | 0,
            (pe.getY(pid) >> 7) | 0,
            pe.getLevel(pid) | 0,
            priority,
        );
    
}

export function collectRenderableNpcIds(host: WebGLOsrsRendererHost, ): Set<number> {

        const renderable = new Set<number>();
        for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
            const map = host.mapManager.visibleMaps[i];
            const ids = map?.npcEntityIds;
            if (!ids || ids.length === 0) {
                continue;
            }

            for (let j = 0; j < ids.length; j++) {
                const ecsId = ids[j] | 0;
                if (host.shouldRenderNpcOwnershipFromMap(map, ecsId)) {
                    renderable.add(ecsId);
                }
            }
        }
        return renderable;
    
}
