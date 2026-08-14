import assert from "node:assert/strict";

let scheduled = 0;
(globalThis as any).document = {
    createElement: () => ({ style: {} }),
    addEventListener() {},
    removeEventListener() {},
    hidden: false,
};
(globalThis as any).requestAnimationFrame = () => ++scheduled;
(globalThis as any).cancelAnimationFrame = () => {};

async function main(): Promise<void> {
    const { Renderer } = await import("../game/render/Renderer");

    class TestRenderer extends Renderer {
        async init() {}
        cleanUp() {}
        render() {}
    }

    const renderer = new TestRenderer();
    renderer.start();
    renderer.start();
    assert.equal(scheduled, 1, "start must create only one render loop");
    renderer.stop();
    console.log("Renderer lifecycle regression test passed");
}

void main();
