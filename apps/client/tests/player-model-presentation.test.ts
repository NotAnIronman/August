import assert from "node:assert/strict";

import {
    DEFAULT_PLAYER_IDLE_SEQUENCE_ID,
    EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
    resolvePlayerModelPresentation,
} from "@client/ui/widgets/model/playerModelPresentation";

const equipmentStats = resolvePlayerModelPresentation({
    groupId: 84,
    contentType: 328,
    configuredSequenceId: 424,
    configuredZoom: 2_000,
    modelFrame: 7,
    idleSequenceId: 808,
    movementSequenceId: 808,
    movementFrame: 3,
});
assert.deepEqual(equipmentStats, {
    sequenceId: 808,
    sequenceFrame: 3,
    zoom: EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
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
});

const otherPlayerPreview = resolvePlayerModelPresentation({
    groupId: 679,
    contentType: 328,
    configuredZoom: 1_500,
    modelFrame: 0,
    idleSequenceId: 808,
    movementSequenceId: 819,
    movementFrame: 5,
});
assert.deepEqual(otherPlayerPreview, {
    sequenceId: 819,
    sequenceFrame: 5,
    zoom: 1_500,
});

console.log("player model presentation tests passed");
