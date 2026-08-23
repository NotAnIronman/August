import assert from "node:assert/strict";

import { AchievementTaskTracker } from "../gamemodes/vanilla/diaryTasks/AchievementTaskTracker";

// This is the exact state shape stored in the player's gamemodeData JSON.
const tracker = new AchievementTaskTracker();
tracker.deserializePlayerState(1, {
    completed: ["0:0:0"],
    progress: { "0:0:1": 2 },
});

assert.equal(tracker.isTaskComplete(1, { areaId: 0, tierIndex: 0, taskIndex: 0 }), true);
const snapshot = tracker.serializePlayerState(1);
assert.deepEqual(snapshot, {
    completed: ["0:0:0"],
    progress: { "0:0:1": 2 },
});

// Player IDs change from session to session; a fresh id must restore the
// completed task and its partial progress from the saved snapshot.
const restored = new AchievementTaskTracker();
restored.deserializePlayerState(27, snapshot);
assert.equal(restored.isTaskComplete(27, { areaId: 0, tierIndex: 0, taskIndex: 0 }), true);
assert.deepEqual(restored.serializePlayerState(27), snapshot);

// Corrupt/outdated keys are ignored instead of being persisted indefinitely.
restored.deserializePlayerState(28, {
    completed: ["not-a-task", "99:99:99"],
    progress: { "0:0:999": 3 },
});
assert.equal(restored.serializePlayerState(28), undefined);

console.log("achievement diary persistence regression test passed");
