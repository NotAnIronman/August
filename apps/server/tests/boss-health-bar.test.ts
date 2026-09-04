import assert from "node:assert/strict";

import {
    BOSS_HEALTH_BAR_GROUP_ID,
    BossHealthBarComponent,
    BossHealthBarVar,
    BossHealthBarVarbit,
    formatBossHealthValue,
    normalizeBossHealthBarMarkers,
    type BossHealthBarMarker,
} from "@august/protocol/ui/bossHealthBar";
import { decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";
import {
    InstanceBossHealthBarLifecycle,
    closeBossHealthBar,
    openBossHealthBar,
    updateBossHealthBar,
} from "@server/game/encounters/BossHealthBar";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import { PlayerVarpState } from "@server/game/state/PlayerVarpState";
import { encodeMessage } from "@server/network/messages";

assert.equal(BOSS_HEALTH_BAR_GROUP_ID, 303, "the legacy hpbar_hud identifier remains stable");
assert.deepEqual(BossHealthBarComponent, {
    Root: 0,
    Health: 5,
    Name: 9,
    Empty: 13,
    FillDark: 14,
    FillLight: 15,
    Value: 20,
});
assert.equal(formatBossHealthValue(200, 255), "200/255 | 78%");
assert.equal(formatBossHealthValue(999, 255), "255/255 | 100%");
assert.deepEqual(
    normalizeBossHealthBarMarkers([
        { percent: 25, label: "  Final stand  ", style: "danger" },
        { percent: 75.126, label: "Adds", style: "mechanic" },
        { percent: 75.127, label: "duplicate rounds to same basis point", style: "phase" },
        { percent: 100, label: "not a useful notch" },
        { percent: 0, label: "death" },
    ]),
    [
        { percent: 75.13, label: "Adds", style: "mechanic" },
        { percent: 25, label: "Final stand", style: "danger" },
    ],
);
const cappedMarkers = normalizeBossHealthBarMarkers(
    Array.from({ length: 40 }, (_, index) => ({
        percent: 99 - index,
        label: index === 0 ? `\0${"x".repeat(80)}` : `Gate ${index}`,
    })),
);
assert.equal(cappedMarkers.length, 32, "the wire payload has a defensive marker cap");
assert.equal(cappedMarkers[0]?.label?.length, 64, "marker labels are sanitized and capped");

const markers = [
    { percent: 75, label: "Summon reinforcements", style: "mechanic" as const },
    { percent: 50, label: "Enraged phase", style: "phase" as const },
];

const persistedState = new PlayerVarpState();
persistedState.setVarpValue(BossHealthBarVar.NpcType, 2215);
persistedState.setVarbitValue(BossHealthBarVarbit.Current, 200);
persistedState.setVarbitValue(BossHealthBarVarbit.Maximum, 255);
persistedState.setVarbitValue(BossHealthBarVarbit.Boss, 1);
persistedState.setVarbitValue(BossHealthBarVarbit.Disabled, 1);
assert.deepEqual(
    persistedState.serialize(),
    { preferredDisplayMode: 1, varbits: { [BossHealthBarVarbit.Disabled]: 1 } },
    "legacy cache HUD values stay transient without discarding the player's visibility preference",
);
persistedState.deserialize({
    varps: { [BossHealthBarVar.NpcType]: 2215 },
    varbits: {
        [BossHealthBarVarbit.Current]: 200,
        [BossHealthBarVarbit.Maximum]: 255,
        [BossHealthBarVarbit.Boss]: 1,
        [BossHealthBarVarbit.Disabled]: 1,
    },
});
assert.equal(persistedState.getVarpValue(BossHealthBarVar.NpcType), 0);
assert.equal(persistedState.getVarbitValue(BossHealthBarVarbit.Current), 0);
assert.equal(persistedState.getVarbitValue(BossHealthBarVarbit.Maximum), 0);
assert.equal(persistedState.getVarbitValue(BossHealthBarVarbit.Boss), 0);
assert.equal(persistedState.getVarbitValue(BossHealthBarVarbit.Disabled), 1);

const player = {
    id: 42,
} as unknown as PlayerState;

const widgetEvents: Array<Record<string, unknown>> = [];
const services = {
    dialog: {
        openSubInterface: () => {
            throw new Error("the custom boss HUD must not mount a native interface");
        },
        closeSubInterface: () => {
            throw new Error("the custom boss HUD must not close a native interface");
        },
        queueWidgetEvent: (_playerId: number, event: Record<string, unknown>) =>
            widgetEvents.push(event),
    },
    variables: {
        sendVarp: () => {
            throw new Error("the custom boss HUD must not send legacy varps");
        },
        sendVarbit: () => {
            throw new Error("the custom boss HUD must not send legacy varbits");
        },
    },
} as unknown as ScriptServices;

openBossHealthBar(player, services, {
    npcTypeId: 2215,
    name: "General Graardor",
    current: 255,
    maximum: 255,
    markers,
});

assert.deepEqual(widgetEvents, [
    {
        action: "set_boss_health_bar",
        active: true,
        npcTypeId: 2215,
        name: "General Graardor",
        current: 255,
        maximum: 255,
        markers,
    },
]);

const decodedHud = decodeServerPacket(
    encodeMessage({
        type: "widget",
        payload: {
            action: "set_boss_health_bar",
            active: true,
            npcTypeId: 2215,
            name: "General Graardor",
            current: 200,
            maximum: 255,
            markers,
        },
    }),
);
assert.deepEqual(decodedHud, {
    type: "widget",
    payload: {
        action: "set_boss_health_bar",
        active: true,
        npcTypeId: 2215,
        name: "General Graardor",
        current: 200,
        maximum: 255,
        markers,
    },
});

updateBossHealthBar(player, services, {
    npcTypeId: 2215,
    name: "General Graardor",
    current: 200,
    maximum: 255,
    markers,
});
assert.equal(widgetEvents.length, 2, "one changed health snapshot emits one HUD packet");
assert.equal(widgetEvents.at(-1)?.current, 200);

closeBossHealthBar(player, services);
assert.deepEqual(widgetEvents.at(-1), {
    action: "set_boss_health_bar",
    active: false,
});
assert.deepEqual(
    decodeServerPacket(
        encodeMessage({
            type: "widget",
            payload: { action: "set_boss_health_bar", active: false },
        }),
    ),
    {
        type: "widget",
        payload: { action: "set_boss_health_bar", active: false },
    },
);
assert.equal(widgetEvents.length, 3, "closing emits exactly one inactive HUD packet");

let lifecycleMarkers: readonly BossHealthBarMarker[] = markers;
const lifecycle = new InstanceBossHealthBarLifecycle(() => services);
const resolveLifecycleSnapshot = () => ({
    npcTypeId: 2215,
    name: "General Graardor",
    current: 200,
    maximum: 255,
    markers: lifecycleMarkers,
});
const lifecycleStart = widgetEvents.length;
lifecycle.enter(player, resolveLifecycleSnapshot);
assert.equal(widgetEvents.length, lifecycleStart + 1);
lifecycle.sync();
assert.equal(widgetEvents.length, lifecycleStart + 1, "identical snapshots are deduplicated");
lifecycleMarkers = [{ percent: 25, label: "Final stand", style: "danger" as const }];
lifecycle.sync();
assert.equal(
    widgetEvents.length,
    lifecycleStart + 2,
    "marker-only changes participate in lifecycle deduplication",
);
lifecycle.leave(player);
assert.equal(widgetEvents.length, lifecycleStart + 3);
assert.deepEqual(widgetEvents.at(-1), { action: "set_boss_health_bar", active: false });

console.log("boss health bar lifecycle tests passed");
