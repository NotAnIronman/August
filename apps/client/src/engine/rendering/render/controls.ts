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
import { RENDER_CONSTANTS, ColorRgb, TextureFilterMode } from "@client/engine/rendering/render/constants";

export function clearControlledPlayerAppearanceCache(host: WebGLOsrsRendererHost, ): void {

        try {
            const controlledId = host.osrsClient.controlledPlayerServerId | 0;
            if (controlledId < 0) return;
            const pe = host.osrsClient.playerEcs;
            const idx = pe.getIndexForServerId(controlledId);
            if (idx === undefined) return;
            const app = pe.getAppearance(idx);
            if (!app) return;
            const equipKey =
                app.getEquipKey?.() ??
                (Array.isArray(app.equip) ? app.equip.slice(0, 14).join(",") : "");
            const key = app.getCacheKey?.() ?? `${app.getHash?.().toString() ?? "0"}|${equipKey}`;
            host.playerRenderer.cleanupAppearanceCache(key);
            pe.cleanupAppearanceCache(key);
        } catch {}
    
}

export function getProjectileManager(host: WebGLOsrsRendererHost, ): ProjectileManager | undefined {

        return host.projectileManager;
    
}

export function getControls(host: WebGLOsrsRendererHost, ): Schema {

        // Appearance (clothes + equipment) is server-driven; no local kit lists

        const queueRebuild = () => {
            host.playerRenderer
                .initGeometry()
                .catch((e) => console.warn("Player rebuild failed", e));
        };

        const schema: any = {
            Player: folder(
                {
                    Plane: {
                        value: (() => {
                            const idx = host.osrsClient.playerEcs.getIndexForServerId(
                                host.osrsClient.controlledPlayerServerId,
                            );
                            return idx !== undefined ? host.osrsClient.playerEcs.getLevel(idx) : 0;
                        })(),
                        min: 0,
                        max: 3,
                        step: 1,
                        label: "Plane",
                        onChange: (v: number) => {
                            const idx = host.osrsClient.playerEcs.getIndexForServerId(
                                host.osrsClient.controlledPlayerServerId,
                            );
                            if (idx === undefined) return;
                            const next = Math.max(0, Math.min(3, v | 0));
                            const currentLevel = host.osrsClient.playerEcs.getLevel(idx);
                            if (currentLevel !== next) {
                                host.osrsClient.playerEcs.setLevel(idx, next);
                                // Keep PlayerECS in sync if present so roof logic uses this plane
                                try {
                                    const pe = host.osrsClient.playerEcs as any;
                                    const n = pe?.size?.() ?? 0;
                                    if (n > 0) pe.setLevel?.(0, next);
                                } catch {}
                                // Ensure camera follow and height sampling react immediately
                                host.osrsClient.camera.updated = true;
                            }
                        },
                    },
                    AnimMode: {
                        value: host.playerAnimMode,
                        options: { Idle: "idle", Walk: "walk", Run: "run", Crawl: "crawl" },
                        label: "Player Animation",
                        onChange: (v: "idle" | "walk" | "run" | "crawl") => {
                            host.playerAnimMode = v;
                            // Also toggle server run mode to keep speed consistent with UI choice
                            try {
                                host.osrsClient.setRunMode(v === "run");
                            } catch {}
                            // Update local ECS run flag to reflect toggle immediately
                            try {
                                const idx = host.osrsClient.playerEcs.getIndexForServerId(
                                    host.osrsClient.controlledPlayerServerId,
                                );
                                if (idx !== undefined)
                                    (host.osrsClient.playerEcs as any).running[idx] =
                                        v === "run" ? 1 : 0;
                            } catch {}
                            // Reset frames when switching modes
                        },
                    },
                    DebugDumpVertices: {
                        value: host.playerDebugDump,
                        label: "Debug Dump Vertices",
                        onChange: (v: boolean) => {
                            host.playerDebugDump = !!v;
                            queueRebuild();
                        },
                    },
                    FreezeFrame: {
                        value: host.playerFreezeFrame,
                        label: "Freeze Frame",
                        onChange: (v: boolean) => (host.playerFreezeFrame = !!v),
                    },
                    FrameIndex: {
                        value: host.playerFixedFrame,
                        min: 0,
                        max: Math.max(host.playerRenderer.getFrameCount() - 1, 0),
                        step: 1,
                        onChange: (v: number) => (host.playerFixedFrame = v | 0),
                    },
                    IdleSeqId: {
                        value: host.playerIdleSeqId,
                        min: -1,
                        max: host.resolvePlayerIdleSeqMaxId(),
                        step: 1,
                        label: "Idle Seq ID (-1:auto)",
                        onChange: (v: number) => {
                            host.playerIdleSeqId = v | 0;
                            host.clearControlledPlayerAppearanceCache();
                            queueRebuild();
                        },
                    },
                    YOffset: {
                        value: host.playerYOffset,
                        min: -32,
                        max: 64,
                        step: 1,
                        label: "Y offset",
                        onChange: (v: number) => (host.playerYOffset = v | 0),
                    },
                    // No local appearance editing (head/torso/arms/hands)
                    // No local appearance editing (legs/feet)
                    // No local equip meta introspection
                },
                { collapsed: false },
            ),
            "Max Level": {
                value: host.maxLevel,
                min: 0,
                max: 3,
                step: 1,
                onChange: (v: number) => {
                    host.setMaxLevel(v);
                },
            },
            Sky: {
                r: host.skyColor[0] * 255,
                g: host.skyColor[1] * 255,
                b: host.skyColor[2] * 255,
                onChange: (v: ColorRgb) => {
                    host.setSkyColor(v.r, v.g, v.b);
                },
            },
            Fog: folder(
                {
                    Auto: {
                        value: host.autoFogDepth,
                        label: "Dynamic (scales with draw distance)",
                        onChange: (v: boolean) => {
                            host.autoFogDepth = !!v;
                        },
                    },
                    Factor: {
                        value: host.autoFogDepthFactor,
                        min: 0,
                        max: 1,
                        step: 0.05,
                        label: "Fog start factor",
                        onChange: (v: number) => {
                            // Keep it sane; fogFactorOSRS clamps against renderDistance anyway.
                            host.autoFogDepthFactor = Math.max(0, Math.min(1, v));
                        },
                    },
                    Depth: {
                        value: host.fogDepth,
                        min: 0,
                        max: 400,
                        step: 5,
                        label: "Manual fog start (tiles)",
                        onChange: (v: number) => {
                            host.fogDepth = v;
                        },
                    },
                },
                { collapsed: true },
            ),
            Brightness: {
                value: 1,
                min: 0,
                max: 4,
                step: 1,
                onChange: (v: number) => {
                    host.brightness = 1.0 - v * 0.1;
                },
            },
            "Color Banding": {
                value: 50,
                min: 0,
                max: 100,
                step: 1,
                onChange: (v: number) => {
                    host.colorBanding = 255 - v * 2;
                },
            },
            "Texture Filtering": {
                value: host.textureFilterMode,
                options: {
                    Disabled: TextureFilterMode.DISABLED,
                    Bilinear: TextureFilterMode.BILINEAR,
                    Trilinear: TextureFilterMode.TRILINEAR,
                    "Anisotropic 2x": TextureFilterMode.ANISOTROPIC_2X,
                    "Anisotropic 4x": TextureFilterMode.ANISOTROPIC_4X,
                    "Anisotropic 8x": TextureFilterMode.ANISOTROPIC_8X,
                    "Anisotropic 16x": TextureFilterMode.ANISOTROPIC_16X,
                },
                onChange: (v: TextureFilterMode) => {
                    if (v === host.textureFilterMode) {
                        return;
                    }
                    host.textureFilterMode = v;
                    host.updateTextureFiltering();
                },
            },
            "Smooth Terrain": {
                value: host.smoothTerrain,
                onChange: (v: boolean) => {
                    host.setSmoothTerrain(v);
                },
            },
            "Cull Back-faces": {
                value: host.cullBackFace,
                onChange: (v: boolean) => {
                    host.cullBackFace = v;
                },
            },
            "Anti-Aliasing": folder(
                {
                    MSAA: {
                        value: host.msaaEnabled,
                        onChange: (v: boolean) => {
                            host.setMsaa(v);
                        },
                    },
                    FXAA: {
                        value: host.fxaaEnabled,
                        onChange: (v: boolean) => {
                            host.setFxaa(v);
                        },
                    },
                },
                { collapsed: true },
            ),
            Entity: folder(
                {
                    Npcs: {
                        value: host.loadNpcs,
                        onChange: (v: boolean) => {
                            host.setLoadNpcs(v);
                        },
                    },
                },
                { collapsed: true },
            ),
        };

        return schema;
    
}
