export type InteractionTargetType = "player" | "npc";

export const NO_INTERACTION = -1;
export const PLAYER_INDEX_OFFSET = 0x8000; // 32768
export const MAX_INTERACTION_TARGET_ID = PLAYER_INDEX_OFFSET - 1;
export const MAX_INTERACTION_INDEX = 0xffff;

export type InteractionIndex = number;

export function encodeInteractionIndex(
    targetType: InteractionTargetType,
    targetId: number,
): InteractionIndex {
    if (
        !Number.isInteger(targetId) ||
        targetId < 0 ||
        targetId > MAX_INTERACTION_TARGET_ID
    ) {
        return NO_INTERACTION;
    }
    if (targetType === "npc") {
        return targetId;
    }
    return PLAYER_INDEX_OFFSET + targetId;
}

export function encodeInteractionTarget(
    target: { type: InteractionTargetType; id: number } | null | undefined,
): InteractionIndex {
    if (!target) {
        return NO_INTERACTION;
    }
    return encodeInteractionIndex(target.type, target.id);
}

export function decodeInteractionIndex(
    index: InteractionIndex,
): { type: InteractionTargetType; id: number } | null {
    if (!isValidInteractionIndex(index)) {
        return null;
    }
    if (isNpcInteractionIndex(index)) {
        return { type: "npc", id: index };
    }
    return { type: "player", id: index - PLAYER_INDEX_OFFSET };
}

export function decodeInteractionTarget(
    index: InteractionIndex,
): { type: InteractionTargetType; id: number } | undefined {
    const decoded = decodeInteractionIndex(index);
    return decoded ?? undefined;
}

export function isValidInteractionIndex(index: InteractionIndex): boolean {
    return Number.isInteger(index) && index >= 0 && index <= MAX_INTERACTION_INDEX;
}

export function isNpcInteractionIndex(index: InteractionIndex): boolean {
    return Number.isInteger(index) && index >= 0 && index < PLAYER_INDEX_OFFSET;
}

export function isPlayerInteractionIndex(index: InteractionIndex): boolean {
    return (
        Number.isInteger(index) &&
        index >= PLAYER_INDEX_OFFSET &&
        index <= MAX_INTERACTION_INDEX
    );
}

export function clampInteractionIndex(
    index: InteractionIndex | null | undefined,
): InteractionIndex {
    if (typeof index !== "number") {
        return NO_INTERACTION;
    }
    return isValidInteractionIndex(index) ? index : NO_INTERACTION;
}

export function resolveInteractionTargetId(index: InteractionIndex): number | undefined {
    if (!isValidInteractionIndex(index)) {
        return undefined;
    }
    if (isNpcInteractionIndex(index)) {
        return index;
    }
    return index - PLAYER_INDEX_OFFSET;
}
