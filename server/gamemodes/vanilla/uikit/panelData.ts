import { ComponentIds } from "../../../../client/widgets/uikit/types";
import {
    centerLine as buildCenterLine,
    isCenteredLine,
    stripCenterPrefix,
} from "../../../../client/widgets/uikit/textMarkup";
import type { PlayerState } from "../../../src/game/player";
import type { ScriptServices } from "../../../src/game/scripts/types";

/**
 * UI Kit - server-side panel data helpers.
 *
 * This is the single implementation of "open a panel with a title/border"
 * and "populate its tabs/rows" that every custom panel in this project
 * should use from here on, instead of each panel re-deriving the same
 * packUid/steelborder/set_text boilerplate. Fix a bug here, every panel
 * using it is fixed.
 */

/** Real cache clientscript that draws a frame's border/title bar/close
 *  button. Proven working via the smithing bar picker, item spawner, and
 *  every custom panel built since. */
const SCRIPT_STEELBORDER = 227;

export function packUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

/**
 * Opens a panel (built with buildUiPanel) as a mainmodal, with a proper
 * bordered frame and title - no separate title widget or close button
 * needed, steelborder draws both directly onto the frame.
 */
export function openUiPanel(
    services: ScriptServices,
    player: PlayerState,
    groupId: number,
    title: string,
    options?: { data?: unknown; varps?: Record<number, number>; varbits?: Record<number, number> },
): void {
    const playerId = player.id;
    const interfaceService = services.dialog.getInterfaceService();
    interfaceService?.openModal(player, groupId, options?.data, {
        varps: options?.varps,
        varbits: options?.varbits,
    });

    services.dialog.queueWidgetEvent(playerId, {
        action: "run_script",
        scriptId: SCRIPT_STEELBORDER,
        args: [packUid(groupId, ComponentIds.FRAME), title],
    });
}

/**
 * Populates a panel's sidebar tabs (label text + active-tab highlight).
 * Safe to call repeatedly (e.g. on every tab click) without reopening
 * the panel.
 */
export function sendUiTabs(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    tabs: ReadonlyArray<{ label: string }>,
    activeIndex: number,
): void {
    for (let i = 0; i < ComponentIds.MAX_TABS; i++) {
        const tab = i < tabs.length ? tabs[i] : undefined;
        const tabUid = packUid(groupId, ComponentIds.TAB_BASE + i);
        const highlightUid = packUid(groupId, ComponentIds.TAB_HIGHLIGHT_BASE + i);

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: tabUid,
            text: tab ? (i === activeIndex ? `<col=ffffff>${tab.label}</col>` : tab.label) : "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: tabUid,
            hidden: !tab,
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: highlightUid,
            hidden: !tab || i !== activeIndex,
        });
    }
}

/**
 * Populates a panel's "text" content rows from a plain lines array.
 *
 * - A blank string ("") is a section-break marker (see DIVIDER_LINE in
 *   textMarkup.ts) and renders as a divider rule instead of an empty
 *   text line.
 * - A line wrapped with centerLine() renders centered via the dedicated
 *   centered widget instead of the regular left-aligned one (e.g.
 *   "Easy tasks: 2/8" style headers).
 * - Slots beyond the content are hidden entirely.
 */
export function sendUiTextRows(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    lines: readonly string[],
): void {
    for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
        const hasContent = i < lines.length;
        const raw = hasContent ? lines[i] : "";
        const isDivider = hasContent && raw === "";
        const isCentered = hasContent && isCenteredLine(raw);
        const displayText = isCentered ? stripCenterPrefix(raw) : raw;

        const lineUid = packUid(groupId, ComponentIds.TEXT_ROW_LINE_BASE + i);
        const dividerUid = packUid(groupId, ComponentIds.TEXT_ROW_DIVIDER_BASE + i);
        const centerUid = packUid(groupId, ComponentIds.TEXT_ROW_CENTER_BASE + i);

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: lineUid,
            text: hasContent && !isDivider && !isCentered ? displayText : "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: lineUid,
            hidden: !hasContent || isDivider || isCentered,
        });

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: centerUid,
            text: isCentered ? displayText : "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: centerUid,
            hidden: !isCentered,
        });

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: dividerUid,
            hidden: !isDivider,
        });
    }
}

export interface UiIconRowData {
    itemId: number;
    level: number;
    name: string;
    description?: string;
}

/** Populates a panel's "icon" content rows (level + item icon + name +
 *  optional description) - the skill-guide-style entry layout. */
export function sendUiIconRows(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    rows: readonly UiIconRowData[],
): void {
    for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
        const row = i < rows.length ? rows[i] : undefined;
        const levelUid = packUid(groupId, ComponentIds.ICON_ROW_LEVEL_BASE + i);
        const iconUid = packUid(groupId, ComponentIds.ICON_ROW_ICON_BASE + i);
        const nameUid = packUid(groupId, ComponentIds.ICON_ROW_NAME_BASE + i);
        const descUid = packUid(groupId, ComponentIds.ICON_ROW_DESC_BASE + i);

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: levelUid,
            text: row ? `${row.level}` : "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: levelUid,
            hidden: !row,
        });

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_item",
            uid: iconUid,
            itemId: row?.itemId ?? -1,
            quantity: 1,
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: iconUid,
            hidden: !row,
        });

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: nameUid,
            text: row?.name ?? "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: nameUid,
            hidden: !row,
        });

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: descUid,
            text: row?.description ?? "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: descUid,
            hidden: !row || !row.description,
        });
    }
}

// Re-export so consumers only need one import for the whole kit's
// server-side surface.
export { buildCenterLine as centerLine };
