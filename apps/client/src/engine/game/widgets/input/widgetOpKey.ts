import type { WidgetNode } from "@client/ui/widgets/WidgetNode";

/** CS2 key pairs contain an OSRS key code and a modifier mask, not a character. */
export function resolveWidgetOpKey(
    widget: Pick<WidgetNode, "opKeys">,
    key: number,
    isHeld: (keyCode: number) => boolean,
): number | undefined {
    if (key < 0) return undefined;
    const shift = isHeld(81), ctrl = isHeld(82), alt = isHeld(86);
    for (let index = 0; index < Math.min(widget.opKeys?.length ?? 0, 10); index++) {
        const binding = widget.opKeys?.[index];
        if (!binding) continue;
        for (let pair = 0; pair < binding.keyChars.length; pair++) {
            if (binding.keyChars[pair] !== key) continue;
            const modifiers = binding.keyCodes[pair] ?? 0;
            if ((modifiers & 1) && !alt) continue;
            if ((modifiers & 2) && !ctrl) continue;
            if ((modifiers & 4) && !shift) continue;
            if ((modifiers & 8) && (shift || ctrl || alt)) continue;
            return index + 1;
        }
    }
    return undefined;
}
