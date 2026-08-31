import type { PlayerState } from "@server/game/player";
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
const MOONS: Record<Moon, { id: number; entry: { x: number; y: number; level: number }; boss: { x: number; y: number; level: number }; next: Moon }> = {
    blood: { id: 13011, entry: { x: 1406, y: 9632, level: 0 }, boss: { x: 1391, y: 9631, level: 0 }, next: "eclipse" },
    eclipse: { id: 13012, entry: { x: 1475, y: 9632, level: 0 }, boss: { x: 1487, y: 9631, level: 0 }, next: "blue" },
    blue: { id: 13013, entry: { x: 1440, y: 9666, level: 0 }, boss: { x: 1439, y: 9679, level: 0 }, next: "blood" },
};
type Run = { killed: Set<Moon>; active?: Moon; instanceId: string };
const runs = new Map<number, Run>();

function registerEncounters(): void {
    for (const [key, moon] of Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>) {
        if (EncounterRegistry.shared.get(`moon-${key}`)) continue;
        registerEncounter({ id: `moon-${key}`, npcTypeIds: [moon.id], maxHealth: 500, bossHealthBar: { name: `${key[0].toUpperCase()}${key.slice(1)} Moon`, npcTypeId: moon.id }, movement: { wanderRadius: 0, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 60, retreatInteractionRange: 60 }, attacks: [{ id: "attack", type: AttackType.Melee, rangeTiles: 30, preferredDistance: 1, speedTicks: 4, maxHit: 20, animation: "attack" }] });
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
    const npc = services.npc.spawnNpc({ id: def.id, x: def.boss.x, y: def.boss.y, level: 0, worldViewId: player.worldViewId, ownerPlayerId: player.id, wanderRadius: 0, isAggressive: true, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, respawns: false });
    if (!npc) { services.messaging.sendGameMessage(player, "The Moon fails to awaken. Please try again."); return; }
    run.active = moon; services.npc.engageCombat(npc, player);
}

function createRun(player: PlayerState, services: ScriptServices, first: Moon, access: "solo" | "party" = "solo"): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 1392, sourceBaseY: 9616, widthChunks: 13, heightChunks: 13, sourcePlanes: [0], destinationChunkX: 0, destinationChunkY: 0 }]);
    const room = services.instances.create(player, { definitionId: "moons-of-peril", access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party", templateChunks, destination: MOONS.blue.entry, exit: CHEST_TILE });
    if (!room) { services.messaging.sendGameMessage(player, "The Moon chamber is unavailable right now."); return; }
    runs.set(player.id, { killed: new Set(), instanceId: room.id }); services.instances.markStarted(room.id); spawnMoon(player, services, first);
}

/** Rebuild a fresh room when an early chest choice sends a player back in. */
function resumeRun(player: PlayerState, services: ScriptServices, next: Moon): void {
    const run = runs.get(player.id);
    if (!run || services.instances.get(player.id)) return;
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 1392, sourceBaseY: 9616, widthChunks: 13, heightChunks: 13, sourcePlanes: [0], destinationChunkX: 0, destinationChunkY: 0 }]);
    const room = services.instances.create(player, { definitionId: "moons-of-peril", access: "solo", maxPlayers: 1, templateChunks, destination: MOONS[next].entry, exit: CHEST_TILE });
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
    services.dialog.openDialogOptions(player, { id: `moon-enter-${moon}`, title: `Enter the ${moon} Moon chamber`, options: ["Enter solo", "Create a party instance", "Join a party instance"], modal: true, onSelect: choice => { if (choice === 0) createRun(player, services, moon); else if (choice === 1) createRun(player, services, moon, "party"); else if (choice === 2) showJoinOptions(player, services); } });
}

function reward(player: PlayerState, services: ScriptServices): void {
    const run = runs.get(player.id); if (!run || run.killed.size === 0) { services.messaging.sendGameMessage(player, "This chest seems empty."); return; }
    const count = run.killed.size;
    const resources = [{ itemId: 28899, quantity: 60 + count * 20 }, { itemId: 1939, quantity: 400 + count * 150 }, { itemId: 571, quantity: 60 + count * 30 }, { itemId: 6034, quantity: 20 + count * 10 }, { itemId: 1761, quantity: 20 + count * 10 }, { itemId: 205, quantity: 30 + count * 10 }, { itemId: 209, quantity: 20 + count * 8 }];
    const uniques = [29000, 29004, 29007, 29010, 28988, 29013, 29016, 29019, 29022, 29025, 29028, 28997];
    const rewards = [resources[Math.floor(Math.random() * resources.length)]!, { itemId: 28991, quantity: 100 + count * 75 }];
    if (Math.random() < count / 60) rewards.push({ itemId: uniques[Math.floor(Math.random() * uniques.length)]!, quantity: 1 });
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
            if (next) resumeRun(player, services, next);
        }
    } });
}

function giveIfMissing(player: PlayerState, services: ScriptServices, itemId: number, quantity = 1): void {
    if (!player.items.hasItem(itemId, 1)) addOrDrop(player, services, itemId, quantity);
}
function takeSupplies(player: PlayerState, services: ScriptServices): void {
    services.dialog.openDialogOptions(player, { id: "moon-supplies", title: "Take supplies", options: ["Fishing supplies", "Hunting supplies", "Herblore supplies"], modal: true, onSelect: choice => {
        if (choice === 0) giveIfMissing(player, services, NET);
        if (choice === 1) { giveIfMissing(player, services, ROPE); giveIfMissing(player, services, BUTTERFLY_NET); }
        if (choice === 2) { giveIfMissing(player, services, PESTLE); giveIfMissing(player, services, VIAL, 2); }
        services.inventory.snapshotInventoryImmediate(player);
    } });
}

function skillLevel(player: PlayerState, skill: SkillId): number { return player.skillSystem.getSkill(skill).baseLevel; }
function drinkMoonlightPotion(player: PlayerState, services: ScriptServices, itemId: number): void {
    const doses = 29083 - itemId + 1;
    if (doses < 1 || doses > 4 || player.items.removeItem(itemId, 1, { assureFullRemoval: true }).completed !== 1) return;
    if (doses > 1) addOrDrop(player, services, itemId + 1, 1); else addOrDrop(player, services, VIAL, 1);
    for (const skill of [SkillId.Attack, SkillId.Strength, SkillId.Defence] as const) {
        const current = player.skillSystem.getSkill(skill).baseLevel + player.skillSystem.getSkill(skill).boost;
        const boost = Math.floor(skillLevel(player, skill) * 0.15) + 3;
        player.skillSystem.setSkillBoost(skill, current + boost);
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
    registry.registerLocInteraction(CHEST, ({ player, services }) => searchChest(player, services), "search"); registry.registerLocInteraction(CHEST, ({ player, services }) => searchChest(player, services));
    registry.registerLocInteraction(CRATE, ({ player, services }) => takeSupplies(player, services), "take-from");
    registry.registerLocInteraction(SAPLING, ({ player, services }) => { addOrDrop(player, services, GRUB, 2); services.inventory.snapshotInventoryImmediate(player); }, "collect-from");
    const fish = ({ player, services }: { player: PlayerState; services: ScriptServices }) => { if (!player.items.hasItem(NET, 1)) return services.messaging.sendGameMessage(player, "You need a small fishing net to fish here."); const fishing = skillLevel(player, SkillId.Fishing); addOrDrop(player, services, BREAM, fishing >= 50 && Math.random() < Math.min(0.8, fishing / 120) ? 2 : 1); services.inventory.snapshotInventoryImmediate(player); };
    for (const locId of FISHING_SPOTS) {
        for (const action of ["net", "fish", "small-net"]) registry.registerLocInteraction(locId, fish, action);
        registry.registerLocInteraction(locId, fish);
    }
    registry.registerItemOnItem(GRUB, PESTLE, ({ player, services }) => { if (player.items.removeItem(GRUB, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, PASTE, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnItem(PASTE, VIAL, ({ player, services }) => { if (player.items.removeItem(PASTE, 1, { assureFullRemoval: true }).completed && player.items.removeItem(VIAL, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, 29080, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnLoc(BREAM, STOVE, ({ player, services }) => { if (player.items.removeItem(BREAM, 1, { assureFullRemoval: true }).completed) { const cooking = skillLevel(player, SkillId.Cooking); addOrDrop(player, services, COOKED_BREAM, cooking >= 50 && Math.random() < Math.min(0.8, cooking / 120) ? 2 : 1); services.inventory.snapshotInventoryImmediate(player); } });
    for (const potion of [29080, 29081, 29082, 29083]) registry.registerItemAction(potion, ({ player, services }) => drinkMoonlightPotion(player, services, potion), "drink");
    for (const mothId of MOONLIGHT_MOTHS) registry.registerNpcScript({ npcId: mothId, option: "catch", handler: ({ player, services }) => {
        if (!player.items.hasItem(BUTTERFLY_NET, 1)) { services.messaging.sendGameMessage(player, "You need a butterfly net to catch this moth."); return; }
        const prayer = player.skillSystem.getSkill(SkillId.Prayer);
        const current = Math.max(0, prayer.baseLevel + prayer.boost);
        player.skillSystem.setSkillBoost(SkillId.Prayer, Math.min(prayer.baseLevel, current + 22));
        player.prayer.resetDrainAccumulator();
        services.messaging.sendGameMessage(player, "You catch the moonlight moth and feel your Prayer points restored.");
    } });
    for (const escape of [53003, 53004]) registry.registerLocInteraction(escape, ({ player, services }) => { const run = runs.get(player.id); if (!run) return; services.instances.leave(player, CHEST_TILE); services.messaging.sendGameMessage(player, "You escape the Moon chamber. Your progress remains with the Lunar chest."); }, "escape");
    for (const [moon, def] of Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>) registry.registerNpcPreDeath(def.id, event => { const player = event.killer, run = player && runs.get(player.id); if (!player || !run || run.active !== moon || event.npc.ownerPlayerId !== player.id) return NpcPreDeathDecision.Allow; run.killed.add(moon); run.active = undefined; if (run.killed.size === 3) { servicesAfter(event, player, CHEST_TILE); } else spawnMoon(player, event.services, def.next); return NpcPreDeathDecision.Allow; });
}
function servicesAfter(event: { services: ScriptServices }, player: PlayerState, tile: { x: number; y: number; level: number }): void { event.services.instances.leave(player, tile); event.services.messaging.sendGameMessage(player, "All three Moons have been defeated. You may now search the Lunar chest."); }
