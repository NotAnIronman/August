import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ScriptRuntime } from "@server/game/scripts";
import { bootstrapScripts } from "@server/game/scripts/bootstrap";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "august-script-bootstrap-"));
try {
    const moduleDirectory = path.join(directory, "lifecycle-test");
    fs.mkdirSync(moduleDirectory, { recursive: true });
    fs.writeFileSync(
        path.join(moduleDirectory, "index.js"),
        "exports.register = () => undefined;\n",
    );

    let registrations = 0;
    let resets = 0;
    let watchListener: (() => void) | undefined;
    let watcherClosed = false;
    let scheduledReload: (() => void) | undefined;
    let cancelledReload = false;
    const timeout = { unref: () => timeout } as unknown as NodeJS.Timeout;
    const runtime = {
        reset: () => {
            resets++;
        },
        registerHandlers: () => {
            registrations++;
        },
    } as unknown as ScriptRuntime;

    const handle = bootstrapScripts(runtime, undefined, {
        modulesDirectory: directory,
        hotReload: true,
        debounceMs: 25,
        watchDirectory: (_path, options, listener) => {
            assert.deepEqual(options, { persistent: false, recursive: true });
            watchListener = listener;
            return { close: () => (watcherClosed = true) };
        },
        scheduleTimeout: (callback, delayMs) => {
            assert.equal(delayMs, 25);
            scheduledReload = callback;
            return timeout;
        },
        cancelTimeout: (candidate) => {
            assert.equal(candidate, timeout);
            cancelledReload = true;
        },
    });

    assert.equal(resets, 1);
    assert.equal(registrations, 1);
    watchListener?.();
    assert.ok(scheduledReload, "a content change must schedule a reload");

    handle.dispose();
    assert.equal(watcherClosed, true);
    assert.equal(cancelledReload, true);
    assert.equal(resets, 2, "disposing the bootstrap must release registered provider state");

    scheduledReload?.();
    watchListener?.();
    assert.equal(resets, 2, "late watcher/timer callbacks must be inert after disposal");
    assert.equal(registrations, 1);

    handle.dispose();
    assert.equal(resets, 2, "disposal must be idempotent");

    const invalidDirectory = path.join(directory, "invalid-module");
    fs.mkdirSync(invalidDirectory, { recursive: true });
    fs.writeFileSync(path.join(invalidDirectory, "index.js"), "exports.value = 1;\n");
    let strictResets = 0;
    let strictRegistrations = 0;
    const strictRuntime = {
        reset: () => {
            strictResets++;
        },
        registerHandlers: () => {
            strictRegistrations++;
        },
    } as unknown as ScriptRuntime;
    const previousStrictSetting = process.env.SCRIPT_STRICT_STARTUP;
    process.env.SCRIPT_STRICT_STARTUP = "1";
    try {
        assert.throws(
            () =>
                bootstrapScripts(strictRuntime, undefined, {
                    modulesDirectory: directory,
                    hotReload: false,
                }),
            AggregateError,
        );
    } finally {
        if (previousStrictSetting === undefined) delete process.env.SCRIPT_STRICT_STARTUP;
        else process.env.SCRIPT_STRICT_STARTUP = previousStrictSetting;
    }
    assert.equal(strictRegistrations, 1);
    assert.equal(strictResets, 2, "a strict startup failure must leave no provider active");
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}

console.log("script bootstrap lifecycle regression test passed");
