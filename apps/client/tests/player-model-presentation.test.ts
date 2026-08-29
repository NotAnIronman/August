import assert from "node:assert/strict";

import {
    CHARACTER_CREATOR_PLAYER_MODEL_MAX_ZOOM,
    CHARACTER_CREATOR_PLAYER_MODEL_OFFSET_Y,
    DEFAULT_PLAYER_IDLE_SEQUENCE_ID,
    EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
    resolvePlayerModelPresentation,
} from "@client/ui/widgets/model/playerModelPresentation";

const equipmentStats = resolvePlayerModelPresentation({
    groupId: 84,
    contentType: 328,
    configuredSequenceId: 424,
    configuredZoom: 2_000,
    configuredOffsetY: -10,
    modelFrame: 7,
    idleSequenceId: 808,
    movementSequenceId: 808,
    movementFrame: 3,
});
assert.deepEqual(equipmentStats, {
    sequenceId: 808,
    sequenceFrame: 3,
    zoom: EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
    // Equipment stats' framing wasn't reported as off; its offsetY passes
    // through unchanged rather than being forced like the character creator.
    offsetY: -10,
});

const equipmentWhileWalking = resolvePlayerModelPresentation({
    groupId: 84,
    contentType: 328,
    configuredSequenceId: 424,
    configuredZoom: 500,
    modelFrame: 7,
    idleSequenceId: 808,
    movementSequenceId: 819,
    movementFrame: 4,
});
assert.deepEqual(equipmentWhileWalking, {
    sequenceId: 808,
    sequenceFrame: 0,
    zoom: 500,
    offsetY: 0,
});

const equipmentBeforePlayerBasIsReady = resolvePlayerModelPresentation({
    groupId: 84,
    contentType: 328,
    configuredSequenceId: 424,
    configuredZoom: 2_000,
    modelFrame: 7,
});
assert.deepEqual(equipmentBeforePlayerBasIsReady, {
    sequenceId: DEFAULT_PLAYER_IDLE_SEQUENCE_ID,
    sequenceFrame: 0,
    zoom: EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
    offsetY: 0,
});

// Character creator (PlayerDesign, group 679) is a portrait too: it must
// stay in the idle stance, have its zoom capped (now ~15% smaller than
// equipment stats' cap), and be nudged down toward the Confirm button
// regardless of whatever offsetY the cache/CS2 script configured.
const characterCreatorPreview = resolvePlayerModelPresentation({
    groupId: 679,
    contentType: 328,
    configuredZoom: 1_500,
    configuredOffsetY: -15,
    modelFrame: 0,
    idleSequenceId: 808,
    movementSequenceId: 819,
    movementFrame: 5,
});
assert.deepEqual(characterCreatorPreview, {
    sequenceId: 808,
    sequenceFrame: 0,
    zoom: CHARACTER_CREATOR_PLAYER_MODEL_MAX_ZOOM,
    offsetY: CHARACTER_CREATOR_PLAYER_MODEL_OFFSET_Y,
});

const characterCreatorBeforeBasIsReady = resolvePlayerModelPresentation({
    groupId: 679,
    contentType: 328,
    configuredZoom: 2_000,
    modelFrame: 0,
});
assert.deepEqual(characterCreatorBeforeBasIsReady, {
    sequenceId: DEFAULT_PLAYER_IDLE_SEQUENCE_ID,
    sequenceFrame: 0,
    zoom: CHARACTER_CREATOR_PLAYER_MODEL_MAX_ZOOM,
    offsetY: CHARACTER_CREATOR_PLAYER_MODEL_OFFSET_Y,
});

// The character creator's zoom cap should be meaningfully (~15%) tighter
// than equipment stats' now that they're tuned independently.
assert.ok(
    CHARACTER_CREATOR_PLAYER_MODEL_MAX_ZOOM > EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
    "character creator zoom cap should be higher (smaller model) than equipment stats",
);

// A group unrelated to either portrait interface should still fall through
// to the generic (non-portrait) behavior, with offsetY passed through as-is.
const otherPlayerPreview = resolvePlayerModelPresentation({
    groupId: 90,
    contentType: 328,
    configuredZoom: 1_500,
    configuredOffsetY: 12,
    modelFrame: 0,
    idleSequenceId: 808,
    movementSequenceId: 819,
    movementFrame: 5,
});
assert.deepEqual(otherPlayerPreview, {
    sequenceId: 819,
    sequenceFrame: 5,
    zoom: 1_500,
    offsetY: 12,
});

console.log("player model presentation tests passed");
