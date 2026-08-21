/**
 * UI Kit - text markup helpers.
 *
 * Every "text" row's line is a plain string that goes through
 * sendUiTextRows (see server/gamemodes/vanilla/uikit/panelData.ts). These
 * helpers standardize how that string encodes section breaks, centered
 * headers, and colors, so panels don't hand-roll their own markup
 * conventions.
 */

/** A blank string is the marker for "render a divider here instead of a
 *  text line" - sendUiTextRows checks for exact equality with "". */
export const DIVIDER_LINE = "";

const CENTER_PREFIX = "<<center>>";

/** Wrap a line so it renders centered (and via the dedicated centered
 *  widget, not the regular left-aligned one) instead of left-aligned -
 *  e.g. section headers like "Easy tasks: 2/8". */
export function centerLine(text: string): string {
    return `${CENTER_PREFIX}${text}`;
}

/** True if a line was wrapped with centerLine(). */
export function isCenteredLine(text: string): boolean {
    return text.startsWith(CENTER_PREFIX);
}

/** Strip the centerLine() marker back off, for display. */
export function stripCenterPrefix(text: string): string {
    return isCenteredLine(text) ? text.slice(CENTER_PREFIX.length) : text;
}

/** Wrap text in an OSRS inline color tag (e.g. colorText("Done", "00ff00")). */
export function colorText(text: string, hexColor: string): string {
    return `<col=${hexColor}>${text}</col>`;
}

/** Wrap text in a strikethrough tag - e.g. for a completed task/item. */
export function strikethroughText(text: string): string {
    return `<str>${text}`;
}

/** Use the renderer's lightweight bitmap bold treatment for a text run. */
export function boldText(text: string): string {
    return `<b>${text}</b>`;
}

/** Applies semantic UIKit text styling without each panel assembling tags. */
export function styleText(
    text: string,
    style?: { color?: string; bold?: boolean; strikethrough?: boolean },
): string {
    let result = text;
    if (style?.bold) result = boldText(result);
    if (style?.strikethrough) result = `<str>${result}</str>`;
    if (style?.color) result = colorText(result, style.color);
    return result;
}

export const Colors = {
    GREEN: "0dc10d",
    YELLOW: "ffff00",
    RED: "ff0000",
    WHITE: "ffffff",
    ORANGE: "ff981f",
} as const;

/**
 * Naive word-wrap for plain text into panel-width lines. Tuned for the
 * kit's default body font/width (FONT_PLAIN_12 in a ~460px-wide column) -
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
 * (e.g. a quest's journal.ts, whose short manually-broken lines were
 * sized for the old cache interface's column width) into paragraphs that
 * fill the current, wider panel.
 *
 * Consecutive non-blank entries are joined into a single paragraph (so
 * the original hard line-breaks stop mattering) and then re-wrapped with
 * wrapTextToLines. A blank entry (DIVIDER_LINE) is preserved as-is - it's
 * the section-break marker sendUiTextRows turns into a divider, so it
 * must survive reflow untouched, and it also flushes the current
 * paragraph.
 */
export function reflowLines(lines: readonly string[], maxCharsPerLine = 62): string[] {
    const result: string[] = [];
    let buffer: string[] = [];

    const flush = () => {
        if (buffer.length === 0) return;
        result.push(...wrapTextToLines(buffer.join(" "), maxCharsPerLine));
        buffer = [];
    };

    for (const line of lines) {
        if (line === DIVIDER_LINE) {
            flush();
            result.push(DIVIDER_LINE);
        } else {
            buffer.push(line);
        }
    }
    flush();

    return result;
}
