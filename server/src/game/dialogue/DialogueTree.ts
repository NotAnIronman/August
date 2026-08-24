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

/**
 * Declarative gates an option can carry — deliberately NOT arbitrary code, so
 * every condition stays visualizable in the editor and safely re-evaluable at
 * runtime. Extend this union (and DialogueConditionEvaluator) when a new
 * check is needed; keep hand-written procedural logic in gamemode scripts
 * for anything more exotic than these four.
 */
export type DialogueComparator = "gte" | "lte" | "eq" | "lt" | "gt";

export type DialogueCondition =
    | { type: "questStage"; questKey: string; comparator: DialogueComparator; value: number }
    | { type: "hasItem"; itemId: number; quantity?: number }
    | { type: "equippedItem"; slot: number; itemId?: number }
    | { type: "skillLevel"; skillId: number; comparator: DialogueComparator; level: number };

const DIALOGUE_COMPARATORS: readonly DialogueComparator[] = ["gte", "lte", "eq", "lt", "gt"];

export interface DialogueOption {
    label: string;
    steps: DialogueStep[];
    /**
     * Optional display/selection gate. Runtime play filters out options
     * whose condition evaluates false; the editor still shows them
     * (annotated) so hidden branches remain visible and editable.
     */
    condition?: DialogueCondition;
}

export interface DialogueOptionsStep {
    kind: "options";
    title?: string;
    options: DialogueOption[];
}

/**
 * A world-state change (currently just quest-stage advancement) applied the
 * instant the tree walk reaches this step — mirrors the existing hand-written
 * `exec` convention in gamemode scripts (see restlessGhost/dialogue.ts):
 * commit synchronously, don't wait on further Continue clicks, so a
 * disconnect right after this step still leaves the player's progress
 * consistent rather than soft-locked. Author trees so a stage advance sits
 * as early as possible after the decision that earns it, not buried behind
 * several more lines the player might never see.
 */
export type DialogueAction =
    | { type: "setQuestStage"; questKey: string; value: number }
    | { type: "giveItem"; itemId: number; quantity: number };

export interface DialogueActionStep {
    kind: "action";
    action: DialogueAction;
}

export type DialogueStep = DialogueLineStep | DialogueOptionsStep | DialogueActionStep;

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
    validateSteps(steps, "$.steps", errors, 0, false);
    return errors;
}

const MAX_NESTING_DEPTH = 6;

function validateSteps(
    steps: unknown[],
    path: string,
    errors: DialogueTreeValidationError[],
    depth: number,
    /** An option's own steps may legitimately be empty - "Nevermind" ending
     *  the conversation right there is a real, common shape, not a mistake
     *  (DialogueTreeRunner already handles running off the end of a steps
     *  array by just finishing). The root tree may not: an empty root
     *  means talking to the NPC would do literally nothing. */
    allowEmpty: boolean,
): void {
    if (depth > MAX_NESTING_DEPTH) {
        errors.push({ path, message: `Nesting too deep (max ${MAX_NESTING_DEPTH} levels)` });
        return;
    }
    if (steps.length === 0) {
        if (allowEmpty) return;
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
                    validateSteps(opt.steps, `${optPath}.steps`, errors, depth + 1, true);
                }
                if (opt?.condition !== undefined) {
                    validateCondition(opt.condition, `${optPath}.condition`, errors);
                }
            });
        } else if (kind === "action") {
            validateAction((step as any).action, `${stepPath}.action`, errors);
        } else {
            errors.push({ path: `${stepPath}.kind`, message: "must be 'line', 'options', or 'action'" });
        }
    });
}

function validateCondition(
    value: unknown,
    path: string,
    errors: DialogueTreeValidationError[],
): void {
    if (!value || typeof value !== "object") {
        errors.push({ path, message: "condition must be an object" });
        return;
    }
    const type = (value as any).type;
    if (type === "questStage") {
        if (typeof (value as any).questKey !== "string" || (value as any).questKey.trim().length === 0) {
            errors.push({ path: `${path}.questKey`, message: "must be a non-empty string" });
        }
        validateComparator((value as any).comparator, `${path}.comparator`, errors);
        if (!Number.isInteger((value as any).value)) {
            errors.push({ path: `${path}.value`, message: "must be an integer" });
        }
    } else if (type === "hasItem") {
        if (!Number.isInteger((value as any).itemId) || (value as any).itemId < 0) {
            errors.push({ path: `${path}.itemId`, message: "must be a non-negative integer" });
        }
        const qty = (value as any).quantity;
        if (qty !== undefined && (!Number.isInteger(qty) || qty < 1)) {
            errors.push({ path: `${path}.quantity`, message: "must be a positive integer if given" });
        }
    } else if (type === "equippedItem") {
        if (!Number.isInteger((value as any).slot) || (value as any).slot < 0) {
            errors.push({ path: `${path}.slot`, message: "must be a non-negative integer" });
        }
        const itemId = (value as any).itemId;
        if (itemId !== undefined && (!Number.isInteger(itemId) || itemId < 0)) {
            errors.push({ path: `${path}.itemId`, message: "must be a non-negative integer if given" });
        }
    } else if (type === "skillLevel") {
        if (!Number.isInteger((value as any).skillId) || (value as any).skillId < 0) {
            errors.push({ path: `${path}.skillId`, message: "must be a non-negative integer" });
        }
        validateComparator((value as any).comparator, `${path}.comparator`, errors);
        if (!Number.isInteger((value as any).level) || (value as any).level < 1) {
            errors.push({ path: `${path}.level`, message: "must be a positive integer" });
        }
    } else {
        errors.push({ path: `${path}.type`, message: "must be 'questStage', 'hasItem', 'equippedItem', or 'skillLevel'" });
    }
}

function validateComparator(
    value: unknown,
    path: string,
    errors: DialogueTreeValidationError[],
): void {
    if (typeof value !== "string" || !DIALOGUE_COMPARATORS.includes(value as DialogueComparator)) {
        errors.push({ path, message: `must be one of ${DIALOGUE_COMPARATORS.join(", ")}` });
    }
}

function validateAction(
    value: unknown,
    path: string,
    errors: DialogueTreeValidationError[],
): void {
    if (!value || typeof value !== "object") {
        errors.push({ path, message: "action must be an object" });
        return;
    }
    const type = (value as any).type;
    if (type === "setQuestStage") {
        if (typeof (value as any).questKey !== "string" || (value as any).questKey.trim().length === 0) {
            errors.push({ path: `${path}.questKey`, message: "must be a non-empty string" });
        }
        if (!Number.isInteger((value as any).value) || (value as any).value < 0) {
            errors.push({ path: `${path}.value`, message: "must be a non-negative integer" });
        }
    } else if (type === "giveItem") {
        if (!Number.isInteger((value as any).itemId) || (value as any).itemId < 0) {
            errors.push({ path: `${path}.itemId`, message: "must be a non-negative integer" });
        }
        if (!Number.isInteger((value as any).quantity) || (value as any).quantity < 1) {
            errors.push({ path: `${path}.quantity`, message: "must be a positive integer" });
        }
    } else {
        errors.push({ path: `${path}.type`, message: "must be 'setQuestStage' or 'giveItem'" });
    }
}

/** Evaluates a comparator against (actual, expected). */
export function compareDialogueValues(comparator: DialogueComparator, actual: number, expected: number): boolean {
    switch (comparator) {
        case "gte": return actual >= expected;
        case "lte": return actual <= expected;
        case "eq": return actual === expected;
        case "lt": return actual < expected;
        case "gt": return actual > expected;
    }
}
