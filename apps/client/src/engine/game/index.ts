/**
 * Client Module - Core client state and visual components
 */

export {
    ClientState,
    clientState,
    MOUSE_CROSS_NONE,
    MOUSE_CROSS_RED,
    MOUSE_CROSS_YELLOW,
} from "@client/engine/game/ClientState";
export type { ClientEntity } from "@client/engine/game/ClientState";

export {
    renderMouseCross,
    getMouseCrossStyle,
    getMouseCrossColor,
    shouldRenderMouseCross,
} from "@client/engine/game/MouseCross";

export {
    shouldRenderDestinationMarker,
    getDestinationLocal,
    getDestinationWorld,
    tileToScreen,
    renderDestinationFlag,
    clearDestinationMarker,
    setDestinationMarker,
    getDestinationMarkerStyle,
    getDestinationMarkerState,
} from "@client/engine/game/DestinationMarker";
export type { DestinationMarkerState } from "@client/engine/game/DestinationMarker";
