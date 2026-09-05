import assert from "node:assert/strict";
import { MenuTargetType } from "@august/osrs-engine/MenuEntry";
import { MenuEntrySwapperPlugin } from "@client/features/plugins/menuentryswapper/MenuEntrySwapperPlugin";
import { worldEntriesToSimple } from "@client/ui/runtime/menu/MenuBridge";
import { MenuAction } from "@client/ui/runtime/menu/MenuAction";
import { MenuState, MenuOpcode } from "@client/ui/runtime/menu/MenuState";
import { createPrimaryWidgetActionResolver } from "@client/engine/game/widgets/input/widgetPrimaryAction";
import { ClientState } from "@client/engine/game/ClientState";
(globalThis as { self?: unknown }).self = globalThis;
const { buildSimpleMenuEntries } = require("@client/engine/rendering/render/interact/menu") as typeof import("@client/engine/rendering/render/interact/menu");

let saved: any;
const persistence = { load: () => saved, save: (config: any) => { saved = config; } };
const plugin = new MenuEntrySwapperPlugin(persistence);
const talk = { option: "Talk-to", targetType: MenuTargetType.NPC, targetId: 100, npcServerId: 42,
    target: "Banker", actionIndex: 0, opcode: MenuOpcode.NpcFirstOption };
const bank = { ...talk, option: "Bank", actionIndex: 2, opcode: MenuOpcode.NpcThirdOption };
plugin.setSwap(bank, "left", "Bank");
assert.equal(plugin.apply([talk, bank], false, false)[0], bank);
const restored = new MenuEntrySwapperPlugin(persistence);
assert.equal(restored.apply([talk, bank], false, false)[0], bank, "saved selection survives reload");
restored.setSwap(talk, "shift", "Talk-to");
assert.equal(restored.apply([talk, bank], true, false)[0].option, "Talk-to");
assert.equal(restored.apply([talk, bank], true, false)[0].shiftClick, true);
assert.equal(restored.apply([talk], false, false)[0], talk, "missing action safely falls back");
const cast = { ...talk, actionIndex: undefined, option: "Cast", action: MenuAction.Cast };
assert.equal(restored.apply([cast, bank], false, false)[0], cast, "spell targeting cannot be swapped away");
const attack = { ...bank, option: "Attack", deprioritized: true };
const ordinaryAttack = { ...attack, deprioritized: false };
restored.setSwap(bank, "left", "Bank");
assert.equal(restored.apply([ordinaryAttack, talk, bank], false, false)[0], bank,
    "explicit non-combat choice replaces the normal left-click Attack position");
const itemWidget = { groupId: 149, itemId: 315 };
const itemRows = [{ option: "Eat", target: "Shrimps", opIndex: 1 }, { option: "Drop", target: "Shrimps", opIndex: 5 }];
const itemConfig = restored.applyWidgetEntries(itemRows, itemWidget, true, true) as any[];
itemConfig.find(row => row.option === "Swap left-click").subEntries[1].onClick();
assert.equal(restored.getWidgetChoice(itemRows, itemWidget, false)?.opIndex, 5);
assert.equal(restored.getWidgetChoice(itemRows, { ...itemWidget, groupId: 12 }, false), undefined, "inventory swap cannot affect banking");
const spellWidget = { groupId: 218, itemId: 32700, uid: 218 << 16 };
const spellRows = [{ option: "Cast", target: "Spell", opIndex: 0 }, { option: "Autocast", target: "Spell", opIndex: 2 }];
const spellConfig = restored.applyWidgetEntries(spellRows, spellWidget, true, true) as any[];
spellConfig.find(row => row.option === "Swap shift-click").subEntries[1].onClick();
assert.equal(restored.getWidgetChoice(spellRows, spellWidget, true)?.opIndex, 2);
let shift = false;
const resolvePrimary = createPrimaryWidgetActionResolver({ getMenuEntrySwapper: () => restored,
    getSettings: () => ({ shiftClickEnabled: true }), getObjTypeLoader: () => undefined,
    getSpellSelection: () => ({ getWidgetTargetMask: () => 0 }),
} as never, { isShiftDown: () => shift } as never, { getWidgetFlags: () => 0xffffff, getWidgetByUid: () => undefined } as never, {} as never);
const itemButton = { ...itemWidget, uid: 149 << 16, childIndex: 4, fileId: 0, actions: ["Eat", null, null, null, "Drop"], name: "Shrimps" };
ClientState.isSpellSelected = false; ClientState.isItemSelected = 0;
assert.equal(resolvePrimary(itemButton).option, "Drop", "actual widget left click uses the saved inventory option");
assert.equal(resolvePrimary(itemButton).opIndex, 5, "original operation index survives resolution");
shift = true;
assert.equal(resolvePrimary({ ...spellWidget, fileId: 0, actions: ["Cast", "Autocast"] }).opIndex, 2,
    "actual spell shift click uses Autocast's original operation");
restored.setSwap(attack, "left", "Attack");
assert.equal(restored.apply([talk, attack], false, false)[0], talk, "swaps respect attack priority");
const configRows = restored.apply([talk, bank], true, true);
const chooser = configRows.find(row => row.option === "Swap left-click")!;
assert.equal(chooser.opcode, MenuOpcode.Custom);
chooser.subEntries![1].onClick!();
assert.equal(restored.getConfig().swaps["2:100"].left, "Bank");

const state = new MenuState();
const entries = worldEntriesToSimple([
    { ...bank, targetName: "Banker", targetLevel: -1 },
    { ...talk, targetName: "Banker", targetLevel: -1 },
], { menuState: state, transformEntries: rows => restored.apply(rows, false, false) });
assert.equal(entries[0].option, "Bank");
assert.equal(state.opcodes[entries[0].menuStateIndex!], MenuOpcode.NpcThirdOption);
assert.equal(state.identifiers[entries[0].menuStateIndex!], 42, "swap preserves server NPC index");
const initialMenu = buildSimpleMenuEntries({ osrsClient: {
    menuState: new MenuState(), menuEntrySwapperPlugin: restored,
    inputManager: { shiftDown: true, pickX: 100 }, menuOpen: false,
} } as never, [
    { ...bank, targetName: "Banker", targetLevel: -1 },
    { ...talk, targetName: "Banker", targetLevel: -1 },
], { shouldFreeze: false, toCssEvent: () => undefined });
assert(initialMenu.some(entry => entry.option === "Swap left-click"),
    "the first Shift-right-click includes configuration before menuOpen is set");
const players = worldEntriesToSimple([
    { option: "Walk here", targetType: MenuTargetType.NONE, targetId: -1, targetName: "", targetLevel: -1 },
    { option: "Follow", targetType: MenuTargetType.PLAYER, targetId: 9, targetName: "Tester", targetLevel: -1,
        actionIndex: 2, deprioritized: true },
]);
assert.equal(players[0].option, "Walk here");
restored.setConfig({ enabled: false });
assert.equal(restored.apply([talk, bank], false, false)[0], talk);
console.log("Menu Entry Swapper ordering, persistence, safeguards and dispatch passed");
