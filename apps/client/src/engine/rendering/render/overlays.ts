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
import { RENDER_CONSTANTS, DEFAULT_OVERHEAD_CHAT_COLOR, DEFAULT_OVERHEAD_CHAT_COLOR_ID } from "@client/engine/rendering/render/constants";

export function acquireHitsplatEntry(host: WebGLOsrsRendererHost, ): HitsplatEntry {

        const entry = host.hitsplatPool.pop() ?? { worldX: 0, worldZ: 0, plane: 0 };
        entry.style = undefined;
        entry.spriteName = undefined;
        entry.backgroundTint = undefined;
        entry.type2 = undefined;
        entry.damage2 = undefined;
        return entry;
    
}

export function acquireHealthBarEntry(host: WebGLOsrsRendererHost, ): HealthBarEntry {

        return (
            host.healthBarPool.pop() ?? {
                worldX: 0,
                worldZ: 0,
                plane: 0,
                health: 0,
                health2: 0,
                cycle: 0,
                cycleOffset: 0,
            }
        );
    
}

export function acquireOverheadPrayerEntry(host: WebGLOsrsRendererHost, ): OverheadPrayerEntry {

        return (
            host.overheadPrayerPool.pop() ?? {
                worldX: 0,
                worldZ: 0,
                plane: 0,
                heightOffsetTiles: 0.9,
                headIconPrayer: -1,
            }
        );
    
}

export function acquireOverheadTextEntry(host: WebGLOsrsRendererHost, ): OverheadTextEntry {

        const entry = host.overheadTextPool.pop() ?? {
            worldX: 0,
            worldZ: 0,
            plane: 0,
            heightOffsetTiles: 0.9,
            text: "",
            color: DEFAULT_OVERHEAD_CHAT_COLOR >>> 0,
            colorId: DEFAULT_OVERHEAD_CHAT_COLOR_ID,
            effect: 0,
            life: 1,
            remaining: 0,
            duration: 1,
        };
        entry.modIcon = undefined;
        entry.pattern = undefined;
        return entry;
    
}

export function resetHealthBarOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.healthBarOutput.length === 0) return;
        for (const entry of host.healthBarOutput) {
            entry.defId = undefined;
            entry.heightOffsetTiles = undefined;
            host.healthBarPool.push(entry);
        }
        host.healthBarOutput.length = 0;
    
}

export function resetOverheadPrayerOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.overheadPrayerOutput.length === 0) return;
        for (const entry of host.overheadPrayerOutput) {
            entry.headIconPrayer = -1;
            entry.heightOffsetTiles = 0.9;
            host.overheadPrayerPool.push(entry);
        }
        host.overheadPrayerOutput.length = 0;
    
}

export function resetOverheadTextOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.overheadTextOutput.length === 0) return;
        for (const entry of host.overheadTextOutput) {
            entry.text = "";
            entry.life = 0;
            entry.remaining = 0;
            entry.duration = 0;
            entry.modIcon = undefined;
            entry.pattern = undefined;
            entry.heightOffsetTiles = 0.9;
            entry.color = DEFAULT_OVERHEAD_CHAT_COLOR >>> 0;
            entry.colorId = DEFAULT_OVERHEAD_CHAT_COLOR_ID;
            host.overheadTextPool.push(entry);
        }
        host.overheadTextOutput.length = 0;
    
}

export function resetHitsplatOutput(host: WebGLOsrsRendererHost, ): void {

        if (host.hitsplatOutput.length === 0) return;
        for (const entry of host.hitsplatOutput) {
            entry.style = undefined;
            entry.spriteName = undefined;
            entry.backgroundTint = undefined;
            host.hitsplatPool.push(entry);
        }
        host.hitsplatOutput.length = 0;
    
}

export function getNpcDefaultHeight(host: WebGLOsrsRendererHost, npcTypeId: number): number {

        // Check cache first
        let defaultHeight = host.npcDefaultHeightCache.get(npcTypeId);
        if (defaultHeight !== undefined) {
            return defaultHeight;
        }

        // Default fallback (same as Actor constructor: host.defaultHeight = 200)
        defaultHeight = 200;

        try {
            const npcType = host.osrsClient.npcTypeLoader.load(npcTypeId | 0);
            if (npcType && npcType.modelIds && npcType.modelIds.length > 0) {
                // Load and merge model data
                const models: ModelData[] = [];
                for (const modelId of npcType.modelIds) {
                    const modelData = host.osrsClient.modelLoader.getModel(modelId);
                    if (modelData) {
                        models.push(modelData);
                    }
                }

                if (models.length > 0) {
                    const merged = ModelData.merge(models, models.length);

                    // Apply recoloring (needed for proper model construction)
                    if (npcType.recolorFrom) {
                        for (let i = 0; i < npcType.recolorFrom.length; i++) {
                            merged.recolor(npcType.recolorFrom[i], npcType.recolorTo[i]);
                        }
                    }

                    // Light the model to get a proper Model instance
                    const model = merged.light(
                        host.osrsClient.textureLoader,
                        (npcType.ambient ?? 0) + 64,
                        (npcType.contrast ?? 0) * 5 + 850,
                        -30,
                        -50,
                        -30,
                    );

                    // Apply height scaling (OSRS applies widthScale to X/Z, heightScale to Y)
                    const widthScale = npcType.widthScale ?? 128;
                    const heightScale = npcType.heightScale ?? 128;
                    if (widthScale !== 128 || heightScale !== 128) {
                        model.scale(widthScale, heightScale, widthScale);
                    }

                    // Calculate bounds cylinder to get actual height
                    model.calculateBoundsCylinder();
                    defaultHeight = model.height;
                }
            }
        } catch (e) {
            // Fall back to default on any error
            console.warn(`[renderer] Failed to compute NPC height for ${npcTypeId}:`, e);
        }

        // Cache and return
        host.npcDefaultHeightCache.set(npcTypeId, defaultHeight);
        return defaultHeight;
    
}

export function resolveNpcOverlayAnchor(host: WebGLOsrsRendererHost, 
        ecsId: number,
        baseWorldX: number,
        baseWorldZ: number,
        npcTypeId: number | undefined,
    ): { worldX: number; worldZ: number; logicalHeightTiles: number } {

        let worldX = baseWorldX;
        let worldZ = baseWorldZ;
        let defaultHeight = npcTypeId != null ? host.getNpcDefaultHeight(npcTypeId) : 200;
        let logicalHeightTiles = defaultHeight / 128;

        try {
            if (npcTypeId == null || npcTypeId < 0) {
                return { worldX, worldZ, logicalHeightTiles };
            }
            const npcEcs = host.osrsClient.npcEcs;
            const npcTypeLoader = host.osrsClient.npcTypeLoader;
            const npcModelLoader = host.getInteractNpcModelLoader();
            if (!npcModelLoader || !npcTypeLoader) {
                return { worldX, worldZ, logicalHeightTiles };
            }

            let npcType = npcTypeLoader.load(npcTypeId | 0);
            if (!npcType) {
                return { worldX, worldZ, logicalHeightTiles };
            }
            if (npcType.transforms) {
                const transformed = npcType.transform(host.osrsClient.varManager, npcTypeLoader);
                if (transformed) npcType = transformed;
            }

            const actionSeqId = npcEcs.getSeqId(ecsId) | 0;
            const actionDelay = npcEcs.getSeqDelay?.(ecsId) | 0;
            const { movementSeqId, idleSeqId } = host.resolveNpcMovementSequenceIds(npcEcs, ecsId);
            const actionActive = actionSeqId >= 0 && actionDelay === 0;
            const seqId = actionActive ? actionSeqId : movementSeqId;
            const frame = Math.max(
                0,
                actionActive
                    ? npcEcs.getFrameIndex(ecsId) | 0
                    : npcEcs.getMovementFrameIndex?.(ecsId) | 0,
            );
            const movementFrame = Math.max(0, npcEcs.getMovementFrameIndex?.(ecsId) | 0);
            const overlaySeqId =
                actionActive &&
                host.shouldLayerNpcMovementSequence(
                    actionSeqId | 0,
                    movementSeqId | 0,
                    idleSeqId | 0,
                )
                    ? movementSeqId | 0
                    : -1;
            const overlayFrame = overlaySeqId >= 0 ? movementFrame | 0 : -1;
            const animHeightOffsetTiles = host.getSequenceVerticalOffsetTiles(seqId);

            let model =
                seqId >= 0
                    ? npcModelLoader.getModel(
                        npcType,
                        seqId,
                        frame,
                        overlaySeqId | 0,
                        overlayFrame | 0,
                    )
                    : undefined;
            if (!model) {
                model = npcModelLoader.getModel(npcType, -1, -1);
            }
            if (!model) {
                const baseLogicalHeight =
                    npcType.heightOffset >= 0 ? npcType.heightOffset : defaultHeight;
                return {
                    worldX,
                    worldZ,
                    logicalHeightTiles: baseLogicalHeight / 128 + animHeightOffsetTiles,
                };
            }

            try {
                model.calculateBoundsCylinder();
                defaultHeight = Math.max(1, model.height | 0);
            } catch {}
            const baseLogicalHeight =
                npcType.heightOffset >= 0 ? npcType.heightOffset : defaultHeight;
            logicalHeightTiles = baseLogicalHeight / 128 + animHeightOffsetTiles;

            // Model-space center can be offset from origin; rotate it like npc.vert.glsl.
            try {
                model.calculateBounds();
                const midX = ((model as any).xMid | 0) as number;
                const midZ = ((model as any).zMid | 0) as number;
                const yaw = (npcEcs.getRotation(ecsId) | 0) * RS_TO_RADIANS;
                const cos = Math.cos(yaw);
                const sin = Math.sin(yaw);
                worldX += (midX * cos + midZ * sin) / 128.0;
                worldZ += (-midX * sin + midZ * cos) / 128.0;
            } catch {}
        } catch {}

        return {
            worldX,
            worldZ,
            logicalHeightTiles,
        };
    
}

export function getEffectiveControlledPlayerId(host: WebGLOsrsRendererHost, ): number {

        const actual = host.osrsClient.controlledPlayerServerId | 0;
        if (actual > 0) {
            if (
                host.pendingControlledPlayerServerId !== undefined &&
                host.pendingControlledPlayerServerId !== actual
            ) {
                host.pendingControlledPlayerServerId = undefined;
            }
            return actual;
        }
        if (host.pendingControlledPlayerServerId !== undefined) {
            return host.pendingControlledPlayerServerId | 0;
        }
        return 0;
    
}

export function ensureHitsplatState(host: WebGLOsrsRendererHost, 
        map: Map<number, ActorHitsplatState>,
        serverId: number,
    ): ActorHitsplatState {

        let state = map.get(serverId);
        if (state) return state;
        state = createActorHitsplatState();
        map.set(serverId, state);
        return state;
    
}
