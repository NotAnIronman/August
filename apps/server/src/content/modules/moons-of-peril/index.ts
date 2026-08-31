import type { PlayerState } from "@server/game/player";
import { EquipmentSlot } from "@august/osrs-engine/config/player/Equipment";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import { AttackType } from "@server/game/combat/AttackType";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { NpcPreDeathDecision, type IScriptRegistry, type ScriptServices } from "@server/game/scripts/types";
import { openRewardDisplay } from "@server/content/gamemodes/vanilla/widgets/rewardDisplay";

const CHEST = 51346, CRATE = 51371, SAPLING = 51365, STOVE = 51362;
// 51368 is the cache's actionable "Fishing spot". Keep 51367 too because it
// was the original map reference and some placements use that variant.
const FISHING_SPOTS = [51367, 51368] as const;
const NET = 303, ROPE = 954, BUTTERFLY_NET = 10010, PESTLE = 233, VIAL = 227, GRUB = 29078, PASTE = 29079, BREAM = 29216, COOKED_BREAM = 29217;
const MOONLIGHT_MOTHS = [12771, 12772, 12773] as const;
const STATUES = [51372, 51373, 51374] as const;
const CHEST_TILE = { x: 1513, y: 9578, level: 0 };
type Moon = "blood" | "eclipse" | "blue";
const MOONS: Record<Moon, { id: number; entry: { x: number; y: number; level: number }; outside: { x: number; y: number; level: number }; grave: { x: number; y: number; level: number }; boss: { x: number; y: number; level: number }; sourceBaseX: number; sourceBaseY: number; destinationChunkX: number; destinationChunkY: number; next: Moon }> = {
    // Each chamber needs its own map slice. Copying all three into one 104x104
    // view cut off Blood/Eclipse and displaced their terrain vertically.
    blood: { id: 13011, entry: { x: 1396, y: 9632, level: 0 }, outside: { x: 1413, y: 9632, level: 0 }, grave: { x: 1414, y: 9632, level: 0 }, boss: { x: 1392, y: 9632, level: 0 }, sourceBaseX: 1368, sourceBaseY: 9608, destinationChunkX: 3, destinationChunkY: 3, next: "eclipse" },
    eclipse: { id: 13012, entry: { x: 1484, y: 9632, level: 0 }, outside: { x: 1466, y: 9632, level: 0 }, grave: { x: 1465, y: 9632, level: 0 }, boss: { x: 1488, y: 9632, level: 0 }, sourceBaseX: 1440, sourceBaseY: 9608, destinationChunkX: 1, destinationChunkY: 3, next: "blue" },
    blue: { id: 13013, entry: { x: 1440, y: 9676, level: 0 }, outside: { x: 1440, y: 9658, level: 0 }, grave: { x: 1440, y: 9657, level: 0 }, boss: { x: 1440, y: 9680, level: 0 }, sourceBaseX: 1408, sourceBaseY: 9640, destinationChunkX: 2, destinationChunkY: 2, next: "blood" },
};
type Run = { killed: Set<Moon>; active?: Moon; instanceId: string };
const runs = new Map<number, Run>();

function registerEncounters(): void {
    for (const [key, moon] of Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>) {
        if (EncounterRegistry.shared.get(`moon-${key}`)) continue;
        registerEncounter({ id: `moon-${key}`, npcTypeIds: [moon.id], maxHealth: 500, bossHealthBar: { name: `${key[0].toUpperCase()}${key.slice(1)} Moon`, npcTypeId: moon.id }, movement: { wanderRadius: 0, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 60, retreatInteractionRange: 60 }, attacks: [{ id: "attack", type: AttackType.Melee, rangeTiles: 30, preferredDistance: 30, speedTicks: 4, maxHit: 20, animation: "attack" }] });
    }
}

function addOrDrop(player: PlayerState, services: ScriptServices, itemId: number, quantity: number): void {
    const added = player.items.addItem(itemId, quantity, { assureFullInsertion: false }).completed;
    if (added < quantity) services.groundItems.spawn(itemId, quantity - added, { x: player.tileX, y: player.tileY, level: player.level }, { ownerId: player.id, privateTicks: 100, worldViewId: player.worldViewId, isMonsterDrop: false });
}

function spawnMoon(player: PlayerState, services: ScriptServices, moon: Moon): void {
    const run = runs.get(player.id); if (!run || run.active || run.killed.has(moon)) return;
    const def = MOONS[moon];
    services.movement.teleportPlayer(player, def.entry.x, def.entry.y, def.entry.level);
    const npc = services.npc.spawnNpc({ id: def.id, x: def.boss.x, y: def.boss.y, level: 0, size: 3, worldViewId: player.worldViewId, ownerPlayerId: player.id, wanderRadius: 0, attackSpeed: 4, isAggressive: true, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, respawns: false });
    if (!npc) { services.messaging.sendGameMessage(player, "The Moon fails to awaken. Please try again."); return; }
    run.active = moon; services.npc.engageCombat(npc, player);
}

function createRun(player: PlayerState, services: ScriptServices, first: Moon, access: "solo" | "party" = "solo"): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    const existing = runs.get(player.id);
    if (existing?.killed.size) {
        if (existing.killed.has(first)) { services.messaging.sendGameMessage(player, `You have already defeated the ${first} Moon this run.`); return; }
        resumeRun(player, services, first);
        return;
    }
    const def = MOONS[first];
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: def.sourceBaseX, sourceBaseY: def.sourceBaseY, widthChunks: 8, heightChunks: 8, sourcePlanes: [0], destinationChunkX: def.destinationChunkX, destinationChunkY: def.destinationChunkY }]);
    const room = services.instances.create(player, { definitionId: "moons-of-peril", access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party", templateChunks, destination: def.entry, exit: def.outside, grave: { locId: INSTANCE_GRAVE_RECLAIM_LOC_ID, tile: def.grave, level: 0 } });
    if (!room) { services.messaging.sendGameMessage(player, "The Moon chamber is unavailable right now."); return; }
    runs.set(player.id, { killed: new Set(), instanceId: room.id }); services.instances.markStarted(room.id); spawnMoon(player, services, first);
}

/** Rebuild a fresh room when an early chest choice sends a player back in. */
function resumeRun(player: PlayerState, services: ScriptServices, next: Moon): void {
    const run = runs.get(player.id);
    if (!run || services.instances.get(player.id)) return;
    const def = MOONS[next];
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: def.sourceBaseX, sourceBaseY: def.sourceBaseY, widthChunks: 8, heightChunks: 8, sourcePlanes: [0], destinationChunkX: def.destinationChunkX, destinationChunkY: def.destinationChunkY }]);
    const room = services.instances.create(player, { definitionId: "moons-of-peril", access: "solo", maxPlayers: 1, templateChunks, destination: def.entry, exit: def.outside, grave: { locId: INSTANCE_GRAVE_RECLAIM_LOC_ID, tile: def.grave, level: 0 } });
    if (!room) { services.messaging.sendGameMessage(player, "The Moon chamber is unavailable right now."); return; }
    run.instanceId = room.id;
    services.instances.markStarted(room.id);
    spawnMoon(player, services, next);
}

function showJoinOptions(player: PlayerState, services: ScriptServices): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "Leave your current instance before joining another party."); return; }
    const rooms = services.instances.listJoinable("moons-of-peril");
    if (!rooms.length) { services.messaging.sendGameMessage(player, "There are no joinable Moons of Peril parties."); return; }
    const visible = rooms.slice(0, 5);
    services.dialog.openDialogOptions(player, { id: "moons-of-peril-join", title: "Join a Moons of Peril party", options: visible.map(room => `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`), modal: true, onSelect: choice => { const room = visible[choice]; if (!room || !services.instances.join(player, room.id)) services.messaging.sendGameMessage(player, "That party is no longer available."); } });
}

function statue(player: PlayerState, services: ScriptServices, moon: Moon): void {
    if (services.instances.get(player.id)?.definitionId === "moons-of-peril") { services.instances.leave(player, CHEST_TILE); return; }
    const killed = [...(runs.get(player.id)?.killed ?? [])];
    if (killed.length) services.messaging.sendGameMessage(player, `Defeated this run: ${killed.map(name => `${name[0].toUpperCase()}${name.slice(1)} Moon`).join(", ")}.`);
    services.dialog.openDialogOptions(player, { id: `moon-enter-${moon}`, title: `Enter the ${moon} Moon chamber`, options: ["Enter solo", "Create a party instance", "Join a party instance"], modal: true, onSelect: choice => { if (choice === 0) createRun(player, services, moon); else if (choice === 1) createRun(player, services, moon, "party"); else if (choice === 2) showJoinOptions(player, services); } });
}

const MOON_EQUIPMENT: Record<Moon, readonly number[]> = {
    eclipse: [29000, 29004, 29007, 29010], blue: [28988, 29013, 29016, 29019], blood: [29022, 29025, 29028, 28997],
};
function appendReward(rewards: Array<{ itemId: number; quantity: number }>, itemId: number, quantity: number): void {
    const existing = rewards.find(reward => reward.itemId === itemId);
    if (existing) existing.quantity += quantity; else rewards.push({ itemId, quantity });
}
function noteBulkReward(services: ScriptServices, itemId: number, quantity: number): number {
    if (quantity <= 1) return itemId;
    const noteId = services.data.getItemDefinition(itemId)?.noteId ?? -1;
    const note = noteId > 0 ? services.data.getItemDefinition(noteId) : undefined;
    return note?.noted ? noteId : itemId;
}
function chooseMoonPiece(player: PlayerState, moon: Moon): number {
    const pieces = MOON_EQUIPMENT[moon];
    const missing = pieces.filter(itemId => !player.collectionLog.hasItem(itemId));
    const pool = missing.length ? missing : pieces;
    return pool[Math.floor(Math.random() * pool.length)]!;
}
function reward(player: PlayerState, services: ScriptServices): void {
    const run = runs.get(player.id); if (!run || run.killed.size === 0) { services.messaging.sendGameMessage(player, "This chest seems empty."); return; }
    const count = run.killed.size;
    const resources = [{ itemId: 28899, quantity: 60 + count * 20 }, { itemId: 1939, quantity: 400 + count * 150 }, { itemId: 571, quantity: 60 + count * 30 }, { itemId: 6034, quantity: 20 + count * 10 }, { itemId: 1761, quantity: 20 + count * 10 }, { itemId: 205, quantity: 30 + count * 10 }, { itemId: 209, quantity: 20 + count * 8 }, { itemId: 28991, quantity: 100 + count * 75 }];
    const rewards: Array<{ itemId: number; quantity: number }> = [];
    let uniqueAwarded = false;
    for (const moon of run.killed) {
        if (Math.random() < 1 / 56) { appendReward(rewards, chooseMoonPiece(player, moon), 1); uniqueAwarded = true; }
    }
    if (!uniqueAwarded) {
        const rolls = count === 1 ? 1 : count === 2 ? 3 : 6;
        for (let roll = 0; roll < rolls; roll += 1) { const resource = resources[Math.floor(Math.random() * resources.length)]!; appendReward(rewards, noteBulkReward(services, resource.itemId, resource.quantity), resource.quantity); }
    }
    for (const item of rewards) addOrDrop(player, services, item.itemId, item.quantity);
    services.inventory.snapshotInventoryImmediate(player); for (const item of rewards) services.collectionLog.trackCollectionLogItem(player, item.itemId);
    openRewardDisplay(player, services, "Lunar chest", rewards); services.messaging.sendGameMessage(player, `You search the Lunar chest after defeating ${count} Moon${count === 1 ? "" : "s"}.`); runs.delete(player.id);
}

function searchChest(player: PlayerState, services: ScriptServices): void {
    const run = runs.get(player.id);
    if (!run || run.killed.size === 0) return reward(player, services);
    if (run.killed.size === 3) return reward(player, services);
    services.dialog.openDialogOptions(player, { id: "lunar-chest-choice", title: "The Lunar chest awaits.", options: ["Loot chest", "Next boss", "Cancel"], modal: true, onSelect: choice => {
        if (choice === 0) reward(player, services);
        if (choice === 1) {
            const next = (Object.keys(MOONS) as Moon[]).find(moon => !run.killed.has(moon));
            if (next) services.movement.teleportPlayer(player, MOONS[next].outside.x, MOONS[next].outside.y, MOONS[next].outside.level);
        }
    } });
}

function giveIfMissing(player: PlayerState, services: ScriptServices, itemId: number, quantity = 1): void {
    if (!player.items.hasItem(itemId, 1)) addOrDrop(player, services, itemId, quantity);
}
function giveSupplySet(player: PlayerState, services: ScriptServices, choice: number): void {
    if (choice === 0) giveIfMissing(player, services, NET);
    if (choice === 1) { giveIfMissing(player, services, ROPE); giveIfMissing(player, services, BUTTERFLY_NET); }
    if (choice === 2) { giveIfMissing(player, services, PESTLE); giveIfMissing(player, services, VIAL, 2); }
    services.inventory.snapshotInventoryImmediate(player);
}
function takeSupplies(player: PlayerState, services: ScriptServices): void {
    services.dialog.openDialogOptions(player, { id: "moon-supplies", title: "Take supplies", options: ["Fishing supplies", "Hunting supplies", "Herblore supplies"], modal: true, onSelect: choice => {
        giveSupplySet(player, services, choice);
    } });
}

function skillLevel(player: PlayerState, skill: SkillId): number { return player.skillSystem.getSkill(skill).baseLevel; }

function sameTile(player: PlayerState, tile: { x: number; y: number; level: number }, worldViewId: number): boolean {
    return player.tileX === tile.x && player.tileY === tile.y && player.level === tile.level && player.worldViewId === worldViewId;
}

function startFishing(player: PlayerState, services: ScriptServices): void {
    if (!player.items.hasItem(NET, 1)) { services.messaging.sendGameMessage(player, "You need a small fishing net to fish here."); return; }
    const start = { x: player.tileX, y: player.tileY, level: player.level };
    const worldViewId = player.worldViewId;
    const catchBream = (): void => {
        if (!sameTile(player, start, worldViewId) || player.items.getFreeSlotCount() <= 0) return;
        services.animation.playPlayerSeq(player, 621);
        const doubleChance = Math.min(0.8, skillLevel(player, SkillId.Fishing) / 120);
        const quantity = player.items.getFreeSlotCount() >= 2 && Math.random() < doubleChance ? 2 : 1;
        addOrDrop(player, services, BREAM, quantity);
        services.inventory.snapshotInventoryImmediate(player);
        if (player.items.getFreeSlotCount() > 0) services.scheduler.after(3, catchBream, { kind: "player", id: player.id });
    };
    catchBream();
}

function startCookingBream(player: PlayerState, services: ScriptServices): void {
    const start = { x: player.tileX, y: player.tileY, level: player.level };
    const worldViewId = player.worldViewId;
    const cookNext = (): void => {
        if (!sameTile(player, start, worldViewId) || !player.items.hasItem(BREAM, 1)) return;
        const doubleChance = Math.min(0.8, skillLevel(player, SkillId.Fishing) / 120);
        const quantity = player.items.hasItem(BREAM, 2) && Math.random() < doubleChance ? 2 : 1;
        if (player.items.removeItem(BREAM, quantity, { assureFullRemoval: true }).completed !== quantity) return;
        services.animation.playPlayerSeq(player, 897);
        addOrDrop(player, services, COOKED_BREAM, quantity);
        services.inventory.snapshotInventoryImmediate(player);
        if (player.items.hasItem(BREAM, 1)) services.scheduler.after(3, cookNext, { kind: "player", id: player.id });
    };
    cookNext();
}
function drinkMoonlightPotion(player: PlayerState, services: ScriptServices, itemId: number): void {
    const doses = 29083 - itemId + 1;
    if (doses < 1 || doses > 4 || player.items.removeItem(itemId, 1, { assureFullRemoval: true }).completed !== 1) return;
    if (doses > 1) addOrDrop(player, services, itemId + 1, 1); else addOrDrop(player, services, VIAL, 1);
    for (const skill of [SkillId.Attack, SkillId.Strength, SkillId.Defence] as const) {
        const level = skillLevel(player, skill);
        const boost = Math.floor(level * 0.15) + 3;
        player.skillSystem.setSkillBoost(skill, level + boost);
    }
    const prayer = player.skillSystem.getSkill(SkillId.Prayer);
    const currentPrayer = Math.max(0, prayer.baseLevel + prayer.boost);
    player.skillSystem.setSkillBoost(SkillId.Prayer, Math.min(prayer.baseLevel, currentPrayer + Math.max(1, Math.floor(prayer.baseLevel * 0.25))));
    player.prayer.resetDrainAccumulator(); services.inventory.snapshotInventoryImmediate(player);
    services.messaging.sendGameMessage(player, `You drink some of your Moonlight potion. ${doses - 1 || "No"} dose${doses === 2 ? "" : "s"} remaining.`);
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerEncounters();
    STATUES.forEach((id, index) => {
        const handler = ({ player, services }: { player: PlayerState; services: ScriptServices }) => statue(player, services, (["blood", "blue", "eclipse"] as Moon[])[index]!);
        registry.registerLocInteraction(id, handler, "enter");
        registry.registerLocInteraction(id, ({ player, services }) => {
            const count = services.instances.listJoinable("moons-of-peril").reduce((total, room) => total + room.memberPlayerIds.length, 0);
            services.messaging.sendGameMessage(player, count ? `You can see ${count} adventurer${count === 1 ? "" : "s"} in a Moons of Peril party.` : "You cannot see anyone waiting in a joinable Moons of Peril party.");
        }, "peek");
        registry.registerLocInteraction(id, ({ player, services }) => createRun(player, services, (["blood", "blue", "eclipse"] as Moon[])[index]!, "solo"), "enter solo");
        registry.registerLocInteraction(id, ({ player, services }) => createRun(player, services, (["blood", "blue", "eclipse"] as Moon[])[index]!, "party"), "enter party");
        registry.registerLocInteraction(id, ({ player, services }) => showJoinOptions(player, services), "join party");
        registry.registerLocInteraction(id, handler);
    });
    for (const action of ["search", "claim", "open"]) registry.registerLocInteraction(CHEST, ({ player, services }) => searchChest(player, services), action);
    registry.registerLocInteraction(CHEST, ({ player, services }) => services.messaging.sendGameMessage(player, "Each defeated Moon has a 1 in 56 chance to award one of its set pieces. If no set piece is awarded, the chest rolls standard loot 1, 3, or 6 times for 1, 2, or 3 Moons respectively."), "examine");
    registry.registerLocInteraction(CHEST, ({ player, services }) => searchChest(player, services));
    registry.registerLocInteraction(CRATE, ({ player, services }) => takeSupplies(player, services), "take-from");
    for (const [choice, label] of ["fishing", "hunting", "herblore"].entries()) {
        const direct = ({ player, services }: { player: PlayerState; services: ScriptServices }) => giveSupplySet(player, services, choice);
        registry.registerLocInteraction(CRATE, direct, `take-from ${label}`);
        registry.registerLocInteraction(CRATE, direct, `take-from <col=00ffff>${label}`);
    }
    registry.registerLocInteraction(SAPLING, ({ player, services }) => { addOrDrop(player, services, GRUB, 2); services.inventory.snapshotInventoryImmediate(player); }, "collect-from");
    registry.registerLocInteraction(STOVE, ({ player, services }) => startCookingBream(player, services), "cook");
    registry.registerLocInteraction(STOVE, ({ player, services }) => startCookingBream(player, services));
    const fish = ({ player, services }: { player: PlayerState; services: ScriptServices }) => startFishing(player, services);
    for (const locId of FISHING_SPOTS) {
        for (const action of ["net", "fish", "small-net"]) registry.registerLocInteraction(locId, fish, action);
        registry.registerLocInteraction(locId, fish);
    }
    registry.registerItemOnItem(GRUB, PESTLE, ({ player, services }) => { if (player.items.removeItem(GRUB, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, PASTE, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnItem(PASTE, VIAL, ({ player, services }) => { if (player.items.removeItem(PASTE, 1, { assureFullRemoval: true }).completed && player.items.removeItem(VIAL, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, 29080, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnLoc(BREAM, STOVE, ({ player, services }) => startCookingBream(player, services));
    for (const potion of [29080, 29081, 29082, 29083]) registry.registerItemAction(potion, ({ player, services }) => drinkMoonlightPotion(player, services, potion), "drink");
    for (const mothId of MOONLIGHT_MOTHS) registry.registerNpcScript({ npcId: mothId, option: "catch", handler: ({ player, services }) => {
        if (services.equipment.getEquippedItem(player, EquipmentSlot.WEAPON) !== BUTTERFLY_NET) { services.messaging.sendGameMessage(player, "You need to wield a butterfly net to catch this moth."); return; }
        services.animation.playPlayerSeq(player, 660);
        const prayer = player.skillSystem.getSkill(SkillId.Prayer);
        const current = Math.max(0, prayer.baseLevel + prayer.boost);
        player.skillSystem.setSkillBoost(SkillId.Prayer, Math.min(prayer.baseLevel, current + 22));
        player.prayer.resetDrainAccumulator();
        services.messaging.sendGameMessage(player, "You catch the moonlight moth and feel your Prayer points restored.");
    } });
    const escape = ({ player, services }: { player: PlayerState; services: ScriptServices }) => { const run = runs.get(player.id); if (!run) return; const current = run.active ? MOONS[run.active] : undefined; services.instances.leave(player, current?.outside ?? CHEST_TILE); services.messaging.sendGameMessage(player, "You escape the Moon chamber. Your progress remains with the Lunar chest."); };
    for (const escapeId of [53003, 53004]) { for (const action of ["escape", "exit", "climb-up"]) registry.registerLocInteraction(escapeId, escape, action); registry.registerLocInteraction(escapeId, escape); }
    for (const [moon, def] of Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>) registry.registerNpcPreDeath(def.id, event => { const player = event.killer, run = player && runs.get(player.id); if (!player || !run || run.active !== moon || event.npc.ownerPlayerId !== player.id) return NpcPreDeathDecision.Allow; run.killed.add(moon); run.active = undefined; event.services.scheduler.after(6, () => { if (player.worldViewId !== event.npc.worldViewId) return; if (run.killed.size === 3) servicesAfter(event, player, CHEST_TILE); else { event.services.instances.leave(player, MOONS[def.next].outside); event.services.messaging.sendGameMessage(player, `${moon[0].toUpperCase()}${moon.slice(1)} Moon defeated. Choose another Moon statue to continue this run.`); } }, { kind: "player", id: player.id }); return NpcPreDeathDecision.Allow; });
}
function servicesAfter(event: { services: ScriptServices }, player: PlayerState, tile: { x: number; y: number; level: number }): void { event.services.instances.leave(player, tile); event.services.messaging.sendGameMessage(player, "All three Moons have been defeated. You may now search the Lunar chest."); }
