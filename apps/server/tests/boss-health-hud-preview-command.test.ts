import assert from "node:assert/strict";

import {
    BOSS_HEALTH_HUD_PREVIEW_USAGE,
    buildBossHealthHudPreview,
    registerBossHealthHudPreviewCommand,
} from "@server/content/gamemodes/vanilla/scripts/bossHealthHudPreview";
import type { CommandRegistrationMetadata } from "@server/game/commands/CommandMetadata";
import type {
    CommandHandler,
    IScriptRegistry,
    ScriptServices,
} from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";

assert.deepEqual(buildBossHealthHudPreview(["hide"]), { active: false });
assert.equal(buildBossHealthHudPreview(["-1"]), undefined);
assert.equal(buildBossHealthHudPreview(["50", "0"]), undefined);
assert.equal(buildBossHealthHudPreview(["2147483648"]), undefined);
assert.deepEqual(buildBossHealthHudPreview(["125", "100", "Test", "Boss"]), {
    active: true,
    npcTypeId: 0,
    name: "Test Boss",
    current: 100,
    maximum: 100,
    markers: [
        { percent: 75, label: "Phase transition", style: "phase" },
        { percent: 50, label: "Mechanic gate", style: "mechanic" },
        { percent: 25, label: "Enrage", style: "danger" },
    ],
});

let registeredHandler: CommandHandler | undefined;
let registeredMetadata: CommandRegistrationMetadata | undefined;
const registry = {
    registerCommand: (
        name: string,
        handler: CommandHandler,
        metadata: CommandRegistrationMetadata,
    ) => {
        assert.equal(name, "bosshud");
        registeredHandler = handler;
        registeredMetadata = metadata;
        return { unregister: () => undefined };
    },
} as unknown as IScriptRegistry;

const events: Array<{ playerId: number; event: Record<string, unknown> }> = [];
const services = {
    dialog: {
        queueWidgetEvent: (playerId: number, event: Record<string, unknown>) => {
            events.push({ playerId, event });
        },
    },
} as unknown as ScriptServices;

registerBossHealthHudPreviewCommand(registry, services);
assert.equal(registeredMetadata?.permission, "developer");
assert.equal(registeredMetadata?.hidden, undefined);
assert.ok(registeredMetadata?.summary?.includes("Preview"));
assert.ok(registeredHandler);

const player = { id: 42 } as PlayerState;
const invoke = (args: string[]) =>
    registeredHandler?.({ player, args } as Parameters<CommandHandler>[0]);

assert.equal(invoke([]), BOSS_HEALTH_HUD_PREVIEW_USAGE);
assert.equal(events.length, 0, "help must not alter the active HUD");

assert.equal(invoke(["demo"]), "Boss HUD preview: 725/1000 HP (The Warden).");
assert.deepEqual(events.at(-1), {
    playerId: 42,
    event: {
        action: "set_boss_health_bar",
        active: true,
        npcTypeId: 0,
        name: "The Warden",
        current: 725,
        maximum: 1000,
        markers: [
            { percent: 75, label: "Phase transition", style: "phase" },
            { percent: 50, label: "Mechanic gate", style: "mechanic" },
            { percent: 25, label: "Enrage", style: "danger" },
        ],
    },
});

assert.equal(invoke(["hide"]), "Boss HUD preview hidden.");
assert.deepEqual(events.at(-1), {
    playerId: 42,
    event: { action: "set_boss_health_bar", active: false },
});

console.log("boss health HUD preview command tests passed");
