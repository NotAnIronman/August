import type { ClientGroundItemStack } from "@client/engine/game/data/ground/GroundItemStore";
import type {
    GroundItemMatchedRule,
    GroundItemRuleDiagnostic,
} from "@client/features/plugins/grounditems/types";

export type GroundItemRuleAction = GroundItemMatchedRule["action"];
export type GroundItemRuleOwnership = "none" | "self" | "other" | "group";

type ComparisonOperator = "<" | "<=" | "=" | "!=" | ">=" | ">";

type NumericField = "id" | "qty" | "value" | "ge" | "ha";

type GroundItemRulePredicate =
    | { kind: "name"; regex: RegExp }
    | { kind: "number"; field: NumericField; operator: ComparisonOperator; value: number }
    | { kind: "boolean"; field: "tradeable" | "stackable" | "noted"; value: boolean }
    | { kind: "ownership"; value: GroundItemRuleOwnership }
    | { kind: "area"; x: number; y: number; radius: number; plane?: number };

export interface GroundItemRuleStyles {
    color?: number;
    beam?: boolean;
    tileHighlight?: boolean;
    showOverlay?: boolean;
    menuPriority?: number;
}

export interface CompiledGroundItemRule {
    line: number;
    source: string;
    action: GroundItemRuleAction;
    predicates: readonly GroundItemRulePredicate[];
    styles: Readonly<GroundItemRuleStyles>;
}

export interface CompiledGroundItemRules {
    rules: readonly CompiledGroundItemRule[];
    diagnostics: readonly GroundItemRuleDiagnostic[];
}

export interface GroundItemRuleContext {
    stack: ClientGroundItemStack & { stackable?: boolean; noted?: boolean };
    /** Total value of the full ground stack using the configured value mode. */
    value: number;
    /** Total Grand Exchange value of the full ground stack. */
    geValue: number;
    /** Total high-alchemy value of the full ground stack. */
    haValue: number;
}

export interface GroundItemRuleResult extends GroundItemRuleStyles {
    hidden?: boolean;
    highlighted?: boolean;
    showMenu?: boolean;
    matchedRules: readonly GroundItemMatchedRule[];
    terminalRule?: GroundItemMatchedRule;
}

const ACTIONS = new Set<GroundItemRuleAction>([
    "apply",
    "hide",
    "show",
    "highlight",
    "beam",
]);

const OWNERSHIP_BY_ID: Readonly<Record<number, GroundItemRuleOwnership>> = Object.freeze({
    0: "none",
    1: "self",
    2: "other",
    3: "group",
});

function normalizeName(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function unquote(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}

function escapeRegex(source: string): string {
    return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileNamePattern(source: string): RegExp | undefined {
    const normalized = normalizeName(unquote(source));
    if (normalized.length === 0) return undefined;
    const regexSource = escapeRegex(normalized).replace(/\\\*/g, ".*");
    return new RegExp(`^${regexSource}$`, "i");
}

function parseBoolean(value: string): boolean | undefined {
    const normalized = unquote(value).trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
    return undefined;
}

function parseFriendlyNumber(value: string): number | undefined {
    const normalized = unquote(value).trim().replace(/[,_\s]/g, "").toLowerCase();
    const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+))([kmb])?$/.exec(normalized);
    if (!match) return undefined;
    const base = Number(match[1]);
    if (!Number.isFinite(base)) return undefined;
    const suffix = match[2];
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    const result = base * multiplier;
    return Number.isFinite(result) ? result : undefined;
}

function parseColor(value: string): number | undefined {
    const normalized = unquote(value).trim();
    const match = /^#?([0-9a-f]{6})$/i.exec(normalized);
    return match ? Number.parseInt(match[1], 16) & 0xffffff : undefined;
}

function compareNumber(actual: number, operator: ComparisonOperator, expected: number): boolean {
    if (operator === "<") return actual < expected;
    if (operator === "<=") return actual <= expected;
    if (operator === "!=") return actual !== expected;
    if (operator === ">=") return actual >= expected;
    if (operator === ">") return actual > expected;
    return actual === expected;
}

function parseRuleLine(
    source: string,
    line: number,
): { rule?: CompiledGroundItemRule; diagnostics: GroundItemRuleDiagnostic[] } {
    const diagnostics: GroundItemRuleDiagnostic[] = [];
    const report = (message: string) => diagnostics.push({ line, source, message });
    const predicates: GroundItemRulePredicate[] = [];
    const styles: GroundItemRuleStyles = {};
    let action: GroundItemRuleAction | undefined;

    const tokens = source
        .split("|")
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
    if (tokens.length === 0) {
        return { diagnostics };
    }

    for (const token of tokens) {
        const lowerToken = token.toLowerCase();
        if (ACTIONS.has(lowerToken as GroundItemRuleAction)) {
            if (action !== undefined) {
                report(`Only one action is allowed (already found '${action}').`);
                continue;
            }
            action = lowerToken as GroundItemRuleAction;
            continue;
        }

        const numericMatch = /^(id|qty|value|ge|ha)\s*(<=|>=|!=|=|<|>)\s*(.+)$/i.exec(token);
        if (numericMatch) {
            const field = numericMatch[1].toLowerCase() as NumericField;
            const operator = numericMatch[2] as ComparisonOperator;
            const value = parseFriendlyNumber(numericMatch[3]);
            if (value === undefined || value < 0 || (field === "id" && !Number.isInteger(value))) {
                report(`Invalid ${field} value '${numericMatch[3].trim()}'.`);
            } else {
                predicates.push({ kind: "number", field, operator, value });
            }
            continue;
        }

        const assignment = /^([a-z]+)\s*=\s*(.*)$/i.exec(token);
        if (!assignment) {
            report(`Unknown rule token '${token}'.`);
            continue;
        }
        const key = assignment[1].toLowerCase();
        const value = assignment[2].trim();

        if (key === "name") {
            const regex = compileNamePattern(value);
            if (regex) predicates.push({ kind: "name", regex });
            else report("The name predicate cannot be empty.");
            continue;
        }
        if (key === "tradeable" || key === "stackable" || key === "noted") {
            const parsed = parseBoolean(value);
            if (parsed === undefined) report(`Invalid boolean '${value}' for ${key}.`);
            else predicates.push({ kind: "boolean", field: key, value: parsed });
            continue;
        }
        if (key === "ownership") {
            const parsed = unquote(value).trim().toLowerCase();
            if (parsed === "none" || parsed === "self" || parsed === "other" || parsed === "group") {
                predicates.push({ kind: "ownership", value: parsed });
            } else {
                report("Ownership must be none, self, other, or group.");
            }
            continue;
        }
        if (key === "area") {
            const parts = value.split(",").map((part) => parseFriendlyNumber(part));
            if (
                (parts.length !== 3 && parts.length !== 4) ||
                parts.some((part) => part === undefined || !Number.isInteger(part)) ||
                (parts[2] as number) < 0
            ) {
                report("Area must be x,y,radius or x,y,radius,plane using whole numbers.");
            } else {
                predicates.push({
                    kind: "area",
                    x: parts[0] as number,
                    y: parts[1] as number,
                    radius: parts[2] as number,
                    plane: parts.length === 4 ? (parts[3] as number) : undefined,
                });
            }
            continue;
        }
        if (key === "color") {
            const parsed = parseColor(value);
            if (parsed === undefined) report("Color must be a six-digit RGB hex value, such as #ff9600.");
            else styles.color = parsed;
            continue;
        }
        if (key === "beam" || key === "tile" || key === "overlay") {
            const parsed = parseBoolean(value);
            if (parsed === undefined) {
                report(`Invalid boolean '${value}' for ${key}.`);
            } else if (key === "beam") {
                styles.beam = parsed;
            } else if (key === "tile") {
                styles.tileHighlight = parsed;
            } else {
                styles.showOverlay = parsed;
            }
            continue;
        }
        if (key === "menu") {
            const parsed = parseFriendlyNumber(value);
            if (parsed === undefined || !Number.isInteger(parsed)) {
                report("Menu priority must be a whole number.");
            } else {
                styles.menuPriority = Math.max(-1_000_000, Math.min(1_000_000, parsed));
            }
            continue;
        }
        report(`Unknown rule field '${key}'.`);
    }

    if (action === undefined) report("Rule is missing an action: apply, hide, show, highlight, or beam.");
    if (diagnostics.length > 0 || action === undefined) return { diagnostics };
    return {
        diagnostics,
        rule: {
            line,
            source,
            action,
            predicates,
            styles,
        },
    };
}

/**
 * Compile the local filter DSL. Invalid lines are excluded as a unit so a typo
 * can never produce a broad, partially-matching filter.
 */
export function compileGroundItemRules(source: string): CompiledGroundItemRules {
    const rules: CompiledGroundItemRule[] = [];
    const diagnostics: GroundItemRuleDiagnostic[] = [];
    const lines = (typeof source === "string" ? source : "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const trimmed = rawLine.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
        const parsed = parseRuleLine(trimmed, index + 1);
        diagnostics.push(...parsed.diagnostics);
        if (parsed.rule) rules.push(parsed.rule);
    }
    return { rules, diagnostics };
}

function predicateMatches(predicate: GroundItemRulePredicate, context: GroundItemRuleContext): boolean {
    const stack = context.stack;
    if (predicate.kind === "name") {
        return predicate.regex.test(normalizeName(stack.name));
    }
    if (predicate.kind === "number") {
        const actual =
            predicate.field === "id"
                ? stack.itemId | 0
                : predicate.field === "qty"
                  ? Math.max(1, stack.quantity | 0)
                  : predicate.field === "ge"
                    ? context.geValue
                    : predicate.field === "ha"
                      ? context.haValue
                      : context.value;
        return compareNumber(actual, predicate.operator, predicate.value);
    }
    if (predicate.kind === "boolean") {
        const actual =
            predicate.field === "tradeable"
                ? stack.tradeable === true
                : predicate.field === "stackable"
                  ? stack.stackable === true
                  : stack.noted === true;
        return actual === predicate.value;
    }
    if (predicate.kind === "ownership") {
        const ownership = Number.isFinite(stack.ownership) ? (stack.ownership as number) | 0 : 0;
        return OWNERSHIP_BY_ID[ownership] === predicate.value;
    }
    const tile = stack.tile;
    if (predicate.plane !== undefined && (tile.level | 0) !== predicate.plane) return false;
    return Math.max(Math.abs((tile.x | 0) - predicate.x), Math.abs((tile.y | 0) - predicate.y)) <= predicate.radius;
}

/** Evaluate already-compiled rules in stable top-to-bottom order. */
export function evaluateGroundItemRules(
    compiled: CompiledGroundItemRules | readonly CompiledGroundItemRule[],
    context: GroundItemRuleContext,
): GroundItemRuleResult {
    const rules: readonly CompiledGroundItemRule[] =
        "rules" in compiled ? compiled.rules : compiled;
    const result: GroundItemRuleResult = { matchedRules: [] };
    const matchedRules: GroundItemMatchedRule[] = [];

    for (const rule of rules) {
        if (!rule.predicates.every((predicate) => predicateMatches(predicate, context))) continue;
        const matched: GroundItemMatchedRule = { line: rule.line, action: rule.action };
        matchedRules.push(matched);
        Object.assign(result, rule.styles);

        if (rule.action === "apply") continue;
        if (rule.action === "hide") {
            result.hidden = true;
            result.highlighted = false;
            result.showOverlay = false;
            result.showMenu = false;
        } else if (rule.action === "show") {
            result.hidden = false;
            result.highlighted = false;
            if (result.showOverlay === undefined) result.showOverlay = true;
            result.showMenu = true;
        } else if (rule.action === "highlight") {
            result.hidden = false;
            result.highlighted = true;
            if (result.showOverlay === undefined) result.showOverlay = true;
            result.showMenu = true;
        } else {
            result.hidden = false;
            result.highlighted = false;
            if (result.beam === undefined) result.beam = true;
            if (result.showOverlay === undefined) result.showOverlay = true;
            result.showMenu = true;
        }
        result.terminalRule = matched;
        break;
    }

    result.matchedRules = matchedRules;
    return result;
}
