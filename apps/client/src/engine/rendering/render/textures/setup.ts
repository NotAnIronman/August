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
import { RENDER_CONSTANTS, MAX_TEXTURES, WATER_TEXTURE_SIZE, WATER_TEXTURE_ASSETS, DEFAULT_WATER_MATERIAL, SWAMP_WATER_MATERIAL, ICE_WATER_MATERIAL, VANILLA_WATER_SURFACE_COLORS, waterRgb, WaterMaterialParams } from "@client/engine/rendering/render/constants";

export function initTextures(host: WebGLOsrsRendererHost, ): void {

        const textureLoader = host.osrsClient.textureLoader;
        if (!textureLoader) return;

        const allTextureIds = textureLoader.getTextureIds();

        host.textureIds = allTextureIds
            .filter((id) => textureLoader.isSd(id))
            .slice(0, MAX_TEXTURES - 1);

        host.textureIdIndexMap.clear();
        host.textureFrameCounts.clear();
        for (let i = 0; i < host.textureIds.length; i++) {
            const id = host.textureIds[i];
            host.textureIdIndexMap.set(id, i + 1);
            host.textureFrameCounts.set(id, 1);
        }
        host.textureLayerCount = host.textureIds.length + 1;

        host.initTextureArray();
        host.initMaterialsTexture();

        // console.log("init textures", host.textureIds, allTextureIds.length);
    
}

export async function initWaterTextures(host: WebGLOsrsRendererHost, ): Promise<void> {

        let data: Uint8Array;
        try {
            data = await host.loadWaterTextureData();
            host.waterShadingUnavailable = false;
        } catch (error) {
            console.log(
                "[water] Failed to load water textures; water renders with the vanilla texture path",
                error,
            );
            host.waterShadingUnavailable = true;
            data = new Uint8Array(
                WATER_TEXTURE_SIZE * WATER_TEXTURE_SIZE * 4 * WATER_TEXTURE_ASSETS.length,
            );
        }

        host.waterTextures?.delete();
        host.waterTextures = createTextureArray(
            host.app,
            data,
            WATER_TEXTURE_SIZE,
            WATER_TEXTURE_SIZE,
            WATER_TEXTURE_ASSETS.length,
            {
                internalFormat: PicoGL.RGBA8,
                type: PicoGL.UNSIGNED_BYTE,
                minFilter: PicoGL.LINEAR_MIPMAP_LINEAR,
                magFilter: PicoGL.LINEAR,
                wrapS: PicoGL.REPEAT,
                wrapT: PicoGL.REPEAT,
            },
        );
    
}

export async function loadWaterTextureData(host: WebGLOsrsRendererHost, ): Promise<Uint8Array> {

        const images = await Promise.all(
            WATER_TEXTURE_ASSETS.map((src) => host.loadImageAsset(src)),
        );
        const canvas = document.createElement("canvas");
        canvas.width = WATER_TEXTURE_SIZE;
        canvas.height = WATER_TEXTURE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
            throw new Error("Could not create canvas context for water texture upload");
        }

        const data = new Uint8Array(
            WATER_TEXTURE_SIZE * WATER_TEXTURE_SIZE * 4 * WATER_TEXTURE_ASSETS.length,
        );
        for (let layer = 0; layer < images.length; layer++) {
            context.clearRect(0, 0, WATER_TEXTURE_SIZE, WATER_TEXTURE_SIZE);
            context.drawImage(images[layer], 0, 0, WATER_TEXTURE_SIZE, WATER_TEXTURE_SIZE);
            const imageData = context.getImageData(0, 0, WATER_TEXTURE_SIZE, WATER_TEXTURE_SIZE);
            data.set(imageData.data, layer * WATER_TEXTURE_SIZE * WATER_TEXTURE_SIZE * 4);
        }
        return data;
    
}

export function loadImageAsset(host: WebGLOsrsRendererHost, src: string): Promise<HTMLImageElement> {

        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load image asset ${src}`));
            image.src = src;
        });
    
}

export function collectWaterTextureIds(host: WebGLOsrsRendererHost, ): Set<number> {

        if (host.waterShadingUnavailable) {
            return new Set();
        }
        host.collectWaterOverlayColors();
        return new Set(KNOWN_WATER_TEXTURE_IDS);
    
}

export function collectWaterOverlayColors(host: WebGLOsrsRendererHost, ): void {

        host.waterOverlayColors.clear();
        const loaderFactory = host.osrsClient.loaderFactory;
        if (!loaderFactory?.getOverlayTypeLoader) {
            return;
        }

        let overlayTypeLoader: ReturnType<typeof loaderFactory.getOverlayTypeLoader>;
        try {
            overlayTypeLoader = loaderFactory.getOverlayTypeLoader();
        } catch {
            return;
        }

        const overlayCount = overlayTypeLoader.getCount();
        for (let overlayId = 0; overlayId < overlayCount; overlayId++) {
            let overlay: OverlayFloorType;
            try {
                overlay = overlayTypeLoader.load(overlayId);
            } catch {
                continue;
            }

            const textureId = overlay?.textureId ?? -1;
            if (
                !KNOWN_WATER_TEXTURE_IDS.has(textureId) ||
                host.waterOverlayColors.has(textureId) ||
                (overlay.primaryRgb & 0xffffff) === 0
            ) {
                continue;
            }
            host.waterOverlayColors.set(textureId, waterRgb(overlay.primaryRgb));
        }
    
}

export function getWaterMaterialParams(host: WebGLOsrsRendererHost, textureId: number): WaterMaterialParams {

        if (textureId === 25) {
            return SWAMP_WATER_MATERIAL;
        }
        if (textureId === 91) {
            return ICE_WATER_MATERIAL;
        }

        const surfaceColor =
            VANILLA_WATER_SURFACE_COLORS.get(textureId) ?? host.waterOverlayColors.get(textureId);
        if (surfaceColor) {
            return {
                ...DEFAULT_WATER_MATERIAL,
                surfaceColor,
            };
        }

        return DEFAULT_WATER_MATERIAL;
    
}
