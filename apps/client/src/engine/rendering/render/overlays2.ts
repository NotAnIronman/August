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

export function addHitSplatOsrs(host: WebGLOsrsRendererHost, 
        state: ActorHitsplatState,
        type: number,
        value: number,
        type2: number,
        value2: number,
        currentCycle: number,
        delayCycles: number,
    ): void {

        // Mirror Actor.addHitSplat exactly
        let allExpired = true; // var7
        let allActive = true; // var8
        for (let i = 0; i < 4; i++) {
            if ((state.hitSplatCycles[i] | 0) > (currentCycle | 0)) {
                allExpired = false;
            } else {
                allActive = false;
            }
        }

        let slot = -1; // var9
        let compareType = -1;
        let displayCycles = 0;
        if ((type | 0) >= 0) {
            const def = host.hitsplatOverlay?.getDefinition?.(type | 0);
            if (def) {
                compareType = (def.compareType ?? -1) | 0;
                displayCycles = (def.displayCycles ?? 70) | 0;
            } else {
                compareType = -1;
                displayCycles = 70;
            }
        }

        if (allActive) {
            // All 4 slots are active, need to replace one based on compareType
            if ((compareType | 0) === -1) {
                return; // No replacement priority defined, skip this hitsplat
            }
            slot = 0;
            let best = 0;
            // compareType 0 = replace oldest (lowest cycle), 1 = replace lowest damage
            if ((compareType | 0) === 0) best = state.hitSplatCycles[0] | 0;
            else if ((compareType | 0) === 1) best = state.hitSplatValues[0] | 0;
            for (let i = 1; i < 4; i++) {
                if ((compareType | 0) === 0) {
                    const v = state.hitSplatCycles[i] | 0;
                    if (v < best) {
                        slot = i;
                        best = v;
                    }
                } else if ((compareType | 0) === 1) {
                    const v = state.hitSplatValues[i] | 0;
                    if (v < best) {
                        slot = i;
                        best = v;
                    }
                }
            }
            // If compareType=1 and new value is <= existing lowest, don't replace
            if ((compareType | 0) === 1 && (best | 0) >= (value | 0)) {
                return;
            }
        } else {
            // At least one slot is expired, find an empty one
            if (allExpired) {
                state.hitSplatCount = 0;
            }
            for (let i = 0; i < 4; i++) {
                const idx = state.hitSplatCount & 3;
                state.hitSplatCount = (state.hitSplatCount + 1) & 3;
                if ((state.hitSplatCycles[idx] | 0) <= (currentCycle | 0)) {
                    slot = idx;
                    break;
                }
            }
        }

        if (slot >= 0) {
            state.hitSplatTypes[slot] = type | 0;
            state.hitSplatValues[slot] = value | 0;
            state.hitSplatTypes2[slot] = type2 | 0;
            state.hitSplatValues2[slot] = value2 | 0;
            // OSRS: hitSplatCycles[slot] = currentCycle + displayCycles + delayCycles
            // This stores the END cycle (when hitsplat expires)
            // Start visibility = hitSplatCycles - displayCycles (calculated at render time)
            state.hitSplatCycles[slot] = (currentCycle + displayCycles + delayCycles) | 0;
        }
    
}

export function getHitsplatVisibility(host: WebGLOsrsRendererHost, 
        state: ActorHitsplatState,
        slot: number,
        clientCycle: number,
    ): number | undefined {

        const endCycle = state.hitSplatCycles[slot] | 0;
        const type = state.hitSplatTypes[slot] | 0;

        // Type < 0 means unused slot
        if (type < 0) return undefined;

        // Check if expired: hitSplatCycles <= currentCycle
        if (endCycle <= clientCycle) return undefined;

        // Get displayCycles from definition
        const def = host.hitsplatOverlay?.getDefinition?.(type);
        const displayCycles = (def?.displayCycles ?? 70) | 0;

        // Calculate start cycle: endCycle - displayCycles
        const startCycle = endCycle - displayCycles;

        // Check if not yet visible: startCycle > currentCycle
        if (startCycle > clientCycle) return undefined;

        // Calculate animation progress (0 = just started, 1 = about to expire)
        // remainingCycles = endCycle - currentCycle
        // elapsedCycles = displayCycles - remainingCycles = currentCycle - startCycle
        // animProgress = elapsedCycles / displayCycles
        const remainingCycles = endCycle - clientCycle;
        const elapsedCycles = displayCycles - remainingCycles;
        const animProgress = Math.max(0, Math.min(1, elapsedCycles / displayCycles));

        return animProgress;
    
}

export function trimHitsplats(host: WebGLOsrsRendererHost, tick: number): void {

        const playerEcs = host.osrsClient.playerEcs;
        const controlledId = host.getEffectiveControlledPlayerId();
        for (const [playerId, state] of host.playerHitsplats) {
            let active = false;
            for (let i = 0; i < 4; i++) {
                if ((state.hitSplatCycles[i] | 0) > (tick | 0)) {
                    active = true;
                    break;
                }
            }
            const isControlledPlayer = controlledId > 0 && (playerId | 0) === controlledId;
            const missingEcsEntry = playerEcs.getIndexForServerId(playerId) === undefined;
            if (!active || (missingEcsEntry && !isControlledPlayer)) {
                host.playerHitsplats.delete(playerId);
            }
        }
        const npcEcs = host.osrsClient.npcEcs;
        for (const [serverId, state] of host.npcHitsplats) {
            let active = false;
            for (let i = 0; i < 4; i++) {
                if ((state.hitSplatCycles[i] | 0) > (tick | 0)) {
                    active = true;
                    break;
                }
            }
            const ecsId = npcEcs.getEcsIdForServer(serverId);
            if (!active || ecsId === undefined || !npcEcs.isActive(ecsId)) {
                host.npcHitsplats.delete(serverId);
            }
        }
    
}

export function resolveHealthBarDefinition(host: WebGLOsrsRendererHost, defId: number): HealthBarDefinitionState {

        const def = host.healthBarOverlay?.getDefinition?.(defId | 0);
        return {
            defId: defId | 0,
            int1: (def?.int1 ?? 255) | 0,
            int2: (def?.int2 ?? 255) | 0,
            int3: (def?.int3 ?? -1) | 0,
            stepIncrement: (def?.stepIncrement ?? 1) | 0,
            int5: (def?.int5 ?? 70) | 0,
            width: Math.max(1, Math.min(255, def?.width ?? 30)) | 0,
            widthPadding: Math.max(0, def?.widthPadding ?? 0) | 0,
        };
    
}

export function ensureActorHealthBars(host: WebGLOsrsRendererHost, 
        map: Map<number, ActorHealthBarsState>,
        serverId: number,
    ): ActorHealthBarsState {

        let state = map.get(serverId);
        if (state) return state;
        state = createActorHealthBarsState();
        map.set(serverId, state);
        return state;
    
}

export function healthBarPut(host: WebGLOsrsRendererHost, bar: HealthBarBarState, update: HealthBarUpdateState): void {

        const cycle = update.cycle | 0;
        // Update existing entry at the same cycle.
        for (let i = 0; i < bar.updates.length; i++) {
            if ((bar.updates[i].cycle | 0) === cycle) {
                bar.updates[i] = update;
                return;
            }
        }
        // Insert to keep ascending order by cycle (oldest first).
        let insert = bar.updates.length;
        for (let i = 0; i < bar.updates.length; i++) {
            if ((bar.updates[i].cycle | 0) > cycle) {
                insert = i;
                break;
            }
        }
        bar.updates.splice(insert, 0, update);
        // keep at most 4 updates; drop the oldest.
        if (bar.updates.length > 4) bar.updates.shift();
    
}

export function healthBarGet(host: WebGLOsrsRendererHost, 
        bar: HealthBarBarState,
        clientCycle: number,
    ): HealthBarUpdateState | undefined {

        const now = clientCycle | 0;
        if (bar.updates.length === 0) return undefined;
        if ((bar.updates[0].cycle | 0) > now) return undefined;
        // Promote to the newest update with cycle <= now by removing older entries.
        while (bar.updates.length > 1 && (bar.updates[1].cycle | 0) <= now) {
            bar.updates.shift();
        }
        const current = bar.updates[0];
        const def = bar.def;
        // HealthBarDefinition timings are defined in client cycles (20ms).
        if ((def.int5 | 0) + (current.cycleOffset | 0) + (current.cycle | 0) <= now) {
            bar.updates.shift();
            return undefined;
        }
        return current;
    
}

export function actorAddHealthBar(host: WebGLOsrsRendererHost, 
        state: ActorHealthBarsState,
        defId: number,
        update: HealthBarUpdateState,
    ): void {

        const bars = state.bars;
        // Existing bar -> update its timeline.
        for (const b of bars) {
            if ((b.def.defId | 0) === (defId | 0)) {
                host.healthBarPut(b, update);
                return;
            }
        }

        const def = host.resolveHealthBarDefinition(defId);
        const existingCount = bars.length | 0;
        // only add a 5th bar if we can evict an existing bar with int2 > new.int2
        // (Actor.addHealthBar).
        let removable: HealthBarBarState | undefined = undefined;
        let maxInt2 = def.int2 | 0;
        for (const b of bars) {
            const int2 = b.def.int2 | 0;
            if (int2 > maxInt2) {
                maxInt2 = int2;
                removable = b;
            }
        }
        if (existingCount >= 4 && !removable) return;

        const newBar: HealthBarBarState = { def, updates: [] };
        // Keep bars sorted by definition.int1 descending (Actor.addHealthBar).
        let insertIndex = bars.length;
        for (let i = 0; i < bars.length; i++) {
            if ((bars[i].def.int1 | 0) <= (def.int1 | 0)) {
                insertIndex = i;
                break;
            }
        }
        bars.splice(insertIndex, 0, newBar);

        // If we exceeded the cap, remove the bar with the highest int2.
        if (existingCount >= 4 && removable) {
            const idx = bars.indexOf(removable);
            if (idx >= 0) bars.splice(idx, 1);
        }

        host.healthBarPut(newBar, update);
    
}

export function actorRemoveHealthBar(host: WebGLOsrsRendererHost, state: ActorHealthBarsState, defId: number): void {

        const bars = state.bars;
        for (let i = 0; i < bars.length; i++) {
            if ((bars[i].def.defId | 0) === (defId | 0)) {
                bars.splice(i, 1);
                return;
            }
        }
    
}
