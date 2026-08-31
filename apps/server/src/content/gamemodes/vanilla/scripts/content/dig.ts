import fs from "fs";

import { serverCatalogPath } from "@server/paths";
import type { CommandHandler, IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

const SPADE_ID = 952;
const CATALOG_PATH = serverCatalogPath("dev-dig-transitions.json");

type Tile = { x: number; y: number; level: number };
type DigRule = {
    id: string;
    /** A single tile takes precedence over an overlapping area. */
    tile?: Tile;
    /** Inclusive rectangular area, useful for mounds and clue locations. */
    area?: { minX: number; minY: number; maxX: number; maxY: number; level: number };
    to: Tile;
    animationId?: number;
    message?: string;
    priority?: number;
    /** Reserved extension point for clues, quests, loot, traps, and eggs. */
    behavior?: string;
};
type DigCatalog = { version: 1; rules: DigRule[] };

function readCatalog(): DigCatalog {
    try {
        const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as Partial<DigCatalog>;
        return { version: 1, rules: Array.isArray(parsed.rules) ? parsed.rules as DigRule[] : [] };
    } catch { return { version: 1, rules: [] }; }
}
function saveCatalog(catalog: DigCatalog): void {
    fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}
function integer(value: string | undefined, minimum = 0): number | undefined {
    if (!value || !/^-?\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : undefined;
}
function parseTile(args: readonly string[], offset: number): Tile | undefined {
    const x = integer(args[offset]); const y = integer(args[offset + 1]); const level = integer(args[offset + 2]);
    return x === undefined || y === undefined || level === undefined ? undefined : { x, y, level };
}
function matches(rule: DigRule, tile: Tile): boolean {
    if (rule.tile) return rule.tile.x === tile.x && rule.tile.y === tile.y && rule.tile.level === tile.level;
    const area = rule.area;
    return !!area && area.level === tile.level && tile.x >= area.minX && tile.x <= area.maxX && tile.y >= area.minY && tile.y <= area.maxY;
}
function findRule(catalog: DigCatalog, tile: Tile): DigRule | undefined {
    return catalog.rules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => matches(rule, tile))
        .sort((left, right) =>
            (right.rule.priority ?? 0) - (left.rule.priority ?? 0) ||
            Number(!!right.rule.tile) - Number(!!left.rule.tile) || left.index - right.index,
        )[0]?.rule;
}
function nextId(rules: readonly DigRule[]): string {
    return `dig-${rules.reduce((highest, rule) => Math.max(highest, Number(/^dig-(\d+)$/i.exec(rule.id)?.[1] ?? 0)), 0) + 1}`;
}
function label(rule: DigRule): string {
    const from = rule.tile
        ? `${rule.tile.x}, ${rule.tile.y}, ${rule.tile.level}`
        : rule.area ? `${rule.area.minX}, ${rule.area.minY} to ${rule.area.maxX}, ${rule.area.maxY}, ${rule.area.level}` : "invalid";
    return `${rule.id}: ${from} -> ${rule.to.x}, ${rule.to.y}, ${rule.to.level}${rule.animationId !== undefined ? ` (anim ${rule.animationId})` : ""}`;
}

/**
 * Generic dig authoring and execution. It deliberately owns only the spade's
 * Dig option; clue, quest, and easter-egg behavior can be added as named
 * handlers without turning object transports into a catch-all system.
 */
export function registerDigHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    registry.registerItemAction(SPADE_ID, ({ player, services: svc }) => {
        const tile = { x: player.tileX, y: player.tileY, level: player.level };
        const rule = findRule(readCatalog(), tile);
        if (!rule) {
            svc.messaging.sendGameMessage(player, "Nothing interesting happens.");
            return;
        }
        if (rule.animationId !== undefined) svc.animation.playPlayerSeq(player, rule.animationId);
        svc.movement.teleportPlayer(player, rule.to.x, rule.to.y, rule.to.level);
        if (rule.message) svc.messaging.sendGameMessage(player, rule.message);
    }, "dig");

    const command: CommandHandler = ({ player, args }) => {
        const action = args[0]?.toLowerCase();
        const catalog = readCatalog();
        if (!action || action === "list") return catalog.rules.length ? catalog.rules.map(label).join("\n") : "No dig rules yet.";
        if (action === "addhere") {
            const to = parseTile(args, 1); const animationId = args[4] === undefined ? undefined : integer(args[4]);
            if (!to || (args[4] !== undefined && animationId === undefined)) return "Usage: ::dig addhere <toX> <toY> <level> [animationId]";
            catalog.rules.push({ id: nextId(catalog.rules), tile: { x: player.tileX, y: player.tileY, level: player.level }, to, animationId }); saveCatalog(catalog);
            return `Saved ${label(catalog.rules[catalog.rules.length - 1])}.`;
        }
        if (action === "addtile") {
            const from = parseTile(args, 1); const to = parseTile(args, 4); const animationId = args[7] === undefined ? undefined : integer(args[7]);
            if (!from || !to || (args[7] !== undefined && animationId === undefined)) return "Usage: ::dig addtile <x> <y> <level> <toX> <toY> <toLevel> [animationId]";
            const rule: DigRule = { id: nextId(catalog.rules), tile: from, to, animationId }; catalog.rules.push(rule); saveCatalog(catalog); return `Saved ${label(rule)}.`;
        }
        if (action === "addarea") {
            const minX = integer(args[1]); const minY = integer(args[2]); const maxX = integer(args[3]); const maxY = integer(args[4]); const level = integer(args[5]); const to = parseTile(args, 6); const animationId = args[9] === undefined ? undefined : integer(args[9]);
            if ([minX, minY, maxX, maxY, level].some((value) => value === undefined) || !to || (args[9] !== undefined && animationId === undefined)) return "Usage: ::dig addarea <minX> <minY> <maxX> <maxY> <level> <toX> <toY> <toLevel> [animationId]";
            const rule: DigRule = { id: nextId(catalog.rules), area: { minX: Math.min(minX!, maxX!), minY: Math.min(minY!, maxY!), maxX: Math.max(minX!, maxX!), maxY: Math.max(minY!, maxY!), level: level! }, to, animationId }; catalog.rules.push(rule); saveCatalog(catalog); return `Saved ${label(rule)}.`;
        }
        const id = args[1]; const rule = catalog.rules.find((entry) => entry.id === id);
        if (!rule) return `Unknown dig rule '${id}'. Use ::dig list.`;
        if (action === "message") { const message = args.slice(2).join(" ").trim(); if (!message) return "Usage: ::dig message <ruleId> <text>"; rule.message = message; saveCatalog(catalog); return `Saved message for ${id}.`; }
        if (action === "remove") { catalog.rules = catalog.rules.filter((entry) => entry.id !== id); saveCatalog(catalog); return `Removed ${id}.`; }
        return "Usage: ::dig list | addhere | addtile | addarea | message | remove";
    };
    registry.registerCommand("dig", command, { permission: "developer", owner: "developer:dig", summary: "Create and inspect spade dig rules." });
}
