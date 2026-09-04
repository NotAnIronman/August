import type { EncounterRuntime } from "@server/game/encounters/EncounterRuntime";

export interface EncounterTimelineStep<TContext> {
    readonly id: string;
    readonly atTickOffset: number;
    readonly execute: (context: TContext) => void;
}

export interface EncounterTimelineScheduler {
    schedule(input: {
        ownerId: string;
        taskId: string;
        runAtTick: number;
        callback: () => void;
    }): string | number;
}

/**
 * Schedules an attack or phase timeline and registers every task with the encounter.
 * The server scheduler adapter remains responsible for executing and cancelling tasks.
 */
export function scheduleEncounterTimeline<TContext>(
    runtime: EncounterRuntime,
    scheduler: EncounterTimelineScheduler,
    currentTick: number,
    timelineId: string,
    steps: readonly EncounterTimelineStep<TContext>[],
    context: TContext,
): readonly (string | number)[] {
    if (!timelineId.trim()) throw new Error("Encounter timeline id cannot be empty.");
    const seenStepIds = new Set<string>();
    for (const step of steps) {
        if (!step.id.trim()) throw new Error("Encounter timeline step id cannot be empty.");
        if (seenStepIds.has(step.id)) {
            throw new Error(`Encounter timeline '${timelineId}' has duplicate step '${step.id}'.`);
        }
        seenStepIds.add(step.id);
    }
    const generation = runtime.generation;
    return [...steps]
        .sort((first, second) => first.atTickOffset - second.atTickOffset)
        .map((step) => {
            const taskId = `${runtime.id}:${timelineId}:${step.id}`;
            let scheduledId: string | number | undefined;
            let completedSynchronously = false;
            scheduledId = scheduler.schedule({
                ownerId: runtime.id,
                taskId,
                runAtTick: Math.trunc(currentTick) + Math.max(0, Math.trunc(step.atTickOffset)),
                callback: () => {
                    if (scheduledId === undefined) completedSynchronously = true;
                    else if (runtime.generation === generation) runtime.releaseTask(scheduledId);
                    if (
                        runtime.generation === generation &&
                        runtime.lifecycle !== "disposed" &&
                        runtime.lifecycle !== "dead" &&
                        runtime.lifecycle !== "resetting"
                    ) {
                        step.execute(context);
                    }
                },
            });
            if (!completedSynchronously) runtime.ownTask(scheduledId);
            return scheduledId;
        });
}
