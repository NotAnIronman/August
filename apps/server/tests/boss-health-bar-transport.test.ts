import assert from "node:assert/strict";

import { BossHealthHudStore } from "@client/features/boss-health/BossHealthHudStore";
import { decodeBatchedServerPackets, decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";
import { handleInboundUi } from "@client/core/network/server-connection/handlers/inboundUi";
import { subscribeWidgetEvents } from "@client/core/network/server-connection/subscriptions/ui";
import { SERVER_MESSAGE_LENGTHS, ServerMessageId } from "@august/protocol/transport/messages/ServerMessage";
import type { BossHealthBarState } from "@august/protocol/ui/bossHealthBar";
import type { TickFrame } from "@server/game/tick/TickPhaseOrchestrator";
import type { BroadcastContext } from "@server/network/broadcast/BroadcastDomain";
import { WidgetBroadcaster } from "@server/network/broadcast/WidgetBroadcaster";
import { ServerBinaryEncoder } from "@server/network/packet/ServerBinaryEncoder";
import type { WidgetAction } from "@server/widgets/WidgetManager";

const show: Extract<BossHealthBarState, { active: true }> = {
    active: true,
    npcTypeId: 2215,
    name: "General Graardor",
    current: 1,
    maximum: 255,
    markers: [
        { percent: 75, label: "Reinforcements", style: "mechanic" },
        { percent: 25.55, label: "Enrage", style: "danger" },
    ],
};
const hide: BossHealthBarState = { active: false };
const encoder = new ServerBinaryEncoder();
const showPacket = encoder.encodeWidgetSetBossHealthBar(show);
const hidePacket = encoder.encodeWidgetSetBossHealthBar(hide);

assert.equal(showPacket[0], ServerMessageId.WIDGET_SET_BOSS_HEALTH_BAR);
assert.equal(SERVER_MESSAGE_LENGTHS[ServerMessageId.WIDGET_SET_BOSS_HEALTH_BAR], -2);
assert.deepEqual(decodeServerPacket(showPacket), {
    type: "widget",
    payload: { action: "set_boss_health_bar", ...show },
});
assert.deepEqual(decodeServerPacket(hidePacket), {
    type: "widget",
    payload: { action: "set_boss_health_bar", active: false },
});

for (let length = 0; length < showPacket.length; length++) {
    assert.equal(
        decodeServerPacket(showPacket.slice(0, length)),
        null,
        `truncated boss HUD packet at byte ${length} must be rejected`,
    );
}

// A corrupt count must not make the decoder read marker data from a following
// packet in the same frame. The packet boundary turns the failed read into null.
const corruptCountPacket = showPacket.slice();
const markerCountIndex = 17 + show.name.length;
corruptCountPacket[markerCountIndex] = 0xff;
assert.equal(decodeServerPacket(corruptCountPacket), null);

const batch = new Uint8Array(showPacket.length + hidePacket.length);
batch.set(showPacket, 0);
batch.set(hidePacket, showPacket.length);
assert.deepEqual(
    decodeBatchedServerPackets(batch).map((message) => message.payload),
    [
        { action: "set_boss_health_bar", ...show },
        { action: "set_boss_health_bar", active: false },
    ],
);

// Exercise the real inbound widget subscription bus that the OsrsClient bridge
// uses. The store retains the latest snapshot for a later React mount.
const store = new BossHealthHudStore();
const unsubscribe = subscribeWidgetEvents((payload) => {
    if (payload.action === "set_boss_health_bar") store.ingest(payload);
});
assert.equal(handleInboundUi(decodeServerPacket(showPacket)), true);
assert.equal(store.getState().active, true);
assert.equal(store.getState().name, show.name);
assert.equal(store.getState().current, 1);
assert.deepEqual(store.getState().markers, show.markers);
assert.equal(handleInboundUi(decodeServerPacket(hidePacket)), true);
assert.equal(store.getState().active, false);
unsubscribe();

// Boss HUD actions are snapshots. Same-tick changes are coalesced per player,
// preserving the final chronological state instead of reordering hide/show.
const sent: Array<{ active: boolean; context: string }> = [];
const postOpenActions: WidgetAction[] = [];
const broadcaster = new WidgetBroadcaster({
    syncPostWidgetOpenState: (_playerId, action) => postOpenActions.push(action),
});
const frame = {
    widgetEvents: [
        { playerId: 42, action: { action: "set_boss_health_bar", ...show } },
        { playerId: 42, action: { action: "set_boss_health_bar", active: false } },
    ],
} as unknown as TickFrame;
const context = {
    getSocketByPlayerId: () => undefined,
    sendWithGuard: (_socket: unknown, packet: Uint8Array, label: string) => {
        const decoded = decodeServerPacket(packet);
        assert.equal(decoded?.payload?.action, "set_boss_health_bar");
        sent.push({ active: decoded?.payload?.active === true, context: label });
    },
} as unknown as BroadcastContext;

broadcaster.flushCloseEvents(frame, context);
broadcaster.flushOpenEvents(frame, context);
assert.deepEqual(sent, [{ active: false, context: "widget_event" }]);
assert.equal(postOpenActions.length, 1);
assert.equal(postOpenActions[0]?.action, "set_boss_health_bar");

sent.length = 0;
postOpenActions.length = 0;
frame.widgetEvents = [
    { playerId: 42, action: { action: "set_boss_health_bar", active: false } },
    { playerId: 42, action: { action: "set_boss_health_bar", ...show } },
];
broadcaster.flushCloseEvents(frame, context);
broadcaster.flushOpenEvents(frame, context);
assert.deepEqual(sent, [{ active: true, context: "widget_event" }]);
assert.equal(postOpenActions.length, 1);

console.log("boss health bar transport tests passed");
