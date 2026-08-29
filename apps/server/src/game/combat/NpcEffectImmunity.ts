export type NpcEffectType =
    | "poison"
    | "venom"
    | "disease"
    | "burn"
    | "freeze"
    | "bind"
    | "stun"
    | "knockback"
    | "stat-drain";

export type NpcEffectImmunityProfile = Readonly<Partial<Record<NpcEffectType, boolean>>>;

const EMPTY_PROFILE: NpcEffectImmunityProfile = Object.freeze({});

/**
 * Canonical data-level immunities that apply wherever an NPC is spawned.
 * Encounter definitions and explicit spawn data may extend or override these.
 */
const BASE_IMMUNITIES_BY_NPC_TYPE = new Map<number, NpcEffectImmunityProfile>([
    [2042, Object.freeze({ poison: true, venom: true })], // Zulrah forms
    [2043, Object.freeze({ poison: true, venom: true })],
    [2044, Object.freeze({ poison: true, venom: true })],
    [7937, Object.freeze({ poison: true, venom: true })], // Vorkath
    [239, Object.freeze({ poison: true })], // King Black Dragon
    [3129, Object.freeze({ poison: true, venom: true })], // K'ril Tsutsaroth
    [963, Object.freeze({ poison: true })], // Kalphite workers
    [959, Object.freeze({ poison: true })], // Kalphite soldiers
    [960, Object.freeze({ poison: true })], // Kalphite guardians
    [2, Object.freeze({ poison: true })], // Aberrant spectre
]);

export function getBaseNpcEffectImmunities(npcTypeId: number): NpcEffectImmunityProfile {
    return BASE_IMMUNITIES_BY_NPC_TYPE.get(Math.trunc(npcTypeId)) ?? EMPTY_PROFILE;
}

export function mergeNpcEffectImmunities(
    ...profiles: readonly (NpcEffectImmunityProfile | undefined)[]
): NpcEffectImmunityProfile {
    return Object.freeze(Object.assign({}, ...profiles.filter(Boolean)));
}
