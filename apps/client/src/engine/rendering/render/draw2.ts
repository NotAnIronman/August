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

export function updateActorDataTexture(host: WebGLOsrsRendererHost, ) {

        const texWidth = 16;
        // 2 texels per actor (position + HSL override data)
        const texelCount = host.actorRenderCount * 2;
        const texHeight = Math.max(Math.ceil(texelCount / texWidth), 1);

        // PicoGL allocates immutable storage via texStorage2D, so the upload buffer must be large enough
        // for the full texture (including padding to the 16-wide grid), not just actorRenderCount entries.
        const requiredU16 = texWidth * texHeight * 4;
        if (host.actorRenderData.length < requiredU16) {
            const newData = new Uint16Array(requiredU16);
            newData.set(host.actorRenderData);
            host.actorRenderData = newData;
        }
        // Ensure padding texels (up to the next 16-wide row) don't leak stale values.
        const writtenU16 = (host.actorRenderCount * 8) | 0;
        if (writtenU16 < requiredU16) {
            host.actorRenderData.fill(0, writtenU16, requiredU16);
        }

        // Compute checksum over actual actor data to detect changes
        let checksum = host.actorRenderCount | 0;
        const data = host.actorRenderData;
        const len = writtenU16 | 0;
        for (let i = 0; i < len; i++) {
            checksum = (checksum * 31 + data[i]) | 0;
        }

        // If data hasn't changed and texture size matches, reuse current texture
        const currentTex = host.actorDataTextures[host.actorDataCurrentIndex];
        if (
            checksum === host.actorDataChecksum &&
            texHeight === host.actorDataLastTexHeight &&
            currentTex
        ) {
            // Keep legacy buffer in sync for any code that references it
            host.actorDataTextureBuffer[0] = currentTex;
            return 0;
        }

        // Data changed - write to the OTHER texture, then swap
        host.actorDataChecksum = checksum;
        host.actorDataLastTexHeight = texHeight;

        const writeIndex = 1 - host.actorDataCurrentIndex;
        const uploadView = host.actorRenderData.subarray(0, requiredU16);

        let writeTex = host.actorDataTextures[writeIndex];
        if (!writeTex) {
            writeTex = host.app.createTexture2D(uploadView, texWidth, texHeight, {
                internalFormat: PicoGL.RGBA16UI,
                type: PicoGL.UNSIGNED_SHORT,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
                wrapS: PicoGL.CLAMP_TO_EDGE,
                wrapT: PicoGL.CLAMP_TO_EDGE,
            });
            host.actorDataTextures[writeIndex] = writeTex;
        } else {
            writeTex.resize(texWidth, texHeight);
            writeTex.data(uploadView);
        }

        // Swap: the texture we just wrote becomes the current one
        host.actorDataCurrentIndex = writeIndex;

        // Keep legacy buffer in sync for any code that references it
        host.actorDataTextureBuffer[0] = writeTex;
        return 0;
    
}

export function _accumulate(host: WebGLOsrsRendererHost, drawRanges: DrawRange[], length?: number): void {

        // Count batches and indices
        const len = length ?? drawRanges.length;
        host._frameBatches += len;
        for (let i = 0; i < len; i++) {
            const r = drawRanges[i] as DrawRange;
            const count = (r?.[1] ?? 0) * (r?.[2] ?? 1);
            host._frameIndices += count;
        }
    
}

export function configureDrawCall(host: WebGLOsrsRendererHost, drawCall: DrawCall): DrawCall {

        return host.drawBackend ? host.drawBackend.configureDrawCall(drawCall) : drawCall;
    
}

export function draw(host: WebGLOsrsRendererHost, drawCall: DrawCall, drawRanges: DrawRange[], drawIndices?: number[]) {

        // Accumulate stats regardless of draw path
        if (drawIndices && drawIndices.length > 0) {
            // Reuse buffer to avoid per-frame allocation
            const len = drawIndices.length;
            if (host.drawSubsetBuffer.length < len) {
                host.drawSubsetBuffer.length = len;
            }
            for (let i = 0; i < len; i++) host.drawSubsetBuffer[i] = drawRanges[drawIndices[i]];
            host._accumulate(host.drawSubsetBuffer, len);
        } else {
            host._accumulate(drawRanges);
        }

        if (host.drawBackend) {
            host.drawBackend.draw(drawCall, drawRanges, drawIndices);
        } else {
            drawCall.draw();
        }
    
}

export function drawWithRoofPlaneFilter(host: WebGLOsrsRendererHost, 
        drawCall: DrawCall,
        drawRanges: DrawRange[],
        drawRangePlanes: Uint8Array | undefined,
        roofPlaneLimit: number,
    ): void {

        const totalRanges = drawRanges.length | 0;
        host.frameRoofTotalRangeCount += totalRanges;
        if (totalRanges <= 0) {
            return;
        }

        if (!drawRangePlanes || roofPlaneLimit >= 3) {
            host.draw(drawCall, drawRanges);
            return;
        }

        const cullLimit = roofPlaneLimit | 0;
        const filtered = host.roofFilteredDrawIndices;
        filtered.length = 0;

        for (let i = 0; i < totalRanges; i++) {
            // Missing plane metadata should never happen, but default to visible to avoid
            // accidentally dropping geometry.
            const plane = i < drawRangePlanes.length ? drawRangePlanes[i] : 0;
            if (plane <= cullLimit) {
                filtered.push(i);
            }
        }

        const visibleRanges = filtered.length | 0;
        host.frameRoofFilteredRangeCount += Math.max(0, totalRanges - visibleRanges);
        if (visibleRanges <= 0) {
            return;
        }
        if (visibleRanges >= totalRanges) {
            host.draw(drawCall, drawRanges);
            return;
        }
        host.draw(drawCall, drawRanges, filtered);
    
}

export function getMapTileDistanceFromPoint(host: WebGLOsrsRendererHost, map: WebGLMapSquare, tileX: number, tileY: number): number {

        // World entity overlays use baseWorldX/Y for distance instead of mapX/Y
        const mapMinTileX = map.getRenderBaseTileX();
        const mapMinTileY = map.getRenderBaseTileY();
        const mapTileSpan = map.getLocalTileSpan();
        const mapMaxTileX = mapMinTileX + mapTileSpan - 1;
        const mapMaxTileY = mapMinTileY + mapTileSpan - 1;
        const dx =
            tileX < mapMinTileX
                ? mapMinTileX - tileX
                : tileX > mapMaxTileX
                    ? tileX - mapMaxTileX
                    : 0;
        const dy =
            tileY < mapMinTileY
                ? mapMinTileY - tileY
                : tileY > mapMaxTileY
                    ? tileY - mapMaxTileY
                    : 0;
        return Math.max(dx, dy);
    
}

export function getMapZoneDistanceFromPoint(host: WebGLOsrsRendererHost, map: WebGLMapSquare, tileX: number, tileY: number): number {

        // OSRS scene visibility is zone-based (8x8 tiles), not map-square based.
        const zoneX = tileX >> 3;
        const zoneY = tileY >> 3;
        const bwx = (map as any).baseWorldX;
        const bwy = (map as any).baseWorldY;
        const mapMinZoneX = bwx != null ? (bwx | 0) >> 3 : map.mapX << 3;
        const mapMinZoneY = bwy != null ? (bwy | 0) >> 3 : map.mapY << 3;
        const mapMaxZoneX = mapMinZoneX + 7;
        const mapMaxZoneY = mapMinZoneY + 7;
        const dx =
            zoneX < mapMinZoneX
                ? mapMinZoneX - zoneX
                : zoneX > mapMaxZoneX
                    ? zoneX - mapMaxZoneX
                    : 0;
        const dy =
            zoneY < mapMinZoneY
                ? mapMinZoneY - zoneY
                : zoneY > mapMaxZoneY
                    ? zoneY - mapMaxZoneY
                    : 0;
        return Math.max(dx, dy);
    
}

export function isMapWithinRenderDistance(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        tileX: number,
        tileY: number,
        renderDistanceTiles: number,
        renderDistancePadTiles: number,
    ): boolean {

        const zoneDistance = host.getMapZoneDistanceFromPoint(map, tileX, tileY);
        const renderDistanceZones = Math.max(
            0,
            Math.ceil((renderDistanceTiles + renderDistancePadTiles) / 8),
        );
        return zoneDistance <= renderDistanceZones;
    
}

export function resolveEffectiveRenderDistanceTiles(host: WebGLOsrsRendererHost, frameId: number): number {

        const base = clamp(host.osrsClient.renderDistance | 0, 25, 90);
        if ((host.effectiveRenderDistanceFrame | 0) === (frameId | 0)) {
            return host.effectiveRenderDistanceTiles | 0;
        }
        const profile = host.syncBrowserQualityProfile();
        const target = isTouchDevice ? Math.min(base, profile.renderDistanceCap | 0) : base;
        host.effectiveRenderDistanceTiles = Math.max(0, target | 0);
        host.effectiveRenderDistanceFrame = frameId | 0;
        return host.effectiveRenderDistanceTiles | 0;
    
}

export function getFrameRenderDistanceTiles(host: WebGLOsrsRendererHost, ): number {

        return host.resolveEffectiveRenderDistanceTiles(host.stats.frameCount | 0);
    
}

export function getFrameLodThresholdTiles(host: WebGLOsrsRendererHost, ): number {

        return host.resolveEffectiveLodThresholdTiles(host.stats.frameCount | 0);
    
}

export function resolveEffectiveGroundItemOverlayMaxEntries(host: WebGLOsrsRendererHost, frameId: number): number {

        if ((host.effectiveGroundItemOverlayFrame | 0) === (frameId | 0)) {
            return host.effectiveGroundItemOverlayMaxEntries | 0;
        }
        const profile = host.syncBrowserQualityProfile();
        const target = isTouchDevice ? profile.groundItemOverlayMaxEntries | 0 : 40;
        host.effectiveGroundItemOverlayMaxEntries = target;
        host.effectiveGroundItemOverlayFrame = frameId | 0;
        return target;
    
}

export function getFrameGroundItemOverlayMaxEntries(host: WebGLOsrsRendererHost, ): number {

        return host.resolveEffectiveGroundItemOverlayMaxEntries(host.stats.frameCount | 0);
    
}

export function resolveEffectiveGroundItemOverlayRadius(host: WebGLOsrsRendererHost, frameId: number): number {

        if ((host.effectiveGroundItemOverlayRadiusFrame | 0) === (frameId | 0)) {
            return host.effectiveGroundItemOverlayRadius | 0;
        }
        const profile = host.syncBrowserQualityProfile();
        const target = isTouchDevice ? profile.groundItemOverlayRadius | 0 : 12;
        host.effectiveGroundItemOverlayRadius = target;
        host.effectiveGroundItemOverlayRadiusFrame = frameId | 0;
        return target;
    
}

export function getFrameGroundItemOverlayRadius(host: WebGLOsrsRendererHost, ): number {

        return host.resolveEffectiveGroundItemOverlayRadius(host.stats.frameCount | 0);
    
}

export function getFrameHitsplatMaxEntries(host: WebGLOsrsRendererHost, ): number {

        if (!isTouchDevice) return RENDER_CONSTANTS.MAX_HIT_ENTRIES;
        return host.syncBrowserQualityProfile().hitsplatMaxEntries | 0;
    
}

export function getFrameHealthBarMaxEntries(host: WebGLOsrsRendererHost, ): number {

        if (!isTouchDevice) return 256;
        return host.syncBrowserQualityProfile().healthBarMaxEntries | 0;
    
}

export function getFrameOverheadTextMaxEntries(host: WebGLOsrsRendererHost, ): number {

        if (!isTouchDevice) return 256;
        return host.syncBrowserQualityProfile().overheadTextMaxEntries | 0;
    
}

export function getFrameOverheadPrayerMaxEntries(host: WebGLOsrsRendererHost, ): number {

        if (!isTouchDevice) return 256;
        return host.syncBrowserQualityProfile().overheadPrayerMaxEntries | 0;
    
}

export function updateAnimatedDrawRanges(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        drawCall: DrawCall,
        drawRanges: DrawRange[],
        transparent: boolean,
        isInteract: boolean,
        isLod: boolean,
    ): void {

        if (!map.locsAnimated.length) {
            return;
        }

        for (const loc of map.locsAnimated) {
            const frames = transparent ? loc.anim.framesAlpha : loc.anim.frames;
            if (!frames) {
                continue;
            }

            const frame = frames[loc.frame | 0];
            if (!frame) {
                continue;
            }

            const index = loc.getDrawRangeIndex(transparent, isInteract, isLod);
            if (index === -1) {
                continue;
            }

            drawCall.offsets[index] = frame[0];
            (drawCall as any).numElements[index] = frame[1];
            drawRanges[index] = frame;
        }
    
}
