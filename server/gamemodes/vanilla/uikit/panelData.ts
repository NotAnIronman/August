import {
    ComponentIds,
    type UiControl,
    type UiIconRow,
    type UiMenuButton,
    type UiPanelRow,
    type UiTextRow,
} from "../../../../client/common/uikit/contracts";
import {
    centerLine as buildCenterLine,
    isCenteredLine,
    reflowLines,
    stripCenterPrefix,
    styleText,
    wrapTextToLines,
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

function assertCapacity(kind: "tabs" | "rows" | "controls", count: number, maximum: number): void {
    if (count > maximum) {
        throw new RangeError(`UIKit ${kind} capacity exceeded: ${count} requested, maximum ${maximum}`);
    }
}

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
    assertCapacity("tabs", tabs.length, ComponentIds.MAX_TABS);
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
    lines: readonly (string | UiTextRow)[],
): void {
    assertCapacity("rows", lines.length, ComponentIds.MAX_ROWS);
    for (let i = 0; i < ComponentIds.MAX_ROWS; i++) {
        const hasContent = i < lines.length;
        const raw = hasContent ? lines[i] : undefined;
        const legacy = typeof raw === "string" ? raw : undefined;
        const isDivider =
            hasContent &&
            (legacy === "" || (typeof raw !== "string" && raw?.kind === "divider"));
        const isSpacer = hasContent && raw !== undefined && typeof raw !== "string" && raw.kind === "spacer";
        const isLegacyCentered = typeof legacy === "string" && isCenteredLine(legacy);
        const isCentered = isLegacyCentered || (typeof raw !== "string" && raw?.kind === "heading") ||
            (typeof raw !== "string" && raw?.kind === "text" && raw.align === "center");
        const text = typeof raw === "string"
            ? (isLegacyCentered ? stripCenterPrefix(raw) : raw)
            : raw && (raw.kind === "text" || raw.kind === "heading")
              ? styleText(raw.text, raw.style)
              : "";

        const lineUid = packUid(groupId, ComponentIds.TEXT_ROW_LINE_BASE + i);
        const dividerUid = packUid(groupId, ComponentIds.TEXT_ROW_DIVIDER_BASE + i);
        const centerUid = packUid(groupId, ComponentIds.TEXT_ROW_CENTER_BASE + i);

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: lineUid,
            text: hasContent && !isDivider && !isCentered ? text : "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: lineUid,
            hidden: !hasContent || isDivider || isCentered,
        });

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: centerUid,
            text: isCentered ? text : "",
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
        // A spacer is an intentionally blank but visible line so the scroll
        // controller preserves its vertical space without using a magic string.
        if (isSpacer) {
            services.dialog.queueWidgetEvent(playerId, {
                action: "set_hidden", uid: lineUid, hidden: false,
            });
        }
    }
}

export type UiIconRowData = UiIconRow;

/** Populates a panel's "icon" content rows (level + item icon + name +
 *  optional description) - the skill-guide-style entry layout. */
export function sendUiIconRows(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    rows: readonly (UiIconRowData | undefined)[],
): void {
    assertCapacity("rows", rows.length, ComponentIds.MAX_ROWS);
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
            action: "set_transparency",
            uid: iconUid,
            transparency: row?.transparency ?? 0,
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

/** Populates a panel that intentionally mixes text and icon entries by row. */
export function sendUiMixedRows(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    rows: readonly UiPanelRow[],
): void {
    assertCapacity("rows", rows.length, ComponentIds.MAX_ROWS);
    const textRows: UiTextRow[] = rows.map((row): UiTextRow =>
        "kind" in row ? row : { kind: "spacer" },
    );
    const iconRows: Array<UiIconRowData | undefined> = rows.map((row): UiIconRowData | undefined =>
        "kind" in row ? undefined : row,
    );
    sendUiTextRows(services, playerId, groupId, textRows);
    sendUiIconRows(services, playerId, groupId, iconRows);
}

/** Sets the label on a panel's optional footer button (layout.footerButton
 *  in types.ts). Safe to call at open time or any time after. */
export function sendUiFooterButton(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    label: string,
): void {
    services.dialog.queueWidgetEvent(playerId, {
        action: "set_text",
        uid: packUid(groupId, ComponentIds.FOOTER_BUTTON_LABEL),
        text: label,
    });
    for (const componentId of [ComponentIds.FOOTER_BUTTON, ComponentIds.FOOTER_BUTTON_LABEL]) {
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: packUid(groupId, componentId),
            hidden: false,
        });
    }
}

/** Populates the optional generic action-button strip (layout.controls). */
export function sendUiControls(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    controls: readonly UiControl[],
): void {
    assertCapacity("controls", controls.length, ComponentIds.MAX_CONTROLS);
    for (let i = 0; i < ComponentIds.MAX_CONTROLS; i++) {
        const control = controls[i];
        const backgroundUid = packUid(groupId, ComponentIds.CONTROL_BACKGROUND_BASE + i);
        const labelUid = packUid(groupId, ComponentIds.CONTROL_LABEL_BASE + i);
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text", uid: labelUid, text: control?.label ?? "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden", uid: backgroundUid, hidden: !control,
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden", uid: labelUid, hidden: !control,
        });
    }
}

/** Populates the large two-column menu-button grid. */
export function sendUiMenuButtons(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    buttons: readonly UiMenuButton[],
): void {
    assertCapacity("menu buttons", buttons.length, ComponentIds.MAX_MENU_BUTTONS);
    for (let i = 0; i < ComponentIds.MAX_MENU_BUTTONS; i++) {
        const button = buttons[i];
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_item",
            uid: packUid(groupId, ComponentIds.MENU_BUTTON_ICON_BASE + i),
            itemId: button?.itemId ?? -1,
            quantity: 1,
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_transparency",
            uid: packUid(groupId, ComponentIds.MENU_BUTTON_ICON_BASE + i),
            transparency: button?.transparency ?? 0,
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: packUid(groupId, ComponentIds.MENU_BUTTON_LABEL_BASE + i),
            text: button?.label ?? "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: packUid(groupId, ComponentIds.MENU_BUTTON_BACKGROUND_BASE + i),
            hidden: !button,
        });
        for (const componentBase of [
            ComponentIds.MENU_BUTTON_ICON_BASE,
            ComponentIds.MENU_BUTTON_LABEL_BASE,
        ]) {
            services.dialog.queueWidgetEvent(playerId, {
                action: "set_hidden",
                uid: packUid(groupId, componentBase + i),
                hidden: !button,
            });
        }
    }
}

// Re-export so consumers only need one import for the whole kit's
// server-side surface.
export { buildCenterLine as centerLine, reflowLines, wrapTextToLines };
