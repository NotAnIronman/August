import { SkillId } from "@august/osrs-engine/skill/skills";
import { PRAYER_RECHARGE_SOUND_ID } from "@august/osrs-engine/prayer/prayers";
import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    LocInteractionEvent,
    ScriptServices,
} from "@server/game/scripts/types";

export interface GwdAltarMessages {
    readonly cooldown: string | ((remainingTicks: number) => string);
    readonly alreadyFull: string;
    readonly restored: string;
}

export interface GwdAltarDefinition {
    readonly locId: number;
    readonly roomDefinitionId: string;
    readonly cooldownTicks?: number;
    readonly animationId?: number;
    readonly soundId?: number;
    readonly actions?: readonly string[];
    readonly messages: GwdAltarMessages;
}

export interface DefinedGwdAltar {
    interact(event: LocInteractionEvent): void;
    register(registry: IScriptRegistry): void;
}

export function formatGwdAltarCooldown(ticks: number): string {
    const seconds = Math.max(1, Math.ceil((ticks * 600) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes <= 0) return `${seconds} second${seconds === 1 ? "" : "s"}`;
    if (remainder === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

/** Defines one room-scoped, per-player GWD prayer altar cooldown. */
export function defineGwdAltar(definition: GwdAltarDefinition): DefinedGwdAltar {
    if (!Number.isInteger(definition.locId) || definition.locId <= 0) {
        throw new Error("A GWD altar requires a positive loc id.");
    }
    if (!definition.roomDefinitionId.trim()) {
        throw new Error("A GWD altar requires a room definition id.");
    }

    const cooldownTicks = Math.max(0, Math.trunc(definition.cooldownTicks ?? 500));
    const animationId = definition.animationId ?? 645;
    const soundId = definition.soundId ?? PRAYER_RECHARGE_SOUND_ID;
    const actions = definition.actions ?? Object.freeze(["pray", "pray-at"]);
    const lastUse = new WeakMap<PlayerState, number>();

    const interact = ({ player, services, tick }: LocInteractionEvent): void => {
        if (
            services.instances.get(player.id)?.definitionId !== definition.roomDefinitionId
        ) {
            return;
        }
        const readyTick = (lastUse.get(player) ?? -Infinity) + cooldownTicks;
        if (tick < readyTick) {
            const message =
                typeof definition.messages.cooldown === "function"
                    ? definition.messages.cooldown(readyTick - tick)
                    : definition.messages.cooldown;
            services.messaging.sendGameMessage(player, message);
            return;
        }

        const prayer = player.skillSystem.getSkill(SkillId.Prayer);
        if (prayer.baseLevel + prayer.boost >= prayer.baseLevel) {
            services.messaging.sendGameMessage(player, definition.messages.alreadyFull);
            return;
        }
        services.animation.playPlayerSeq(player, animationId);
        player.skillSystem.setSkillBoost(SkillId.Prayer, prayer.baseLevel);
        player.prayer.resetDrainAccumulator();
        services.sound.sendSound(player, soundId);
        lastUse.set(player, tick);
        services.messaging.sendGameMessage(player, definition.messages.restored);
    };

    const register = (registry: IScriptRegistry): void => {
        for (const action of actions) {
            registry.registerLocInteraction(definition.locId, interact, action);
        }
    };

    return Object.freeze({ interact, register });
}
