import type { SkillActionPolicy } from "@server/game/skilling/SkillAction";
import {
    defineSkillAction,
    repeatSkillAction,
    requestSkillAction,
} from "@server/game/skilling/SkillAction";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export interface LinearGatheringRoll<Resource, Tool> {
    kind: "linear-255";
    low: (resource: Resource, tool: Tool) => number;
    ratio: (resource: Resource, tool: Tool) => number;
}

export interface CustomGatheringRoll<Resource, Tool> {
    kind: "custom";
    roll: (level: number, resource: Resource, tool: Tool, random: () => number) => boolean;
}

export type GatheringSuccessPolicy<Resource, Tool> =
    | LinearGatheringRoll<Resource, Tool>
    | CustomGatheringRoll<Resource, Tool>;

export interface GatheringSkillDefinition<Resource, Tool, State = undefined> {
    name: string;
    timing: { delayTicks: number; cooldownTicks?: number; groups?: readonly string[] };
    success: GatheringSuccessPolicy<Resource, Tool>;
    depletion?: {
        chance: (resource: Resource, state: State) => number;
    };
    respawn?: {
        duration: (resource: Resource) => { min: number; max: number };
    };
}

export interface GatheringActionTiming {
    delayTicks?: number;
    cooldownTicks?: number;
    groups?: readonly string[];
}

export interface DefinedGatheringSkill<Resource, Tool, State = undefined> {
    action(timing?: GatheringActionTiming): SkillActionPolicy;
    request(
        services: ScriptServices,
        player: PlayerState,
        data: unknown,
        tick?: number,
        timing?: GatheringActionTiming,
    ): boolean;
    repeat(
        services: ScriptServices,
        player: PlayerState,
        data: unknown,
        tick: number,
        timing?: GatheringActionTiming,
    ): boolean;
    rollSuccess(level: number, resource: Resource, tool: Tool, random?: () => number): boolean;
    rollDepletion(resource: Resource, state: State, random?: () => number): boolean;
    respawnDuration(resource: Resource): { min: number; max: number } | undefined;
}

/** Data-oriented policy shared by gathering handlers; world-specific effects stay in content. */
export function defineGatheringSkill<Resource, Tool, State = undefined>(
    definition: GatheringSkillDefinition<Resource, Tool, State>,
): DefinedGatheringSkill<Resource, Tool, State> {
    const policies = new Map<string, SkillActionPolicy>();
    const action = (timing: GatheringActionTiming = {}): SkillActionPolicy => {
        const delayTicks = timing.delayTicks ?? definition.timing.delayTicks;
        const cooldownTicks =
            timing.cooldownTicks ??
            definition.timing.cooldownTicks ??
            timing.delayTicks ??
            definition.timing.delayTicks;
        const groups = timing.groups ?? definition.timing.groups;
        const key = `${delayTicks}:${cooldownTicks}:${groups?.join("\u0000") ?? ""}`;
        let policy = policies.get(key);
        if (!policy) {
            policy = defineSkillAction(definition.name, {
                delayTicks,
                cooldownTicks,
                groups,
            });
            policies.set(key, policy);
        }
        return policy;
    };

    return Object.freeze({
        action,
        request(
            services: ScriptServices,
            player: PlayerState,
            data: unknown,
            tick?: number,
            timing?: GatheringActionTiming,
        ): boolean {
            return requestSkillAction(services, player, action(timing), data, tick);
        },
        repeat(
            services: ScriptServices,
            player: PlayerState,
            data: unknown,
            tick: number,
            timing?: GatheringActionTiming,
        ): boolean {
            return repeatSkillAction(services, player, action(timing), data, tick);
        },
        rollSuccess(
            level: number,
            resource: Resource,
            tool: Tool,
            random: () => number = Math.random,
        ): boolean {
            if (definition.success.kind === "custom") {
                return definition.success.roll(level, resource, tool, random);
            }
            const low = definition.success.low(resource, tool);
            const high = low * definition.success.ratio(resource, tool);
            const clampedLevel = Math.min(99, Math.max(1, Math.floor(level)));
            const numerator =
                Math.floor(
                    (low * (99 - clampedLevel)) / 98 +
                        (high * (clampedLevel - 1)) / 98,
                ) + 1;
            return random() * 255 < Math.min(255, Math.max(1, numerator));
        },
        rollDepletion(
            resource: Resource,
            state: State,
            random: () => number = Math.random,
        ): boolean {
            const chance = definition.depletion?.chance(resource, state) ?? 0;
            return chance >= 1 || (chance > 0 && random() < chance);
        },
        respawnDuration(resource: Resource): { min: number; max: number } | undefined {
            const duration = definition.respawn?.duration(resource);
            if (!duration) return undefined;
            const min = Math.max(1, Math.trunc(duration.min));
            return { min, max: Math.max(min, Math.trunc(duration.max)) };
        },
    });
}

export interface WeightedResult {
    weight: number;
}

export function pickWeighted<T extends WeightedResult>(
    entries: readonly T[],
    random: () => number = Math.random,
): T | undefined {
    if (entries.length === 0) return undefined;
    const weights = entries.map((entry) =>
        Number.isFinite(entry.weight) ? Math.max(0, entry.weight) : 0,
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!(total > 0)) return undefined;
    let roll = random() * total;
    for (let index = 0; index < entries.length; index += 1) {
        roll -= weights[index]!;
        if (roll < 0) return entries[index];
    }
    return entries[entries.length - 1];
}
