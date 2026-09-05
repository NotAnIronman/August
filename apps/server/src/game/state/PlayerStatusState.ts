/**
 * Hitpoint and status effect fields for a player. Composed into PlayerState
 * to co-locate health-related data.
 *
 * Methods that process status effects remain on PlayerState since they
 * depend on Actor base class methods (setColorOverride, etc.) and skill accessors.
 */
export class PlayerStatusState {
    hitpointsCurrent: number = 0;
    wasAlive: boolean = true;
    onDeath?: () => void;
    nextHitpointRegenTick: number = 0;
    nextHitpointCapeRegenTick: number = 0;
    nextHitpointOverhealDecayTick: number = 0;
    lastHitpointRegenUiStartTick: number = -1;
    lastHitpointRegenUiInterval: number = -1;
    lastHitpointCapeRegenUiStartTick: number = -1;
    lastHitpointCapeRegenUiInterval: number = -1;

    poisonEffect?: PoisonEffectState;
    /** Last status sent to the native health orb (varp 102); not persistent. */
    lastHealthOrbStatus?: number;
    lastHealthOrbTimers?: string;
    poisonImmuneUntilTick = -1;
    venomImmuneUntilTick = -1;
    venomEffect?: VenomEffectState;
    diseaseEffect?: DiseaseEffectState;
    regenEffect?: RegenerationEffectState;
}

export type PoisonEffectState = {
    startedTick?: number;
    hitsSinceDecrease?: number;
    potency: number;
    nextTick: number;
    interval: number;
};

export type VenomEffectState = {
    startedTick?: number;
    stage: number;
    nextTick: number;
    interval: number;
    ramp: number;
    cap: number;
};

export type DiseaseEffectState = {
    potency: number;
    nextTick: number;
    interval: number;
};

export type RegenerationEffectState = {
    heal: number;
    remainingTicks: number;
    nextTick: number;
    interval: number;
};
