import assert from "node:assert/strict";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { PlayerState } from "@server/game/player";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { registerLevelUpHandlers, getPopupQueue, handleDismiss } from "@server/content/gamemodes/vanilla/scripts/levelup";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { registerNpcHandlers } from "@server/network/handlers/npcHandlers";

registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const mode = createTestGamemode("status-pet", "Status pet");
const player = new PlayerState(41, 3200, 3200, 0, mode);
const skills = player.skillSystem;
assert.equal(skills.takeHealthOrbStatusSync(), 0);
assert.equal(skills.takeHealthOrbStatusSync(), undefined);
skills.inflictPoison(6, 0);
assert.equal(skills.takeHealthOrbStatusSync(), 6);
skills.inflictVenom(6, 0);
assert.equal(skills.takeHealthOrbStatusSync(), 1_000_006);
skills.curePoison();
assert.equal(skills.takeHealthOrbStatusSync(), undefined, "venom takes orb priority");
skills.cureVenom();
assert.equal(skills.takeHealthOrbStatusSync(), 0);

assert(player.followers.recordFirstPetDrop(29836, { bossNpcTypeId: 13668, bossName: "Araxxor", killcount: 17 }));
assert.equal(player.followers.recordFirstPetDrop(29837, { bossNpcTypeId: 13668, bossName: "Araxxor", killcount: 99 }), false);
const restored = new PlayerState(42, 3200, 3200, 0, mode);
restored.applyPersistentVars(mergePlayerPersistentVars(undefined, JSON.parse(JSON.stringify(player.exportPersistentVars())))!);
assert.equal(restored.followers.getFirstPetDrop(29837)?.killcount, 17, "variant shares first KC through account save/load");

const events = new Map<string, (e: any) => void>();
const widgets: any[] = [];
const cleanup: Array<() => void> = [];
const services: any = { dialog: { queueWidgetEvent: (_id: number, event: any) => widgets.push(event) },
    messaging: { sendGameMessage() {} }, animation: { broadcastPlayerSpot() {} }, sound: { sendJingle() {}, sendSound() {} } };
registerLevelUpHandlers({ registerCleanup: (fn: () => void) => cleanup.push(fn) } as never, services,
    { on: (name: string, fn: (e: any) => void) => { events.set(name, fn); return { unsubscribe() {} }; } } as never);
for (let level = 2; level <= 6; level++) events.get("skill:levelUp")!({ player, skillId: SkillId.Strength, oldLevel: level - 1, newLevel: level });
assert.deepEqual(getPopupQueue(player.id)?.map(p => p.newLevel), [6]);
assert(widgets.some(event => event.text === "Your Strength level is now 6."));
assert.equal(widgets.filter(event => event.action === "open_sub").length, 5);
handleDismiss(services, player.id);
assert.equal(getPopupQueue(player.id), undefined);
cleanup.forEach(fn => fn());

const handlers = new Map<string, (ctx: any) => void>();
const messages: string[] = [];
let ownerId = player.id;
const pet = { tileX: 3201, tileY: 3200, level: 0, worldViewId: restored.worldViewId,
    getFollowerState: () => ({ ownerPlayerId: ownerId, itemId: 29836 }) };
registerNpcHandlers({ register: (name: string, fn: (ctx: any) => void) => handlers.set(name, fn) } as never,
    { getNpcById: () => pet, getPlayerById: (id: number) => id === player.id ? player : undefined,
        sendGameMessage: (_p: unknown, text: string) => messages.push(text), clearPendingWalkCommand() {},
        resolveNpcOption: () => { throw Error("foreign pet operations must be rejected before routing"); } } as never);
handlers.get("pet_examine")!({ player: restored, payload: { npcId: 1 } });
assert.match(messages[0], /17 Araxxor killcount/);
handlers.get("npc_interact")!({ player: restored, payload: { npcId: 1, opNum: 1 } });
pet.worldViewId = 12345;
handlers.get("pet_examine")!({ player: restored, payload: { npcId: 1 } });
assert.equal(messages.length, 1, "cross-instance inspection is rejected");
console.log("Status orb, latest level-up, first-pet persistence and pet ownership passed");
