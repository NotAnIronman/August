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

export function _resolvePlayerSeqIdForMode(host: WebGLOsrsRendererHost, ): number {

        try {
            const ecsIndex = host.osrsClient.playerEcs.getIndexForServerId(
                host.osrsClient.controlledPlayerServerId,
            );
            if (ecsIndex === undefined) return -1;
            if (host.osrsClient.playerEcs.size() <= ecsIndex) return -1;
            if (host.playerIdleSeqId >= 0) {
                return host.playerIdleSeqId | 0;
            }

            const pe: any = host.osrsClient.playerEcs as any;
            const animSeq = (key: PlayerAnimKey): number => {
                const specific = pe.getAnimSeq?.(ecsIndex, key);
                if (typeof specific === "number" && specific >= 0) return specific | 0;
                const global = host.osrsClient.serverPlayerSeqs?.[key];
                return typeof global === "number" && global >= 0 ? global | 0 : -1;
            };
            const pick = (...candidates: Array<number | undefined>): number => {
                for (const c of candidates) {
                    if (typeof c === "number" && c >= 0) return c | 0;
                }
                return -1;
            };
            const rotBase = pe.getRotation?.(ecsIndex);
            const rotFallback = rotBase ?? pe.rotation?.[ecsIndex];
            const rot: number = ((rotFallback ?? 0) as number) | 0;

            const resolveFromAnimSet = (): number => {
                // Movement blocking is handled in `PlayerEcs` (). This resolver is mode-only.
                if (host.playerAnimMode === "idle") {
                    const desired =
                        (pe.getTargetRotation?.(ecsIndex) ?? pe.targetRot?.[ecsIndex] ?? rot) | 0;
                    const delta = (desired - rot) & 2047;
                    if (delta !== 0) {
                        const rotationCounter = (pe.getRotationCounter?.(ecsIndex) ?? 0) | 0;
                        const rotationSpeed = (pe.getRotationSpeed?.(ecsIndex) ?? 32) | 0;
                        // Turn anims play while the rotation is still in progress
                        // this tick; the counter only extends them past the final
                        // snap step (the di > 25 case). Falls back to the walk
                        // animation when no idle-rotate sequence exists.
                        const stillTurning =
                            delta >= rotationSpeed && delta <= 2048 - rotationSpeed;
                        if (rotationSpeed > 0 && (stillTurning || rotationCounter > 25)) {
                            const turnSeq = pick(
                                delta > 1024 ? animSeq("turnLeft") : animSeq("turnRight"),
                                animSeq("walk"),
                            );
                            if (turnSeq >= 0) return turnSeq;
                        }
                    }
                    const idleSeq = animSeq("idle");
                    if (idleSeq >= 0) return idleSeq;
                    return -1;
                }

                const cx: number = (pe.getX?.(ecsIndex) ?? 0) | 0;
                const cy: number = (pe.getY?.(ecsIndex) ?? 0) | 0;
                const tx: number = (pe.getTargetX?.(ecsIndex) ?? cx) | 0;
                const ty: number = (pe.getTargetY?.(ecsIndex) ?? cy) | 0;
                let moveOri = rot | 0;
                if (cx < tx) {
                    if (cy < ty) moveOri = 1280;
                    else if (cy > ty) moveOri = 1792;
                    else moveOri = 1536;
                } else if (cx > tx) {
                    if (cy < ty) moveOri = 768;
                    else if (cy > ty) moveOri = 256;
                    else moveOri = 512;
                } else if (cy < ty) moveOri = 1024;
                else if (cy > ty) moveOri = 0;
                let delta = (moveOri - rot) & 2047;
                if (delta > 1024) delta -= 2048;
                const margin = 64;
                const straight = delta >= -256 - margin && delta <= 256 + margin;
                const right = delta >= 256 + margin && delta < 768 - margin;
                const left = delta <= -256 - margin && delta > -768 + margin;

                if (host.playerAnimMode === "run") {
                    return pick(
                        straight ? pick(animSeq("run"), animSeq("walk")) : undefined,
                        right
                            ? pick(
                                animSeq("runRight"),
                                animSeq("run"),
                                animSeq("walkRight"),
                                animSeq("walk"),
                            )
                            : undefined,
                        left
                            ? pick(
                                animSeq("runLeft"),
                                animSeq("run"),
                                animSeq("walkLeft"),
                                animSeq("walk"),
                            )
                            : undefined,
                        !straight && !right && !left
                            ? pick(
                                animSeq("runBack"),
                                animSeq("run"),
                                animSeq("walkBack"),
                                animSeq("walk"),
                            )
                            : undefined,
                    );
                }

                // OSRS crawl animation selection (speed <= 2)
                // Reference: player-animation.md lines 387-398
                if (host.playerAnimMode === "crawl") {
                    return pick(
                        straight ? pick(animSeq("crawl"), animSeq("walk")) : undefined,
                        right
                            ? pick(
                                animSeq("crawlRight"),
                                animSeq("crawl"),
                                animSeq("walkRight"),
                                animSeq("walk"),
                            )
                            : undefined,
                        left
                            ? pick(
                                animSeq("crawlLeft"),
                                animSeq("crawl"),
                                animSeq("walkLeft"),
                                animSeq("walk"),
                            )
                            : undefined,
                        !straight && !right && !left
                            ? pick(
                                animSeq("crawlBack"),
                                animSeq("crawl"),
                                animSeq("walkBack"),
                                animSeq("walk"),
                            )
                            : undefined,
                    );
                }

                return pick(
                    straight ? pick(animSeq("walk"), animSeq("run")) : undefined,
                    right
                        ? pick(
                            animSeq("walkRight"),
                            animSeq("walk"),
                            animSeq("runRight"),
                            animSeq("run"),
                        )
                        : undefined,
                    left
                        ? pick(
                            animSeq("walkLeft"),
                            animSeq("walk"),
                            animSeq("runLeft"),
                            animSeq("run"),
                        )
                        : undefined,
                    !straight && !right && !left
                        ? pick(
                            animSeq("walkBack"),
                            animSeq("walk"),
                            animSeq("runBack"),
                            animSeq("run"),
                        )
                        : undefined,
                );
            };

            try {
                const seqFromAnim = resolveFromAnimSet();
                if (seqFromAnim >= 0) return seqFromAnim;
            } catch {}
            try {
                const seqs = host.osrsClient.serverPlayerSeqs;
                if (seqs) {
                    // If idle but rotating, use turn sequences if provided
                    if (host.playerAnimMode === "idle") {
                        try {
                            const pe: any = host.osrsClient.playerEcs as any;
                            const rot: number =
                                (pe.getRotation?.(ecsIndex) ?? pe.rotation?.[ecsIndex] ?? 0) | 0;
                            const desired: number =
                                (pe.getTargetRotation?.(ecsIndex) ??
                                    pe.targetRot?.[ecsIndex] ??
                                    rot) | 0;
                            let delta = (desired - rot) & 2047;
                            if (delta !== 0 && typeof seqs.turnLeft === "number") {
                                const isRight = delta < 1024 && delta > 0;
                                const isLeft = !isRight;
                                if (isLeft && typeof seqs.turnLeft === "number")
                                    return seqs.turnLeft | 0;
                                if (isRight && typeof seqs.turnRight === "number")
                                    return (seqs.turnRight ?? seqs.turnLeft)! | 0;
                            }
                        } catch {}
                        if (typeof seqs.idle === "number") return seqs.idle | 0;
                    }
                    // Moving: prefer directional sequences when provided
                    try {
                        const pe: any = host.osrsClient.playerEcs as any;
                        const rot: number =
                            (pe.getRotation?.(ecsIndex) ?? pe.rotation?.[ecsIndex] ?? 0) | 0;
                        // Compute movement orientation from current position toward target step
                        const cx: number = (pe.getX?.(ecsIndex) ?? 0) | 0;
                        const cy: number = (pe.getY?.(ecsIndex) ?? 0) | 0;
                        const tx: number = (pe.getTargetX?.(ecsIndex) ?? cx) | 0;
                        const ty: number = (pe.getTargetY?.(ecsIndex) ?? cy) | 0;
                        let moveOri = rot | 0;
                        if (cx < tx) {
                            if (cy < ty) moveOri = 1280;
                            else if (cy > ty) moveOri = 1792;
                            else moveOri = 1536;
                        } else if (cx > tx) {
                            if (cy < ty) moveOri = 768;
                            else if (cy > ty) moveOri = 256;
                            else moveOri = 512;
                        } else if (cy < ty) moveOri = 1024;
                        else if (cy > ty) moveOri = 0;
                        // Direction classification with small hysteresis to reduce flicker
                        let delta = (moveOri - rot) & 2047;
                        if (delta > 1024) delta -= 2048; // [-1024,1024]
                        const margin = 64; // hysteresis margin in RS angle units
                        const straight = delta >= -256 - margin && delta <= 256 + margin;
                        const right = delta >= 256 + margin && delta < 768 - margin;
                        const left = delta <= -256 - margin && delta > -768 + margin;
                        const useRun = host.playerAnimMode === "run";
                        if (useRun) {
                            if (straight && typeof seqs.run === "number") return seqs.run | 0;
                            if (right && typeof seqs.runRight === "number")
                                return seqs.runRight | 0;
                            if (left && typeof seqs.runLeft === "number") return seqs.runLeft | 0;
                            if (typeof seqs.runBack === "number") return seqs.runBack | 0;
                        } else {
                            if (straight && typeof seqs.walk === "number") return seqs.walk | 0;
                            if (right && typeof seqs.walkRight === "number")
                                return seqs.walkRight | 0;
                            if (left && typeof seqs.walkLeft === "number") return seqs.walkLeft | 0;
                            if (typeof seqs.walkBack === "number") return seqs.walkBack | 0;
                        }
                    } catch {}
                }
            } catch {}
            try {
                const npcTypeLoader = host.osrsClient.npcTypeLoader;
                let manId = -1;
                const ncount = npcTypeLoader.getCount();
                for (let id = 0; id < ncount; id++) {
                    const t: any = npcTypeLoader.load(id);
                    if (t && typeof t.name === "string" && t.name.toLowerCase() === "man") {
                        manId = id;
                        break;
                    }
                }
                if (manId !== -1) {
                    const manType: any = npcTypeLoader.load(manId);
                    // Prefer directional sequences based on rotation delta for NPC movement
                    try {
                        const pe: any = host.osrsClient.playerEcs as any;
                        const has0 = (pe.size?.() ?? (pe as any).size?.() ?? 0) > 0;
                        if (has0) {
                            const rot: number =
                                (pe.getRotation?.(ecsIndex) ?? pe.rotation?.[ecsIndex] ?? 0) | 0;
                            // Movement orientation from step target vs current rotation
                            const cx: number = (pe.getX?.(ecsIndex) ?? 0) | 0;
                            const cy: number = (pe.getY?.(ecsIndex) ?? 0) | 0;
                            const tx: number = (pe.getTargetX?.(ecsIndex) ?? cx) | 0;
                            const ty: number = (pe.getTargetY?.(ecsIndex) ?? cy) | 0;
                            let moveOri = rot | 0;
                            if (cx < tx) {
                                if (cy < ty) moveOri = 1280;
                                else if (cy > ty) moveOri = 1792;
                                else moveOri = 1536;
                            } else if (cx > tx) {
                                if (cy < ty) moveOri = 768;
                                else if (cy > ty) moveOri = 256;
                                else moveOri = 512;
                            } else if (cy < ty) moveOri = 1024;
                            else if (cy > ty) moveOri = 0;
                            let delta = (moveOri - rot) & 2047;
                            if (delta > 1024) delta -= 2048; // [-1024,1024]
                            const margin = 64;
                            const useRun = host.playerAnimMode === "run";
                            const straight = delta >= -256 - margin && delta <= 256 + margin;
                            const right = delta >= 256 + margin && delta < 768 - margin;
                            const left = delta <= -256 - margin && delta > -768 + margin;
                            if (straight) {
                                const seq = useRun ? manType.runSeqId : manType.walkSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            } else if (right) {
                                const seq = useRun ? manType.runRightSeqId : manType.walkRightSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            } else if (left) {
                                const seq = useRun ? manType.runLeftSeqId : manType.walkLeftSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            } else {
                                const seq = useRun ? manType.runBackSeqId : manType.walkBackSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            }
                            // If idle but turning in place, prefer turn sequences where possible
                            if (!useRun) {
                                const desiredIdle = ((pe.getTargetRotation?.(ecsIndex) ??
                                    pe.targetRot?.[ecsIndex] ??
                                    rot) | 0) as number;
                                const deltaRaw = (desiredIdle - rot) & 2047;
                                if (deltaRaw !== 0) {
                                    const turnSeq =
                                        deltaRaw > 1024
                                            ? manType.turnLeftSeqId
                                            : manType.turnRightSeqId;
                                    if (typeof turnSeq === "number" && turnSeq >= 0)
                                        return turnSeq | 0;
                                }
                            }
                        }
                    } catch {}
                    if (host.playerAnimMode === "run") {
                        const runSeq = (manType as any).runSeqId ?? -1;
                        if (runSeq !== -1) return runSeq | 0;
                    }
                    if (host.playerAnimMode !== "idle") {
                        const walkSeq =
                            (manType as any).walkSeqId ??
                            manType.getWalkSeqId?.(host.osrsClient.basTypeLoader);
                        if (typeof walkSeq === "number" && walkSeq !== -1) return walkSeq | 0;
                    }
                    const idleSeq = manType.getIdleSeqId(host.osrsClient.basTypeLoader);
                    if (idleSeq !== -1) return idleSeq | 0;
                }
            } catch {}
        } catch {}
        return -1;
    
}
