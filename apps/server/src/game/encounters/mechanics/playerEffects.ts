import { SkillId } from "@august/osrs-engine/skill/skills";
import type { EncounterRandom } from "@server/game/encounters/EncounterRandom";
import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";
import { createInactiveMechanicHandle, type MechanicHandle } from "@server/game/encounters/mechanics/MechanicHandle";
import { registerMechanic } from "@server/game/encounters/mechanics/MechanicRegistry";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

type RandomNumber = number | ((rng: EncounterRandom) => number);

function resolve(value: RandomNumber, rng: EncounterRandom): number {
    return Math.max(0, Math.trunc(typeof value === "function" ? value(rng) : value));
}

export interface StatDrainHitParams {
    readonly target: PlayerState;
    readonly drains: readonly { skillId: SkillId; amount: RandomNumber; minimumLevel?: number }[];
}

/** Applies drains directly; a random amount requires an encounter RNG. */
export function applyStatDrains(
    target: PlayerState,
    drains: StatDrainHitParams["drains"],
    rng?: EncounterRandom,
): void {
    for (const drain of drains) {
        if (typeof drain.amount === "function" && !rng) {
            throw new Error("A randomized stat drain requires an encounter RNG.");
        }
        const skill = target.skillSystem.getSkill(drain.skillId);
        const current = skill.baseLevel + skill.boost;
        const amount = typeof drain.amount === "function"
            ? resolve(drain.amount, rng!)
            : Math.max(0, Math.trunc(drain.amount));
        target.skillSystem.setSkillBoost(
            drain.skillId,
            Math.max(Math.max(0, Math.trunc(drain.minimumLevel ?? 0)), current - amount),
        );
    }
}

/** Applies immediate encounter-owned stat drains through the player skill system. */
export function statDrainHit(
    runtime: EncounterRuntime,
    _services: ScriptServices,
    params: StatDrainHitParams,
): MechanicHandle {
    applyStatDrains(params.target, params.drains, runtime.rng);
    return createInactiveMechanicHandle(`${runtime.id}:stat-drain-hit`);
}

export interface PrayerDrainHitParams {
    readonly target: PlayerState;
    readonly amount?: RandomNumber;
    readonly fraction?: number;
    readonly minimumPrayer?: number;
}

/** Applies a fixed or percentage Prayer drain without duplicating prayer state. */
export function prayerDrainHit(
    runtime: EncounterRuntime,
    _services: ScriptServices,
    params: PrayerDrainHitParams,
): MechanicHandle {
    const prayer = params.target.skillSystem.getSkill(SkillId.Prayer);
    const current = prayer.baseLevel + prayer.boost;
    const byAmount = params.amount === undefined ? 0 : resolve(params.amount, runtime.rng);
    const byFraction = Math.floor(Math.max(0, current) * Math.max(0, params.fraction ?? 0));
    params.target.skillSystem.setSkillBoost(
        SkillId.Prayer,
        Math.max(Math.max(0, Math.trunc(params.minimumPrayer ?? 0)), current - byAmount - byFraction),
    );
    return createInactiveMechanicHandle(`${runtime.id}:prayer-drain-hit`);
}

export interface FreezeBindHitParams {
    readonly target: PlayerState;
    readonly ticks: number;
    readonly tick?: number;
}

export function freezeBindHit(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: FreezeBindHitParams,
): MechanicHandle {
    params.target.applyFreeze(Math.max(0, Math.trunc(params.ticks)), params.tick ?? services.system.getCurrentTick());
    return createInactiveMechanicHandle(`${runtime.id}:freeze-bind-hit`);
}

export interface StunHitParams {
    readonly target: PlayerState;
    readonly ticks: number;
}

export function stunHit(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: StunHitParams,
): MechanicHandle {
    services.combat.stunPlayer(params.target, Math.max(0, Math.trunc(params.ticks)));
    return createInactiveMechanicHandle(`${runtime.id}:stun-hit`);
}

export interface KnockbackParams {
    readonly target: PlayerState;
    readonly distance?: number;
    readonly tick?: number;
    readonly stunTicks?: number;
    readonly preserveNpcTarget?: boolean;
}

/** Safely moves a player away from the source NPC, preserving combat targeting when requested. */
export function knockback(
    runtime: EncounterRuntime,
    services: ScriptServices,
    params: KnockbackParams,
): MechanicHandle {
    const source = services.combat.getNpc(runtime.currentNpcRuntimeId) as NpcState | undefined;
    if (!source) return createInactiveMechanicHandle(`${runtime.id}:knockback:noop`);
    const distance = Math.max(1, Math.trunc(params.distance ?? 1));
    let dx = Math.sign(params.target.tileX - source.tileX);
    let dy = Math.sign(params.target.tileY - source.tileY);
    // Cardinal alignment must remain cardinal. Only choose an arbitrary axis
    // when both actors occupy the same origin tile.
    if (dx === 0 && dy === 0) dx = 1;
    const destination = { x: params.target.tileX + dx * distance, y: params.target.tileY + dy * distance };
    const path = services.movement.getPathService()?.findPathSteps({
        from: { x: params.target.tileX, y: params.target.tileY, plane: params.target.level },
        to: destination, size: 1, worldViewId: params.target.worldViewId,
    }, { maxSteps: distance });
    if (!path?.ok || path.steps?.at(-1)?.x !== destination.x || path.steps.at(-1)?.y !== destination.y) {
        return createInactiveMechanicHandle(`${runtime.id}:knockback:blocked`);
    }
    const startTile = { x: params.target.tileX, y: params.target.tileY };
    services.movement.teleportPlayer(params.target, destination.x, destination.y, params.target.level);
    services.movement.queueForcedMovement(params.target, {
        startTile,
        endTile: destination,
        endTick: (params.tick ?? services.system.getCurrentTick()) + 1,
    });
    if (params.preserveNpcTarget === true) {
        params.target.setCombatTarget(source);
        params.target.setInteraction("npc", source.id);
    }
    if ((params.stunTicks ?? 0) > 0) services.combat.stunPlayer(params.target, Math.trunc(params.stunTicks!));
    return createInactiveMechanicHandle(`${runtime.id}:knockback`);
}

registerMechanic("stat-drain-hit", statDrainHit);
registerMechanic("prayer-drain-hit", prayerDrainHit);
registerMechanic("freeze-bind-hit", freezeBindHit);
registerMechanic("stun-hit", stunHit);
registerMechanic("knockback", knockback);
