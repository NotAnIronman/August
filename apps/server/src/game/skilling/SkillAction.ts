import type { ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export interface SkillActionPolicy {
    readonly kind: `skill.${string}`;
    readonly delayTicks: number;
    readonly cooldownTicks: number;
    readonly groups: readonly string[];
}

export function defineSkillAction(
    name: string,
    timing: { delayTicks: number; cooldownTicks?: number; groups?: readonly string[] },
): SkillActionPolicy {
    const logicalName = name.trim().replace(/^skill\./, "");
    if (!logicalName) throw new Error("A skill action requires a logical name.");
    const kind = `skill.${logicalName}` as const;
    const delayTicks = timing.delayTicks;
    const cooldownTicks = timing.cooldownTicks ?? delayTicks;
    if (!Number.isInteger(delayTicks) || delayTicks < 0) {
        throw new RangeError("Skill action delayTicks must be a non-negative integer.");
    }
    if (!Number.isInteger(cooldownTicks) || cooldownTicks < 0) {
        throw new RangeError("Skill action cooldownTicks must be a non-negative integer.");
    }
    // The action kind is always a conflict group. Extra broad groups may add
    // cross-action exclusion but must never replace same-kind serialization.
    const groups = Array.from(new Set([kind, ...(timing.groups ?? [])]));
    return Object.freeze({ kind, delayTicks, cooldownTicks, groups: Object.freeze(groups) });
}

export function requestSkillAction(
    services: ScriptServices,
    player: PlayerState,
    policy: SkillActionPolicy,
    data: unknown,
    tick: number | undefined,
): boolean {
    return services.combat.requestAction(
        player,
        {
            kind: policy.kind,
            data,
            delayTicks: policy.delayTicks,
            cooldownTicks: policy.cooldownTicks,
            groups: [...policy.groups],
        },
        Number.isFinite(tick) ? (tick as number) : services.system.getCurrentTick(),
    ).ok;
}

export function repeatSkillAction(
    services: ScriptServices,
    player: PlayerState,
    policy: SkillActionPolicy,
    data: unknown,
    tick: number,
): boolean {
    return !!services.combat.scheduleAction(
        player.id,
        {
            kind: policy.kind,
            data,
            delayTicks: policy.delayTicks,
            cooldownTicks: policy.cooldownTicks,
            groups: [...policy.groups],
        },
        tick,
    )?.ok;
}

export function skillActionResult(
    policy: SkillActionPolicy,
    effects: ActionExecutionResult["effects"],
): ActionExecutionResult {
    return {
        ok: true,
        cooldownTicks: policy.cooldownTicks,
        groups: [...policy.groups],
        effects,
    };
}
