import type { ServerServices } from "@server/game/ServerServices";
import type { IResourceNodeTracker, TrackedNode } from "@server/game/systems/ResourceNodeTypes";
import { logger } from "@server/observability/logger";

export interface GatheringSystemServices {
    emitLocChange: (
        oldId: number,
        newId: number,
        tile: { x: number; y: number },
        level: number,
        opts?: { newShape?: number; newRotation?: number },
    ) => void;
    spawnGroundItem: (
        itemId: number,
        quantity: number,
        tile: { x: number; y: number; level: number },
        currentTick: number,
        opts?: { ownerId?: number; durationTicks?: number; privateTicks?: number },
    ) => void;
}

export type TrackerExpireCallback<T = unknown> = (
    node: TrackedNode<T>,
    services: GatheringSystemServices,
) => void;

interface RegisteredTracker {
    tracker: IResourceNodeTracker<any>;
    onExpire: TrackerExpireCallback<any>;
    onDispose: TrackerExpireCallback<any>;
}

export class GatheringSystemManager {
    private registeredTrackers = new Map<string, RegisteredTracker>();

    constructor(private readonly svc: ServerServices) {}

    registerTracker<T>(
        name: string,
        tracker: IResourceNodeTracker<T>,
        onExpire: TrackerExpireCallback<T>,
        options?: { onDispose?: TrackerExpireCallback<T> },
    ): () => void {
        const previous = this.registeredTrackers.get(name);
        if (previous && previous.tracker !== tracker) this.restoreAndDrain(previous);
        const registration: RegisteredTracker = {
            tracker,
            onExpire,
            onDispose: options?.onDispose ?? onExpire,
        };
        this.registeredTrackers.set(name, registration);
        let registered = true;
        return () => {
            if (!registered) return;
            registered = false;
            const current = this.registeredTrackers.get(name);
            if (current !== registration) return;
            this.registeredTrackers.delete(name);
            this.restoreAndDrain(current);
        };
    }

    getTracker<T = unknown>(name: string): IResourceNodeTracker<T> | undefined {
        return this.registeredTrackers.get(name)?.tracker as IResourceNodeTracker<T> | undefined;
    }

    processTick(tick: number): void {
        const services = this.buildServices();
        for (const registration of this.registeredTrackers.values()) {
            registration.tracker.processExpired(tick, (node) =>
                this.invokeSafely(registration.onExpire, node, services, "expire"),
            );
        }
    }

    private restoreAndDrain(registered: RegisteredTracker): void {
        const services = this.buildServices();
        registered.tracker.drain((node) =>
            this.invokeSafely(registered.onDispose, node, services, "dispose"),
        );
    }

    private invokeSafely(
        callback: TrackerExpireCallback<any>,
        node: TrackedNode<unknown>,
        services: GatheringSystemServices,
        phase: "expire" | "dispose",
    ): void {
        try {
            callback(node, services);
        } catch (error) {
            logger.warn(`[gathering] failed to ${phase} resource node ${node.key}`, error);
        }
    }

    private buildServices(): GatheringSystemServices {
        return {
            emitLocChange: (oldId, newId, tile, level, opts) =>
                this.svc.locationService.emitLocChange(oldId, newId, tile, level, opts),
            spawnGroundItem: (itemId, quantity, tile, currentTick, opts) =>
                this.svc.groundItems.spawn(itemId, quantity, tile, currentTick, opts),
        };
    }
}
