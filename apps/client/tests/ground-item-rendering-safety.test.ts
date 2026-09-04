import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mat4 } from "gl-matrix";

async function main(): Promise<void> {
    const previousSelf = (globalThis as { self?: unknown }).self;
    (globalThis as { self?: unknown }).self = globalThis;

    // PicoGL's Node entry is a UMD default while browser builds expose named exports.
    const testRequire = createRequire(process.cwd() + "/package.json");
    const picoGlNode = testRequire("picogl") as { PicoGL?: unknown };
    if (!picoGlNode.PicoGL) picoGlNode.PicoGL = picoGlNode;

    try {
        const [{ GroundItemEffectsOverlay }, { GroundItemOverlay }, { RenderPhase }, pick] =
            await Promise.all([
                import("@client/engine/rendering/overlays/GroundItemEffectsOverlay"),
                import("@client/engine/rendering/overlays/GroundItemOverlay"),
                import("@client/engine/rendering/overlays/Overlay"),
                import("@client/engine/rendering/render/terrain/pick"),
            ]);

        const effectEntries = [
            {
                tileX: 3200,
                tileY: 3201,
                level: 1,
                tileColor: 0x00ff00,
                tileFillAlpha: 0.2,
                beamColor: 0xff0000,
                beamStyle: "modern" as const,
            },
        ];
        const sampledPlanes: number[] = [];
        const effects = new GroundItemEffectsOverlay();
        const effectsInternal = effects as unknown as {
            entries: typeof effectEntries;
            sampleHeight: (x: number, y: number, plane: number) => number;
            resolveHeightSamplePlane: (x: number, y: number, plane: number) => number;
            geometryDirty: boolean;
            tileVertexCount: number;
            beamVertexCount: number;
            buildGeometry: () => void;
        };
        effectsInternal.entries = effectEntries;
        effectsInternal.sampleHeight = (_x, _y, plane) => {
            sampledPlanes.push(plane);
            return 0;
        };
        effectsInternal.resolveHeightSamplePlane = (_x, _y, basePlane) => basePlane + 1;
        effectsInternal.buildGeometry();
        assert.ok(sampledPlanes.length > 0);
        assert.ok(
            sampledPlanes.every((plane) => plane === 2),
            "tile and beam geometry must sample the render-height plane",
        );
        assert.equal(effectsInternal.tileVertexCount, 30);
        assert.equal(effectsInternal.beamVertexCount, 18);

        const sharedUpdateArgs = {
            time: 0,
            deltaTime: 0,
            state: { groundItemEffects: effectEntries },
            helpers: {
                sampleHeightAtExactPlane: effectsInternal.sampleHeight,
                getHeightSamplePlaneForTile: effectsInternal.resolveHeightSamplePlane,
            },
        } as never;
        effectsInternal.geometryDirty = false;
        effects.update(sharedUpdateArgs);
        assert.equal(
            effectsInternal.geometryDirty,
            false,
            "the same presentation array must not rebuild effect geometry",
        );
        effects.update({
            ...(sharedUpdateArgs as object),
            state: { groundItemEffects: effectEntries.slice() },
        } as never);
        assert.equal(
            effectsInternal.geometryDirty,
            false,
            "an equivalent replacement array must reuse effect geometry",
        );
        effects.update({
            ...(sharedUpdateArgs as object),
            state: {
                groundItemEffects: [
                    {
                        ...effectEntries[0],
                        beamColor: 0x00ffff,
                    },
                ],
            },
        } as never);
        assert.equal(
            effectsInternal.geometryDirty,
            true,
            "a visual effect change must invalidate effect geometry",
        );

        const enabled = new Set<number>([0x0b71]); // DEPTH_TEST initially enabled.
        let blendFactors = [11, 12, 13, 14];
        let scissorBox = [3, 4, 5, 6];
        const gl = {
            BLEND_SRC_RGB: 0x80c9,
            BLEND_DST_RGB: 0x80c8,
            BLEND_SRC_ALPHA: 0x80cb,
            BLEND_DST_ALPHA: 0x80ca,
            SCISSOR_BOX: 0x0c10,
            ONE: 1,
            ZERO: 0,
            isEnabled: (capability: number) => enabled.has(capability),
            getParameter: (parameter: number) => {
                if (parameter === 0x80c9) return blendFactors[0];
                if (parameter === 0x80c8) return blendFactors[1];
                if (parameter === 0x80cb) return blendFactors[2];
                if (parameter === 0x80ca) return blendFactors[3];
                if (parameter === 0x0c10) return new Int32Array(scissorBox);
                return undefined;
            },
        };
        const fakeApp = {
            width: 800,
            height: 600,
            gl,
            enable: (capability: number) => {
                enabled.add(capability);
                return fakeApp;
            },
            disable: (capability: number) => {
                enabled.delete(capability);
                return fakeApp;
            },
            blendFunc: (source: number, destination: number) => {
                blendFactors = [source, destination, source, destination];
                return fakeApp;
            },
            blendFuncSeparate: (
                sourceRgb: number,
                destinationRgb: number,
                sourceAlpha: number,
                destinationAlpha: number,
            ) => {
                blendFactors = [sourceRgb, destinationRgb, sourceAlpha, destinationAlpha];
                return fakeApp;
            },
            scissor: (x: number, y: number, width: number, height: number) => {
                scissorBox = [x, y, width, height];
                return fakeApp;
            },
        };
        const labels = new GroundItemOverlay({} as never, { getCacheSystem: () => undefined });
        let resolvedBasePlane = -1;
        let sampledLabelPlane = -1;
        const labelInternal = labels as unknown as {
            app: typeof fakeApp;
            positions: { data: (data: Float32Array) => void };
            uvs: object;
            drawCall: object;
            entries: Array<Record<string, unknown>>;
            lastArgs: unknown;
            getTextTexture: () => { tex: object; w: number; h: number };
        };
        labelInternal.app = fakeApp;
        labelInternal.positions = {
            data: () => {
                throw new Error("simulated upload failure");
            },
        };
        labelInternal.uvs = {};
        labelInternal.drawCall = {};
        labelInternal.entries = [{ tileX: 3200, tileY: 3201, level: 1, label: "Coins" }];
        labelInternal.getTextTexture = () => ({ tex: {}, w: 32, h: 14 });
        labelInternal.lastArgs = {
            helpers: {
                getHeightSamplePlaneForTile: (_x: number, _y: number, plane: number) => {
                    resolvedBasePlane = plane;
                    return 2;
                },
                sampleHeightAtExactPlane: (_x: number, _y: number, plane: number) => {
                    sampledLabelPlane = plane;
                    return 0;
                },
                worldToScreen: () => [100, 100],
                getSceneViewportRect: () => ({ x: 20, y: 30, width: 400, height: 300 }),
            },
        };
        assert.throws(
            () => labels.draw(RenderPhase.PostPresent),
            /simulated upload failure/,
        );
        assert.equal(resolvedBasePlane, 1);
        assert.equal(sampledLabelPlane, 2);
        assert.deepEqual(blendFactors, [11, 12, 13, 14]);
        assert.deepEqual(scissorBox, [3, 4, 5, 6]);
        assert.deepEqual(
            [...enabled],
            [0x0b71],
            "label draw restores depth, blend, and scissor enable state after failure",
        );

        const identity = mat4.create();
        const projectionBehind = mat4.create();
        projectionBehind[15] = -1;
        const projectionInvalid = mat4.create();
        projectionInvalid[15] = Number.NaN;
        const projectionHost = (projectionMatrix: typeof identity) =>
            ({
                osrsClient: {
                    camera: {
                        viewMatrix: identity,
                        projectionMatrix,
                        screenWidth: 800,
                        screenHeight: 600,
                    },
                },
                app: { width: 800, height: 600 },
            }) as never;
        assert.deepEqual(pick.worldToScreen(projectionHost(identity), 0, 0, 0), [400, 300]);
        assert.equal(
            pick.worldToScreen(projectionHost(projectionBehind), 0, 0, 0),
            undefined,
        );
        assert.equal(
            pick.worldToScreen(projectionHost(projectionInvalid), 0, 0, 0),
            undefined,
        );
    } finally {
        if (previousSelf === undefined) {
            delete (globalThis as { self?: unknown }).self;
        } else {
            (globalThis as { self?: unknown }).self = previousSelf;
        }
    }

    console.log("ground-item-rendering-safety.test.ts: all assertions passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
