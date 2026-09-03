/**
 * Small Map-compatible least-recently-used cache.
 *
 * Keeping the Map API lets loaders expose their caches for diagnostics while
 * preventing a long-running client from retaining every asset it has ever
 * visited. A non-finite capacity deliberately falls back to one entry rather
 * than silently becoming unbounded.
 */
export class BoundedLruCache<K, V> extends Map<K, V> {
    readonly capacity: number;

    constructor(capacity: number) {
        super();
        this.capacity = Math.max(1, Math.floor(Number.isFinite(capacity) ? capacity : 1));
    }

    override get(key: K): V | undefined {
        if (!super.has(key)) return undefined;
        const value = super.get(key) as V;
        super.delete(key);
        super.set(key, value);
        return value;
    }

    override set(key: K, value: V): this {
        if (super.has(key)) {
            super.delete(key);
        }
        super.set(key, value);
        while (this.size > this.capacity) {
            const oldest = this.keys().next();
            if (oldest.done) break;
            super.delete(oldest.value);
        }
        return this;
    }
}
