import assert from "node:assert/strict";

import type { ClientGroundItemStack } from "@client/engine/game/data/ground/GroundItemStore";
import {
    compileGroundItemRules,
    evaluateGroundItemRules,
} from "@client/features/plugins/grounditems/GroundItemRuleEngine";
import { GroundItemsPlugin } from "@client/features/plugins/grounditems/GroundItemsPlugin";
import type {
    GroundItemsPluginConfig,
    GroundItemsPluginPersistence,
} from "@client/features/plugins/grounditems/types";

function stack(
    overrides: Partial<ClientGroundItemStack & { stackable: boolean; noted: boolean }> = {},
): ClientGroundItemStack & { stackable: boolean; noted: boolean } {
    return {
        id: 1,
        itemId: 4151,
        quantity: 1,
        tile: { x: 3200, y: 3200, level: 0 },
        name: "Abyssal whip",
        value: 1_500_000,
        highAlch: 72_000,
        gePrice: 1_500_000,
        haPrice: 72_000,
        tradeable: true,
        stackable: false,
        noted: false,
        ownership: 1,
        ...overrides,
    };
}

// Built-in item lists resolve conflicts by specificity and then by highlight.
{
    const plugin = new GroundItemsPlugin();
    plugin.setConfig({
        highlightedItems: "*platebody*",
        hiddenItems: "Rune platebody",
        lowValuePrice: 0,
        mediumValuePrice: 0,
        highValuePrice: 0,
        insaneValuePrice: 0,
    });
    let result = plugin.evaluateStack(stack({ name: "Rune platebody", gePrice: 1 }));
    assert.equal(result.hidden, true, "exact hide wins over wildcard highlight");
    assert.equal(result.explicitHighlight, false);

    plugin.setConfig({ highlightedItems: "Rune platebody", hiddenItems: "*platebody*" });
    result = plugin.evaluateStack(stack({ name: "Rune platebody", gePrice: 1 }));
    assert.equal(result.hidden, false, "exact highlight wins over wildcard hide");
    assert.equal(result.explicitHighlight, true);

    plugin.setConfig({ highlightedItems: "*platebody*", hiddenItems: "Rune*" });
    result = plugin.evaluateStack(stack({ name: "Rune platebody", gePrice: 1 }));
    assert.equal(result.explicitHighlight, true, "wildcard highlight wins a wildcard tie");

    plugin.setConfig({ highlightedItems: '"Rune platebody"', hiddenItems: "Rune platebody" });
    result = plugin.evaluateStack(stack({ name: "Rune platebody", gePrice: 1 }));
    assert.equal(result.explicitHighlight, true, "exact highlight wins an exact tie");
}

// Core value boundaries are strict: equality remains in the tier below.
{
    const plugin = new GroundItemsPlugin();
    plugin.setConfig({
        highlightedItems: "",
        hiddenItems: "",
        valueCalculationMode: "ge",
        lowValuePrice: 20_000,
        mediumValuePrice: 100_000,
        highValuePrice: 1_000_000,
        insaneValuePrice: 10_000_000,
    });
    assert.equal(plugin.evaluateStack(stack({ gePrice: 20_000 })).tier, "none");
    assert.equal(plugin.evaluateStack(stack({ gePrice: 20_001 })).tier, "low");
    assert.equal(plugin.evaluateStack(stack({ gePrice: 100_000 })).tier, "low");
    assert.equal(plugin.evaluateStack(stack({ gePrice: 100_001 })).tier, "medium");
    assert.equal(plugin.evaluateStack(stack({ gePrice: 1_000_000 })).tier, "medium");
    assert.equal(plugin.evaluateStack(stack({ gePrice: 1_000_001 })).tier, "high");
    assert.equal(plugin.evaluateStack(stack({ gePrice: 10_000_000 })).tier, "high");
    assert.equal(plugin.evaluateStack(stack({ gePrice: 10_000_001 })).tier, "insane");
}

// The rule compiler is data-only, handles every supported predicate/style, and
// ignores malformed lines as a whole instead of applying a dangerous subset.
{
    const source = [
        "name=*whip | id=4151 | qty>=2 | value>2m | ge>=3m | ha>100k | tradeable=true | stackable=false | noted=false | ownership=self | area=3200,3200,2,0 | apply | color=#123abc | tile=true | overlay=false | menu=9",
        "name=*whip | highlight | beam=true",
        "name=*whip | hide",
        "qty=not-a-number | hide",
        "name=* | explode",
    ].join("\n");
    const compiled = compileGroundItemRules(source);
    assert.equal(compiled.rules.length, 3);
    assert.equal(compiled.diagnostics.length, 3);
    assert.deepEqual(
        compiled.diagnostics.map((diagnostic) => diagnostic.line),
        [4, 5, 5],
    );
    const subject = stack({ quantity: 2, gePrice: 1_600_000, haPrice: 60_000 });
    const result = evaluateGroundItemRules(compiled, {
        stack: subject,
        value: 3_200_000,
        geValue: 3_200_000,
        haValue: 120_000,
    });
    assert.equal(result.color, 0x123abc);
    assert.equal(result.tileHighlight, true);
    assert.equal(result.showOverlay, false, "an apply style survives the terminal rule");
    assert.equal(result.menuPriority, 9);
    assert.equal(result.highlighted, true);
    assert.equal(result.beam, true);
    assert.deepEqual(result.matchedRules, [
        { line: 1, action: "apply" },
        { line: 2, action: "highlight" },
    ]);
    assert.deepEqual(result.terminalRule, { line: 2, action: "highlight" });
}

// Ownership names map exactly to the wire values and terminal actions stop.
for (const [ownership, label] of [
    [0, "none"],
    [1, "self"],
    [2, "other"],
    [3, "group"],
] as const) {
    const compiled = compileGroundItemRules(
        `ownership=${label} | beam\nname=* | hide`,
    );
    const subject = stack({ ownership });
    const result = evaluateGroundItemRules(compiled, {
        stack: subject,
        value: subject.gePrice,
        geValue: subject.gePrice,
        haValue: subject.haPrice,
    });
    assert.equal(result.beam, true, `${label} ownership predicate matches ${ownership}`);
    assert.equal(result.hidden, false);
    assert.equal(result.matchedRules.length, 1, "terminal beam prevents later hide");
}

// Plugin integration exposes diagnostics and rule visibility/beam/tile overrides.
{
    const plugin = new GroundItemsPlugin();
    plugin.setConfig({
        advancedFilterRules: [
            "name=Ashes | hide",
            "name=*whip | apply | tile=true | beam=false | color=#abcdef | menu=25",
            "name=*whip | show",
            "bad-token | hide",
        ].join("\n"),
    });
    assert.equal(plugin.getState().ruleDiagnostics.length, 1);
    assert.deepEqual(plugin.getRuleDiagnostics(), plugin.getState().ruleDiagnostics);
    const ashes = plugin.evaluateStack(stack({ name: "Ashes", gePrice: 1 }));
    assert.equal(ashes.hidden, true);
    assert.equal(ashes.showOverlay, false);
    assert.equal(ashes.showMenu, false);
    assert.equal(ashes.tileHighlight, false, "terminal hide suppresses every world marker");
    const whip = plugin.evaluateStack(stack());
    assert.equal(whip.tileHighlight, true);
    assert.equal(whip.beam, false);
    assert.equal(whip.color, 0xabcdef);
    assert.equal(whip.menuPriority, 25);
}

// A continuing style cannot leak a tile marker through a later terminal hide,
// while holding Alt restores the filtered item's complete menu as well as its label.
{
    const plugin = new GroundItemsPlugin();
    plugin.setConfig({
        hiddenItems: "",
        advancedFilterRules: [
            "name=Ashes | apply | tile=true",
            "name=Ashes | hide",
        ].join("\n"),
    });
    const ashes = stack({ name: "Ashes", gePrice: 1 });
    const evaluation = plugin.evaluateStack(ashes);
    assert.equal(evaluation.hidden, true);
    assert.equal(evaluation.tileHighlight, false);
    assert.equal(plugin.shouldDisplayStackInMenu(ashes), false);
    plugin.updateHotkeyState(true, 1000);
    assert.equal(plugin.shouldDisplayStackInMenu(ashes), true);
}

// Legacy ownership filtering remains intact for main/iron-style account modes.
{
    const plugin = new GroundItemsPlugin();
    plugin.setConfig({ ownershipFilterMode: "drops" });
    assert.equal(plugin.shouldDisplayStack(stack({ ownership: 0 })), false);
    assert.equal(plugin.shouldDisplayStack(stack({ ownership: 1 })), true);
    assert.equal(plugin.shouldDisplayStack(stack({ ownership: 2 })), false);
    assert.equal(plugin.shouldDisplayStack(stack({ ownership: 3 })), true);

    plugin.setConfig({ ownershipFilterMode: "takeable" });
    assert.equal(plugin.shouldDisplayStack(stack({ ownership: 2 }), { accountType: 0 }), true);
    assert.equal(plugin.shouldDisplayStack(stack({ ownership: 2 }), { accountType: 1 }), false);
}

// Menu modes, deterministic sorting, beam policy, and list toggles are composable.
{
    const plugin = new GroundItemsPlugin();
    plugin.setConfig({
        highlightedItems: "Abyssal whip",
        hiddenItems: "Ashes, *bones*",
        itemHighlightMode: "menu",
        menuHighlightMode: "both",
        menuSortMode: "value",
        lootBeamEnabled: true,
        lootBeamForHighlightedItems: true,
        lootBeamMinimumTier: "insane",
        highlightTiles: true,
    });
    const whip = stack();
    const ashes = stack({ id: 2, itemId: 592, name: "Ashes", gePrice: 1 });
    const rune = stack({ id: 3, itemId: 2, name: "Rune arrow", gePrice: 500, haPrice: 0 });
    const styled = plugin.getMenuStyle(whip, "Take");
    assert.match(styled.option, /^<col=/);
    assert.match(styled.targetName, /^<col=/);
    assert.equal(
        styled.evaluation.showOverlay,
        true,
        "menu-only mode preserves world labels while disabling their category colour",
    );
    assert.equal(
        plugin.getOverlayColor(styled.evaluation),
        plugin.getConfig().defaultColor,
        "menu-only mode uses the configured default label colour",
    );
    assert.equal(styled.evaluation.tileHighlight, true, "tile highlights remain independent");
    assert.equal(
        plugin.evaluateStack(rune).tileHighlight,
        false,
        "the global tile toggle outlines highlighted drops, not every visible item",
    );
    assert.equal(plugin.shouldCreateLootBeam(styled.evaluation), true);
    assert.deepEqual(
        plugin.sortStacksForMenu([whip, ashes, rune]).map((entry) => entry.name),
        ["Ashes", "Rune arrow", "Abyssal whip"],
        "lowest/hidden is inserted first and explicit highlight last",
    );

    plugin.setConfig({ itemHighlightMode: "none" });
    assert.equal(plugin.getMenuTargetColorized(whip, "Abyssal whip"), "Abyssal whip");
    plugin.toggleItemList("Ashes", "highlight");
    assert.equal(plugin.hasExactItemListEntry("ashes", "highlight"), true);
    assert.equal(plugin.hasExactItemListEntry("Ashes", "hide"), false);
    assert.match(plugin.getConfig().highlightedItems, /Ashes/);
    assert.doesNotMatch(plugin.getConfig().hiddenItems, /Ashes/);
    assert.match(plugin.getConfig().hiddenItems, /\*bones\*/, "unrelated wildcard survives");
    plugin.toggleItemList("Ashes", "highlight");
    assert.equal(plugin.hasExactItemListEntry("Ashes", "highlight"), false);
    assert.doesNotMatch(plugin.getConfig().highlightedItems, /Ashes/);

    plugin.setConfig({ notifyHighlightedDrops: true });
    const highlightedEvaluation = plugin.evaluateStack(whip);
    assert.equal(plugin.shouldNotify(highlightedEvaluation), true);
    plugin.setConfig({ enabled: false });
    assert.equal(
        plugin.shouldNotify(highlightedEvaluation),
        false,
        "the Ground Items master toggle suppresses notifications as well as rendering",
    );
}

// New settings are sanitized while old persisted objects remain loadable.
{
    let saves = 0;
    let saved: GroundItemsPluginConfig | undefined;
    const persistence: GroundItemsPluginPersistence = {
        load: () => ({
            hiddenItems: "Vial",
            tileHighlightFillAlpha: 4,
            menuSortMode: "invalid" as GroundItemsPluginConfig["menuSortMode"],
            doubleTapDelayMs: -1,
            notifyMinimumTier: "invalid" as GroundItemsPluginConfig["notifyMinimumTier"],
        }),
        save: (config) => {
            saves++;
            saved = config;
        },
    };
    const plugin = new GroundItemsPlugin(persistence);
    assert.equal(plugin.getConfig().hiddenItems, "Vial");
    assert.equal(plugin.getConfig().tileHighlightFillAlpha, 1);
    assert.equal(plugin.getConfig().menuSortMode, "off");
    assert.equal(plugin.getConfig().doubleTapDelayMs, 0);
    assert.equal(plugin.getConfig().notifyMinimumTier, "off");

    plugin.setConfig({
        dontHideUntradeables: false,
        hiddenItems: "",
        hideUnderValue: 10,
        lowValuePrice: 0,
        mediumValuePrice: 0,
        highValuePrice: 0,
        insaneValuePrice: 0,
    });
    assert.equal(plugin.getConfig().dontHideUntradeables, false);
    assert.equal(
        plugin.evaluateStack(
            stack({ name: "Quest token", gePrice: 0, haPrice: 0, tradeable: false }),
        ).hidden,
        true,
        "disabling untradeable protection enables value filtering",
    );
    saves = 0;
    saved = undefined;

    const version = plugin.getVersion();
    plugin.updateHotkeyState(true, 1000);
    assert.equal(plugin.isHotkeyRevealActive(), true);
    plugin.updateHotkeyState(false, 1010);
    plugin.updateHotkeyState(true, 1100);
    assert.equal(plugin.isOverlayTemporarilyHidden(), false, "zero disables double-tap toggle");
    assert.ok(plugin.getVersion() > version);
    assert.equal(saves, 0, "transient hotkey state is never persisted");
    assert.equal(saved, undefined);

    plugin.setConfig({ doubleTapDelayMs: 250 });
    plugin.updateHotkeyState(false, 1110);
    plugin.updateHotkeyState(true, 2000);
    plugin.updateHotkeyState(false, 2010);
    plugin.updateHotkeyState(true, 2200);
    assert.equal(plugin.isOverlayTemporarilyHidden(), true);
    assert.equal(saves, 1);
}

console.log("ground-item-rules.test.ts: all assertions passed");
