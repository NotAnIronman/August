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

export const Colors = {
    GREEN: "0dc10d",
    YELLOW: "ffff00",
    RED: "ff0000",
    WHITE: "ffffff",
    ORANGE: "ff981f",
} as const;
