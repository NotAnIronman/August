import assert from "node:assert/strict";

import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";
import { AuthenticationService } from "@server/network/AuthenticationService";

let playerCount = 1;
let now = 1_000;
const service = new AuthenticationService(
    {
        hasConnectedPlayer: () => false,
        getTotalPlayerCount: () => playerCount,
    },
    {} as GamemodeDefinition,
    {
        accountStore: {} as never,
        maxPlayers: 2,
        // Values below the production floor normalize to 128.
        maxTrackedLoginSources: 1,
        now: () => now,
    },
);

assert.equal(service.isWorldFull(), false);
playerCount = 2;
assert.equal(service.isWorldFull(), true);

for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(service.checkLoginRateLimit("same-ip"), false);
}
assert.equal(service.checkLoginRateLimit("same-ip"), true);

// Expired entries reset and are pruned, allowing bounded source tracking to
// recover instead of retaining every address for the process lifetime.
now += 60_001;
assert.equal(service.checkLoginRateLimit("same-ip"), false);
for (let source = 0; source < 140; source++) {
    service.checkLoginRateLimit(`source-${source}`);
}
assert.equal(service.checkLoginRateLimit("source-over-capacity"), true);
now += 60_001;
assert.equal(service.checkLoginRateLimit("source-after-expiry"), false);

console.log("authentication limits regression test passed");
