import {
    PicoGL
} from "picogl";

import type { OverlayFloorType } from "@august/osrs-engine/config/floortype/OverlayFloorType";
import { createTextureArray } from "@client/engine/rendering/picogl/PicoTexture";
import { DEFAULT_WATER_MATERIAL,ICE_WATER_MATERIAL,MAX_TEXTURES,SWAMP_WATER_MATERIAL,VANILLA_WATER_SURFACE_COLORS,WATER_TEXTURE_ASSETS,WATER_TEXTURE_SIZE,WaterMaterialParams,waterRgb } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import { KNOWN_WATER_TEXTURE_IDS } from "@client/engine/rendering/water/WaterTextureIds";

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
            console.warn(
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
