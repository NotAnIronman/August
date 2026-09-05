import assert from "node:assert/strict";
import { MenuTargetType } from "@august/osrs-engine/MenuEntry";
import { MenuEntrySwapperPlugin } from "@client/features/plugins/menuentryswapper/MenuEntrySwapperPlugin";
import { worldEntriesToSimple } from "@client/ui/runtime/menu/MenuBridge";
import { MenuAction } from "@client/ui/runtime/menu/MenuAction";
import { MenuState, MenuOpcode } from "@client/ui/runtime/menu/MenuState";
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
