import {
    GroundItemStackMessage,
    GroundItemsServerPayload,
} from "@client/core/network/ServerConnection";

export type ClientGroundItemStack = GroundItemStackMessage & {
    name: string;
    /** Authoritative server display value for one item. */
    value: number;
    /** Authoritative server high-alchemy value for one item. */
    highAlch: number;
    gePrice: number;
    haPrice: number;
    tradeable: boolean;
    stackable: boolean;
    noted: boolean;
    unnotedItemId?: number;
    /**
     * Server stack ids represented by this display pile. The first id is the
     * authoritative stack used for interactions; the server still decides how
     * many physical items can be picked up.
     */
    sourceStackIds?: readonly number[];
};

export type GroundItemOverlayEntry = {
    tileX: number;
    tileY: number;
    level: number;
    label: string;
    color?: number;
    timerLabel?: string;
    timerColor?: number;
    /** Draw a crisp one-pixel black outline around both label color segments. */
    textOutline?: boolean;
    line?: number;
    heightOffsetTiles?: number;
};

export type GroundItemMetadata = {
    name: string;
    gePrice: number;
    haPrice: number;
    tradeable: boolean;
    stackable?: boolean;
    noted?: boolean;
    unnotedItemId?: number;
};

type ResolveMetadata = (itemId: number) => GroundItemMetadata;

const DEFAULT_METADATA_RESOLVER: ResolveMetadata = (itemId: number) => ({
    name: `Item ${itemId | 0}`,
    gePrice: 0,
    haPrice: 0,
    tradeable: false,
    stackable: false,
    noted: false,
    unnotedItemId: itemId > 0 ? itemId | 0 : undefined,
});

export class GroundItemStore {
    private stacksByTile = new Map<string, ClientGroundItemStack[]>();
    private stacksById = new Map<number, ClientGroundItemStack>();
    private listeners = new Set<() => void>();
    private resolveMetadata: ResolveMetadata = DEFAULT_METADATA_RESOLVER;
    private version = 0;

    private normalizeStack(stack: GroundItemStackMessage): ClientGroundItemStack | undefined {
        if (!stack || !(stack.id > 0) || !(stack.itemId > 0)) return undefined;
        const tile = stack.tile ? stack.tile : { x: 0, y: 0, level: 0 };
        const metadata = this.resolveMetadata(stack.itemId | 0);
        const name =
            typeof stack.name === "string" && stack.name.length > 0
                ? stack.name
                : typeof metadata.name === "string" && metadata.name.length > 0
                  ? metadata.name
                  : `Item ${stack.itemId | 0}`;
        const value =
            Number.isFinite(stack.value) && (stack.value as number) >= 0
                ? Math.min(2_147_483_647, Math.trunc(stack.value as number))
                : Math.max(0, metadata.gePrice | 0);
        const highAlch =
            Number.isFinite(stack.highAlch) && (stack.highAlch as number) >= 0
                ? Math.min(2_147_483_647, Math.trunc(stack.highAlch as number))
                : Math.max(0, metadata.haPrice | 0);
        const tradeable =
            typeof stack.tradeable === "boolean"
                ? stack.tradeable
                : metadata.tradeable === true;
        const stackable =
            typeof stack.stackable === "boolean"
                ? stack.stackable
                : metadata.stackable === true;
        const noted =
            typeof stack.noted === "boolean" ? stack.noted : metadata.noted === true;
        const wireUnnotedId =
            Number.isFinite(stack.unnotedItemId) && (stack.unnotedItemId as number) > 0
                ? Math.trunc(stack.unnotedItemId as number)
                : undefined;
        const fallbackUnnotedId =
            Number.isFinite(metadata.unnotedItemId) && (metadata.unnotedItemId as number) > 0
                ? Math.trunc(metadata.unnotedItemId as number)
                : undefined;
        return {
            id: stack.id | 0,
            itemId: stack.itemId | 0,
            quantity: Math.max(1, stack.quantity | 0),
            tile: { x: tile.x | 0, y: tile.y | 0, level: tile.level | 0 },
            createdTick:
                Number.isFinite(stack.createdTick) && (stack.createdTick as number) >= 0
                    ? (stack.createdTick as number) | 0
                    : undefined,
            privateUntilTick:
                Number.isFinite(stack.privateUntilTick) && (stack.privateUntilTick as number) > 0
                    ? (stack.privateUntilTick as number) | 0
                    : undefined,
            expiresTick:
                Number.isFinite(stack.expiresTick) && (stack.expiresTick as number) > 0
                    ? (stack.expiresTick as number) | 0
                    : undefined,
            ownerId:
                Number.isFinite(stack.ownerId) && (stack.ownerId as number) >= 0
                    ? (stack.ownerId as number) | 0
                    : undefined,
            isPrivate: stack.isPrivate === true,
            ownership:
                stack.ownership === 0 ||
                stack.ownership === 1 ||
                stack.ownership === 2 ||
                stack.ownership === 3
                    ? stack.ownership
                    : 0,
            name,
            value,
            highAlch,
            gePrice: value,
            haPrice: highAlch,
            tradeable,
            stackable,
            noted,
            unnotedItemId: wireUnnotedId ?? fallbackUnnotedId,
        };
    }

    private removeEntry(entry: ClientGroundItemStack): void {
        const key = this.tileKey(entry.tile.x | 0, entry.tile.y | 0, entry.tile.level | 0);
        const list = this.stacksByTile.get(key);
        if (!list) return;
        const next = list.filter((stack) => (stack.id | 0) !== (entry.id | 0));
        if (next.length > 0) this.stacksByTile.set(key, next);
        else this.stacksByTile.delete(key);
    }

    private upsertEntry(entry: ClientGroundItemStack): void {
        const existing = this.stacksById.get(entry.id | 0);
        if (existing) {
            this.removeEntry(existing);
        }
        const key = this.tileKey(entry.tile.x | 0, entry.tile.y | 0, entry.tile.level | 0);
        const list = this.stacksByTile.get(key);
        if (list) list.push(entry);
        else this.stacksByTile.set(key, [entry]);
        this.stacksById.set(entry.id | 0, entry);
    }

    /**
     * Collapse identical records into one display pile without modifying the
     * authoritative records held in stacksById. Ownership remains part of the
     * key so account-mode filtering cannot accidentally make another player's
     * items appear takeable.
     */
    private aggregateDisplayStacks(
        stacks: readonly ClientGroundItemStack[],
    ): ClientGroundItemStack[] {
        const groups = new Map<string, ClientGroundItemStack[]>();
        for (const stack of stacks) {
            const ownership = Number.isFinite(stack.ownership) ? (stack.ownership as number) | 0 : 0;
            const key = `${stack.itemId | 0}|${ownership}`;
            const group = groups.get(key);
            if (group) group.push(stack);
            else groups.set(key, [stack]);
        }

        const result: ClientGroundItemStack[] = [];
        for (const group of groups.values()) {
            // Let the soonest-despawning record own the menu action. This keeps
            // repeated clicks deterministic while individual server timers are
            // preserved behind the display pile.
            const ordered = [...group].sort((a, b) => {
                const expiresA = Number.isFinite(a.expiresTick)
                    ? (a.expiresTick as number)
                    : Number.POSITIVE_INFINITY;
                const expiresB = Number.isFinite(b.expiresTick)
                    ? (b.expiresTick as number)
                    : Number.POSITIVE_INFINITY;
                if (expiresA !== expiresB) return expiresA - expiresB;
                const createdA = Number.isFinite(a.createdTick) ? (a.createdTick as number) : 0;
                const createdB = Number.isFinite(b.createdTick) ? (b.createdTick as number) : 0;
                if (createdA !== createdB) return createdA - createdB;
                return (a.id | 0) - (b.id | 0);
            });
            const representative = ordered[0];
            let quantity = 0;
            for (const stack of ordered) {
                quantity = Math.min(2_147_483_647, quantity + Math.max(1, stack.quantity | 0));
            }
            result.push({
                ...representative,
                quantity,
                tile: { ...representative.tile },
                sourceStackIds: Object.freeze(ordered.map((stack) => stack.id | 0)),
            });
        }
        return result;
    }

    update(payload: GroundItemsServerPayload | undefined): void {
        if (!payload) {
            this.stacksByTile.clear();
            this.stacksById.clear();
            this.notify();
            return;
        }
        if (payload.kind === "snapshot") {
            this.stacksByTile.clear();
            this.stacksById.clear();
            for (const stack of payload.stacks) {
                const entry = this.normalizeStack(stack);
                if (!entry) continue;
                this.upsertEntry(entry);
            }
            this.notify();
            return;
        }

        const removes = Array.isArray(payload.removes) ? payload.removes : [];
        for (const stackId of removes) {
            const existing = this.stacksById.get(stackId | 0);
            if (!existing) continue;
            this.removeEntry(existing);
            this.stacksById.delete(stackId | 0);
        }
        const upserts = Array.isArray(payload.upserts) ? payload.upserts : [];
        for (const stack of upserts) {
            const entry = this.normalizeStack(stack);
            if (!entry) continue;
            this.upsertEntry(entry);
        }
        this.notify();
    }

    setMetadataResolver(fn?: ResolveMetadata): void {
        this.resolveMetadata = fn ? fn : DEFAULT_METADATA_RESOLVER;
    }

    setNameResolver(fn?: (itemId: number) => string): void {
        if (!fn) {
            this.resolveMetadata = DEFAULT_METADATA_RESOLVER;
            return;
        }
        this.resolveMetadata = (itemId: number) => ({
            ...DEFAULT_METADATA_RESOLVER(itemId),
            name: fn(itemId),
        });
    }

    /**
     * Clear all ground items - used on disconnect/logout.
     */
    clear(): void {
        this.stacksByTile.clear();
        this.stacksById.clear();
        this.notify();
    }

    subscribe(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    getVersion(): number {
        return this.version | 0;
    }

    getStacksAt(
        tileX: number,
        tileY: number,
        level: number,
        opts: { aggregate?: boolean } = {},
    ): ClientGroundItemStack[] {
        const key = this.tileKey(tileX | 0, tileY | 0, level | 0);
        const list = this.stacksByTile.get(key);
        if (!list || list.length === 0) return [];
        if (opts.aggregate !== false) return this.aggregateDisplayStacks(list);
        return list.map((entry) => ({ ...entry, tile: { ...entry.tile } }));
    }

    getStackById(stackId: number): ClientGroundItemStack | undefined {
        const entry = this.stacksById.get(stackId | 0);
        if (!entry) return undefined;
        return { ...entry, tile: { ...entry.tile } };
    }

    getAllStacks(): ClientGroundItemStack[] {
        const result: ClientGroundItemStack[] = [];
        for (const list of this.stacksByTile.values()) {
            result.push(...this.aggregateDisplayStacks(list));
        }
        return result;
    }

    getStacksInRadius(
        centerX: number,
        centerY: number,
        level: number,
        opts: { radius?: number; maxEntries?: number } = {},
    ): ClientGroundItemStack[] {
        const radius = Math.max(1, typeof opts.radius === "number" ? opts.radius : 12);
        const maxEntries = Math.max(1, typeof opts.maxEntries === "number" ? opts.maxEntries : 512);
        const result: ClientGroundItemStack[] = [];

        for (const [key, stacks] of this.stacksByTile.entries()) {
            if (!stacks || stacks.length === 0) continue;
            const [lvlStr, xStr, yStr] = key.split("|");
            const lvl = Number(lvlStr) | 0;
            if (lvl !== (level | 0)) continue;

            const tileX = Number(xStr) | 0;
            const tileY = Number(yStr) | 0;
            const dx = Math.abs(tileX - (centerX | 0));
            const dy = Math.abs(tileY - (centerY | 0));
            if (Math.max(dx, dy) > radius) continue;

            for (const stack of this.aggregateDisplayStacks(stacks)) {
                result.push(stack);
                if (result.length >= maxEntries) {
                    return result;
                }
            }
        }

        return result;
    }

    getOverlayEntries(
        centerX: number,
        centerY: number,
        level: number,
        opts: { radius?: number; maxEntries?: number } = {},
    ): GroundItemOverlayEntry[] {
        const radius = Math.max(1, typeof opts.radius === "number" ? opts.radius : 12);
        const maxEntries = Math.max(1, typeof opts.maxEntries === "number" ? opts.maxEntries : 40);
        const entries: GroundItemOverlayEntry[] = [];
        const visited = new Set<string>();
        for (const [key, stacks] of this.stacksByTile.entries()) {
            if (!stacks || stacks.length === 0) continue;
            const [lvlStr, xStr, yStr] = key.split("|");
            const lvl = Number(lvlStr) | 0;
            if (lvl !== (level | 0)) continue;
            const tileX = Number(xStr) | 0;
            const tileY = Number(yStr) | 0;
            const dx = Math.abs(tileX - (centerX | 0));
            const dy = Math.abs(tileY - (centerY | 0));
            if (Math.max(dx, dy) > radius) continue;
            for (const stack of this.aggregateDisplayStacks(stacks)) {
                const label = stack.quantity > 1 ? `${stack.name} x ${stack.quantity}` : stack.name;
                const entryKey = `${stack.id}`;
                if (visited.has(entryKey)) continue;
                visited.add(entryKey);
                entries.push({
                    tileX,
                    tileY,
                    level: lvl,
                    label,
                });
                if (entries.length >= maxEntries) return entries;
            }
        }
        return entries;
    }

    private tileKey(x: number, y: number, level: number): string {
        return `${level}|${x}|${y}`;
    }

    private notify(): void {
        this.version = (this.version + 1) | 0;
        for (const cb of this.listeners) {
            try {
                cb();
            } catch (err) {
                console.log("ground item listener error", err);
            }
        }
    }
}
