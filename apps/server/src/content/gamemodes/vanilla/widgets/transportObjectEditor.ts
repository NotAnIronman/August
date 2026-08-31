import fs from "fs";

import { DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds, type UiTextRow } from "@august/protocol/uikit/contracts";
import type { CommandHandler, IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";
import { serverCatalogPath } from "@server/paths";
import { reloadDevObjectTransitions } from "@server/content/gamemodes/vanilla/scripts/content/devObjectTransitions";
import { registerUiPanelActions } from "@server/content/gamemodes/vanilla/uikit/actions";
import { openUiPanel, sendUiActivateSignal, sendUiControls, sendUiRowClickZones, sendUiTextRows } from "@server/content/gamemodes/vanilla/uikit/panelData";

type Tile = { x: number; y: number; level: number };
type Transition = { id: string; locId: number; option: number; action: string; from: Tile; to: Tile; animationId?: number; message?: string };
type Catalog = { version: 1; transitions: Transition[] };
type Step = "locId" | "option" | "from" | "to" | "animation";
type State = { selectedId?: string; pending?: { step: Step; draft: Partial<Transition>; editId?: string }; rowIds: (string | undefined)[] };

const CATALOG_PATH = serverCatalogPath("dev-object-transitions.json");
const states = new Map<number, State>();

function catalog(): Catalog {
    try {
        const value = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as Partial<Catalog>;
        return { version: 1, transitions: Array.isArray(value.transitions) ? value.transitions as Transition[] : [] };
    } catch { return { version: 1, transitions: [] }; }
}
function save(value: Catalog): void {
    fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    reloadDevObjectTransitions();
}
function state(player: PlayerState): State { const current = states.get(player.id) ?? { rowIds: [] }; states.set(player.id, current); return current; }
function tile(value: string): Tile | undefined {
    const parts = value.trim().split(/[\s,]+/).map(Number);
    return parts.length === 3 && parts.every(Number.isInteger) && parts.every((part) => part >= 0)
        ? { x: parts[0], y: parts[1], level: parts[2] } : undefined;
}
function stepPrompt(step: Step): string {
    return ({ locId: "Enter Object ID", option: "Enter selection option (1-5)", from: "Enter start coordinates: x, y, level", to: "Enter end coordinates: x, y, level", animation: "Enter animation ID, or 'none'" })[step];
}
function nextId(entries: readonly Transition[]): string {
    return `rule-${entries.reduce((high, entry) => Math.max(high, Number(/^rule-(\d+)$/i.exec(entry.id)?.[1] ?? 0)), 0) + 1}`;
}
function actionFor(services: ScriptServices, locId: number, option: number): string | undefined {
    return services.data.getLocDefinition(locId)?.actions?.[option - 1]?.trim();
}
function render(player: PlayerState, services: ScriptServices): void {
    const current = state(player); const value = catalog();
    const rows: UiTextRow[] = [{ kind: "heading", text: "Rule | Object | Option | Start location → End location | Animation", style: { color: "ffcf70", bold: true } }];
    current.rowIds = [undefined];
    if (current.pending) {
        rows.push({ kind: "text", text: `▸ ${stepPrompt(current.pending.step)}`, style: { color: "9fd3ff", bold: true } });
        current.rowIds.push(undefined);
    }
    for (const entry of value.transitions) {
        const selected = entry.id === current.selectedId ? "<col=9fd3ff>▸ </col>" : "";
        rows.push({ kind: "text", text: `${selected}${entry.id.replace("rule-", "Rule ")} | ${entry.locId} | ${entry.option} (${entry.action}) | ${entry.from.x}, ${entry.from.y}, ${entry.from.level} → ${entry.to.x}, ${entry.to.y}, ${entry.to.level} | ${entry.animationId ?? "—"}` });
        current.rowIds.push(entry.id);
    }
    if (value.transitions.length === 0) { rows.push({ kind: "text", text: "No transport rules yet. Click Add to create one." }); current.rowIds.push(undefined); }
    sendUiTextRows(services, player.id, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, rows);
    sendUiRowClickZones(services, player.id, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, rows.length);
    sendUiControls(services, player.id, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, [
        { label: "Add" }, current.selectedId ? { label: "Edit" } : undefined, current.selectedId ? { label: "Delete" } : undefined, { label: "Close" },
    ], 4);
    sendUiActivateSignal(services, player.id, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, !!current.pending);
}
function open(player: PlayerState, services: ScriptServices): void { openUiPanel(services, player, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, "Transport Object"); render(player, services); }
function begin(player: PlayerState, services: ScriptServices, editId?: string): void {
    const current = state(player); const existing = editId ? catalog().transitions.find((entry) => entry.id === editId) : undefined;
    current.pending = { step: "locId", draft: existing ? structuredClone(existing) : {}, editId };
    render(player, services);
}
function acceptInput(player: PlayerState, services: ScriptServices, text: string): string | undefined {
    const current = state(player); const pending = current.pending;
    if (!pending) return "Click Add or Edit first.";
    const invalid = () => `Invalid value. ${stepPrompt(pending.step)}.`;
    if (pending.step === "locId") { const locId = Number(text); if (!Number.isInteger(locId) || locId <= 0) return invalid(); pending.draft.locId = locId; pending.step = "option"; }
    else if (pending.step === "option") { const option = Number(text); if (!Number.isInteger(option) || option < 1 || option > 5 || !pending.draft.locId) return invalid(); const action = actionFor(services, pending.draft.locId, option); if (!action) return `Object ${pending.draft.locId} does not have option ${option}.`; pending.draft.option = option; pending.draft.action = action.toLowerCase(); pending.step = "from"; }
    else if (pending.step === "from") { const value = tile(text); if (!value) return invalid(); pending.draft.from = value; pending.step = "to"; }
    else if (pending.step === "to") { const value = tile(text); if (!value) return invalid(); pending.draft.to = value; pending.step = "animation"; }
    else { if (text.toLowerCase() !== "none") { const animationId = Number(text); if (!Number.isInteger(animationId) || animationId < 0) return invalid(); pending.draft.animationId = animationId; } else delete pending.draft.animationId; const complete = pending.draft as Transition; const value = catalog(); if (pending.editId) value.transitions = value.transitions.map((entry) => entry.id === pending.editId ? { ...complete, id: pending.editId } : entry); else value.transitions.push({ ...complete, id: nextId(value.transitions) }); save(value); current.selectedId = pending.editId ?? nextId(value.transitions.slice(0, -1)); current.pending = undefined; }
    render(player, services); return undefined;
}

export function registerTransportObjectEditor(registry: IScriptRegistry, services: ScriptServices): void {
    const command: CommandHandler = ({ player, args }) => {
        const action = args[0]?.toLowerCase();
        if (!action || action === "open" || action === "list") { open(player, services); return; }
        if (action === "add") { begin(player, services); return; }
        if (action === "input") return acceptInput(player, services, args.slice(1).join(" ").trim());
        if (action === "selectrow" || action === "editrow") { const id = state(player).rowIds[Number(args[1])]; if (!id) return; state(player).selectedId = id; if (action === "editrow") begin(player, services, id); else render(player, services); return; }
        return "Usage: ::to — opens the Transport Object editor.";
    };
    registry.registerCommand("to", command, { permission: "developer", owner: "developer:transport-object-editor", summary: "Open the Transport Object editor." });
    registerUiPanelActions(registry, services, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, [
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE, actionId: "transport_add", handle: ({ player }) => begin(player, services) },
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 1, actionId: "transport_edit", handle: ({ player }) => { const id = state(player).selectedId; if (id) begin(player, services, id); } },
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 2, actionId: "transport_delete", handle: ({ player }) => { const current = state(player); if (!current.selectedId) return; const value = catalog(); value.transitions = value.transitions.filter((entry) => entry.id !== current.selectedId); save(value); current.selectedId = undefined; render(player, services); } },
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 3, actionId: "transport_close", handle: ({ player }) => services.dialog.getInterfaceService()?.closeModal(player) },
    ]);
}
