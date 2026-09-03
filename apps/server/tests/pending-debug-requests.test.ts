import assert from "node:assert/strict";

import {
    MAX_PENDING_DEBUG_REQUESTS,
    rememberPendingDebugRequest,
} from "@server/network/PendingDebugRequests";

const requests = new Map<number, string>();
for (let id = 0; id < MAX_PENDING_DEBUG_REQUESTS + 10; id++) {
    assert.equal(rememberPendingDebugRequest(requests, id, `request-${id}`), true);
}
assert.equal(requests.size, MAX_PENDING_DEBUG_REQUESTS);
assert.equal(requests.has(0), false);
assert.equal(
    requests.get(MAX_PENDING_DEBUG_REQUESTS + 9),
    `request-${MAX_PENDING_DEBUG_REQUESTS + 9}`,
);

assert.equal(rememberPendingDebugRequest(requests, Number.NaN, "invalid"), false);
assert.equal(rememberPendingDebugRequest(requests, -1, "invalid"), false);
assert.equal(requests.size, MAX_PENDING_DEBUG_REQUESTS);

console.log("pending debug request regression tests passed");
