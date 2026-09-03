import assert from "node:assert/strict";

let rectReads = 0;
let resizeCallback: (() => void) | undefined;
let scheduledFrames = 0;

const canvas = {
    style: {},
    tabIndex: 0,
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 600,
    offsetWidth: 800,
    offsetHeight: 600,
    getBoundingClientRect: () => {
        rectReads++;
        return { width: 800, height: 600 };
    },
};

Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "test", maxTouchPoints: 0 },
});
(globalThis as any).window = {
    devicePixelRatio: 1,
    location: { search: "" },
};
(globalThis as any).document = {
    documentElement: { dataset: {} },
    createElement: () => canvas,
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
};
(globalThis as any).ResizeObserver = class {
    constructor(callback: () => void) {
        resizeCallback = callback;
    }
    observe() {}
    disconnect() {}
};
(globalThis as any).requestAnimationFrame = () => ++scheduledFrames;
(globalThis as any).cancelAnimationFrame = () => {};

async function main(): Promise<void> {
    const { Renderer } = await import("@client/engine/rendering/core/Renderer");

    class TestRenderer extends Renderer {
        renders = 0;
        async init() {}
        cleanUp() {}
        render() {
            this.renders++;
        }
    }

    const renderer = new TestRenderer();
    renderer.attachResizeObserver();
    renderer.forceResize();
    assert.equal(rectReads, 1);

    renderer.start();
    renderer.frameCallback(16);
    renderer.frameCallback(32);
    assert.equal(rectReads, 1, "stable frames must reuse the observed CSS dimensions");
    assert.ok(renderer.renders > 0);

    resizeCallback?.();
    assert.equal(rectReads, 2, "ResizeObserver must invalidate and remeasure immediately");
    renderer.stop();
}

void main();
