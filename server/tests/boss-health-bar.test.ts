import assert from "node:assert/strict";

import {
    BOSS_HEALTH_BAR_GROUP_ID,
    BossHealthBarComponent,
    BossHealthBarVar,
    BossHealthBarVarbit,
    bossHealthBarUid,
    formatBossHealthValue,
} from "../../client/common/ui/bossHealthBar";
import { decodeServerPacket } from "../../client/network/packet/ServerBinaryDecoder";
import {
    closeBossHealthBar,
    openBossHealthBar,
    updateBossHealthBar,
} from "../src/game/encounters/BossHealthBar";
import type { PlayerState } from "../src/game/player";
import type { ScriptServices } from "../src/game/scripts/types";
import { PlayerVarpState } from "../src/game/state/PlayerVarpState";
import { DisplayMode } from "../src/widgets/viewport";
import { ServerBinaryEncoder } from "../src/network/packet/ServerBinaryEncoder";

assert.equal(BOSS_HEALTH_BAR_GROUP_ID, 303, "the cache-native hpbar_hud group is used");
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

const persistedState = new PlayerVarpState();
persistedState.setVarpValue(BossHealthBarVar.NpcType, 2215);
persistedState.setVarbitValue(BossHealthBarVarbit.Current, 200);
persistedState.setVarbitValue(BossHealthBarVarbit.Maximum, 255);
persistedState.setVarbitValue(BossHealthBarVarbit.Boss, 1);
persistedState.setVarbitValue(BossHealthBarVarbit.Disabled, 1);
assert.deepEqual(
    persistedState.serialize(),
    { varbits: { [BossHealthBarVarbit.Disabled]: 1 } },
    "encounter HUD values stay transient without discarding the player's visibility preference",
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

const storedVarps = new Map<number, number>();
const storedVarbits = new Map<number, number>([[BossHealthBarVarbit.Disabled, 1]]);
let widgetIsOpen = false;
const player = {
    id: 42,
    displayMode: DisplayMode.RESIZABLE_NORMAL,
    varps: {
        getVarbitValue: (id: number) => storedVarbits.get(id) ?? 0,
        setVarpValue: (id: number, value: number) => storedVarps.set(id, value),
        setVarbitValue: (id: number, value: number) => storedVarbits.set(id, value),
    },
    widgets: {
        isOpen: (groupId: number) =>
            groupId === BOSS_HEALTH_BAR_GROUP_ID && widgetIsOpen,
    },
} as unknown as PlayerState;

const opens: Array<{
    targetUid: number;
    groupId: number;
    type: number;
    opts: Record<string, unknown>;
}> = [];
const closes: Array<{ targetUid: number; groupId?: number }> = [];
const widgetEvents: Array<Record<string, unknown>> = [];
const sentVarps: Array<[number, number]> = [];
const sentVarbits: Array<[number, number]> = [];
const services = {
    dialog: {
        openSubInterface: (
            _player: PlayerState,
            targetUid: number,
            groupId: number,
            type: number,
            opts: Record<string, unknown>,
        ) => {
            opens.push({ targetUid, groupId, type, opts });
            if (groupId === BOSS_HEALTH_BAR_GROUP_ID) widgetIsOpen = true;
        },
        closeSubInterface: (_player: PlayerState, targetUid: number, groupId?: number) => {
            closes.push({ targetUid, groupId });
            if (groupId === BOSS_HEALTH_BAR_GROUP_ID) widgetIsOpen = false;
        },
        queueWidgetEvent: (_playerId: number, event: Record<string, unknown>) =>
            widgetEvents.push(event),
    },
    variables: {
        sendVarp: (_player: PlayerState, id: number, value: number) =>
            sentVarps.push([id, value]),
        sendVarbit: (_player: PlayerState, id: number, value: number) =>
            sentVarbits.push([id, value]),
    },
} as unknown as ScriptServices;

openBossHealthBar(player, services, {
    npcTypeId: 2215,
    name: "General Graardor",
    current: 255,
    maximum: 255,
});

assert.deepEqual(opens, [
    {
        targetUid: (161 << 16) | 44,
        groupId: 303,
        type: 1,
        opts: {
            modal: false,
            varps: { [BossHealthBarVar.NpcType]: 2215 },
            varbits: {
                [BossHealthBarVarbit.Current]: 255,
                [BossHealthBarVarbit.Maximum]: 255,
                [BossHealthBarVarbit.Boss]: 1,
                [BossHealthBarVarbit.Disabled]: 0,
            },
        },
    },
]);
assert.equal(storedVarps.get(BossHealthBarVar.NpcType), 2215);
assert.equal(storedVarbits.get(BossHealthBarVarbit.Current), 255);
assert.equal(storedVarbits.get(BossHealthBarVarbit.Boss), 1);

const decodedOpen = decodeServerPacket(
    new ServerBinaryEncoder().encodeWidgetOpenSub(
        (161 << 16) | 44,
        BOSS_HEALTH_BAR_GROUP_ID,
        1,
        { [BossHealthBarVar.NpcType]: 2215 },
        {
            [BossHealthBarVarbit.Current]: 255,
            [BossHealthBarVarbit.Maximum]: 255,
            [BossHealthBarVarbit.Boss]: 1,
            [BossHealthBarVarbit.Disabled]: 0,
        },
    ),
);
assert.equal(decodedOpen?.type, "widget");
assert.equal(decodedOpen?.payload?.action, "open_sub");
assert.equal(decodedOpen?.payload?.groupId, BOSS_HEALTH_BAR_GROUP_ID);
assert.equal(decodedOpen?.payload?.varbits?.[BossHealthBarVarbit.Boss], 1);
assert.ok(
    widgetEvents.some(
        (event) =>
            event.action === "set_text" &&
            event.uid === bossHealthBarUid(BossHealthBarComponent.Name) &&
            event.text === "General Graardor",
    ),
);

updateBossHealthBar(player, services, {
    npcTypeId: 2215,
    name: "General Graardor",
    current: 200,
    maximum: 255,
});
assert.deepEqual(sentVarps.at(-1), [BossHealthBarVar.NpcType, 2215]);
assert.deepEqual(sentVarbits.slice(-4), [
    [BossHealthBarVarbit.Maximum, 255],
    [BossHealthBarVarbit.Current, 200],
    [BossHealthBarVarbit.Boss, 1],
    [BossHealthBarVarbit.Disabled, 0],
]);

player.displayMode = DisplayMode.FIXED;
updateBossHealthBar(player, services, {
    npcTypeId: 2215,
    name: "General Graardor",
    current: 200,
    maximum: 255,
});
assert.deepEqual(closes.at(-1), {
    targetUid: (161 << 16) | 44,
    groupId: BOSS_HEALTH_BAR_GROUP_ID,
});
assert.equal(opens.at(-1)?.targetUid, (548 << 16) | 44);

const opensBeforeLedgerRepair = opens.length;
widgetIsOpen = false;
updateBossHealthBar(player, services, {
    npcTypeId: 2215,
    name: "General Graardor",
    current: 200,
    maximum: 255,
});
assert.equal(
    opens.length,
    opensBeforeLedgerRepair + 1,
    "a replaced native sub-interface is repaired even when health is unchanged",
);

closeBossHealthBar(player, services);
assert.deepEqual(closes.at(-1), {
    targetUid: (548 << 16) | 44,
    groupId: BOSS_HEALTH_BAR_GROUP_ID,
});
assert.equal(storedVarps.get(BossHealthBarVar.NpcType), -1);
assert.equal(storedVarbits.get(BossHealthBarVarbit.Boss), 0);
assert.ok(
    sentVarbits.some(
        ([id, value]) => id === BossHealthBarVarbit.Boss && value === 0,
    ),
    "closing the encounter deactivates the cache's boss HUD mode",
);
assert.deepEqual(sentVarbits.at(-1), [BossHealthBarVarbit.Disabled, 1]);
assert.equal(
    storedVarbits.get(BossHealthBarVarbit.Disabled),
    1,
    "an encounter must restore the player's pre-existing native HUD visibility preference",
);
assert.equal(
    widgetEvents.some(
        (event) =>
            event.action === "set_hidden" &&
            event.uid === ((548 << 16) | 44) &&
            event.hidden === true,
    ),
    false,
    "closing the sub-interface must not leave the cache HUD mount hidden",
);

console.log("boss health bar lifecycle tests passed");
