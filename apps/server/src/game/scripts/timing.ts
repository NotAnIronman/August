import type { ScriptServices } from "@server/game/scripts/types";

const DEFAULT_TICK_DURATION_MS = 600;

/**
 * Converts real time to the tick count used by the active world. Content must
 * not read TICK_MS directly: the resolved world configuration is authoritative
 * and may have come from config.json rather than the process environment.
 *
 * The 600 ms fallback keeps lightweight script test doubles backwards
 * compatible while production always receives the injected world duration.
 */
export function secondsToTicks(
    services: Pick<ScriptServices, "system">,
    seconds: number | undefined,
): number {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 0;

    const configuredTickMs = services.system.getTickDurationMs?.();
    const tickMs =
        configuredTickMs !== undefined &&
        Number.isFinite(configuredTickMs) &&
        configuredTickMs > 0
            ? configuredTickMs
            : DEFAULT_TICK_DURATION_MS;
    return Math.max(1, Math.round((seconds * 1000) / tickMs));
}
