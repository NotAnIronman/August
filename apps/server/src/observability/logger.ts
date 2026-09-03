import util from "util";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<Exclude<LogLevel, "silent">, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

function ts(): string {
    return new Date().toISOString();
}

function env(key: string): string {
    return String(process?.env?.[key] ?? "").trim();
}

function envBool(key: string, def = false): boolean {
    const v = env(key).toLowerCase();
    if (v === "" || v == null) return def;
    return v === "1" || v === "true" || v === "yes";
}

function parseLevel(): LogLevel {
    const raw = env("LOG_LEVEL").toLowerCase();
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error" || raw === "silent")
        return raw as LogLevel;
    // default to info
    return "info";
}

const MIN_LEVEL: LogLevel = parseLevel();
const JSON_MODE =
    envBool("LOG_JSON") || env("LOG_FORMAT").toLowerCase() === "json" || envBool("AGENT_LOG");
const MAX_LOG_MESSAGE_LENGTH = 16_384;
const MAX_LOG_ARGUMENTS = 16;
const MAX_LOG_COLLECTION_ENTRIES = 32;
const MAX_LOG_STRING_LENGTH = 4_096;
const MAX_LOG_DEPTH = 4;
const MAX_LOG_NODES = 256;

interface LogNormalizationState {
    readonly seen: WeakSet<object>;
    remainingNodes: number;
}

function truncate(value: string, maximum = MAX_LOG_STRING_LENGTH): string {
    if (value.length <= maximum) return value;
    return `${value.slice(0, maximum)}…[${value.length - maximum} chars omitted]`;
}

/**
 * Converts arbitrary application values into a bounded, getter-safe shape.
 * Logging must never become an unbounded serialization path for packet or
 * content data, nor may a throwing getter/toJSON method crash the server.
 */
function normalizeLogValue(
    value: unknown,
    state: LogNormalizationState,
    depth = 0,
): unknown {
    if (typeof value === "string") return truncate(value);
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "undefined") return "[undefined]";
    if (typeof value === "symbol") return truncate(String(value));
    if (typeof value === "function") return `[Function${value.name ? `: ${value.name}` : ""}]`;
    if (typeof value !== "object") return truncate(String(value));

    if (state.remainingNodes-- <= 0) return "[log value budget exhausted]";
    if (state.seen.has(value)) return "[Circular]";
    if (depth >= MAX_LOG_DEPTH) return "[Object]";
    state.seen.add(value);

    try {
        if (value instanceof Error) {
            return {
                name: truncate(value.name),
                message: truncate(value.message),
                ...(value.stack ? { stack: truncate(value.stack, MAX_LOG_MESSAGE_LENGTH) } : {}),
            };
        }
        if (value instanceof Date) {
            return Number.isFinite(value.getTime()) ? value.toISOString() : "Invalid Date";
        }
        if (Array.isArray(value)) {
            const normalized = value
                .slice(0, MAX_LOG_COLLECTION_ENTRIES)
                .map((entry) => normalizeLogValue(entry, state, depth + 1));
            if (value.length > MAX_LOG_COLLECTION_ENTRIES) {
                normalized.push(`[${value.length - MAX_LOG_COLLECTION_ENTRIES} entries omitted]`);
            }
            return normalized;
        }

        const result: Record<string, unknown> = {};
        let entries: Array<[string, unknown]>;
        try {
            entries = Object.entries(value);
        } catch {
            return "[unreadable object]";
        }
        for (const [key, entry] of entries.slice(0, MAX_LOG_COLLECTION_ENTRIES)) {
            try {
                result[truncate(key, 256)] = normalizeLogValue(entry, state, depth + 1);
            } catch {
                result[truncate(key, 256)] = "[unreadable value]";
            }
        }
        if (entries.length > MAX_LOG_COLLECTION_ENTRIES) {
            result["[omitted]"] = `${entries.length - MAX_LOG_COLLECTION_ENTRIES} entries`;
        }
        return result;
    } finally {
        state.seen.delete(value);
    }
}

function normalizeLogArgs(args: unknown[]): unknown[] {
    const state: LogNormalizationState = {
        seen: new WeakSet<object>(),
        remainingNodes: MAX_LOG_NODES,
    };
    const normalized = args
        .slice(0, MAX_LOG_ARGUMENTS)
        .map((value) => {
            try {
                return normalizeLogValue(value, state);
            } catch {
                return "[unreadable log argument]";
            }
        });
    if (args.length > MAX_LOG_ARGUMENTS) {
        normalized.push(`[${args.length - MAX_LOG_ARGUMENTS} arguments omitted]`);
    }
    return normalized;
}

// Optional category filters: comma‑separated list
function parseList(v: string): string[] {
    return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

const INCLUDE = parseList(env("LOG_INCLUDE").toLowerCase());
const EXCLUDE = parseList(env("LOG_EXCLUDE").toLowerCase());

function levelEnabled(level: Exclude<LogLevel, "silent">): boolean {
    if (MIN_LEVEL === "silent") return false;
    return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL as Exclude<LogLevel, "silent">];
}

function detectCategory(args: unknown[]): string | undefined {
    if (!args.length) return undefined;
    const first = args[0];
    const firstText = typeof first === "string" ? first : "";
    const m = /^\s*\[([^\]]+)\]/.exec(firstText);
    if (m && m[1]) return m[1].toLowerCase();
    return undefined;
}

function categoryAllowed(category: string | undefined): boolean {
    const cat = (category || "").toLowerCase();
    if (INCLUDE.length > 0 && (cat === "" || !INCLUDE.includes(cat))) return false;
    if (EXCLUDE.length > 0 && cat !== "" && EXCLUDE.includes(cat)) return false;
    return true;
}

function emit(level: Exclude<LogLevel, "silent">, args: unknown[]): void {
    if (!levelEnabled(level)) return;
    const category = detectCategory(args);
    if (!categoryAllowed(category)) return;

    const safeArgs = normalizeLogArgs(args);
    let message: string;
    try {
        message = util.formatWithOptions(
            {
                depth: MAX_LOG_DEPTH,
                maxArrayLength: MAX_LOG_COLLECTION_ENTRIES,
                maxStringLength: MAX_LOG_STRING_LENGTH,
                breakLength: Number.POSITIVE_INFINITY,
                compact: true,
            },
            ...safeArgs,
        );
    } catch {
        message = "Log arguments could not be formatted.";
    }
    message = truncate(message, MAX_LOG_MESSAGE_LENGTH);

    if (JSON_MODE) {
        const out: Record<string, unknown> = {
            time: ts(),
            level,
            category,
            message,
            args: safeArgs,
        };

        let line: string;
        try {
            line = JSON.stringify(out);
        } catch {
            line = JSON.stringify({
                time: out.time,
                level,
                category,
                message,
                args: ["[unserializable log arguments]"],
            });
        }
        if (level === "error") console.error(line);
        else if (level === "warn") console.warn(line);
        else console.log(line);
        return;
    }

    const prefix = `[${ts()}] [${level.toUpperCase()}]`;
    if (level === "error") console.error(prefix, message);
    else if (level === "warn") console.warn(prefix, message);
    else console.log(prefix, message);
}

export const logger = {
    info: (...args: unknown[]) => emit("info", args),
    warn: (...args: unknown[]) => emit("warn", args),
    error: (...args: unknown[]) => emit("error", args),
    debug: (...args: unknown[]) => emit("debug", args),
    // Create a tagged logger that injects a [tag] prefix automatically
    withTag(tag: string) {
        const prefix = `[${String(tag)}]`;
        return {
            info: (...args: unknown[]) => emit("info", [prefix, ...args]),
            warn: (...args: unknown[]) => emit("warn", [prefix, ...args]),
            error: (...args: unknown[]) => emit("error", [prefix, ...args]),
            debug: (...args: unknown[]) => emit("debug", [prefix, ...args]),
        } as const;
    },
};
