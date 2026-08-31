import type { PlayerState } from "@server/game/player";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { NpcPreDeathDecision, type IScriptRegistry, type ScriptServices } from "@server/game/scripts/types";
import { openRewardDisplay } from "@server/content/gamemodes/vanilla/widgets/rewardDisplay";

const CHEST = 51346, CRATE = 51371, SAPLING = 51365, STOVE = 51362, FISHING = 51367;
const NET = 303, ROPE = 954, PESTLE = 233, VIAL = 227, GRUB = 29078, PASTE = 29079, BREAM = 29216, COOKED_BREAM = 29217;
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

function createRun(player: PlayerState, services: ScriptServices, first: Moon): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 1392, sourceBaseY: 9616, widthChunks: 13, heightChunks: 13, sourcePlanes: [0], destinationChunkX: 0, destinationChunkY: 0 }]);
    const room = services.instances.create(player, { definitionId: "moons-of-peril", access: "solo", templateChunks, destination: MOONS.blue.entry, exit: CHEST_TILE });
    if (!room) { services.messaging.sendGameMessage(player, "The Moon chamber is unavailable right now."); return; }
    runs.set(player.id, { killed: new Set(), instanceId: room.id }); services.instances.markStarted(room.id); spawnMoon(player, services, first);
}

function statue(player: PlayerState, services: ScriptServices, moon: Moon): void {
    services.dialog.openDialogOptions(player, { id: `moon-enter-${moon}`, title: `Enter the ${moon} Moon chamber`, options: ["Enter solo", "Cancel"], modal: true, onSelect: choice => { if (choice === 0) createRun(player, services, moon); } });
}

function reward(player: PlayerState, services: ScriptServices): void {
    const run = runs.get(player.id); if (!run || run.killed.size === 0) { services.messaging.sendGameMessage(player, "You need to defeat at least one Moon before searching the chest."); return; }
    const count = run.killed.size, rewards = [{ itemId: 995, quantity: 2_000 * count }, { itemId: 29082, quantity: count }];
    for (const item of rewards) addOrDrop(player, services, item.itemId, item.quantity);
    services.inventory.snapshotInventoryImmediate(player); for (const item of rewards) services.collectionLog.trackCollectionLogItem(player, item.itemId);
    openRewardDisplay(player, services, "Lunar chest", rewards); services.messaging.sendGameMessage(player, `You search the Lunar chest after defeating ${count} Moon${count === 1 ? "" : "s"}.`); runs.delete(player.id);
}

function takeSupplies(player: PlayerState, services: ScriptServices): void {
    services.dialog.openDialogOptions(player, { id: "moon-supplies", title: "Take supplies", options: ["Fishing supplies", "Hunting supplies", "Herblore supplies"], modal: true, onSelect: choice => { if (choice === 0) addOrDrop(player, services, NET, 1); if (choice === 1) addOrDrop(player, services, ROPE, 1); if (choice === 2) { addOrDrop(player, services, PESTLE, 1); addOrDrop(player, services, VIAL, 2); } services.inventory.snapshotInventoryImmediate(player); } });
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerEncounters();
    STATUES.forEach((id, index) => {
        const handler = ({ player, services }: { player: PlayerState; services: ScriptServices }) => statue(player, services, (["blood", "blue", "eclipse"] as Moon[])[index]!);
        registry.registerLocInteraction(id, handler, "enter");
        registry.registerLocInteraction(id, handler);
    });
    registry.registerLocInteraction(CHEST, ({ player, services }) => reward(player, services), "search"); registry.registerLocInteraction(CHEST, ({ player, services }) => reward(player, services));
    registry.registerLocInteraction(CRATE, ({ player, services }) => takeSupplies(player, services), "take-from");
    registry.registerLocInteraction(SAPLING, ({ player, services }) => { addOrDrop(player, services, GRUB, 2); services.inventory.snapshotInventoryImmediate(player); }, "collect-from");
    registry.registerLocInteraction(FISHING, ({ player, services }) => { if (!player.items.hasItem(NET, 1)) return services.messaging.sendGameMessage(player, "You need a small fishing net to fish here."); addOrDrop(player, services, BREAM, 1); services.inventory.snapshotInventoryImmediate(player); }, "net");
    registry.registerItemOnItem(GRUB, PESTLE, ({ player, services }) => { if (player.items.removeItem(GRUB, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, PASTE, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnItem(PASTE, VIAL, ({ player, services }) => { if (player.items.removeItem(PASTE, 1, { assureFullRemoval: true }).completed && player.items.removeItem(VIAL, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, 29080, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnLoc(BREAM, STOVE, ({ player, services }) => { if (player.items.removeItem(BREAM, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, COOKED_BREAM, 1); services.inventory.snapshotInventoryImmediate(player); } });
    for (const [moon, def] of Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>) registry.registerNpcPreDeath(def.id, event => { const player = event.killer, run = player && runs.get(player.id); if (!player || !run || run.active !== moon || event.npc.ownerPlayerId !== player.id) return NpcPreDeathDecision.Allow; run.killed.add(moon); run.active = undefined; if (run.killed.size === 3) { servicesAfter(event, player, CHEST_TILE); } else spawnMoon(player, event.services, def.next); return NpcPreDeathDecision.Allow; });
}
function servicesAfter(event: { services: ScriptServices }, player: PlayerState, tile: { x: number; y: number; level: number }): void { event.services.instances.leave(player, tile); event.services.messaging.sendGameMessage(player, "All three Moons have been defeated. You may now search the Lunar chest."); }
