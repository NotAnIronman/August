import { ANY_LOC_ID, type IScriptRegistry, type ItemOnLocEvent, type ScriptServices } from "@server/game/scripts/types";
import { LockState } from "@server/game/model/LockState";

const HAMMER = 2347;
const SHARD_ONE = 11818;
const SHARD_TWO = 11820;
const SHARD_THREE = 11822;
const PARTIAL_ONE_TWO = 11794;
const PARTIAL_ONE_THREE = 11796;
const PARTIAL_TWO_THREE = 11800;
const GODSWORD_BLADE = 11798;

type Recipe = { source: number; partner: number; result: number };
const RECIPES: readonly Recipe[] = [
    // This ordering deliberately makes shard 1 + shard 2 the default when all three shards exist.
    { source: SHARD_ONE, partner: SHARD_TWO, result: PARTIAL_ONE_TWO },
    { source: SHARD_ONE, partner: SHARD_THREE, result: PARTIAL_ONE_THREE },
    { source: SHARD_TWO, partner: SHARD_ONE, result: PARTIAL_ONE_TWO },
    { source: SHARD_TWO, partner: SHARD_THREE, result: PARTIAL_TWO_THREE },
    { source: SHARD_THREE, partner: SHARD_ONE, result: PARTIAL_ONE_THREE },
    { source: SHARD_THREE, partner: SHARD_TWO, result: PARTIAL_TWO_THREE },
    { source: PARTIAL_ONE_TWO, partner: SHARD_THREE, result: GODSWORD_BLADE },
    { source: PARTIAL_ONE_THREE, partner: SHARD_TWO, result: GODSWORD_BLADE },
    { source: PARTIAL_TWO_THREE, partner: SHARD_ONE, result: GODSWORD_BLADE },
];

function isAnvil(event: ItemOnLocEvent, services: ScriptServices): boolean {
    const actions = services.data.getLocDefinition(event.target.locId)?.actions ?? [];
    return actions.some((action) => action?.toLowerCase() === "smith");
}

function combine(event: ItemOnLocEvent): void {
    const { player, services } = event;
    if (!isAnvil(event, services)) return;
    if (!player.items.hasItem(HAMMER)) { services.messaging.sendGameMessage(player, "You need a hammer to smith."); return; }
    const recipe = RECIPES.find((candidate) => candidate.source === event.source.itemId && player.items.hasItem(candidate.partner));
    if (!recipe) return;

    // Snapshot first, preflight the result, then synchronously remove and add.
    // If an unexpected inventory failure occurs, every slot is restored before the
    // player can perform another action or disconnect.
    const before = player.items.getInventoryEntries().map((entry) => ({ ...entry }));
    const restore = (): void => before.forEach((entry, slot) => player.items.setInventorySlot(slot, entry.itemId, entry.quantity));
    try {
        const first = player.items.removeItem(recipe.source, 1, { assureFullRemoval: true });
        const second = player.items.removeItem(recipe.partner, 1, { assureFullRemoval: true });
        if (first.completed !== 1 || second.completed !== 1) { restore(); return; }
        const made = player.items.addItem(recipe.result, 1, { assureFullInsertion: true });
        if (made.completed !== 1) { restore(); services.messaging.sendGameMessage(player, "You need an empty inventory space to make that."); return; }
        const previousLock = player.lock;
        player.lock = LockState.FULL;
        services.animation.playPlayerSeq(player, 898);
        services.scheduler.after(3, () => { if (player.lock === LockState.FULL) player.lock = previousLock; }, { kind: "player", id: player.id });
        services.inventory.snapshotInventoryImmediate(player);
        services.messaging.sendGameMessage(player, "You carefully smith the godsword shards together.");
    } catch {
        restore();
        services.inventory.snapshotInventoryImmediate(player);
        services.messaging.sendGameMessage(player, "The shards could not be combined.");
    }
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    for (const itemId of new Set(RECIPES.map((recipe) => recipe.source))) {
        registry.registerItemOnLoc(itemId, ANY_LOC_ID, combine);
    }
}
