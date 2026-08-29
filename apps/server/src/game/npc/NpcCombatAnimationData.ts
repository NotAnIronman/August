export const NPC_COMBAT_STYLE_ANIMATION_ROLES = [
    "attack",
    "melee",
    "ranged",
    "magic",
] as const;

export const NPC_COMBAT_SINGLE_ANIMATION_ROLES = [
    "block",
    "death",
    "spawn",
] as const;

export type NpcCombatStyleAnimationRole =
    (typeof NPC_COMBAT_STYLE_ANIMATION_ROLES)[number];
export type NpcCombatSingleAnimationRole =
    (typeof NPC_COMBAT_SINGLE_ANIMATION_ROLES)[number];
export type NpcCombatAnimationRole =
    | NpcCombatStyleAnimationRole
    | NpcCombatSingleAnimationRole;

/**
 * Older definitions store a single sequence id. A reviewed style can now be
 * an array so encounters can vary repeated attacks without a second data
 * source. The loader accepts both forms indefinitely.
 */
export type NpcCombatAnimationValue = number | number[];

export interface NpcCombatAnimationData {
    attack?: NpcCombatAnimationValue;
    melee?: NpcCombatAnimationValue;
    ranged?: NpcCombatAnimationValue;
    magic?: NpcCombatAnimationValue;
    block?: NpcCombatAnimationValue;
    death?: NpcCombatAnimationValue;
    spawn?: NpcCombatAnimationValue;
    /** Legacy anonymous special slots, addressed by numeric index. */
    specials?: number[];
    /** Mechanic names mapped to one or more interchangeable sequences. */
    namedSpecials?: Record<string, NpcCombatAnimationValue>;
}

export function normalizeNpcAnimationPool(value: unknown): number[] {
    const candidates = Array.isArray(value) ? value : [value];
    const seen = new Set<number>();
    const normalized: number[] = [];
    for (const candidate of candidates) {
        if (
            typeof candidate !== "number" ||
            !Number.isFinite(candidate) ||
            candidate <= 0
        ) {
            continue;
        }
        const sequenceId = Math.trunc(candidate);
        if (sequenceId <= 0) continue;
        if (seen.has(sequenceId)) continue;
        seen.add(sequenceId);
        normalized.push(sequenceId);
    }
    return normalized;
}

export function getPrimaryNpcAnimation(value: unknown): number | undefined {
    return normalizeNpcAnimationPool(value)[0];
}

/**
 * Legacy anonymous specials are addressed by array index from encounter data.
 * Invalid/empty slots therefore have to remain placeholders; filtering them
 * would silently retarget every later `{ special: index }` reference.
 */
export function normalizeNpcLegacySpecialSlots(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value.map((candidate) => {
        if (
            typeof candidate !== "number" ||
            !Number.isFinite(candidate) ||
            candidate <= 0
        ) {
            return 0;
        }
        return Math.max(0, Math.trunc(candidate));
    });
}

export function normalizeNpcSpecialName(value: string): string | undefined {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
    return /^[a-z0-9][a-z0-9_-]{0,47}$/.test(normalized)
        ? normalized
        : undefined;
}

function appendAnimation(
    current: NpcCombatAnimationValue | undefined,
    sequenceId: number,
): NpcCombatAnimationValue {
    const pool = normalizeNpcAnimationPool(current);
    if (!pool.includes(sequenceId)) pool.push(sequenceId);
    return pool.length === 1 ? pool[0] : pool;
}

/**
 * Applies a reviewed assignment without rewriting existing data into a new
 * shape unnecessarily. Primary/block/death/spawn remain singular roles;
 * combat styles and named specials grow into de-duplicated pools.
 */
export function assignNpcCombatAnimation(
    animations: NpcCombatAnimationData,
    assignment:
        | { role: NpcCombatAnimationRole; sequenceId: number }
        | { role: "special"; sequenceId: number; name?: string },
): void {
    const sequenceId = Math.trunc(assignment.sequenceId);
    if (!Number.isFinite(assignment.sequenceId) || !(sequenceId > 0)) {
        throw new Error(`Invalid NPC animation sequence id: ${assignment.sequenceId}`);
    }

    if (assignment.role === "special") {
        const requestedSpecialName = assignment.name;
        const hasSpecialName = requestedSpecialName !== undefined;
        const specialName = requestedSpecialName !== undefined
            ? normalizeNpcSpecialName(requestedSpecialName)
            : undefined;
        if (hasSpecialName && !specialName) {
            throw new Error(`Invalid NPC special animation name: ${requestedSpecialName}`);
        }
        if (specialName) {
            animations.namedSpecials ??= {};
            animations.namedSpecials[specialName] = appendAnimation(
                animations.namedSpecials[specialName],
                sequenceId,
            );
            return;
        }
        // Numeric special references are positional legacy data. Preserve the
        // original order *and duplicates* when a reviewer appends a new slot;
        // de-duplicating this array would silently retarget an existing
        // `{ special: index }` encounter after the file is saved.
        const specials = Array.isArray(animations.specials)
            ? animations.specials.slice()
            : [];
        if (!specials.includes(sequenceId)) specials.push(sequenceId);
        animations.specials = specials;
        return;
    }

    if (
        assignment.role === "melee" ||
        assignment.role === "ranged" ||
        assignment.role === "magic"
    ) {
        animations[assignment.role] = appendAnimation(
            animations[assignment.role],
            sequenceId,
        );
        return;
    }

    animations[assignment.role] = sequenceId;
}

export function pickNpcAnimationFromPool(
    pool: readonly number[],
    selector: number = 0,
): number | undefined {
    if (pool.length === 0) return undefined;
    const normalizedSelector = Number.isFinite(selector) ? Math.trunc(selector) >>> 0 : 0;
    return pool[normalizedSelector % pool.length];
}
