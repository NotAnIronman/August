import assert from "node:assert/strict";

import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { GameEventBus } from "@server/game/events/GameEventBus";
import { ScriptRegistry } from "@server/game/scripts/ScriptRegistry";
import { ScriptRuntime } from "@server/game/scripts/ScriptRuntime";
import type {
    IScriptRegistry,
    NpcInteractionEvent,
    ScriptServices,
} from "@server/game/scripts/types";
import { ScriptScheduler } from "@server/game/systems/ScriptScheduler";
import { registerLeagueTutorHandlers } from "@server/content/gamemodes/leagues-v/scripts/leagueTutor";
import { registerBobHandlers } from "@server/content/gamemodes/vanilla/scripts/content/bob";
import { registerRomeoHandlers } from "@server/content/gamemodes/vanilla/scripts/content/romeo";
import { registerZaffHandlers } from "@server/content/gamemodes/vanilla/shops/zaff";
import { register as registerPandemoniumHandlers } from "@server/content/gamemodes/vanilla/skills/sailing/pandemonium";

type ConversationRegistrar = (registry: IScriptRegistry, services: ScriptServices) => void;

function assertConversationStateIsLifecycleBound(
    label: string,
    npcTypeId: number,
    registerHandlers: ConversationRegistrar,
): void {
    const eventBus = new GameEventBus();
    const registry = new ScriptRegistry();
    let dialogOpenCount = 0;
    let dialogCloseCount = 0;
    const services = {
        hotReloadEnabled: true,
        system: { eventBus },
        dialog: {
            openDialog: () => {
                dialogOpenCount += 1;
            },
            openDialogOptions: () => {
                dialogOpenCount += 1;
            },
            closeDialog: () => {
                dialogCloseCount += 1;
            },
        },
    } as unknown as ScriptServices;
    const runtime = new ScriptRuntime({
        registry,
        scheduler: new ScriptScheduler(),
        services,
        logger: {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
            debug: () => undefined,
        },
    });
    runtime.registerHandlers(label, (scripts) => registerHandlers(scripts, services));

    const player = {
        id: 73,
        name: "Lifecycle tester",
        varps: {
            getVarbitValue: () => 0,
            getVarpValue: () => 0,
        },
    } as unknown as PlayerState;
    const npc = { id: npcTypeId + 100_000, typeId: npcTypeId } as NpcState;
    const event = { player, npc, tick: 1, services, option: "talk-to" } as NpcInteractionEvent;
    const handler = registry.findNpcInteractionDirect(npcTypeId, "talk-to");
    assert.ok(handler, `${label} must register its talk-to handler`);

    handler(event);
    handler(event);
    assert.equal(dialogOpenCount, 1, `${label} must reject a duplicate active conversation`);

    eventBus.emit("player:logout", { playerId: player.id, username: player.name ?? "" });
    handler(event);
    assert.equal(
        dialogOpenCount,
        2,
        `${label} must release its conversation lock when the player disconnects`,
    );

    runtime.registerHandlers(label, (scripts) => registerHandlers(scripts, services));
    assert.equal(
        dialogCloseCount,
        1,
        `${label} must close its stale dialog callback during hot reload`,
    );
    const replacementHandler = registry.findNpcInteractionDirect(npcTypeId, "talk-to");
    assert.ok(replacementHandler);
    replacementHandler(event);
    replacementHandler(event);
    assert.equal(dialogOpenCount, 3, `${label} replacement must retain duplicate protection`);

    runtime.reset();
    assert.equal(
        dialogCloseCount,
        2,
        `${label} must close active conversation state when its provider resets`,
    );
    assert.equal(eventBus.listenerCount("player:logout"), 0);
}

assertConversationStateIsLifecycleBound("league-tutor", 315, registerLeagueTutorHandlers);
assertConversationStateIsLifecycleBound("bob", 10619, registerBobHandlers);
assertConversationStateIsLifecycleBound("romeo", 5037, registerRomeoHandlers);
assertConversationStateIsLifecycleBound("zaff", 2880, registerZaffHandlers);
assertConversationStateIsLifecycleBound("pandemonium", 14962, registerPandemoniumHandlers);

console.log("conversation session lifecycle regression test passed");
