import fs from "fs";

import { DEV_DIG_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds, type UiTextRow } from "@august/protocol/uikit/contracts";
import { serverCatalogPath } from "@server/paths";
import type { CommandHandler, IScriptRegistry, ItemOnItemEvent, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";
import { registerUiPanelActions } from "@server/content/gamemodes/vanilla/uikit/actions";
import { openUiPanel, sendUiActivateSignal, sendUiControls, sendUiRowActions, sendUiRowClickZones, sendUiSearchLabel, sendUiTextRows } from "@server/content/gamemodes/vanilla/uikit/panelData";

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
type EditorStep = "kind" | "source" | "to" | "animation";
type EditorState = { rowIds: (string | undefined)[]; selectedId?: string; pending?: { step: EditorStep; kind?: "tile" | "area"; draft: Partial<DigRule>; editId?: string } };
const editorStates = new Map<number, EditorState>();

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

function editorState(player: PlayerState): EditorState {
    const state = editorStates.get(player.id) ?? { rowIds: [] };
    editorStates.set(player.id, state);
    return state;
}
function editorPrompt(pending: EditorState["pending"]): string {
    if (!pending) return "Select Add or right-click a rule:";
    if (pending.step === "kind") return "Type tile or area:";
    if (pending.step === "source") return pending.kind === "area" ? "Area minX, minY, maxX, maxY, level:" : "Tile x, y, level:";
    if (pending.step === "to") return "Destination x, y, level:";
    return "Animation ID, or none:";
}
function renderEditor(player: PlayerState, services: ScriptServices): void {
    const state = editorState(player); const catalog = readCatalog();
    const rows: UiTextRow[] = [{ kind: "heading", text: "Rule | Dig location / area | Destination | Animation", style: { color: "ffcf70", bold: true } }];
    state.rowIds = [undefined];
    if (state.pending) { rows.push({ kind: "text", text: `▸ ${editorPrompt(state.pending)}`, style: { color: "9fd3ff", bold: true } }); state.rowIds.push(undefined); }
    for (const rule of catalog.rules) {
        const from = rule.tile ? `${rule.tile.x}, ${rule.tile.y}, ${rule.tile.level}` : rule.area ? `${rule.area.minX}, ${rule.area.minY} → ${rule.area.maxX}, ${rule.area.maxY}, ${rule.area.level}` : "invalid";
        rows.push({ kind: "text", text: `${rule.id === state.selectedId ? "<col=9fd3ff>▸ </col>" : ""}${rule.id} | ${from} | ${rule.to.x}, ${rule.to.y}, ${rule.to.level} | ${rule.animationId ?? "—"}` }); state.rowIds.push(rule.id);
    }
    if (!catalog.rules.length) { rows.push({ kind: "text", text: "No dig rules yet. Click Add to create one." }); state.rowIds.push(undefined); }
    sendUiTextRows(services, player.id, DEV_DIG_PANEL_GROUP_ID, rows);
    sendUiRowClickZones(services, player.id, DEV_DIG_PANEL_GROUP_ID, rows.length);
    sendUiRowActions(services, player.id, DEV_DIG_PANEL_GROUP_ID, state.rowIds.map((id) => id !== undefined));
    for (let index = 0; index < ComponentIds.INLINE_ROW_ACTION_CAPACITY; index++) for (const base of [ComponentIds.ROW_MOVE_UP_BASE, ComponentIds.ROW_MOVE_DOWN_BASE]) services.dialog.queueWidgetEvent(player.id, { action: "set_hidden", uid: ((DEV_DIG_PANEL_GROUP_ID & 0xffff) << 16) | (base + index), hidden: true });
    sendUiSearchLabel(services, player.id, DEV_DIG_PANEL_GROUP_ID, `${editorPrompt(state.pending)}${state.pending?.editId ? " Enter = keep" : ""}`);
    sendUiControls(services, player.id, DEV_DIG_PANEL_GROUP_ID, [{ label: "Add" }, { label: "Close" }], 2);
    sendUiActivateSignal(services, player.id, DEV_DIG_PANEL_GROUP_ID, !!state.pending);
}
function openEditor(player: PlayerState, services: ScriptServices): void { openUiPanel(services, player, DEV_DIG_PANEL_GROUP_ID, "Dig Locations"); renderEditor(player, services); }
function beginEditor(player: PlayerState, services: ScriptServices, editId?: string): void {
    const existing = editId ? readCatalog().rules.find((rule) => rule.id === editId) : undefined;
    editorState(player).pending = { step: existing ? "source" : "kind", kind: existing?.area ? "area" : existing?.tile ? "tile" : undefined, draft: existing ? structuredClone(existing) : {}, editId };
    renderEditor(player, services);
}
function submitEditorInput(player: PlayerState, services: ScriptServices, text: string): string | undefined {
    const state = editorState(player); const pending = state.pending; if (!pending) return "Click Add or right-click a rule first.";
    const keep = !!pending.editId && text.length === 0;
    if (pending.step === "kind") { const kind = text.toLowerCase(); if (kind !== "tile" && kind !== "area") return "Enter either tile or area."; pending.kind = kind; pending.step = "source"; }
    else if (pending.step === "source") {
        const values = text.trim().split(/[\s,]+/).map(Number);
        if (keep) { pending.step = "to"; }
        else if (pending.kind === "tile" && values.length === 3 && values.every(Number.isInteger)) { pending.draft.tile = { x: values[0], y: values[1], level: values[2] }; delete pending.draft.area; pending.step = "to"; }
        else if (pending.kind === "area" && values.length === 5 && values.every(Number.isInteger)) { const [x1, y1, x2, y2, level] = values; pending.draft.area = { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2), level }; delete pending.draft.tile; pending.step = "to"; }
        else return `Invalid ${pending.kind === "area" ? "area" : "tile"} coordinates.`;
    } else if (pending.step === "to") { const to = keep ? pending.draft.to : parseTile(text.trim().split(/[\s,]+/), 0); if (!to) return "Enter destination x, y, level."; pending.draft.to = to; pending.step = "animation"; }
    else { if (!keep) { if (text.toLowerCase() === "none") delete pending.draft.animationId; else { const animationId = integer(text); if (animationId === undefined) return "Enter an animation ID or none."; pending.draft.animationId = animationId; } } const catalog = readCatalog(); const rule = { ...pending.draft, id: pending.editId ?? nextId(catalog.rules) } as DigRule; if (!rule.to || (!rule.tile && !rule.area)) return "The dig rule is incomplete."; if (pending.editId) catalog.rules = catalog.rules.map((entry) => entry.id === pending.editId ? rule : entry); else catalog.rules.push(rule); saveCatalog(catalog); state.selectedId = rule.id; state.pending = undefined; }
    renderEditor(player, services); return undefined;
}

/**
 * Generic dig authoring and execution. It deliberately owns only the spade's
 * Dig option; clue, quest, and easter-egg behavior can be added as named
 * handlers without turning object transports into a catch-all system.
 */
export function registerDigHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    const dig = ({ player, services: svc }: ItemOnItemEvent): void => {
        const tile = { x: player.tileX, y: player.tileY, level: player.level };
        const rule = findRule(readCatalog(), tile);
        if (!rule) {
            svc.messaging.sendGameMessage(player, "Nothing interesting happens.");
            return;
        }
        if (rule.animationId !== undefined) svc.animation.playPlayerSeq(player, rule.animationId);
        svc.movement.teleportPlayer(player, rule.to.x, rule.to.y, rule.to.level);
        if (rule.message) svc.messaging.sendGameMessage(player, rule.message);
    };
    // The live client exposes Dig for a spade even in revisions where the
    // server's item metadata has no inventory-action entry. Register both so
    // the normal labelled action and that metadata-free packet are handled.
    registry.registerItemAction(SPADE_ID, dig, "dig");
    registry.registerItemAction(SPADE_ID, dig);

    const command: CommandHandler = ({ player, args }) => {
        const action = args[0]?.toLowerCase();
        const catalog = readCatalog();
        if (!action || action === "open") { openEditor(player, services); return; }
        if (action === "add") { beginEditor(player, services); return; }
        if (action === "input") return submitEditorInput(player, services, args.slice(1).join(" ").trim());
        if (action === "selectrow" || action === "editrow") { const id = editorState(player).rowIds[Number(args[1])]; if (!id) return; editorState(player).selectedId = id; if (action === "editrow") beginEditor(player, services, id); else renderEditor(player, services); return; }
        if (action === "list") return catalog.rules.length ? catalog.rules.map(label).join("\n") : "No dig rules yet.";
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
    registerUiPanelActions(registry, services, DEV_DIG_PANEL_GROUP_ID, [
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE, actionId: "dig_add", handle: ({ player }) => beginEditor(player, services) },
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 1, actionId: "dig_close", handle: ({ player }) => services.dialog.getInterfaceService()?.closeModal(player) },
    ]);
    for (let row = 0; row < ComponentIds.INLINE_ROW_ACTION_CAPACITY; row++) {
        registry.onButton(DEV_DIG_PANEL_GROUP_ID, ComponentIds.ROW_DELETE_BASE + row, (event) => {
            if (!services.dialog.getInterfaceService()?.isModalOpen(event.player, DEV_DIG_PANEL_GROUP_ID)) return;
            const state = editorState(event.player); const id = state.rowIds[row]; if (!id) return;
            const catalog = readCatalog(); catalog.rules = catalog.rules.filter((rule) => rule.id !== id); saveCatalog(catalog);
            if (state.selectedId === id) state.selectedId = undefined;
            renderEditor(event.player, services);
        });
    }
}
