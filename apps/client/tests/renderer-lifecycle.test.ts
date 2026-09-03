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
    const { Renderer } = await import("@client/engine/rendering/core/Renderer");

    class TestRenderer extends Renderer {
        initCalls = 0;

        async init() {
            this.initCalls++;
        }
        cleanUp() {}
        render() {}
    }

    const renderer = new TestRenderer();
    await Promise.all([renderer.initOnce(), renderer.initOnce()]);
    assert.equal(renderer.initCalls, 1, "init must run only once");
    renderer.start();
    renderer.start();
    assert.equal(scheduled, 1, "start must create only one render loop");
    renderer.stop();

    let finishDelayedInit!: () => void;
    class DelayedRenderer extends Renderer {
        cleanUpCalls = 0;

        init(): Promise<void> {
            return new Promise((resolve) => {
                finishDelayedInit = resolve;
            });
        }
        cleanUp(): void {
            this.cleanUpCalls++;
        }
        render() {}
    }

    const delayed = new DelayedRenderer();
    const delayedInit = delayed.initOnce();
    delayed.dispose();
    const scheduledBeforeDisposedStart = scheduled;
    delayed.start();
    assert.equal(
        scheduled,
        scheduledBeforeDisposedStart,
        "a disposed renderer must not restart its frame loop",
    );
    finishDelayedInit();
    await delayedInit;
    await Promise.resolve();
    assert.ok(
        delayed.cleanUpCalls >= 2,
        "late async initialization must receive a post-settlement cleanup pass",
    );
    console.log("Renderer lifecycle regression test passed");
}

void main();
