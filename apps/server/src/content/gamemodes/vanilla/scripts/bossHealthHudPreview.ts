import {
    normalizeBossHealth,
    type BossHealthBarMarker,
    type BossHealthBarState,
} from "@august/protocol/ui/bossHealthBar";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

const MAX_WIRE_HEALTH = 2_147_483_647;
const DEFAULT_PREVIEW_MAXIMUM = 100;
const DEFAULT_PREVIEW_NAME = "Boss HUD Preview";

const PREVIEW_MARKERS: readonly BossHealthBarMarker[] = Object.freeze([
    Object.freeze({ percent: 75, label: "Phase transition", style: "phase" as const }),
    Object.freeze({ percent: 50, label: "Mechanic gate", style: "mechanic" as const }),
    Object.freeze({ percent: 25, label: "Enrage", style: "danger" as const }),
]);

export const BOSS_HEALTH_HUD_PREVIEW_USAGE =
    "Usage: ::bosshud demo | hide | <current> [maximum] [name]. Example: ::bosshud 1 255 General Graardor";

function parseWireHealth(value: string | undefined): number | undefined {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed <= MAX_WIRE_HEALTH ? parsed : undefined;
}

/** Pure parser kept exported so the developer command's edge cases stay cheap to test. */
export function buildBossHealthHudPreview(
    args: readonly string[],
): BossHealthBarState | undefined {
    const action = args[0]?.toLowerCase();
    if (action === "hide" || action === "off" || action === "clear") {
        return { active: false };
    }
    if (action === "demo") {
        return {
            active: true,
            npcTypeId: 0,
            name: "The Warden",
            current: 725,
            maximum: 1000,
            markers: PREVIEW_MARKERS,
        };
    }

    const requestedCurrent = parseWireHealth(args[0]);
    if (requestedCurrent === undefined) return undefined;
    const hasExplicitMaximum = args[1] !== undefined;
    const requestedMaximum = hasExplicitMaximum
        ? parseWireHealth(args[1])
        : DEFAULT_PREVIEW_MAXIMUM;
    if (requestedMaximum === undefined || requestedMaximum <= 0) return undefined;

    const health = normalizeBossHealth(requestedCurrent, requestedMaximum);
    const requestedName = args.slice(hasExplicitMaximum ? 2 : 1).join(" ").trim();
    return {
        active: true,
        npcTypeId: 0,
        name: requestedName || DEFAULT_PREVIEW_NAME,
        current: health.current,
        maximum: health.maximum,
        markers: PREVIEW_MARKERS,
    };
}

export function registerBossHealthHudPreviewCommand(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registry.registerCommand(
        "bosshud",
        ({ player, args }) => {
            if (!args[0] || args[0].toLowerCase() === "help") {
                return BOSS_HEALTH_HUD_PREVIEW_USAGE;
            }
            const state = buildBossHealthHudPreview(args);
            if (!state) return BOSS_HEALTH_HUD_PREVIEW_USAGE;

            services.dialog.queueWidgetEvent(player.id, {
                action: "set_boss_health_bar",
                ...state,
            });
            if (!state.active) return "Boss HUD preview hidden.";
            return `Boss HUD preview: ${state.current}/${state.maximum} HP (${state.name}).`;
        },
        {
            permission: "developer",
            owner: "developer:boss-health-hud-preview",
            summary: "Preview the boss health HUD without entering an encounter.",
        },
    );
}
