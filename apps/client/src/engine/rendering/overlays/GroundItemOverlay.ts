import { vec3 } from "gl-matrix";
import {
    DrawCall,
    App as PicoApp,
    PicoGL,
    Program,
    Texture,
    VertexArray,
    VertexBuffer,
} from "picogl";

import type { GroundItemOverlayEntry } from "@client/engine/game/data/ground/GroundItemStore";
import { BitmapFont } from "@august/osrs-engine/font/BitmapFont";
import { FONT_PLAIN_11 } from "@august/protocol/ui/fonts";
import { Overlay, OverlayInitArgs, OverlayUpdateArgs, RenderPhase } from "@client/engine/rendering/overlays/Overlay";

type CachedTexture = {
    tex: Texture;
    w: number;
    h: number;
};

type ScreenRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type SavedGlState = {
    depthTest: boolean;
    blend: boolean;
    blendSrcRgb: number;
    blendDstRgb: number;
    blendSrcAlpha: number;
    blendDstAlpha: number;
    scissorTest: boolean;
    scissorBox: [number, number, number, number];
};

const SCREEN_VERT_SRC = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_texCoord;
uniform vec2 u_resolution;
out vec2 v_uv;
void main(){
    vec2 zeroToOne = a_position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clip = zeroToTwo - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_uv = a_texCoord;
}`;

const SCREEN_FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_sprite;
uniform vec4 u_tint;
out vec4 fragColor;
void main(){
    vec4 texel = texture(u_sprite, v_uv);
    fragColor = vec4(texel.rgb * u_tint.rgb, texel.a * u_tint.a);
}`;

const H_PADDING = 2;
const V_PADDING = 2;
const TEXT_OUTLINE_RADIUS = 1;
const TEXTURE_CACHE_MAX = 512;

export class GroundItemOverlay implements Overlay {
    constructor(
        _program: Program,
        private ctx: { getCacheSystem: () => any },
    ) {}

    private app!: PicoApp;
    private positions?: VertexBuffer;
    private uvs?: VertexBuffer;
    private array?: VertexArray;
    private drawCall?: DrawCall;
    private screenSize = new Float32Array(2);
    private tint = new Float32Array([1, 1, 1, 1]);
    private quadVerts = new Float32Array(12);
    private quadUvs = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0]);
    private centerWorld = vec3.create();
    private entries: GroundItemOverlayEntry[] = [];
    private lastArgs?: OverlayUpdateArgs;
    private font?: BitmapFont;
    private screenProgram?: Program;
    private textCache: Map<string, CachedTexture> = new Map();

    // Use native-size 11px font to keep text crisp (avoid fractional downscaling blur).
    fontId: number = FONT_PLAIN_11;
    scale: number = 1.0;

    init(args: OverlayInitArgs): void {
        // OverlayManager may be reinitialised after a renderer/cache restart. Release
        // resources owned by the previous app before replacing their handles.
        this.releaseGpuResources();
        this.lastArgs = undefined;
        this.app = args.app;
        this.positions = this.app.createVertexBuffer(PicoGL.FLOAT, 2, new Float32Array(12));
        this.uvs = this.app.createVertexBuffer(PicoGL.FLOAT, 2, new Float32Array(this.quadUvs));
        this.uvs.data(this.quadUvs);
        this.array = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.positions)
            .vertexAttributeBuffer(1, this.uvs);
        this.screenProgram = this.app.createProgram(SCREEN_VERT_SRC, SCREEN_FRAG_SRC);
        this.drawCall = this.app
            .createDrawCall(this.screenProgram, this.array)
            .uniform("u_resolution", this.screenSize)
            .uniform("u_tint", this.tint)
            .primitive(PicoGL.TRIANGLES);
        this.ensureFont();
    }

    update(args: OverlayUpdateArgs): void {
        this.lastArgs = args;
        // Renderer updates overlays multiple times per frame.
        // Only consume groundItems when that field is explicitly present;
        // otherwise preserve entries from the previous update pass.
        if (Object.prototype.hasOwnProperty.call(args.state, "groundItems")) {
            this.entries = Array.isArray(args.state.groundItems) ? args.state.groundItems : [];
        }
    }

    draw(phase: RenderPhase): void {
        if (phase !== RenderPhase.PostPresent) return;
        if (!this.drawCall || !this.positions || !this.uvs) return;
        const args = this.lastArgs;
        if (!args || this.entries.length === 0) return;

        this.screenSize[0] = this.app.width;
        this.screenSize[1] = this.app.height;
        const viewport = this.resolveSceneViewport(args);
        const savedState = this.captureGlState();
        const scale = this.scale || 1.0;

        try {
            this.app.enable(PicoGL.BLEND);
            this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);
            this.app.disable(PicoGL.DEPTH_TEST);

            if (viewport) {
                // Overlay/world coordinates have a top-left origin. WebGL scissor boxes
                // have a bottom-left origin, so flip only the Y coordinate here.
                this.app.enable(PicoGL.SCISSOR_TEST);
                this.app.scissor(
                    viewport.x,
                    this.app.height - (viewport.y + viewport.height),
                    viewport.width,
                    viewport.height,
                );
            }

            for (const entry of this.entries) {
                const baseLabel = typeof entry.label === "string" ? entry.label : "";
                const timerLabel = typeof entry.timerLabel === "string" ? entry.timerLabel : "";
                if (baseLabel.length === 0 && timerLabel.length === 0) {
                    continue;
                }

                // Ground stacks remain keyed to their raw plane. Resolve only the plane
                // used for terrain-height sampling so labels match the rendered item mesh
                // on bridge surfaces without changing stack/interaction semantics.
                const tileX = Math.trunc(entry.tileX);
                const tileY = Math.trunc(entry.tileY);
                const basePlane = Math.trunc(entry.level);
                const heightSamplePlane = args.helpers.getHeightSamplePlaneForTile(
                    tileX,
                    tileY,
                    basePlane,
                );
                const h = args.helpers.sampleHeightAtExactPlane(
                    entry.tileX + 0.5,
                    entry.tileY + 0.5,
                    heightSamplePlane,
                );
                if (!Number.isFinite(h)) continue;

                const line = Math.max(0, entry.line ?? 0);
                const heightOffset = Math.max(0, entry.heightOffsetTiles ?? 0);
                this.centerWorld[0] = entry.tileX + 0.5;
                this.centerWorld[1] = h - heightOffset - 0.05 - line * 0.22;
                this.centerWorld[2] = entry.tileY + 0.5;
                const screenPos = args.helpers.worldToScreen?.(
                    this.centerWorld[0],
                    this.centerWorld[1],
                    this.centerWorld[2],
                );
                if (
                    !screenPos ||
                    !Number.isFinite(screenPos[0]) ||
                    !Number.isFinite(screenPos[1])
                ) {
                    continue;
                }

                const tex = this.getTextTexture(
                    baseLabel,
                    timerLabel,
                    entry.color ?? 0xffffff,
                    Number.isFinite(entry.timerColor) ? (entry.timerColor as number) : 0xffff00,
                    entry.textOutline === true,
                );
                if (!tex) continue;

                const centerX = Math.round(screenPos[0]);
                const centerY = Math.round(screenPos[1]);
                const width = Math.max(1, Math.round(tex.w * scale));
                const heightPx = Math.max(1, Math.round(tex.h * scale));
                const left = centerX - Math.round(width / 2);
                const top = centerY - Math.round(heightPx / 2);
                if (viewport && !this.rectsIntersect(left, top, width, heightPx, viewport)) {
                    continue;
                }

                this.quadVerts[0] = left;
                this.quadVerts[1] = top;
                this.quadVerts[2] = left;
                this.quadVerts[3] = top + heightPx;
                this.quadVerts[4] = left + width;
                this.quadVerts[5] = top + heightPx;
                this.quadVerts[6] = left;
                this.quadVerts[7] = top;
                this.quadVerts[8] = left + width;
                this.quadVerts[9] = top + heightPx;
                this.quadVerts[10] = left + width;
                this.quadVerts[11] = top;

                this.positions.data(this.quadVerts);
                this.tint[0] = 1;
                this.tint[1] = 1;
                this.tint[2] = 1;
                this.tint[3] = 1;
                this.drawCall
                    .uniform("u_resolution", this.screenSize)
                    .uniform("u_tint", this.tint)
                    .texture("u_sprite", tex.tex)
                    .draw();
            }
        } finally {
            this.restoreGlState(savedState);
        }
    }

    dispose(): void {
        this.releaseGpuResources();
        this.lastArgs = undefined;
        this.entries = [];
    }

    private captureGlState(): SavedGlState {
        const gl = this.app.gl;
        const readEnum = (parameter: number, fallback: number): number => {
            const value = Number(gl.getParameter(parameter));
            return Number.isFinite(value) ? value : fallback;
        };
        const rawScissor = gl.getParameter(gl.SCISSOR_BOX) as ArrayLike<number> | null;
        const readScissorComponent = (index: number, fallback: number): number => {
            const value = Number(rawScissor?.[index]);
            return Number.isFinite(value) ? value : fallback;
        };
        const scissorBox: [number, number, number, number] = [
            readScissorComponent(0, 0),
            readScissorComponent(1, 0),
            readScissorComponent(2, this.app.width),
            readScissorComponent(3, this.app.height),
        ];
        return {
            depthTest: gl.isEnabled(PicoGL.DEPTH_TEST),
            blend: gl.isEnabled(PicoGL.BLEND),
            blendSrcRgb: readEnum(gl.BLEND_SRC_RGB, gl.ONE),
            blendDstRgb: readEnum(gl.BLEND_DST_RGB, gl.ZERO),
            blendSrcAlpha: readEnum(gl.BLEND_SRC_ALPHA, gl.ONE),
            blendDstAlpha: readEnum(gl.BLEND_DST_ALPHA, gl.ZERO),
            scissorTest: gl.isEnabled(PicoGL.SCISSOR_TEST),
            scissorBox,
        };
    }

    private restoreGlState(state: SavedGlState): void {
        this.app.blendFuncSeparate(
            state.blendSrcRgb,
            state.blendDstRgb,
            state.blendSrcAlpha,
            state.blendDstAlpha,
        );
        this.app.scissor(...state.scissorBox);
        this.restoreCapability(PicoGL.DEPTH_TEST, state.depthTest);
        this.restoreCapability(PicoGL.BLEND, state.blend);
        this.restoreCapability(PicoGL.SCISSOR_TEST, state.scissorTest);
    }

    private restoreCapability(capability: number, enabled: boolean): void {
        if (enabled) this.app.enable(capability);
        else this.app.disable(capability);
    }

    private resolveSceneViewport(args: OverlayUpdateArgs): ScreenRect | undefined {
        let raw: ScreenRect | undefined;
        try {
            raw = args.helpers.getSceneViewportRect?.();
        } catch {
            return undefined;
        }
        if (
            !raw ||
            !Number.isFinite(raw.x) ||
            !Number.isFinite(raw.y) ||
            !Number.isFinite(raw.width) ||
            !Number.isFinite(raw.height) ||
            raw.width <= 0 ||
            raw.height <= 0
        ) {
            return undefined;
        }

        const left = Math.max(0, Math.min(this.app.width, Math.round(raw.x)));
        const top = Math.max(0, Math.min(this.app.height, Math.round(raw.y)));
        const right = Math.max(
            left,
            Math.min(this.app.width, Math.round(raw.x + raw.width)),
        );
        const bottom = Math.max(
            top,
            Math.min(this.app.height, Math.round(raw.y + raw.height)),
        );
        if (right <= left || bottom <= top) return undefined;
        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    private rectsIntersect(
        x: number,
        y: number,
        width: number,
        height: number,
        bounds: ScreenRect,
    ): boolean {
        return (
            x < bounds.x + bounds.width &&
            x + width > bounds.x &&
            y < bounds.y + bounds.height &&
            y + height > bounds.y
        );
    }

    private releaseGpuResources(): void {
        this.deleteGpuObject(this.drawCall);
        this.deleteGpuObject(this.array);
        this.deleteGpuObject(this.positions);
        this.deleteGpuObject(this.uvs);
        this.deleteGpuObject(this.screenProgram);
        for (const cached of this.textCache.values()) {
            this.deleteGpuObject(cached.tex);
        }
        this.positions = undefined;
        this.uvs = undefined;
        this.array = undefined;
        this.drawCall = undefined;
        this.screenProgram = undefined;
        this.font = undefined;
        this.textCache.clear();
    }

    private deleteGpuObject(resource?: unknown): void {
        try {
            (resource as { delete?: () => unknown } | undefined)?.delete?.();
        } catch {}
    }

    private ensureFont(): void {
        try {
            if (this.font) return;
            let font = BitmapFont.tryLoad(this.ctx.getCacheSystem(), this.fontId);
            if (!font && this.fontId !== FONT_PLAIN_11) {
                font = BitmapFont.tryLoad(this.ctx.getCacheSystem(), FONT_PLAIN_11);
            }
            if (font) this.font = font;
        } catch (e) {
            console.error("GroundItemOverlay: failed to load font", e);
        }
    }

    private getTextTexture(
        baseLabel: string,
        timerLabel: string,
        baseColor: number,
        timerColor: number,
        textOutline: boolean,
    ): CachedTexture | undefined {
        this.ensureFont();
        const font = this.font;
        if (!font) return undefined;

        const key = `${textOutline ? 1 : 0}|${baseColor >>> 0}|${timerColor >>> 0}|${baseLabel}|${timerLabel}`;
        const cached = this.textCache.get(key);
        if (cached) {
            return cached;
        }

        const baseWidth = baseLabel.length > 0 ? font.measure(baseLabel) : 0;
        const timerWidth = timerLabel.length > 0 ? font.measure(timerLabel) : 0;
        const outlinePadding = textOutline ? TEXT_OUTLINE_RADIUS : 0;
        const width = Math.max(
            1,
            Math.ceil(H_PADDING * 2 + outlinePadding * 2 + baseWidth + timerWidth),
        );
        const ascent = font.maxAscent || font.ascent || 11;
        const descent = font.maxDescent || 2;
        const height = Math.max(
            1,
            Math.ceil(V_PADDING * 2 + outlinePadding * 2 + ascent + descent),
        );

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", {
            willReadFrequently: true as any,
        }) as CanvasRenderingContext2D | null;
        if (!ctx) return undefined;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const baseline = V_PADDING + outlinePadding + ascent;
        const baseX = H_PADDING + outlinePadding;
        const timerX = baseX + baseWidth;

        // Render every black neighbor first, then both colored runs. Drawing the two
        // outlines as one composite pass avoids a dark seam where the timer begins.
        if (textOutline) {
            for (let dy = -TEXT_OUTLINE_RADIUS; dy <= TEXT_OUTLINE_RADIUS; dy++) {
                for (let dx = -TEXT_OUTLINE_RADIUS; dx <= TEXT_OUTLINE_RADIUS; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    if (baseLabel.length > 0) {
                        font.draw(ctx, baseLabel, baseX + dx, baseline + dy, "#000000");
                    }
                    if (timerLabel.length > 0) {
                        font.draw(ctx, timerLabel, timerX + dx, baseline + dy, "#000000");
                    }
                }
            }
        }

        if (baseLabel.length > 0) {
            font.draw(
                ctx,
                baseLabel,
                baseX,
                baseline,
                `#${(baseColor >>> 0).toString(16).padStart(6, "0")}`,
            );
        }
        if (timerLabel.length > 0) {
            font.draw(
                ctx,
                timerLabel,
                timerX,
                baseline,
                `#${(timerColor >>> 0).toString(16).padStart(6, "0")}`,
            );
        }

        const tex = this.app.createTexture2D(canvas as any, {
            flipY: false,
            minFilter: PicoGL.NEAREST,
            magFilter: PicoGL.NEAREST,
            wrapS: PicoGL.CLAMP_TO_EDGE,
            wrapT: PicoGL.CLAMP_TO_EDGE,
        });
        const next: CachedTexture = { tex, w: canvas.width, h: canvas.height };
        if (this.textCache.size >= TEXTURE_CACHE_MAX) {
            const firstKey = this.textCache.keys().next().value;
            if (firstKey !== undefined) {
                const first = this.textCache.get(firstKey);
                try {
                    first?.tex.delete?.();
                } catch {}
                this.textCache.delete(firstKey);
            }
        }
        this.textCache.set(key, next);
        return next;
    }
}
