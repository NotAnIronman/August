export const EQUIPMENT_STATS_GROUP_ID = 84;
export const EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM = 600;
/** Cache/default human standing sequence used before the local BAS is ready. */
export const DEFAULT_PLAYER_IDLE_SEQUENCE_ID = 808;

export interface PlayerModelPresentationInput {
    groupId: number;
    contentType: number;
    configuredSequenceId?: number;
    configuredZoom: number;
    modelFrame: number;
    idleSequenceId?: number;
    movementSequenceId?: number;
    movementFrame?: number;
}

export interface PlayerModelPresentation {
    sequenceId?: number;
    sequenceFrame: number;
    zoom: number;
}

/**
 * Equipment stats is a portrait, not another view of the live combat actor.
 * Its cache widget can retain a block/action sequence; always present the
 * equipped player at the normal idle stance and cap camera distance so the
 * full-body model remains readable.
 */
export function resolvePlayerModelPresentation(
    input: PlayerModelPresentationInput,
): PlayerModelPresentation {
    const idleSequenceId =
        typeof input.idleSequenceId === "number" && input.idleSequenceId >= 0
            ? Math.trunc(input.idleSequenceId)
            : undefined;
    const movementSequenceId =
        typeof input.movementSequenceId === "number" &&
        input.movementSequenceId >= 0
            ? Math.trunc(input.movementSequenceId)
            : undefined;
    const movementFrame = Math.max(0, Math.trunc(input.movementFrame ?? 0));
    const modelFrame = Math.max(0, Math.trunc(input.modelFrame));
    const zoom = Math.max(1, Math.trunc(input.configuredZoom));

    if (
        input.groupId === EQUIPMENT_STATS_GROUP_ID &&
        input.contentType === 328
    ) {
        const equipmentIdleSequenceId =
            idleSequenceId ?? DEFAULT_PLAYER_IDLE_SEQUENCE_ID;
        return {
            sequenceId: equipmentIdleSequenceId,
            sequenceFrame:
                movementSequenceId === equipmentIdleSequenceId
                    ? movementFrame
                    : 0,
            zoom: Math.min(zoom, EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM),
        };
    }

    const configuredSequenceId =
        typeof input.configuredSequenceId === "number" &&
        input.configuredSequenceId >= 0
            ? Math.trunc(input.configuredSequenceId)
            : undefined;
    return {
        sequenceId: configuredSequenceId ?? movementSequenceId,
        sequenceFrame:
            configuredSequenceId === undefined && movementSequenceId !== undefined
                ? movementFrame
                : modelFrame,
        zoom,
    };
}
