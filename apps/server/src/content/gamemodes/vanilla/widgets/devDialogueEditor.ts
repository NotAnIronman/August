import { EquipmentSlot } from "@august/osrs-engine/config/player/Equipment";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds, type UiTextRow } from "@august/protocol/uikit/contracts";
import type {
    DialogueAction,
    DialogueCondition,
    DialogueComparator,
    DialogueOption,
    DialogueOptionsStep,
    DialogueStep,
    DialogueTreeJson,
} from "@server/game/dialogue/DialogueTree";
import type { PlayerState } from "@server/game/player";
import type {
    CommandEvent,
    CommandHandler,
    IScriptRegistry,
    ScriptServices,
} from "@server/game/scripts/types";
import { registerPlayerScopedCollections } from "@server/game/scripts/ScriptLifecycle";
import { registerUiPanelActions, type UiPanelAction } from "@server/content/gamemodes/vanilla/uikit/actions";
import {
    openUiPanel, sendUiActivateSignal, sendUiControls, sendUiRowActions, sendUiRowClickZones, sendUiTextRows,
} from "@server/content/gamemodes/vanilla/uikit/panelData";

/**
 * ::dev "Dialogue Editor" tab — a live outline view of a DialogueTree
 * override (see apps/server/src/game/dialogue/DialogueTree.ts), numbered the same
 * way the design mockup for this feature was drawn: "1." NPC lines, "1A."/
 * "1B." player response options nested under the line that prompted them,
 * "1A1." continuing inside a chosen branch, and so on.
 *
 * Structural editing is click-driven: left-click a row to select it,
 * right-click a row to edit its text/label, and an icon toolbar (add line,
 * add option, delete, move up/down, item/quest conditions) acts on whatever
 * is selected — see devUIKitPanels.ts for the per-row hit-zone/click
 * wiring, reusing the same GalleryClickController the sprite gallery uses.
 * Only actual dialogue *text* still needs typing (there's no way around
 * that): a toolbar icon or row right-click arms `pendingAction`, the
 * player types into the repurposed search box, and ::dinput carries it
 * back. Power users can still type ::dsel/::dline/::doption/::dcond/
 * ::daction/::dtext/::dspeaker/::dmove/::ddelete directly — both paths call
 * the same shared mutation functions below, so they can't drift apart.
 */

// ============================================================================
// Per-player editor state — an in-memory *draft* tree, seeded from whatever
// override already exists. A brand new tree can't be persisted until it has
// at least one step (DialogueTree validation rejects empty step arrays), so
// edits accumulate here and get pushed to DialogueOverrideStore after every
// mutation that leaves the draft valid; earlier mutations just keep building
// up in the draft until that first line makes it saveable.
// ============================================================================

/** What the (repurposed) search box's next Enter submission should do,
 *  armed by a toolbar icon click or a row right-click (::dedit). Cleared
 *  after every ::dinput, successful or not, so a stray Enter with nothing
 *  armed is a harmless no-op rather than repeating a stale action. */
type PendingAction =
    | { type: "addNpcLine" }
    | { type: "addPlayerOption" }
    | { type: "editText" }
    | { type: "nestBranch" }
    | { type: "addItemCondition" }
    | { type: "addQuestCondition" }
    | { type: "addQuestAction" }
    | { type: "addGiveItemAction" };

interface DialogueEditorState {
    npcId: number;
    tree: DialogueTreeJson;
    /** Path label of the currently selected node, e.g. "1", "1A", "1A1". Undefined = nothing selected yet (root). */
    selectedPath?: string;
    pendingAction?: PendingAction;
    /** Path label shown at each outline row index in the last render (see
     *  renderPanel) - undefined for header/hint/divider rows. Per-row
     *  inline Up/Down/Delete button clicks (see registerRowActionButtons)
     *  look up which node they apply to here, the same way the client's
     *  row click/right-click reads it back off the rendered row text. */
    lastRenderedRowPaths: (string | undefined)[];
}

const editorStateByPlayerId = new Map<number, DialogueEditorState>();

function getState(player: PlayerState): DialogueEditorState | undefined {
    return editorStateByPlayerId.get(player.id);
}

// ============================================================================
// Path scheme: alternating "<digits><optional single letter>" tokens.
// The number addresses a position within the *current* steps list (lines and
// action steps consume the next number in sequence; an "options" step
// doesn't consume its own number — it borrows the most recently used number,
// or "1" if it's the first thing in the list, matching how a line and the
// responses to it read as one beat of conversation). A letter after a number
// selects which option of that options-step to descend into, and the next
// number token addresses a position inside that option's own steps list.
// ============================================================================

type PathToken = { num: number; letter?: string };

function parsePath(path: string): PathToken[] | undefined {
    const tokens: PathToken[] = [];
    const re = /(\d+)([A-Za-z])?/g;
    let match: RegExpExecArray | null;
    let consumed = 0;
    while ((match = re.exec(path)) !== null) {
        if (match.index !== consumed) return undefined; // gap/garbage between tokens
        const num = Number(match[1]);
        if (!Number.isInteger(num) || num < 1) return undefined;
        tokens.push({ num, letter: match[2]?.toUpperCase() });
        consumed = re.lastIndex;
    }
    if (consumed !== path.length || tokens.length === 0) return undefined;
    return tokens;
}

/** The local (single-segment) label a step at this list index would render as, per the numbering scheme above. */
function localLabelForIndex(steps: readonly DialogueStep[], index: number): string | undefined {
    let counter = 0;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.kind === "options") {
            const eff = counter === 0 ? 1 : counter;
            if (i === index) return String(eff);
        } else {
            counter += 1;
            if (i === index) return String(counter);
        }
    }
    return undefined;
}

type ResolvedStep = { type: "step"; list: DialogueStep[]; index: number; prefix: string };
type ResolvedOption = {
    type: "option";
    optionsStep: DialogueOptionsStep;
    options: DialogueOption[];
    index: number;
    /** Prefix + number, e.g. "1" for path "1A" — sibling options share this. */
    numberPrefix: string;
    /** Full path of the option itself, e.g. "1A". */
    fullPath: string;
    /** Where optionsStep itself lives, for removing the whole branch (all
     *  its options at once) rather than one option at a time - the only way
     *  to get below the 2-option schema minimum without an invalid
     *  intermediate state. */
    outerList: DialogueStep[];
    outerIndex: number;
};

function resolvePath(rootSteps: DialogueStep[], path: string): ResolvedStep | ResolvedOption | undefined {
    const tokens = parsePath(path);
    if (!tokens) return undefined;
    let steps = rootSteps;
    let prefix = "";
    for (let t = 0; t < tokens.length; t++) {
        const { num, letter } = tokens[t];
        const isLast = t === tokens.length - 1;
        let counter = 0;
        let matchedIndex = -1;
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (step.kind === "options") {
                // A line and the options-step right after it can share the
                // same effective number (see the numbering scheme note
                // above) — only match the options-step when a letter was
                // given, so "1" finds the line and "1A" finds the branch,
                // never the wrong one of the two.
                const eff = counter === 0 ? 1 : counter;
                if (letter !== undefined && eff === num) { matchedIndex = i; break; }
            } else {
                counter += 1;
                if (letter === undefined && counter === num) { matchedIndex = i; break; }
            }
        }
        if (matchedIndex === -1) return undefined;
        const matched = steps[matchedIndex];
        if (matched.kind !== "options") {
            if (letter || !isLast) return undefined; // lines/actions have no children
            return { type: "step", list: steps, index: matchedIndex, prefix };
        }
        if (!letter) return undefined;
        const optIndex = letter.charCodeAt(0) - 65;
        if (optIndex < 0 || optIndex >= matched.options.length) return undefined;
        const numberPrefix = prefix + String(num);
        const fullPath = numberPrefix + letter;
        if (isLast) {
            return {
                type: "option", optionsStep: matched, options: matched.options, index: optIndex,
                numberPrefix, fullPath, outerList: steps, outerIndex: matchedIndex,
            };
        }
        steps = matched.options[optIndex].steps;
        prefix = fullPath;
    }
    return undefined;
}

// ============================================================================
// Rendering — numbered outline, NPC lines default color, player option
// labels red, conditions/actions annotated inline. Selection is highlighted.
// ============================================================================

function conditionTag(condition: DialogueCondition): string {
    const cmp: Record<DialogueComparator, string> = { gte: "\u2265", lte: "\u2264", eq: "=", lt: "<", gt: ">" };
    // Square brackets, not angle brackets: row text goes through the same
    // widget text pipeline as <col=...> markup, so literal "<...>" in
    // content risks being parsed as a tag instead of shown as text.
    switch (condition.type) {
        case "questStage":
            return `[Requires quest '${condition.questKey}' stage ${cmp[condition.comparator]} ${condition.value}]`;
        case "hasItem":
            return `[Requires item ${condition.itemId}${condition.quantity && condition.quantity > 1 ? ` x${condition.quantity}` : ""} in inventory]`;
        case "equippedItem":
            return condition.itemId !== undefined
                ? `[Requires item ${condition.itemId} equipped]`
                : `[Requires something equipped in slot ${condition.slot}]`;
        case "skillLevel":
            return `[Requires skill ${condition.skillId} level ${cmp[condition.comparator]} ${condition.level}]`;
    }
}

function renderSteps(
    steps: readonly DialogueStep[],
    prefix: string,
    selectedPath: string | undefined,
    out: UiTextRow[],
    pathsOut: (string | undefined)[],
    depth = 0,
): void {
    // Two spaces per nesting level - "1." at depth 0, "  1A." at depth 1,
    // "    1A1." at depth 2, and so on, so a branch's shape is visible at a
    // glance instead of every line reading flush-left regardless of nesting.
    // Plain leading spaces turned out to be too subtle to notice against
    // this font/width (reported as "indentation not working" despite being
    // present) - four per level instead of two, with an explicit prefix so
    // it's visible even if a given glyph is thin. Can't verify pixel-exact
    // rendering without a live client; flag if it's still too subtle.
    const indent = depth > 0 ? "-".repeat(depth * 2) + " " : "";
    let counter = 0;
    for (const step of steps) {
        if (step.kind === "line") {
            counter += 1;
            const label = prefix + counter;
            const selected = label === selectedPath;
            const speakerTag = step.speaker === "npc" ? "" : "[Player] ";
            const speakerColor = step.speaker === "npc" ? undefined : "ff6b6b";
            out.push({
                kind: "text",
                text: `${indent}${selected ? "\u25b8 " : ""}${label}.) ${speakerTag}${step.text.join(" / ")}`,
                style: { color: speakerColor, bold: selected },
            });
            pathsOut.push(label);
        } else if (step.kind === "action") {
            counter += 1;
            const label = prefix + counter;
            const selected = label === selectedPath;
            const a = step.action;
            const desc = a.type === "setQuestStage"
                ? `set quest '${a.questKey}' to stage ${a.value}`
                : a.type === "giveItem"
                  ? `give item ${a.itemId}${a.quantity > 1 ? ` x${a.quantity}` : ""}`
                  : `invoke '${a.key}'${a.args ? ` ${JSON.stringify(a.args)}` : ""}`;
            out.push({
                kind: "text",
                text: `${indent}${selected ? "\u25b8 " : ""}${label}.) [Action: ${desc}]`,
                style: { color: "9fd3ff", bold: selected },
            });
            pathsOut.push(label);
        } else if (step.kind === "pool") {
            counter += 1;
            const label = prefix + counter;
            const selected = label === selectedPath;
            out.push({
                kind: "text",
                text: `${indent}${selected ? "\u25b8 " : ""}${label}.) [Random pool: ${step.entries.length} conversations]`,
                style: { color: "c8a7ff", bold: selected },
            });
            pathsOut.push(label);
            for (let i = 0; i < step.entries.length; i++) {
                const entry = step.entries[i];
                const firstLine = entry.steps.find((candidate) => candidate.kind === "line");
                const preview = firstLine?.kind === "line"
                    ? firstLine.text.join(" / ")
                    : `${entry.steps.length} step${entry.steps.length === 1 ? "" : "s"}`;
                const entryIndent = "-".repeat((depth + 1) * 2) + " ";
                out.push({
                    kind: "text",
                    text: `${entryIndent}${entry.id ?? `Variant ${i + 1}`}${entry.weight && entry.weight !== 1 ? ` (weight ${entry.weight})` : ""}: ${preview}`,
                    style: { color: "8d7ba8" },
                });
                pathsOut.push(undefined);
            }
        } else {
            const eff = counter === 0 ? 1 : counter;
            for (let i = 0; i < step.options.length; i++) {
                const option = step.options[i];
                const letter = String.fromCharCode(65 + i);
                const label = prefix + eff + letter;
                const selected = label === selectedPath;
                const tag = option.condition ? ` ${conditionTag(option.condition)}` : "";
                out.push({
                    kind: "text",
                    text: `${indent}${selected ? "\u25b8 " : ""}${label}.)${tag} ${option.label}`,
                    style: { color: "ff8080", bold: selected },
                });
                pathsOut.push(label);
                if (option.steps.length === 0) {
                    // Deliberately empty (see DialogueTree.ts's allowEmpty)
                    // - shown as a plain annotation, not an addressable
                    // node, so it's clearly intentional rather than looking
                    // like a line got lost.
                    const endIndent = "  ".repeat(depth + 1);
                    out.push({ kind: "text", text: `${endIndent}(ends conversation here)`, style: { color: "6b6355" } });
                    pathsOut.push(undefined);
                } else {
                    renderSteps(option.steps, label, selectedPath, out, pathsOut, depth + 1);
                }
            }
        }
    }
}

const TOOLBAR = {
    addNpcLine: { archiveId: 1082, frame: 0 },
    addPlayerOption: { archiveId: 568, frame: 0 },
    nestBranch: { archiveId: 1082, frame: 0 }, // no distinct sprite available - caption disambiguates
    speaker: { archiveId: 699, frame: 0 },
    itemCondition: { archiveId: 1566, frame: 0 },
    questAction: { archiveId: 2495, frame: 0 },
    giveItem: { archiveId: 2149, frame: 0 },
} as const;

function pendingActionHint(pending: PendingAction | undefined): string | undefined {
    if (!pending) return undefined;
    switch (pending.type) {
        case "addNpcLine": return "Type the NPC's line, then press Enter.";
        case "addPlayerOption": return "Type the response text, then press Enter.";
        case "editText": return "Type the new text, then press Enter.";
        case "nestBranch": return "Type the first response of the new branch, then press Enter.";
        case "addItemCondition": return "Type: <itemId> [quantity], then press Enter.";
        case "addQuestCondition": return "Type: <questKey> <stage> (requires stage \u2265 that), then press Enter.";
        case "addQuestAction": return "Type: <questKey> <stage> to set here, then press Enter.";
        case "addGiveItemAction": return "Type: <itemId> [quantity] to give here, then press Enter.";
    }
}

function renderPanel(player: PlayerState, services: ScriptServices, state: DialogueEditorState): void {
    const npcType = services.data.getNpcTypeLoader()?.load(state.npcId) as { name?: string } | undefined;
    const hint = pendingActionHint(state.pendingAction);
    const header: UiTextRow[] = [
        { kind: "heading", text: `NPC: ${npcType?.name ?? "unknown"} (id: ${state.npcId})`, style: { color: "ffcf70", bold: true } },
        { kind: "text", text: state.selectedPath ? `Selected: ${state.selectedPath}` : "Nothing selected" },
        ...(hint ? [{ kind: "text" as const, text: `\u25b8 ${hint}`, style: { color: "9fd3ff" } }] : []),
        { kind: "divider" },
    ];
    const body: UiTextRow[] = [];
    const bodyPaths: (string | undefined)[] = [];
    if (state.tree.steps.length === 0) {
        body.push({ kind: "text", text: "No lines yet — click an icon below to add one." });
        bodyPaths.push(undefined);
    } else {
        renderSteps(state.tree.steps, "", state.selectedPath, body, bodyPaths);
    }
    const rows = [...header, ...body];
    // Parallels `rows` 1:1 so a row-button click (which only knows its row
    // index) can look up which node it applies to - header rows have no
    // path (undefined), matching how they never get inline buttons either.
    state.lastRenderedRowPaths = [...header.map(() => undefined), ...bodyPaths];
    sendUiTextRows(services, player.id, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID, rows);
    sendUiRowClickZones(services, player.id, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID, rows.length);
    sendUiRowActions(services, player.id, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID, state.lastRenderedRowPaths.map((p) => p !== undefined));
    // A toolbar-armed pending action (add line/reply/...) has no
    // client-local hook of its own to focus the search box (unlike
    // right-click-edit, which does it directly client-side) - this signal
    // is how the server asks for it instead. editText is excluded:
    // right-click already handled focus+prefill itself before this render
    // even fires, so re-signalling here would just steal focus back a
    // moment later if the player had already clicked elsewhere.
    sendUiActivateSignal(
        services, player.id, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID,
        !!state.pendingAction && state.pendingAction.type !== "editText",
    );

    // Icon + short caption (not icon alone - a bare sprite turned out not
    // to be self-explanatory, and this project has no confirmed native
    // hover-tooltip for custom UIKit widgets to fall back on, so the
    // caption is always visible rather than gated behind a hover we can't
    // verify). Delete/Move dropped from the toolbar in favor of per-row
    // inline buttons (see content.inlineRowActions) - freed slots went to
    // item/quest conditions and the give-item action, which previously had
    // no icon at all.
    const selection = state.selectedPath ? resolvePath(state.tree.steps, state.selectedPath) : undefined;
    const onOption = selection?.type === "option";
    sendUiControls(services, player.id, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID, [
        { sprite: TOOLBAR.addNpcLine, label: "Line" },
        { sprite: TOOLBAR.addPlayerOption, label: "Rply" },
        onOption ? { sprite: TOOLBAR.nestBranch, label: "Nest" } : undefined,
        { sprite: TOOLBAR.speaker, label: "Spk" },
        onOption ? { sprite: TOOLBAR.itemCondition, label: "Item" } : undefined,
        { sprite: TOOLBAR.questAction, label: onOption ? "Qst" : "Q.Stg" },
        { sprite: TOOLBAR.giveItem, label: "Give" },
        { label: "Back" },
    ], 8);
}

// ============================================================================
// Persistence — push the draft to DialogueOverrideStore whenever it's valid;
// keep editing in-memory when it isn't (e.g. still empty) rather than
// blocking the developer from building a tree up from nothing.
// ============================================================================

function persist(player: PlayerState, services: ScriptServices, state: DialogueEditorState): string[] {
    if (state.tree.steps.length === 0) return [];
    return services.dialogueOverrideStore?.set(state.npcId, state.tree, player.name) ?? [
        "dialogueOverrideStore not available",
    ];
}

function refresh(player: PlayerState, services: ScriptServices, state: DialogueEditorState, errors: string[]): void {
    renderPanel(player, services, state);
    if (errors.length > 0) {
        services.messaging.sendGameMessage(player, `Not saved yet: ${errors.join("; ")}`);
    }
}

// ============================================================================
// Open / entry point
// ============================================================================

export function getLastEditedNpcId(playerId: number): number | undefined {
    return editorStateByPlayerId.get(playerId)?.npcId;
}

export function openDialogueEditorForNpc(player: PlayerState, services: ScriptServices, npcId: number): void {
    const existing = services.dialogueOverrideStore?.get(npcId);
    // Deep-clone: the store's cache is live and shared with the actual
    // Talk-to runner, so mutating a shallow copy here would corrupt
    // in-flight conversations before the draft is even valid to save.
    const state: DialogueEditorState = {
        npcId,
        tree: { steps: existing ? structuredClone(existing.steps) : [] },
        lastRenderedRowPaths: [],
    };
    editorStateByPlayerId.set(player.id, state);
    openUiPanel(services, player, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID, "Dialogue Tree Editor");
    renderPanel(player, services, state);
}

// ============================================================================
// Mutation commands
// ============================================================================

function requireState(event: CommandEvent, services: ScriptServices): DialogueEditorState | string {
    const state = getState(event.player);
    if (!state) return "No dialogue tree open — use ::editdialogue <npcId> first.";
    return state;
}

function parseCondition(args: string[]): { condition: DialogueCondition } | { error: string } {
    const [kindRaw, ...rest] = args;
    const kind = kindRaw?.toLowerCase();
    if (kind === "quest") {
        const [questKey, comparatorRaw, valueStr] = rest;
        const comparator = comparatorRaw?.toLowerCase();
        const value = Number(valueStr);
        if (!questKey || !isComparator(comparator) || !Number.isInteger(value)) {
            return { error: "Usage: ::dcond quest <key> <gte|lte|eq|lt|gt> <stage>" };
        }
        return { condition: { type: "questStage", questKey, comparator, value } };
    }
    if (kind === "item") {
        const [itemIdStr, quantityStr] = rest;
        const itemId = Number(itemIdStr);
        const quantity = quantityStr !== undefined ? Number(quantityStr) : undefined;
        if (!Number.isInteger(itemId) || itemId < 0 || (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1))) {
            return { error: "Usage: ::dcond item <itemId> [quantity]" };
        }
        return { condition: { type: "hasItem", itemId, quantity } };
    }
    if (kind === "equip") {
        const [slotStr, itemIdStr] = rest;
        const slot = Number(slotStr);
        const itemId = itemIdStr !== undefined ? Number(itemIdStr) : undefined;
        if (!Number.isInteger(slot) || slot < 0 || (itemId !== undefined && !Number.isInteger(itemId))) {
            return {
                error:
                    "Usage: ::dcond equip <slot> [itemId] — slots: " +
                    Object.entries(EquipmentSlot)
                        .filter(([k]) => Number.isNaN(Number(k)))
                        .map(([k, v]) => `${v}=${k}`)
                        .join(", "),
            };
        }
        return { condition: { type: "equippedItem", slot, itemId } };
    }
    if (kind === "skill") {
        const [skillIdStr, comparatorRaw, levelStr] = rest;
        const comparator = comparatorRaw?.toLowerCase();
        const skillId = Number(skillIdStr);
        const level = Number(levelStr);
        if (!Number.isInteger(skillId) || !isComparator(comparator) || !Number.isInteger(level)) {
            return {
                error:
                    "Usage: ::dcond skill <skillId> <gte|lte|eq|lt|gt> <level> — skillIds: " +
                    Object.entries(SkillId)
                        .filter(([k]) => Number.isNaN(Number(k)))
                        .map(([k, v]) => `${v}=${k}`)
                        .join(", "),
            };
        }
        return { condition: { type: "skillLevel", skillId, comparator, level } };
    }
    return { error: "Usage: ::dcond quest|item|equip|skill ..." };
}

function isComparator(value: string | undefined): value is DialogueComparator {
    return value === "gte" || value === "lte" || value === "eq" || value === "lt" || value === "gt";
}

// ============================================================================
// Shared mutations — the actual tree edits, each usable both from a typed
// :: command and from the icon toolbar's ::dinput dispatch, so the two
// input paths can never quietly drift apart. Each returns an error message
// on failure, or undefined on success (state is mutated in place either way
// only on success).
// ============================================================================

function applyInsertLine(
    state: DialogueEditorState,
    speaker: "npc" | "player",
    text: string,
): string | undefined {
    if (!text) return "Nothing typed.";
    const newStep: DialogueStep = { kind: "line", speaker, text: [text] };
    if (!state.selectedPath) {
        state.tree.steps.push(newStep);
        state.selectedPath = localLabelForIndex(state.tree.steps, state.tree.steps.length - 1);
        return undefined;
    }
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return `Selection ${state.selectedPath} no longer exists — select again.`;
    if (resolved.type === "step") {
        resolved.list.splice(resolved.index + 1, 0, newStep);
        const localLabel = localLabelForIndex(resolved.list, resolved.index + 1);
        state.selectedPath = resolved.prefix + localLabel;
    } else {
        const option = resolved.options[resolved.index];
        option.steps.push(newStep);
        const localLabel = localLabelForIndex(option.steps, option.steps.length - 1);
        state.selectedPath = resolved.fullPath + localLabel;
    }
    return undefined;
}

function applyInsertOption(state: DialogueEditorState, label: string): string | undefined {
    if (!label) return "Nothing typed.";
    if (!state.selectedPath) {
        return "Select the line this responds to first, or add it with the + icon.";
    }
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return `Selection ${state.selectedPath} no longer exists — select again.`;

    if (resolved.type === "option") {
        resolved.optionsStep.options.push({ label, steps: [] });
        const letter = String.fromCharCode(65 + resolved.optionsStep.options.length - 1);
        state.selectedPath = resolved.numberPrefix + letter;
        return undefined;
    }
    const following = resolved.list[resolved.index + 1];
    if (following?.kind === "options") {
        following.options.push({ label, steps: [] });
        const localLabel = localLabelForIndex(resolved.list, resolved.index + 1);
        const letter = String.fromCharCode(65 + following.options.length - 1);
        state.selectedPath = resolved.prefix + localLabel + letter;
    } else {
        const optionsStep: DialogueOptionsStep = { kind: "options", options: [{ label, steps: [] }] };
        resolved.list.splice(resolved.index + 1, 0, optionsStep);
        const localLabel = localLabelForIndex(resolved.list, resolved.index + 1);
        state.selectedPath = resolved.prefix + localLabel + "A";
    }
    return undefined;
}

/**
 * Nests a brand new response branch directly under the selected option -
 * "1B leads straight into another choice" with no NPC line in between (a
 * multiple-choice branch under a multiple-choice branch). Distinct from
 * applyInsertOption's "option selected" case, which adds a *sibling*
 * option instead (1B -> 1C) - selecting an option is ambiguous between
 * "another response to the same prompt" and "branch further from this
 * specific response," so they need separate, explicitly-named actions
 * rather than one guessing which you meant.
 */
function applyNestBranch(state: DialogueEditorState, label: string): string | undefined {
    if (!label) return "Nothing typed.";
    if (!state.selectedPath) return "Select the option to branch from first (e.g. ::dsel 1B).";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return `Selection ${state.selectedPath} no longer exists — select again.`;
    if (resolved.type !== "option") {
        return "Nesting a new branch only makes sense under a response option — select one first (e.g. ::dsel 1B), not a line.";
    }
    const option = resolved.options[resolved.index];
    const lastIndex = option.steps.length - 1;
    const last = lastIndex >= 0 ? option.steps[lastIndex] : undefined;
    if (last?.kind === "options") {
        // Already branches here - add another sibling within that nested branch.
        last.options.push({ label, steps: [] });
        const localLabel = localLabelForIndex(option.steps, lastIndex);
        const letter = String.fromCharCode(65 + last.options.length - 1);
        state.selectedPath = resolved.fullPath + localLabel + letter;
    } else {
        const optionsStep: DialogueOptionsStep = { kind: "options", options: [{ label, steps: [] }] };
        option.steps.push(optionsStep);
        const localLabel = localLabelForIndex(option.steps, option.steps.length - 1);
        state.selectedPath = resolved.fullPath + localLabel + "A";
    }
    return undefined;
}

function applyEditText(state: DialogueEditorState, text: string): string | undefined {
    if (!text) return "Nothing typed.";
    if (!state.selectedPath) return "Nothing selected.";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return `Selection ${state.selectedPath} no longer exists — select again.`;
    if (resolved.type === "option") {
        resolved.options[resolved.index].label = text;
        return undefined;
    }
    const step = resolved.list[resolved.index];
    if (step.kind !== "line") return "Only a line's text or an option's label can be edited this way.";
    step.text = [text];
    return undefined;
}

function applyToggleSpeaker(state: DialogueEditorState): string | undefined {
    if (!state.selectedPath) return "Select a line first.";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved || resolved.type !== "step" || resolved.list[resolved.index].kind !== "line") {
        return "Speaker only applies to a line — select a line, not an option/action.";
    }
    const line = resolved.list[resolved.index] as { speaker: "npc" | "player" };
    line.speaker = line.speaker === "npc" ? "player" : "npc";
    return undefined;
}

function applyDelete(state: DialogueEditorState): string | undefined {
    if (!state.selectedPath) return "Nothing selected.";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return `Selection ${state.selectedPath} no longer exists.`;
    if (resolved.type === "option") {
        if (resolved.options.length <= 2) {
            return "Can't delete just this option — a response list needs at least 2. Use \"Delete Branch\" instead to remove the whole choice.";
        }
        resolved.options.splice(resolved.index, 1);
    } else {
        // Emptying an option's own steps is fine - it just means that
        // response ends the conversation right there ("Nevermind" with no
        // further reply), a real, deliberately-supported shape (see
        // DialogueTree.ts validateSteps' allowEmpty param). Only the root
        // tree (prefix === "") can never be left with nothing in it - that
        // would mean talking to the NPC does literally nothing at all.
        const isRoot = resolved.prefix === "";
        if (isRoot && resolved.list.length <= 1) {
            return "Can't delete the only step here — the tree can't be left completely empty. Add a replacement line first.";
        }
        resolved.list.splice(resolved.index, 1);
    }
    state.selectedPath = undefined;
    return undefined;
}

/**
 * Removes an entire response branch (every option under it, not just one) -
 * the only way to get a choice point down to zero options, since the
 * DialogueTree schema requires 2-5 options for any options-step that
 * exists at all (see DialogueTree.ts validateSteps) and there's no valid
 * intermediate state below 2. Select any option belonging to the branch;
 * this removes the whole options-step, not just that option.
 */
function applyDeleteBranch(state: DialogueEditorState): string | undefined {
    if (!state.selectedPath) return "Select an option belonging to the branch first.";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return `Selection ${state.selectedPath} no longer exists.`;
    if (resolved.type !== "option") return "Select an option (e.g. 1A), not a line, to delete its whole branch.";
    // A root-level path's numberPrefix is pure digits (e.g. "1"); any
    // nesting introduces a letter before the next digit run (e.g. "1A1"),
    // so this is a reliable "is outerList the root tree.steps" check
    // without needing a dedicated field - same reasoning as applyDelete's
    // prefix === "" check for the step case.
    const outerIsRoot = /^\d+$/.test(resolved.numberPrefix);
    if (outerIsRoot && resolved.outerList.length <= 1) {
        return "Can't delete the only step here — the tree can't be left completely empty. Add a replacement line first.";
    }
    resolved.outerList.splice(resolved.outerIndex, 1);
    state.selectedPath = undefined;
    return undefined;
}

/**
 * Swaps the selected node with its previous/next sibling in whatever array
 * it lives in. For a line/action ("step"), refuses to swap across an
 * adjacent "options" branch — that branch is anchored to the line before
 * it (see the numbering scheme note above), so swapping past it would
 * silently detach a response list from the line it responds to. Reordering
 * the branch as a whole means moving the line it's attached to instead.
 */
function applyMove(state: DialogueEditorState, direction: "up" | "down"): string | undefined {
    if (!state.selectedPath) return "Nothing selected.";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return `Selection ${state.selectedPath} no longer exists.`;

    if (resolved.type === "option") {
        const { options, index } = resolved;
        const swapWith = direction === "up" ? index - 1 : index + 1;
        if (swapWith < 0 || swapWith >= options.length) return undefined; // already at the edge
        [options[index], options[swapWith]] = [options[swapWith], options[index]];
        state.selectedPath = resolved.numberPrefix + String.fromCharCode(65 + swapWith);
        return undefined;
    }

    const { list, index, prefix } = resolved;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= list.length) return undefined; // already at the edge
    if (list[swapWith].kind === "options") {
        return "Can't reorder across a response branch that way — move the line it's attached to instead.";
    }
    [list[index], list[swapWith]] = [list[swapWith], list[index]];
    state.selectedPath = prefix + localLabelForIndex(list, swapWith);
    return undefined;
}

function insertActionStep(state: DialogueEditorState, action: DialogueAction): void {
    const newStep: DialogueStep = { kind: "action", action };
    if (!state.selectedPath) {
        state.tree.steps.push(newStep);
        state.selectedPath = localLabelForIndex(state.tree.steps, state.tree.steps.length - 1);
        return;
    }
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved) return; // caller already validated selection exists before calling
    if (resolved.type === "step") {
        resolved.list.splice(resolved.index + 1, 0, newStep);
        state.selectedPath = resolved.prefix + localLabelForIndex(resolved.list, resolved.index + 1);
    } else {
        const option = resolved.options[resolved.index];
        option.steps.push(newStep);
        state.selectedPath = resolved.fullPath + localLabelForIndex(option.steps, option.steps.length - 1);
    }
}

function applyAddItemCondition(state: DialogueEditorState, args: string[]): string | undefined {
    if (!state.selectedPath) return "Select a response option first.";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved || resolved.type !== "option") return "Item conditions attach to response options — select one first.";
    const [itemIdStr, quantityStr] = args;
    const itemId = Number(itemIdStr);
    const quantity = quantityStr !== undefined ? Number(quantityStr) : undefined;
    if (!Number.isInteger(itemId) || itemId < 0 || (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1))) {
        return "Type: <itemId> [quantity]";
    }
    resolved.options[resolved.index].condition = { type: "hasItem", itemId, quantity };
    return undefined;
}

function applyAddQuestCondition(state: DialogueEditorState, services: ScriptServices, args: string[]): string | undefined {
    if (!state.selectedPath) return "Select a response option first.";
    const resolved = resolvePath(state.tree.steps, state.selectedPath);
    if (!resolved || resolved.type !== "option") return "Quest conditions attach to response options — select one first.";
    const [questKey, valueStr] = args;
    const value = Number(valueStr);
    if (!questKey || !Number.isInteger(value)) return "Type: <questKey> <stage>";
    if (services.quests && !services.quests.hasQuest(questKey)) return `Unknown quest key '${questKey}'.`;
    resolved.options[resolved.index].condition = { type: "questStage", questKey, comparator: "gte", value };
    return undefined;
}

function applyAddQuestAction(state: DialogueEditorState, services: ScriptServices, args: string[]): string | undefined {
    const [questKey, valueStr] = args;
    const value = Number(valueStr);
    if (!questKey || !Number.isInteger(value) || value < 0) return "Type: <questKey> <stage>";
    if (services.quests && !services.quests.hasQuest(questKey)) return `Unknown quest key '${questKey}'.`;
    if (state.selectedPath && !resolvePath(state.tree.steps, state.selectedPath)) {
        return `Selection ${state.selectedPath} no longer exists — select again.`;
    }
    insertActionStep(state, { type: "setQuestStage", questKey, value });
    return undefined;
}

function applyGiveItemAction(state: DialogueEditorState, args: string[]): string | undefined {
    const [itemIdStr, quantityStr] = args;
    const itemId = Number(itemIdStr);
    const quantity = quantityStr !== undefined ? Number(quantityStr) : 1;
    if (!Number.isInteger(itemId) || itemId < 0 || !Number.isInteger(quantity) || quantity < 1) {
        return "Type: <itemId> [quantity]";
    }
    if (state.selectedPath && !resolvePath(state.tree.steps, state.selectedPath)) {
        return `Selection ${state.selectedPath} no longer exists — select again.`;
    }
    insertActionStep(state, { type: "giveItem", itemId, quantity });
    return undefined;
}

// ============================================================================
// Command + toolbar registration
// ============================================================================

export function registerDevDialogueEditor(registry: IScriptRegistry, services: ScriptServices): void {
    registerPlayerScopedCollections(registry, services, editorStateByPlayerId);

    const registerDeveloperCommand = (name: string, handler: CommandHandler): void => {
        registry.registerCommand(name, handler, {
            permission: "developer",
            owner: "developer:dialogue-editor",
            hidden: true,
        });
    };

    registerDeveloperCommand("editdialogue", (event) => {
        const npcId = Number(event.args[0]);
        if (!Number.isFinite(npcId) || npcId <= 0) {
            return "Usage: ::editdialogue <npcId> — opens the Dialogue Editor for that NPC id.";
        }
        openDialogueEditorForNpc(event.player, services, npcId);
    });

    registerDeveloperCommand("dsel", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const path = event.args[0];
        state.pendingAction = undefined;
        if (!path) {
            state.selectedPath = undefined;
        } else if (!resolvePath(state.tree.steps, path)) {
            return `No such node: ${path}`;
        } else {
            state.selectedPath = path;
        }
        refresh(event.player, services, state, []);
    });

    /** Right-click-a-row entry point (see devUIKitPanels.ts) — selects the
     *  node and arms editText, same as clicking the row then typing would,
     *  in one step. */
    registerDeveloperCommand("dedit", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const path = event.args[0];
        if (!path) return "Usage: ::dedit <path>";
        const resolved = resolvePath(state.tree.steps, path);
        if (!resolved) return `No such node: ${path}`;
        if (resolved.type === "step" && resolved.list[resolved.index].kind !== "line") {
            return "Only a line's text or an option's label can be edited.";
        }
        state.selectedPath = path;
        state.pendingAction = { type: "editText" };
        refresh(event.player, services, state, []);
    });

    /** Whatever the search box just submitted, dispatched by whichever
     *  toolbar icon (or ::dedit) last armed pendingAction. */
    registerDeveloperCommand("dinput", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const pending = state.pendingAction;
        state.pendingAction = undefined;
        if (!pending) return "Nothing pending — click a toolbar icon first, or use a typed :: command.";
        const text = event.args.join(" ").trim();
        let error: string | undefined;
        switch (pending.type) {
            case "addNpcLine": error = applyInsertLine(state, "npc", text); break;
            case "addPlayerOption": error = applyInsertOption(state, text); break;
            case "editText": error = applyEditText(state, text); break;
            case "nestBranch": error = applyNestBranch(state, text); break;
            case "addItemCondition": error = applyAddItemCondition(state, text.split(/\s+/).filter(Boolean)); break;
            case "addQuestCondition": error = applyAddQuestCondition(state, services, text.split(/\s+/).filter(Boolean)); break;
            case "addQuestAction": error = applyAddQuestAction(state, services, text.split(/\s+/).filter(Boolean)); break;
            case "addGiveItemAction": error = applyGiveItemAction(state, text.split(/\s+/).filter(Boolean)); break;
        }
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("dline", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const speaker = event.args[0]?.toLowerCase();
        const text = event.args.slice(1).join(" ").trim();
        if (speaker !== "npc" && speaker !== "player") return "Usage: ::dline npc|player <text>";
        const error = applyInsertLine(state, speaker, text);
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("doption", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const error = applyInsertOption(state, event.args.join(" ").trim());
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("dnest", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const error = applyNestBranch(state, event.args.join(" ").trim());
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("dcond", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        if (!state.selectedPath) return "Select an option first (::dsel 1A).";
        const resolved = resolvePath(state.tree.steps, state.selectedPath);
        if (!resolved || resolved.type !== "option") {
            return "Conditions attach to response options, not lines — select an option first (e.g. ::dsel 1A).";
        }
        if (event.args[0]?.toLowerCase() === "clear") {
            resolved.options[resolved.index].condition = undefined;
            refresh(event.player, services, state, persist(event.player, services, state));
            return;
        }
        const result = parseCondition(event.args);
        if ("error" in result) return result.error;
        resolved.options[resolved.index].condition = result.condition;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("daction", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const [kindRaw, ...rest] = event.args;
        const kind = kindRaw?.toLowerCase();
        let error: string | undefined;
        if (kind === "quest") error = applyAddQuestAction(state, services, rest);
        else if (kind === "item") error = applyGiveItemAction(state, rest);
        else return "Usage: ::daction quest <questKey> <stage> — or — ::daction item <itemId> [quantity]";
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("dtext", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const error = applyEditText(state, event.args.join(" ").trim());
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("dspeaker", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const error = applyToggleSpeaker(state);
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("dmove", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const direction = event.args[0]?.toLowerCase();
        if (direction !== "up" && direction !== "down") return "Usage: ::dmove up|down";
        const error = applyMove(state, direction);
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("ddelete", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const error = applyDelete(state);
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    registerDeveloperCommand("ddeletebranch", (event) => {
        const state = requireState(event, services);
        if (typeof state === "string") return state;
        const error = applyDeleteBranch(state);
        if (error) return error;
        refresh(event.player, services, state, persist(event.player, services, state));
    });

    // ------------------------------------------------------------------
    // Icon toolbar — see TOOLBAR in renderPanel for the sprite ids/slots.
    // Add-line/Add-reply/Nest/conditions/actions all arm pendingAction and
    // re-render with a hint; the actual mutation happens in ::dinput once
    // the player types the content and hits Enter (see submitDialogueInput
    // in devUIKitPanels.ts). Speaker toggles immediately since it needs no
    // typed content. Delete/Move are no longer here at all - see
    // registerRowActionButtons below for the per-row inline versions.
    // ------------------------------------------------------------------
    function armPending(player: PlayerState, pending: PendingAction): void {
        const state = getState(player);
        if (!state) return;
        state.pendingAction = pending;
        renderPanel(player, services, state);
    }

    registerUiPanelActions(registry, services, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID, [
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE,
            actionId: "dialogue_editor_add_npc_line",
            handle: ({ player }) => armPending(player, { type: "addNpcLine" }),
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 1,
            actionId: "dialogue_editor_add_player_option",
            handle: ({ player }) => armPending(player, { type: "addPlayerOption" }),
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 2,
            actionId: "dialogue_editor_nest_branch",
            handle: ({ player }) => armPending(player, { type: "nestBranch" }),
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 3,
            actionId: "dialogue_editor_speaker",
            handle: ({ player }) => {
                const state = getState(player);
                if (!state) return;
                const error = applyToggleSpeaker(state);
                refresh(player, services, state, error ? [error] : persist(player, services, state));
            },
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 4,
            actionId: "dialogue_editor_item_condition",
            handle: ({ player }) => armPending(player, { type: "addItemCondition" }),
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 5,
            actionId: "dialogue_editor_quest_icon",
            handle: ({ player }) => {
                const state = getState(player);
                if (!state) return;
                const resolved = state.selectedPath ? resolvePath(state.tree.steps, state.selectedPath) : undefined;
                armPending(player, { type: resolved?.type === "option" ? "addQuestCondition" : "addQuestAction" });
            },
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 6,
            actionId: "dialogue_editor_give_item",
            handle: ({ player }) => armPending(player, { type: "addGiveItemAction" }),
        },
        {
            componentId: ComponentIds.CONTROL_BACKGROUND_BASE + 7,
            actionId: "dialogue_editor_back",
            handle: ({ player }) => {
                services.dialog.getInterfaceService()?.closeModal(player);
            },
        },
    ]);

    registerRowActionButtons(registry, services);
}

/**
 * Per-row inline Up/Down/Delete buttons (see content.inlineRowActions and
 * ROW_MOVE_UP_BASE/ROW_MOVE_DOWN_BASE/ROW_DELETE_BASE in contracts.ts) -
 * real clickable widgets, one registration per row per action, up to
 * INLINE_ROW_ACTION_CAPACITY. Each handler looks up which node its row
 * currently represents via state.lastRenderedRowPaths (set every render in
 * renderPanel) rather than needing its own path parameter, so it can just
 * set selectedPath and reuse the exact same apply* functions the toolbar
 * and typed commands already use - one code path for "move this thing",
 * not a second copy that could drift from the first.
 */
function registerRowActionButtons(registry: IScriptRegistry, services: ScriptServices): void {
    function withRow(
        rowIndex: number,
        player: PlayerState,
        run: (state: DialogueEditorState) => string | undefined,
    ): void {
        const state = getState(player);
        if (!state) return;
        const path = state.lastRenderedRowPaths[rowIndex];
        if (!path) return; // header/hint/divider row, or a stale click after the tree changed shape
        state.selectedPath = path;
        const error = run(state);
        refresh(player, services, state, error ? [error] : persist(player, services, state));
    }

    const actions: { base: number; idPrefix: string; run: (state: DialogueEditorState) => string | undefined }[] = [
        { base: ComponentIds.ROW_MOVE_UP_BASE, idPrefix: "row_up", run: (s) => applyMove(s, "up") },
        { base: ComponentIds.ROW_MOVE_DOWN_BASE, idPrefix: "row_down", run: (s) => applyMove(s, "down") },
        { base: ComponentIds.ROW_DELETE_BASE, idPrefix: "row_delete", run: (s) => applyDelete(s) },
    ];
    const buttons: UiPanelAction[] = [];
    for (const { base, idPrefix, run } of actions) {
        for (let i = 0; i < ComponentIds.INLINE_ROW_ACTION_CAPACITY; i++) {
            buttons.push({
                componentId: base + i,
                actionId: `dialogue_editor_${idPrefix}_${i}`,
                handle: ({ player }) => withRow(i, player, run),
            });
        }
    }
    registerUiPanelActions(registry, services, DEV_UIKIT_DIALOGUE_PANEL_GROUP_ID, buttons);
}
