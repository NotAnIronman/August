import assert from "node:assert/strict";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";

import { awardPetReward, deliverPendingPetRewards } from "@server/game/followers/awardPetReward";
import { getFollowerDefinitionByItemId } from "@server/game/followers/followerDefinitions";
import { GroundItemManager } from "@server/game/items/GroundItemManager";
import { PlayerState } from "@server/game/player";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";
import { createTestGamemode } from "./fixtures/createTestGamemode";

const gamemode = createTestGamemode("pet-reward-test", "Pet reward test");
registerSkillConfiguration({
    computeCombatLevel: () => 3,
    skillRestoreIntervalTicks: 100, skillBoostDecayIntervalTicks: 100,
    hitpointRegenIntervalTicks: 100, hitpointOverhealDecayIntervalTicks: 100,
    preserveDecayMultiplier: 1.5,
});
const petId = 29836;
const npcTypeId = getFollowerDefinitionByItemId(petId)!.npcTypeId;
function setup(active = false, inventoryRoom = true, bankRoom = true, spawnOk = true) {
    const player = new PlayerState(42, 3200, 3200, 0, gamemode);
    if (active) player.followers.setState({ itemId: petId, npcTypeId });
    const calls = { summons: 0, inventory: 0, bank: 0, log: 0, snapshots: 0 };
    const messages: string[] = [];
    const services: any = {
        followers: {
            summonFollowerFromItem: (_player: PlayerState, itemId: number, npc: number) => {
                calls.summons++;
                assert.equal(itemId, petId);
                assert.equal(npc, npcTypeId, "reward must use the pet's NPC model");
                if (!spawnOk) return { ok: false, reason: "spawn_failed" };
                player.followers.setState({ itemId, npcTypeId: npc });
                return { ok: true, npcId: 7 };
            },
        },
        inventory: {
            addItemToInventory: (_player: PlayerState, _id: number, quantity: number) => {
                if (inventoryRoom) calls.inventory += quantity;
                return { slot: inventoryRoom ? 0 : -1, added: inventoryRoom ? quantity : 0 };
            },
            snapshotInventory: () => calls.snapshots++,
        },
        banking: {
            addItemToBank: (_player: PlayerState, _id: number, quantity: number) => {
                if (bankRoom) calls.bank += quantity;
                return bankRoom;
            },
            queueBankSnapshot: () => calls.snapshots++,
        },
        collectionLog: { trackCollectionLogItem: () => calls.log++ },
        messaging: { sendGameMessage: (_player: PlayerState, message: string) => messages.push(message) },
    };
    const ground = new GroundItemManager({
        players: { getById: () => player },
        scriptRuntime: { getServices: () => services },
    } as any);
    return { player, services, calls, messages, ground, makeInventorySpace: () => { inventoryRoom = true; } };
}
const first = setup(false, false);
assert(awardPetReward(first.player, petId, 1, first.services));
assert.equal(first.calls.summons, 1, "full inventory does not stop first pet auto-summoning");
assert.equal(first.calls.inventory + first.calls.bank, 0);
assert.equal(first.calls.log, 1);
const duplicate = setup(true);
awardPetReward(duplicate.player, petId, 1, duplicate.services);
assert.equal(duplicate.calls.summons, 0);
assert.equal(duplicate.calls.inventory, 1);
assert.equal(duplicate.calls.bank, 0);
const banked = setup(true, false);
awardPetReward(banked.player, petId, 1, banked.services);
assert.equal(banked.calls.bank, 1);
assert.equal(banked.player.items.bankDirty, true);
assert.equal(banked.calls.log, 1);
const spawnFailed = setup(false, true, true, false);
awardPetReward(spawnFailed.player, petId, 1, spawnFailed.services);
assert.equal(spawnFailed.calls.inventory, 1, "NPC-spawn failure preserves the earned pet as an item");

const full = setup(true, false, false);
const tile = { x: 3200, y: 3200, level: 0 };
assert.equal(full.ground.spawn(petId, 1, tile, 10, { ownerId: 42, isMonsterDrop: true }), undefined);
assert.equal(full.ground.queryArea(3200, 3200, 0, 0, 10, 42, -1).length, 0, "no floor model for earned pets");
assert.deepEqual(full.player.followers.getPendingRewards(), [{ itemId: petId, quantity: 1 }]);
deliverPendingPetRewards(full.player, full.services);
assert.equal(full.calls.log, 1, "capacity retries cannot grant duplicate collection-log credit");
assert.equal(full.messages.length, 1, "full-bank retries must not spam chat");

const saved = JSON.parse(JSON.stringify(full.player.exportPersistentVars()));
const restored = new PlayerState(43, 3200, 3200, 0, gamemode);
restored.applyPersistentVars(mergePlayerPersistentVars(undefined, saved)!);
assert.deepEqual(restored.followers.getPendingRewards(), [{ itemId: petId, quantity: 1 }], "pet overflow survives the complete account save/load pipeline");
full.makeInventorySpace();
deliverPendingPetRewards(restored, full.services);
deliverPendingPetRewards(restored, full.services);
assert.equal(full.calls.inventory, 1, "deferred reward is delivered once when space opens");
assert.deepEqual(restored.followers.getPendingRewards(), []);
assert.equal(full.calls.log, 1);

const normal = setup();
assert(normal.ground.spawn(995, 1, tile, 10, { ownerId: 42, isMonsterDrop: true }), "ordinary loot remains a ground item");
assert.equal(normal.calls.log, 0, "ordinary loot credit stays with its existing caller");
assert(normal.ground.spawn(petId, 1, tile, 10, { ownerId: 42 }), "non-reward ground spawns are not treated as new acquisitions");
assert.equal(normal.calls.summons, 0);
assert.equal(awardPetReward(normal.player, 995, 1, normal.services), false);
assert.equal(awardPetReward(normal.player, petId, -1, normal.services), false);
console.log("pet reward routing, overflow persistence, and single-credit tests passed");
