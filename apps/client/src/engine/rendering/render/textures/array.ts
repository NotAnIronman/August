import {
    PicoGL
} from "picogl";

import { createTextureArray } from "@client/engine/rendering/picogl/PicoTexture";
import { getMaxAnisotropy,TEXTURE_SIZE,TextureFilterMode } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function initTextureArray(host: WebGLOsrsRendererHost, ) {

        if (host.textureArray) {
            host.textureArray.delete();
            host.textureArray = undefined;
        }
        host.loadedTextureIds.clear();
        host.textureLayerCount = host.textureIds.length + 1;

        console.time("load textures");

        const pixelCount = TEXTURE_SIZE * TEXTURE_SIZE;

        const textureCount = host.textureIds.length;
        const pixels = new Int32Array(host.textureLayerCount * pixelCount);

        // Initialize ALL layers to white so missing textures don't render black
        // Layer 0 remains white (non-textured faces sample this)
        pixels.fill(0xffffffff);

        const cacheInfo = host.osrsClient.loadedCache?.info;
        if (!cacheInfo) return;

        let maxPreloadTextures = textureCount;
        // we should check if the texture loader is procedural instead
        if (cacheInfo.game === "runescape" && cacheInfo.revision >= 508) {
            maxPreloadTextures = 64;
        }

        for (let i = 0; i < Math.min(textureCount, maxPreloadTextures); i++) {
            const textureId = host.textureIds[i];
            try {
                const texturePixels = host.osrsClient.textureLoader.getPixelsArgb(
                    textureId,
                    TEXTURE_SIZE,
                    true,
                    1.0,
                );
                pixels.set(texturePixels, (i + 1) * pixelCount);
            } catch (e) {
                console.error("Failed loading texture", textureId, e);
            }
            host.loadedTextureIds.add(textureId);
        }

        host.textureArray = createTextureArray(
            host.app,
            new Uint8Array(pixels.buffer),
            TEXTURE_SIZE,
            TEXTURE_SIZE,
            textureCount + 1,
            {},
        );

        host.updateTextureFiltering();

        console.timeEnd("load textures");
    
}

export function updateTextureFiltering(host: WebGLOsrsRendererHost, ): void {

        if (!host.textureArray) {
            throw new Error("Texture array is not initialized");
        }

        host.textureArray.bind(0);

        if (host.textureFilterMode === TextureFilterMode.DISABLED) {
            host.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MIN_FILTER,
                PicoGL.NEAREST,
            );
            host.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MAG_FILTER,
                PicoGL.NEAREST,
            );
        } else if (host.textureFilterMode === TextureFilterMode.BILINEAR) {
            host.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MIN_FILTER,
                PicoGL.LINEAR_MIPMAP_NEAREST,
            );
            host.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MAG_FILTER,
                PicoGL.LINEAR,
            );
        } else {
            host.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MIN_FILTER,
                PicoGL.LINEAR_MIPMAP_LINEAR,
            );
            host.gl.texParameteri(
                PicoGL.TEXTURE_2D_ARRAY,
                PicoGL.TEXTURE_MAG_FILTER,
                PicoGL.LINEAR,
            );
        }

        const maxAnisotropy = Math.min(
            getMaxAnisotropy(host.textureFilterMode),
            PicoGL.WEBGL_INFO.MAX_TEXTURE_ANISOTROPY,
        );

        host.gl.texParameteri(
            PicoGL.TEXTURE_2D_ARRAY,
            PicoGL.TEXTURE_MAX_ANISOTROPY_EXT,
            maxAnisotropy,
        );
    
}

export function updateTextureArray(host: WebGLOsrsRendererHost, textures: Map<number, Int32Array>): void {

        if (!host.textureArray) {
            throw new Error("Texture array is not initialized");
        }
        let updatedCount = 0;
        host.textureArray.bind(0);
        for (const [id, pixels] of textures) {
            if (host.loadedTextureIds.has(id)) {
                continue;
            }
            const index = (host.textureIdIndexMap.get(id) ?? -1) + 1;
            if (index <= 0) {
                // Unknown texture id for this array; skip to avoid overwriting the base white layer
                continue;
            }

            host.gl.texSubImage3D(
                PicoGL.TEXTURE_2D_ARRAY,
                0,
                0,
                0,
                index,
                TEXTURE_SIZE,
                TEXTURE_SIZE,
                1,
                PicoGL.RGBA,
                PicoGL.UNSIGNED_BYTE,
                new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
            );
            host.loadedTextureIds.add(id);
            updatedCount++;
        }
        if (updatedCount > 0) {
            // Mipmap generation for a large TEXTURE_2D_ARRAY is expensive and can stall hard.
            // Defer it and amortize across frames while maps are streaming in.
            const now = performance.now();
            host.textureMipmapsDirty = true;
            host.textureMipmapsDirtyAtMs = now;
            host.textureMipmapsDirtyUpdates += updatedCount;
        }
    
}

export function maybeRegenerateTextureMipmaps(host: WebGLOsrsRendererHost, nowMs: number): void {

        if (!host.textureMipmapsDirty || !host.textureArray) return;
        if (host.textureFilterMode === TextureFilterMode.DISABLED) {
            // No mipmaps required for nearest sampling.
            host.textureMipmapsDirty = false;
            host.textureMipmapsDirtyUpdates = 0;
            return;
        }

        // Only regenerate when texture streaming settles a bit, or periodically if it never fully settles.
        const quietForMs = nowMs - host.textureMipmapsDirtyAtMs;
        const sinceLastGenMs = nowMs - host.textureMipmapsLastGenAtMs;
        const shouldGen =
            (quietForMs > 250 && !host.hasPendingMapStreamingWork()) ||
            (sinceLastGenMs > 750 && host.textureMipmapsDirtyUpdates >= 8);

        if (!shouldGen) return;

        try {
            host.textureArray.bind(0);
            host.gl.generateMipmap(PicoGL.TEXTURE_2D_ARRAY);
            host.textureMipmapsDirty = false;
            host.textureMipmapsDirtyUpdates = 0;
            host.textureMipmapsLastGenAtMs = nowMs;
        } catch (e) {
            // If mipmap regen fails for any reason, keep it dirty and try again later.
            console.warn("Texture mipmap regeneration failed", e);
        }
    
}
