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
import { getMapIndexFromTile, getMapPlaneId } from "@august/osrs-engine/map/MapFileIndex";
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
import { decodeGroundItemMapId, getGroundItemMapId } from "@client/engine/rendering/ground/GroundItemMapKey";
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

export function updateGroundItemMeshes(host: WebGLOsrsRendererHost, stacks: ClientGroundItemStack[]): boolean {

        let modelsPending = false;
        const grouped = new Map<number, ClientGroundItemStack[]>();
        for (const stack of stacks) {
            const tileX = stack.tile.x | 0;
            const tileY = stack.tile.y | 0;

            // Check if this ground item falls within a WorldView overlay
            let mapId: number;
            const wv = host.osrsClient.worldViewManager.findWorldViewAt(tileX, tileY);
            if (wv && !wv.isTopLevel()) {
                mapId = wv.overlayMapId;
            } else {
                const mapX = tileX >> 6;
                const mapY = tileY >> 6;
                if (mapX < 0 || mapY < 0) continue;
                mapId = getGroundItemMapId(tileX, tileY);
            }

            const clone: ClientGroundItemStack = {
                ...stack,
                itemId: stack.itemId | 0,
                quantity: Math.max(1, stack.quantity | 0),
                tile: { x: tileX, y: tileY, level: stack.tile.level | 0 },
            };
            const list = grouped.get(mapId);
            if (list) list.push(clone);
            else grouped.set(mapId, [clone]);
        }

        const allKeys = new Set<number>([...host.groundItemStacks.keys(), ...grouped.keys()]);
        for (const key of allKeys) {
            const next = grouped.get(key) ?? [];
            const hashNext = next.length > 0 ? host.hashGroundStacks(next) : "";
            const prevHash = host.groundItemStackHashes.get(key) ?? "";
            if (hashNext !== prevHash) {
                if (next.length > 0) {
                    host.groundItemStacks.set(key, next);
                    host.groundItemStackHashes.set(key, hashNext);
                } else {
                    host.groundItemStacks.delete(key);
                    host.groundItemStackHashes.delete(key);
                }

                const { mapX, mapY } = decodeGroundItemMapId(key);
                const map = host.mapManager.getMap(mapX, mapY) as WebGLMapSquare | undefined;
                if (map) {
                    if (host.rebuildGroundItemsForMap(map, next)) {
                        // Sparse JS5 models arrive later; leave this map dirty so the next server tick retries it.
                        host.groundItemStackHashes.delete(key);
                        modelsPending = true;
                    }
                }
            }
        }
        return modelsPending;
}

export function hashGroundStacks(host: WebGLOsrsRendererHost, stacks: ClientGroundItemStack[]): string {

        return stacks
            .slice()
            .sort(
                (a, b) =>
                    a.tile.x - b.tile.x ||
                    a.tile.y - b.tile.y ||
                    a.tile.level - b.tile.level ||
                    a.itemId - b.itemId ||
                    a.quantity - b.quantity ||
                    (a.id | 0) - (b.id | 0),
            )
            .map(
                (stack) =>
                    `${stack.tile.x},${stack.tile.y},${stack.tile.level},${stack.itemId},${stack.quantity},${stack.id}`,
            )
            .join("|");
    
}

export function rebuildGroundItemsForMap(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        stacks: ClientGroundItemStack[] | undefined,
    ): boolean {

        const hasStacks = !!stacks?.length;
        if (!host.mainProgram || !host.mainAlphaProgram) return hasStacks;
        if (
            !host.textureArray ||
            !host.textureMaterials ||
            !host.waterTextures ||
            !host.sceneUniformBuffer
        )
            return hasStacks;
        const objModelLoader = host.osrsClient.objModelLoader;
        const textureLoader = host.osrsClient.textureLoader;
        if (!objModelLoader || !textureLoader) return hasStacks;

        const missesBefore = objModelLoader.modelLoader?.missCount ?? 0;
        const data = buildGroundItemGeometry(
            map,
            stacks && stacks.length > 0 ? stacks : undefined,
            objModelLoader,
            textureLoader,
            host.textureIdIndexMap,
        );

        if (!data) {
            map.clearGroundItemGeometry();
            return (objModelLoader.modelLoader?.missCount ?? 0) > missesBefore;
        }

        const textureUpdates = new Map<number, Int32Array>();
        for (const texId of data.usedTextureIds) {
            if (host.loadedTextureIds.has(texId)) continue;
            try {
                const pixels = textureLoader.getPixelsArgb(texId, RENDER_CONSTANTS.TEXTURE_SIZE, true, 1.0);
                textureUpdates.set(texId, pixels);
                host.loadedTextureIds.add(texId);
            } catch (err) {
                console.warn("[ground] failed to load texture", texId, err);
            }
        }
        if (textureUpdates.size > 0) {
            host.updateTextureArray(textureUpdates);
        }

        map.updateGroundItemGeometry(
            host.app,
            host.mainProgram,
            host.mainAlphaProgram,
            host.textureArray,
            host.textureMaterials,
            host.waterTextures,
            host.sceneUniformBuffer,
            data,
        );
        return false;
    
}
