import {
    DrawCall,
    PicoGL
} from "picogl";

import { clamp } from "@august/game-model/math/MathUtil";
import {
    isTouchDevice
} from "@client/core/platform/device/DeviceUtil";
import { DrawRange } from "@client/engine/rendering/DrawRange";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

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
