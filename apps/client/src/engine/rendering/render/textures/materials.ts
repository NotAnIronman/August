import {
    PicoGL
} from "picogl";

import { MATERIAL_TEXTURE_ROWS,materialByte,WATER_FLAG_HAS_FOAM,WATER_FLAG_NORMAL_MAP_2 } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function initMaterialsTexture(host: WebGLOsrsRendererHost, ): void {

        if (host.textureMaterials) {
            host.textureMaterials.delete();
            host.textureMaterials = undefined;
        }

        const textureCount = host.textureLayerCount || 1;
        const waterTextureIds = host.collectWaterTextureIds();

        // Row 0: animU, animV, alphaCutOff, frameCount
        // Row 1: animSpeed, material flags, water flags, (unused)
        // Row 2: water surface RGB, base opacity
        // Row 3: water depth RGB, fresnel amount
        // Row 4: normal strength, specular strength, specular gloss, duration
        // Row 5: water foam RGB, (unused)
        const data = new Int8Array(textureCount * MATERIAL_TEXTURE_ROWS * 4);
        data[3] = 1; // frameCount for fallback layer 0

        for (let i = 0; i < host.textureIds.length; i++) {
            const id = host.textureIds[i];
            try {
                const material = host.osrsClient.textureLoader.getMaterial(id);
                const frameCount = host.textureFrameCounts.get(id) ?? material.frameCount ?? 1;
                const baseLayer = host.textureIdIndexMap.get(id) ?? 0;

                for (
                    let frame = 0;
                    frame < frameCount && baseLayer + frame < textureCount;
                    frame++
                ) {
                    const layerIndex = baseLayer + frame;
                    const row0 = layerIndex * 4;
                    const row1 = (textureCount + layerIndex) * 4;
                    const row2 = (textureCount * 2 + layerIndex) * 4;
                    const row3 = (textureCount * 3 + layerIndex) * 4;
                    const row4 = (textureCount * 4 + layerIndex) * 4;
                    const row5 = (textureCount * 5 + layerIndex) * 4;
                    const isWater = waterTextureIds.has(id);

                    data[row0] = material.animU;
                    data[row0 + 1] = material.animV;
                    data[row0 + 2] = materialByte(material.alphaCutOff * 255);
                    data[row0 + 3] = materialByte(frameCount);

                    data[row1] = material.animSpeed;
                    data[row1 + 1] = isWater ? 1 : 0;

                    if (isWater) {
                        const water = host.getWaterMaterialParams(id);
                        data[row1 + 2] =
                            (water.hasFoam ? WATER_FLAG_HAS_FOAM : 0) |
                            (water.useNormalMap2 ? WATER_FLAG_NORMAL_MAP_2 : 0);

                        data[row2] = materialByte(water.surfaceColor[0] * 255);
                        data[row2 + 1] = materialByte(water.surfaceColor[1] * 255);
                        data[row2 + 2] = materialByte(water.surfaceColor[2] * 255);
                        data[row2 + 3] = materialByte(water.baseOpacity * 255);

                        data[row3] = materialByte(water.depthColor[0] * 255);
                        data[row3 + 1] = materialByte(water.depthColor[1] * 255);
                        data[row3 + 2] = materialByte(water.depthColor[2] * 255);
                        data[row3 + 3] = materialByte(water.fresnelAmount * 255);

                        data[row4] = materialByte((water.normalStrength / 0.5) * 255);
                        data[row4 + 1] = materialByte(water.specularStrength * 255);
                        data[row4 + 2] = materialByte((water.specularGloss / 500) * 255);
                        data[row4 + 3] = materialByte((water.duration / 4) * 255);

                        data[row5] = materialByte(water.foamColor[0] * 255);
                        data[row5 + 1] = materialByte(water.foamColor[1] * 255);
                        data[row5 + 2] = materialByte(water.foamColor[2] * 255);
                    }
                }
            } catch (e) {
                console.error("Failed loading texture", id, e);
            }
        }

        host.textureMaterials = host.app.createTexture2D(
            data,
            textureCount,
            MATERIAL_TEXTURE_ROWS,
            {
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
                internalFormat: PicoGL.RGBA8I,
            },
        );
    
}
