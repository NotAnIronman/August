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
 * One independently playable conversation in a random pool. `weight` is
 * relative (1 by default), so entries can be made rarer without duplicating
 * them. A condition can make seasonal/quest/item-specific conversations
 * eligible without moving selection logic into an NPC script.
 */
export interface DialoguePoolEntry {
    id?: string;
    steps: DialogueStep[];
    weight?: number;
    condition?: DialogueCondition;
}

/**
 * Selects one eligible conversation when reached. This is intentionally a
 * real dialogue node rather than `Math.random()` hidden in a Talk-to handler:
 * imported Wiki transcripts, the editor, tests, and hand-authored content all
 * describe the same behaviour in the same format.
 */
export interface DialoguePoolStep {
    kind: "pool";
    entries: DialoguePoolEntry[];
}

/** Selects from entries which have already been filtered for eligibility. */
export function selectWeightedDialoguePoolEntry(
    entries: readonly DialoguePoolEntry[],
    random: () => number = Math.random,
): DialoguePoolEntry | undefined {
    const totalWeight = entries.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
    if (entries.length === 0 || totalWeight <= 0) return undefined;
    let cursor = Math.min(Math.max(random(), 0), 0.9999999999999999) * totalWeight;
    for (const entry of entries) {
        cursor -= entry.weight ?? 1;
        if (cursor < 0) return entry;
    }
    return entries[entries.length - 1];
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
    | { type: "giveItem"; itemId: number; quantity: number }
    /**
     * Calls a server-registered action. Stored dialogue only contains the
     * stable key and JSON data; executable code remains in trusted gamemode
     * modules (for example `slayer.assignTask` or `shop.openForNpc`).
     */
    | { type: "invoke"; key: string; args?: Record<string, DialogueActionValue> };

export type DialogueActionValue =
    | string
    | number
    | boolean
    | null
    | DialogueActionValue[]
    | { [key: string]: DialogueActionValue };

export interface DialogueActionStep {
    kind: "action";
    action: DialogueAction;
}

export type DialogueStep = DialogueLineStep | DialogueOptionsStep | DialoguePoolStep | DialogueActionStep;

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
        } else if (kind === "pool") {
            const entries = (step as any).entries;
            if (!Array.isArray(entries) || entries.length < 2 || entries.length > 100) {
                errors.push({
                    path: `${stepPath}.entries`,
                    message: "must have between 2 and 100 pooled conversations",
                });
                return;
            }
            entries.forEach((entry: any, j: number) => {
                const entryPath = `${stepPath}.entries[${j}]`;
                if (!entry || typeof entry !== "object") {
                    errors.push({ path: entryPath, message: "pool entry must be an object" });
                    return;
                }
                if (entry.id !== undefined && (typeof entry.id !== "string" || entry.id.trim().length === 0)) {
                    errors.push({ path: `${entryPath}.id`, message: "must be a non-empty string if given" });
                }
                if (entry.weight !== undefined &&
                    (typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight <= 0)) {
                    errors.push({ path: `${entryPath}.weight`, message: "must be a positive finite number if given" });
                }
                if (!Array.isArray(entry.steps)) {
                    errors.push({ path: `${entryPath}.steps`, message: "must be an array" });
                } else {
                    validateSteps(entry.steps, `${entryPath}.steps`, errors, depth + 1, false);
                }
                if (entry.condition !== undefined) {
                    validateCondition(entry.condition, `${entryPath}.condition`, errors);
                }
            });
        } else if (kind === "action") {
            validateAction((step as any).action, `${stepPath}.action`, errors);
        } else {
            errors.push({ path: `${stepPath}.kind`, message: "must be 'line', 'options', 'pool', or 'action'" });
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
    } else if (type === "invoke") {
        if (typeof (value as any).key !== "string" || (value as any).key.trim().length === 0) {
            errors.push({ path: `${path}.key`, message: "must be a non-empty registered action key" });
        }
        const args = (value as any).args;
        if (args !== undefined && (!args || typeof args !== "object" || Array.isArray(args))) {
            errors.push({ path: `${path}.args`, message: "must be a JSON object if given" });
        } else if (args !== undefined && !isDialogueActionValue(args)) {
            errors.push({ path: `${path}.args`, message: "must contain only JSON-safe values" });
        }
    } else {
        errors.push({ path: `${path}.type`, message: "must be 'setQuestStage', 'giveItem', or 'invoke'" });
    }
}

function isDialogueActionValue(value: unknown, depth = 0): value is DialogueActionValue {
    if (depth > 10) return false;
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every((entry) => isDialogueActionValue(entry, depth + 1));
    if (!value || typeof value !== "object") return false;
    return Object.values(value as Record<string, unknown>).every((entry) =>
        isDialogueActionValue(entry, depth + 1),
    );
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
