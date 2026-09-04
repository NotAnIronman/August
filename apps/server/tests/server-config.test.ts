import assert from "node:assert/strict";

import {
    MAX_SERVER_PLAYERS,
    MAX_SERVER_PORT,
    MAX_SERVER_TICK_MS,
    ServerConfigurationError,
    parseServerConfigJson,
    resolveServerConfig,
    type ResolveServerConfigOptions,
} from "@server/config/ServerConfigResolver";
import {
    getGamemodeDataDir,
    getGamemodeDefaultsPath,
} from "@server/game/gamemodes/GamemodeRegistry";

const configuredWorlds = [
    { id: 1, name: "Vanilla", gamemode: "vanilla", port: 43_594 },
    { id: 2, name: "Leagues V", gamemode: "leagues-v", port: 43_595 },
];

function expectInvalid(
    options: ResolveServerConfigOptions,
    expectedMessage: RegExp,
): void {
    assert.throws(
        () => resolveServerConfig(options),
        (error: unknown) => {
            assert.ok(error instanceof ServerConfigurationError);
            assert.match(error.message, expectedMessage);
            return true;
        },
    );
}

const defaults = resolveServerConfig();
assert.deepEqual(defaults.config, {
    host: "::",
    port: 43_594,
    tickMs: 600,
    serverName: "Vanilla",
    maxPlayers: MAX_SERVER_PLAYERS,
    worlds: configuredWorlds,
});
assert.equal(defaults.activeWorld, defaults.config.worlds[0]);

const overridden = resolveServerConfig({
    fileConfig: {
        host: " 127.0.0.1 ",
        serverName: "Choose World",
        maxPlayers: MAX_SERVER_PLAYERS,
        worlds: configuredWorlds,
    },
    environment: {
        HOST: " 0.0.0.0 ",
        PORT: String(MAX_SERVER_PORT),
        TICK_MS: String(MAX_SERVER_TICK_MS),
        SERVER_NAME: " Custom World ",
        WORLD_ID: "2",
    },
    argv: ["--world=1"],
});
assert.equal(overridden.activeWorld.id, 2, "WORLD_ID keeps precedence over --world");
assert.equal(overridden.config.host, "0.0.0.0");
assert.equal(overridden.config.port, MAX_SERVER_PORT);
assert.equal(overridden.config.tickMs, MAX_SERVER_TICK_MS);
assert.equal(overridden.config.serverName, "Custom World");
assert.equal(overridden.config.maxPlayers, MAX_SERVER_PLAYERS);

const selectedByArgument = resolveServerConfig({
    fileConfig: { serverName: "Choose World", worlds: configuredWorlds },
    argv: ["node", "server", "--world=2"],
});
assert.equal(selectedByArgument.activeWorld.id, 2);
assert.equal(selectedByArgument.config.port, 43_595);
// Preserve the current advertised-name behavior: a selected world's name is
// used unless SERVER_NAME explicitly overrides it.
assert.equal(selectedByArgument.config.serverName, "Leagues V");

assert.throws(
    () => parseServerConfigJson("{not json"),
    (error: unknown) => {
        assert.ok(error instanceof ServerConfigurationError);
        assert.match(error.message, /config\.json contains invalid JSON/);
        return true;
    },
);
expectInvalid({ fileConfig: [] }, /config\.json must contain a JSON object/);
expectInvalid({ fileConfig: { host: 42 } }, /config\.json host must be a non-empty string/);
expectInvalid(
    { fileConfig: { worlds: "world one" } },
    /config\.json worlds must be an array/,
);
expectInvalid(
    { fileConfig: { worlds: [] } },
    /config\.json worlds must contain at least one world/,
);
expectInvalid(
    { fileConfig: { worlds: [{ id: 1, name: "Vanilla", gamemode: "vanilla" }] } },
    /worlds\[0\]\.port is required/,
);
expectInvalid(
    {
        fileConfig: {
            worlds: [
                configuredWorlds[0],
                { ...configuredWorlds[1], id: configuredWorlds[0].id },
            ],
        },
    },
    /worlds\[1\]\.id duplicates worlds\[0\]\.id \(1\)/,
);
expectInvalid(
    {
        fileConfig: {
            worlds: [
                configuredWorlds[0],
                { ...configuredWorlds[1], port: configuredWorlds[0].port },
            ],
        },
    },
    /worlds\[1\]\.port duplicates worlds\[0\]\.port \(43594\)/,
);

for (const maxPlayers of [0, 1.5, MAX_SERVER_PLAYERS + 1]) {
    expectInvalid(
        { fileConfig: { maxPlayers } },
        /maxPlayers must be an integer from 1 to 2047/,
    );
}

expectInvalid(
    { fileConfig: { worlds: configuredWorlds }, environment: { WORLD_ID: "second" } },
    /WORLD_ID must be a base-10 integer/,
);
expectInvalid(
    { fileConfig: { worlds: configuredWorlds }, environment: { WORLD_ID: "3" } },
    /WORLD_ID references unknown world ID 3; configured world IDs are 1, 2/,
);
expectInvalid(
    { fileConfig: { worlds: configuredWorlds }, argv: ["--world="] },
    /--world must be a base-10 integer/,
);

for (const port of ["0", "65536", "43594suffix", "1.5"]) {
    expectInvalid(
        { environment: { PORT: port } },
        /PORT must be (?:a base-10 |an )?integer from 1 to 65535/,
    );
}

for (const tickMs of ["0", String(MAX_SERVER_TICK_MS + 1), "600ms", "1.5"]) {
    expectInvalid(
        { environment: { TICK_MS: tickMs } },
        /TICK_MS must be (?:a base-10 |an )?integer from 1 to 2147483647/,
    );
}

for (const worldPort of [0, MAX_SERVER_PORT + 1, 43_594.5]) {
    expectInvalid(
        {
            fileConfig: {
                worlds: [{ ...configuredWorlds[0], port: worldPort }],
            },
        },
        /worlds\[0\]\.port must be an integer from 1 to 65535/,
    );
}

for (const gamemode of ["../vanilla", "Vanilla", "two words", ".hidden", "a/b", "a\\b"]) {
    expectInvalid(
        {
            fileConfig: {
                worlds: [{ ...configuredWorlds[0], gamemode }],
            },
        },
        /worlds\[0\]\.gamemode must use 1-64 lowercase letters/,
    );
    assert.throws(() => getGamemodeDataDir(gamemode), /Invalid gamemode ID/);
    assert.throws(() => getGamemodeDefaultsPath(gamemode), /Invalid gamemode ID/);
}
assert.match(getGamemodeDataDir("leagues-v"), /leagues-v$/);
assert.match(getGamemodeDefaultsPath("vanilla"), /vanilla[\\/]data[\\/]player-defaults\.json$/);

console.log("server configuration regression test passed");
