import assert from "node:assert/strict";

import {
    MAX_SERVER_LIST_ENTRIES,
    parseServerListEntries,
} from "@client/features/login/renderer/serverList";

assert.deepEqual(
    parseServerListEntries([
        {
            id: 1,
            name: " Test ",
            address: "play.example.com:43594",
            secure: true,
            maxPlayers: 1234,
        },
    ]),
    [
        {
            id: 1,
            name: "Test",
            activity: "",
            address: "play.example.com:43594",
            secure: true,
            playerCount: null,
            maxPlayers: 1234,
            location: 0,
            properties: 0,
        },
    ],
);

assert.deepEqual(parseServerListEntries([null, { address: "http://bad.example" }]), []);
assert.deepEqual(parseServerListEntries([{ address: "example.com\\@other-host" }]), []);
assert.deepEqual(
    parseServerListEntries(
        Array.from({ length: MAX_SERVER_LIST_ENTRIES + 1 }, (_, id) => ({
            id,
            address: `world-${id}.example.com:43594`,
        })),
    ),
    [],
);

console.log("server-list validation tests passed");
