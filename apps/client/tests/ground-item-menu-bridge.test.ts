import assert from "node:assert/strict";

import { MenuTargetType, type OsrsMenuEntry } from "@august/osrs-engine/MenuEntry";
import { worldEntriesToSimple } from "@client/ui/runtime/menu/MenuBridge";
import { MenuAction } from "@client/ui/runtime/menu/MenuAction";
import { chooseDefaultMenuEntry } from "@client/ui/runtime/menu/MenuEngine";
import { MenuOpcode } from "@client/ui/runtime/menu/MenuState";

const hiddenTake: OsrsMenuEntry = {
    option: "Take",
    targetId: 592,
    targetType: MenuTargetType.OBJ,
    targetName: "Ashes",
    targetLevel: -1,
    actionIndex: 2,
    deprioritized: true,
};
const visibleTake: OsrsMenuEntry = {
    option: "Take",
    targetId: 4151,
    targetType: MenuTargetType.OBJ,
    targetName: "Abyssal whip",
    targetLevel: -1,
    actionIndex: 2,
};

const entries = worldEntriesToSimple([hiddenTake, visibleTake]);
const hidden = entries.find((entry) => entry.targetId === hiddenTake.targetId);
const visible = entries.find((entry) => entry.targetId === visibleTake.targetId);

assert.equal(hidden?.deprioritized, true, "world-menu deprioritization survives the UI bridge");
assert.equal(visible?.deprioritized, false);
assert.equal(
    chooseDefaultMenuEntry(entries)?.targetId,
    visibleTake.targetId,
    "a hidden ground item cannot become the default left-click Take action",
);

const decorated = worldEntriesToSimple([
    {
        option: "<col=ff9600>Take</col>",
        targetId: 4151,
        targetType: MenuTargetType.OBJ,
        targetName: "<col=ff9600>Abyssal whip</col>",
        targetLevel: -1,
        actionIndex: 2,
    },
    {
        option: "<col=ff9600>Examine</col>",
        targetId: 4151,
        targetType: MenuTargetType.OBJ,
        targetName: "<col=ff9600>Abyssal whip</col>",
        targetLevel: -1,
    },
    {
        option: "Highlight",
        targetId: 4151,
        targetType: MenuTargetType.OBJ,
        targetName: "Abyssal whip",
        targetLevel: -1,
        opcode: MenuOpcode.Custom,
        deprioritized: true,
    },
], { label: { includeExamineIds: true } });
const decoratedTake = decorated.find((entry) => entry.action === MenuAction.Take);
const decoratedExamine = decorated.find((entry) => entry.action === MenuAction.Examine);
const localHighlight = decorated.find((entry) => entry.option === "Highlight");
assert.equal(decoratedTake?.opcode, MenuOpcode.GroundItemThirdOption);
assert.equal(decoratedExamine?.opcode, MenuOpcode.ExamineGroundItem);
assert.match(
    decoratedExamine?.target ?? "",
    /ID: 4151/,
    "colored Examine options retain the optional debug item id",
);
assert.equal(
    (localHighlight?.opcode ?? -1) % 2000,
    MenuOpcode.Custom,
    "Alt list controls remain client-local (with the normal deprioritized opcode offset)",
);

// Native MenuState ground-item actions own their packet send. The retained high-level
// callback is only for direct/legacy menu surfaces and must not run as a parallel send.
{
    let directDispatches = 0;
    const [take] = worldEntriesToSimple([
        {
            ...visibleTake,
            onClick: () => {
                directDispatches++;
            },
        },
    ]);
    take?.onClick?.(0, 0, { source: "menu", worldMenuStateDispatch: true });
    assert.equal(directDispatches, 0, "native ground-item routing suppresses the duplicate handler");
    take?.onClick?.(0, 0, { source: "menu" });
    assert.equal(directDispatches, 1, "direct menu surfaces still retain their ground-item handler");
}

console.log("ground-item-menu-bridge.test.ts: all assertions passed");
