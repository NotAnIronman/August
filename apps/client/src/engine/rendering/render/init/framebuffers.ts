import {
    PicoGL
} from "picogl";

import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function initFramebuffers(host: WebGLOsrsRendererHost, ): void {

        host.initFramebuffer();
        host.initTextureFramebuffer();
    
}

export function initFramebuffer(host: WebGLOsrsRendererHost, ): void {

        host.framebuffer?.delete();
        host.colorTarget?.delete();
        host.depthTarget?.delete();

        const sceneSize = host.getSceneRenderSize();
        host.sceneRenderWidth = sceneSize.width | 0;
        host.sceneRenderHeight = sceneSize.height | 0;

        let samples = 0;
        if (host.msaaEnabled) {
            samples = host.gl.getParameter(PicoGL.MAX_SAMPLES);
        }

        host.colorTarget = host.app.createRenderbuffer(
            host.sceneRenderWidth,
            host.sceneRenderHeight,
            PicoGL.RGBA8,
            samples,
        );
        host.depthTarget = host.app.createRenderbuffer(
            host.sceneRenderWidth,
            host.sceneRenderHeight,
            PicoGL.DEPTH_COMPONENT24,
            samples,
        );
        host.framebuffer = host.app
            .createFramebuffer()
            .colorTarget(0, host.colorTarget)
            .depthTarget(host.depthTarget);

        host.needsFramebufferUpdate = false;
    
}

export function initTextureFramebuffer(host: WebGLOsrsRendererHost, 
        width: number = host.app.width,
        height: number = host.app.height,
    ): void {

        host.textureFramebuffer?.delete();
        host.textureColorTarget?.delete();
        host.textureDepthTarget?.delete();
        host.textureColorTarget = host.app.createTexture2D(width, height, {
            minFilter: PicoGL.LINEAR,
            magFilter: PicoGL.LINEAR,
        });
        host.textureDepthTarget = host.app.createRenderbuffer(
            width,
            height,
            PicoGL.DEPTH_COMPONENT24,
            0,
        );
        host.textureFramebuffer = host.app
            .createFramebuffer()
            .colorTarget(0, host.textureColorTarget)
            .depthTarget(host.textureDepthTarget);
    
}
