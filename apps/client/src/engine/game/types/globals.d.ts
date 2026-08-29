import type { GameRenderer } from "@client/engine/rendering/core/GameRenderer";
import type { OsrsClient } from "@client/engine/game/OsrsClient";

export {};

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
        __RESIZE_DEBUG__?: boolean;
        __rsWorkerPoolNonce?: number;
        osrsClient?: OsrsClient;
    }

    interface GlobalThis {
        osrsClient?: OsrsClient;
        osrsRenderer?: GameRenderer;
        DEBUG_PROJECTILE_TRACE?: boolean;
        DEBUG_PROJECTILES?: boolean;
        DEBUG_PROJECTILES_VERBOSE?: boolean;
        DEBUG_PROJECTILES_TRAJ?: boolean;
    }
}
