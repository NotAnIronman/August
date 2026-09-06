import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";
import {
    Program
} from "picogl";

import { PlayerAppearance } from "@august/osrs-engine/config/player/PlayerAppearance";
import { PlayerModelLoader } from "@august/osrs-engine/config/player/PlayerModelLoader";
import {
    sendEmote
} from "@client/core/network/ServerConnection";
import { ChatheadFactory } from "@client/engine/rendering/ChatheadFactory";
import { PlayerChatheadFactory } from "@client/engine/rendering/PlayerChatheadFactory";
import { GfxManager } from "@client/engine/rendering/gfx/GfxManager";
import { GfxRenderer } from "@client/engine/rendering/gfx/GfxRenderer";
import { ClickCrossOverlay } from "@client/engine/rendering/overlays/ClickCrossOverlay";
import { GroundItemEffectsOverlay } from "@client/engine/rendering/overlays/GroundItemEffectsOverlay";
import { GroundItemOverlay } from "@client/engine/rendering/overlays/GroundItemOverlay";
import { HealthBarOverlay } from "@client/engine/rendering/overlays/HealthBarOverlay";
import { HitsplatOverlay } from "@client/engine/rendering/overlays/HitsplatOverlay";
import {
    InteractHighlightOverlay
} from "@client/engine/rendering/overlays/InteractHighlightOverlay";
import { LoadingMessageOverlay } from "@client/engine/rendering/overlays/LoadingMessageOverlay";
import { LoginOverlay } from "@client/engine/rendering/overlays/LoginOverlay";
import { OverheadPrayerOverlay } from "@client/engine/rendering/overlays/OverheadPrayerOverlay";
import { OverheadTextOverlay } from "@client/engine/rendering/overlays/OverheadTextOverlay";
import { OverlayManager } from "@client/engine/rendering/overlays/OverlayManager";
import { TileTextOverlay } from "@client/engine/rendering/overlays/TileTextOverlay";
import { WidgetsOverlay } from "@client/engine/rendering/overlays/WidgetsOverlay";
import { ProjectileManager } from "@client/engine/rendering/projectiles/ProjectileManager";
import { ProjectileRenderer } from "@client/engine/rendering/projectiles/ProjectileRenderer";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import {
    createMainProgram,
    createNpcProgram,
    createPlayerProgram,
    createProjectileProgram,
    FRAME_FXAA_PROGRAM,
    FRAME_PROGRAM,
} from "@client/engine/rendering/shaders/Shaders";
import { Model2DRenderer } from "@client/ui/runtime/model/Model2DRenderer";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { layoutWidgets } from "@client/ui/widgets/layout/WidgetLayout";

export async function initShaders(host: WebGLOsrsRendererHost, ): Promise<Program[]> {

        const supportsMultiDraw = host.drawBackend?.supportsMultiDraw ?? false;
        // Create FXAA separately so a Metal/ANGLE link failure on iOS Safari
        // cannot reject the entire program batch (player/NPC/etc.).
        const programs = await host.app.createPrograms(
            createMainProgram(false, supportsMultiDraw),
            createMainProgram(true, supportsMultiDraw),
            createNpcProgram(true, supportsMultiDraw),
            createNpcProgram(false, supportsMultiDraw),
            createProjectileProgram(true, supportsMultiDraw),
            createProjectileProgram(false, supportsMultiDraw),
            createPlayerProgram(true, supportsMultiDraw),
            createPlayerProgram(false, supportsMultiDraw),
            FRAME_PROGRAM,
            // hover line program (added at end)
            [
                `#version 300 es\n\nlayout(std140, column_major) uniform;\n\nprecision highp float;\n\n// Inline SceneUniforms (can't use #include in runtime strings)\nuniform SceneUniforms {\n    mat4 u_viewProjMatrix;\n    mat4 u_viewMatrix;\n    mat4 u_projectionMatrix;\n    vec4 u_skyColor;\n    vec4 u_sceneHslOverride;\n    vec2 u_cameraPos;\n    vec2 u_playerPos;\n    float u_renderDistance;\n    float u_fogDepth;\n    float u_currentTime;\n    float u_brightness;\n    float u_colorBanding;\n    float u_isNewTextureAnim;\n};\n\nlayout(location=0) in vec3 a_position;\n\nvoid main(){\n    vec4 pos = u_viewMatrix * vec4(a_position, 1.0);\n    gl_Position = u_projectionMatrix * pos;\n}`,
                `#version 300 es\n\nprecision mediump float;\n\nuniform vec4 u_color;\n\nout vec4 fragColor;\nvoid main(){\n    fragColor = u_color;\n}`,
            ],
            // hitsplat textured quad anchored in world (clip-space offset)
            [
                `#version 300 es\n\nlayout(std140, column_major) uniform;\nprecision highp float;\n\nuniform SceneUniforms {\n    mat4 u_viewProjMatrix;\n    mat4 u_viewMatrix;\n    mat4 u_projectionMatrix;\n    vec4 u_skyColor;\n    vec4 u_sceneHslOverride;\n    vec2 u_cameraPos;\n    vec2 u_playerPos;\n    float u_renderDistance;\n    float u_fogDepth;\n    float u_currentTime;\n    float u_brightness;\n    float u_colorBanding;\n    float u_isNewTextureAnim;\n};\n\nlayout(location=0) in vec2 a_position; // pixel offset from anchor\nlayout(location=1) in vec2 a_texCoord;\n\nout vec2 v_uv;\n\nuniform vec2 u_screenSize;\nuniform vec3 u_centerWorld;\n\nvoid main(){\n    vec4 centerClip = u_projectionMatrix * (u_viewMatrix * vec4(u_centerWorld, 1.0));\n    if (centerClip.w <= 0.0) {\n        gl_Position = vec4(2.0, 2.0, 1.0, 1.0);\n        v_uv = a_texCoord;\n        return;\n    }\n\n    vec2 snappedOffset = floor(a_position + vec2(0.5, 0.5));\n    vec2 px = snappedOffset / u_screenSize;\n    vec2 ndcOffset = vec2(px.x * 2.0, -px.y * 2.0);\n    gl_Position = vec4(centerClip.xy + ndcOffset * centerClip.w, centerClip.z, centerClip.w);\n    v_uv = a_texCoord;\n}`,
                `#version 300 es\n\nprecision mediump float;\n\nin vec2 v_uv;\n\nuniform sampler2D u_sprite;\nuniform vec4 u_tint;\n\nout vec4 fragColor;\n\nvoid main(){\n    vec4 c = texture(u_sprite, v_uv);\n    if (c.a < 0.01) discard;\n    fragColor = vec4(c.rgb * u_tint.rgb, c.a * u_tint.a);\n}`,
            ],
            // screen-space textured quad for UI overlays
            [
                `#version 300 es\n\nlayout(location=0) in vec2 a_position;\nlayout(location=1) in vec2 a_texCoord;\n\nuniform vec2 u_screenSize;\n\nout vec2 v_uv;\n\nvoid main(){\n    vec2 px = (a_position + vec2(0.5, 0.5)) / u_screenSize;\n    vec2 ndc = vec2(px.x * 2.0 - 1.0, 1.0 - px.y * 2.0);\n    gl_Position = vec4(ndc, 0.0, 1.0);\n    v_uv = a_texCoord;\n}`,
                `#version 300 es\n\nprecision mediump float;\n\nin vec2 v_uv;\n\nuniform sampler2D u_sprite;\nuniform vec4 u_tint;\n\nout vec4 fragColor;\n\nvoid main(){\n    vec4 c = texture(u_sprite, v_uv);\n    if (c.a < 0.01) discard;\n    fragColor = vec4(c.rgb * u_tint.rgb, c.a * u_tint.a);\n}`,
            ],
        );

        const [
            mainProgram,
            mainAlphaProgram,
            npcProgram,
            npcProgramOpaque,
            projectileProgram,
            projectileProgramOpaque,
            playerProgram,
            playerProgramOpaque,
            frameProgram,
            hoverLineProgram,
            hitsplatProgram,
            uiTabsProgram,
        ] = programs;
        host.mainProgram = mainProgram;
        host.mainAlphaProgram = mainAlphaProgram;
        host.npcProgram = npcProgram;
        host.npcProgramOpaque = npcProgramOpaque;
        host.projectileProgram = projectileProgram;
        host.projectileProgramOpaque = projectileProgramOpaque;
        host.playerProgram = playerProgram;
        host.playerProgramOpaque = playerProgramOpaque;
        host.frameProgram = frameProgram;
        host.hoverLineProgram = hoverLineProgram;
        host.hitsplatProgram = hitsplatProgram;

        host.frameDrawCall = host.app.createDrawCall(frameProgram, host.quadArray);

        try {
            const [frameFxaaProgram] = await host.app.createPrograms(FRAME_FXAA_PROGRAM);
            host.frameFxaaProgram = frameFxaaProgram;
            host.frameFxaaDrawCall = host.app.createDrawCall(frameFxaaProgram, host.quadArray);
        } catch (e) {
            console.warn("[WebGLOsrsRenderer] FXAA unavailable; continuing without it", e);
            host.frameFxaaProgram = undefined;
            host.frameFxaaDrawCall = undefined;
            host.fxaaEnabled = false;
        }

        if (host.hoverLineProgram && host.sceneUniformBuffer) {
            host.overlayManager = new OverlayManager();
            host.overlayManager.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
        }

        // Init GFX manager/renderer (spot animations)
        try {
            host.gfxManager = new GfxManager(host);
            host.gfxRenderer = new GfxRenderer(host, host.gfxManager);
        } catch {}

        // Init projectile manager and renderer
        try {
            host.projectileManager = new ProjectileManager(host);
            host.projectileRenderer = new ProjectileRenderer(host, host.projectileManager);
        } catch {}

        // Create hitsplat overlay now; register it later so it renders after
        // the plugin/world post-present overlays but before widgets.
        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const hs = new HitsplatOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                    getLoadedCacheInfo: () => host.osrsClient.loadedCache?.info,
                    getVarValue: (varbitId: number, varpId: number) => {
                        try {
                            if (varbitId !== -1)
                                return host.osrsClient.varManager.getVarbit(varbitId) | 0;
                            if (varpId !== -1)
                                return host.osrsClient.varManager.getVarp(varpId) | 0;
                        } catch {}
                        return -1;
                    },
                });
                host.hitsplatOverlay = hs;
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    hs.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Create health bar overlay now; register it later so it renders after
        // the plugin/world post-present overlays but before widgets.
        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const hb = new HealthBarOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                    getLoadedCacheInfo: () => host.osrsClient.loadedCache?.info,
                });
                host.healthBarOverlay = hb;
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    hb.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Add overhead chat overlay to manager if available
        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const oh = new OverheadTextOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                });
                host.overheadTextOverlay = oh;
                host.overlayManager.add(oh);
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    oh.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Create overhead prayer overlay now; registered after the health bar overlay
        // so head icons stack above bars in the shared per-actor offset chain.
        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const op = new OverheadPrayerOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                    getLoadedCacheInfo: () => host.osrsClient.loadedCache?.info,
                });
                host.overheadPrayerOverlay = op;
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    op.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Spot animation overlay removed; will be reimplemented later.

        // Add login screen overlay
        try {
            if (host.overlayManager && host.sceneUniformBuffer) {
                host.loginOverlay = new LoginOverlay(host.osrsClient);
                host.overlayManager.add(host.loginOverlay);
                host.loginOverlay.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
            }
        } catch (e) {
            console.warn("[WebGLOsrsRenderer] Failed to init login overlay:", e);
        }

        // Add loading message overlay ("Loading - please wait." during LOADING_GAME state)
        // Pass state machine for synchronous state updates
        try {
            if (host.overlayManager && host.sceneUniformBuffer) {
                host.loadingMessageOverlay = new LoadingMessageOverlay(
                    host.osrsClient.stateMachine,
                );
                host.overlayManager.add(host.loadingMessageOverlay);
                host.loadingMessageOverlay.init({
                    app: host.app,
                    sceneUniforms: host.sceneUniformBuffer,
                });
            }
        } catch (e) {
            console.warn("[WebGLOsrsRenderer] Failed to init loading message overlay:", e);
        }

        // Add server-path overlay (numbers over tiles returned by pathfind)
        /*try {
            if (host.overlayManager && host.hoverLineProgram && host.sceneUniformBuffer) {
                const { PathOverlay } = await import("@client/engine/rendering/overlays/PathOverlay");
                const pov = new PathOverlay(host.hoverLineProgram, {
                    getPath: () =>
                        host.osrsClient.showServerPathOverlay
                            ? host.osrsClient.getServerPathWaypoints()
                            : undefined,
                });
                host.overlayManager.add(pov);
                pov.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
            }
        } catch {}*/

        // Add object id devoverlay (labels for loc ids around player)
        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const { ObjectIdOverlay } = await import("@client/engine/rendering/overlays/ObjectIdOverlay");
                const objOv = new ObjectIdOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                    getLocIdsAtTileAllLevels: (tx: number, ty: number) =>
                        host.getLocIdsAtTileAllLevels(tx, ty),
                    isLocInteractable: (id: number) => {
                        try {
                            let lt = host.osrsClient.locTypeLoader.load(id);
                            if (lt.transforms) {
                                const t = lt.transform(
                                    host.osrsClient.varManager,
                                    host.osrsClient.locTypeLoader,
                                );
                                if (t) lt = t;
                            }
                            if (lt.actions) {
                                for (const a of lt.actions) if (a && a.length > 0) return true;
                            }
                            return (lt.isInteractive | 0) === 1;
                        } catch {
                            return false;
                        }
                    },
                });
                objOv.scale = 1.0;
                objOv.color = 0xffffff;
                objOv.radius = Math.max(1, (host.osrsClient.renderDistance / 8) | 0);
                host.objectIdOverlay = objOv;
                host.overlayManager.add(objOv);
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    objOv.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Add collision devoverlay (walkable tiles around player)
        try {
            if (host.overlayManager && host.hoverLineProgram && host.sceneUniformBuffer) {
                const { WalkableOverlay } = await import("@client/engine/rendering/overlays/WalkableOverlay");
                const walk = new WalkableOverlay(host.hoverLineProgram);
                walk.radius = 12;
                walk.enabled = !!host.osrsClient.showCollisionOverlay;
                host.overlayManager.add(walk);
                walk.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                host.walkableOverlay = walk;
            }
        } catch {}

        // Add tile marker overlay (hover, destination, and current true tile outline)
        try {
            if (host.overlayManager && host.hoverLineProgram && host.sceneUniformBuffer) {
                const { TileMarkerOverlay } = await import("@client/engine/rendering/overlays/TileMarkerOverlay");
                const marker = new TileMarkerOverlay(host.hoverLineProgram);
                host.tileMarkerOverlay = marker;
                host.overlayManager.add(marker);
                marker.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
            }
        } catch {}

        // Add tile text overlay (3D coordinate labels for hover/dest/player tiles)
        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const tileText = new TileTextOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                });
                host.tileTextOverlay = tileText;
                host.overlayManager.add(tileText);
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    tileText.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Add click cross devoverlay (sprite id 299 frames 0..3)
        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const cross = new ClickCrossOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                });
                host.clickCrossOverlay = cross;
                host.overlayManager.add(cross);
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    cross.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Ground-item world effects are registered immediately before labels. Effects
        // draw into the depth-aware scene pass; labels remain the final readable layer.
        try {
            if (host.overlayManager && host.sceneUniformBuffer) {
                const groundEffects = new GroundItemEffectsOverlay();
                const effectsHost = host as typeof host & {
                    groundItemEffectsOverlay?: GroundItemEffectsOverlay;
                };
                effectsHost.groundItemEffectsOverlay = groundEffects;
                host.overlayManager.add(groundEffects);
                try {
                    groundEffects.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        try {
            if (host.overlayManager && host.hitsplatProgram && host.sceneUniformBuffer) {
                const ground = new GroundItemOverlay(host.hitsplatProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                    editItem:(name,list)=>{
                        const plugin=host.osrsClient.groundItemsPlugin;
                        if(plugin.getConfig().enabled)plugin.toggleItemList(name,list);
                    },
                });
                host.groundItemOverlay = ground;
                host.overlayManager.add(ground);
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    ground.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        try {
            if (host.overlayManager && host.sceneUniformBuffer) {
                const interact = new InteractHighlightOverlay({
                    getTargets: () => host.getInteractHighlightDrawTargets(),
                });
                host.interactHighlightOverlay = interact;
                host.overlayManager.add(interact);
                try {
                    interact.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
            }
        } catch {}

        // Draw actor damage overlays after the plugin/world post-present overlays so they
        // cannot cover them, but before widgets so game UI still stays on top. Keep
        // Per-actor element order: health bars, then head icons, then hitsplats on top.
        try {
            if (host.overlayManager && host.healthBarOverlay) {
                host.overlayManager.add(host.healthBarOverlay);
            }
            if (host.overlayManager && host.overheadPrayerOverlay) {
                host.overlayManager.add(host.overheadPrayerOverlay);
            }
            if (host.overlayManager && host.hitsplatOverlay) {
                host.overlayManager.add(host.hitsplatOverlay);
            }
        } catch {}

        // Add widgets overlay for UI rendering
        clientDebugLog(
            "[WidgetsOverlay init] overlayManager:",
            !!host.overlayManager,
            "uiTabsProgram:",
            !!uiTabsProgram,
            "sceneUniformBuffer:",
            !!host.sceneUniformBuffer,
        );
        try {
            if (host.overlayManager && uiTabsProgram && host.sceneUniformBuffer) {
                // Import necessary modules dynamically
                const { BitmapFont } = await import("@august/osrs-engine/font/BitmapFont");
                const { ItemIconRenderer } = await import("@client/ui/runtime/item/ItemIconRenderer");
                const { WidgetLoader } = await import("@client/ui/widgets/WidgetLoader");

                // Get required loaders from OsrsClient
                const objLoader = host.osrsClient.objTypeLoader;
                const modelLoader = host.osrsClient.modelLoader;
                const textureLoader = host.osrsClient.textureLoader;
                const idkLoader = host.osrsClient.idkTypeLoader;

                // Create item icon renderer if we have the necessary loaders
                // Will be reinitialized in initOverlays() if not available now
                if (objLoader && modelLoader && textureLoader && !host.itemIconRenderer) {
                    host.itemIconRenderer = new ItemIconRenderer(
                        objLoader,
                        modelLoader,
                        textureLoader,
                        host.osrsClient.cacheSystem,
                    );
                }
                if (modelLoader && textureLoader && idkLoader) {
                    host.playerChatheadFactory = new PlayerChatheadFactory(
                        modelLoader,
                        textureLoader,
                        idkLoader,
                    );
                }

                // Root interface is set by the server via set_root widget event
                let resolvedGroupId: number | undefined;
                if (!host.osrsClient.widgetManager && host.osrsClient.cacheSystem) {
                    host.osrsClient.widgetManager = new WidgetManager(host.osrsClient.cacheSystem);
                }

                const computeWidgetRoots = (): any[] => {
                    const manager = host.osrsClient.widgetManager;
                    const roots: any[] = [];

                    // NOTE: beginFrame() is now called at the END of draw, not here.
                    // This ensures dirty flags set during the frame are visible to the dirty check.

                    // Widget layout runs in renderer-defined UI space and renders directly into the
                    // canvas buffer.
                    const bufW = host.app.width;
                    const bufH = host.app.height;
                    const metrics = host.computeUiRenderMetrics(bufW, bufH);
                    const layoutW = metrics.layoutW;
                    const layoutH = metrics.layoutH;
                    const widgetRenderScaleX = metrics.renderScaleX;
                    const widgetRenderScaleY = metrics.renderScaleY;
                    const widgetRenderOffsetX = metrics.renderOffsetX;
                    const widgetRenderOffsetY = metrics.renderOffsetY;

                    // Keep CS2 IF_GETCANVASSIZE / widget manager dimensions aligned with the active
                    // widget layout space.
                    manager?.resize(layoutW, layoutH);

                    // Get the current root interface (set by server via IF_OPENTOPLEVEL)
                    // OSRS interfaces can have multiple root widgets (parentUid=-1)
                    // All of them need to be rendered as top-level layers
                    const currentRootInterface = manager?.rootInterface ?? -1;
                    if (currentRootInterface !== -1) {
                        const allRoots = manager?.getAllGroupRoots(currentRootInterface) ?? [];

                        // Helper to count children (both dynamic from children array AND static from parentUid)
                        const getChildCount = (w: any): number => {
                            const dynamicCount = w.children?.length ?? 0;
                            // also count static children from parentUid filtering
                            const staticCount =
                                manager?.getStaticChildrenByParentUid(w.uid)?.length ?? 0;
                            return dynamicCount + staticCount;
                        };

                        for (const viewportRoot of allRoots) {
                            if (viewportRoot) {
                                // Layout each root independently in the current UI layout space.
                                // Pass static children callback for
                                const getStaticChildren = (uid: number) =>
                                    manager?.getStaticChildrenByParentUid(uid) ?? [];
                                layoutWidgets(
                                    viewportRoot,
                                    layoutW | 0,
                                    layoutH | 0,
                                    getStaticChildren,
                                );

                                // Skip empty layer roots from rendering
                                const childCount = getChildCount(viewportRoot);
                                const hasMountedInterface =
                                    manager?.interfaceParents.has(viewportRoot.uid) === true;
                                const hasVisualContent =
                                    viewportRoot.type !== 0 ||
                                    childCount > 0 ||
                                    hasMountedInterface ||
                                    (typeof viewportRoot.spriteId === "number" &&
                                        viewportRoot.spriteId >= 0) ||
                                    (typeof viewportRoot.spriteId2 === "number" &&
                                        viewportRoot.spriteId2 >= 0) ||
                                    viewportRoot.filled;

                                if (!hasVisualContent) {
                                    continue;
                                }

                                // Register root widget for dirty tracking
                                const rootAny = viewportRoot as any;
                                rootAny.__widgetRenderScale = widgetRenderScaleX;
                                rootAny.__widgetRenderScaleX = widgetRenderScaleX;
                                rootAny.__widgetRenderScaleY = widgetRenderScaleY;
                                rootAny.__widgetRenderOffsetX = widgetRenderOffsetX;
                                rootAny.__widgetRenderOffsetY = widgetRenderOffsetY;
                                const rootX = (viewportRoot.x ?? 0) | 0;
                                const rootY = (viewportRoot.y ?? 0) | 0;
                                const rootW = (viewportRoot.width ?? layoutW) | 0;
                                const rootH = (viewportRoot.height ?? layoutH) | 0;
                                const drawX = Math.round(
                                    rootX * widgetRenderScaleX + widgetRenderOffsetX,
                                );
                                const drawY = Math.round(
                                    rootY * widgetRenderScaleY + widgetRenderOffsetY,
                                );
                                const drawRight = Math.round(
                                    (rootX + rootW) * widgetRenderScaleX + widgetRenderOffsetX,
                                );
                                const drawBottom = Math.round(
                                    (rootY + rootH) * widgetRenderScaleY + widgetRenderOffsetY,
                                );
                                manager?.registerRootWidget(
                                    viewportRoot,
                                    drawX,
                                    drawY,
                                    Math.max(1, drawRight - drawX),
                                    Math.max(1, drawBottom - drawY),
                                );

                                roots.push(viewportRoot);
                            }
                        }
                        if (allRoots.length > 0 && resolvedGroupId !== currentRootInterface) {
                            resolvedGroupId = currentRootInterface;
                        }
                    }

                    return roots;
                };

                const widgets = new WidgetsOverlay(uiTabsProgram, {
                    getCacheSystem: () => host.osrsClient.cacheSystem,
                    getWidgetManager: () => host.osrsClient.widgetManager,
                    getGameContext: () => ({
                        osrsClient: host.osrsClient,
                        playerEcs: host.osrsClient.playerEcs,
                        controlledPlayerServerId: host.osrsClient.controlledPlayerServerId,
                        combatWeaponCategory: host.osrsClient.combatWeaponCategory,
                        combatWeaponItemId: host.osrsClient.combatWeaponItemId,
                        sendEmote,
                    }),
                    getFontLoader: () => {
                        // PERF: Cache loaded BitmapFonts (loading parses cache archives/sprites).
                        const cache = new Map<number, ReturnType<typeof BitmapFont.tryLoad>>();
                        return (id: number) => {
                            const cacheSystem = host.osrsClient.cacheSystem;
                            if (!cacheSystem) return undefined;
                            const key = id | 0;
                            if (cache.has(key)) return cache.get(key);
                            const font = BitmapFont.tryLoad(cacheSystem, key);
                            // Do not memoize missing fonts forever. During startup the widget overlay
                            // can probe a font before the cache data is fully ready, and a permanent
                            // cached undefined would make all later CS2 text for that font invisible.
                            if (font) {
                                cache.set(key, font);
                            }
                            return font;
                        };
                    },
                    getWidgetRoots: () => computeWidgetRoots(),
                    getWidgetRoot: () => {
                        const roots = computeWidgetRoots();
                        return roots.length > 0 ? roots[roots.length - 1] : undefined;
                    },
                    getItemIconCanvas:
                        () =>
                            (
                                itemId: number,
                                qty?: number,
                                outline?: number,
                                shadow?: number,
                                quantityMode?: number,
                                animationTimeSeconds?: number,
                                width?: number,
                                height?: number,
                            ) => {
                                // Use ItemIconRenderer to render item icons
                                if (host.itemIconRenderer) {
                                    return host.itemIconRenderer.renderToCanvas(itemId, qty ?? 1, {
                                        outline,
                                        shadow,
                                        quantityMode,
                                        animationTimeSeconds,
                                        width,
                                        height,
                                    });
                                }
                                return undefined;
                            },
                    getObjLoader: () => {
                        // Return the object loader from OsrsClient
                        return host.osrsClient.objTypeLoader;
                    },
                    getRenderModelCanvas:
                        () => (modelId: number, params: any, width: number, height: number) => {
                            if (!host.model2DRenderer) {
                                host.model2DRenderer = new Model2DRenderer(
                                    host.osrsClient.objTypeLoader,
                                    host.osrsClient.modelLoader,
                                    host.osrsClient.textureLoader,
                                    host.osrsClient.seqTypeLoader,
                                    host.osrsClient.seqFrameLoader,
                                    host.osrsClient.skeletalSeqLoader,
                                );
                            }

                            if (params.widget) {
                                const isPlayerModelWidget =
                                    ((params.widget.contentType ?? 0) | 0) === 328 ||
                                    ((params.widget.modelType ?? 0) | 0) === 7 ||
                                    (params.widget as any).isPlayerModel === true;
                                if (isPlayerModelWidget) {
                                    const haveLoaders =
                                        host.osrsClient.modelLoader &&
                                        host.osrsClient.textureLoader &&
                                        host.osrsClient.idkTypeLoader &&
                                        host.osrsClient.objTypeLoader;
                                    if (!host.playerModelLoader2D && haveLoaders) {
                                        host.playerModelLoader2D = new PlayerModelLoader(
                                            host.osrsClient.idkTypeLoader,
                                            host.osrsClient.objTypeLoader,
                                            host.osrsClient.modelLoader,
                                            host.osrsClient.textureLoader,
                                        );
                                    }

                                    const wAny = params.widget as any;
                                    const keepEquipment =
                                        typeof wAny.playerModelKeepEquipment === "boolean"
                                            ? (wAny.playerModelKeepEquipment as boolean)
                                            : true;
                                    // contentType=328 renders the local player model.
                                    // Prefer the ECS local-player appearance so server-driven updates
                                    // (PlayerDesign arrows) reflect immediately, even if the widget
                                    // has a stale `playerAppearance` snapshot.
                                    const localAppearance = (() => {
                                        const idx = host.osrsClient.playerEcs.getIndexForServerId(
                                            host.osrsClient.controlledPlayerServerId,
                                        );
                                        return idx !== undefined
                                            ? host.osrsClient.playerEcs.getAppearance(idx)
                                            : undefined;
                                    })();
                                    const appearanceSrc =
                                        ((params.widget as any).contentType | 0) === 328
                                            ? localAppearance || wAny.playerAppearance
                                            : wAny.playerAppearance || localAppearance;

                                    if (host.playerModelLoader2D && appearanceSrc) {
                                        const gender =
                                            typeof appearanceSrc.gender === "number"
                                                ? appearanceSrc.gender | 0
                                                : 0;
                                        const colors = Array.isArray(appearanceSrc.colors)
                                            ? appearanceSrc.colors
                                                .slice(0, 5)
                                                .map((n: any) =>
                                                    Number.isFinite(n) ? (n | 0) & 0xff : 0,
                                                )
                                            : [0, 0, 0, 0, 0];
                                        const kits = Array.isArray(appearanceSrc.kits)
                                            ? appearanceSrc.kits
                                                .slice(0, 7)
                                                .map((n: any) =>
                                                    Number.isFinite(n) ? n | 0 : -1,
                                                )
                                            : new Array(7).fill(-1);
                                        const equip = Array.isArray(appearanceSrc.equip)
                                            ? appearanceSrc.equip
                                                .slice(0, 14)
                                                .map((n: any) =>
                                                    Number.isFinite(n) ? n | 0 : -1,
                                                )
                                            : new Array(14).fill(-1);
                                        if (!keepEquipment) {
                                            for (let i = 0; i < equip.length; i++) equip[i] = -1;
                                        }
                                        const pa = new PlayerAppearance(
                                            gender,
                                            colors,
                                            kits,
                                            equip,
                                        );

                                        // contentType=328 uses KeyHandler.localPlayer.getModel().
                                        // Our ECS base-model pipeline applies additional alignment (to NPC "man")
                                        // which is correct for in-world rendering, but skews UI preview offsets.
                                        // For widget rendering, prefer the raw PlayerComposition model build.
                                        let model: any | undefined;
                                        if (host.playerModelLoader2D) {
                                            model =
                                                host.playerModelLoader2D.buildStaticModelFromEquipment(
                                                    pa,
                                                    pa.equip,
                                                );
                                        }
                                        if (model) {
                                            // Widget type-6 models render into the *parent clip*,
                                            // not the widget bounds. This means player models can overflow the
                                            // widget rectangle (e.g., equipment/league summary) and still be visible.
                                            //
                                            // Render to tight extents and let the widget scissor stack (container clip)
                                            // match the client's behaviour.
                                            return host.model2DRenderer.renderModelInstanceToCanvasExtents(
                                                model,
                                                params,
                                            );
                                        }
                                    }
                                }

                                if (
                                    params.widget.isNpcChathead &&
                                    typeof params.widget.npcTypeId === "number"
                                ) {
                                    if (!host.chatheadFactory) {
                                        host.chatheadFactory = new ChatheadFactory(
                                            host.osrsClient.modelLoader,
                                            host.osrsClient.textureLoader,
                                        );
                                    }
                                    const npcTypeId = params.widget.npcTypeId;
                                    const baseNpcType =
                                        host.osrsClient.npcTypeLoader.load(npcTypeId);
                                    const npcType =
                                        baseNpcType?.transform?.(
                                            host.osrsClient.varManager,
                                            host.osrsClient.npcTypeLoader,
                                        ) ?? baseNpcType;
                                    if (
                                        npcType &&
                                        npcType.chatheadModelIds &&
                                        npcType.chatheadModelIds.length > 0
                                    ) {
                                        const chatModel = host.chatheadFactory.get(npcType);
                                        if (chatModel) {
                                            return host.model2DRenderer.renderModelInstanceToCanvasExtents(
                                                chatModel,
                                                params,
                                            );
                                        }
                                    }
                                } else if (params.widget.isPlayerChathead) {
                                    const haveLoaders =
                                        host.osrsClient.modelLoader &&
                                        host.osrsClient.textureLoader &&
                                        host.osrsClient.idkTypeLoader &&
                                        host.osrsClient.objTypeLoader;

                                    // Recreate factory if missing or if it was built before objTypeLoader was ready
                                    if (
                                        !host.playerChatheadFactory ||
                                        !(host.playerChatheadFactory as any)["objTypeLoader"]
                                    ) {
                                        if (haveLoaders) {
                                            host.playerChatheadFactory = new PlayerChatheadFactory(
                                                host.osrsClient.modelLoader,
                                                host.osrsClient.textureLoader,
                                                host.osrsClient.idkTypeLoader,
                                                host.osrsClient.objTypeLoader,
                                            );
                                        }
                                    }
                                    const appearance =
                                        params.widget.playerAppearance ||
                                        (() => {
                                            const idx =
                                                host.osrsClient.playerEcs.getIndexForServerId(
                                                    host.osrsClient.controlledPlayerServerId,
                                                );
                                            return idx !== undefined
                                                ? host.osrsClient.playerEcs.getAppearance(idx)
                                                : undefined;
                                        })();
                                    if (host.playerChatheadFactory && appearance) {
                                        const chatModel =
                                            host.playerChatheadFactory.get(appearance);
                                        if (chatModel) {
                                            return host.model2DRenderer.renderModelInstanceToCanvasExtents(
                                                chatModel,
                                                params,
                                            );
                                        }
                                    }
                                }
                            }

                            const widgetAny = params.widget as any;
                            const itemId = widgetAny?.itemId;
                            if (typeof itemId === "number" && itemId >= 0) {
                                try {
                                    const qty = (widgetAny?.itemQuantity ?? 0) | 0 || 1;
                                    return host.model2DRenderer.renderItemToCanvasExtents(
                                        itemId | 0,
                                        qty,
                                        params,
                                        width,
                                        height,
                                    );
                                } catch {}
                            }

                            if (modelId < 0) {
                                return undefined;
                            }

                            return host.model2DRenderer.renderToCanvasExtents(
                                modelId,
                                params,
                                width,
                                height,
                            );
                        },
                });
                host.widgetsOverlay = widgets;
                host.overlayManager.add(widgets);
                // Init may fail if cache not ready - will be reinitialized in initOverlays()
                try {
                    widgets.init({ app: host.app, sceneUniforms: host.sceneUniformBuffer });
                } catch {}
                clientDebugLog(
                    "WebGLOsrsClientRenderer: WidgetsOverlay initialized and added to overlay manager",
                );
            }
        } catch (e) {
            console.error("Failed to initialize WidgetsOverlay:", e);
        }

        return host.frameFxaaProgram ? [...programs, host.frameFxaaProgram] : programs;
    
}
