export const EQUIPMENT_STATS_GROUP_ID = 84;
/** Bank group: its worn-items panel is another equipment portrait. */
export const BANK_GROUP_ID = 12;
export const EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM = 600;
/** PlayerDesign / character creator (cache interface group 679). */
export const CHARACTER_CREATOR_GROUP_ID = 679;

/**
 *Render player in character creator
 */
export const CHARACTER_CREATOR_PLAYER_MODEL_MAX_ZOOM = 450;
export const CHARACTER_CREATOR_PLAYER_MODEL_OFFSET_Y = 180;
/** Cache/default human standing sequence used before the local BAS is ready. */
export const DEFAULT_PLAYER_IDLE_SEQUENCE_ID = 808;

/**
 * Widget groups whose contentType=328 model widget is a static portrait of
 * the local player rather than another view of the live combat actor, keyed
 * to their max camera zoom.
 */
const PORTRAIT_PLAYER_MODEL_MAX_ZOOM: Readonly<Record<number, number>> = {
    [EQUIPMENT_STATS_GROUP_ID]: EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
    [BANK_GROUP_ID]: EQUIPMENT_STATS_PLAYER_MODEL_MAX_ZOOM,
    [CHARACTER_CREATOR_GROUP_ID]: CHARACTER_CREATOR_PLAYER_MODEL_MAX_ZOOM,
};

/**
 * Per-group vertical offset override for the same portrait widgets. Groups
 * absent from this map keep whatever offsetY the cache widget/CS2 script
 * already configured (e.g. equipment stats, whose framing wasn't reported
 * as off).
 */
const PORTRAIT_PLAYER_MODEL_OFFSET_Y: Readonly<Partial<Record<number, number>>> = {
    [CHARACTER_CREATOR_GROUP_ID]: CHARACTER_CREATOR_PLAYER_MODEL_OFFSET_Y,
};

export interface PlayerModelPresentationInput {
    groupId: number;
    contentType: number;
    configuredSequenceId?: number;
    configuredZoom: number;
    configuredOffsetY?: number;
    modelFrame: number;
    idleSequenceId?: number;
    movementSequenceId?: number;
    movementFrame?: number;
}

export interface PlayerModelPresentation {
    sequenceId?: number;
    sequenceFrame: number;
    zoom: number;
    offsetY: number;
}

/**
 * Some interfaces (equipment stats, the PlayerDesign character creator) show
 * a portrait of the local player, not another view of the live combat actor.
 * Their cache widgets can retain a stale block/action/walk sequence; always
 * present the player at the normal idle stance and cap camera distance so
 * the full-body model remains readable.
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
    const configuredOffsetY = Math.trunc(input.configuredOffsetY ?? 0);

    const portraitMaxZoom =
        input.contentType === 328
            ? PORTRAIT_PLAYER_MODEL_MAX_ZOOM[input.groupId]
            : undefined;
    if (portraitMaxZoom !== undefined) {
        const portraitIdleSequenceId =
            idleSequenceId ?? DEFAULT_PLAYER_IDLE_SEQUENCE_ID;
        return {
            sequenceId: portraitIdleSequenceId,
            sequenceFrame:
                movementSequenceId === portraitIdleSequenceId
                    ? movementFrame
                    : 0,
            zoom: Math.min(zoom, portraitMaxZoom),
            offsetY: PORTRAIT_PLAYER_MODEL_OFFSET_Y[input.groupId] ?? configuredOffsetY,
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
        offsetY: configuredOffsetY,
    };
}
