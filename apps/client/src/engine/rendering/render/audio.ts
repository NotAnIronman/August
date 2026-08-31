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
import type { AmbientSoundInstance } from "@client/engine/audio/SoundEffectSystem";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";

export function addAmbientSoundInstance(host: WebGLOsrsRendererHost, 
        locId: number,
        soundType: any,
        x: number,
        y: number,
        z: number,
        orientation: number,
        sizeX: number,
        sizeY: number,
    ): void {

        const idx = host.ambientSoundBufferIndex;
        const buffer = host.ambientSoundBuffer;

        // Reuse existing object or create new one
        let inst = buffer[idx];
        if (!inst) {
            inst = {} as AmbientSoundInstance;
            buffer[idx] = inst;
        }

        // Update all properties
        inst.locId = locId;
        inst.soundId = soundType ? soundType.ambientSoundId : -1;
        inst.x = x;
        inst.y = y;
        inst.z = z;
        inst.maxDistance = soundType ? soundType.soundMaxDistance : 0;
        inst.minDistance = soundType ? soundType.soundMinDistance : 0;
        inst.changeTicksMin = soundType ? soundType.ambientSoundChangeTicksMin : 0;
        inst.changeTicksMax = soundType ? soundType.ambientSoundChangeTicksMax : 0;
        inst.soundIds = soundType ? soundType.ambientSoundIds : undefined;
        inst.sizeX = sizeX;
        inst.sizeY = sizeY;
        inst.orientation = orientation;
        inst.fadeInDurationMs = (soundType && soundType.soundFadeInDuration) || undefined;
        inst.fadeOutDurationMs = (soundType && soundType.soundFadeOutDuration) || undefined;
        inst.fadeInCurve = (soundType && soundType.soundFadeInCurve) || undefined;
        inst.fadeOutCurve = (soundType && soundType.soundFadeOutCurve) || undefined;
        inst.distanceFadeCurve = (soundType && soundType.soundDistanceFadeCurve) || undefined;
        inst.distanceOverride = soundType
            ? (soundType.soundAreaRadiusOverride ?? undefined)
            : undefined;
        inst.loopSequentially = soundType ? soundType.loopMultiSoundSequentially : false;
        inst.deferSwap = soundType ? soundType.deferredAmbientSwap : false;
        inst.exactPosition = soundType ? soundType.useExactSoundPosition : false;
        inst.resetOnLoop = soundType ? soundType.resetAmbientOnLoopRestart : false;

        host.ambientSoundBufferIndex = idx + 1;
    
}

export function locTypeHasSound(locType: any): boolean{

        return (
            !!locType &&
            (locType.ambientSoundId !== -1 ||
                (locType.ambientSoundIds && locType.ambientSoundIds.length > 0))
        );
    
}

export function locHasSoundPotential(host: WebGLOsrsRendererHost, locId: number): boolean {

        const cached = host.locSoundPotentialCache.get(locId);
        if (cached !== undefined) return cached;
        let result = false;
        const locType = host.osrsClient.locTypeLoader.load(locId);
        if (locType) {
            result = locTypeHasSound(locType);
            if (!result && locType.transforms) {
                for (const transformId of locType.transforms) {
                    if (transformId === -1) continue;
                    const transformed = host.osrsClient.locTypeLoader.load(transformId);
                    if (locTypeHasSound(transformed)) {
                        result = true;
                        break;
                    }
                }
            }
        }
        host.locSoundPotentialCache.set(locId, result);
        return result;
    
}

export function getMapSoundEmitters(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
    ): { locId: number; x: number; y: number; level: number; rot: number }[] {

        if (map.ambientSoundEmitters) return map.ambientSoundEmitters;

        const emitters: { locId: number; x: number; y: number; level: number; rot: number }[] = [];
        const mapBaseX = map.mapX * 64;
        const mapBaseY = map.mapY * 64;
        const offsetsByLevel = map.tileLocOffsetsByLevel;
        const idsByLevel = map.tileLocIdsByLevel;
        const typeRotsByLevel = map.tileLocTypeRotByLevel;

        if (offsetsByLevel && idsByLevel) {
            for (let level = 0; level < offsetsByLevel.length; level++) {
                const offsets = offsetsByLevel[level];
                const ids = idsByLevel[level];
                if (!offsets || !ids || offsets.length < 2) continue;
                const typeRots = typeRotsByLevel?.[level];
                const span = Math.round(Math.sqrt(offsets.length - 1));

                for (let localY = 0; localY < span; localY++) {
                    for (let localX = 0; localX < span; localX++) {
                        const tileIdx = localY * span + localX;
                        const start = offsets[tileIdx] | 0;
                        const end = offsets[tileIdx + 1] | 0;
                        for (let i = start; i < end; i++) {
                            const locId = ids[i] | 0;
                            if (!host.locHasSoundPotential(locId)) continue;
                            const packed = typeRots ? typeRots[i] | 0 : 0;
                            emitters.push({
                                locId,
                                x: (mapBaseX + localX) * 128 + 64,
                                y: (mapBaseY + localY) * 128 + 64,
                                level,
                                rot: (packed >> 6) & 3,
                            });
                        }
                    }
                }
            }
        }

        map.ambientSoundEmitters = emitters;
        return emitters;
    
}

export function addAmbientEmitter(host: WebGLOsrsRendererHost, 
        locId: number,
        x: number,
        y: number,
        level: number,
        rot: number,
    ): void {

        const baseType = host.osrsClient.locTypeLoader.load(locId);
        if (!baseType) return;

        // Resolve varbit transforms for the active sound fields; the emitter
        // persists with no sound while the active transform is silent so it
        // can fade between states without losing loop phase or timers.
        let soundType: any = baseType;
        if (baseType.transforms) {
            soundType = baseType.transform(
                host.osrsClient.varManager,
                host.osrsClient.locTypeLoader,
            );
        }
        if (soundType && !locTypeHasSound(soundType)) {
            soundType = undefined;
        }

        host.addAmbientSoundInstance(
            locId,
            soundType,
            x,
            y,
            level * 128,
            rot,
            baseType.sizeX || 1,
            baseType.sizeY || 1,
        );
    
}

export function collectAmbientSounds(host: WebGLOsrsRendererHost, map: WebGLMapSquare): void {

        // Animated locs (sparse, iterate all levels)
        if (map.locsAnimated) {
            for (const loc of map.locsAnimated) {
                if (!host.locHasSoundPotential(loc.id)) continue;
                host.addAmbientEmitter(loc.id, loc.x, loc.y, loc.level, loc.rotation);
            }
        }

        // Static locs from the cached per-map emitter list
        const emitters = host.getMapSoundEmitters(map);
        for (let i = 0; i < emitters.length; i++) {
            const emitter = emitters[i];
            host.addAmbientEmitter(emitter.locId, emitter.x, emitter.y, emitter.level, emitter.rot);
        }
    
}
