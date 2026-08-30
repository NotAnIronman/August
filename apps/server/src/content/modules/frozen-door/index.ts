import { completeQuest } from "@server/content/gamemodes/vanilla/quests/QuestService";
import { getQuestDefinition, registerQuestDefinition } from "@server/content/gamemodes/vanilla/quests/QuestRegistry";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import { VARP_FROZEN_DOOR_COMPLETE, isFrozenDoorComplete } from "@server/content/modules/frozen-door/progress";
import type { IScriptRegistry, LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";

const FROZEN_KEY = 26356;
const KEY_PIECES = [26358, 26360, 26362, 26364] as const;
const FROZEN_DOORS = [42840, 42841] as const;
const DESTINATION = { x: 2855, y: 5277, level: 0 };

const frozenDoorQuest: QuestDefinition = {
    key: "the frozen door", name: "The Frozen Door", varpId: VARP_FROZEN_DOOR_COMPLETE,
    startedValue: 0, completionValue: 1, rewards: { questPoints: 0, other: ["Access to the Ancient Prison"] },
    buildJournal: (player) => isFrozenDoorComplete(player) ? ["You have unlocked the Frozen Door."] : ["Collect the four frozen key pieces from the God Wars Dungeon."],
    register: () => undefined,
};

function ensureQuestRegistered(): QuestDefinition {
    const existing = getQuestDefinition("The Frozen Door");
    if (existing) return existing;
    registerQuestDefinition(frozenDoorQuest);
    return frozenDoorQuest;
}

function assemble({ player, services }: { player: import("@server/game/player").PlayerState; services: ScriptServices }): void {
    if (!KEY_PIECES.every((itemId) => player.items.hasItem(itemId))) { services.messaging.sendGameMessage(player, "You need all four frozen key pieces to assemble the key."); return; }
    const before = player.items.getInventoryEntries().map((entry) => ({ ...entry }));
    const restore = (): void => before.forEach((entry, slot) => player.items.setInventorySlot(slot, entry.itemId, entry.quantity));
    try {
        for (const itemId of KEY_PIECES) if (player.items.removeItem(itemId, 1, { assureFullRemoval: true }).completed !== 1) { restore(); return; }
        if (player.items.addItem(FROZEN_KEY, 1, { assureFullInsertion: true }).completed !== 1) { restore(); return; }
        services.inventory.snapshotInventoryImmediate(player);
        services.messaging.sendGameMessage(player, "You assemble the frozen key pieces into a frozen key.");
    } catch { restore(); services.inventory.snapshotInventoryImmediate(player); }
}

function openDoor({ player, services }: LocInteractionEvent): void {
    if (isFrozenDoorComplete(player)) { services.movement.teleportPlayer(player, DESTINATION.x, DESTINATION.y, DESTINATION.level); return; }
    if (!player.items.hasItem(FROZEN_KEY)) { services.messaging.sendGameMessage(player, "This door is locked by some great power, and an even greater lock."); return; }
    if (player.items.removeItem(FROZEN_KEY, 1, { assureFullRemoval: true }).completed !== 1) return;
    const quest = ensureQuestRegistered();
    if (!completeQuest(player, services, quest)) {
        player.items.addItem(FROZEN_KEY, 1, { assureFullInsertion: true });
        services.inventory.snapshotInventoryImmediate(player);
        return;
    }
    services.inventory.snapshotInventoryImmediate(player);
    services.movement.teleportPlayer(player, DESTINATION.x, DESTINATION.y, DESTINATION.level);
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    ensureQuestRegistered();
    for (const itemId of KEY_PIECES) registry.registerItemAction(itemId, assemble, "assemble");
    for (const doorId of FROZEN_DOORS) registry.registerLocInteraction(doorId, openDoor, "open");
}
