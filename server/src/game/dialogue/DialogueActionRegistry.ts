import type { PlayerState } from "../player";
import type { ScriptServices } from "../scripts/types";
import type { DialogueActionValue } from "./DialogueTree";

export interface DialogueActionContext {
    player: PlayerState;
    services: ScriptServices;
    npcId: number;
    npcName: string;
    args: Readonly<Record<string, DialogueActionValue>>;
}

/** `stop` is useful for effects which replace dialogue with another modal. */
export type DialogueActionResult = "continue" | "stop" | void;
export type DialogueActionHandler = (context: DialogueActionContext) => DialogueActionResult;

/**
 * Safe bridge between JSON-authored dialogue and trusted server code.
 *
 * The JSON stores a stable action key, never source code. Gamemode modules
 * register the implementation during startup, which makes actions such as
 * assigning Slayer tasks or opening reward interfaces reusable by imported,
 * editor-authored, and hand-authored conversations alike.
 */
export class DialogueActionRegistry {
    private readonly handlers = new Map<string, DialogueActionHandler>();

    register(key: string, handler: DialogueActionHandler): () => void {
        const normalized = normalizeKey(key);
        if (this.handlers.has(normalized)) {
            throw new Error(`Dialogue action '${normalized}' is already registered`);
        }
        this.handlers.set(normalized, handler);
        return () => {
            if (this.handlers.get(normalized) === handler) this.handlers.delete(normalized);
        };
    }

    has(key: string): boolean {
        return this.handlers.has(normalizeKey(key));
    }

    keys(): string[] {
        return [...this.handlers.keys()].sort();
    }

    invoke(key: string, context: DialogueActionContext): DialogueActionResult {
        const normalized = normalizeKey(key);
        const handler = this.handlers.get(normalized);
        if (!handler) {
            throw new Error(`No dialogue action registered for '${normalized}'`);
        }
        return handler(context);
    }
}

function normalizeKey(key: string): string {
    const normalized = key.trim();
    if (!normalized) throw new Error("Dialogue action key cannot be empty");
    return normalized;
}
