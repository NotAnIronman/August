import { AttackType } from "@server/game/combat/AttackType";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { spawnAdds, spawnFloorHazard, type MechanicHandle } from "@server/game/encounters/mechanics";
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
const FOOD_PILE_IDS = [14205, 14206] as const;
const INSTANCE_ID = "scurrius-lair";
const ENTRANCE = Object.freeze({ x: 3281, y: 9868, level: 0 });
const INSIDE = Object.freeze({ x: 3290, y: 9868, level: 0 });
const GRAVE = Object.freeze({ locId: 9359, tile: { x: 3281, y: 9867 }, level: 0 });
const BOSS_TILE = Object.freeze({ x: 3303, y: 9872, level: 0 });
const CENTRE_TILE = Object.freeze({ x: 3298, y: 9867, level: 0 });
const ROCKFALL_BOUNDS = Object.freeze({ minX: 3292, maxX: 3305, minY: 9861, maxY: 9874 });
const ROCKFALL_TELL_LOC_ID = 56358;
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
    ratMechanic?: MechanicHandle;
}

const states = new WeakMap<NpcState, ScurriusState>();
const cheeseCreditsByPlayer = new WeakMap<PlayerState, number>();

function stateFor(npc: NpcState): ScurriusState {
    let state = states.get(npc);
    if (!state) {
        state = { fed: false, finalPhase: false, eating: false, bites: 0, summonReadyAt: 0, rockReadyAt: 0 };
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
            killcount: { name: "Scurrius", collectionLogStructId: 777 },
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
    const scurrius = services.npc.findNearbyNpc(player, SCURRIUS_ID, 30);
    if (scurrius) {
        installScurriusHealthController(scurrius, room.id, services);
        services.npc.queueNpcSeq(scurrius, 10686);
    }
    services.instances.markStarted(room.id);
}

function beginEating(npc: NpcState, state: ScurriusState, roomId: string, services: ScriptServices): void {
    if (state.fed || npc.getHitpoints() <= 0) return;
    state.fed = true;
    state.eating = true;
    state.bites = 0;
    const rng = services.encounters.ensure(npc)?.rng;
    const pile = FOOD_PILES[rng?.nextInt(FOOD_PILES.length) ?? 0] ?? FOOD_PILES[0];
    // Clear the active chase before sending him to food.  Eating only begins
    // after the route completes, never at the tile where he crossed 80% HP.
    services.npc.disengageCombat(npc);
    if (!services.npc.moveNpcTo(npc, pile, true)) services.npc.teleportNpc(npc, pile);
    const takeBite = (): void => {
        if (!state.eating || npc.getHitpoints() <= 0 || state.bites >= 5) { state.eating = false; return; }
        if (npc.tileX !== pile.x || npc.tileY !== pile.y) {
            services.scheduler.after(1, takeBite, { kind: "npc", id: npc.id });
            return;
        }
        services.npc.queueNpcSeq(npc, state.bites === 0 ? 10688 : 10689);
        // Cache spot 84 is the standard green healing indicator.
        services.npc.queueNpcSpotAnim(npc, 84);
        npc.heal((5 + (rng?.nextInt(2) ?? 0) * 5) * Math.max(1, services.instances.getMemberPlayers(roomId).length));
        state.bites++;
        if (state.bites >= 5) { state.eating = false; return; }
        services.scheduler.after(4, takeBite, { kind: "npc", id: npc.id });
    };
    services.scheduler.after(4, takeBite, { kind: "npc", id: npc.id });
}

function installScurriusHealthController(npc: NpcState, roomId: string, services: ScriptServices): void {
    npc.onHealthChange((change) => {
        const state = stateFor(npc);
        if (change.reason === "reset") {
            state.ratMechanic?.cancel();
            states.set(npc, { fed: false, finalPhase: false, eating: false, bites: 0, summonReadyAt: 0, rockReadyAt: 0 });
            return;
        }
        if (change.current <= 0) return;
        const healthPercent = (change.current / Math.max(1, npc.getMaxHitpoints())) * 100;
        if (healthPercent <= 80) beginEating(npc, state, roomId, services);
        if (!state.finalPhase && healthPercent <= 30) {
            state.finalPhase = true;
            state.eating = false;
            if (!services.npc.moveNpcTo(npc, CENTRE_TILE, true)) services.npc.teleportNpc(npc, CENTRE_TILE);
        }
    });
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
    const rng = services.encounters.ensure(npc)?.rng;
    services.scheduler.after(travel, (impactTick) => {
        if (target.worldViewId !== npc.worldViewId || target.level !== npc.level) return;
        const damage = protectedFrom(target, type) ? 0 : (rng?.nextInt(maxHit + 1) ?? 0);
        services.combat.applyNpcDamageToPlayer(npc, target, type === AttackType.Magic ? 2 : 1, damage, impactTick);
    }, { kind: "npc", id: npc.id });
}

function summonRats(npc: NpcState, target: PlayerState, services: ScriptServices, state: ScurriusState): void {
    if (state.ratMechanic?.isActive) return;
    const runtime = services.encounters.ensure(npc);
    if (!runtime) return;
    state.ratMechanic = runtime.runMechanic("scurrius-rats", "ignore", () =>
        spawnAdds(runtime, services, {
            id: "scurrius-rats", npcTypeId: RAT_ID, count: 6, formation: "ring", radius: 2,
            target, attackSpeed: 4, lifetimeTicks: 150, suppressDrops: true,
        }),
    );
}

function fallingRocks(npc: NpcState, target: PlayerState, services: ScriptServices, roomId: string): void {
    const room = services.instances.getById(roomId);
    if (!room) return;
    const runtime = services.encounters.ensure(npc);
    if (!runtime) return;
    const players = services.instances.getMemberPlayers(room.id);
    const randomTiles = [] as Array<{ x: number; y: number; level: number }>;
    // Every shadow remains inside the room's playable 14x14 arena. The
    // current target receives one reserved tell; the other fourteen are
    // independently sampled from this full square.
    for (let x = ROCKFALL_BOUNDS.minX; x <= ROCKFALL_BOUNDS.maxX; x += 1) {
        for (let y = ROCKFALL_BOUNDS.minY; y <= ROCKFALL_BOUNDS.maxY; y += 1) {
            randomTiles.push({ x, y, level: npc.level });
        }
    }
    // Prevent the ordinary attack animation from immediately replacing Jump.
    services.npc.queueNpcSeq(npc, 10698);
    runtime.runMechanic("scurrius-falling-rocks", "stack", () =>
        spawnFloorHazard(runtime, services, {
            id: "scurrius-falling-rocks",
            randomTiles,
            targetMode: "current-target",
            currentTargetId: target.id,
            hazardQuantity: 15,
            // Cache loc 56358 is the selected one-tile rockfall shadow.
            // A loc tell is guaranteed to be rendered as scenery rather than
            // as an invisible NPC footprint.
            tell: { locId: ROCKFALL_TELL_LOC_ID, locShape: 10 },
            projectileId: 10,
            hazardTime: 5,
            liveTicks: 1,
            hazardDamage: (rng) => 15 + rng.nextInt(8),
            players,
            appliesTo: "all-members",
        }),
    );
}

function scurriusAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const { npc, target, attack, services, tick } = event;
    const room = services.instances.get(target.id);
    if (room?.definitionId !== INSTANCE_ID) return;
    const state = stateFor(npc);
    const healthPercent = (npc.getHitpoints() / Math.max(1, npc.getMaxHitpoints())) * 100;
    if (!state.fed && healthPercent <= 80) beginEating(npc, state, room.id, services);
    if (!state.finalPhase && healthPercent <= 30) { state.finalPhase = true; state.eating = false; services.npc.moveNpcTo(npc, CENTRE_TILE, true); }
    const rng = services.encounters.ensure(npc)?.rng;
    if (tick >= state.summonReadyAt && (rng?.next() ?? 1) < 1 / 12) { state.summonReadyAt = tick + 30; services.npc.queueNpcSeq(npc, 10700); summonRats(npc, target, services, state); }
    if (tick >= state.rockReadyAt && (rng?.next() ?? 1) < (state.finalPhase ? 1 / 4 : 1 / 10)) {
        state.rockReadyAt = tick + 10;
        fallingRocks(npc, target, services, room.id);
        return NpcAttackDecision.Prevent;
    }
    // The normal planner correctly gives melee absolute preference at one tile.
    // At a food pile, however, the live fight swaps that planned melee into a
    // projectile without changing the attack clock.
    if (attack.traits.type === AttackType.Melee) {
        if (state.eating) {
            const type = (rng?.next() ?? 0) < 0.5 ? AttackType.Ranged : AttackType.Magic;
            launchDelayedAttack(event, type, type === AttackType.Magic ? 8 : 7);
            return NpcAttackDecision.Prevent;
        }
        // The generic hit path is authoritative for a melee swing, but queue
        // the explicit reviewed sequence first so diagonal melee attacks can
        // never land without visual feedback.
        services.npc.queueNpcSeq(npc, 10693);
        return;
    }
    services.npc.queueNpcSeq(npc, attack.traits.type === AttackType.Magic ? 10696 : 10695);
    launchDelayedAttack(event);
    return NpcAttackDecision.Prevent;
}

function eatCheese({ player, services }: { player: PlayerState; services: ScriptServices }): void {
    if (!isScurriusRoom(player, services)) return;
    const credits = cheeseCreditsByPlayer.get(player) ?? 0;
    if (credits <= 0) { services.messaging.sendGameMessage(player, "You need to defeat Scurrius before you can eat from the food pile again."); return; }
    const current = player.skillSystem.getHitpointsCurrent();
    const maximum = player.skillSystem.getHitpointsMax();
    if (current >= maximum) { services.messaging.sendGameMessage(player, "You are already at full health."); return; }
    player.skillSystem.setHitpointsCurrent(Math.min(maximum, current + 25));
    cheeseCreditsByPlayer.set(player, credits - 1);
    services.animation.playPlayerSeq(player, 829);
    services.messaging.sendGameMessage(player, "You eat some cheese from the food pile.");
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
    for (const locId of FOOD_PILE_IDS) registry.registerLocInteraction(locId, eatCheese, "eat");
    registry.registerNpcAttack(SCURRIUS_ID, scurriusAttack);
    _services.combat.registerOnNpcKilled?.((killer, npc) => {
        if (npc.typeId !== SCURRIUS_ID || !isScurriusRoom(killer, _services)) return;
        cheeseCreditsByPlayer.set(killer, (cheeseCreditsByPlayer.get(killer) ?? 0) + 1);
    });
}
