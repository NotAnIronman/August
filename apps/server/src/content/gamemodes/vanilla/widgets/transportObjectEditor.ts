import fs from "fs";

import { DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds, type UiTextRow } from "@august/protocol/uikit/contracts";
import type { CommandHandler, IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";
import { writeJsonFileAtomicallySync } from "@server/io/AtomicFile";
import { serverCatalogPath } from "@server/paths";
import { registerPlayerScopedCollections } from "@server/game/scripts/ScriptLifecycle";
import { reloadDevObjectTransitions } from "@server/content/gamemodes/vanilla/scripts/content/devObjectTransitions";
import { registerUiPanelActions } from "@server/content/gamemodes/vanilla/uikit/actions";
import { openUiPanel, sendUiActivateSignal, sendUiControls, sendUiRowActions, sendUiRowClickZones, sendUiSearchLabel, sendUiTextRows } from "@server/content/gamemodes/vanilla/uikit/panelData";

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
    writeJsonFileAtomicallySync(CATALOG_PATH, value);
    reloadDevObjectTransitions();
}
function state(player: PlayerState): State { const current = states.get(player.id) ?? { rowIds: [] }; states.set(player.id, current); return current; }
function tile(value: string, player?: PlayerState): Tile | undefined {
    if (player && value.trim().toLowerCase() === "here") {
        return { x: player.tileX, y: player.tileY, level: player.level };
    }
    const parts = value.trim().split(/[\s,]+/).map(Number);
    return parts.length === 3 && parts.every(Number.isInteger) && parts.every((part) => part >= 0)
        ? { x: parts[0], y: parts[1], level: parts[2] } : undefined;
}
function stepPrompt(step: Step): string {
    return ({ locId: "Enter Object ID", option: "Enter selection option (1-5)", from: "Enter start coordinates: x, y, level (or 'here')", to: "Enter end coordinates: x, y, level (or 'here')", animation: "Enter animation ID, or 'none'" })[step];
}
function inputLabel(step: Step): string {
    return ({ locId: "Object ID:", option: "Option:", from: "Start x, y, z (or here):", to: "End x, y, z (or here):", animation: "Animation:" })[step];
}
function nextId(entries: readonly Transition[]): string {
    return `rule-${entries.reduce((high, entry) => Math.max(high, Number(/^rule-(\d+)$/i.exec(entry.id)?.[1] ?? 0)), 0) + 1}`;
}
function actionFor(services: ScriptServices, locId: number, option: number): string {
    // Some locs are present in the live map cache before their definition is
    // available to the server loader. The transport system only needs the
    // option number; this label is informative and the action-agnostic
    // registration handles the authoritative interaction packet.
    return services.data.getLocDefinition(locId)?.actions?.[option - 1]?.trim() ?? `option ${option}`;
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
    // Match the dialogue editor: right-click edits the row, while the
    // per-row X deletes it. Header/prompt rows intentionally get neither.
    sendUiRowActions(services, player.id, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, current.rowIds.map((id) => id !== undefined));
    for (let index = 0; index < ComponentIds.INLINE_ROW_ACTION_CAPACITY; index++) {
        for (const base of [ComponentIds.ROW_MOVE_UP_BASE, ComponentIds.ROW_MOVE_DOWN_BASE]) {
            services.dialog.queueWidgetEvent(player.id, { action: "set_hidden", uid: ((DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID & 0xffff) << 16) | (base + index), hidden: true });
        }
    }
    sendUiSearchLabel(
        services,
        player.id,
        DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID,
        current.pending
            ? `${inputLabel(current.pending.step)}${current.pending.editId ? " Enter = keep" : ""}`
            : "Select Add or right-click a rule:",
    );
    sendUiControls(services, player.id, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, [
        { label: "Add" }, { label: "Close" },
    ], 2);
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
    const keep = pending.editId !== undefined && text.length === 0;
    if (pending.step === "locId") { const locId = keep ? pending.draft.locId : Number(text); if (typeof locId !== "number" || !Number.isInteger(locId) || locId <= 0) return invalid(); pending.draft.locId = locId; pending.step = "option"; }
    else if (pending.step === "option") { const option = keep ? pending.draft.option : Number(text); const locId = pending.draft.locId; if (typeof option !== "number" || !Number.isInteger(option) || option < 1 || option > 5 || typeof locId !== "number") return invalid(); pending.draft.option = option; pending.draft.action = actionFor(services, locId, option).toLowerCase(); pending.step = "from"; }
    else if (pending.step === "from") { const value = keep ? pending.draft.from : tile(text, player); if (!value) return invalid(); pending.draft.from = value; pending.step = "to"; }
    else if (pending.step === "to") { const value = keep ? pending.draft.to : tile(text, player); if (!value) return invalid(); pending.draft.to = value; pending.step = "animation"; }
    else { if (!keep) { if (text.toLowerCase() !== "none") { const animationId = Number(text); if (!Number.isInteger(animationId) || animationId < 0) return invalid(); pending.draft.animationId = animationId; } else delete pending.draft.animationId; } const complete = pending.draft as Transition; const value = catalog(); if (pending.editId) value.transitions = value.transitions.map((entry) => entry.id === pending.editId ? { ...complete, id: pending.editId } : entry); else value.transitions.push({ ...complete, id: nextId(value.transitions) }); save(value); current.selectedId = pending.editId ?? nextId(value.transitions.slice(0, -1)); current.pending = undefined; }
    render(player, services); return undefined;
}

export function registerTransportObjectEditor(registry: IScriptRegistry, services: ScriptServices): void {
    registerPlayerScopedCollections(registry, services, states);

    const command: CommandHandler = ({ player, args }) => {
        const action = args[0]?.toLowerCase();
        if (!action || action === "open" || action === "list") { open(player, services); return; }
        if (action === "add") { begin(player, services); return; }
        if (action === "here") return acceptInput(player, services, "here");
        if (action === "input") return acceptInput(player, services, args.slice(1).join(" ").trim());
        if (action === "selectrow" || action === "editrow") { const id = state(player).rowIds[Number(args[1])]; if (!id) return; state(player).selectedId = id; if (action === "editrow") begin(player, services, id); else render(player, services); return; }
        return "Usage: ::to — opens the Transport Object editor. ::to here fills the current step with your position.";
    };
    registry.registerCommand("to", command, { permission: "developer", owner: "developer:transport-object-editor", summary: "Open the Transport Object editor." });
    registerUiPanelActions(registry, services, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, [
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE, actionId: "transport_add", handle: ({ player }) => begin(player, services) },
        { componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 1, actionId: "transport_close", handle: ({ player }) => services.dialog.getInterfaceService()?.closeModal(player) },
    ]);
    for (let row = 0; row < ComponentIds.INLINE_ROW_ACTION_CAPACITY; row++) {
        registry.onButton(DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID, ComponentIds.ROW_DELETE_BASE + row, (event) => {
            if (!services.dialog.getInterfaceService()?.isModalOpen(event.player, DEV_TRANSPORT_OBJECT_PANEL_GROUP_ID)) return;
            const current = state(event.player); const id = current.rowIds[row]; if (!id) return;
            const value = catalog(); value.transitions = value.transitions.filter((entry) => entry.id !== id); save(value);
            if (current.selectedId === id) current.selectedId = undefined;
            render(event.player, services);
        });
    }
}
