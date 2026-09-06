import { SkillId } from "@august/osrs-engine/skill/skills";
import { AttackType } from "@server/game/combat/AttackType";
import { partyLootEligibility, includeLethalContribution } from "@server/game/combat/PartyLootEligibility";
import { HITMARK_DAMAGE, HITMARK_VENOM } from "@server/game/combat/HitEffects";
import { isDeveloperGodmodeEnabled, isDeveloperInstakillEnabled } from "@server/game/dev/DeveloperFlags";
import { VARP_COLLECTION_CATEGORY_COUNT } from "@server/game/collectionlog";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import { attack, defineBoss, phase } from "@server/game/encounters/BossDefinition";
import { registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import { spawnFloorHazard } from "@server/game/encounters/mechanics";
import type { NpcState } from "@server/game/npc";
import type { PendingNpcDrop } from "@server/game/npcManager";
import type { PlayerState } from "@server/game/player";
import {
    NpcAttackDecision,
    NpcPreDeathDecision,
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
const MIRRORBACK_EGG_ID = 13670;
const MIRRORBACK_ID = 13671;
const RUPTURA_EGG_ID = 13672;
const RUPTURA_ID = 13673;
const ACIDIC_ARAXYTE_EGG_ID = 13674;
const ACIDIC_ARAXYTE_ID = 13675;
const SLAYER_LEVEL = 92;
const ENTRANCE = Object.freeze({ x: 3658, y: 9815, level: 0 });
const INSIDE = Object.freeze({ x: 3647, y: 9816, level: 0 });
const EXIT = ENTRANCE;
const GRAVE = Object.freeze({ locId: INSTANCE_GRAVE_RECLAIM_LOC_ID, tile: { x: 3660, y: 9818 }, level: 0 });
const BOSS_TILE = Object.freeze({ x: 3630, y: 9813, level: 0 });
// Native room expanded five tiles in each direction for the encounter's
// hazards and seven-by-seven body, while retaining a complete terrain border.
const ROOM = Object.freeze({ minX: 3616, maxX: 3649, minY: 9798, maxY: 9833 });
// A cache loc tell is deliberately used for acid. It remains visible for the
// whole warning window even on caches whose spot graphic is an empty emitter.
const ACID_TELL_LOC_ID = 56358;
const COAGULATED_VENOM_ID = 29781;
const NID_ID = 29836;
const NID_VARIANT_ID = 29837;
const ELITE_CLUE_ID = 19835;
const TICK_MS = Math.max(1, Number(process.env.TICK_MS) || 600);
const VENOM_TIME_LIMIT_TICKS = Math.floor((75 * 1000) / TICK_MS);
const EGG_HATCH_DELAY_TICKS = 8;
// The six confirmed Araxxor egg anchors. The remaining three anchors can be
// appended without touching hatch timing or colour order once mapped in-game.
const EGG_TILES = Object.freeze([
    { x: 3639, y: 9804, level: 0 },
    { x: 3635, y: 9801, level: 0 },
    { x: 3630, y: 9803, level: 0 },
    { x: 3630, y: 9828, level: 0 },
    { x: 3635, y: 9825, level: 0 },
    { x: 3640, y: 9827, level: 0 },
]);
const ANIM = Object.freeze({
    idle: 11473, walk: 11474, run: 11475, ranged: 11476, acidDrip: 11477,
    acidSpray: 11478, magic: 11479, melee: 11480, death: 11481, spawn: 11482,
    slowMelee: 11483, slowRanged: 11484, enragedMelee: 11487,
    enrage: 11488, acidCannon: 11493,
    araxyteIdle: 11494, araxyteAttack: 11497, acidicAttack: 11498,
    mirrorbackAttack: 11500, araxyteDeath: 11502, rupturaExplode: 11504,
    eggSpawn: 11506, eggIdle: 11507, eggDeath: 11508, eggHatch: 11509,
});

type Special = "acid-ball" | "acid-splatter" | "acid-drip";
import { configureMirrorback, configureMirrorbackRedirection } from "./mirrorback";
type AraxyteKind = "acidic" | "mirrorback" | "ruptura";
interface AraxxorState {
    readonly generation: number;
    startedAt: number;
    normalAttacks: number;
    standardAttacks: number;
    special: Special;
    readonly eggPattern: readonly AraxyteKind[];
    nextEggAt: number;
    eggIndex: number;
    readonly eggIds: Map<number, NpcState>;
    eggsSpawned: boolean;
    readonly cleaveTiles: Set<string>;
    enraged: boolean;
}
const states = new WeakMap<NpcState, AraxxorState>();
interface AraxxorCorpse {
    readonly owner: PlayerState;
    readonly instanceId: string;
    readonly claims: Map<string, { drops: readonly PendingNpcDrop[]; resolved: boolean }>;
    readonly venomEligible: boolean;
    resolved: boolean;
}
const corpses = new WeakMap<NpcState, AraxxorCorpse>();
const corpseAccount = (player: PlayerState) => (player.__saveKey || player.name || String(player.id)).trim().toLowerCase();

function stateFor(npc: NpcState, services: ScriptServices): AraxxorState {
    const runtime = services.encounters.ensure(npc);
    const generation = runtime?.generation ?? 0;
    let state = states.get(npc);
    if (!state || state.generation !== generation) {
        const firstEgg = runtime?.rng.nextInt(3) ?? 0;
        const eggPattern = firstEgg === 0
            ? ["acidic", "mirrorback", "ruptura"] as const
            : firstEgg === 1
                ? ["mirrorback", "ruptura", "acidic"] as const
                : ["ruptura", "acidic", "mirrorback"] as const;
        const special = eggPattern[0] === "acidic" ? "acid-ball" : eggPattern[0] === "mirrorback" ? "acid-splatter" : "acid-drip";
        state = { generation, startedAt: services.system.getCurrentTick(), normalAttacks: 0, standardAttacks: 0, special, eggPattern, nextEggAt: 3, eggIndex: 0, eggIds: new Map(), eggsSpawned: false, cleaveTiles: new Set(), enraged: false };
        states.set(npc, state);
    }
    return state;
}

function inLair(player: PlayerState, services: ScriptServices): boolean {
    return services.instances.get(player.id)?.definitionId === INSTANCE_ID;
}

function slayerEligible(player: PlayerState, services: ScriptServices): boolean {
    // Development combat modes stand in for an Araxxor task until the Slayer
    // assignment system ships. Normal players still need the real task.
    if (services.system.isDeveloper?.(player) || isDeveloperInstakillEnabled(player) || isDeveloperGodmodeEnabled(player)) return true;
    const skill = player.skillSystem.getSkill(SkillId.Slayer);
    if (skill.baseLevel + skill.boost < SLAYER_LEVEL) return false;
    const task = player.skillSystem.getSlayerTaskInfo(player.combat.slayerTask);
    if (!task.onTask) return false;
    const assigned = [task.monsterName, ...(task.monsterSpecies ?? [])]
        .map(value => String(value ?? "").trim().toLowerCase())
        .filter(Boolean);
    // Araxxor may be fought on an Araxyte/spider task or a direct boss task.
    return assigned.some(name => name.includes("araxyte") || name.includes("spider") || name === "araxxor");
}

function registerEncounters(registry: IScriptRegistry): void {
    registerOwnedEncounter(registry, defineBoss({
            // The dead form is intentionally not an encounter form. It is an
            // inert, interactable corpse and must never inherit Araxxor's
            // combat target or attack plan.
            id: "araxxor", npcTypeIds: [ARAXXOR_ID], maxHealth: 1020,
            bossHealthBar: {
                name: "Araxxor",
                npcTypeId: ARAXXOR_ID,
                markers: [{ percent: 25, label: "Enrage", style: "danger" }],
            },
            // catalog collection-log.json: Araxxor is boss category struct 995.
            killcount: { name: "Araxxor", collectionLogStructId: 995 },
            movement: { wanderRadius: 5, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [
                attack.melee({ id: "melee", speedTicks: 6, maxHit: 38, animationId: ANIM.melee, effects: { venomDamage: 6 } }),
                attack.magic({ id: "magic", preferredDistance: 1, speedTicks: 6, maxHit: 21, animationId: ANIM.magic, effects: { venomDamage: 6, prayerDrainFraction: 0.09 } }),
                attack.ranged({ id: "ranged", preferredDistance: 1, speedTicks: 6, maxHit: 34, animationId: ANIM.ranged, effects: { venomDamage: 6, defenceDrainFraction: 0.09 } }),
                attack.melee({ id: "enraged-melee", rangeTiles: 2, preferredDistance: 1, speedTicks: 4, maxHit: 38, animationId: ANIM.enragedMelee, effects: { venomDamage: 6 } }),
                attack.magic({ id: "enraged-magic", preferredDistance: 1, speedTicks: 4, maxHit: 21, animationId: ANIM.slowRanged, effects: { venomDamage: 6, prayerDrainFraction: 0.09 } }),
                attack.ranged({ id: "enraged-ranged", preferredDistance: 1, speedTicks: 4, maxHit: 34, animationId: ANIM.ranged, effects: { venomDamage: 6, defenceDrainFraction: 0.09 } }),
            ],
            phases: [
                phase.atHealth("normal", 100, ["melee", "magic", "ranged"]),
                phase.atHealth("enraged", 25, ["enraged-melee", "enraged-magic", "enraged-ranged"]),
            ],
        }));
    for (const minion of [
        { id: MIRRORBACK_ID, name: "araxxor-mirrorback", maxHit: 12 },
        { id: RUPTURA_ID, name: "araxxor-ruptura", maxHit: 1 },
        { id: ACIDIC_ARAXYTE_ID, name: "araxxor-acidic-araxyte", maxHit: 15 },
    ]) {
        registerOwnedEncounter(registry, defineBoss({
            id: minion.name, npcTypeIds: [minion.id], maxHealth: 58,
            movement: { wanderRadius: 2, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            attacks: [{ id: "attack", type: minion.id === ACIDIC_ARAXYTE_ID ? AttackType.Ranged : AttackType.Melee, rangeTiles: minion.id === ACIDIC_ARAXYTE_ID ? 8 : 1, preferredDistance: minion.id === ACIDIC_ARAXYTE_ID ? 6 : 1, speedTicks: minion.id === MIRRORBACK_ID ? 6 : 4, maxHit: minion.maxHit, animationId: minion.id === ACIDIC_ARAXYTE_ID ? ANIM.acidicAttack : minion.id === MIRRORBACK_ID ? ANIM.mirrorbackAttack : ANIM.araxyteAttack, effects: minion.id === ACIDIC_ARAXYTE_ID ? { venomDamage: 6 } : undefined }],
        }));
    }
    for (const eggId of [MIRRORBACK_EGG_ID, RUPTURA_EGG_ID, ACIDIC_ARAXYTE_EGG_ID]) {
        const name = `araxxor-egg-${eggId}`;
        registerOwnedEncounter(registry, defineBoss({
            id: name, npcTypeIds: [eggId], maxHealth: 65,
            movement: { wanderRadius: 0, aggressionRadius: 0, combatLeashRadius: 0 },
            // The registry requires an attack definition. Eggs are spawned
            // non-aggressive, so this zero-damage fallback is never selected
            // in normal play; it only gives their 65 HP an encounter runtime.
            attacks: [{ id: "inert", type: AttackType.Melee, rangeTiles: 1, speedTicks: 99, maxHit: 0 }],
        }));
    }
}

function createRoom(player: PlayerState, services: ScriptServices, access: "solo" | "party"): void {
    if (!slayerEligible(player, services)) { services.messaging.sendGameMessage(player, "You need level 92 Slayer and an active araxyte, spider, or Araxxor task to fight Araxxor."); return; }
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    // Copy the expanded 6x6-chunk slice, including the terrain border around
    // the playable 3616..3649 / 9798..9833 arena. This prevents a larger
    // logical bounds rectangle from becoming an empty or clipped scene.
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 3608, sourceBaseY: 9792, widthChunks: 6, heightChunks: 6, sourcePlanes: [0], destinationChunkX: 2, destinationChunkY: 3 }]);
    const baseX = ((INSIDE.x >> 3) - 6) * 8;
    const baseY = ((INSIDE.y >> 3) - 6) * 8;
    const room = services.instances.create(player, {
        definitionId: INSTANCE_ID, access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party",
        templateChunks, destination: INSIDE, exit: EXIT, grave: GRAVE,
        npcs: [{ id: ARAXXOR_ID, offsetX: BOSS_TILE.x - baseX, offsetY: BOSS_TILE.y - baseY, level: 0, size: 7, attackSpeed: 6, isAggressive: true, aggressionRadius: 30, wanderRadius: 5 }],
    });
    if (!room) { services.messaging.sendGameMessage(player, "Araxxor's lair is unavailable right now."); return; }
    const boss = services.npc.findNearbyNpc(player, ARAXXOR_ID, 40);
    if (boss) { configureAraxxorBoss(boss, services, true); spawnEggRing(boss, player, services); }
    services.instances.markStarted(room.id);
}

/** Attach the presentation and lifecycle rules that apply to every fresh body. */
function configureAraxxorBoss(boss: NpcState, services: ScriptServices, showSpawn: boolean): void {
    // Araxxor has no reliable defend sequence in this cache. Suppressing it
    // keeps the active attack animation readable rather than being overwritten
    // whenever the player lands a hit.
    boss.suppressDefenceAnimation = true;
    configureMirrorbackRedirection(boss, services);
    if (showSpawn) services.npc.queueNpcSeq(boss, ANIM.spawn);
    boss.onHealthChange((change) => {
        if (change.reason === "reset") { states.delete(boss); return; }
        const state = stateFor(boss, services);
        if (!state.enraged && change.current > 0 && change.current <= 255) {
            state.enraged = true;
            services.npc.queueNpcSeq(boss, ANIM.enrage);
            services.npc.queueNpcForcedChat(boss, "Araxxor becomes enraged!");
        }
    });
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
        tickInterval: 2, hitsplatStyle: HITMARK_VENOM, hazardDamage: rng => 4 + rng.nextInt(8), players: services.instances.getMemberPlayers(room.id), appliesTo: "all-members",
    }));
}

function spawnEgg(npc: NpcState, target: PlayerState, services: ScriptServices, state: AraxxorState, eggIndex: number): void {
    const runtime = services.encounters.ensure(npc);
    if (!runtime) return;
    const kind = state.eggPattern[eggIndex % state.eggPattern.length]!;
    const addId = kind === "mirrorback" ? MIRRORBACK_ID : kind === "ruptura" ? RUPTURA_ID : ACIDIC_ARAXYTE_ID;
    const eggId = addId === MIRRORBACK_ID ? MIRRORBACK_EGG_ID : addId === RUPTURA_ID ? RUPTURA_EGG_ID : ACIDIC_ARAXYTE_EGG_ID;
    const tile = EGG_TILES[eggIndex % EGG_TILES.length]!;
    const instance = services.instances.get(target.id);
    const egg = services.npc.spawnNpc({
        id: eggId, x: tile.x, y: tile.y, level: npc.level, size: 1,
        worldViewId: npc.worldViewId,
        ownerPlayerId: instance?.access === "solo" ? target.id : undefined,
        idleSeqId: ANIM.eggIdle, wanderRadius: 0, isAggressive: false, isImmovable: true,
        respawns: false,
    });
    if (!egg) return;
    state.eggIds.set(eggIndex % EGG_TILES.length, egg);
    runtime.ownNpc(egg.id);
    egg.suppressDefenceAnimation = true;
    egg.suppressAnimations = true;
}

function spawnEggRing(npc: NpcState, target: PlayerState, services: ScriptServices): void {
    const state = stateFor(npc, services);
    if (state.eggsSpawned) return;
    state.eggsSpawned = true;
    for (let index = 0; index < EGG_TILES.length; index += 1) spawnEgg(npc, target, services, state, index);
}

function hatchEgg(npc: NpcState, target: PlayerState, services: ScriptServices, state: AraxxorState, eggIndex: number): void {
    const slot = eggIndex % EGG_TILES.length;
    const egg = state.eggIds.get(slot);
    state.eggIds.delete(slot);
    if (!egg || egg.getHitpoints() <= 0 || services.combat.getNpc(egg.id) !== egg) return;
    const kind = state.eggPattern[eggIndex % state.eggPattern.length]!;
    const addId = kind === "mirrorback" ? MIRRORBACK_ID : kind === "ruptura" ? RUPTURA_ID : ACIDIC_ARAXYTE_ID;
    const tile = EGG_TILES[slot]!;
    const instance = services.instances.get(target.id);
    const runtime = services.encounters.ensure(npc);
    if (!runtime) return;
    const generation = runtime.generation;
    let hatchTaskId = -1;
    hatchTaskId = services.scheduler.after(1, () => {
        if (runtime.generation !== generation) return;
        runtime.releaseTask(hatchTaskId);
        const eggDamage = Math.max(0, egg.getMaxHitpoints() - egg.getHitpoints());
        if (services.combat.getNpc(egg.id) === egg) {
            runtime.releaseNpc(egg.id);
            services.npc.removeNpc(egg.id);
        }
        if (eggDamage < 58 && services.combat.getNpc(npc.id) === npc && inLair(target, services)) {
            const add = services.npc.spawnNpc({
                id: addId, x: tile.x, y: tile.y, level: npc.level, size: 1,
                worldViewId: npc.worldViewId,
                ownerPlayerId: instance?.access === "solo" ? target.id : undefined,
                wanderRadius: 2, attackSpeed: addId === MIRRORBACK_ID ? 6 : 4,
                isAggressive: true, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647,
                combatLeashRadius: 35, retreatInteractionRange: 40, respawns: false,
                lifetimeTicks: 80,
            });
            if (add) {
                if (addId === MIRRORBACK_ID) configureMirrorback(add, services);
                add.suppressDrops = true;
                if (eggDamage > 0) add.applyDamage(eggDamage);
                runtime.ownNpc(add.id);
                services.npc.engageCombat(add, target);
            }
        }
    }, { kind: "npc", id: npc.id });
    runtime.ownTask(hatchTaskId);
}

function araxxorAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const { npc, target, services, tick } = event;
    if (!inLair(target, services)) return;
    const state = stateFor(npc, services);
    const runtime = services.encounters.ensure(npc);
    if (!state.eggsSpawned) spawnEggRing(npc, target, services);
    if (!state.enraged && npc.getHitpoints() <= 255) { state.enraged = true; services.npc.queueNpcForcedChat(npc, "Araxxor becomes enraged!"); }
    state.normalAttacks += 1;
    // Araxxor performs six standard attacks, then a special. The egg clock
    // counts only those standard attacks (first hatch at 3, then every 6).
    if (state.normalAttacks <= 6) {
        state.standardAttacks += 1;
        if (state.eggIndex < EGG_TILES.length && state.standardAttacks >= state.nextEggAt) {
            state.eggIndex += 1;
            state.nextEggAt += 6;
            hatchEgg(npc, target, services, state, state.eggIndex - 1);
        }
        // In the final quarter Araxxor's normal clock is four ticks, and its
        // melee becomes a three-tile cleave that leaves acid behind.
        if (state.enraged && event.attack.traits.type === AttackType.Melee && runtime) {
            const room = services.instances.get(target.id);
            const tiles = enrageCleaveTiles(npc, target).filter(tile => !state.cleaveTiles.has(`${tile.x},${tile.y},${tile.level}`));
            if (room && tiles.length > 0) {
                for (const tile of tiles) state.cleaveTiles.add(`${tile.x},${tile.y},${tile.level}`);
                runtime.runMechanic("araxxor-cleave", "stack", () => spawnFloorHazard(runtime, services, {
                    id: "araxxor-cleave", tiles,
                    tell: { locId: ACID_TELL_LOC_ID, locShape: 10 }, hazardTime: 1,
                    liveTicks: "encounter", tickInterval: 2, hitsplatStyle: HITMARK_VENOM, hazardDamage: rng => 4 + rng.nextInt(8),
                    players: services.instances.getMemberPlayers(room.id), appliesTo: "all-members",
                }));
            }
        }
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
        if (runtime) {
            const generation = runtime.generation;
            for (let delay = 0; delay < 6; delay += 1) {
                let taskId = -1;
                taskId = services.scheduler.after(delay, () => {
                    if (runtime.generation !== generation) return;
                    runtime.releaseTask(taskId);
                    if (services.combat.getNpc(npc.id) !== npc) return;
                    acidPatches(npc, target, services, 1, true);
                }, { kind: "npc", id: npc.id });
                runtime.ownTask(taskId);
            }
        }
        services.messaging.sendGameMessage(target, "Acid drips towards you!");
    }
    return NpcAttackDecision.Prevent;
}

/** A three-wide strip through the target, perpendicular to the cardinal attack direction. */
export function enrageCleaveTiles(npc: Pick<NpcState, "tileX" | "tileY" | "size">, target: Pick<PlayerState, "tileX" | "tileY" | "level">) {
    const dx = target.tileX - (npc.tileX + (npc.size - 1) / 2);
    const dy = target.tileY - (npc.tileY + (npc.size - 1) / 2);
    const eastWest = Math.abs(dx) >= Math.abs(dy);
    return [-1, 0, 1].map(offset => ({ x: target.tileX + (eastWest ? 0 : offset), y: target.tileY + (eastWest ? offset : 0), level: target.level }));
}

const armedRupturas = new WeakSet<NpcState>();
function rupturaAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const { npc, target, services, tick } = event;
    if (armedRupturas.has(npc)) return NpcAttackDecision.Prevent;
    const distance = Math.max(Math.abs(npc.tileX - target.tileX), Math.abs(npc.tileY - target.tileY));
    if (distance > 1) return;
    armedRupturas.add(npc);
    services.npc.stopNpcMovement(npc);
    services.npc.stopNpcMovement(npc, 4);
    const runtime = services.encounters.ensure(npc);
    const generation = runtime?.generation;
    let taskId = -1;
    taskId = services.scheduler.after(3, (explosionTick) => {
        runtime?.releaseTask(taskId);
        if (runtime?.generation !== generation || services.combat.getNpc(npc.id) !== npc || npc.getHitpoints() <= 0) return;
        explodeRuptura(npc, target, services, explosionTick);
    }, { kind: "npc", id: npc.id });
    runtime?.ownTask(taskId);
    return NpcAttackDecision.Prevent;
}

function explodeRuptura(npc: NpcState, target: PlayerState, services: ScriptServices, tick: number): void {
    const healthFraction = npc.getHitpoints() / Math.max(1, npc.getMaxHitpoints());
    const explosionDamage = (range: number): number => {
        const fullHealth = range <= 0 ? 80 : range === 1 ? 64 : Math.max(33, 80 - range * 16);
        return Math.max(1, Math.floor(fullHealth * healthFraction));
    };
    services.npc.queueNpcSeq(npc, ANIM.rupturaExplode);
    const room = services.instances.get(target.id);
    for (const player of room ? services.instances.getMemberPlayers(room.id) : [target]) {
        const distance = Math.max(Math.abs(npc.tileX - player.tileX), Math.abs(npc.tileY - player.tileY));
        if (distance <= 2 && player.worldViewId === npc.worldViewId && player.level === npc.level) {
            services.combat.applyNpcDamageToPlayer(npc, player, HITMARK_DAMAGE, explosionDamage(distance), tick);
        }
    }

    // Ruptura's blast is intentionally useful: it damages Araxxor and any
    // nearby live araxyte/egg using the player as the credited source, so
    // normal death handling and hitsplats remain intact.
    const araxxor = services.npc.findNearbyNpc(target, ARAXXOR_ID, 30);
    const bossRuntime = araxxor && services.encounters.getByNpcRuntimeId(araxxor.id);
    const blastTargets = bossRuntime
        ? [...bossRuntime.snapshotOwnedResources().npcRuntimeIds].map(id => services.combat.getNpc(id))
        : [araxxor];
    for (const victim of blastTargets) {
        if (!victim || victim.id === npc.id || victim.worldViewId !== npc.worldViewId) continue;
        if (victim.level !== npc.level || victim.getHitpoints() <= 0) continue;
        // Distance to the footprint, not the south-west anchor of a 7x7 boss.
        const victimDistance = Math.max(0, victim.tileX - npc.tileX, npc.tileX - (victim.tileX + victim.size - 1), victim.tileY - npc.tileY, npc.tileY - (victim.tileY + victim.size - 1));
        if (victimDistance > 7) continue;
        services.combat.applyPlayerDamageToNpc(target, victim, HITMARK_DAMAGE, explosionDamage(victimDistance), tick);
    }
    services.npc.removeNpc(npc.id);
}

function escape({ player, services }: LocInteractionEvent): void {
    if (inLair(player, services)) services.instances.leave(player, EXIT);
    else services.movement.teleportPlayer(player, INSIDE.x, INSIDE.y, INSIDE.level);
}

function recordAraxxorKill(player: PlayerState, services: ScriptServices): void {
    player.collectionLog.incrementCategoryStat(995);
    const killcount = player.collectionLog.getCategoryStat(995)?.count1 ?? 0;
    services.variables.queueVarp?.(player.id, VARP_COLLECTION_CATEGORY_COUNT, killcount);
    services.messaging.sendGameMessage(player, `Araxxor killcount : ${killcount}`);
    if (killcount > 0 && killcount % 100 === 0) {
        services.messaging.sendGameMessage(player, `Congratulations! You reached the ${killcount} kills Milestone!`);
    }
}

function spawnCorpseDrop(corpse: NpcState, services: ScriptServices, drop: PendingNpcDrop): void {
    services.groundItems.spawn(drop.itemId, drop.quantity, drop.tile, {
        ownerId: drop.ownerId,
        privateTicks: drop.isWilderness ? 0 : 100,
        isMonsterDrop: true,
        worldViewId: drop.worldViewId ?? corpse.worldViewId,
        isWilderness: drop.isWilderness,
    });
}

function awardNid(player: PlayerState, corpse: NpcState, services: ScriptServices, chance: number): void {
    if (player.collectionLog.hasItem(NID_ID) || player.collectionLog.hasItem(NID_VARIANT_ID) || Math.random() >= chance) return;
    // The common monster-reward path logs and summons pets, or stores them safely.
    services.groundItems.spawn(NID_ID, 1, { x: corpse.tileX, y: corpse.tileY, level: corpse.level }, {
        ownerId: player.id, isMonsterDrop: true, worldViewId: corpse.worldViewId,
        petDropSource: { bossNpcTypeId: ARAXXOR_ID, bossName: "Araxxor", killcount: player.collectionLog.getCategoryStat(995)?.count1 ?? 0 },
    });
}

function finishCorpse(corpse: NpcState, services: ScriptServices): void {
    const state = corpses.get(corpse);
    if (!state || state.resolved) return;
    if (state) state.resolved = true;
    services.npc.removeNpc(corpse.id);
    if (!state) return;
    // A completed Harvest/Destroy begins a genuinely fresh life. It does not
    // revive the corpse or retain its old encounter runtime/attack target.
    services.scheduler.after(2, () => {
        const owner = services.instances.getMemberPlayers(state.instanceId).find(p => p.worldViewId === corpse.worldViewId);
        if (!owner) return;
        const instance = services.instances.get(owner.id);
        if (!instance || instance.definitionId !== INSTANCE_ID || owner.worldViewId !== corpse.worldViewId) return;
        const boss = services.npc.spawnNpc({
            id: ARAXXOR_ID, x: BOSS_TILE.x, y: BOSS_TILE.y, level: 0, size: 7,
            idleSeqId: ANIM.idle, worldViewId: corpse.worldViewId,
            ownerPlayerId: instance.access === "solo" ? owner.id : undefined,
            attackSpeed: 6, isAggressive: true, aggressionRadius: 30,
            aggressionToleranceTicks: 2_147_483_647, wanderRadius: 5,
            combatLeashRadius: 35, retreatInteractionRange: 40, respawns: false,
        });
        if (boss) {
            services.instances.attachNpc(instance.id, boss);
            configureAraxxorBoss(boss, services, true);
            // A respawn is a complete new encounter life: it receives the
            // same six live eggs and freshly seeded hatch/special state as the
            // original room spawn.
            spawnEggRing(boss, owner, services);
        }
    }, { kind: "instance", id: state.instanceId });
}

function finishClaim(npc: NpcState, services: ScriptServices): void {
    const state = corpses.get(npc);
    if (state && [...state.claims.values()].every(claim => claim.resolved)) finishCorpse(npc, services);
}

function claimedDrop(player: PlayerState, npc: NpcState, services: ScriptServices, drop: PendingNpcDrop): void {
    spawnCorpseDrop(npc, services, { ...drop, ownerId: player.id, tile: {x: npc.tileX, y: npc.tileY, level: npc.level}, worldViewId: npc.worldViewId });
    services.collectionLog.trackCollectionLogItem(player, drop.itemId);
}

function harvestCorpse({ player, npc, services }: { player: PlayerState; npc: NpcState; services: ScriptServices }): void {
    const state = corpses.get(npc);
    const claim = state?.claims.get(corpseAccount(player));
    if (!state || !claim || claim.resolved || state.resolved || player.worldViewId !== npc.worldViewId || player.level !== npc.level) return;
    claim.resolved = true;
    for (const drop of claim.drops) claimedDrop(player, npc, services, drop);
    if (state.venomEligible && !player.collectionLog.hasItem(COAGULATED_VENOM_ID)) {
        claimedDrop(player, npc, services, { itemId: COAGULATED_VENOM_ID, quantity: 1, tile: { x: npc.tileX, y: npc.tileY, level: npc.level }, ownerId: player.id, isMonsterDrop: true, isWilderness: false, worldViewId: npc.worldViewId });
    }
    awardNid(player, npc, services, 1 / 3000);
    services.messaging.sendGameMessage(player, "You harvest Araxxor's corpse.");
    finishClaim(npc, services);
}

function destroyCorpse({ player, npc, services }: { player: PlayerState; npc: NpcState; services: ScriptServices }): void {
    const state = corpses.get(npc);
    const claim = state?.claims.get(corpseAccount(player));
    if (!state || !claim || claim.resolved || state.resolved || player.worldViewId !== npc.worldViewId || player.level !== npc.level) return;
    services.dialog.openDialogOptions(player, {
        id: "araxxor-destroy-corpse", title: "Destroy Araxxor's corpse?",
        options: ["Yes - sacrifice normal loot", "No"], modal: true,
        onSelect: choice => {
            if (choice !== 0 || state.resolved || claim.resolved || player.worldViewId !== npc.worldViewId || player.level !== npc.level) return;
            claim.resolved = true;
            // Destroy keeps the elite-clue roll but forfeits every normal and
            // unique reward; Nid's independent chance doubles to 1/1,500.
            for (const drop of claim.drops) if (drop.itemId === ELITE_CLUE_ID) claimedDrop(player, npc, services, drop);
            awardNid(player, npc, services, 1 / 1500);
            services.messaging.sendGameMessage(player, "You destroy Araxxor's corpse, sacrificing its normal loot.");
            finishClaim(npc, services);
        },
    });
}

function becomeCorpse(event: Parameters<IScriptRegistry["registerNpcPreDeath"]>[1] extends (event: infer E) => unknown ? E : never): NpcPreDeathDecision | void {
    if (event.npc.typeId !== ARAXXOR_ID || !event.killer || !inLair(event.killer, event.services)) return;
    const fight = stateFor(event.npc, event.services);
    const instance = event.services.instances.get(event.killer.id);
    if (!instance) return;
    const originalEligibility = includeLethalContribution(event.services.combat.getDropEligibility(event.npc), event.killer,
        Math.min(event.hit.proposedDamage, event.hit.hitpointsBefore), event.tick);
    const eligibility = instance.access === "party" ? partyLootEligibility(event.npc, originalEligibility,
        event.services.instances.getMemberPlayers(instance.id), instance.memberPlayerIds.length)
        : {...originalEligibility, eligibleLooters: [event.killer], primaryLooter: event.killer};
    const drops = (eligibility.eligibleLooters.length ? event.services.combat.rollNpcDrops(event.npc, eligibility) : [])
        // Coagulated venom and Nid are governed by the corpse choice/timer,
        // not by a generic death roll.
        .filter(drop => drop.itemId !== COAGULATED_VENOM_ID && drop.itemId !== NID_ID && drop.itemId !== NID_VARIANT_ID);
    // Do not use replaceNpc here. replaceNpc deliberately transfers a
    // compatible encounter runtime and its target, which is correct for a
    // combat phase transformation but wrong for a lootable dead body.
    // Eggs belong to a single Araxxor life. Remove every surviving anchor
    // before the corpse is created so the next life begins with one clean ring.
    const runtime = event.services.encounters.getByNpcRuntimeId(event.npc.id);
    for (const egg of fight.eggIds.values()) {
        const liveEgg = event.services.combat.getNpc(egg.id);
        if (liveEgg === egg) {
            runtime?.releaseNpc(egg.id);
            event.services.npc.removeNpc(egg.id);
        }
    }
    fight.eggIds.clear();
    const corpse = event.services.npc.spawnNpc({
        id: DEAD_ARAXXOR_ID, x: event.npc.tileX, y: event.npc.tileY, level: event.npc.level,
        size: 7, worldViewId: event.npc.worldViewId,
        ownerPlayerId: instance?.access === "solo" ? event.killer.id : undefined,
        wanderRadius: 0, isAggressive: false, isUnattackable: true, isImmovable: true,
        respawns: false, lifetimeTicks: 500,
    });
    if (!corpse) return;
    if (!event.services.instances.attachNpc(instance.id, corpse)) { event.services.npc.removeNpc(corpse.id); return; }
    event.services.npc.disengageCombat(event.npc);
    event.services.npc.removeNpc(event.npc.id);
    corpse.setUnattackable(true);
    corpse.suppressDefenceAnimation = true;
    event.services.npc.stopNpcMovement(corpse);
    event.services.npc.queueNpcSeq(corpse, ANIM.death);
    corpses.set(corpse, {
        owner: event.killer,
        instanceId: instance.id,
        claims: new Map(eligibility.eligibleLooters.map(player => [corpseAccount(player), {drops: drops.filter(drop => drop.ownerId === player.id), resolved: false}])),
        venomEligible: event.tick - fight.startedAt <= VENOM_TIME_LIMIT_TICKS,
        resolved: false,
    });
    for (const player of eligibility.eligibleLooters) recordAraxxorKill(player, event.services);
    // One absent/unclaimed member must not permanently strand the party's next kill.
    event.services.scheduler.after(500, () => finishCorpse(corpse, event.services), {kind: "instance", id: instance.id});
    if (!eligibility.eligibleLooters.length) finishCorpse(corpse, event.services);
    return NpcPreDeathDecision.Prevent;
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerEncounters(registry);
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
    registry.registerNpcPreDeath(ARAXXOR_ID, becomeCorpse);
    registry.registerNpcScript({ npcId: DEAD_ARAXXOR_ID, option: "harvest", handler: harvestCorpse });
    registry.registerNpcScript({ npcId: DEAD_ARAXXOR_ID, option: "destroy", handler: destroyCorpse });
    // Keep the encounter hostile in a party even when its original target
    // leaves: the generic aggressive target selector picks another member.
}
