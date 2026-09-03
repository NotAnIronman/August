import { SkillId } from "@august/osrs-engine/skill/skills";
import { AttackType } from "@server/game/combat/AttackType";
import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { spawnAdds, spawnFloorHazard, type MechanicHandle } from "@server/game/encounters/mechanics";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import {
    NpcAttackDecision,
    type IScriptRegistry,
    type LocInteractionEvent,
    type NpcAttackEvent,
    type ScriptServices,
} from "@server/game/scripts/types";

/** Araxxor's instanced Morytania lair.  All randomness lives on the encounter
 * runtime, so a reset starts a genuinely fresh encounter instead of retaining
 * a favourable special pattern from the prior attempt. */
const ENTRANCE_LOC_ID = 54161;
const ESCAPE_LOC_ID = 54274;
const INSTANCE_ID = "araxxor-lair";
const ARAXXOR_ID = 13668;
const DEAD_ARAXXOR_ID = 13669;
const MIRRORBACK_ID = 13671;
const RUPTURA_ID = 13673;
const ACIDIC_ARAXYTE_ID = 13675;
const SLAYER_LEVEL = 92;
const ENTRANCE = Object.freeze({ x: 3658, y: 9815, level: 0 });
const INSIDE = Object.freeze({ x: 3647, y: 9816, level: 0 });
const EXIT = ENTRANCE;
const GRAVE = Object.freeze({ locId: INSTANCE_GRAVE_RECLAIM_LOC_ID, tile: { x: 3660, y: 9818 }, level: 0 });
const BOSS_TILE = Object.freeze({ x: 3633, y: 9816, level: 0 });
const ROOM = Object.freeze({ minX: 3626, maxX: 3644, minY: 9803, maxY: 9828 });
// A cache loc tell is deliberately used for acid. It remains visible for the
// whole warning window even on caches whose spot graphic is an empty emitter.
const ACID_TELL_LOC_ID = 56358;
const ANIM = Object.freeze({
    idle: 11473, walk: 11474, run: 11475, ranged: 11476, acidDrip: 11477,
    acidSpray: 11478, magic: 11479, melee: 11480, death: 11481, spawn: 11482,
    slowMelee: 11483, slowRanged: 11484, enragedMelee: 11487,
    enrage: 11488, acidCannon: 11493,
    araxyteIdle: 11494, araxyteAttack: 11497, acidicAttack: 11498,
    mirrorbackAttack: 11500, araxyteDeath: 11502, rupturaExplode: 11504,
});

type Special = "acid-ball" | "acid-splatter" | "acid-drip";
interface AraxxorState {
    normalAttacks: number;
    special: Special;
    enraged: boolean;
    nextAddAt: number;
    activeAdds?: MechanicHandle;
}
const states = new WeakMap<NpcState, AraxxorState>();

function stateFor(npc: NpcState, services: ScriptServices): AraxxorState {
    let state = states.get(npc);
    if (!state) {
        const special = (["acid-ball", "acid-splatter", "acid-drip"] as const)[services.encounters.ensure(npc)?.rng.nextInt(3) ?? 0]!;
        state = { normalAttacks: 0, special, enraged: false, nextAddAt: 12 };
        states.set(npc, state);
    }
    return state;
}

function inLair(player: PlayerState, services: ScriptServices): boolean {
    return services.instances.get(player.id)?.definitionId === INSTANCE_ID;
}

function slayerEligible(player: PlayerState): boolean {
    const skill = player.skillSystem.getSkill(SkillId.Slayer);
    return skill.baseLevel + skill.boost >= SLAYER_LEVEL;
}

function registerEncounters(): void {
    if (!EncounterRegistry.shared.get("araxxor")) {
        registerEncounter({
            id: "araxxor", npcTypeIds: [ARAXXOR_ID, DEAD_ARAXXOR_ID], maxHealth: 1020,
            bossHealthBar: { name: "Araxxor", npcTypeId: ARAXXOR_ID },
            // catalog collection-log.json: Araxxor is boss category struct 995.
            killcount: { name: "Araxxor", collectionLogStructId: 995 },
            movement: { wanderRadius: 5, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [
                { id: "melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 6, maxHit: 31, animationId: ANIM.melee },
                { id: "magic", type: AttackType.Magic, rangeTiles: 10, preferredDistance: 1, speedTicks: 6, maxHit: 28, animationId: ANIM.magic, effects: { poisonDamage: 8 } },
                { id: "enraged-melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 4, maxHit: 31, animationId: ANIM.enragedMelee },
                { id: "enraged-magic", type: AttackType.Magic, rangeTiles: 10, preferredDistance: 1, speedTicks: 4, maxHit: 28, animationId: ANIM.slowRanged, effects: { poisonDamage: 8 } },
            ],
            phases: [
                { id: "normal", startsAtHealthPercent: 100, attackIds: ["melee", "magic"] },
                { id: "enraged", startsAtHealthPercent: 25, attackIds: ["enraged-melee", "enraged-magic"] },
            ],
        });
    }
    for (const minion of [
        { id: MIRRORBACK_ID, name: "araxxor-mirrorback", maxHit: 12 },
        { id: RUPTURA_ID, name: "araxxor-ruptura", maxHit: 1 },
        { id: ACIDIC_ARAXYTE_ID, name: "araxxor-acidic-araxyte", maxHit: 15 },
    ]) {
        if (EncounterRegistry.shared.get(minion.name)) continue;
        registerEncounter({
            id: minion.name, npcTypeIds: [minion.id], maxHealth: minion.id === RUPTURA_ID ? 35 : 50,
            movement: { wanderRadius: 2, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            attacks: [{ id: "attack", type: AttackType.Melee, rangeTiles: minion.id === ACIDIC_ARAXYTE_ID ? 8 : 1, preferredDistance: 1, speedTicks: minion.id === MIRRORBACK_ID ? 6 : 4, maxHit: minion.maxHit, animationId: minion.id === ACIDIC_ARAXYTE_ID ? ANIM.acidicAttack : minion.id === MIRRORBACK_ID ? ANIM.mirrorbackAttack : ANIM.araxyteAttack, effects: minion.id === ACIDIC_ARAXYTE_ID ? { poisonDamage: 6 } : undefined }],
        });
    }
}

function createRoom(player: PlayerState, services: ScriptServices, access: "solo" | "party"): void {
    if (!slayerEligible(player)) { services.messaging.sendGameMessage(player, "You need a Slayer level of 92 to fight Araxxor."); return; }
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    // Native room bounds are 3626..3644, 9803..9828. The extra border chunks
    // preserve wall collision and prevent the private scene from clipping.
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 3624, sourceBaseY: 9800, widthChunks: 3, heightChunks: 4, sourcePlanes: [0], destinationChunkX: 4, destinationChunkY: 4 }]);
    const baseX = ((INSIDE.x >> 3) - 6) * 8;
    const baseY = ((INSIDE.y >> 3) - 6) * 8;
    const room = services.instances.create(player, {
        definitionId: INSTANCE_ID, access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party",
        templateChunks, destination: INSIDE, exit: EXIT, grave: GRAVE,
        npcs: [{ id: ARAXXOR_ID, offsetX: BOSS_TILE.x - baseX, offsetY: BOSS_TILE.y - baseY, level: 0, size: 3, attackSpeed: 6, isAggressive: true, aggressionRadius: 30, wanderRadius: 5 }],
    });
    if (!room) { services.messaging.sendGameMessage(player, "Araxxor's lair is unavailable right now."); return; }
    const boss = services.npc.findNearbyNpc(player, ARAXXOR_ID, 40);
    if (boss) {
        services.npc.queueNpcSeq(boss, ANIM.spawn);
        boss.onHealthChange((change) => {
            const state = stateFor(boss, services);
            if (change.reason === "reset") { state.activeAdds?.cancel(); states.delete(boss); return; }
            if (!state.enraged && change.current > 0 && change.current <= 255) {
                state.enraged = true;
                services.npc.queueNpcSeq(boss, ANIM.enrage);
                services.npc.queueNpcForcedChat(boss, "Araxxor becomes enraged!");
            }
        });
    }
    services.instances.markStarted(room.id);
}

function showJoinOptions(player: PlayerState, services: ScriptServices): void {
    const rooms = services.instances.listJoinable(INSTANCE_ID);
    if (!rooms.length) { services.messaging.sendGameMessage(player, "There are no joinable Araxxor parties."); return; }
    const visible = rooms.slice(0, 5);
    services.dialog.openDialogOptions(player, { id: "araxxor-join", title: "Join an Araxxor party", options: visible.map(room => `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`), modal: true, onSelect: choice => { const room = visible[choice]; if (!room || !services.instances.join(player, room.id)) services.messaging.sendGameMessage(player, "That party is no longer available."); } });
}

function entryOptions(player: PlayerState, services: ScriptServices): void {
    if (inLair(player, services)) { services.instances.leave(player, EXIT); return; }
    services.dialog.openDialogOptions(player, { id: "araxxor-entry", title: "Enter Araxxor's lair", options: ["Enter solo", "Create a party instance", "Join a party instance"], modal: true, onSelect: choice => { if (choice === 0) createRoom(player, services, "solo"); else if (choice === 1) createRoom(player, services, "party"); else if (choice === 2) showJoinOptions(player, services); } });
}

function peek({ player, services }: LocInteractionEvent): void {
    const room = services.instances.get(player.id);
    const count = room?.definitionId === INSTANCE_ID
        ? room.memberPlayerIds.length
        : services.instances.listJoinable(INSTANCE_ID).reduce((total, entry) => total + entry.memberPlayerIds.length, 0);
    services.messaging.sendGameMessage(player, count > 0
        ? `You can see ${count} adventurer${count === 1 ? "" : "s"} in an Araxxor lair.`
        : "You cannot see anyone waiting in a joinable Araxxor lair.");
}

function roomTiles(): Array<{ x: number; y: number; level: number }> {
    const tiles: Array<{ x: number; y: number; level: number }> = [];
    for (let x = ROOM.minX + 1; x < ROOM.maxX; x += 1) for (let y = ROOM.minY + 1; y < ROOM.maxY; y += 1) tiles.push({ x, y, level: 0 });
    return tiles;
}

function acidPatches(npc: NpcState, target: PlayerState, services: ScriptServices, count: number, targetPlayer: boolean): void {
    const runtime = services.encounters.ensure(npc); if (!runtime) return;
    const room = services.instances.get(target.id); if (!room) return;
    runtime.runMechanic("araxxor-acid", "stack", () => spawnFloorHazard(runtime, services, {
        id: "araxxor-acid", randomTiles: roomTiles(), targetMode: targetPlayer ? "current-target" : "random", currentTargetId: target.id,
        hazardQuantity: count, tell: { locId: ACID_TELL_LOC_ID, locShape: 10 }, hazardTime: 2, liveTicks: 10,
        tickInterval: 2, hazardDamage: rng => 4 + rng.nextInt(8), players: services.instances.getMemberPlayers(room.id), appliesTo: "all-members",
    }));
}

function spawnSpecialAdds(npc: NpcState, target: PlayerState, services: ScriptServices, state: AraxxorState): void {
    const runtime = services.encounters.ensure(npc); if (!runtime || state.activeAdds?.isActive) return;
    const id = runtime.rng.nextInt(3) === 0 ? MIRRORBACK_ID : runtime.rng.nextInt(2) === 0 ? RUPTURA_ID : ACIDIC_ARAXYTE_ID;
    state.activeAdds = runtime.runMechanic("araxxor-araxyte", "replace", () => spawnAdds(runtime, services, { id: "araxxor-araxyte", npcTypeId: id, count: 1, formation: "scatter", radius: 4, target, attackSpeed: 4, lifetimeTicks: 80, suppressDrops: true }));
}

function araxxorAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const { npc, target, services, tick } = event;
    if (!inLair(target, services)) return;
    const state = stateFor(npc, services);
    const runtime = services.encounters.ensure(npc);
    if (!state.enraged && npc.getHitpoints() <= 255) { state.enraged = true; services.npc.queueNpcForcedChat(npc, "Araxxor becomes enraged!"); }
    if (tick >= state.nextAddAt) { state.nextAddAt = tick + 18; spawnSpecialAdds(npc, target, services, state); }
    state.normalAttacks += 1;
    if (state.normalAttacks < 6) {
        // In the final quarter Araxxor's normal clock is four ticks, and its
        // melee becomes a three-tile cleave that leaves acid behind.
        if (state.enraged && event.attack.traits.type === AttackType.Melee) acidPatches(npc, target, services, 3, true);
        return;
    }
    state.normalAttacks = 0;
    services.npc.queueNpcSeq(npc, state.special === "acid-ball" ? ANIM.acidCannon : state.special === "acid-splatter" ? ANIM.acidSpray : ANIM.acidDrip);
    if (state.special === "acid-ball") {
        acidPatches(npc, target, services, 9, true);
        services.messaging.sendGameMessage(target, "Araxxor hurls a ball of acid!");
    } else if (state.special === "acid-splatter") {
        acidPatches(npc, target, services, 14, false);
        services.messaging.sendGameMessage(target, "Araxxor splatters acid across the lair!");
    } else {
        // The repeated targeted patches follow the player for six ticks.
        for (let delay = 0; delay < 6; delay += 1) services.scheduler.after(delay, () => acidPatches(npc, target, services, 1, true), { kind: "npc", id: npc.id });
        services.messaging.sendGameMessage(target, "Acid drips towards you!");
    }
    return NpcAttackDecision.Prevent;
}

function rupturaAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const { npc, target, services, tick } = event;
    const distance = Math.max(Math.abs(npc.tileX - target.tileX), Math.abs(npc.tileY - target.tileY));
    if (distance > 1) return;
    const damage = distance <= 1 ? 80 : Math.max(7, 80 - distance * 18);
    services.combat.applyNpcDamageToPlayer(npc, target, HITMARK_DAMAGE, damage, tick);
    services.npc.removeNpc(npc.id);
    return NpcAttackDecision.Prevent;
}

function escape({ player, services }: LocInteractionEvent): void {
    if (inLair(player, services)) services.instances.leave(player, EXIT);
    else services.movement.teleportPlayer(player, INSIDE.x, INSIDE.y, INSIDE.level);
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerEncounters();
    // Some cache definitions expose the cave entrance as an unnamed first
    // option. Keep the id-specific fallback in addition to named actions.
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services: eventServices }) => entryOptions(player, eventServices));
    for (const action of ["enter", "open", "climb", "enter solo"]) registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services: eventServices }) => action === "enter solo" ? createRoom(player, eventServices, "solo") : entryOptions(player, eventServices), action);
    registry.registerLocInteraction(ENTRANCE_LOC_ID, peek, "peek");
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services: eventServices }) => createRoom(player, eventServices, "party"), "enter party");
    registry.registerLocInteraction(ENTRANCE_LOC_ID, ({ player, services: eventServices }) => showJoinOptions(player, eventServices), "join party");
    for (const action of ["quick-escape", "escape", "exit", "climb-up"]) registry.registerLocInteraction(ESCAPE_LOC_ID, escape, action);
    registry.registerLocInteraction(ESCAPE_LOC_ID, escape);
    registry.registerNpcAttack(ARAXXOR_ID, araxxorAttack);
    registry.registerNpcAttack(RUPTURA_ID, rupturaAttack);
    // Keep the encounter hostile in a party even when its original target
    // leaves: the generic aggressive target selector picks another member.
    services.combat.registerOnNpcKilled?.((killer, npc) => {
        if (npc.typeId !== ARAXXOR_ID || !inLair(killer, services)) return;
        services.messaging.sendGameMessage(killer, "Araxxor collapses into a pool of acid.");
    });
}
