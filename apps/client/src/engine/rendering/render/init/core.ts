import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";
import {
    PicoGL
} from "picogl";

import {
    subscribeTick
} from "@client/core/network/ServerConnection";
import { isMobileMode,isSafari } from "@client/core/platform/device/DeviceUtil";
import { createDrawBackend } from "@client/engine/rendering/DrawBackend";
import { optimizeAssumingFlatsHaveSameFirstAndLastData } from "@client/engine/rendering/render/constants";
import { initRenderer } from "@client/engine/rendering/render/handlers";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export async function init(host: WebGLOsrsRendererHost, ): Promise<void> {

        await initRenderer(host);
        host.canvas.addEventListener("touchstart", host.onCanvasTouchStart, {
            passive: false,
            capture: true,
        });
        if (isMobileMode) {
            host.ensureMobileLoginInput();
            host.updateMobileLoginViewportBaseline();
            window.addEventListener("resize", host.onMobileLoginViewportChange);
            window.addEventListener("orientationchange", host.onMobileLoginViewportChange);
            window.visualViewport?.addEventListener("resize", host.onMobileLoginViewportChange);
            window.visualViewport?.addEventListener("scroll", host.onMobileLoginViewportChange);
        }

        host.app = PicoGL.createApp(host.canvas);
        // Ensure app dimensions are initialized from canvas
        (host.app as any).width = host.canvas.width;
        (host.app as any).height = host.canvas.height;
        host.gl = host.app.gl as WebGL2RenderingContext;

        // Initialize widget manager with the active UI layout space.
        if (host.osrsClient.widgetManager) {
            const metrics = host.computeUiRenderMetrics(
                host.canvas.width | 0,
                host.canvas.height | 0,
            );
            host.osrsClient.widgetManager.resize(metrics.layoutW, metrics.layoutH);
        }

        host.hitsplatTickUnsub = subscribeTick((tick) => host.onServerTick(tick));

        // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_webgl_provoking_vertex_when_its_available
        optimizeAssumingFlatsHaveSameFirstAndLastData(host.gl);

        host.timer = host.app.createTimer();

        // Prefer the multi-draw extension when available; fall back to explicit single draws otherwise.
        // Safari's Metal ANGLE advertises WEBGL_multi_draw but then fails at draw time with
        // attribute-type mismatches in glMultiDrawArraysInstancedANGLE.
        const state: any = host.app.state;
        const ext = isSafari ? null : host.gl.getExtension("WEBGL_multi_draw");
        PicoGL.WEBGL_INFO.MULTI_DRAW_INSTANCED = ext;
        state.extensions.multiDrawInstanced = ext;

        host.hasMultiDraw = !!ext;
        host.drawBackend?.dispose();
        host.drawBackend = createDrawBackend(host.hasMultiDraw);
        host.drawBackend.init(host.app, host.gl);

        if (!ext) {
            console.warn(
                isSafari
                    ? "Disabling WEBGL_multi_draw on Safari/WebKit; using single-draw fallback."
                    : "WEBGL_multi_draw extension not available! Rendering may not work correctly. " +
                      "Falling back to single-draw rendering; this is slower but supported.",
            );
        }

        host.osrsClient.workerPool.initLoader(host.dataLoader);

        host.gl.getExtension("EXT_float_blend");

        host.app.enable(PicoGL.CULL_FACE);
        host.app.enable(PicoGL.DEPTH_TEST);
        host.app.depthFunc(PicoGL.LEQUAL);

        host.app.enable(PicoGL.BLEND);
        host.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);
        host.app.clearColor(host.skyColor[0], host.skyColor[1], host.skyColor[2], host.skyColor[3]);

        host.quadPositions = host.app.createVertexBuffer(
            PicoGL.FLOAT,
            2,
            new Float32Array([-1, 1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1]),
        );
        host.quadArray = host.app.createVertexArray().vertexAttributeBuffer(0, host.quadPositions);

        host.shadersPromise = host.initShaders();

        host.sceneUniformBuffer = host.app.createUniformBuffer([
            PicoGL.FLOAT_MAT4, // mat4 u_viewProjMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_viewMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_projectionMatrix;
            PicoGL.FLOAT_VEC4, // vec4 u_skyColor;
            PicoGL.FLOAT_VEC4, // vec4 u_sceneHslOverride;
            PicoGL.FLOAT_VEC2, // vec2 u_cameraPos;
            PicoGL.FLOAT_VEC2, // vec2 u_playerPos;
            PicoGL.FLOAT, // float u_renderDistance;
            PicoGL.FLOAT, // float u_fogDepth;
            PicoGL.FLOAT, // float u_currentTime;
            PicoGL.FLOAT, // float u_brightness;
            PicoGL.FLOAT, // float u_colorBanding;
            PicoGL.FLOAT, // float u_isNewTextureAnim;
        ]);

        host.initFramebuffers();
        await host.initWaterTextures();

        host.initTextures();

        clientDebugLog("Renderer init");

        // Build player geometry once (uses current cache + textures)
        try {
            await host.playerRenderer.initGeometry();
        } catch (e) {
            console.warn("Failed to init player geometry", e);
        }

        // Initialize dynamic NPC animation loader ( - load animations at render time)
        host.initDynamicNpcAnimLoader();

        try {
            host.osrsClient.notifyRendererReady();
        } catch {}
    
}
