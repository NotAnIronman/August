import {
    PicoGL
} from "picogl";

import { newDrawRange } from "@client/engine/rendering/DrawRange";
import {
    DynamicNpcAnimLoader
} from "@client/engine/rendering/npc/DynamicNpcAnimLoader";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function clearDynamicNpcAnimRuntimeState(host: WebGLOsrsRendererHost, ): void {

        host.dynamicNpcAnimLoader?.clear();
        host.dynamicNpcDrawCall = undefined;
        host.dynamicNpcVertexArray?.delete();
        host.dynamicNpcVertexArray = undefined;
        host.dynamicNpcInterleavedBuffer?.delete();
        host.dynamicNpcInterleavedBuffer = undefined;
        host.dynamicNpcIndexBuffer?.delete();
        host.dynamicNpcIndexBuffer = undefined;
        host.dynamicNpcBufferVertexSize = 0;
        host.dynamicNpcBufferIndexSize = 0;
        host.dynamicNpcUploadedGeometryKey = undefined;
    
}

export function disposeDynamicNpcAnimState(host: WebGLOsrsRendererHost, ): void {

        host.clearDynamicNpcAnimRuntimeState();
        host.dynamicNpcAnimLoader = undefined;
    
}

export function initDynamicNpcAnimLoader(host: WebGLOsrsRendererHost, ): void {

        host.disposeDynamicNpcAnimState();
        try {
            host.dynamicNpcAnimLoader = new DynamicNpcAnimLoader(
                host.osrsClient.npcTypeLoader,
                host.osrsClient.modelLoader,
                host.osrsClient.textureLoader,
                host.osrsClient.seqTypeLoader,
                host.osrsClient.seqFrameLoader,
                host.osrsClient.skeletalSeqLoader,
                host.osrsClient.varManager,
            );
            host.dynamicNpcAnimLoader.setTextureIdIndexMap(host.textureIdIndexMap);
        } catch (e) {
            console.warn("Failed to init dynamic NPC animation loader", e);
        }
    
}

export async function initPlayerGeometry(host: WebGLOsrsRendererHost, ): Promise<void> {

        if (!host.playerProgram || !host.textureArray || !host.textureMaterials) {
            await host.shadersPromise;
        }
        if (!host.playerProgram || !host.textureArray || !host.textureMaterials) {
            return;
        }
        // Prepare empty dynamic GPU resources for player rendering. Base-model building is
        // handled in PlayerEcs and PlayerRenderer uploads per-frame geometry.
        const interleavedBuffer = host.app.createInterleavedBuffer(12, new Int32Array(0));
        const indexBuffer = host.app.createIndexBuffer(PicoGL.UNSIGNED_INT, new Int32Array(0));
        const vertexArray = host.app
            .createVertexArray()
            .vertexAttributeBuffer(0, interleavedBuffer, {
                type: PicoGL.UNSIGNED_INT,
                size: 3,
                stride: 12,
                integer: true as any,
            })
            .indexBuffer(indexBuffer);

        const drawCall = host.app
            .createDrawCall(host.playerProgramOpaque ?? host.playerProgram!, vertexArray)
            .uniformBlock("SceneUniforms", host.sceneUniformBuffer!)
            .uniform("u_timeLoaded", -1.0)
            .texture("u_textures", host.textureArray!)
            .texture("u_textureMaterials", host.textureMaterials!);

        // Transparent path: keep separate buffers (initially empty)
        const interleavedBufferAlpha = host.app.createInterleavedBuffer(12, new Int32Array(0));
        const indexBufferAlpha = host.app.createIndexBuffer(PicoGL.UNSIGNED_INT, new Int32Array(0));
        const vertexArrayAlpha = host.app
            .createVertexArray()
            .vertexAttributeBuffer(0, interleavedBufferAlpha, {
                type: PicoGL.UNSIGNED_INT,
                size: 3,
                stride: 12,
                integer: true as any,
            })
            .indexBuffer(indexBufferAlpha);
        const drawCallAlpha = host.app
            .createDrawCall(host.playerProgram!, vertexArrayAlpha)
            .uniformBlock("SceneUniforms", host.sceneUniformBuffer!)
            .uniform("u_timeLoaded", -1.0)
            .texture("u_textures", host.textureArray!)
            .texture("u_textureMaterials", host.textureMaterials!);

        host.playerVertexArray = vertexArray;
        host.playerInterleavedBuffer = interleavedBuffer as any;
        host.playerIndexBuffer = indexBuffer as any;
        host.playerInterleavedBufferAlpha = interleavedBufferAlpha as any;
        host.playerIndexBufferAlpha = indexBufferAlpha as any;
        host.playerVertexArrayAlpha = vertexArrayAlpha;
        host.playerDrawCall = drawCall;
        host.playerDrawCallAlpha = drawCallAlpha;
        host.playerDrawRanges = [newDrawRange(0, 0, 1)];
        host.playerDrawRangesAlpha = [newDrawRange(0, 0, 1)];
    
}
