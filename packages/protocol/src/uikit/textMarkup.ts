/**
 * Shared UI text-markup helpers.
 *
 * Both the server (which assembles panel rows) and the client (which renders
 * them) use this wire-level convention. Keeping the convention in protocol
 * prevents either application from importing the other's private source.
 */

/** A blank string marks a divider row rather than a text line. */
export const DIVIDER_LINE = "";

const CENTER_PREFIX = "<<center>>";

/** Marks a line for the centered panel-row widget. */
export function centerLine(text: string): string {
    return `${CENTER_PREFIX}${text}`;
}

export function isCenteredLine(text: string): boolean {
    return text.startsWith(CENTER_PREFIX);
}

export function stripCenterPrefix(text: string): string {
    return isCenteredLine(text) ? text.slice(CENTER_PREFIX.length) : text;
}

export function colorText(text: string, hexColor: string): string {
    return `<col=${hexColor}>${text}</col>`;
}

export function strikethroughText(text: string): string {
    return `<str>${text}`;
}

export function boldText(text: string): string {
    return `<b>${text}</b>`;
}

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

/** Approximate word wrapping for the default panel body width. */
export function wrapTextToLines(text: string, maxCharsPerLine = 62): string[] {
    const paragraphs = String(text ?? "").split(/\r?\n/);
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
        let current = "";
        for (const word of words) {
            const candidate = current.length > 0 ? `${current} ${word}` : word;
            if (visibleTextLength(candidate) > maxCharsPerLine && current.length > 0) {
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

function visibleTextLength(text: string): number {
    return text.replace(/<[^>]*>/g, "").length;
}

/** Reflows hand-wrapped lines while preserving divider markers. */
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
