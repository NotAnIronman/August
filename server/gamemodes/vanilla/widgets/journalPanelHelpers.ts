import {
    JOURNAL_PANEL_COMPONENT_CENTER_BASE,
    JOURNAL_PANEL_COMPONENT_DIVIDER_BASE,
    JOURNAL_PANEL_COMPONENT_LINE_BASE,
    JOURNAL_PANEL_MAX_LINES,
} from "../../../../client/common/ui/widgets";
import type { ScriptServices } from "../../../src/game/scripts/types";

function packUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

/**
 * Prefix that marks a line as a centered header (e.g. achievement diary
 * tier headers like "Easy tasks: 10/10") rather than normal left-aligned
 * body text. Stripped before display.
 */
const CENTER_LINE_PREFIX = "<<center>>";

/** Wrap a header line so sendJournalPanelLines renders it centered. */
export function centerLine(text: string): string {
    return `${CENTER_LINE_PREFIX}${text}`;
}

/**
 * Naive word-wrap for plain text into panel-width lines. Tuned for the
 * journal panel's body font/width (FONT_PLAIN_12 in a ~430px-wide column) -
 * an approximation, not real font-metric measurement.
 */
export function wrapTextToLines(text: string, maxCharsPerLine = 62): string[] {
    const paragraphs = String(text ?? "").split(/\r?\n/);
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
        let current = "";
        for (const word of words) {
            const candidate = current.length > 0 ? `${current} ${word}` : word;
            if (candidate.length > maxCharsPerLine && current.length > 0) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current.length > 0 || paragraph.length === 0) lines.push(current);
    }
    return lines;
}

/**
 * Reflows a lines array that was hand-wrapped for a narrower interface
 * (e.g. each quest's journal.ts, whose short manually-broken lines were
 * sized for the old cache interface's column width) into paragraphs that
 * fill the current, wider panel.
 *
 * Consecutive non-blank entries are joined into a single paragraph (so the
 * original hard line-breaks stop mattering) and then re-wrapped with
 * wrapTextToLines. A blank entry ("") is preserved as-is - it's the
 * section-break marker sendJournalPanelLines turns into a divider, so it
 * must survive reflow untouched, and it also flushes the current paragraph.
 */
export function reflowLines(lines: string[], maxCharsPerLine = 62): string[] {
    const result: string[] = [];
    let buffer: string[] = [];

    const flush = () => {
        if (buffer.length === 0) return;
        result.push(...wrapTextToLines(buffer.join(" "), maxCharsPerLine));
        buffer = [];
    };

    for (const line of lines) {
        if (line === "") {
            flush();
            result.push("");
        } else {
            buffer.push(line);
        }
    }
    flush();

    return result;
}

/**
 * Sends set_text/set_hidden events to fill a journal panel's line slots
 * from a plain lines array.
 *
 * - A blank string ("") is a section-break marker and renders as a
 *   divider rule instead of an empty text line (see reflowLines).
 * - A line wrapped with centerLine() renders centered instead of
 *   left-aligned (e.g. achievement diary tier headers).
 * - Slots beyond the content (either padding past lines.length, or past
 *   JOURNAL_PANEL_MAX_LINES) are hidden entirely.
 */
export function sendJournalPanelLines(
    services: ScriptServices,
    playerId: number,
    groupId: number,
    lines: string[],
): void {
    for (let i = 0; i < JOURNAL_PANEL_MAX_LINES; i++) {
        const hasContent = i < lines.length;
        const raw = hasContent ? lines[i] : "";
        const isDivider = hasContent && raw === "";
        const isCentered = hasContent && raw.startsWith(CENTER_LINE_PREFIX);
        const displayText = isCentered ? raw.slice(CENTER_LINE_PREFIX.length) : raw;

        const textUid = packUid(groupId, JOURNAL_PANEL_COMPONENT_LINE_BASE + i);
        const centerUid = packUid(groupId, JOURNAL_PANEL_COMPONENT_CENTER_BASE + i);
        const dividerUid = packUid(groupId, JOURNAL_PANEL_COMPONENT_DIVIDER_BASE + i);

        services.dialog.queueWidgetEvent(playerId, {
            action: "set_text",
            uid: textUid,
            text: hasContent && !isDivider && !isCentered ? displayText : "",
        });
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: textUid,
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
