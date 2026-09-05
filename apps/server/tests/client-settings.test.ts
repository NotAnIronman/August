import assert from "node:assert/strict";
import { applyClientSetting } from "@server/widgets/clientSettings";
import { mountLoginGameframe } from "@server/widgets/loginGameframe";
import { VARBIT_MINIMAP_TOGGLE } from "@server/widgets/minimapOrbs";
import { PlayerVarpState } from "@server/game/state/PlayerVarpState";
import { PlayerWidgetManager, getDefaultInterfaces } from "@server/widgets/WidgetManager";
import { getMainmodalUid, getInventoryTabUid, getQuestTabUid, getSidemodalUid } from "@server/widgets/viewport";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";
import { ClientSettingId, isValidClientSetting } from "@august/protocol/ui/clientSettings";
import { clientEncoder } from "@client/core/network/packet/ClientBinaryEncoder";
import { decodeClientPacket } from "@server/network/packet/ClientBinaryDecoder";

const events: any[] = [];
const player: any = { id: 1, displayMode: 1, varps: new PlayerVarpState(), name: "Test" };
player.varps.deserialize(undefined);
player.widgets = new PlayerWidgetManager();
player.widgets.setDispatcher((event: unknown) => events.push(event));
const services: any = {
    viewport: { getDefaultInterfaces, getMainmodalUid },
    variables: { sendVarbit: (_p: unknown, id: number, value: number) => events.push({ action: "varbit", id, value }) },
    system: { getCurrentTick: () => 1 },
    dialog: {
        getInterfaceService: () => ({ triggerCloseHooksForEntries() {} }),
        queueWidgetEvent: (_id: number, event: unknown) => events.push(event),
        openSubInterface: (_p: unknown, targetUid: number, groupId: number, type: number, opts: any = {}) => {
            player.widgets.open(groupId, { ...opts, targetUid, type });
        },
    },
};
const loginMounts = (mounts: ReturnType<typeof getDefaultInterfaces>) => mountLoginGameframe(player, mounts, {
    currentTick: 1, queue: action => events.push(action),
    getSideJournalBootstrap: () => ({}), applySideJournal: () => {},
});
loginMounts(getDefaultInterfaces(1));
for (const mode of [0,2,1]) {
    events.length = 0;
    assert.equal(applyClientSetting(player, services, ClientSettingId.DisplayMode, mode), true);
    assert.equal(player.displayMode, mode);
    assert.equal(player.varps.preferredDisplayMode, mode);
    assert(events.some(e => e.action === "set_root" && e.groupId === [548,161,164][mode]));
    const saved = mergePlayerPersistentVars(undefined, JSON.parse(JSON.stringify(player.varps.serialize())));
    const restored = new PlayerVarpState(); restored.deserialize(saved);
    assert.equal(restored.preferredDisplayMode, mode);
    const root = [548,161,164][mode];
    const invChild = [84,79,76][mode];
    assert.equal(getInventoryTabUid(mode), (root << 16) | invChild);
    assert.equal(getQuestTabUid(mode), (root << 16) | (invChild - 1));
    assert.equal(getSidemodalUid(mode), (root << 16) | [79,74,71][mode]);
    assert.equal(getMainmodalUid(mode), (root << 16) | [41,16,16][mode]);
    assert(events.some(e => e.action === "open_sub" && e.groupId === 149 && e.targetUid === getInventoryTabUid(mode)));
    for (const value of [0,0,1]) {
        applyClientSetting(player, services, ClientSettingId.XpDrops, value);
        assert.equal(player.varps.getVarbitValue(4702), value, "explicit setting is idempotent");
        assert(events.some(e => e.action === "set_hidden" && e.uid === ((root << 16) | [45,19,19][mode]) && e.hidden === (value === 0)));
    }
}
for (const [setting,value] of [[0,0],[0,2],[1,0],[1,1]]) {
    assert(isValidClientSetting(setting,value));
    assert.deepEqual(decodeClientPacket(clientEncoder.encodeClientSetting(setting,value)), { type:"client_setting",payload:{setting,value} });
}
for (const [setting,value] of [[2,0],[0,3],[1,2],[0,NaN],[0,-1]]) assert(!isValidClientSetting(setting,value));
// A tutorial/character-creation login must not accidentally unlock tabs on resize.
for (const start of [0,1,2]) for (const tutorial of [false,true]) for (const hideMap of [0,1]) {
    player.widgets.closeAll({silent:true});
    player.displayMode = start;
    player.varps.setVarbitValue(VARBIT_MINIMAP_TOGGLE,hideMap);
    const mounts = getDefaultInterfaces(start,{tutorialMode:tutorial});
    loginMounts(mounts);
    const expected = new Set(mounts.map(m => m.groupId === 160 && hideMap === 1 ? 895 : m.groupId));
    for (const mode of [2,0,1]) {
        events.length = 0;
        applyClientSetting(player,services,ClientSettingId.DisplayMode,mode);
        for (const m of getDefaultInterfaces(mode)) {
            const group = m.groupId === 160 && hideMap === 1 ? 895 : m.groupId;
            assert.equal(player.widgets.isOpen(group),expected.has(group),`login ${start}, tutorial ${tutorial}, map ${hideMap}: group ${group}`);
        }
    }
    if (tutorial) {
        // The production character-design completion uses this same mount function.
        loginMounts(getDefaultInterfaces(player.displayMode));
        applyClientSetting(player,services,ClientSettingId.DisplayMode,2);
        assert(player.widgets.isOpen(149),"finishing creation restores and tracks the inventory");
        assert(player.widgets.isOpen(162),"finishing creation restores and tracks chat");
    }
}
player.displayMode = 4;
assert.equal(applyClientSetting(player, services, 0, 0), false);
assert.equal(player.displayMode, 4);
console.log("Client setting persistence, layout remounts and XP visibility passed");
