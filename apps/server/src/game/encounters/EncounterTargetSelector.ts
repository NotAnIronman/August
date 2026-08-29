import { EncounterRandom } from "@server/game/encounters/EncounterRandom";

export type EncounterTargetPolicy =
    | "current"
    | "nearest"
    | "farthest"
    | "highest-threat"
    | "lowest-health"
    | "random";

export interface EncounterTargetCandidate {
    readonly id: number;
    readonly distance: number;
    readonly healthCurrent: number;
    readonly healthMax: number;
    readonly threat?: number;
    readonly isCurrentTarget?: boolean;
}

export function selectEncounterTargets(
    candidates: readonly EncounterTargetCandidate[],
    policy: EncounterTargetPolicy,
    count = 1,
    random = new EncounterRandom(1),
): readonly EncounterTargetCandidate[] {
    const limit = Math.max(0, Math.trunc(count));
    if (limit === 0 || candidates.length === 0) return [];
    const ranked = [...candidates];
    switch (policy) {
        case "current":
            ranked.sort((first, second) =>
                compareBoolean(second.isCurrentTarget, first.isCurrentTarget) ||
                compareNumber(first.distance, second.distance) ||
                first.id - second.id,
            );
            break;
        case "nearest":
            ranked.sort(
                (first, second) =>
                    compareNumber(first.distance, second.distance) || first.id - second.id,
            );
            break;
        case "farthest":
            ranked.sort(
                (first, second) =>
                    compareNumber(second.distance, first.distance) || first.id - second.id,
            );
            break;
        case "highest-threat":
            ranked.sort(
                (first, second) =>
                    compareNumber(second.threat ?? 0, first.threat ?? 0) || first.id - second.id,
            );
            break;
        case "lowest-health":
            ranked.sort((first, second) => {
                const firstRatio = first.healthCurrent / Math.max(1, first.healthMax);
                const secondRatio = second.healthCurrent / Math.max(1, second.healthMax);
                return compareNumber(firstRatio, secondRatio) || first.id - second.id;
            });
            break;
        case "random":
            for (let index = ranked.length - 1; index > 0; index--) {
                const swapIndex = Math.floor(random.next() * (index + 1));
                [ranked[index], ranked[swapIndex]] = [ranked[swapIndex]!, ranked[index]!];
            }
            break;
    }
    return ranked.slice(0, limit);
}

function compareNumber(first: number, second: number): number {
    return first < second ? -1 : first > second ? 1 : 0;
}

function compareBoolean(first: boolean | undefined, second: boolean | undefined): number {
    return Number(!!first) - Number(!!second);
}

