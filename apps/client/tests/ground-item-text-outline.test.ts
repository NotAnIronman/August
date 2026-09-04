import assert from "node:assert/strict";
import { createRequire } from "node:module";

type DrawRecord = {
    text: string;
    x: number;
    y: number;
    color: string;
};

async function main(): Promise<void> {
    const previousSelf = (globalThis as { self?: unknown }).self;
    (globalThis as { self?: unknown }).self = globalThis;

    // PicoGL's Node entry is a UMD default while browser builds expose named exports.
    // Mirror the named export so this browser overlay can run under the Node test runner.
    const testRequire = createRequire(process.cwd() + "/package.json");
    const picoGlNode = testRequire("picogl") as { PicoGL?: unknown };
    if (!picoGlNode.PicoGL) picoGlNode.PicoGL = picoGlNode;
    const { GroundItemOverlay } = await import(
        "@client/engine/rendering/overlays/GroundItemOverlay"
    );

    const drawRecords: DrawRecord[] = [];
    let textureCreates = 0;
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
            clearRect: () => undefined,
        }),
    };
    const previousDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
        createElement: (tag: string) => {
            assert.equal(tag, "canvas");
            return canvas;
        },
    };

    try {
        const overlay = new GroundItemOverlay({} as never, {
            getCacheSystem: () => undefined,
        });
        const internal = overlay as unknown as {
            app: {
                createTexture2D: (source: unknown, options: unknown) => { delete: () => void };
            };
            font: {
                maxAscent: number;
                ascent: number;
                maxDescent: number;
                measure: (text: string) => number;
                draw: (
                    context: unknown,
                    text: string,
                    x: number,
                    y: number,
                    color: string,
                ) => void;
            };
            getTextTexture: (
                baseLabel: string,
                timerLabel: string,
                baseColor: number,
                timerColor: number,
                textOutline: boolean,
            ) => { tex: unknown; w: number; h: number } | undefined;
        };
        internal.app = {
            createTexture2D: (source) => {
                assert.equal(source, canvas);
                textureCreates++;
                return { delete: () => undefined };
            },
        };
        internal.font = {
            maxAscent: 8,
            ascent: 8,
            maxDescent: 2,
            measure: (text) => text.length * 2,
            draw: (_context, text, x, y, color) => {
                drawRecords.push({ text, x, y, color });
            },
        };

        const outlined = internal.getTextTexture("Rune", " (1)", 0xff9040, 0x00ff00, true);
        assert.ok(outlined);
        assert.equal(
            outlined.w,
            22,
            "outline reserves one extra pixel on both horizontal edges",
        );
        assert.equal(
            outlined.h,
            16,
            "outline reserves one extra pixel on both vertical edges",
        );
        assert.equal(textureCreates, 1);
        assert.equal(drawRecords.length, 18, "eight silhouette offsets cover both colored runs");
        assert.ok(drawRecords.slice(0, 16).every((record) => record.color === "#000000"));
        assert.deepEqual(drawRecords.at(-2), {
            text: "Rune",
            x: 3,
            y: 11,
            color: "#ff9040",
        });
        assert.deepEqual(drawRecords.at(-1), {
            text: " (1)",
            x: 11,
            y: 11,
            color: "#00ff00",
        });
        assert.ok(
            drawRecords.some(
                (record) => record.text === "Rune" && record.x === 2 && record.y === 10,
            ),
            "top-left silhouette pixel remains inside the reserved gutter",
        );

        const cachedOutlined = internal.getTextTexture(
            "Rune",
            " (1)",
            0xff9040,
            0x00ff00,
            true,
        );
        assert.equal(cachedOutlined, outlined);
        assert.equal(textureCreates, 1);
        assert.equal(drawRecords.length, 18);

        drawRecords.length = 0;
        const plain = internal.getTextTexture("Rune", " (1)", 0xff9040, 0x00ff00, false);
        assert.ok(plain);
        assert.notEqual(plain, outlined, "outline mode participates in the texture-cache key");
        assert.equal(plain.w, 20, "the existing unoutlined width remains unchanged");
        assert.equal(plain.h, 14, "the existing unoutlined height remains unchanged");
        assert.equal(textureCreates, 2);
        assert.deepEqual(drawRecords, [
            { text: "Rune", x: 2, y: 10, color: "#ff9040" },
            { text: " (1)", x: 10, y: 10, color: "#00ff00" },
        ]);
    } finally {
        if (previousDocument === undefined) {
            delete (globalThis as { document?: unknown }).document;
        } else {
            (globalThis as { document?: unknown }).document = previousDocument;
        }
        if (previousSelf === undefined) {
            delete (globalThis as { self?: unknown }).self;
        } else {
            (globalThis as { self?: unknown }).self = previousSelf;
        }
    }

    console.log("ground-item-text-outline.test.ts: all assertions passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
