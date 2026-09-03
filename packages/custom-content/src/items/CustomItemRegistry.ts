import type { CustomItemDefinition, RegisteredCustomItem } from "@august/custom-content/items/CustomItemTypes";

/**
 * Central registry for custom items.
 * Singleton that stores all registered custom item definitions.
 */
export class CustomItemRegistryStore {
    private readonly items = new Map<number, RegisteredCustomItem>();

    // ID range for custom items (outside cache range)
    private static readonly CUSTOM_ID_START = 50000;
    private nextCustomId = CustomItemRegistryStore.CUSTOM_ID_START;
    private registryRevision = 0;
    private maxCustomId = 0;

    /**
     * Register a custom item definition.
     * @param definition The custom item definition
     * @param module Optional module name for debugging
     */
    register(definition: CustomItemDefinition, module?: string): void {
        if (!Number.isSafeInteger(definition.id) || definition.id < 0) {
            throw new RangeError(`Invalid custom item ID: ${definition.id}`);
        }
        if (this.items.has(definition.id)) {
            console.warn(
                `[CustomItemRegistry] Overwriting existing custom item ${definition.id} (${definition.objType.name})`,
            );
        }

        const registered: RegisteredCustomItem = {
            definition,
            registeredAt: Date.now(),
            module,
        };

        this.items.set(definition.id, registered);
        this.maxCustomId = Math.max(this.maxCustomId, definition.id);
        this.registryRevision++;
    }

    /**
     * Allocate the next available custom item ID.
     */
    allocateId(): number {
        while (this.items.has(this.nextCustomId)) {
            this.nextCustomId++;
        }
        return this.nextCustomId++;
    }

    /**
     * Check if an ID has a custom item.
     */
    has(id: number): boolean {
        return this.items.has(id);
    }

    /**
     * Get a custom item definition by ID.
     */
    get(id: number): RegisteredCustomItem | undefined {
        return this.items.get(id);
    }

    /**
     * Get all registered custom items.
     */
    getAll(): IterableIterator<RegisteredCustomItem> {
        return this.items.values();
    }

    /**
     * Get all registered item IDs.
     */
    getAllIds(): IterableIterator<number> {
        return this.items.keys();
    }

    /**
     * Get total count of custom items.
     */
    getCount(): number {
        return this.items.size;
    }

    /**
     * Monotonically increasing version used by registry-backed caches.
     */
    get revision(): number {
        return this.registryRevision;
    }

    /**
     * Get the highest custom item ID in use.
     */
    getMaxCustomId(): number {
        return this.maxCustomId;
    }

    /**
     * Clear all registrations (for hot reload).
     */
    clear(): void {
        this.items.clear();
        this.nextCustomId = CustomItemRegistryStore.CUSTOM_ID_START;
        this.maxCustomId = 0;
        this.registryRevision++;
    }
}

/**
 * Global custom item registry singleton.
 */
export const CustomItemRegistry = new CustomItemRegistryStore();
