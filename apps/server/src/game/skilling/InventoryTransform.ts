import type { PlayerState } from "@server/game/player";
import type { InventoryFacade } from "@server/game/scripts/serviceInterfaces";
import type { ScriptInventoryEntry } from "@server/game/scripts/types";

const INVENTORY_SLOT_COUNT = 28;

export interface ItemAmount {
    itemId: number;
    quantity: number;
}

export interface InventoryTransformInput extends ItemAmount {
    /**
     * Require this input to come from one exact inventory slot. Omit the slot
     * for the existing item-ID-wide behavior used by batch recipes.
     */
    slot?: number;
}

export type InventoryOutputPlacement = "add" | "first-consumed-slot";

export interface InventoryTransform {
    inputs: readonly InventoryTransformInput[];
    outputs: readonly ItemAmount[];
    outputPlacement?: InventoryOutputPlacement;
}

export type InventoryTransformResult =
    | { ok: true; firstConsumedSlot?: number }
    | {
          ok: false;
          reason:
              | "invalid-transform"
              | "missing-inputs"
              | "inventory-full"
              | "mutation-failed";
      };

function normalizedAmount(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function countInventoryItem(
    entries: readonly ScriptInventoryEntry[],
    itemId: number,
): number {
    let total = 0;
    for (const entry of entries) {
        if (entry.itemId === itemId && entry.quantity > 0) total += entry.quantity;
    }
    return total;
}

export function hasInventoryItems(
    entries: readonly ScriptInventoryEntry[],
    requirements: readonly ItemAmount[],
): boolean {
    const requiredByItem = combineAmounts(requirements);
    for (const [itemId, quantity] of requiredByItem) {
        if (countInventoryItem(entries, itemId) < quantity) return false;
    }
    return true;
}

export function maxInventoryTransforms(
    entries: readonly ScriptInventoryEntry[],
    inputs: readonly ItemAmount[],
    limit: number = Number.MAX_SAFE_INTEGER,
): number {
    const requiredByItem = combineAmounts(inputs);
    if (requiredByItem.size === 0) return 0;
    let maximum = Math.max(0, Math.trunc(limit));
    for (const [itemId, quantity] of requiredByItem) {
        maximum = Math.min(maximum, Math.floor(countInventoryItem(entries, itemId) / quantity));
    }
    return Math.max(0, maximum);
}

/**
 * Applies a synchronous inventory exchange as one logical operation.
 *
 * Script inventory facades intentionally expose small mutation primitives rather
 * than a database transaction. This helper snapshots all slots, validates every
 * input up front, and restores the exact snapshot if any output cannot be stored.
 * No inventory packet is emitted until the caller returns its action effects, so
 * observers only ever see the completed exchange or the original inventory.
 */
export function applyInventoryTransform(
    inventory: InventoryFacade,
    player: PlayerState,
    transform: InventoryTransform,
): InventoryTransformResult {
    if (
        transform.inputs.length === 0 ||
        !areValidInputs(transform.inputs) ||
        !areValidAmounts(transform.outputs)
    ) {
        return { ok: false, reason: "invalid-transform" };
    }
    const before = inventory.getInventoryItems(player).map((entry) => ({ ...entry }));
    const outputs = combineAmounts(transform.outputs);
    if (
        !hasInventoryItems(before, transform.inputs) ||
        !hasExactSlotInputs(before, transform.inputs)
    ) {
        return { ok: false, reason: "missing-inputs" };
    }

    try {
        let firstConsumedSlot: number | undefined;
        const exactReservations = buildExactSlotReservations(transform.inputs);
        for (const input of transform.inputs) {
            const { itemId, quantity } = input;
            let remaining = quantity;
            const current = inventory.getInventoryItems(player);
            if (input.slot !== undefined) {
                const entry = current.find((candidate) => candidate.slot === input.slot);
                if (!entry || entry.itemId !== itemId || entry.quantity < quantity) {
                    restoreInventory(inventory, player, before);
                    return { ok: false, reason: "missing-inputs" };
                }
                const nextQuantity = entry.quantity - quantity;
                inventory.setInventorySlot(
                    player,
                    entry.slot,
                    nextQuantity > 0 ? itemId : -1,
                    nextQuantity,
                );
                if (firstConsumedSlot === undefined && nextQuantity === 0) {
                    firstConsumedSlot = entry.slot;
                }
                const reservation = exactReservations.get(entry.slot);
                if (reservation) reservation.quantity -= quantity;
                continue;
            }
            for (const entry of current) {
                if (remaining <= 0) break;
                if (entry.itemId !== itemId || entry.quantity <= 0) continue;
                const reservation = exactReservations.get(entry.slot);
                const reservedQuantity =
                    reservation?.itemId === itemId ? reservation.quantity : 0;
                const available = Math.max(0, entry.quantity - reservedQuantity);
                const removed = Math.min(available, remaining);
                if (removed <= 0) continue;
                const nextQuantity = entry.quantity - removed;
                inventory.setInventorySlot(
                    player,
                    entry.slot,
                    nextQuantity > 0 ? itemId : -1,
                    nextQuantity,
                );
                if (firstConsumedSlot === undefined && nextQuantity === 0) {
                    firstConsumedSlot = entry.slot;
                }
                remaining -= removed;
            }
            if (remaining > 0) {
                restoreInventory(inventory, player, before);
                return { ok: false, reason: "missing-inputs" };
            }
        }

        const pendingOutputs = amountsFromMap(outputs);
        if (
            transform.outputPlacement === "first-consumed-slot" &&
            firstConsumedSlot !== undefined &&
            pendingOutputs.length > 0 &&
            pendingOutputs[0].quantity === 1
        ) {
            const [first, ...rest] = pendingOutputs;
            inventory.setInventorySlot(player, firstConsumedSlot, first.itemId, first.quantity);
            pendingOutputs.splice(0, pendingOutputs.length, ...rest);
        }

        for (const output of pendingOutputs) {
            const result = inventory.addItemToInventory(player, output.itemId, output.quantity);
            if (result.added !== output.quantity) {
                restoreInventory(inventory, player, before);
                return { ok: false, reason: "inventory-full" };
            }
        }

        return { ok: true, firstConsumedSlot };
    } catch {
        try {
            restoreInventory(inventory, player, before);
        } catch {
            // The inventory facade is synchronous; a double mutation failure is
            // unrecoverable here, but callers still receive a failed transaction.
        }
        return { ok: false, reason: "mutation-failed" };
    }
}

function areValidInputs(inputs: readonly InventoryTransformInput[]): boolean {
    return (
        areValidAmounts(inputs) &&
        inputs.every(
            ({ slot }) =>
                slot === undefined ||
                (Number.isInteger(slot) && slot >= 0 && slot < INVENTORY_SLOT_COUNT),
        )
    );
}

function buildExactSlotReservations(
    inputs: readonly InventoryTransformInput[],
): Map<number, { itemId: number; quantity: number }> {
    const reservations = new Map<number, { itemId: number; quantity: number }>();
    for (const input of inputs) {
        if (input.slot === undefined) continue;
        const existing = reservations.get(input.slot);
        if (existing) {
            existing.quantity += input.quantity;
        } else {
            reservations.set(input.slot, {
                itemId: input.itemId,
                quantity: input.quantity,
            });
        }
    }
    return reservations;
}

function hasExactSlotInputs(
    entries: readonly ScriptInventoryEntry[],
    inputs: readonly InventoryTransformInput[],
): boolean {
    const requiredBySlot = new Map<number, Map<number, number>>();
    for (const input of inputs) {
        if (input.slot === undefined) continue;
        let requiredByItem = requiredBySlot.get(input.slot);
        if (!requiredByItem) {
            requiredByItem = new Map<number, number>();
            requiredBySlot.set(input.slot, requiredByItem);
        }
        requiredByItem.set(
            input.itemId,
            (requiredByItem.get(input.itemId) ?? 0) + input.quantity,
        );
    }
    for (const [slot, requiredByItem] of requiredBySlot) {
        if (requiredByItem.size !== 1) return false;
        const entry = entries.find((candidate) => candidate.slot === slot);
        const [requirement] = requiredByItem;
        if (
            !entry ||
            entry.itemId !== requirement[0] ||
            entry.quantity < requirement[1]
        ) {
            return false;
        }
    }
    return true;
}

function areValidAmounts(amounts: readonly ItemAmount[]): boolean {
    return amounts.every(
        ({ itemId, quantity }) =>
            Number.isInteger(itemId) &&
            itemId > 0 &&
            Number.isInteger(quantity) &&
            quantity > 0,
    );
}

function combineAmounts(amounts: readonly ItemAmount[]): Map<number, number> {
    const combined = new Map<number, number>();
    for (const amount of amounts) {
        const itemId = Math.trunc(amount.itemId);
        const quantity = normalizedAmount(amount.quantity);
        if (!(itemId > 0) || quantity <= 0) continue;
        combined.set(itemId, (combined.get(itemId) ?? 0) + quantity);
    }
    return combined;
}

function amountsFromMap(amounts: ReadonlyMap<number, number>): ItemAmount[] {
    return Array.from(amounts, ([itemId, quantity]) => ({ itemId, quantity }));
}

function restoreInventory(
    inventory: InventoryFacade,
    player: PlayerState,
    snapshot: readonly ScriptInventoryEntry[],
): void {
    const occupiedNow = inventory.getInventoryItems(player);
    const slots = new Set<number>([
        ...Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) => slot),
        ...occupiedNow.map((entry) => entry.slot),
        ...snapshot.map((entry) => entry.slot),
    ]);
    for (const slot of slots) inventory.setInventorySlot(player, slot, -1, 0);
    for (const entry of snapshot) {
        inventory.setInventorySlot(player, entry.slot, entry.itemId, entry.quantity);
    }
}
