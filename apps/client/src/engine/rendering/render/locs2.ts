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

export function onLocDel(host: WebGLOsrsRendererHost, tile: { x: number; y: number }, level: number, shape: number, rotation: number): void {

        try {
            const key = `${tile.x},${tile.y},${level},${shape}`;
            host.addedLocs.delete(key);

            // Suppress the base cache-baked loc at this tile so a deregistered
            // object (e.g. a chopped tree) actually disappears - buildScene has
            // no other way to know a cache loc was removed.
            host.locOverrides.set(`${tile.x | 0},${tile.y | 0},${level | 0},-1`, {
                newId: 0,
                matchType: shape as LocModelType,
            });

            if (host.instanceActive) {
                // Instance geometry is an expanded transformed scene, not the
                // ordinary map square identified by this world tile. Rebuild
                // from the updated deletion snapshot through the coalesced
                // instance transaction instead of applying overworld loc data.
                host.scheduleInstanceLocRebuild();
                return;
            }

            const mapX = Math.floor(tile.x / 64);
            const mapY = Math.floor(tile.y / 64);
            // LOC_DEL does not carry an object id. Resolve it from the current
            // per-tile loc index so deletes can stay on the same partial path.
            const deletedLoc = host.getLocIdsAtTileAllLevels(tile.x, tile.y).find((loc) => {
                if ((loc.level | 0) !== (level | 0)) return false;
                const typeRot = loc.typeRot;
                return (
                    typeRot !== undefined &&
                    ((typeRot | 0) & 0x3f) === ((shape | 0) & 0x3f) &&
                    ((typeRot >> 6) & 0x3) === ((rotation | 0) & 0x3)
                );
            });
            const locType =
                deletedLoc && (deletedLoc.id | 0) > 0
                    ? host.osrsClient.locTypeLoader.load(deletedLoc.id | 0)
                    : undefined;
            host.scheduleLocGeometryUpdate(
                mapX,
                mapY,
                locType ? (isDoorLocType(locType) ? "door" : "loc") : "full",
            );
        } catch (err) {
            console.warn("onLocDel error", err);
        }
    
}

export function onLocAnim(host: WebGLOsrsRendererHost, 
        locId: number,
        tile: { x: number; y: number },
        level: number,
        shape: number,
        rotation: number,
        animId: number,
    ): void {

        try {
            if ((shape | 0) < 0) return;
            const exactKey = `${tile.x | 0},${tile.y | 0},${level | 0},${locId | 0}`;
            const matchKey = `${tile.x | 0},${tile.y | 0},${level | 0},-1`;
            for (const key of [exactKey, matchKey]) {
                const existingTimer = host.locAnimTimers.get(key);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                    host.locAnimTimers.delete(key);
                }
            }

            if (
                host.interactHighlightActiveTarget?.kind === "loc" &&
                (host.interactHighlightActiveTarget.plane | 0) === (level | 0) &&
                (host.interactHighlightActiveTarget.tileX | 0) === (tile.x | 0) &&
                (host.interactHighlightActiveTarget.tileY | 0) === (tile.y | 0)
            ) {
                host.clearInteractHighlightActiveTarget();
            }
            if (
                host.interactHighlightHoverTarget?.kind === "loc" &&
                (host.interactHighlightHoverTarget.plane | 0) === (level | 0) &&
                (host.interactHighlightHoverTarget.tileX | 0) === (tile.x | 0) &&
                (host.interactHighlightHoverTarget.tileY | 0) === (tile.y | 0)
            ) {
                host.clearInteractHighlightHoverTarget();
            }

            host.locOverrides.set(exactKey, {
                newId: locId | 0,
                newRotation: rotation & 0x3,
                seqId: animId | 0,
                seqRandomStart: false,
            });
            host.locOverrides.set(matchKey, {
                newId: -1,
                newRotation: rotation & 0x3,
                seqId: animId | 0,
                seqRandomStart: false,
                matchType: shape as LocModelType,
                matchRotation: rotation & 0x3,
            });
            host.reloadLocAnimationTile(tile, locId);

            const durationMs = host.getLocAnimationDurationMs(animId);
            const timer = setTimeout(() => {
                let changed = false;
                for (const key of [exactKey, matchKey]) {
                    const current = host.locOverrides.get(key);
                    if (
                        current &&
                        typeof current.seqId === "number" &&
                        (current.seqId | 0) === (animId | 0)
                    ) {
                        host.locOverrides.delete(key);
                        changed = true;
                    }
                    host.locAnimTimers.delete(key);
                }
                if (changed) {
                    host.reloadLocAnimationTile(tile, locId);
                }
            }, durationMs);
            host.locAnimTimers.set(exactKey, timer);
            host.locAnimTimers.set(matchKey, timer);
        } catch (err) {
            console.warn("onLocAnim error", err);
        }
    
}

export function reloadLocAnimationTile(host: WebGLOsrsRendererHost, tile: { x: number; y: number }, locId: number): void {

        const mapX = Math.floor((tile.x | 0) / 64);
        const mapY = Math.floor((tile.y | 0) / 64);
        if (host.instanceActive) {
            host.scheduleInstanceLocRebuild();
            return;
        }
        const locType = host.osrsClient.locTypeLoader.load(locId | 0);
        host.scheduleLocGeometryUpdate(
            mapX,
            mapY,
            locType && isDoorLocType(locType) ? "door" : "loc",
        );
    
}

export function getLocAnimationDurationMs(host: WebGLOsrsRendererHost, seqId: number): number {

        const fallbackMs = 2400;
        try {
            const seqType = host.osrsClient.seqTypeLoader.load(seqId | 0) as any;
            if (!seqType) return fallbackMs;
            let cycles = 0;
            const isSkeletal =
                (typeof seqType.isSkeletalSeq === "function" && seqType.isSkeletalSeq()) ||
                (seqType.skeletalId ?? -1) >= 0;
            if (isSkeletal) {
                const duration =
                    typeof seqType.getSkeletalDuration === "function"
                        ? seqType.getSkeletalDuration()
                        : 0;
                cycles = Math.max(1, duration | 0);
            } else if (Array.isArray(seqType.frameLengths)) {
                for (const frameLength of seqType.frameLengths) {
                    cycles += Math.max(1, Number(frameLength) | 0);
                }
            }
            if (!(cycles > 0)) return fallbackMs;
            return Math.max(600, Math.min(10000, cycles * 20 + 120));
        } catch {
            return fallbackMs;
        }
    
}

export function scheduleLocReload(host: WebGLOsrsRendererHost, mapX: number, mapY: number): void {

        const id = getMapSquareId(mapX, mapY);
        host.pendingLocReloadMaps.set(id, { mapX: mapX | 0, mapY: mapY | 0 });
        if (host.pendingLocReloadFlushTimer) return;
        const flush = () => {
            host.pendingLocReloadFlushTimer = undefined;
            if (host.pendingLocReloadMaps.size === 0) return;
            const batch = Array.from(host.pendingLocReloadMaps.values());
            host.pendingLocReloadMaps.clear();
            host.beginLocReloadBatch(batch);
        };
        host.pendingLocReloadFlushTimer = setTimeout(
            flush,
            RENDER_CONSTANTS.LOC_RELOAD_FLUSH_DELAY_MS,
        );
    
}
