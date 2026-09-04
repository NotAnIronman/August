import assert from "node:assert/strict";

import {
    ATTACK_OPTION_ALWAYS_RIGHT_CLICK,
    ATTACK_OPTION_DEPENDS_ON_COMBAT_LEVELS,
    ATTACK_OPTION_HIDDEN,
    ATTACK_OPTION_LEFT_CLICK_WHERE_AVAILABLE,
    normalizeAttackOptionMode,
    shouldDeprioritizeAttack,
} from "../src/engine/game/menu/AttackOptionPolicy";
import { AttackOptionSettingsController } from "../src/engine/game/widgets/AttackOptionSettingsController";
import {
    VARP_OPTION_ATTACK_PRIORITY_NPC,
    VARP_OPTION_ATTACK_PRIORITY_PLAYER,
} from "@august/game-model/state/vars";

const groupId = 116;
const uid = (childId: number): number => (groupId << 16) | childId;

function staticWidget(childId: number): any {
    return { uid: uid(childId), groupId, fileId: childId };
}

function dynamicOption(parentUid: number, childIndex: number, text: string, y: number): any {
    return {
        uid: parentUid,
        id: parentUid,
        parentUid,
        groupId,
        fileId: -1,
        childIndex,
        text,
        y,
        actions: ["Select"],
    };
}

{
    const controller = new AttackOptionSettingsController();
    const playerListUid = uid(38);
    const playerOptions = [
        dynamicOption(playerListUid, 1, "Depends on combat levels", 0),
        dynamicOption(playerListUid, 2, "Always right-click", 20),
        dynamicOption(playerListUid, 3, "Left-click where available", 40),
        dynamicOption(playerListUid, 4, "Hidden", 60),
    ];
    const widgetManager = {
        getWidgetByUid: (widgetUid: number) =>
            widgetUid === playerListUid ? { uid: playerListUid, children: playerOptions } : undefined,
    } as never;

    assert.equal(
        controller.observeAction(widgetManager, {
            widget: staticWidget(6),
            option: "Choose",
            source: "primary",
        }),
        undefined,
    );
    assert.deepEqual(
        controller.observeAction(widgetManager, {
            widget: playerOptions[2],
            option: "Select",
            target: "<col=ffffff>Left-click where available</col>",
            source: "primary",
        }),
        { varpId: VARP_OPTION_ATTACK_PRIORITY_PLAYER, value: 2 },
    );

    controller.observeAction(widgetManager, {
        widget: staticWidget(7),
        option: "Choose",
        source: "primary",
    });
    assert.deepEqual(
        controller.observeAction(widgetManager, {
            widget: playerOptions[3],
            option: "Select",
            target: "Hidden",
            source: "menu",
        }),
        { varpId: VARP_OPTION_ATTACK_PRIORITY_NPC, value: 3 },
    );
}

// Missing labels fall back to the visible Select-row ordering, not a fragile childIndex offset.
{
    const controller = new AttackOptionSettingsController();
    const listUid = uid(39);
    const options = [1, 4, 8, 12].map((childIndex, index) =>
        dynamicOption(listUid, childIndex, "", index * 20),
    );
    const widgetManager = {
        getWidgetByUid: (widgetUid: number) =>
            widgetUid === listUid ? { uid: listUid, children: options } : undefined,
    } as never;
    controller.observeAction(widgetManager, { widget: staticWidget(7), option: "Choose" });
    assert.deepEqual(
        controller.observeAction(widgetManager, {
            widget: options[1],
            option: "Select",
            slot: options[1].childIndex,
        }),
        { varpId: VARP_OPTION_ATTACK_PRIORITY_NPC, value: 1 },
    );
}

assert.equal(normalizeAttackOptionMode(-1), ATTACK_OPTION_DEPENDS_ON_COMBAT_LEVELS);
assert.equal(normalizeAttackOptionMode(99), ATTACK_OPTION_HIDDEN);
assert.equal(
    shouldDeprioritizeAttack(ATTACK_OPTION_DEPENDS_ON_COMBAT_LEVELS, 100, 100),
    false,
);
assert.equal(
    shouldDeprioritizeAttack(ATTACK_OPTION_DEPENDS_ON_COMBAT_LEVELS, 99, 100),
    true,
);
assert.equal(shouldDeprioritizeAttack(ATTACK_OPTION_ALWAYS_RIGHT_CLICK, 126, 1), true);
assert.equal(
    shouldDeprioritizeAttack(ATTACK_OPTION_LEFT_CLICK_WHERE_AVAILABLE, 1, 126),
    false,
);
assert.equal(shouldDeprioritizeAttack(ATTACK_OPTION_HIDDEN, 126, 1), true);

console.log("attack option settings regression tests passed");
