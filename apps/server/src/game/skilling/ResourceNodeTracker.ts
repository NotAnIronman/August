import type {
    IResourceNodeTracker,
    TrackedNode,
    Vec2,
} from "@server/game/systems/ResourceNodeTypes";
import { buildTileKey } from "@server/game/systems/ResourceNodeTypes";

export { type Vec2, type TrackedNode, type IResourceNodeTracker, buildTileKey };

export class ResourceNodeTracker<T = unknown> implements IResourceNodeTracker<T> {
    private readonly nodes = new Map<string, TrackedNode<T>>();

    has(key: string): boolean {
        return this.nodes.has(key);
    }

    get(key: string): TrackedNode<T> | undefined {
        return this.nodes.get(key);
    }

    getByTile(tile: Vec2, level: number): TrackedNode<T> | undefined {
        return this.nodes.get(buildTileKey(tile, level));
    }

    hasTile(tile: Vec2, level: number): boolean {
        return this.nodes.has(buildTileKey(tile, level));
    }

    add(key: string, tile: Vec2, level: number, expiryTick: number, data: T): void {
        if (this.nodes.has(key)) return;
        this.nodes.set(key, { key, tile, level, expiryTick, data });
    }

    addWithRandomDuration(
        key: string,
        tile: Vec2,
        level: number,
        currentTick: number,
        durationRange: { min: number; max: number },
        data: T,
    ): void {
        if (this.nodes.has(key)) return;
        this.add(key, tile, level, currentTick + randomInRange(durationRange.min, durationRange.max), data);
    }

    remove(key: string): boolean {
        return this.nodes.delete(key);
    }

    drain(callback: (node: TrackedNode<T>) => void): void {
        const pending = Array.from(this.nodes.values());
        this.nodes.clear();
        for (const node of pending) callback(node);
    }

    processExpired(currentTick: number, callback: (node: TrackedNode<T>) => void): void {
        for (const [key, node] of this.nodes) {
            if (currentTick < node.expiryTick) continue;
            this.nodes.delete(key);
            callback(node);
        }
    }

    get size(): number {
        return this.nodes.size;
    }
}

function randomInRange(min: number, max: number): number {
    const safeMin = Number.isFinite(min) ? min : 1;
    const safeMax = Number.isFinite(max) ? max : safeMin;
    const clampedMin = Math.max(1, Math.floor(safeMin));
    const clampedMax = Math.max(clampedMin, Math.floor(safeMax));
    if (clampedMax === clampedMin) return clampedMin;
    return clampedMin + Math.floor(Math.random() * (clampedMax - clampedMin + 1));
}
