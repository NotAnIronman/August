import { AttackType } from "@server/game/combat/AttackType";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { OverheadType } from "@server/game/prayer/OverheadType";
import {
    NpcAttackDecision,
    type IScriptRegistry,
    type NpcAttackEvent,
    type ScriptServices,
} from "@server/game/scripts/types";

const ENTRANCE_LOC_ID = 14203;
const EXIT_LOC_ID = 14204;
const SCURRIUS_ID = 7222;
const RAT_ID = 7223;
const INSTANCE_ID = "scurrius-lair";
const ENTRANCE = Object.freeze({ x: 3281, y: 9868, level: 0 });
const INSIDE = Object.freeze({ x: 3290, y: 9868, level: 0 });
const GRAVE = Object.freeze({ locId: 9359, tile: { x: 3281, y: 9867 }, level: 0 });
const BOSS_TILE = Object.freeze({ x: 3303, y: 9872, level: 0 });
const CENTRE_TILE = Object.freeze({ x: 3298, y: 9867, level: 0 });
const FOOD_PILES = Object.freeze([
    Object.freeze({ x: 3298, y: 9875 }),
    Object.freeze({ x: 3306, y: 9868 }),
    Object.freeze({ x: 3299, y: 9860 }),
]);

interface ScurriusState {
    fed: boolean;
    finalPhase: boolean;
    eating: boolean;
    bites: number;
    summonReadyAt: number;
    rockReadyAt: number;
    ratIds: Set<number>;
}

const states = new WeakMap<NpcState, ScurriusState>();

function stateFor(npc: NpcState): ScurriusState {
    let state = states.get(npc);
    if (!state) {
        state = { fed: false, finalPhase: false, eating: false, bites: 0, summonReadyAt: 0, rockReadyAt: 0, ratIds: new Set() };
        states.set(npc, state);
    }
    return state;
}

function isScurriusRoom(player: PlayerState, services: ScriptServices): boolean {
    return services.instances.get(player.id)?.definitionId === INSTANCE_ID;
}

function registerEncounters(): void {
    if (!EncounterRegistry.shared.get("scurrius")) {
        registerEncounter({
            id: "scurrius",
            npcTypeIds: [SCURRIUS_ID],
            maxHealth: 150,
            bossHealthBar: { name: "Scurrius", npcTypeId: SCURRIUS_ID },
            movement: { wanderRadius: 8, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 40, retreatInteractionRange: 45 },
            attacks: [
                { id: "melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 5, maxHit: 13, animation: "melee", condition: (context) => context.targetDistance <= 1 && context.healthPercent > 30 },
                { id: "ranged", type: AttackType.Ranged, rangeTiles: 12, preferredDistance: 1, speedTicks: 5, maxHit: 7, weight: 1, animation: "ranged", condition: (context) => context.healthPercent > 30 && context.targetDistance > 1 },
                { id: "magic", type: AttackType.Magic, rangeTiles: 12, preferredDistance: 1, speedTicks: 5, maxHit: 8, weight: 1, animation: "magic", condition: (context) => context.healthPercent > 30 && context.targetDistance > 1 },
                { id: "final-ranged", type: AttackType.Ranged, rangeTiles: 12, preferredDistance: 6, speedTicks: 4, maxHit: 7, weight: 1, animation: "ranged", condition: (context) => context.healthPercent <= 30 },
                { id: "final-magic", type: AttackType.Magic, rangeTiles: 12, preferredDistance: 6, speedTicks: 4, maxHit: 8, weight: 1, animation: "magic", condition: (context) => context.healthPercent <= 30 },
            ],
        });
    }
    if (!EncounterRegistry.shared.get("scurrius-giant-rat")) {
        registerEncounter({
            id: "scurrius-giant-rat", npcTypeIds: [RAT_ID], maxHealth: 15,
            movement: { wanderRadius: 5, aggressionRadius: 12, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 20, retreatInteractionRange: 20 },
            attacks: [{ id: "melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 4, maxHit: 3, animation: "attack" }],
        });
    }
}

function createRoom(player: PlayerState, services: ScriptServices, access: "solo" | "party"): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    // The lair spans the complete 3264..3319 / 9848..9903 area.  The destination
    // chunk positions preserve its native coordinates in the 104x104 instance view.
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 3264, sourceBaseY: 9848, widthChunks: 7, heightChunks: 7, sourcePlanes: [0], destinationChunkX: 3, destinationChunkY: 4 }]);
    const baseX = ((INSIDE.x >> 3) - 6) * 8;
    const baseY = ((INSIDE.y >> 3) - 6) * 8;
    const room = services.instances.create(player, {
        definitionId: INSTANCE_ID, access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party",
        templateChunks, destination: INSIDE, exit: ENTRANCE, grave: GRAVE,
        npcs: [{ id: SCURRIUS_ID, offsetX: BOSS_TILE.x - baseX, offsetY: BOSS_TILE.y - baseY, level: 0, attackSpeed: 5, isAggressive: true, aggressionRadius: 15 }],
    });
    if (!room) { services.messaging.sendGameMessage(player, "Scurrius' lair is unavailable right now."); return; }
    services.instances.markStarted(room.id);
}

function showJoinOptions(player: PlayerState, services: ScriptServices): void {
    const rooms = services.instances.listJoinable(INSTANCE_ID);
    if (!rooms.length) { services.messaging.sendGameMessage(player, "There are no joinable Scurrius parties."); return; }
    const visible = rooms.slice(0, 5);
    services.dialog.openDialogOptions(player, { id: "scurrius-instance-join", title: "Join a Scurrius party", options: visible.map((room) => `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`), modal: true, onSelect: (choice) => { const room = visible[choice]; if (!room || !services.instances.join(player, room.id)) services.messaging.sendGameMessage(player, "That party is no longer available."); } });
}

function entryOptions(player: PlayerState, services: ScriptServices): void {
    if (isScurriusRoom(player, services)) { services.instances.leave(player, ENTRANCE); return; }
    services.dialog.openDialogOptions(player, { id: "scurrius-instance-entry", title: "Enter Scurrius' lair", options: ["Enter solo", "Create a party instance", "Join a party instance"], modal: true, onSelect: (choice) => { if (choice === 0) createRoom(player, services, "solo"); else if (choice === 1) createRoom(player, services, "party"); else if (choice === 2) showJoinOptions(player, services); } });
}

function protectedFrom(player: PlayerState, type: AttackType): boolean {
    const overhead = player.combatAttributes.get(CombatAttributes.ACTIVE_OVERHEAD_PRAYER);
    return overhead === (type === AttackType.Magic ? OverheadType.MAGIC : OverheadType.RANGED);
}

function launchDelayedAttack(event: NpcAttackEvent, forcedType?: AttackType, forcedMaxHit?: number): void {
    const { npc, target, attack, services, tick } = event;
    const type = forcedType ?? attack.traits.type;
    const maxHit = forcedMaxHit ?? attack.traits.maxHitOverride ?? 0;
    const distance = Math.max(Math.abs(npc.tileX - target.tileX), Math.abs(npc.tileY - target.tileY));
    const travel = Math.max(2, Math.min(5, Math.ceil(distance / 3) + 1));
    services.projectiles.launch({ projectileId: type === AttackType.Magic ? 711 : 10, source: { tileX: npc.tileX, tileY: npc.tileY, plane: npc.level, actor: { kind: "npc", serverId: npc.id } }, target: { tileX: target.tileX, tileY: target.tileY, plane: target.level, actor: { kind: "player", serverId: target.id } }, sourceHeight: 90, endHeight: 20, slope: 20, startPos: 0, startCycleOffset: 0, endCycleOffset: travel * 30 });
    services.scheduler.after(travel, (impactTick) => {
        if (target.worldViewId !== npc.worldViewId || target.level !== npc.level) return;
        const damage = protectedFrom(target, type) ? 0 : Math.floor(Math.random() * (maxHit + 1));
        services.combat.applyNpcDamageToPlayer(npc, target, type === AttackType.Magic ? 2 : 1, damage, impactTick);
    }, { kind: "npc", id: npc.id });
}

function summonRats(npc: NpcState, services: ScriptServices, state: ScurriusState): void {
    for (const id of state.ratIds) {
        const rat = services.combat.getNpc(id);
        if (!rat || rat.getHitpoints() <= 0) state.ratIds.delete(id);
    }
    if (state.ratIds.size >= 6) return;
    const candidates = [[-2, -2], [0, -2], [2, -2], [-2, 0], [2, 0], [0, 2]];
    for (const [dx, dy] of candidates) {
        if (state.ratIds.size >= 6) break;
        const rat = services.npc.spawnNpc({ id: RAT_ID, x: npc.tileX + dx, y: npc.tileY + dy, level: npc.level, worldViewId: npc.worldViewId, ownerPlayerId: npc.ownerPlayerId, wanderRadius: 3, isAggressive: true, aggressionRadius: 12, attackSpeed: 4, lifetimeTicks: 150 });
        if (rat) state.ratIds.add(rat.id);
    }
}

function fallingRocks(npc: NpcState, services: ScriptServices, roomId: string): void {
    const room = services.instances.getById(roomId);
    if (!room) return;
    for (const player of services.instances.getMemberPlayers(room.id)) {
        const tile = { x: player.tileX, y: player.tileY, level: player.level };
        services.animation.playLocGraphic({ spotId: 60, tile, level: tile.level });
        services.projectiles.launch({ projectileId: 10, source: { tileX: npc.tileX, tileY: npc.tileY, plane: npc.level }, target: { tileX: tile.x, tileY: tile.y, plane: tile.level }, sourceHeight: 240, endHeight: 0, slope: 45, startPos: 0, startCycleOffset: 0, endCycleOffset: 150 });
        services.scheduler.after(5, (impactTick) => { if (player.worldViewId === npc.worldViewId && player.tileX === tile.x && player.tileY === tile.y && player.level === tile.level) services.combat.applyNpcDamageToPlayer(npc, player, 0, 15 + Math.floor(Math.random() * 8), impactTick); }, { kind: "npc", id: npc.id });
    }
    services.npc.queueNpcSeq(npc, 10698);
}

function scurriusAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const { npc, target, attack, services, tick } = event;
    const room = services.instances.get(target.id);
    if (room?.definitionId !== INSTANCE_ID) return;
    const state = stateFor(npc);
    const healthPercent = (npc.getHitpoints() / Math.max(1, npc.getMaxHitpoints())) * 100;
    if (!state.fed && healthPercent <= 80) {
        state.fed = true; state.eating = true; state.bites = 0;
        const pile = FOOD_PILES[Math.floor(Math.random() * FOOD_PILES.length)] ?? FOOD_PILES[0];
        services.npc.moveNpcTo(npc, pile, true);
        const takeBite = (): void => {
            if (!state.eating || npc.getHitpoints() <= 0 || state.bites >= 5) { state.eating = false; return; }
            npc.heal((5 + Math.floor(Math.random() * 2) * 5) * Math.max(1, services.instances.getMemberPlayers(room.id).length));
            state.bites++;
            if (state.bites >= 5) { state.eating = false; return; }
            services.scheduler.after(4, takeBite, { kind: "npc", id: npc.id });
        };
        services.scheduler.after(4, takeBite, { kind: "npc", id: npc.id });
    }
    if (!state.finalPhase && healthPercent <= 30) { state.finalPhase = true; state.eating = false; services.npc.moveNpcTo(npc, CENTRE_TILE, true); }
    if (tick >= state.summonReadyAt && Math.random() < 1 / 12) { state.summonReadyAt = tick + 30; services.npc.queueNpcSeq(npc, 10700); summonRats(npc, services, state); }
    if (tick >= state.rockReadyAt && Math.random() < (state.finalPhase ? 1 / 4 : 1 / 10)) { state.rockReadyAt = tick + 10; fallingRocks(npc, services, room.id); }
    // The normal planner correctly gives melee absolute preference at one tile.
    // At a food pile, however, the live fight swaps that planned melee into a
    // projectile without changing the attack clock.
    if (attack.traits.type === AttackType.Melee) {
        if (state.eating) {
            const type = Math.random() < 0.5 ? AttackType.Ranged : AttackType.Magic;
            launchDelayedAttack(event, type, type === AttackType.Magic ? 8 : 7);
            return NpcAttackDecision.Prevent;
        }
        return;
    }
    launchDelayedAttack(event);
    return NpcAttackDecision.Prevent;
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerEncounters();
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services }) => entryOptions(player, services), "open");
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services }) => {
        const count = services.instances.listJoinable(INSTANCE_ID).reduce((total, room) => total + room.memberPlayerIds.length, 0);
        services.messaging.sendGameMessage(player, count > 0 ? `You can see ${count} adventurer${count === 1 ? "" : "s"} in a Scurrius lair.` : "You cannot see anyone waiting in a joinable Scurrius lair.");
    }, "peek");
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services }) => createRoom(player, services, "solo"), "enter solo");
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services }) => createRoom(player, services, "party"), "enter party");
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services }) => showJoinOptions(player, services), "join party");
    for (const action of ["cross", "quick-escape", "exit"]) registry.registerLocInteraction(EXIT_LOC_ID, ({ player, services }) => { if (isScurriusRoom(player, services)) services.instances.leave(player, ENTRANCE); else services.movement.teleportPlayer(player, INSIDE.x, INSIDE.y, INSIDE.level); }, action);
    registry.registerLocInteraction(EXIT_LOC_ID, ({ player, services }) => { if (isScurriusRoom(player, services)) services.instances.leave(player, ENTRANCE); else services.movement.teleportPlayer(player, INSIDE.x, INSIDE.y, INSIDE.level); });
    registry.registerNpcAttack(SCURRIUS_ID, scurriusAttack);
}
