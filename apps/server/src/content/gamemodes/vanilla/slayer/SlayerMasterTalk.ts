import type { IScriptRegistry, NpcInteractionEvent, ScriptServices } from "@server/game/scripts/types";
import {
    type DialogueContext,
    type DialogueStep,
    choose,
    option,
    run,
    sayNpc,
    sayPlayer,
} from "@server/content/gamemodes/vanilla/npcs/dialogue";
import {
    registerNpcOptions,
    registerTalkTo,
    requestTradeOpen,
    startNpcConversation,
} from "@server/content/gamemodes/vanilla/npcs/npcInteractions";
import { SLAYER_MASTERS } from "@server/content/gamemodes/vanilla/slayer/SlayerMasterDefinitions";
import { getSlayerCategory } from "@server/content/gamemodes/vanilla/slayer/SlayerMonsterCategories";
import { openSlayerRewardsPanel } from "@server/content/gamemodes/vanilla/slayer/SlayerRewardsPanel";
import { assignTask, cancelTask, describeTask } from "@server/content/gamemodes/vanilla/slayer/SlayerService";
import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";
import { getSlayerPoints } from "@server/content/gamemodes/vanilla/slayer/SlayerVarbitSync";

/** Runs assignTask and reports the outcome as a game message (dynamic text, so a chat line rather than a static dialogue box — same convention as the "gameMessage" quest dialogue helper). */
function reportAssignment(ctx: DialogueContext, masterId: string): void {
    const { player, services } = ctx;
    const existing = slayerTaskTracker.getTask(player.id);
    if (existing) {
        services.messaging.sendGameMessage(player, `You're already hunting ${describeTask(existing)}.`);
        return;
    }

    const result = assignTask(player, masterId, services);
    if (result.kind === "assigned") {
        const category = getSlayerCategory(result.task.categoryKey);
        services.messaging.sendGameMessage(
            player,
            `Your new task is to kill ${result.task.assignedAmount} ${category?.displayName ?? result.task.categoryKey}.`,
        );
    } else if (result.kind === "already-has-task") {
        services.messaging.sendGameMessage(player, `You're already hunting ${result.description}.`);
    } else if (result.kind === "level-too-low") {
        services.messaging.sendGameMessage(
            player,
            `You need a combat level of ${result.requiredCombatLevel} before this master will assign you tasks.`,
        );
    } else {
        services.messaging.sendGameMessage(player, "You don't qualify for any of this master's tasks yet.");
    }
}

function reportCurrentTask(ctx: DialogueContext): void {
    const task = slayerTaskTracker.getTask(ctx.player.id);
    if (!task) {
        ctx.services.messaging.sendGameMessage(ctx.player, "You don't have an active Slayer task.");
        return;
    }
    ctx.services.messaging.sendGameMessage(ctx.player, `Your task: kill ${describeTask(task)}.`);
}

function reportPoints(ctx: DialogueContext): void {
    const points = getSlayerPoints(ctx.player);
    ctx.services.messaging.sendGameMessage(ctx.player, `You have ${points} Slayer reward points.`);
}

function reassignTask(ctx: DialogueContext, masterId: string): void {
    cancelTask(ctx.player);
    ctx.services.messaging.sendGameMessage(ctx.player, "Very well, let's find you something else.");
    reportAssignment(ctx, masterId);
}

function openRewardShop(ctx: DialogueContext): void {
    openSlayerRewardsPanel(ctx.player, ctx.services);
}

function buildMasterMenuSteps(masterId: string): DialogueStep[] {
    const master = SLAYER_MASTERS.find((candidate) => candidate.id === masterId);
    const name = master?.displayName ?? "Slayer master";
    return [
        sayNpc([`I am ${name}, a Slayer master.`, "I can assign you monsters to hunt for Slayer experience and points."]),
        choose(
            [
                option("I'm looking for a Slayer assignment.", [run((ctx) => reportAssignment(ctx, masterId))]),
                option("What's my current task?", [run((ctx) => reportCurrentTask(ctx))]),
                option("How many Slayer points do I have?", [run((ctx) => reportPoints(ctx))]),
                option("This task doesn't suit me — give me a new one.", [
                    run((ctx) => reassignTask(ctx, masterId)),
                ]),
                option("I'd like to see the reward shop.", [run((ctx) => openRewardShop(ctx))]),
                option("Never mind.", [sayPlayer("Never mind.")]),
            ],
            name,
        ),
    ];
}

export function registerSlayerMasterTalk(registry: IScriptRegistry, _services: ScriptServices): void {
    for (const master of SLAYER_MASTERS) {
        const npcIds = [...master.npcIds];
        if (npcIds.length === 0) continue;

        registerTalkTo(registry, npcIds, (event: NpcInteractionEvent) => {
            startNpcConversation(event, buildMasterMenuSteps(master.id));
        });

        registerNpcOptions(registry, npcIds, ["assignment"], (event: NpcInteractionEvent) => {
            startNpcConversation(event, [run((ctx) => reportAssignment(ctx, master.id))]);
        });

        registerNpcOptions(registry, npcIds, ["rewards"], (event: NpcInteractionEvent) => {
            openSlayerRewardsPanel(event.player, event.services);
        });

        // Best-effort: only opens a real trade screen once this master's npcId
        // is associated with a ShopDefinition (see shops/definitions.ts —
        // "slayer_equipment_shop" currently ships with an empty npcIds list).
        registerNpcOptions(registry, npcIds, ["trade", "trade-with"], (event: NpcInteractionEvent) => {
            const typeId = event.npc?.typeId;
            if (typeId == null) return;
            requestTradeOpen(event.player, event.services, typeId, event.tick);
        });
    }
}
