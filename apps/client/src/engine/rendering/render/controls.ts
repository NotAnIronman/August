import { folder } from "leva";
import type { Schema } from "leva/dist/declarations/src/types";

import { ColorRgb,TextureFilterMode } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function getControls(host: WebGLOsrsRendererHost, ): Schema {

        // Appearance (clothes + equipment) is server-driven; no local kit lists

        const queueRebuild = () => {
            host.playerRenderer
                .initGeometry()
                .catch((e) => console.warn("Player rebuild failed", e));
        };

        const schema: any = {
            Player: folder(
                {
                    Plane: {
                        value: (() => {
                            const idx = host.osrsClient.playerEcs.getIndexForServerId(
                                host.osrsClient.controlledPlayerServerId,
                            );
                            return idx !== undefined ? host.osrsClient.playerEcs.getLevel(idx) : 0;
                        })(),
                        min: 0,
                        max: 3,
                        step: 1,
                        label: "Plane",
                        onChange: (v: number) => {
                            const idx = host.osrsClient.playerEcs.getIndexForServerId(
                                host.osrsClient.controlledPlayerServerId,
                            );
                            if (idx === undefined) return;
                            const next = Math.max(0, Math.min(3, v | 0));
                            const currentLevel = host.osrsClient.playerEcs.getLevel(idx);
                            if (currentLevel !== next) {
                                host.osrsClient.playerEcs.setLevel(idx, next);
                                // Keep PlayerECS in sync if present so roof logic uses this plane
                                try {
                                    const pe = host.osrsClient.playerEcs as any;
                                    const n = pe?.size?.() ?? 0;
                                    if (n > 0) pe.setLevel?.(0, next);
                                } catch {}
                                // Ensure camera follow and height sampling react immediately
                                host.osrsClient.camera.updated = true;
                            }
                        },
                    },
                    AnimMode: {
                        value: host.playerAnimMode,
                        options: { Idle: "idle", Walk: "walk", Run: "run", Crawl: "crawl" },
                        label: "Player Animation",
                        onChange: (v: "idle" | "walk" | "run" | "crawl") => {
                            host.playerAnimMode = v;
                            // Also toggle server run mode to keep speed consistent with UI choice
                            try {
                                host.osrsClient.setRunMode(v === "run");
                            } catch {}
                            // Update local ECS run flag to reflect toggle immediately
                            try {
                                const idx = host.osrsClient.playerEcs.getIndexForServerId(
                                    host.osrsClient.controlledPlayerServerId,
                                );
                                if (idx !== undefined)
                                    (host.osrsClient.playerEcs as any).running[idx] =
                                        v === "run" ? 1 : 0;
                            } catch {}
                            // Reset frames when switching modes
                        },
                    },
                    DebugDumpVertices: {
                        value: host.playerDebugDump,
                        label: "Debug Dump Vertices",
                        onChange: (v: boolean) => {
                            host.playerDebugDump = !!v;
                            queueRebuild();
                        },
                    },
                    FreezeFrame: {
                        value: host.playerFreezeFrame,
                        label: "Freeze Frame",
                        onChange: (v: boolean) => (host.playerFreezeFrame = !!v),
                    },
                    FrameIndex: {
                        value: host.playerFixedFrame,
                        min: 0,
                        max: Math.max(host.playerRenderer.getFrameCount() - 1, 0),
                        step: 1,
                        onChange: (v: number) => (host.playerFixedFrame = v | 0),
                    },
                    IdleSeqId: {
                        value: host.playerIdleSeqId,
                        min: -1,
                        max: host.resolvePlayerIdleSeqMaxId(),
                        step: 1,
                        label: "Idle Seq ID (-1:auto)",
                        onChange: (v: number) => {
                            host.playerIdleSeqId = v | 0;
                            host.clearControlledPlayerAppearanceCache();
                            queueRebuild();
                        },
                    },
                    YOffset: {
                        value: host.playerYOffset,
                        min: -32,
                        max: 64,
                        step: 1,
                        label: "Y offset",
                        onChange: (v: number) => (host.playerYOffset = v | 0),
                    },
                    // No local appearance editing (head/torso/arms/hands)
                    // No local appearance editing (legs/feet)
                    // No local equip meta introspection
                },
                { collapsed: false },
            ),
            "Max Level": {
                value: host.maxLevel,
                min: 0,
                max: 3,
                step: 1,
                onChange: (v: number) => {
                    host.setMaxLevel(v);
                },
            },
            Sky: {
                r: host.skyColor[0] * 255,
                g: host.skyColor[1] * 255,
                b: host.skyColor[2] * 255,
                onChange: (v: ColorRgb) => {
                    host.setSkyColor(v.r, v.g, v.b);
                },
            },
            Fog: folder(
                {
                    Auto: {
                        value: host.autoFogDepth,
                        label: "Dynamic (scales with draw distance)",
                        onChange: (v: boolean) => {
                            host.autoFogDepth = !!v;
                        },
                    },
                    Factor: {
                        value: host.autoFogDepthFactor,
                        min: 0,
                        max: 1,
                        step: 0.05,
                        label: "Fog start factor",
                        onChange: (v: number) => {
                            // Keep it sane; fogFactorOSRS clamps against renderDistance anyway.
                            host.autoFogDepthFactor = Math.max(0, Math.min(1, v));
                        },
                    },
                    Depth: {
                        value: host.fogDepth,
                        min: 0,
                        max: 400,
                        step: 5,
                        label: "Manual fog start (tiles)",
                        onChange: (v: number) => {
                            host.fogDepth = v;
                        },
                    },
                },
                { collapsed: true },
            ),
            Brightness: {
                value: 1,
                min: 0,
                max: 4,
                step: 1,
                onChange: (v: number) => {
                    host.brightness = 1.0 - v * 0.1;
                },
            },
            "Color Banding": {
                value: 50,
                min: 0,
                max: 100,
                step: 1,
                onChange: (v: number) => {
                    host.colorBanding = 255 - v * 2;
                },
            },
            "Texture Filtering": {
                value: host.textureFilterMode,
                options: {
                    Disabled: TextureFilterMode.DISABLED,
                    Bilinear: TextureFilterMode.BILINEAR,
                    Trilinear: TextureFilterMode.TRILINEAR,
                    "Anisotropic 2x": TextureFilterMode.ANISOTROPIC_2X,
                    "Anisotropic 4x": TextureFilterMode.ANISOTROPIC_4X,
                    "Anisotropic 8x": TextureFilterMode.ANISOTROPIC_8X,
                    "Anisotropic 16x": TextureFilterMode.ANISOTROPIC_16X,
                },
                onChange: (v: TextureFilterMode) => {
                    if (v === host.textureFilterMode) {
                        return;
                    }
                    host.textureFilterMode = v;
                    host.updateTextureFiltering();
                },
            },
            "Smooth Terrain": {
                value: host.smoothTerrain,
                onChange: (v: boolean) => {
                    host.setSmoothTerrain(v);
                },
            },
            "Cull Back-faces": {
                value: host.cullBackFace,
                onChange: (v: boolean) => {
                    host.cullBackFace = v;
                },
            },
            "Anti-Aliasing": folder(
                {
                    MSAA: {
                        value: host.msaaEnabled,
                        onChange: (v: boolean) => {
                            host.setMsaa(v);
                        },
                    },
                    FXAA: {
                        value: host.fxaaEnabled,
                        onChange: (v: boolean) => {
                            host.setFxaa(v);
                        },
                    },
                },
                { collapsed: true },
            ),
            Entity: folder(
                {
                    Npcs: {
                        value: host.loadNpcs,
                        onChange: (v: boolean) => {
                            host.setLoadNpcs(v);
                        },
                    },
                },
                { collapsed: true },
            ),
        };

        return schema;
    
}
