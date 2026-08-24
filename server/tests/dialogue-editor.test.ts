/**
 * Drives the REAL command handlers registered by registerDevDialogueEditor
 * (not a reimplementation) through a full realistic flow, using minimal
 * mocks for the handful of services fields the file actually touches
 * (services.dialog / dialogueOverrideStore / data / quests / messaging -
 * confirmed via grep before writing this). This is the closest thing to a
 * real client session available without one.
 */
import assert from "node:assert/strict";

import { registerDevDialogueEditor, openDialogueEditorForNpc } from "../gamemodes/vanilla/widgets/devDialogueEditor";
import type { IScriptRegistry, ScriptServices, CommandHandler } from "../src/game/scripts/types";
import type { DialogueTreeJson } from "../src/game/dialogue/DialogueTree";
import { validateDialogueTreeJson } from "../src/game/dialogue/DialogueTree";
import { ComponentIds } from "../../client/common/uikit/contracts";

const commands = new Map<string, CommandHandler>();
const buttons = new Map<string, (event: { player: any }) => void>();

const fakeRegistry = {
    registerCommand: (name: string, handler: CommandHandler) => {
        commands.set(name, handler);
        return { ok: true };
    },
    onButton: (_groupId: number, componentId: number, handler: any) => {
        buttons.set(String(componentId), handler);
        return { ok: true };
    },
} as unknown as IScriptRegistry;

const storesByNpc = new Map<number, DialogueTreeJson>();
const sentMessages: string[] = [];

const fakeServices = {
    dialog: {
        queueWidgetEvent: (_playerId: number, event: any) => {
            if (event.action === "set_text" && event.uid) {
                // Track TEXT_ROW_LINE_BASE-range text sets so we can inspect the outline.
            }
        },
        // registerUiPanelActions gates every click on the panel being open
        // for that player (see actions.ts) - without this, every simulated
        // button click below would silently no-op.
        getInterfaceService: () => ({
            isModalOpen: () => true,
            closeModal: () => {},
            openModal: () => {},
        }),
    },
    dialogueOverrideStore: {
        get: (npcId: number) => {
            const steps = storesByNpc.get(npcId);
            return steps ? { npcId, steps, updatedBy: "test", updatedAt: "now" } : undefined;
        },
        set: (npcId: number, tree: DialogueTreeJson) => {
            storesByNpc.set(npcId, tree.steps);
            return [];
        },
        has: (npcId: number) => storesByNpc.has(npcId),
        delete: (npcId: number) => storesByNpc.delete(npcId),
    },
    data: {
        getNpcTypeLoader: () => ({ load: () => ({ name: "Man" }) }),
    },
    quests: {
        getStage: () => 0,
        setStage: () => {},
        hasQuest: (key: string) => key === "cooks_assistant",
    },
    messaging: {
        sendGameMessage: (_player: any, text: string) => sentMessages.push(text),
    },
} as unknown as ScriptServices;

const player = { id: 1, name: "Tester" } as any;

function run(command: string, args: string[]): string {
    const handler = commands.get(command);
    if (!handler) return `NO SUCH COMMAND: ${command}`;
    const result = handler({ player, command, args, tick: 0 } as any);
    return typeof result === "string" ? result : "(ok)";
}

function dump(npcId: number): void {
    const steps = storesByNpc.get(npcId);
    if (!steps) { console.log("  (empty tree)"); return; }
    function walk(steps: any[], prefix: string, indent: string) {
        let counter = 0;
        for (const step of steps) {
            if (step.kind === "line") {
                counter += 1;
                console.log(`  ${indent}${prefix}${counter}.) [${step.speaker}] ${step.text.join(" / ")}`);
            } else if (step.kind === "action") {
                counter += 1;
                const desc = step.action.type === "setQuestStage"
                    ? `quest ${step.action.questKey} -> ${step.action.value}`
                    : `giveItem ${step.action.itemId} x${step.action.quantity}`;
                console.log(`  ${indent}${prefix}${counter}.) [Action] ${desc}`);
            } else {
                const eff = counter === 0 ? 1 : counter;
                step.options.forEach((opt: any, i: number) => {
                    const letter = String.fromCharCode(65 + i);
                    const label = `${prefix}${eff}${letter}`;
                    const tag = opt.condition ? ` [cond: ${JSON.stringify(opt.condition)}]` : "";
                    console.log(`  ${indent}${label}.) ${opt.label}${tag}`);
                    walk(opt.steps, label, indent + "  ");
                });
            }
        }
    }
    walk(steps, "", "");
}

function expect(desc: string, actual: unknown, expected: unknown): void {
    assert.deepEqual(actual, expected, `${desc} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    console.log(`PASS: ${desc}`);
}

registerDevDialogueEditor(fakeRegistry, fakeServices);

const NPC_A = 3106;
console.log("--- 1. Open editor for a fresh NPC ---");
openDialogueEditorForNpc(player, fakeServices, NPC_A);
expect("tree starts empty", storesByNpc.get(NPC_A), undefined);

console.log("\n--- 2. Add first NPC line via ::dline (root, nothing selected) ---");
console.log(run("dline", ["npc", "Hello", "there!"]));
dump(NPC_A);
expect("root has 1 line", storesByNpc.get(NPC_A)?.length, 1);

console.log("\n--- 3. Simulate clicking 'Reply' then typing via ::dinput (real toolbar path) ---");
console.log(run("dsel", ["1"]));
buttons.get("921")?.({ player }); // CONTROL_BACKGROUND_BASE+1 = add_player_option
console.log(run("dinput", ["I", "am", "looking", "for", "a", "quest!"]));
dump(NPC_A);

console.log("\n--- 4. Add a nested NPC line inside option 1A ---");
console.log(run("dsel", ["1A"]));
console.log(run("dline", ["npc", "Great,", "let's", "get", "started."]));
dump(NPC_A);

console.log("\n--- 5. Toggle speaker on that nested line via the Speaker button ---");
buttons.get("923")?.({ player }); // CONTROL_BACKGROUND_BASE+3 = speaker
dump(NPC_A);

console.log("\n--- 6. Add a second option via ::doption directly ---");
console.log(run("dsel", ["1"]));
console.log(run("doption", ["Where", "can", "I", "find", "a", "shop?"]));
dump(NPC_A);

console.log("\n--- 7. Gate option 1B with an item condition via ::dcond ---");
console.log(run("dsel", ["1B"]));
console.log(run("dcond", ["item", "995", "3"]));
dump(NPC_A);

console.log("\n--- 8. Add a quest-stage action after the whole thing via ::daction ---");
console.log(run("dsel", ["1"]));
console.log(run("daction", ["quest", "cooks_assistant", "2"]));
dump(NPC_A);

console.log("\n--- 9. Move the action up ---");
console.log(run("dsel", ["2"]));
console.log(run("dmove", ["up"]));
dump(NPC_A);

console.log("\n--- Final structural assertions ---");
expect("root has 3 steps (action, line, options)", storesByNpc.get(NPC_A)?.length, 3);
const root = storesByNpc.get(NPC_A)!;
expect("step 0 is the action (moved up)", root[0].kind, "action");
expect("step 1 is the line", root[1].kind, "line");
expect("step 2 is the options branch", root[2].kind, "options");
const optionsStep = root[2] as any;
expect("2 options under the line", optionsStep.options.length, 2);
expect("option B has an item condition", optionsStep.options[1].condition?.type, "hasItem");
expect("nested line under option A speaker flipped to player", optionsStep.options[0].steps[0].speaker, "player");

console.log("\n--- 10. Capitalization is preserved through ::dtext (real bug this session) ---");
console.log(run("dsel", ["2"])); // the line "Hello there!"
console.log(run("dtext", ["Hello", "There,", "Friend!"]));
expect("line text keeps original capitalization", root[1].kind === "line" ? (root[1] as any).text[0] : undefined, "Hello There, Friend!");

console.log("\n--- 11. giveItem action via ::daction item ---");
console.log(run("dsel", ["2"]));
console.log(run("daction", ["item", "995", "3"]));
dump(NPC_A);
const afterGiveItem = storesByNpc.get(NPC_A)!;
expect("root now has 4 steps after giveItem action inserted", afterGiveItem.length, 4);
expect("new step is a giveItem action", (afterGiveItem[2] as any).kind, "action");
expect("giveItem action has correct itemId/quantity", (afterGiveItem[2] as any).action, { type: "giveItem", itemId: 995, quantity: 3 });

console.log("\n--- 12. Branch nested directly under another branch's option (no line in between) — point #5 ---");
// Build a fresh, isolated tree for this check: 1.) How may I help? -> 1A/1B,
// then nest a whole new options-step directly inside option 1B (no NPC line
// first), matching the exact "1B leads straight into another choice" shape
// from the feedback.
const NPC_B = 9999;
openDialogueEditorForNpc(player, fakeServices, NPC_B);
expect("second NPC starts with its own empty tree", storesByNpc.get(NPC_B), undefined);
console.log(run("dline", ["npc", "How", "may", "I", "help?"]));
console.log(run("dsel", ["1"]));
console.log(run("doption", ["I", "need", "a", "quest"]));
console.log(run("dsel", ["1"]));
console.log(run("doption", ["Where", "can", "I", "find..."]));
console.log(run("dsel", ["1B"]));
console.log(run("dnest", ["A", "Shop?"])); // nest a NEW branch under 1B -> should create 1B1A
dump(NPC_B);
const branchRoot = storesByNpc.get(NPC_B)!;
const outer = (branchRoot[1] as any); // [0]=the "How may I help?" line, [1]=the options step
expect("outer branch still has exactly 2 options (1A, 1B)", outer.options.length, 2);
const optionB = outer.options[1];
expect("option B's own steps contain exactly one nested options-step", optionB.steps.length, 1);
expect("nested step under 1B is itself an options-step", optionB.steps[0].kind, "options");
expect("nested branch has one option so far", optionB.steps[0].options.length, 1);
const selectNestedResult = run("dsel", ["1B1A"]);
expect("the real ::dsel command can resolve the nested option's path", selectNestedResult, "(ok)");
// Add the remaining two nested options + a reply line under each, matching the full mockup shape.
console.log(run("dsel", ["1B1A"]));
console.log(run("dline", ["npc", "Up", "the", "road", "and", "to", "the", "right."]));
console.log(run("dsel", ["1B"]));
console.log(run("dnest", ["A", "Church?"]));
console.log(run("dsel", ["1B"]));
console.log(run("dnest", ["A", "bed?"]));
dump(NPC_B);
expect("nested branch now has all 3 options (Shop/Church/bed)", optionB.steps[0].options.length, 3);
expect("nested reply line kept its capitalization/text intact", optionB.steps[0].options[0].steps[0].text[0], "Up the road and to the right.");

console.log("\n--- 13. Deleting a nested branch down to empty is ALLOWED (option 1B just ends the conversation there) ---");
// option 1B's own .steps contains ONLY the nested branch - removing it
// leaves .steps empty, which used to be refused but is now a deliberately
// supported shape (see DialogueTree.ts's allowEmpty and applyDelete's
// isRoot check) - 1B becomes a response with nothing further to say,
// exactly the "Nevermind" scenario this was built for. Only the ROOT tree
// still refuses to go empty (covered separately below in step 14).
console.log(run("dsel", ["1B1C"])); // "A bed?" — third option in the nested branch under 1B
const nestedDeleteResult = run("ddeletebranch", []);
dump(NPC_B);
expect("deleting the nested branch under 1B now succeeds", nestedDeleteResult, "(ok)");
expect("1B.steps is now empty - it ends the conversation there", optionB.steps.length, 0);
expect("outer branch (1A/1B) untouched by the nested delete", outer.options.length, 2);
expect("the tree is still schema-valid with 1B now empty", validateDialogueTreeJson({ steps: branchRoot }).length, 0);

console.log("\n--- 14. Options can't still be deleted one at a time below the 2-option floor ---");
console.log(run("dsel", ["1A"]));
const belowFloorError = run("ddelete", []);
expect("single-option delete is still blocked below 2 with a clear message", belowFloorError.includes("Delete Branch"), true);
console.log(run("dsel", ["1A"]));
console.log(run("ddeletebranch", []));
expect("the whole 1A/1B branch is now gone, leaving only the original line", branchRoot.length, 1);
expect("remaining root step is the line", branchRoot[0].kind, "line");
dump(NPC_B);

console.log("dialogue editor regression test passed");

console.log("\n--- 15. Per-row inline Up/Down/Delete buttons (the new UI overhaul) ---");
const NPC_C = 5555;
openDialogueEditorForNpc(player, fakeServices, NPC_C);
console.log(run("dline", ["npc", "Hello!"]));
console.log(run("dline", ["npc", "Goodbye!"]));
dump(NPC_C);
// No pending action -> header is exactly [heading, "Selected:X", divider] = 3 rows, so body starts at row index 3.
expect("two lines exist before reordering", storesByNpc.get(NPC_C)!.length, 2);
// No pending action -> header is [heading, "Selected:X", divider] = 3 rows,
// so body row 0 (path "1") is at row index 3, row 1 (path "2") at index 4.
// Click the inline "move up" button on row 4 ("Goodbye!", path "2").
buttons.get(String(ComponentIds.ROW_MOVE_UP_BASE + 4))?.({ player });
dump(NPC_C);
expect("Goodbye! moved to the front via its own row's Up button", (storesByNpc.get(NPC_C)![0] as any).text[0], "Goodbye!");
// Click the inline "delete" button on row 3 (now whichever line is first).
buttons.get(String(ComponentIds.ROW_DELETE_BASE + 3))?.({ player });
dump(NPC_C);
expect("one line remains after the inline Delete button", storesByNpc.get(NPC_C)!.length, 1);
expect("the remaining line is Hello!", (storesByNpc.get(NPC_C)![0] as any).text[0], "Hello!");
// A click on a row beyond capacity, or a header/blank row, must be a harmless no-op, never a crash.
buttons.get(String(ComponentIds.ROW_DELETE_BASE + 0))?.({ player }); // row 0 = heading, no path
dump(NPC_C);
expect("clicking a header row's (nonexistent) inline button did nothing", storesByNpc.get(NPC_C)!.length, 1);

console.log("\n--- 16. Toolbar icons for item/quest conditions and give-item (restored/added this round) ---");
console.log(run("dline", ["npc", "Care", "for", "a", "quest?"]));
buttons.get(String(ComponentIds.CONTROL_BACKGROUND_BASE + 1))?.({ player }); // Reply
console.log(run("dinput", ["Sure!"]));
console.log(run("dsel", ["2A"])); // the new option
buttons.get(String(ComponentIds.CONTROL_BACKGROUND_BASE + 4))?.({ player }); // Item condition icon
console.log(run("dinput", ["995", "2"]));
dump(NPC_C);
const optionsStepC = storesByNpc.get(NPC_C)!.find((s: any) => s.kind === "options") as any;
expect("item-condition toolbar icon armed and applied correctly", optionsStepC.options[0].condition, { type: "hasItem", itemId: 995, quantity: 2 });
console.log(run("dsel", ["1"]));
buttons.get(String(ComponentIds.CONTROL_BACKGROUND_BASE + 6))?.({ player }); // Give-item icon
console.log(run("dinput", ["1205", "1"]));
dump(NPC_C);
const rootC = storesByNpc.get(NPC_C)!;
expect("give-item toolbar icon armed and applied correctly", (rootC[1] as any).action, { type: "giveItem", itemId: 1205, quantity: 1 });

console.log("\n--- 17. A response option can now legitimately end the conversation with no reply (real feature request) ---");
// Schema-level: an option's own steps may be empty; the root tree may not.
expect("root steps cannot be empty", validateDialogueTreeJson({ steps: [] }).length > 0, true);
expect(
    "an option's steps CAN be empty (ends the conversation there)",
    validateDialogueTreeJson({
        steps: [
            { kind: "line", speaker: "npc", text: ["How may I help you?"] },
            { kind: "options", options: [
                { label: "I need a quest", steps: [{ kind: "line", speaker: "npc", text: ["Sure!"] }] },
                { label: "Nevermind", steps: [] },
            ] },
        ],
    }).length,
    0,
);
// Editor-level: deleting an option's only line down to empty must now be
// ALLOWED (it used to be blocked - the literal thing being asked for here).
const NPC_D = 7777;
openDialogueEditorForNpc(player, fakeServices, NPC_D);
console.log(run("dline", ["npc", "How", "may", "I", "help?"]));
console.log(run("dsel", ["1"]));
console.log(run("doption", ["I", "need", "a", "quest"]));
console.log(run("dsel", ["1"]));
console.log(run("doption", ["Nevermind"]));
console.log(run("dsel", ["1B"]));
console.log(run("dline", ["npc", "Placeholder", "reply."]));
dump(NPC_D);
console.log(run("dsel", ["1B1"]));
const deleteDownToEmptyResult = run("ddelete", []);
dump(NPC_D);
expect("deleting the option's only line down to empty is now allowed", deleteDownToEmptyResult, "(ok)");
const treeD = storesByNpc.get(NPC_D)!;
const optionsD = treeD.find((s: any) => s.kind === "options") as any;
expect("the 'Nevermind' option now has zero steps", optionsD.options[1].steps.length, 0);
expect("the persisted tree is still schema-valid with that empty branch", validateDialogueTreeJson({ steps: treeD }).length, 0);
// Root still can't be emptied - the one real guardrail that must remain.
// (root currently has [line, optionsStep] = 2 items; deleting the line
// alone would correctly leave 1, not 0, so that's not the right check -
// need to remove the whole branch first to get root down to exactly 1.)
console.log(run("dsel", ["1A"]));
console.log(run("ddeletebranch", [])); // removes the whole 1A/1B options-step, leaving root = [line] only
dump(NPC_D);
expect("root is down to exactly the one line now", storesByNpc.get(NPC_D)!.length, 1);
console.log(run("dsel", ["1"]));
const rootDeleteResult = run("ddelete", []);
expect("deleting the LAST remaining root step is still refused", rootDeleteResult.includes("tree can't be left completely empty"), true);
expect("root still has its one line after the refused delete", storesByNpc.get(NPC_D)!.length, 1);

console.log("dialogue editor regression test passed");
