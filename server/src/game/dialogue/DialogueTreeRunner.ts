import { ScriptDialogKind } from "../scripts/types";
import type {
    ScriptDialogOptionRequest,
    ScriptDialogRequest,
    WidgetDialogHandler,
} from "../actions/handlers/WidgetDialogHandler";
import type { PlayerState } from "../player";
import type { DialogueStep, DialogueTree } from "./DialogueTree";

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
 * Plays a DialogueTree for one player. Each "line" step opens a dialog and
 * waits for Continue before moving to the next step; each "options" step
 * opens the option list and recurses into whichever branch was chosen.
 * Mirrors how a hand-written gamemode dialogue script chains
 * openDialog(...).onContinue -> openDialog(...) calls.
 */
export function runDialogueTree(
    dialog: DialogueRunnerDialog,
    player: PlayerState,
    npc: DialogueRunnerNpcInfo,
    tree: DialogueTree,
    onFinished?: () => void,
): void {
    playSteps(dialog, player, npc, tree.steps, 0, onFinished);
}

function playSteps(
    dialog: DialogueRunnerDialog,
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
    const next = () => playSteps(dialog, player, npc, steps, index + 1, onFinished);

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

    // options step
    const request: ScriptDialogOptionRequest = {
        title: step.title,
        options: step.options.map((o) => o.label),
        onSelect: (choice: number) => {
            const picked = step.options[choice];
            if (!picked) {
                next();
                return;
            }
            playSteps(dialog, player, npc, picked.steps, 0, onFinished);
        },
    };
    dialog.openDialogOptions(player, request);
}
