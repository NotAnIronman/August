import fs from "fs";

import { serverCatalogPath } from "@server/paths";
import type {
    CommandHandler,
    IScriptRegistry,
    LocInteractionEvent,
    ScriptRegistrationResult,
    ScriptServices,
} from "@server/game/scripts/types";

type Tile = { x: number; y: number; level: number };
type ItemRequirement = { itemId: number; quantity: number };

type ObjectTransition = {
    id: string;
    locId: number;
    /** One-based object menu option, matching the cache action list. */
    option: number;
    action: string;
    from: Tile;
    to: Tile;
    animationId?: number;
    message?: string;
    inventory?: ItemRequirement[];
    equipped?: ItemRequirement[];
};

type ObjectTransitionFile = { version: 1; transitions: ObjectTransition[] };

const CATALOG_PATH = serverCatalogPath("dev-object-transitions.json");
const DEFAULT_FILE: ObjectTransitionFile = { version: 1, transitions: [] };

function parseInteger(value: string | undefined, minimum = 0): number | undefined {
    if (!value || !/^-?\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : undefined;
}

function parseTile(args: readonly string[], offset: number): Tile | undefined {
    const x = parseInteger(args[offset]);
    const y = parseInteger(args[offset + 1]);
    const level = parseInteger(args[offset + 2]);
    return x === undefined || y === undefined || level === undefined ? undefined : { x, y, level };
}

function sameTile(left: Tile, right: Tile): boolean {
    return left.x === right.x && left.y === right.y && left.level === right.level;
}

function readCatalog(): ObjectTransitionFile {
    try {
        const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as Partial<ObjectTransitionFile>;
        if (!Array.isArray(parsed.transitions)) return { ...DEFAULT_FILE };
        const transitions = parsed.transitions.filter((transition): transition is ObjectTransition => {
            if (!transition || typeof transition !== "object") return false;
            const entry = transition as ObjectTransition;
            return typeof entry.id === "string" && Number.isInteger(entry.locId) &&
                Number.isInteger(entry.option) && typeof entry.action === "string" &&
                !!entry.from && !!entry.to &&
                [entry.from.x, entry.from.y, entry.from.level, entry.to.x, entry.to.y, entry.to.level]
                    .every(Number.isInteger);
        });
        return { version: 1, transitions };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_FILE };
        throw error;
    }
}

function saveCatalog(catalog: ObjectTransitionFile): void {
    fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

/** Convert the first development build's verbose IDs into short stable IDs. */
function normalizeRuleIds(catalog: ObjectTransitionFile): boolean {
    let changed = false;
    let next = 1;
    const used = new Set<string>();
    for (const transition of catalog.transitions) {
        if (/^rule-\d+$/i.test(transition.id) && !used.has(transition.id.toLowerCase())) {
            used.add(transition.id.toLowerCase());
            continue;
        }
        while (used.has(`rule-${next}`)) next += 1;
        transition.id = `rule-${next}`;
        used.add(transition.id);
        next += 1;
        changed = true;
    }
    return changed;
}

function tileLabel(tile: Tile): string {
    return `${tile.x}, ${tile.y}, ${tile.level}`;
}

function itemLabel(itemId: number, services: ScriptServices): string {
    return services.data.getItemDefinition(itemId)?.name ?? `item ${itemId}`;
}

function resolveAction(locId: number, option: number, services: ScriptServices): string | undefined {
    const action = services.data.getLocDefinition(locId)?.actions?.[option - 1]?.trim();
    return action || undefined;
}

function hasRequirements(event: LocInteractionEvent, transition: ObjectTransition): string | undefined {
    for (const requirement of transition.inventory ?? []) {
        if (!event.player.items.hasItem(requirement.itemId, requirement.quantity)) {
            return `You need ${requirement.quantity > 1 ? `${requirement.quantity} x ` : ""}${itemLabel(requirement.itemId, event.services)} in your inventory.`;
        }
    }
    for (const requirement of transition.equipped ?? []) {
        const equipped = event.player.appearance.equip.filter((itemId) => itemId === requirement.itemId).length;
        if (equipped < requirement.quantity) {
            return `You need to wear ${requirement.quantity > 1 ? `${requirement.quantity} x ` : ""}${itemLabel(requirement.itemId, event.services)}.`;
        }
    }
    return undefined;
}

function executeTransition(event: LocInteractionEvent, transition: ObjectTransition): void {
    const failure = hasRequirements(event, transition);
    if (failure) {
        event.services.messaging.sendGameMessage(event.player, failure);
        return;
    }
    event.services.movement.teleportPlayer(event.player, transition.to.x, transition.to.y, transition.to.level);
    if (transition.animationId !== undefined) {
        // Teleport queues the stop sequence. Clear it first so this animation is visible.
        event.player.clearPendingSeqs();
        event.services.animation.playPlayerSeq(event.player, transition.animationId);
    }
    if (transition.message) event.services.messaging.sendGameMessage(event.player, transition.message);
}

/**
 * Live, source-controlled editor for simple doorway, ladder, and traversal
 * transitions. Rules are keyed by the player's source tile, not the target
 * object's world tile, which keeps shared loc ids safe everywhere else.
 */
export function registerDevObjectTransitions(registry: IScriptRegistry, services: ScriptServices): void {
    let catalog = readCatalog();
    if (normalizeRuleIds(catalog)) saveCatalog(catalog);
    const registrations = new Map<string, ScriptRegistrationResult>();

    const refresh = (): void => {
        for (const registration of registrations.values()) registration.unregister();
        registrations.clear();
        for (const transition of catalog.transitions) {
            registrations.set(transition.id, registry.registerLocTileInteraction(
                transition.locId,
                transition.from,
                (event) => executeTransition(event, transition),
                transition.action,
            ));
        }
    };

    const persist = (): void => {
        saveCatalog(catalog);
        refresh();
    };

    const nextRuleId = (): string => {
        const highest = catalog.transitions.reduce((highestId, rule) => {
            const match = /^rule-(\d+)$/i.exec(rule.id);
            return match ? Math.max(highestId, Number(match[1])) : highestId;
        }, 0);
        return `rule-${highest + 1}`;
    };

    const addRule = (
        locId: number,
        option: number,
        from: Tile,
        to: Tile,
        animationId?: number,
    ): string => {
        const locAction = resolveAction(locId, option, services);
        if (!locAction) return `Object ${locId} does not have option ${option} in this cache.`;
        if (catalog.transitions.some((rule) => rule.locId === locId && rule.option === option && sameTile(rule.from, from))) {
            return "A movement rule already exists for that object option and source tile.";
        }
        const id = nextRuleId();
        catalog.transitions.push({ id, locId, option, action: locAction.toLowerCase(), from, to, animationId });
        persist();
        return `Saved ${id}: ${tileLabel(from)} -> ${tileLabel(to)} using ${locAction}.`;
    };

    const help = (): string => [
        "::objmove add <locId> <option> <fromX> <fromY> <fromLevel> <toX> <toY> <toLevel> [animationId]",
        "::objmove addhere <locId> <option> <toX> <toY> <toLevel> [animationId] — uses your current tile",
        "::objmove setfrom|setto <ruleId> <x> <y> <level>",
        "::objmove preview <animationId> — play an animation before assigning it",
        "::objmove animation <ruleId> <animationId|none>; ::objmove message <ruleId> <text>",
        "::objmove require <ruleId> <inventory|equipped> <itemId> [quantity]",
        "::objmove unrequire <ruleId> <inventory|equipped> <itemId>; ::objmove list; ::objmove remove <ruleId>",
    ].join("\n");

    const command: CommandHandler = ({ player, args }) => {
        const action = args[0]?.toLowerCase();
        if (!action || action === "help") return help();
        if (action === "list") {
            return catalog.transitions.length === 0
                ? "There are no developer object-movement rules."
                : catalog.transitions.map((rule) =>
                    `${rule.id}: loc ${rule.locId} option ${rule.option} (${rule.action}) ${tileLabel(rule.from)} -> ${tileLabel(rule.to)}`,
                ).join("\n");
        }
        if (action === "preview") {
            const animationId = parseInteger(args[1]);
            if (animationId === undefined) return "Usage: ::objmove preview <animationId>";
            services.animation.playPlayerSeq(player, animationId);
            return `Playing animation ${animationId}.`;
        }
        if (action === "add") {
            const locId = parseInteger(args[1], 1);
            const option = parseInteger(args[2], 1);
            const from = parseTile(args, 3);
            const to = parseTile(args, 6);
            const animationId = args[9] === undefined ? undefined : parseInteger(args[9]);
            if (!locId || !option || !from || !to || (args[9] !== undefined && animationId === undefined)) return help();
            return addRule(locId, option, from, to, animationId);
        }
        if (action === "addhere") {
            const locId = parseInteger(args[1], 1);
            const option = parseInteger(args[2], 1);
            const to = parseTile(args, 3);
            const animationId = args[6] === undefined ? undefined : parseInteger(args[6]);
            if (!locId || !option || !to || (args[6] !== undefined && animationId === undefined)) return help();
            return addRule(
                locId,
                option,
                { x: player.tileX, y: player.tileY, level: player.level },
                to,
                animationId,
            );
        }
        const id = args[1];
        const transition = catalog.transitions.find((rule) => rule.id === id);
        if (!transition) return `Unknown movement rule '${id}'. Use ::objmove list.`;
        if (action === "setfrom" || action === "setto") {
            const tile = parseTile(args, 2);
            if (!tile) return `Usage: ::objmove ${action} <ruleId> <x> <y> <level>`;
            transition[action === "setfrom" ? "from" : "to"] = tile;
            persist();
            return `Saved ${action === "setfrom" ? "source" : "destination"} ${tileLabel(tile)} for ${id}.`;
        }
        if (action === "message") {
            const message = args.slice(2).join(" ").trim();
            if (!message) return "Usage: ::objmove message <ruleId> <text>";
            transition.message = message;
            persist();
            return `Saved message for ${id}.`;
        }
        if (action === "animation") {
            const value = args[2]?.toLowerCase();
            const animationId = value === "none" ? undefined : parseInteger(args[2]);
            if (!value || (value !== "none" && animationId === undefined)) {
                return "Usage: ::objmove animation <ruleId> <animationId|none>";
            }
            transition.animationId = animationId;
            persist();
            return animationId === undefined
                ? `Removed the animation from ${id}.`
                : `Saved animation ${animationId} for ${id}.`;
        }
        if (action === "require" || action === "unrequire") {
            const location = args[2]?.toLowerCase();
            const itemId = parseInteger(args[3], 1);
            const quantity = args[4] === undefined ? 1 : parseInteger(args[4], 1);
            if ((location !== "inventory" && location !== "equipped") || !itemId || !quantity) return "Usage: ::objmove require <ruleId> <inventory|equipped> <itemId> [quantity]";
            const key = location === "inventory" ? "inventory" : "equipped";
            const requirements = transition[key] ?? [];
            if (action === "require") {
                const existing = requirements.find((requirement) => requirement.itemId === itemId);
                if (existing) existing.quantity = quantity;
                else requirements.push({ itemId, quantity });
                transition[key] = requirements;
                persist();
                return `Required ${quantity > 1 ? `${quantity} x ` : ""}${itemLabel(itemId, services)} ${location} for ${id}.`;
            }
            transition[key] = requirements.filter((requirement) => requirement.itemId !== itemId);
            persist();
            return `Removed the ${itemLabel(itemId, services)} ${location} requirement from ${id}.`;
        }
        if (action === "remove") {
            catalog.transitions = catalog.transitions.filter((rule) => rule.id !== id);
            persist();
            return `Removed ${id}.`;
        }
        return help();
    };

    registry.registerCommand("objmove", command, {
        permission: "developer",
        owner: "developer:object-transitions",
        summary: "Create and edit live object movement rules.",
    });
    refresh();
}
