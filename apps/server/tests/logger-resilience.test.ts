import assert from "node:assert/strict";

async function main(): Promise<void> {
    const previousLogJson = process.env.LOG_JSON;
    const previousLogLevel = process.env.LOG_LEVEL;
    const previousConsoleLog = console.log;
    const lines: string[] = [];

    try {
        process.env.LOG_JSON = "true";
        delete process.env.LOG_LEVEL;
        console.log = (...values: unknown[]) => lines.push(values.join(" "));

        const { logger } = await import("@server/observability/logger");
        logger.debug("[test] high-frequency trace");
        assert.equal(lines.length, 0, "debug traces must remain disabled at the default level");

        const circular: { self?: unknown; value: bigint } = { value: 1n };
        circular.self = circular;

        assert.doesNotThrow(() => logger.info("[test] circular payload", circular));
        assert.equal(lines.length, 1);
        const record = JSON.parse(lines[0]) as {
            level: string;
            category: string;
            message: string;
            args: unknown[];
        };
        assert.equal(record.level, "info");
        assert.equal(record.category, "test");
        assert.match(record.message, /circular payload/);
        assert.deepEqual(record.args, [
            "[test] circular payload",
            { value: "1n", self: "[Circular]" },
        ]);

        const oversized = "x".repeat(100_000);
        assert.doesNotThrow(() => logger.info("[test] oversized", { oversized }));
        const boundedLine = lines.at(-1) ?? "";
        assert.ok(boundedLine.length < 40_000, "serialized log records must stay bounded");
        const boundedRecord = JSON.parse(boundedLine) as { message: string; args: unknown[] };
        assert.ok(boundedRecord.message.length <= 16_384);
        assert.match(JSON.stringify(boundedRecord.args), /chars omitted/);

        const throwing = Object.create(null) as Record<string, unknown>;
        Object.defineProperty(throwing, "value", {
            enumerable: true,
            get: () => {
                throw new Error("getter must not escape logger");
            },
        });
        assert.doesNotThrow(() => logger.info("[test] throwing getter", throwing));
        assert.match(lines.at(-1) ?? "", /unreadable object|unreadable log argument/);
    } finally {
        console.log = previousConsoleLog;
        if (previousLogJson === undefined) delete process.env.LOG_JSON;
        else process.env.LOG_JSON = previousLogJson;
        if (previousLogLevel === undefined) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = previousLogLevel;
    }

    previousConsoleLog("logger resilience tests passed");
}

void main();
