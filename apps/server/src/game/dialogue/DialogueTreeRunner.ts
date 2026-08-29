import { ScriptDialogKind } from "@server/game/scripts/types";
import type {
    ScriptDialogOptionRequest,
    ScriptDialogRequest,
    WidgetDialogHandler,
} from "@server/game/actions/handlers/WidgetDialogHandler";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";
import {
    compareDialogueValues,
    selectWeightedDialoguePoolEntry,
    type DialogueCondition,
    type DialogueOption,
    type DialoguePoolEntry,
    type DialogueStep,
    type DialogueTree,
} from "@server/game/dialogue/DialogueTree";

export interface DialogueRunnerNpcInfo {
    npcId: number;
    npcName: string;
}

/**
 * Minimal surface this runner needs from WidgetDialogHandler. Kept as a Pick<>
 * (rather than the full DialogFacade from serviceInterfaces.ts, which uses a
 * separate, stricter ScriptDialogRequest type requiring an `id`) so callers can
 * pass the concrete WidgetDialogHandler instance directly.
 */
export type DialogueRunnerDialog = Pick<WidgetDialogHandler, "openDialog" | "openDialogOptions">;

/**
 * Evaluates a DialogueOption's optional gate. Missing facades (e.g. a
 * gamemode that never contributed `services.quests`) fail closed — an
 * ungated-looking option should never silently vanish just because a
 * dependency wasn't wired up, so unresolvable conditions are treated as met
 * rather than hidden. Authoring-time validation (the editor's ::dcond
 * command) is where a bad quest key/item id should actually get caught.
 */
export function evaluateDialogueCondition(
    services: ScriptServices,
    player: PlayerState,
    condition: DialogueCondition,
): boolean {
    switch (condition.type) {
        case "questStage": {
            const stage = services.quests?.getStage(player, condition.questKey);
            if (stage === undefined) return true;
            return compareDialogueValues(condition.comparator, stage, condition.value);
        }
        case "hasItem": {
            const needed = condition.quantity ?? 1;
            let total = 0;
            for (const entry of services.inventory.getInventoryItems(player)) {
                if (entry.itemId === condition.itemId) total += entry.quantity;
            }
            return total >= needed;
        }
        case "equippedItem": {
            const equipped = services.equipment.getEquippedItem(player, condition.slot);
            if (condition.itemId !== undefined) return equipped === condition.itemId;
            return equipped > 0;
        }
        case "skillLevel": {
            const level = services.skills.getSkill(player, condition.skillId).baseLevel;
            return compareDialogueValues(condition.comparator, level, condition.level);
        }
    }
}

function visibleOptions(
    services: ScriptServices,
    player: PlayerState,
    options: readonly DialogueOption[],
): DialogueOption[] {
    return options.filter(
        (opt) => !opt.condition || evaluateDialogueCondition(services, player, opt.condition),
    );
}

export function selectDialoguePoolEntry(
    services: ScriptServices,
    player: PlayerState,
    entries: readonly DialoguePoolEntry[],
    random: () => number = Math.random,
): DialoguePoolEntry | undefined {
    const eligible = entries.filter(
        (entry) => !entry.condition || evaluateDialogueCondition(services, player, entry.condition),
    );
    return selectWeightedDialoguePoolEntry(eligible, random);
}

/**
 * Plays a DialogueTree for one player. Each "line" step opens a dialog and
 * waits for Continue before moving to the next step; each "options" step
 * opens the option list (after filtering out options whose condition isn't
 * met) and recurses into whichever branch was chosen; each "action" step
 * applies its world-state change immediately and synchronously, then
 * continues without waiting for player input (see DialogueActionStep for
 * why — softlock safety on disconnect). Mirrors how a hand-written gamemode
 * dialogue script chains openDialog(...).onContinue -> openDialog(...) calls.
 */
export function runDialogueTree(
    dialog: DialogueRunnerDialog,
    services: ScriptServices,
    player: PlayerState,
    npc: DialogueRunnerNpcInfo,
    tree: DialogueTree,
    onFinished?: () => void,
): void {
    playSteps(dialog, services, player, npc, tree.steps, 0, onFinished);
}

function playSteps(
    dialog: DialogueRunnerDialog,
    services: ScriptServices,
    player: PlayerState,
    npc: DialogueRunnerNpcInfo,
    steps: DialogueStep[],
    index: number,
    onFinished?: () => void,
): void {
    if (index >= steps.length) {
        onFinished?.();
        return;
    }
    const step = steps[index];
    const next = () => playSteps(dialog, services, player, npc, steps, index + 1, onFinished);

    if (step.kind === "line") {
        const request: ScriptDialogRequest = {
            kind: step.speaker === "npc" ? ScriptDialogKind.Npc : ScriptDialogKind.Player,
            npcId: step.speaker === "npc" ? npc.npcId : undefined,
            npcName: step.speaker === "npc" ? npc.npcName : undefined,
            lines: step.text,
            onContinue: next,
        };
        dialog.openDialog(player, request);
        return;
    }

    if (step.kind === "action") {
        // Commit synchronously and keep walking — no Continue click gates a
        // state change, so a mid-conversation disconnect right after this
        // point can never leave the player stuck between two states.
        if (step.action.type === "setQuestStage") {
            services.quests?.setStage(player, step.action.questKey, step.action.value);
        } else if (step.action.type === "giveItem") {
            services.inventory.addItemToInventory(player, step.action.itemId, step.action.quantity);
        } else if (step.action.type === "invoke") {
            try {
                const result = services.dialogueActions?.invoke(step.action.key, {
                    player,
                    services,
                    npcId: npc.npcId,
                    npcName: npc.npcName,
                    args: step.action.args ?? {},
                });
                if (!services.dialogueActions) {
                    throw new Error("dialogue action registry is not available");
                }
                if (result === "stop") {
                    onFinished?.();
                    return;
                }
            } catch (error) {
                services.system.logger.warn?.(
                    `[dialogue] action '${step.action.key}' failed for npc=${npc.npcId}`,
                    error,
                );
                onFinished?.();
                return;
            }
        }
        next();
        return;
    }

    if (step.kind === "pool") {
        const picked = selectDialoguePoolEntry(services, player, step.entries);
        if (!picked) {
            next();
            return;
        }
        playSteps(dialog, services, player, npc, picked.steps, 0, next);
        return;
    }

    // options step
    const options = visibleOptions(services, player, step.options);
    if (options.length === 0) {
        // Every option was gated out for this player — nothing to show,
        // just continue past the branch point rather than opening an empty menu.
        next();
        return;
    }
    const request: ScriptDialogOptionRequest = {
        title: step.title,
        options: options.map((o) => o.label),
        onSelect: (choice: number) => {
            const picked = options[choice];
            if (!picked) {
                next();
                return;
            }
            playSteps(dialog, services, player, npc, picked.steps, 0, next);
        },
    };
    dialog.openDialogOptions(player, request);
}
