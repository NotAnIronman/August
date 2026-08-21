/**
 * DialogueTree — editable data model for NPC/player dialogue.
 *
 * Kept deliberately simple (a flat sequence of steps, each either a line or a
 * branch point) so it maps directly onto a line-by-line editor UI: each row is
 * either "NPC/Player says: ..." or "Options: [...]" with each option nesting
 * its own sub-sequence of steps. This is the format persisted to the
 * dialogue_overrides table and edited live via ::editdialogue.
 */

export type DialogueSpeaker = "npc" | "player";

export interface DialogueLineStep {
    kind: "line";
    speaker: DialogueSpeaker;
    /** One or more lines shown as a single dialogue box (matches ScriptDialogRequest.lines). */
    text: string[];
}

export interface DialogueOption {
    label: string;
    steps: DialogueStep[];
}

export interface DialogueOptionsStep {
    kind: "options";
    title?: string;
    options: DialogueOption[];
}

export type DialogueStep = DialogueLineStep | DialogueOptionsStep;

export interface DialogueTree {
    npcId: number;
    steps: DialogueStep[];
    updatedBy: string;
    updatedAt: string;
}

/** Loosely-typed JSON shape as it round-trips through SQLite/network. */
export type DialogueTreeJson = Omit<DialogueTree, "npcId" | "updatedBy" | "updatedAt">;

export interface DialogueTreeValidationError {
    path: string;
    message: string;
}

/**
 * Validate an untrusted (client-submitted) tree shape before it's persisted.
 * Kept intentionally strict — this is the only gate between a developer's
 * text-form input and the runtime dialogue player, so malformed data should
 * be rejected here rather than surfacing as a confusing runtime failure.
 */
export function validateDialogueTreeJson(value: unknown): DialogueTreeValidationError[] {
    const errors: DialogueTreeValidationError[] = [];
    if (!value || typeof value !== "object") {
        return [{ path: "$", message: "Tree must be an object" }];
    }
    const steps = (value as any).steps;
    if (!Array.isArray(steps)) {
        return [{ path: "$.steps", message: "steps must be an array" }];
    }
    validateSteps(steps, "$.steps", errors, 0);
    return errors;
}

const MAX_NESTING_DEPTH = 6;

function validateSteps(
    steps: unknown[],
    path: string,
    errors: DialogueTreeValidationError[],
    depth: number,
): void {
    if (depth > MAX_NESTING_DEPTH) {
        errors.push({ path, message: `Nesting too deep (max ${MAX_NESTING_DEPTH} levels)` });
        return;
    }
    if (steps.length === 0) {
        errors.push({ path, message: "steps cannot be empty" });
        return;
    }
    steps.forEach((step, i) => {
        const stepPath = `${path}[${i}]`;
        if (!step || typeof step !== "object") {
            errors.push({ path: stepPath, message: "step must be an object" });
            return;
        }
        const kind = (step as any).kind;
        if (kind === "line") {
            const speaker = (step as any).speaker;
            const text = (step as any).text;
            if (speaker !== "npc" && speaker !== "player") {
                errors.push({ path: `${stepPath}.speaker`, message: "must be 'npc' or 'player'" });
            }
            if (
                !Array.isArray(text) ||
                text.length === 0 ||
                !text.every((t) => typeof t === "string" && t.trim().length > 0)
            ) {
                errors.push({
                    path: `${stepPath}.text`,
                    message: "must be a non-empty array of non-empty strings",
                });
            } else if (text.length > 4) {
                errors.push({ path: `${stepPath}.text`, message: "max 4 lines per dialogue box" });
            }
        } else if (kind === "options") {
            const options = (step as any).options;
            if (!Array.isArray(options) || options.length < 2 || options.length > 5) {
                errors.push({
                    path: `${stepPath}.options`,
                    message: "must have between 2 and 5 options",
                });
                return;
            }
            options.forEach((opt: any, j: number) => {
                const optPath = `${stepPath}.options[${j}]`;
                if (typeof opt?.label !== "string" || opt.label.trim().length === 0) {
                    errors.push({ path: `${optPath}.label`, message: "must be a non-empty string" });
                }
                if (!Array.isArray(opt?.steps)) {
                    errors.push({ path: `${optPath}.steps`, message: "must be an array" });
                } else {
                    validateSteps(opt.steps, `${optPath}.steps`, errors, depth + 1);
                }
            });
        } else {
            errors.push({ path: `${stepPath}.kind`, message: "must be 'line' or 'options'" });
        }
    });
}
