import {
    App as PicoApp,
    DrawCall,
    PicoGL,
    Program,
    UniformBuffer,
    VertexArray,
    VertexBuffer,
} from "picogl";

import {
    Overlay,
    OverlayInitArgs,
    OverlayUpdateArgs,
    RenderPhase,
} from "@client/engine/rendering/overlays/Overlay";

/**
 * Render-only description of the strongest ground-item effect selected for a tile.
 * Classification, stack aggregation, and precedence intentionally live upstream.
 */
export interface GroundItemEffectEntry {
    tileX: number;
    tileY: number;
    level: number;
    /** RGB color encoded as 0xRRGGBB. Omit to suppress the tile marker. */
    tileColor?: number;
    /** Interior opacity in the inclusive 0..1 range. The outline remains visible at 0. */
    tileFillAlpha?: number;
    /** RGB color encoded as 0xRRGGBB. Omit to suppress the loot beam. */
    beamColor?: number;
    /** `modern` is a crisp scanning column; `light` is a smaller soft tapered glow. */
    beamStyle: "modern" | "light";
}

const SCENE_UNIFORMS = `
layout(std140, column_major) uniform;

uniform SceneUniforms {
    mat4 u_viewProjMatrix;
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
    vec4 u_skyColor;
    vec4 u_sceneHslOverride;
    vec2 u_cameraPos;
    vec2 u_playerPos;
    float u_renderDistance;
    float u_fogDepth;
    float u_currentTime;
    float u_brightness;
    float u_colorBanding;
    float u_isNewTextureAnim;
};
`;

const TILE_VERT_SRC = `#version 300 es
precision highp float;
${SCENE_UNIFORMS}

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

out vec4 v_color;

void main() {
    gl_Position = u_projectionMatrix * (u_viewMatrix * vec4(a_position, 1.0));
    v_color = a_color;
}
`;

const TILE_FRAG_SRC = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
    if (v_color.a <= 0.001) discard;
    fragColor = v_color;
}
`;

const BEAM_VERT_SRC = `#version 300 es
precision highp float;
${SCENE_UNIFORMS}

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;
layout(location = 2) in vec3 a_effect;

out vec4 v_color;
out vec3 v_effect;

void main() {
    gl_Position = u_projectionMatrix * (u_viewMatrix * vec4(a_position, 1.0));
    v_color = a_color;
    v_effect = a_effect;
}
`;

const BEAM_FRAG_SRC = `#version 300 es
precision highp float;

in vec4 v_color;
in vec3 v_effect;

uniform float u_time;
out vec4 fragColor;

void main() {
    float across = clamp(1.0 - abs(v_effect.x), 0.0, 1.0);
    float height = clamp(v_effect.y, 0.0, 1.0);
    float baseFade = smoothstep(0.0, 0.035, height);
    float topFade = 1.0 - smoothstep(0.68, 1.0, height);
    float alpha;
    vec3 color = v_color.rgb;

    if (v_effect.z < 0.5) {
        // Modern: a crisp column with a bright band travelling upward.
        float core = smoothstep(0.02, 0.72, across);
        float scanPhase = fract(height * 1.75 - u_time * 0.42);
        float scan = 1.0 - smoothstep(0.0, 0.16, abs(scanPhase - 0.5));
        float pulse = 0.84 + 0.16 * sin(u_time * 4.2 + height * 8.0);
        alpha = v_color.a * (0.30 + core * 0.70) * (0.72 + scan * 0.28) *
                baseFade * topFade * pulse;
        color *= 0.86 + scan * 0.28;
    } else {
        // Light: a compact, feathered pillar with a slow breathing glow.
        float halo = across * across * (3.0 - 2.0 * across);
        float breathe = 0.76 + 0.24 * sin(u_time * 2.4 + height * 4.0);
        float crown = 1.0 - smoothstep(0.45, 1.0, height);
        alpha = v_color.a * halo * (0.62 + crown * 0.38) *
                baseFade * topFade * breathe;
        color = mix(vec3(1.0), color, 0.76);
    }

    if (alpha <= 0.003) discard;
    fragColor = vec4(color, alpha);
}
`;

const TILE_FLOATS_PER_VERTEX = 7;
const BEAM_FLOATS_PER_VERTEX = 10;
const TILE_STRIDE_BYTES = TILE_FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
const BEAM_STRIDE_BYTES = BEAM_FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
const TILE_VERTICES_PER_ENTRY = 30; // one fill quad + four triangle-strip-shaped borders
const MAX_BEAM_VERTICES_PER_ENTRY = 18; // three crossed quads
const INITIAL_TILE_VERTEX_CAPACITY = 64;
const INITIAL_BEAM_VERTEX_CAPACITY = 64;
const TILE_INSET = 0.055;
const TILE_BORDER_WIDTH = 0.045;
const TILE_FILL_LIFT = 0.018;
const TILE_BORDER_LIFT = 0.026;
const EMPTY_EFFECT_ENTRIES: ReadonlyArray<GroundItemEffectEntry> = Object.freeze([]);

type HeightSampler = OverlayUpdateArgs["helpers"]["sampleHeightAtExactPlane"];
type HeightSamplePlaneResolver = OverlayUpdateArgs["helpers"]["getHeightSamplePlaneForTile"];

type SavedGlState = {
    depthTest: boolean;
    depthWrite: boolean;
    cullFace: boolean;
    blend: boolean;
    blendSrcRgb: number;
    blendDstRgb: number;
    blendSrcAlpha: number;
    blendDstAlpha: number;
};

/**
 * Depth-tested world effects for ground-item tiles. Geometry is cached in reusable typed
 * arrays and rebuilt when the pre-classified presentation array changes.
 */
export class GroundItemEffectsOverlay implements Overlay {
    private app?: PicoApp;
    private sceneUniforms?: UniformBuffer;
    private tileProgram?: Program;
    private beamProgram?: Program;

    private tileBuffer?: VertexBuffer;
    private tileArray?: VertexArray;
    private tileDrawCall?: DrawCall;
    private tileData = new Float32Array(
        INITIAL_TILE_VERTEX_CAPACITY * TILE_FLOATS_PER_VERTEX,
    );
    private tileVertexCapacity = INITIAL_TILE_VERTEX_CAPACITY;
    private tileVertexCount = 0;
    private tileWriteOffset = 0;

    private beamBuffer?: VertexBuffer;
    private beamArray?: VertexArray;
    private beamDrawCall?: DrawCall;
    private beamData = new Float32Array(
        INITIAL_BEAM_VERTEX_CAPACITY * BEAM_FLOATS_PER_VERTEX,
    );
    private beamVertexCapacity = INITIAL_BEAM_VERTEX_CAPACITY;
    private beamVertexCount = 0;
    private beamWriteOffset = 0;

    private entries: ReadonlyArray<GroundItemEffectEntry> = EMPTY_EFFECT_ENTRIES;
    private sampleHeight?: HeightSampler;
    private resolveHeightSamplePlane?: HeightSamplePlaneResolver;
    private timeSeconds = 0;
    private geometryDirty = true;

    // Reused 4x4 terrain sample grid for the fill and four border rectangles.
    private readonly tileXs = new Float64Array(4);
    private readonly tileZs = new Float64Array(4);
    private readonly tileHeights = new Float64Array(16);

    init(args: OverlayInitArgs): void {
        this.releaseGpuResources();
        this.app = args.app;
        this.sceneUniforms = args.sceneUniforms;
        this.tileProgram = this.app.createProgram(TILE_VERT_SRC, TILE_FRAG_SRC);
        this.beamProgram = this.app.createProgram(BEAM_VERT_SRC, BEAM_FRAG_SRC);
        this.createTileGpuResources(this.tileVertexCapacity);
        this.createBeamGpuResources(this.beamVertexCapacity);
        this.geometryDirty = true;
    }

    update(args: OverlayUpdateArgs): void {
        this.sampleHeight = args.helpers.sampleHeightAtExactPlane;
        this.resolveHeightSamplePlane = args.helpers.getHeightSamplePlaneForTile;
        this.timeSeconds = Number.isFinite(args.time) ? args.time / 1000 : 0;

        // Several overlay phases share the manager. Only explicit state updates replace
        // the current effects so label-only phases cannot accidentally clear them.
        if (Object.prototype.hasOwnProperty.call(args.state, "groundItemEffects")) {
            const nextEntries = Array.isArray(args.state.groundItemEffects)
                ? args.state.groundItemEffects
                : EMPTY_EFFECT_ENTRIES;
            if (nextEntries !== this.entries) {
                const geometryChanged = !this.hasEquivalentGeometryEntries(
                    this.entries,
                    nextEntries,
                );
                this.entries = nextEntries;
                if (geometryChanged) {
                    this.geometryDirty = true;
                }
            }
        }
    }

    draw(phase: RenderPhase): void {
        if (phase !== RenderPhase.ToSceneFramebuffer) return;
        if (
            !this.app ||
            !this.sampleHeight ||
            !this.resolveHeightSamplePlane ||
            this.entries.length === 0
        ) {
            return;
        }

        const savedState = this.captureGlState();
        try {
            if (this.geometryDirty) {
                this.buildGeometry();
            }
            if (this.tileVertexCount === 0 && this.beamVertexCount === 0) {
                this.geometryDirty = false;
                return;
            }

            this.app.enable(PicoGL.DEPTH_TEST);
            this.app.depthMask(false);
            this.app.disable(PicoGL.CULL_FACE);
            this.app.enable(PicoGL.BLEND);
            this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

            if (this.geometryDirty) {
                if (this.tileVertexCount > 0 && this.tileBuffer) {
                    this.tileBuffer.data(this.tileData.subarray(0, this.tileWriteOffset));
                }
                if (this.beamVertexCount > 0 && this.beamBuffer) {
                    this.beamBuffer.data(this.beamData.subarray(0, this.beamWriteOffset));
                }
                this.geometryDirty = false;
            }

            if (this.tileVertexCount > 0 && this.tileDrawCall) {
                this.tileDrawCall
                    .primitive(PicoGL.TRIANGLES)
                    .drawRanges([0, this.tileVertexCount])
                    .draw();
            }

            if (this.beamVertexCount > 0 && this.beamDrawCall) {
                this.beamDrawCall
                    .uniform("u_time", this.timeSeconds)
                    .primitive(PicoGL.TRIANGLES)
                    .drawRanges([0, this.beamVertexCount])
                    .draw();
            }
        } finally {
            this.restoreGlState(savedState);
        }
    }

    dispose(): void {
        this.releaseGpuResources();
        this.app = undefined;
        this.sceneUniforms = undefined;
        this.entries = EMPTY_EFFECT_ENTRIES;
        this.sampleHeight = undefined;
        this.resolveHeightSamplePlane = undefined;
        this.tileVertexCount = 0;
        this.tileWriteOffset = 0;
        this.beamVertexCount = 0;
        this.beamWriteOffset = 0;
        this.geometryDirty = true;
    }

    private buildGeometry(): void {
        const requestedTileVertices = this.entries.length * TILE_VERTICES_PER_ENTRY;
        const requestedBeamVertices = this.entries.length * MAX_BEAM_VERTICES_PER_ENTRY;
        this.ensureTileCapacity(requestedTileVertices);
        this.ensureBeamCapacity(requestedBeamVertices);

        this.tileVertexCount = 0;
        this.tileWriteOffset = 0;
        this.beamVertexCount = 0;
        this.beamWriteOffset = 0;

        for (let i = 0; i < this.entries.length; i++) {
            const entry = this.entries[i];
            if (!this.isValidEntry(entry)) continue;

            const tileX = Math.trunc(entry.tileX);
            const tileY = Math.trunc(entry.tileY);
            const basePlane = Math.trunc(entry.level);
            const heightSamplePlane =
                this.resolveHeightSamplePlane!(tileX, tileY, basePlane) | 0;

            if (Number.isFinite(entry.tileColor)) {
                this.appendTile(entry, tileX, tileY, heightSamplePlane);
            }
            if (Number.isFinite(entry.beamColor)) {
                this.appendBeam(entry, tileX, tileY, heightSamplePlane);
            }
        }
    }

    private captureGlState(): SavedGlState {
        const gl = this.app!.gl;
        const readEnum = (parameter: number, fallback: number): number => {
            const value = Number(gl.getParameter(parameter));
            return Number.isFinite(value) ? value : fallback;
        };
        return {
            depthTest: gl.isEnabled(PicoGL.DEPTH_TEST),
            depthWrite: gl.getParameter(gl.DEPTH_WRITEMASK) !== false,
            cullFace: gl.isEnabled(PicoGL.CULL_FACE),
            blend: gl.isEnabled(PicoGL.BLEND),
            blendSrcRgb: readEnum(gl.BLEND_SRC_RGB, gl.ONE),
            blendDstRgb: readEnum(gl.BLEND_DST_RGB, gl.ZERO),
            blendSrcAlpha: readEnum(gl.BLEND_SRC_ALPHA, gl.ONE),
            blendDstAlpha: readEnum(gl.BLEND_DST_ALPHA, gl.ZERO),
        };
    }

    private restoreGlState(state: SavedGlState): void {
        const app = this.app!;
        app.depthMask(state.depthWrite);
        app.blendFuncSeparate(
            state.blendSrcRgb,
            state.blendDstRgb,
            state.blendSrcAlpha,
            state.blendDstAlpha,
        );
        this.restoreCapability(PicoGL.DEPTH_TEST, state.depthTest);
        this.restoreCapability(PicoGL.CULL_FACE, state.cullFace);
        this.restoreCapability(PicoGL.BLEND, state.blend);
    }

    private restoreCapability(capability: number, enabled: boolean): void {
        if (enabled) this.app!.enable(capability);
        else this.app!.disable(capability);
    }

    private appendTile(
        entry: GroundItemEffectEntry,
        tileX: number,
        tileY: number,
        plane: number,
    ): void {
        const color = (entry.tileColor as number) >>> 0;
        const red = ((color >>> 16) & 0xff) / 255;
        const green = ((color >>> 8) & 0xff) / 255;
        const blue = (color & 0xff) / 255;
        const fillAlpha = this.clamp01(
            Number.isFinite(entry.tileFillAlpha) ? (entry.tileFillAlpha as number) : 0.16,
        );
        const outlineAlpha = Math.max(0.78, Math.min(1, fillAlpha + 0.56));

        const x0 = tileX + TILE_INSET;
        const x1 = x0 + TILE_BORDER_WIDTH;
        const x3 = tileX + 1 - TILE_INSET;
        const x2 = x3 - TILE_BORDER_WIDTH;
        const z0 = tileY + TILE_INSET;
        const z1 = z0 + TILE_BORDER_WIDTH;
        const z3 = tileY + 1 - TILE_INSET;
        const z2 = z3 - TILE_BORDER_WIDTH;

        this.tileXs[0] = x0;
        this.tileXs[1] = x1;
        this.tileXs[2] = x2;
        this.tileXs[3] = x3;
        this.tileZs[0] = z0;
        this.tileZs[1] = z1;
        this.tileZs[2] = z2;
        this.tileZs[3] = z3;

        for (let z = 0; z < 4; z++) {
            for (let x = 0; x < 4; x++) {
                const height = this.sampleHeight!(
                    this.tileXs[x],
                    this.tileZs[z],
                    plane,
                );
                if (!Number.isFinite(height)) return;
                this.tileHeights[z * 4 + x] = height;
            }
        }

        if (fillAlpha > 0) {
            this.appendTileGridQuad(0, 0, 3, 3, red, green, blue, fillAlpha, TILE_FILL_LIFT);
        }
        // The outline is four thin triangle rectangles, not GL lines. This keeps its
        // thickness deterministic on ANGLE, Mesa, Safari, and native WebGL drivers.
        this.appendTileGridQuad(0, 0, 1, 3, red, green, blue, outlineAlpha, TILE_BORDER_LIFT);
        this.appendTileGridQuad(2, 0, 3, 3, red, green, blue, outlineAlpha, TILE_BORDER_LIFT);
        this.appendTileGridQuad(1, 0, 2, 1, red, green, blue, outlineAlpha, TILE_BORDER_LIFT);
        this.appendTileGridQuad(1, 2, 2, 3, red, green, blue, outlineAlpha, TILE_BORDER_LIFT);
    }

    private appendTileGridQuad(
        x0Index: number,
        z0Index: number,
        x1Index: number,
        z1Index: number,
        red: number,
        green: number,
        blue: number,
        alpha: number,
        lift: number,
    ): void {
        const x0 = this.tileXs[x0Index];
        const x1 = this.tileXs[x1Index];
        const z0 = this.tileZs[z0Index];
        const z1 = this.tileZs[z1Index];
        const h00 = this.tileHeights[z0Index * 4 + x0Index] - lift;
        const h01 = this.tileHeights[z1Index * 4 + x0Index] - lift;
        const h11 = this.tileHeights[z1Index * 4 + x1Index] - lift;
        const h10 = this.tileHeights[z0Index * 4 + x1Index] - lift;

        this.appendTileVertex(x0, h00, z0, red, green, blue, alpha);
        this.appendTileVertex(x0, h01, z1, red, green, blue, alpha);
        this.appendTileVertex(x1, h11, z1, red, green, blue, alpha);
        this.appendTileVertex(x0, h00, z0, red, green, blue, alpha);
        this.appendTileVertex(x1, h11, z1, red, green, blue, alpha);
        this.appendTileVertex(x1, h10, z0, red, green, blue, alpha);
    }

    private appendTileVertex(
        x: number,
        y: number,
        z: number,
        red: number,
        green: number,
        blue: number,
        alpha: number,
    ): void {
        const data = this.tileData;
        let offset = this.tileWriteOffset;
        data[offset++] = x;
        data[offset++] = y;
        data[offset++] = z;
        data[offset++] = red;
        data[offset++] = green;
        data[offset++] = blue;
        data[offset++] = alpha;
        this.tileWriteOffset = offset;
        this.tileVertexCount++;
    }

    private appendBeam(
        entry: GroundItemEffectEntry,
        tileX: number,
        tileY: number,
        plane: number,
    ): void {
        const color = (entry.beamColor as number) >>> 0;
        const red = ((color >>> 16) & 0xff) / 255;
        const green = ((color >>> 8) & 0xff) / 255;
        const blue = (color & 0xff) / 255;
        const style = entry.beamStyle === "light" ? 1 : 0;
        const centerX = tileX + 0.5;
        const centerZ = tileY + 0.5;
        const sampledGroundY = this.sampleHeight!(centerX, centerZ, plane);
        if (!Number.isFinite(sampledGroundY)) return;
        const groundY = sampledGroundY - 0.035;

        if (style === 0) {
            const halfWidth = 0.24;
            const topY = groundY - 3.4;
            // Three upright slices give the crisp beam stable volume from any camera angle.
            this.appendBeamQuad(
                centerX - halfWidth,
                centerZ,
                centerX + halfWidth,
                centerZ,
                centerX - halfWidth,
                centerZ,
                centerX + halfWidth,
                centerZ,
                groundY,
                topY,
                red,
                green,
                blue,
                0.34,
                style,
            );
            this.appendRotatedBeamQuad(
                centerX,
                centerZ,
                halfWidth,
                Math.PI / 3,
                halfWidth,
                groundY,
                topY,
                red,
                green,
                blue,
                0.34,
                style,
            );
            this.appendRotatedBeamQuad(
                centerX,
                centerZ,
                halfWidth,
                (Math.PI * 2) / 3,
                halfWidth,
                groundY,
                topY,
                red,
                green,
                blue,
                0.34,
                style,
            );
            return;
        }

        const bottomHalfWidth = 0.48;
        const topHalfWidth = 0.11;
        const topY = groundY - 2.45;
        // Light mode is deliberately smaller and tapered, with two soft crossed planes.
        this.appendRotatedBeamQuad(
            centerX,
            centerZ,
            bottomHalfWidth,
            Math.PI / 4,
            topHalfWidth,
            groundY,
            topY,
            red,
            green,
            blue,
            0.25,
            style,
        );
        this.appendRotatedBeamQuad(
            centerX,
            centerZ,
            bottomHalfWidth,
            (Math.PI * 3) / 4,
            topHalfWidth,
            groundY,
            topY,
            red,
            green,
            blue,
            0.25,
            style,
        );
    }

    private appendRotatedBeamQuad(
        centerX: number,
        centerZ: number,
        bottomHalfWidth: number,
        angle: number,
        topHalfWidth: number,
        bottomY: number,
        topY: number,
        red: number,
        green: number,
        blue: number,
        alpha: number,
        style: number,
    ): void {
        const directionX = Math.cos(angle);
        const directionZ = Math.sin(angle);
        this.appendBeamQuad(
            centerX - directionX * bottomHalfWidth,
            centerZ - directionZ * bottomHalfWidth,
            centerX + directionX * bottomHalfWidth,
            centerZ + directionZ * bottomHalfWidth,
            centerX - directionX * topHalfWidth,
            centerZ - directionZ * topHalfWidth,
            centerX + directionX * topHalfWidth,
            centerZ + directionZ * topHalfWidth,
            bottomY,
            topY,
            red,
            green,
            blue,
            alpha,
            style,
        );
    }

    private appendBeamQuad(
        bottomLeftX: number,
        bottomLeftZ: number,
        bottomRightX: number,
        bottomRightZ: number,
        topLeftX: number,
        topLeftZ: number,
        topRightX: number,
        topRightZ: number,
        bottomY: number,
        topY: number,
        red: number,
        green: number,
        blue: number,
        alpha: number,
        style: number,
    ): void {
        this.appendBeamVertex(
            bottomLeftX,
            bottomY,
            bottomLeftZ,
            red,
            green,
            blue,
            alpha,
            -1,
            0,
            style,
        );
        this.appendBeamVertex(
            topLeftX,
            topY,
            topLeftZ,
            red,
            green,
            blue,
            alpha,
            -1,
            1,
            style,
        );
        this.appendBeamVertex(
            topRightX,
            topY,
            topRightZ,
            red,
            green,
            blue,
            alpha,
            1,
            1,
            style,
        );
        this.appendBeamVertex(
            bottomLeftX,
            bottomY,
            bottomLeftZ,
            red,
            green,
            blue,
            alpha,
            -1,
            0,
            style,
        );
        this.appendBeamVertex(
            topRightX,
            topY,
            topRightZ,
            red,
            green,
            blue,
            alpha,
            1,
            1,
            style,
        );
        this.appendBeamVertex(
            bottomRightX,
            bottomY,
            bottomRightZ,
            red,
            green,
            blue,
            alpha,
            1,
            0,
            style,
        );
    }

    private appendBeamVertex(
        x: number,
        y: number,
        z: number,
        red: number,
        green: number,
        blue: number,
        alpha: number,
        across: number,
        height: number,
        style: number,
    ): void {
        const data = this.beamData;
        let offset = this.beamWriteOffset;
        data[offset++] = x;
        data[offset++] = y;
        data[offset++] = z;
        data[offset++] = red;
        data[offset++] = green;
        data[offset++] = blue;
        data[offset++] = alpha;
        data[offset++] = across;
        data[offset++] = height;
        data[offset++] = style;
        this.beamWriteOffset = offset;
        this.beamVertexCount++;
    }

    private ensureTileCapacity(requiredVertices: number): void {
        if (requiredVertices <= this.tileVertexCapacity) return;
        this.tileVertexCapacity = this.nextPowerOfTwo(requiredVertices);
        this.tileData = new Float32Array(this.tileVertexCapacity * TILE_FLOATS_PER_VERTEX);
        if (this.app && this.tileProgram && this.sceneUniforms) {
            this.releaseTileGpuResources();
            this.createTileGpuResources(this.tileVertexCapacity);
        }
    }

    private ensureBeamCapacity(requiredVertices: number): void {
        if (requiredVertices <= this.beamVertexCapacity) return;
        this.beamVertexCapacity = this.nextPowerOfTwo(requiredVertices);
        this.beamData = new Float32Array(this.beamVertexCapacity * BEAM_FLOATS_PER_VERTEX);
        if (this.app && this.beamProgram && this.sceneUniforms) {
            this.releaseBeamGpuResources();
            this.createBeamGpuResources(this.beamVertexCapacity);
        }
    }

    private createTileGpuResources(vertexCapacity: number): void {
        if (!this.app || !this.tileProgram || !this.sceneUniforms) return;
        this.tileBuffer = this.app.createInterleavedBuffer(
            TILE_STRIDE_BYTES,
            vertexCapacity * TILE_STRIDE_BYTES,
            PicoGL.DYNAMIC_DRAW,
        );
        this.tileArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.tileBuffer, {
                type: PicoGL.FLOAT,
                size: 3,
                stride: TILE_STRIDE_BYTES,
                offset: 0,
            })
            .vertexAttributeBuffer(1, this.tileBuffer, {
                type: PicoGL.FLOAT,
                size: 4,
                stride: TILE_STRIDE_BYTES,
                offset: 3 * Float32Array.BYTES_PER_ELEMENT,
            });
        this.tileDrawCall = this.app
            .createDrawCall(this.tileProgram, this.tileArray)
            .uniformBlock("SceneUniforms", this.sceneUniforms)
            .primitive(PicoGL.TRIANGLES);
    }

    private createBeamGpuResources(vertexCapacity: number): void {
        if (!this.app || !this.beamProgram || !this.sceneUniforms) return;
        this.beamBuffer = this.app.createInterleavedBuffer(
            BEAM_STRIDE_BYTES,
            vertexCapacity * BEAM_STRIDE_BYTES,
            PicoGL.DYNAMIC_DRAW,
        );
        this.beamArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.beamBuffer, {
                type: PicoGL.FLOAT,
                size: 3,
                stride: BEAM_STRIDE_BYTES,
                offset: 0,
            })
            .vertexAttributeBuffer(1, this.beamBuffer, {
                type: PicoGL.FLOAT,
                size: 4,
                stride: BEAM_STRIDE_BYTES,
                offset: 3 * Float32Array.BYTES_PER_ELEMENT,
            })
            .vertexAttributeBuffer(2, this.beamBuffer, {
                type: PicoGL.FLOAT,
                size: 3,
                stride: BEAM_STRIDE_BYTES,
                offset: 7 * Float32Array.BYTES_PER_ELEMENT,
            });
        this.beamDrawCall = this.app
            .createDrawCall(this.beamProgram, this.beamArray)
            .uniformBlock("SceneUniforms", this.sceneUniforms)
            .uniform("u_time", 0)
            .primitive(PicoGL.TRIANGLES);
    }

    private releaseGpuResources(): void {
        this.releaseTileGpuResources();
        this.releaseBeamGpuResources();
        this.deleteGpuObject(this.tileProgram);
        this.deleteGpuObject(this.beamProgram);
        this.tileProgram = undefined;
        this.beamProgram = undefined;
    }

    private releaseTileGpuResources(): void {
        this.deleteGpuObject(this.tileArray);
        this.deleteGpuObject(this.tileBuffer);
        this.tileDrawCall = undefined;
        this.tileArray = undefined;
        this.tileBuffer = undefined;
    }

    private releaseBeamGpuResources(): void {
        this.deleteGpuObject(this.beamArray);
        this.deleteGpuObject(this.beamBuffer);
        this.beamDrawCall = undefined;
        this.beamArray = undefined;
        this.beamBuffer = undefined;
    }

    private deleteGpuObject(resource?: { delete?: () => unknown }): void {
        try {
            resource?.delete?.();
        } catch {}
    }

    private isValidEntry(entry: GroundItemEffectEntry | undefined): entry is GroundItemEffectEntry {
        return !!entry &&
            Number.isFinite(entry.tileX) &&
            Number.isFinite(entry.tileY) &&
            Number.isFinite(entry.level);
    }

    /**
     * Presentation data may be rebuilt for label-only changes such as despawn timers.
     * Compare the small, capped effect list before invalidating terrain geometry so those
     * replacements do not trigger height resampling and GPU uploads for identical visuals.
     */
    private hasEquivalentGeometryEntries(
        current: ReadonlyArray<GroundItemEffectEntry>,
        next: ReadonlyArray<GroundItemEffectEntry>,
    ): boolean {
        if (current.length !== next.length) return false;
        for (let i = 0; i < current.length; i++) {
            const a = current[i];
            const b = next[i];
            if (
                a.tileX !== b.tileX ||
                a.tileY !== b.tileY ||
                a.level !== b.level ||
                a.tileColor !== b.tileColor ||
                a.tileFillAlpha !== b.tileFillAlpha ||
                a.beamColor !== b.beamColor ||
                a.beamStyle !== b.beamStyle
            ) {
                return false;
            }
        }
        return true;
    }

    private clamp01(value: number): number {
        return Math.max(0, Math.min(1, value));
    }

    private nextPowerOfTwo(value: number): number {
        let result = 1;
        while (result < value) result *= 2;
        return result;
    }
}
