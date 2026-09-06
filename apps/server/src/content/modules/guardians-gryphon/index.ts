import { attack, defineBoss } from "@server/game/encounters/BossDefinition";
import { defineBossRoom } from "@server/game/encounters/BossRoom";
import { registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import { GUARDIANS_GRYPHON_COMBAT_STATS } from "@server/data/guardiansGryphonCombatStats";
import type { DropEligibility } from "@server/game/combat/DamageTracker";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestInstanceHandle } from "@server/world/InstancedAreaManager";
import { VARP_COLLECTION_CATEGORY_COUNT } from "@server/game/collectionlog";
import { getFollowerDefinitionByItemId } from "@server/game/followers/followerDefinitions";
import { VARBIT_GUARDIANS_UNLOCKED } from "@august/game-model/world/BossAccess";
import { BOSS_ROOMS, roomGeometry, type FoundationRoom } from "./rooms";
import { encounterEligibility } from "./rewards";
export { VARBIT_GUARDIANS_UNLOCKED };
export const BRITTLE_KEY = 21724;
export function unlockGuardians(player: PlayerState, services: ScriptServices): boolean {
    if (player.varps.getVarbitValue(VARBIT_GUARDIANS_UNLOCKED) > 0)
        return true;
    if (!player.items.hasItem(BRITTLE_KEY, 1)) {
        services.messaging.sendGameMessage(player, "You need a brittle key to permanently unlock the Grotesque Guardians.");
        return false;
    }
    if (player.items.removeItem(BRITTLE_KEY, 1, { assureFullRemoval: true }).completed !== 1)
        return false;
    player.varps.setVarbitValue(VARBIT_GUARDIANS_UNLOCKED, 1);
    services.variables.sendVarbit(player, VARBIT_GUARDIANS_UNLOCKED, 1);
    services.inventory.snapshotInventoryImmediate(player);
    services.appearance.savePlayerSnapshot(player);
    services.messaging.sendGameMessage(player, "The brittle key crumbles. You have permanently unlocked the Grotesque Guardians.");
    return true;
}
interface RoomLife {
    readonly room: FoundationRoom;
    readonly instanceId: string;
    readonly npcs: NpcState[];
    readonly defeated: Set<NpcState>;
    readonly records: DropEligibility[];
    rewarded: boolean;
}
export function register(registry: IScriptRegistry, services: ScriptServices): void {
    // Provider-local state: no cross-instance or hot-reload reward leakage.
    const lives = new Map<number, RoomLife>();
    const tasks = new Set<number>();
    for (const room of BOSS_ROOMS)
        for (const spawn of room.bosses) {
            const stats = GUARDIANS_GRYPHON_COMBAT_STATS[spawn.id];
            registerOwnedEncounter(registry, defineBoss({ id: `${room.id}-${spawn.id}`, npcTypeIds: [spawn.id],
                maxHealth: stats.hitpoints, bossHealthBar: { name: stats.name, npcTypeId: spawn.id },
                // Completion/KC is encounter-owned: the two Guardians are one kill.
                immunities: { poison: true, venom: true },
                movement: { wanderRadius: 0, aggressionRadius: 24, aggressionToleranceTicks: 2147483647,
                    combatLeashRadius: 35, retreatInteractionRange: 40 },
                attacks: spawn.id === 7852 ? [attack.ranged({ maxHit: 15, speedTicks: 6, animation: "attack", rangeTiles: 10 })]
                    : spawn.id === 14860 ? [
                        attack.melee({ maxHit: 22, speedTicks: 5, animation: "melee" }),
                        attack.ranged({ maxHit: 22, speedTicks: 5, animation: "ranged", rangeTiles: 10, condition: ctx => ctx.targetDistance > 1 }),
                    ] : [attack.melee({ maxHit: 15, speedTicks: 6, animation: "melee" })],
            }));
        }
    const spawnLife = (room: FoundationRoom, instance: QuestInstanceHandle): void => {
        const npcs: NpcState[] = [];
        for (const spawn of room.bosses) {
            const npc = services.npc.spawnNpc({ ...spawn, level: room.inside.level, worldViewId: instance.worldViewId,
                ownerPlayerId: instance.access === "solo" ? instance.ownerPlayerId : undefined,
                wanderRadius: 0, respawns: false, isAggressive: true, isUnattackable: false,
                aggressionRadius: 24, aggressionToleranceTicks: 2147483647, combatLeashRadius: 35,
                retreatInteractionRange: 40, immunities: { poison: true, venom: true } });
            if (!npc || !services.instances.attachNpc(instance.id, npc)) {
                if (npc)
                    services.npc.removeNpc(npc.id);
                for (const previous of npcs)
                    services.npc.removeNpc(previous.id);
                for (const player of services.instances.getMemberPlayers(instance.id)) {
                    services.messaging.sendGameMessage(player, "The encounter could not be populated. Please enter again.");
                    services.instances.leave(player, room.outside);
                }
                return;
            }
            npcs.push(npc);
        }
        lives.set(instance.worldViewId, { room, instanceId: instance.id, npcs, defeated: new Set(), records: [], rewarded: false });
    };
    for (const room of BOSS_ROOMS) {
        const geometry = roomGeometry(room);
        const entry = defineBossRoom({ id: room.id, doorLocId: room.door, sceneBase: geometry.sceneBase,
            templateCopies: [geometry.copy], destination: room.inside, exit: room.outside, multiCombat: true,
            grave: { locId: 9359, tile: { x: room.outside.x, y: room.outside.y - 1 }, level: room.outside.level },
            canEnter: (player, eventServices) => {
                // Stale dialog selections must not teleport a player from a bank/another map.
                if (player.worldViewId !== -1 || player.level !== room.gate.level ||
                    Math.max(Math.abs(player.tileX - room.gate.x), Math.abs(player.tileY - room.gate.y)) > 6) {
                    eventServices.messaging.sendGameMessage(player, "Return to the encounter entrance first.");
                    return false;
                }
                return room.rewardNpcId !== 7882 || unlockGuardians(player, eventServices);
            },
            onCreated: instance => spawnLife(room, instance),
            actions: { entry: [undefined, "open"] },
            dialogs: { entry: { id: `${room.id}-entry`, title: `Enter ${room.name}` }, join: { id: `${room.id}-join`, title: `Join ${room.name}` } },
            messages: { alreadyInside: "You are already in an instance.", unavailable: "That encounter is currently unavailable.",
                leaveBeforeJoining: "Leave your current instance first.", noJoinableParties: `There are no joinable ${room.name} parties.`,
                partyUnavailable: "That party is no longer available.", peek: count => `${count} adventurer(s) in joinable ${room.name} parties.` },
        });
        entry.register(registry);
        if (room.rewardNpcId === 7882) {
            const unlock = (player: PlayerState, eventServices: ScriptServices) => {
                if (player.worldViewId !== -1 || player.level !== room.gate.level ||
                    Math.max(Math.abs(player.tileX - room.gate.x), Math.abs(player.tileY - room.gate.y)) > 6)
                    return;
                if (unlockGuardians(player, eventServices))
                    entry.showEntryOptions(player, eventServices);
            };
            registry.registerLocInteraction(room.door, ({ player, services: eventServices }) => unlock(player, eventServices), "unlock");
            registry.registerItemOnLoc(BRITTLE_KEY, room.door, ({ player, services: eventServices }) => unlock(player, eventServices));
        }
        for (const action of [undefined, "exit", "escape", "quick-escape"])
            registry.registerLocInteraction(room.exitId, ({ player, services: eventServices }) => {
                if (entry.leave(player, eventServices))
                    return;
                // The source roof's staircase must also return to the Slayer Tower gate.
                if (room.rewardNpcId === 7882 && player.worldViewId === -1 && player.level === 0 &&
                    Math.max(Math.abs(player.tileX - room.inside.x), Math.abs(player.tileY - room.inside.y)) <= 8)
                    eventServices.movement.teleportPlayer(player, room.outside.x, room.outside.y, room.outside.level);
            }, action);
    }
    const unregister = services.combat.registerOnNpcKilled?.((_killer, npc) => {
        const life = lives.get(npc.worldViewId);
        if (!life || !life.npcs.includes(npc) || life.defeated.has(npc))
            return;
        // The ordinary death animation/cleanup still runs, but never rolls a second reward.
        npc.suppressDrops = true;
        life.defeated.add(npc);
        life.records.push(services.combat.getDropEligibility(npc));
        if (life.defeated.size !== life.npcs.length || life.rewarded)
            return;
        life.rewarded = true;
        const instance = services.instances.getById(life.instanceId);
        if (!instance)
            return;
        const members = services.instances.getMemberPlayers(instance.id);
        const eligibility = encounterEligibility(life.records, members, life.npcs.reduce((total, boss) => total + boss.getMaxHitpoints(), 0), instance.memberPlayerIds.length, npc.worldViewId, npc.level);
        const rewardNpc = life.npcs.find(boss => boss.typeId === life.room.rewardNpcId)!;
        for (const player of eligibility.eligibleLooters) {
            player.collectionLog.incrementCategoryStat(life.room.logId);
            const count = player.collectionLog.getCategoryStat(life.room.logId)?.count1 ?? 0;
            services.variables.queueVarp?.(player.id, VARP_COLLECTION_CATEGORY_COUNT, count);
            services.messaging.sendGameMessage(player, `${life.room.name} killcount : ${count}`);
        }
        if (eligibility.eligibleLooters.length) {
            rewardNpc.suppressDrops = false;
            try {
                for (const drop of services.combat.rollNpcDrops(rewardNpc, eligibility)) {
                    const owner = eligibility.eligibleLooters.find(player => player.id === drop.ownerId);
                    if (!owner)
                        continue;
                    services.groundItems.spawn(drop.itemId, drop.quantity, { x: npc.tileX, y: npc.tileY, level: npc.level }, {
                        ownerId: owner.id, worldViewId: npc.worldViewId, isMonsterDrop: true,
                        petDropSource: { bossNpcTypeId: life.room.rewardNpcId, bossName: life.room.name,
                            killcount: owner.collectionLog.getCategoryStat(life.room.logId)?.count1 ?? 0 },
                    });
                    if (!getFollowerDefinitionByItemId(drop.itemId))
                        services.collectionLog.trackCollectionLogItem(owner, drop.itemId);
                }
            }
            finally {
                rewardNpc.suppressDrops = true;
            }
        }
        // Spawn the entire next life together; killing only Dawn/Dusk can never farm rewards.
        const task = services.scheduler.after(20, () => {
            tasks.delete(task);
            if (lives.get(npc.worldViewId) !== life)
                return;
            lives.delete(npc.worldViewId);
            const liveRoom = services.instances.getById(instance.id);
            if (liveRoom && services.instances.getMemberPlayers(instance.id).length)
                spawnLife(life.room, liveRoom);
        }, { kind: "instance", id: instance.id });
        tasks.add(task);
    });
    if (unregister)
        registry.registerCleanup(unregister);
    registry.registerTickHandler(() => {
        for (const [view, life] of lives)
            if (!services.instances.getById(life.instanceId))
                lives.delete(view);
    });
    registry.registerCleanup(() => {
        for (const task of tasks)
            services.scheduler.cancel(task);
        for (const life of lives.values()) {
            for (const player of services.instances.getMemberPlayers(life.instanceId)) {
                services.messaging.sendGameMessage(player, "This encounter was reloaded. Please enter again.");
                services.instances.leave(player, life.room.outside);
            }
        }
        tasks.clear();
        lives.clear();
    });
}
