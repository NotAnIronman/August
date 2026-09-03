import { SkillId } from "@august/osrs-engine/skill/skills";
import { AttackType } from "@server/game/combat/AttackType";
import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { isDeveloperGodmodeEnabled, isDeveloperInstakillEnabled } from "@server/game/dev/DeveloperFlags";
import { VARP_COLLECTION_CATEGORY_COUNT } from "@server/game/collectionlog";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
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
type AraxyteKind = "acidic" | "mirrorback" | "ruptura";
interface AraxxorState {
    startedAt: number;
    normalAttacks: number;
    standardAttacks: number;
    special: Special;
    readonly eggPattern: readonly AraxyteKind[];
    nextEggAt: number;
    eggIndex: number;
    enraged: boolean;
}
const states = new WeakMap<NpcState, AraxxorState>();
interface AraxxorCorpse {
    readonly owner: PlayerState;
    readonly drops: readonly PendingNpcDrop[];
    readonly venomEligible: boolean;
    resolved: boolean;
}
const corpses = new WeakMap<NpcState, AraxxorCorpse>();

function stateFor(npc: NpcState, services: ScriptServices): AraxxorState {
    let state = states.get(npc);
    if (!state) {
        const firstEgg = services.encounters.ensure(npc)?.rng.nextInt(3) ?? 0;
        const eggPattern = firstEgg === 0
            ? ["acidic", "mirrorback", "ruptura"] as const
            : firstEgg === 1
                ? ["mirrorback", "ruptura", "acidic"] as const
                : ["ruptura", "acidic", "mirrorback"] as const;
        const special = eggPattern[0] === "acidic" ? "acid-ball" : eggPattern[0] === "mirrorback" ? "acid-splatter" : "acid-drip";
        state = { startedAt: services.system.getCurrentTick(), normalAttacks: 0, standardAttacks: 0, special, eggPattern, nextEggAt: 3, eggIndex: 0, enraged: false };
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

function registerEncounters(): void {
    if (!EncounterRegistry.shared.get("araxxor")) {
        registerEncounter({
            // The dead form is intentionally not an encounter form. It is an
            // inert, interactable corpse and must never inherit Araxxor's
            // combat target or attack plan.
            id: "araxxor", npcTypeIds: [ARAXXOR_ID], maxHealth: 1020,
            bossHealthBar: { name: "Araxxor", npcTypeId: ARAXXOR_ID },
            // catalog collection-log.json: Araxxor is boss category struct 995.
            killcount: { name: "Araxxor", collectionLogStructId: 995 },
            movement: { wanderRadius: 5, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [
                { id: "melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 6, maxHit: 38, animationId: ANIM.melee, effects: { poisonDamage: 8 } },
                { id: "magic", type: AttackType.Magic, rangeTiles: 10, preferredDistance: 1, speedTicks: 6, maxHit: 21, animationId: ANIM.magic, effects: { poisonDamage: 8 } },
                { id: "ranged", type: AttackType.Ranged, rangeTiles: 10, preferredDistance: 1, speedTicks: 6, maxHit: 34, animationId: ANIM.ranged, effects: { poisonDamage: 8 } },
                { id: "enraged-melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 4, maxHit: 38, animationId: ANIM.enragedMelee, effects: { poisonDamage: 8 } },
                { id: "enraged-magic", type: AttackType.Magic, rangeTiles: 10, preferredDistance: 1, speedTicks: 4, maxHit: 21, animationId: ANIM.slowRanged, effects: { poisonDamage: 8 } },
                { id: "enraged-ranged", type: AttackType.Ranged, rangeTiles: 10, preferredDistance: 1, speedTicks: 4, maxHit: 34, animationId: ANIM.ranged, effects: { poisonDamage: 8 } },
            ],
            phases: [
                { id: "normal", startsAtHealthPercent: 100, attackIds: ["melee", "magic", "ranged"] },
                { id: "enraged", startsAtHealthPercent: 25, attackIds: ["enraged-melee", "enraged-magic", "enraged-ranged"] },
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
            id: minion.name, npcTypeIds: [minion.id], maxHealth: 58,
            movement: { wanderRadius: 2, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            attacks: [{ id: "attack", type: AttackType.Melee, rangeTiles: minion.id === ACIDIC_ARAXYTE_ID ? 8 : 1, preferredDistance: 1, speedTicks: minion.id === MIRRORBACK_ID ? 6 : 4, maxHit: minion.maxHit, animationId: minion.id === ACIDIC_ARAXYTE_ID ? ANIM.acidicAttack : minion.id === MIRRORBACK_ID ? ANIM.mirrorbackAttack : ANIM.araxyteAttack, effects: minion.id === ACIDIC_ARAXYTE_ID ? { poisonDamage: 6 } : undefined }],
        });
    }
    for (const eggId of [MIRRORBACK_EGG_ID, RUPTURA_EGG_ID, ACIDIC_ARAXYTE_EGG_ID]) {
        const name = `araxxor-egg-${eggId}`;
        if (!EncounterRegistry.shared.get(name)) registerEncounter({
            id: name, npcTypeIds: [eggId], maxHealth: 65,
            movement: { wanderRadius: 0, aggressionRadius: 0, combatLeashRadius: 0 },
            attacks: [],
        });
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
    if (boss) configureAraxxorBoss(boss, services, true);
    services.instances.markStarted(room.id);
}

/** Attach the presentation and lifecycle rules that apply to every fresh body. */
function configureAraxxorBoss(boss: NpcState, services: ScriptServices, showSpawn: boolean): void {
    // Araxxor has no reliable defend sequence in this cache. Suppressing it
    // keeps the active attack animation readable rather than being overwritten
    // whenever the player lands a hit.
    boss.suppressDefenceAnimation = true;
    if (showSpawn) services.npc.queueNpcSeq(boss, ANIM.spawn);
    boss.onHealthChange((change) => {
        const state = stateFor(boss, services);
        if (change.reason === "reset") { states.delete(boss); return; }
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
        tickInterval: 2, hazardDamage: rng => 4 + rng.nextInt(8), players: services.instances.getMemberPlayers(room.id), appliesTo: "all-members",
    }));
}

function spawnSpecialAdds(npc: NpcState, target: PlayerState, services: ScriptServices, kind: AraxyteKind): void {
    const runtime = services.encounters.ensure(npc);
    if (!runtime) return;

    const addId = kind === "mirrorback" ? MIRRORBACK_ID : kind === "ruptura" ? RUPTURA_ID : ACIDIC_ARAXYTE_ID;
    const eggId = addId === MIRRORBACK_ID ? MIRRORBACK_EGG_ID : addId === RUPTURA_ID ? RUPTURA_EGG_ID : ACIDIC_ARAXYTE_EGG_ID;
    const tile = {
        x: Math.max(ROOM.minX + 1, Math.min(ROOM.maxX - 1, npc.tileX + runtime.rng.nextInt(9) - 4)),
        y: Math.max(ROOM.minY + 1, Math.min(ROOM.maxY - 1, npc.tileY + runtime.rng.nextInt(9) - 4)),
    };
    const instance = services.instances.get(target.id);
    const egg = services.npc.spawnNpc({
        id: eggId, x: tile.x, y: tile.y, level: npc.level, size: 1,
        worldViewId: npc.worldViewId,
        ownerPlayerId: instance?.access === "solo" ? target.id : undefined,
        idleSeqId: ANIM.eggIdle, wanderRadius: 0, isAggressive: false, isImmovable: true,
        respawns: false, lifetimeTicks: 8,
    });
    if (!egg) return;
    runtime.ownNpc(egg.id);
    egg.suppressDefenceAnimation = true;
    services.npc.queueNpcSeq(egg, ANIM.eggSpawn);
    services.scheduler.after(3, () => {
        const liveEgg = services.combat.getNpc(egg.id);
        // Destroyed eggs are skipped. The next normal six-attack interval
        // advances to the following egg in the fixed colour pattern.
        if (!liveEgg) return;
        if (services.combat.getNpc(npc.id) !== npc || npc.getHitpoints() <= 0 || !inLair(target, services) || target.worldViewId !== npc.worldViewId) return;
        services.npc.queueNpcSeq(egg, ANIM.eggHatch);
        services.scheduler.after(1, () => {
            services.npc.removeNpc(egg.id);
            const eggDamage = Math.max(0, egg.getMaxHitpoints() - egg.getHitpoints());
            // An egg reduced below the araxyte's full health does not hatch;
            // otherwise its damage carries into the araxyte it produces.
            if (eggDamage >= 58) return;
            const add = services.npc.spawnNpc({
                id: addId, x: tile.x, y: tile.y, level: npc.level, size: 1,
                worldViewId: npc.worldViewId,
                ownerPlayerId: instance?.access === "solo" ? target.id : undefined,
                wanderRadius: 2, attackSpeed: addId === MIRRORBACK_ID ? 6 : 4,
                isAggressive: true, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647,
                combatLeashRadius: 35, retreatInteractionRange: 40, respawns: false,
                lifetimeTicks: 80,
            });
            if (!add) return;
            add.suppressDrops = true;
            if (eggDamage > 0) add.applyDamage(eggDamage);
            runtime.ownNpc(add.id);
            services.npc.engageCombat(add, target);
        }, { kind: "npc", id: npc.id });
    }, { kind: "npc", id: npc.id });
}

function araxxorAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const { npc, target, services, tick } = event;
    if (!inLair(target, services)) return;
    const state = stateFor(npc, services);
    const runtime = services.encounters.ensure(npc);
    if (!state.enraged && npc.getHitpoints() <= 255) { state.enraged = true; services.npc.queueNpcForcedChat(npc, "Araxxor becomes enraged!"); }
    state.normalAttacks += 1;
    // Araxxor performs six standard attacks, then a special. The egg clock
    // counts only those standard attacks (first hatch at 3, then every 6).
    if (state.normalAttacks <= 6) {
        state.standardAttacks += 1;
        if (state.standardAttacks >= state.nextEggAt) {
            const kind = state.eggPattern[state.eggIndex % state.eggPattern.length]!;
            state.eggIndex += 1;
            state.nextEggAt += 6;
            spawnSpecialAdds(npc, target, services, kind);
        }
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
    const added = player.items.addItem(NID_ID, 1, { assureFullInsertion: false }).completed;
    if (added < 1) {
        services.groundItems.spawn(NID_ID, 1, { x: corpse.tileX, y: corpse.tileY, level: corpse.level }, {
            ownerId: player.id, privateTicks: 100, isMonsterDrop: true, worldViewId: corpse.worldViewId,
        });
    }
    services.collectionLog.trackCollectionLogItem(player, NID_ID);
    services.messaging.sendGameMessage(player, "You have a funny feeling like you're being followed.");
}

function finishCorpse(corpse: NpcState, services: ScriptServices): void {
    const state = corpses.get(corpse);
    if (state) state.resolved = true;
    services.npc.removeNpc(corpse.id);
    if (!state) return;
    // A completed Harvest/Destroy begins a genuinely fresh life. It does not
    // revive the corpse or retain its old encounter runtime/attack target.
    services.scheduler.after(2, () => {
        const owner = state.owner;
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
        if (boss) configureAraxxorBoss(boss, services, true);
    }, { kind: "npc", id: corpse.id });
}

function harvestCorpse({ player, npc, services }: { player: PlayerState; npc: NpcState; services: ScriptServices }): void {
    const state = corpses.get(npc);
    if (!state || state.owner.id !== player.id || state.resolved) return;
    for (const drop of state.drops) spawnCorpseDrop(npc, services, drop);
    if (state.venomEligible && !player.collectionLog.hasItem(COAGULATED_VENOM_ID)) {
        spawnCorpseDrop(npc, services, { itemId: COAGULATED_VENOM_ID, quantity: 1, tile: { x: npc.tileX, y: npc.tileY, level: npc.level }, ownerId: player.id, isMonsterDrop: true, isWilderness: false, worldViewId: npc.worldViewId });
    }
    awardNid(player, npc, services, 1 / 3000);
    services.messaging.sendGameMessage(player, "You harvest Araxxor's corpse.");
    finishCorpse(npc, services);
}

function destroyCorpse({ player, npc, services }: { player: PlayerState; npc: NpcState; services: ScriptServices }): void {
    const state = corpses.get(npc);
    if (!state || state.owner.id !== player.id || state.resolved) return;
    services.dialog.openDialogOptions(player, {
        id: "araxxor-destroy-corpse", title: "Destroy Araxxor's corpse?",
        options: ["Yes - sacrifice normal loot", "No"], modal: true,
        onSelect: choice => {
            if (choice !== 0 || state.resolved) return;
            // Destroy keeps the elite-clue roll but forfeits every normal and
            // unique reward; Nid's independent chance doubles to 1/1,500.
            for (const drop of state.drops) if (drop.itemId === ELITE_CLUE_ID) spawnCorpseDrop(npc, services, drop);
            awardNid(player, npc, services, 1 / 1500);
            services.messaging.sendGameMessage(player, "You destroy Araxxor's corpse, sacrificing its normal loot.");
            finishCorpse(npc, services);
        },
    });
}

function becomeCorpse(event: Parameters<IScriptRegistry["registerNpcPreDeath"]>[1] extends (event: infer E) => unknown ? E : never): NpcPreDeathDecision | void {
    if (event.npc.typeId !== ARAXXOR_ID || !event.killer || !inLair(event.killer, event.services)) return;
    const fight = stateFor(event.npc, event.services);
    const drops = event.services.combat.rollNpcDrops(event.npc, event.services.combat.getDropEligibility(event.npc))
        // Coagulated venom and Nid are governed by the corpse choice/timer,
        // not by a generic death roll.
        .filter(drop => drop.itemId !== COAGULATED_VENOM_ID && drop.itemId !== NID_ID && drop.itemId !== NID_VARIANT_ID);
    // Do not use replaceNpc here. replaceNpc deliberately transfers a
    // compatible encounter runtime and its target, which is correct for a
    // combat phase transformation but wrong for a lootable dead body.
    const instance = event.services.instances.get(event.killer.id);
    const corpse = event.services.npc.spawnNpc({
        id: DEAD_ARAXXOR_ID, x: event.npc.tileX, y: event.npc.tileY, level: event.npc.level,
        size: 7, worldViewId: event.npc.worldViewId,
        ownerPlayerId: instance?.access === "solo" ? event.killer.id : undefined,
        wanderRadius: 0, isAggressive: false, isUnattackable: true, isImmovable: true,
        respawns: false, lifetimeTicks: 500,
    });
    if (!corpse) return;
    event.services.npc.disengageCombat(event.npc);
    event.services.npc.removeNpc(event.npc.id);
    corpse.setUnattackable(true);
    corpse.suppressDefenceAnimation = true;
    event.services.npc.stopNpcMovement(corpse);
    event.services.npc.queueNpcSeq(corpse, ANIM.death);
    corpses.set(corpse, {
        owner: event.killer,
        drops,
        venomEligible: event.tick - fight.startedAt <= VENOM_TIME_LIMIT_TICKS,
        resolved: false,
    });
    recordAraxxorKill(event.killer, event.services);
    return NpcPreDeathDecision.Prevent;
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
    registry.registerNpcPreDeath(ARAXXOR_ID, becomeCorpse);
    registry.registerNpcScript({ npcId: DEAD_ARAXXOR_ID, option: "harvest", handler: harvestCorpse });
    registry.registerNpcScript({ npcId: DEAD_ARAXXOR_ID, option: "destroy", handler: destroyCorpse });
    // Keep the encounter hostile in a party even when its original target
    // leaves: the generic aggressive target selector picks another member.
}
