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
import { RENDER_CONSTANTS, DEFAULT_OVERHEAD_CHAT_COLOR, OVERHEAD_CHAT_COLOR_TABLE, DEFAULT_NPC_HEALTH, MAX_ESTIMATED_HEALTH } from "@client/engine/rendering/render/constants";

export function trimActorHealthBars(host: WebGLOsrsRendererHost, 
        map: Map<number, ActorHealthBarsState>,
        tick: number,
        opts: { kind: "player" | "npc" },
    ): void {

        if (map.size === 0) return;
        const now = tick | 0;
        const playerEcs = host.osrsClient.playerEcs;
        const npcEcs = host.osrsClient.npcEcs;
        const controlledId = host.getEffectiveControlledPlayerId();

        const removeIds: number[] = [];
        for (const [serverId, state] of map) {
            // Drop entries for despawned actors.
            if (opts.kind === "player") {
                const isControlledPlayer =
                    controlledId > 0 && (serverId | 0) === (controlledId | 0);
                const missing = playerEcs.getIndexForServerId(serverId) === undefined;
                if (missing && !isControlledPlayer) {
                    removeIds.push(serverId);
                    continue;
                }
            } else {
                const ecsId = npcEcs.getEcsIdForServer(serverId);
                if (ecsId === undefined || !npcEcs.isActive(ecsId)) {
                    removeIds.push(serverId);
                    continue;
                }
            }

            const bars = state.bars;
            for (let i = bars.length - 1; i >= 0; i--) {
                const bar = bars[i];
                // Use `get` semantics to expire old updates; remove empty bars.
                const got = host.healthBarGet(bar, now);
                if (!got && bar.updates.length === 0) {
                    bars.splice(i, 1);
                }
            }
            if (state.bars.length === 0) {
                removeIds.push(serverId);
            }
        }
        for (const id of removeIds) {
            map.delete(id);
        }
    
}

export function makeActorGroupKey(host: WebGLOsrsRendererHost, isNpc: boolean, serverId: number): number {

        return ((isNpc ? 1 : 0) << 24) | ((serverId | 0) & 0xffffff) | 0;
    
}

export function appendPlayerOverheadText(host: WebGLOsrsRendererHost, 
        index: number,
        output: OverheadTextEntry[],
        maxEntries: number,
        playerDefaultHeightTiles: number | undefined,
    ): void {

        if (output.length >= maxEntries) return;
        if (!host.shouldRenderPlayerIndex(index)) return;
        const pe = host.osrsClient.playerEcs;
        const chatState = pe.getOverheadChat(index);
        if (!chatState) return;
        const text = chatState.text;
        if (!text || text.length === 0) return;

        const overhead = host.acquireOverheadTextEntry();
        overhead.worldX = (pe.getX(index) | 0) / 128.0;
        overhead.worldZ = (pe.getY(index) | 0) / 128.0;
        overhead.plane = pe.getLevel(index) | 0;
        overhead.footprintRadius = RENDER_CONSTANTS.PLAYER_FOOTPRINT_RADIUS;
        overhead.groupKey = host.makeActorGroupKey(false, pe.getServerIdForIndex?.(index) ?? 0);
        overhead.text = text;
        overhead.color = host.mapOverheadColor(chatState.color);
        overhead.colorId =
            typeof chatState.color === "number" && chatState.color >= 0 && chatState.color < 0x100
                ? chatState.color | 0
                : undefined;
        overhead.effect = chatState.effect ?? 0;
        overhead.modIcon = host.resolveModIcon(chatState.modIcon);
        overhead.pattern = chatState.pattern;
        const duration = chatState.duration && chatState.duration > 0 ? chatState.duration : 1;
        const remaining = Math.max(0, Math.min(duration, chatState.remaining ?? duration));
        overhead.duration = duration;
        overhead.remaining = remaining;
        overhead.life = host.computeOverheadAlpha(overhead);
        overhead.heightOffsetTiles = host.resolvePlayerLogicalHeightTiles(
            index,
            playerDefaultHeightTiles,
        );
        output.push(overhead);
    
}

export function appendActorHealthBars(host: WebGLOsrsRendererHost, 
        map: Map<number, ActorHealthBarsState>,
        serverId: number,
        kind: "player" | "npc",
        worldX: number,
        worldZ: number,
        plane: number,
        footprintRadius: number,
        baseHeightTiles: number,
        output: HealthBarEntry[],
        clientCycle: number,
        maxOutput: number,
    ): void {

        if (output.length >= maxOutput) return;
        const state = map.get(serverId);
        if (!state) return;
        const groupKey = host.makeActorGroupKey(kind === "npc", serverId);
        // Iterate from the tail of the deque.
        for (let i = state.bars.length - 1; i >= 0; i--) {
            if (output.length >= maxOutput) break;
            const bar = state.bars[i];
            const update = host.healthBarGet(bar, clientCycle);
            if (!update) {
                if (bar.updates.length === 0) {
                    state.bars.splice(i, 1);
                }
                continue;
            }
            const entry = host.acquireHealthBarEntry();
            entry.worldX = worldX;
            entry.worldZ = worldZ;
            entry.plane = plane;
            entry.footprintRadius = footprintRadius | 0;
            // Health bar at logicalHeightWithAnimationOffset + 15 units.
            // No additional offset needed - baseHeightTiles already includes the +15 offset
            entry.heightOffsetTiles = baseHeightTiles ?? 0;
            entry.health = update.health | 0;
            entry.health2 = update.health2 | 0;
            entry.cycle = update.cycle | 0;
            entry.cycleOffset = update.cycleOffset | 0;
            entry.defId = bar.def.defId | 0;
            entry.groupKey = groupKey;
            output.push(entry);
        }
        if (state.bars.length === 0) {
            map.delete(serverId);
        }
    
}

export function mapOverheadColor(host: WebGLOsrsRendererHost, rawColor: number | undefined): number {

        if (rawColor == null) return DEFAULT_OVERHEAD_CHAT_COLOR >>> 0;
        const colorId = rawColor | 0;
        if (colorId >= 0 && colorId < OVERHEAD_CHAT_COLOR_TABLE.length) {
            return OVERHEAD_CHAT_COLOR_TABLE[colorId] >>> 0;
        }
        if (colorId > 0) {
            return colorId >>> 0;
        }
        return DEFAULT_OVERHEAD_CHAT_COLOR >>> 0;
    
}

export function resolveModIcon(host: WebGLOsrsRendererHost, modIcon: number | undefined): number | undefined {

        if (modIcon == null) return undefined;
        const idx = modIcon | 0;
        return idx >= 0 ? idx : undefined;
    
}

export function getSequenceVerticalOffsetTiles(host: WebGLOsrsRendererHost, seqId: number | undefined): number {

        const id = seqId == null ? -1 : seqId | 0;
        if (id < 0) return 0;
        try {
            const seqType = host.osrsClient.seqTypeLoader?.load?.(id) as
                | { verticalOffset?: number }
                | undefined;
            const offset = (seqType?.verticalOffset ?? 0) | 0;
            return offset / 128.0;
        } catch {
            return 0;
        }
    
}

export function resolvePlayerAnimationHeightOffsetTiles(host: WebGLOsrsRendererHost, index: number): number {

        const playerEcs = host.osrsClient.playerEcs;
        const actionSeqId =
            playerEcs.getAnimActionSeqId?.(index) ?? playerEcs.getAnimSeqId?.(index) ?? -1;
        const actionDelay = playerEcs.getAnimSeqDelay?.(index) ?? 0;
        if ((actionSeqId | 0) >= 0 && (actionDelay | 0) === 0) {
            return host.getSequenceVerticalOffsetTiles(actionSeqId);
        }
        const movementSeqId = playerEcs.getAnimMovementSeqId?.(index) ?? -1;
        return host.getSequenceVerticalOffsetTiles(movementSeqId);
    
}

export function resolvePlayerLogicalHeightTiles(host: WebGLOsrsRendererHost, index: number, fallback?: number): number {

        const ecsHeight = host.osrsClient.playerEcs.getDefaultHeightTiles?.(index);
        const base =
            typeof ecsHeight === "number" && Number.isFinite(ecsHeight) && ecsHeight > 0
                ? ecsHeight
                : typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0
                    ? fallback
                    : host.playerDefaultHeightTiles;
        return Math.max(0.5, base + host.resolvePlayerAnimationHeightOffsetTiles(index));
    
}

export function resolvePlayerHitsplatOffset(host: WebGLOsrsRendererHost, index: number, fallback?: number): number {

        return host.resolvePlayerLogicalHeightTiles(index, fallback) * 0.5;
    
}

export function resolvePlayerHeadIconOffset(host: WebGLOsrsRendererHost, index: number, fallback?: number): number {

        // OSRS actor2d draws player icons at logicalHeight + 15 world units.
        return host.resolvePlayerLogicalHeightTiles(index, fallback) + 15 / 128;
    
}

export function computeOverheadAlpha(host: WebGLOsrsRendererHost, entry: OverheadTextEntry): number {

        if (entry.duration <= 0) return 1;
        return entry.remaining > 0 ? 1 : 0;
    
}

export function getNpcTypeIdForServer(host: WebGLOsrsRendererHost, serverId: number): number | undefined {

        try {
            const ecs = host.osrsClient.npcEcs;
            const ecsId = ecs.getEcsIdForServer(serverId);
            if (ecsId === undefined) return undefined;
            return ecs.getNpcTypeId(ecsId) | 0;
        } catch {
            return undefined;
        }
    
}

export function estimateNpcMaxHp(host: WebGLOsrsRendererHost, npcTypeId: number | undefined): number {

        let estimate = DEFAULT_NPC_HEALTH;
        if (typeof npcTypeId === "number" && npcTypeId >= 0) {
            try {
                const loader = host.osrsClient.npcTypeLoader;
                const type = loader?.load?.(npcTypeId);
                if (type) {
                    const params = type.params;
                    const hpParam =
                        params && typeof params.get === "function" ? params.get(10) : undefined;
                    if (typeof hpParam === "number" && hpParam > 0) {
                        estimate = Math.max(estimate, hpParam | 0);
                    }
                    const combat = type.combatLevel | 0;
                    if (combat > 0) {
                        estimate = Math.max(estimate, Math.round(combat * 1.5 + 10));
                    }
                    const size = type.size | 0;
                    if (size > 1) {
                        estimate = Math.max(estimate, estimate + size * 10);
                    }
                }
            } catch {}
        }
        return Math.min(MAX_ESTIMATED_HEALTH, Math.max(10, estimate));
    
}

export function trimHealthBars(host: WebGLOsrsRendererHost, tick: number): void {

        host.trimActorHealthBars(host.playerHealthBars, tick, { kind: "player" });
        host.trimActorHealthBars(host.npcHealthBars, tick, { kind: "npc" });
    
}

export function registerPlayerHealthBarUpdate(host: WebGLOsrsRendererHost, event: {
        serverId: number;
        bar: {
            id: number;
            cycle: number;
            health: number;
            health2: number;
            cycleOffset: number;
            removed?: boolean;
        };
    }): void {

        const serverId = event.serverId | 0;
        if (serverId <= 0) return;
        const bar = event.bar;
        const defId = bar.id | 0;
        const actor = host.playerHealthBars.get(serverId);
        if (bar.removed === true) {
            if (!actor) return;
            host.actorRemoveHealthBar(actor, defId);
            if (actor.bars.length === 0) host.playerHealthBars.delete(serverId);
            return;
        }

        const state = actor ?? host.ensureActorHealthBars(host.playerHealthBars, serverId);
        host.actorAddHealthBar(state, defId, {
            cycle: bar.cycle | 0,
            health: bar.health | 0,
            health2: bar.health2 | 0,
            cycleOffset: bar.cycleOffset | 0,
        });
    
}
