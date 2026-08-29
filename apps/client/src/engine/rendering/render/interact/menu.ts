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

export function performWorldEntryAction(host: WebGLOsrsRendererHost, 
        e: OsrsMenuEntry,
        orig: ((entry?: any, evt?: MouseEvent, ctx?: unknown) => void) | undefined,
        evt?: MouseEvent,
        tileForMenu?: { tileX: number; tileY: number; plane?: number },
        menuCtx?: MenuClickContext,
    ): void {

        const approxTile = host.osrsClient.menuTile ?? tileForMenu;
        const isLocEntry = e.targetType === MenuTargetType.LOC && typeof e.targetId === "number";
        const resolvedLocTile =
            approxTile && isLocEntry
                ? host.resolveLocInteractionTile((e.targetId as number) | 0, approxTile)
                : undefined;
        const effectiveTile = resolvedLocTile ?? approxTile;
        const shouldSkipClientWalk =
            isLocEntry && effectiveTile
                ? host.isLocalPlayerAdjacentToLoc((e.targetId as number) | 0, effectiveTile)
                : false;
        const optionLower = String(e.option || "").toLowerCase();
        const isWalk = optionLower === "walk here";
        host.onInteractHighlightEntryInvoked(
            {
                option: e.option,
                targetType: e.targetType,
                targetId: typeof e.targetId === "number" ? e.targetId | 0 : undefined,
                mapX: typeof e.mapX === "number" ? e.mapX | 0 : undefined,
                mapY: typeof e.mapY === "number" ? e.mapY | 0 : undefined,
            },
            effectiveTile,
        );
        try {
            const xy = host.toGLClickXY(evt);
            // Red cross for targeted actions; Yellow for walk
            host.spawnClickCross(effectiveTile as any, xy, isWalk ? "yellow" : "red");
        } catch {}

        const spellMeta = e.spellCast;
        console.log("[menu] Entry clicked:", {
            option: e.option,
            targetType: e.targetType,
            spellMeta,
            entry: e,
        });
        if (spellMeta) {
            try {
                const ctx: {
                    tile?: { tileX: number; tileY: number; plane?: number };
                    mapX?: number;
                    mapY?: number;
                    npcServerId?: number;
                    playerServerId?: number;
                } = { tile: effectiveTile };
                const metaMapX =
                    typeof spellMeta.mapX === "number"
                        ? spellMeta.mapX
                        : typeof e.mapX === "number"
                            ? e.mapX
                            : undefined;
                const metaMapY =
                    typeof spellMeta.mapY === "number"
                        ? spellMeta.mapY
                        : typeof e.mapY === "number"
                            ? e.mapY
                            : undefined;
                if (typeof metaMapX === "number") ctx.mapX = metaMapX;
                if (typeof metaMapY === "number") ctx.mapY = metaMapY;
                if (typeof spellMeta.npcServerId === "number")
                    ctx.npcServerId = spellMeta.npcServerId | 0;
                if (typeof spellMeta.playerServerId === "number")
                    ctx.playerServerId = spellMeta.playerServerId | 0;
                console.log("[menu] Calling castSpellFromMenu with ctx:", ctx);
                host.osrsClient.castSpellFromMenu(e, ctx);
            } catch (err) {
                console.warn?.("[menu] failed to cast spell", err);
            }
            return;
        }

        // Facing is server-authoritative via the face direction update mask.
        // Invoke original handler
        if (!menuCtx?.worldMenuStateDispatch) {
            try {
                orig?.(e as any, evt, menuCtx);
            } catch {}
        }
    
}

export function buildSimpleMenuEntries(host: WebGLOsrsRendererHost, 
        entries: OsrsMenuEntry[],
        opts: {
            shouldFreeze: boolean;
            toCssEvent: (gx?: number, gy?: number) => any;
        },
    ): SimpleMenuEntry[] {

        const client = host.osrsClient;
        if (
            opts.shouldFreeze &&
            client.menuFrozenSimpleEntries &&
            client.menuFrozenSimpleEntriesVersion === client.menuPinnedEntriesVersion
        ) {
            client.menuActiveSimpleEntries = client.menuFrozenSimpleEntries;
            return client.menuFrozenSimpleEntries;
        }
        const menuState = client.menuState;
        menuState.reset();
        const simple = worldEntriesToSimple(entries, {
            label: {
                includeExamineIds: !!host.osrsClient.debugId,
                localPlayerCombatLevel: ClientState.localPlayerCombatLevel | 0,
            },
            toCssEvent: opts.toCssEvent,
            menuState,
            registerWithState: true,
            resetMenuState: false,
        });
        client.menuActiveSimpleEntries = simple;
        if (opts.shouldFreeze) {
            client.menuFrozenSimpleEntries = simple;
            client.menuFrozenSimpleEntriesVersion = client.menuPinnedEntriesVersion;
        } else {
            client.menuFrozenSimpleEntries = undefined;
            client.menuFrozenSimpleEntriesVersion = 0;
        }
        return simple;
    
}

export function getApproxTileHeight(host: WebGLOsrsRendererHost, worldX: number, worldY: number, basePlane?: number): number {

        const resolvedBasePlane =
            basePlane ??
            (() => {
                const idx = host.osrsClient.playerEcs.getIndexForServerId(
                    host.osrsClient.controlledPlayerServerId,
                );
                return idx !== undefined ? host.osrsClient.playerEcs.getLevel(idx) : 0;
            })();

        const tileX = Math.floor(worldX);
        const tileY = Math.floor(worldY);
        const plane = host.getEffectivePlaneForTile(tileX, tileY, resolvedBasePlane);
        return host.sampleHeightAtExactPlane(worldX, worldY, plane);
    
}

export function getTileHeightAtPlane(host: WebGLOsrsRendererHost, worldX: number, worldY: number, plane: number): number {

        return host.sampleHeightAtExactPlane(worldX, worldY, plane);
    
}

export function getBridgedTileHeight(host: WebGLOsrsRendererHost, worldX: number, worldY: number, plane: number): number {

        const tileX = Math.floor(worldX);
        const tileY = Math.floor(worldY);
        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        const samplePlane =
            map && local ? resolveHeightSamplePlaneForLocal(map, plane, local.x, local.y) : plane;
        return host.sampleHeightAtExactPlane(worldX, worldY, samplePlane);
    
}

export function getMinTileHeightInRadius(host: WebGLOsrsRendererHost, 
        worldX: number,
        worldZ: number,
        plane: number,
        radius: number,
    ): number {

        if ((radius | 0) === 0) {
            return host.getBridgedTileHeight(worldX, worldZ, plane);
        }
        const fineX = Math.round(worldX * 128) | 0;
        const fineZ = Math.round(worldZ * 128) | 0;
        const half = (radius / 2) | 0;
        const minTileX = ((fineX - half) >> 7) + 1;
        const minTileZ = ((fineZ - half) >> 7) + 1;
        const maxTileX = (fineX + half) >> 7;
        const maxTileZ = (fineZ + half) >> 7;
        let min = Infinity;
        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
            for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
                min = Math.min(min, host.getBridgedTileHeight(tileX, tileZ, plane));
            }
        }
        min = Math.min(min, host.getBridgedTileHeight(worldX, worldZ, plane));
        min = Math.min(
            min,
            host.getBridgedTileHeight((fineX - half) / 128, (fineZ - half) / 128, plane),
        );
        min = Math.min(
            min,
            host.getBridgedTileHeight((fineX - half) / 128, (fineZ + half) / 128, plane),
        );
        min = Math.min(
            min,
            host.getBridgedTileHeight((fineX + half) / 128, (fineZ - half) / 128, plane),
        );
        return Math.min(
            min,
            host.getBridgedTileHeight((fineX + half) / 128, (fineZ + half) / 128, plane),
        );
    
}

export function getNpcFootprintRadius(host: WebGLOsrsRendererHost, npcTypeId: number | undefined): number {

        if (npcTypeId == null || npcTypeId < 0) return 0;
        try {
            const npcType = host.osrsClient.npcTypeLoader?.load?.(npcTypeId | 0);
            return npcType ? npcType.footprintSize | 0 : 0;
        } catch {
            return 0;
        }
    
}

export function getPreferredMapForWorldTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number): WebGLMapSquare | undefined {

        const preferredWorldViewId = host.getControlledPlayerWorldViewId();
        if (preferredWorldViewId >= 0) {
            const preferredView =
                host.osrsClient.worldViewManager.getWorldView(preferredWorldViewId);
            if (preferredView?.containsTile(tileX | 0, tileY | 0)) {
                const overlayMap = host.osrsClient.worldViewManager.getOverlayMapSquare(
                    preferredWorldViewId,
                    host.mapManager,
                );
                if (overlayMap) {
                    return overlayMap;
                }
            }
        }
        return host.mapManager.getMap(getMapIndexFromTile(tileX), getMapIndexFromTile(tileY)) as
            | WebGLMapSquare
            | undefined;
    
}

export function getMapLocalTile(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        tileX: number,
        tileY: number,
    ): { x: number; y: number } | undefined {

        const mapTileSpan = map.getLocalTileSpan();
        const localX = (tileX | 0) - map.getRenderBaseTileX();
        const localY = (tileY | 0) - map.getRenderBaseTileY();
        if (localX < 0 || localY < 0 || localX >= mapTileSpan || localY >= mapTileSpan) {
            return undefined;
        }
        return { x: localX | 0, y: localY | 0 };
    
}

export function getGroundItemLayerHeightTiles(host: WebGLOsrsRendererHost, tileX: number, tileY: number, level: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (!map) return 0;
        const local = host.getMapLocalTile(map, tileX, tileY);
        if (!local) return 0;
        return Math.max(0, map.getItemLayerHeightAtLocal(level | 0, local.x, local.y)) / 128;
    
}

export function withGroundItemOverlayHeights(host: WebGLOsrsRendererHost, 
        entries: GroundItemOverlayEntry[],
    ): GroundItemOverlayEntry[] {

        if (entries.length === 0) return entries;
        let output: GroundItemOverlayEntry[] | undefined;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const heightOffsetTiles = host.getGroundItemLayerHeightTiles(
                entry.tileX | 0,
                entry.tileY | 0,
                entry.level | 0,
            );
            if (heightOffsetTiles <= 0) {
                if (output) output.push(entry);
                continue;
            }
            if (!output) {
                output = entries.slice(0, i);
            }
            output.push({ ...entry, heightOffsetTiles });
        }
        return output ?? entries;
    
}

export function getEffectivePlaneForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (map && map.interactionPlane >= 0) return map.interactionPlane;
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        if (!map || !local) {
            return resolveInteractionPlaneForWorldTile(host.mapManager, basePlane, tileX, tileY);
        }
        return resolveInteractionPlaneForLocal(map, basePlane, local.x, local.y);
    
}

export function getHeightSamplePlaneForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (map && map.interactionPlane >= 0) return map.interactionPlane;
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        if (!map || !local) {
            return basePlane | 0;
        }
        return resolveHeightSamplePlaneForLocal(map, basePlane, local.x, local.y);
    
}

export function getOccupancyPlaneForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        if (!map || !local) {
            return resolveCollisionSamplePlaneForWorldTile(
                host.mapManager,
                basePlane,
                tileX,
                tileY,
            );
        }
        return resolveCollisionSamplePlaneForLocal(map, basePlane, local.x, local.y);
    
}
