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

export function onLocChange(host: WebGLOsrsRendererHost, 
        oldId: number,
        newId: number,
        tile: { x: number; y: number },
        level: number,
        opts?: {
            oldTile?: { x: number; y: number };
            newTile?: { x: number; y: number };
            oldRotation?: number;
            newRotation?: number;
            newShape?: number;
        },
    ): void {

        try {
            console.log(
                `[WebGLRenderer] Loc change: ${oldId} -> ${newId} at (${tile.x}, ${tile.y}, ${level})`,
            );

            const oldTile = opts?.oldTile ?? tile;
            const newTile = opts?.newTile;
            const oldLocType =
                (oldId | 0) > 0 ? host.osrsClient.locTypeLoader.load(oldId | 0) : undefined;
            const newLocType =
                (newId | 0) > 0 ? host.osrsClient.locTypeLoader.load(newId | 0) : undefined;
            const hasUnknownLocType =
                ((oldId | 0) > 0 && oldLocType === undefined) ||
                ((newId | 0) > 0 && newLocType === undefined);
            const oldIsDoor = oldLocType !== undefined && isDoorLocType(oldLocType);
            const newIsDoor = newLocType !== undefined && isDoorLocType(newLocType);
            // Keeping doors and ordinary locs in separate GPU groups lets us
            // match the game's partial loc-update behaviour. A change that
            // crosses those groups retains the conservative full rebuild.
            const isDoorOnlyUpdate =
                !hasUnknownLocType &&
                (oldId <= 0 || oldIsDoor) &&
                (newId <= 0 || newIsDoor) &&
                (oldIsDoor || newIsDoor);
            const isLocOnlyUpdate = !hasUnknownLocType && !oldIsDoor && !newIsDoor;
            const matchesChangedTile = (target: {
                tileX: number;
                tileY: number;
                plane: number;
            }): boolean => {
                if ((target.plane | 0) !== (level | 0)) return false;
                if (
                    (target.tileX | 0) === (oldTile.x | 0) &&
                    (target.tileY | 0) === (oldTile.y | 0)
                ) {
                    return true;
                }
                if (
                    newTile &&
                    (target.tileX | 0) === (newTile.x | 0) &&
                    (target.tileY | 0) === (newTile.y | 0)
                ) {
                    return true;
                }
                return false;
            };

            if (
                host.interactHighlightActiveTarget?.kind === "loc" &&
                matchesChangedTile(host.interactHighlightActiveTarget)
            ) {
                host.clearInteractHighlightActiveTarget();
            }
            if (
                host.interactHighlightHoverTarget?.kind === "loc" &&
                matchesChangedTile(host.interactHighlightHoverTarget)
            ) {
                host.clearInteractHighlightHoverTarget();
            }
            const overrideRotation =
                typeof opts?.newRotation === "number" ? opts.newRotation & 0x3 : undefined;

            const spawnKey = `${oldTile.x | 0},${oldTile.y | 0},${level | 0}`;
            const existingSpawn = host.locSpawns.get(spawnKey);
            // Use locSpawns for: locs spawned on empty ground (oldId===0) or ongoing lifecycle of a spawned loc
            const isSpawnedLoc =
                (oldId | 0) === 0 ||
                (existingSpawn !== undefined && existingSpawn.id === (oldId | 0));

            const clearOverridesAtTile = (tileX: number, tileY: number): void => {
                const keyPrefix = `${tileX | 0},${tileY | 0},${level},`;
                for (const key of Array.from(host.locOverrides.keys())) {
                    if (key.startsWith(keyPrefix)) {
                        host.locOverrides.delete(key);
                    }
                }
            };
            clearOverridesAtTile(oldTile.x, oldTile.y);
            if (newTile) {
                clearOverridesAtTile(newTile.x, newTile.y);
            }

            if (isSpawnedLoc) {
                // Manage via locSpawns
                if ((newId | 0) === 0) {
                    host.locSpawns.delete(spawnKey);
                } else {
                    // Use the shape from the server (matches loc_add_change_v2 OSRS packet),
                    // or inherit from the existing spawn, or default to NORMAL (10).
                    const spawnType =
                        typeof opts?.newShape === "number"
                            ? (opts.newShape as LocModelType)
                            : (existingSpawn?.type ?? LocModelType.NORMAL);
                    host.locSpawns.set(spawnKey, {
                        id: newId | 0,
                        type: spawnType,
                        rotation: overrideRotation ?? 0,
                    });
                }
            } else {
                // Regular map loc override
                const overrideKey = `${oldTile.x},${oldTile.y},${level},${oldId}`;
                host.locOverrides.set(overrideKey, {
                    newId: newId | 0,
                    newRotation: overrideRotation,
                    moveToX:
                        newTile &&
                        ((newTile.x | 0) !== (oldTile.x | 0) || (newTile.y | 0) !== (oldTile.y | 0))
                            ? newTile.x | 0
                            : undefined,
                    moveToY:
                        newTile &&
                        ((newTile.x | 0) !== (oldTile.x | 0) || (newTile.y | 0) !== (oldTile.y | 0))
                            ? newTile.y | 0
                            : undefined,
                });
            }

            if (host.instanceActive) {
                // The resident instance is one expanded, transformed scene.
                // Loading a normal 64x64 loc payload here can partially apply
                // untransformed overworld geometry over it. Rebuild from the
                // updated locSpawns/locOverrides snapshot transactionally.
                host.scheduleInstanceLocRebuild();
                console.log("Refreshing active instance via loc scene rebuild");
                return;
            }

            // Moving locs can cross map-square boundaries (e.g., edge gates).
            // Reload both affected map squares so moved geometry can appear on the new side.
            const oldMapX = Math.floor(oldTile.x / 64);
            const oldMapY = Math.floor(oldTile.y / 64);
            const newMapX = Math.floor((newTile?.x ?? oldTile.x) / 64);
            const newMapY = Math.floor((newTile?.y ?? oldTile.y) / 64);
            const mapKeys = new Set<string>([`${oldMapX}:${oldMapY}`, `${newMapX}:${newMapY}`]);

            for (const mapKey of mapKeys) {
                const [mxRaw, myRaw] = mapKey.split(":");
                const mx = Number(mxRaw) | 0;
                const my = Number(myRaw) | 0;
                const mapId = getMapSquareId(mx, my);
                if (
                    isDoorOnlyUpdate &&
                    !host.pendingLocUpdates.has(mapId) &&
                    !host.pendingLocGeometryUpdates.has(mapId)
                ) {
                    host.pendingDoorLocUpdates.add(mapId);
                } else if (
                    isLocOnlyUpdate &&
                    !host.pendingLocUpdates.has(mapId) &&
                    !host.pendingDoorLocUpdates.has(mapId)
                ) {
                    host.pendingLocGeometryUpdates.add(mapId);
                } else {
                    host.pendingLocUpdates.add(mapId);
                    host.pendingLocGeometryUpdates.delete(mapId);
                    host.pendingDoorLocUpdates.delete(mapId);
                }
                host.scheduleLocReload(mx, my);
            }

            const mapSummary = [...mapKeys]
                .map((entry) => {
                    const [mxRaw, myRaw] = entry.split(":");
                    return `(${Number(mxRaw) | 0}, ${Number(myRaw) | 0})`;
                })
                .join(", ");
            console.log(`Refreshing map square(s) ${mapSummary} via loc geometry refresh`);
        } catch (err) {
            console.warn("onLocChange error", err);
        }
    
}

export function getExtraLocsForMap(host: WebGLOsrsRendererHost, 
        mapX: number,
        mapY: number,
    ):
        | Array<{
        id: number;
        x: number;
        y: number;
        level: number;
        shape: number;
        rotation: number;
    }>
        | undefined {

        if (host.addedLocs.size === 0) return undefined;
        const minX = mapX * 64;
        const minY = mapY * 64;
        const maxX = minX + 64;
        const maxY = minY + 64;
        const locs: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }> = [];
        for (const loc of host.addedLocs.values()) {
            if (loc.x >= minX && loc.x < maxX && loc.y >= minY && loc.y < maxY) {
                locs.push({
                    id: loc.locId,
                    x: loc.x,
                    y: loc.y,
                    level: loc.level,
                    shape: loc.shape,
                    rotation: loc.rotation,
                });
            }
        }
        return locs.length > 0 ? locs : undefined;
    
}

export function scheduleLocGeometryUpdate(host: WebGLOsrsRendererHost, 
        mapX: number,
        mapY: number,
        group: "loc" | "door" | "full",
    ): void {

        const mapId = getMapSquareId(mapX, mapY);
        if (
            group === "door" &&
            !host.pendingLocUpdates.has(mapId) &&
            !host.pendingLocGeometryUpdates.has(mapId)
        ) {
            host.pendingDoorLocUpdates.add(mapId);
        } else if (
            group === "loc" &&
            !host.pendingLocUpdates.has(mapId) &&
            !host.pendingDoorLocUpdates.has(mapId)
        ) {
            host.pendingLocGeometryUpdates.add(mapId);
        } else {
            host.pendingLocUpdates.add(mapId);
            host.pendingLocGeometryUpdates.delete(mapId);
            host.pendingDoorLocUpdates.delete(mapId);
        }
        host.scheduleLocReload(mapX, mapY);
    
}

export function onLocAddChange(host: WebGLOsrsRendererHost, 
        locId: number,
        tile: { x: number; y: number },
        level: number,
        shape: number,
        rotation: number,
    ): void {

        try {
            const key = `${tile.x},${tile.y},${level},${shape}`;
            host.addedLocs.set(key, { locId, x: tile.x, y: tile.y, level, shape, rotation });

            // Suppress the base cache-baked loc at this tile so it doesn't
            // keep rendering alongside (or instead of) the new one - buildScene
            // has no other way to know a cache loc was replaced/removed.
            host.locOverrides.set(`${tile.x | 0},${tile.y | 0},${level | 0},-1`, {
                newId: 0,
                matchType: shape as LocModelType,
            });

            const mapX = Math.floor(tile.x / 64);
            const mapY = Math.floor(tile.y / 64);
            if (host.instanceActive) {
                // In instance mode, schedule a deferred instance scene rebuild
                // that includes the new loc via extraLocs.
                host.scheduleInstanceLocRebuild();
            } else {
                const locType = host.osrsClient.locTypeLoader.load(locId | 0);
                host.scheduleLocGeometryUpdate(
                    mapX,
                    mapY,
                    locType && isDoorLocType(locType) ? "door" : "loc",
                );
            }
            console.log(
                `[WebGLRenderer] Loc add: ${locId} at (${tile.x}, ${tile.y}, ${level}) shape=${shape} -> map (${mapX}, ${mapY})`,
            );
        } catch (err) {
            console.warn("onLocAddChange error", err);
        }
    
}
