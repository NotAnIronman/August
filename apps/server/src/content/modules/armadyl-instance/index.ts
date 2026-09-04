import { EquipmentSlot } from "@august/osrs-engine/config/player/Equipment";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { AttackType } from "@server/game/combat/AttackType";
import { attack, defineBoss } from "@server/game/encounters/BossDefinition";
import { registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import { defineBossRoom } from "@server/game/encounters/BossRoom";
import { defineGwdAltar } from "@server/game/encounters/GwdAltar";
import { knockback } from "@server/game/encounters/mechanics";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import type { PlayerState } from "@server/game/player";
import { NpcAttackDecision, type IScriptRegistry, type LocInteractionEvent, type NpcAttackEvent, type ScriptServices } from "@server/game/scripts/types";
import { LockState } from "@server/game/model/LockState";

const ARMADYL_PILLAR_LOC_ID = 26380;
const ARMADYL_CRATE_LOC_ID = 26519;
const ARMADYL_DOOR_LOC_ID = 26502;
const ARMADYL_ALTAR_LOC_ID = 26365;
const MITHRIL_GRAPPLE_IDS = new Set([9419, 24721]);
const MITHRIL_GRAPPLE_ITEM_ID = 9419;
const GRAPPLE_ANIMATION_ID = 4462;
const CRATE_COOLDOWN_TICKS = 500;
const ARMADYL_DEFINITION_ID = "kreearra-room";
const OUTSIDE_PILLAR = Object.freeze({ x: 2872, y: 5279, level: 2 });
const INSIDE_PILLAR = Object.freeze({ x: 2872, y: 5269, level: 2 });
const INSTANCE_ENTRANCE = Object.freeze({ x: 2839, y: 5295, level: 2 });
const INSTANCE_EXIT = Object.freeze({ x: 2839, y: 5294, level: 2 });
const INSTANCE_GRAVE = Object.freeze({ locId: INSTANCE_GRAVE_RECLAIM_LOC_ID, tile: { x: 2839, y: 5292 }, level: 2 });
const INSTANCE_BASE = Object.freeze({ x: 2784, y: 5240 });
const ARMADYL_NPCS = Object.freeze([
    // Keep the live NPC's fallback combat cadence aligned with its encounter attacks.
    Object.freeze({ id: 3162, offsetX: 2832 - INSTANCE_BASE.x, offsetY: 5302 - INSTANCE_BASE.y, level: 2, attackSpeed: 3 }),
    Object.freeze({ id: 3163, offsetX: 2840 - INSTANCE_BASE.x, offsetY: 5303 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 3164, offsetX: 2828 - INSTANCE_BASE.x, offsetY: 5299 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 3165, offsetX: 2833 - INSTANCE_BASE.x, offsetY: 5297 - INSTANCE_BASE.y, level: 2 }),
]);
const crateUses = new WeakMap<PlayerState, number>();

function registerArmadylEncounters(registry: IScriptRegistry): void {
    registerOwnedEncounter(registry, defineBoss({
            id: "kreearra", npcTypeIds: [3162], maxHealth: 255,
            bossHealthBar: { name: "Kree'arra", npcTypeId: 3162 },
            killcount: { name: "Kree'arra", collectionLogStructId: 493 },
            movement: { wanderRadius: 10, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [
                // While engaged, Kree rolls these two tornadoes evenly. If nobody is attacking her,
                // she instead closes in and uses her melee attack.
                attack.ranged({ id: "ranged-tornado", rangeTiles: 15, speedTicks: 3, maxHit: 69, weight: 1, animation: "ranged", condition: (context) => context.targetIsAttackingNpc }),
                attack.magic({ id: "magic-tornado", rangeTiles: 15, speedTicks: 3, maxHit: 21, weight: 1, animation: "magic", effects: { defenceRollAttackType: AttackType.Ranged }, condition: (context) => context.targetIsAttackingNpc }),
                attack.melee({ id: "melee", speedTicks: 3, maxHit: 26, weight: 1, animation: "melee", condition: (context) => !context.targetIsAttackingNpc }),
            ],
        }));
    const guards = [
        { id: "wingman-skree", npcTypeId: 3163, type: AttackType.Magic, range: 10, maxHit: 16 },
        { id: "flockleader-geerin", npcTypeId: 3164, type: AttackType.Ranged, range: 10, maxHit: 25 },
        { id: "flight-kilisa", npcTypeId: 3165, type: AttackType.Melee, range: 1, maxHit: 15 },
    ] as const;
    for (const guard of guards) {
        registerOwnedEncounter(registry, defineBoss({ id: guard.id, npcTypeIds: [guard.npcTypeId], movement: { wanderRadius: 8, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 }, attacks: [{ id: "attack", type: guard.type, rangeTiles: guard.range, preferredDistance: guard.type === AttackType.Melee ? 1 : guard.range, speedTicks: 4, maxHit: guard.maxHit, animation: "attack" }] }));
    }
}

const armadylRoom = defineBossRoom({
    id: ARMADYL_DEFINITION_ID,
    doorLocId: ARMADYL_DOOR_LOC_ID,
    templateCopies: [
        {
            sourceBaseX: 2808,
            sourceBaseY: 5280,
            widthChunks: 5,
            heightChunks: 5,
            sourcePlanes: [2],
            destinationChunkX: 3,
            destinationChunkY: 5,
        },
    ],
    destination: INSTANCE_ENTRANCE,
    exit: INSTANCE_EXIT,
    grave: INSTANCE_GRAVE,
    npcs: ARMADYL_NPCS,
    dialogs: {
        entry: { id: "armadyl-instance-entry", title: "Enter the Armadyl chamber" },
        join: { id: "armadyl-instance-join", title: "Join an Armadyl party" },
    },
    messages: {
        alreadyInside: "You are already inside an instance.",
        unavailable: "The Armadyl room is unavailable right now.",
        leaveBeforeJoining: "Leave your current instance before joining another party.",
        noJoinableParties: "There are no joinable Armadyl parties.",
        partyUnavailable: "That party is no longer available.",
        peek: (count) =>
            count > 0
                ? `You can see ${count} adventurer${count === 1 ? "" : "s"} in this room.`
                : "You cannot see anyone waiting in a joinable Armadyl room.",
    },
    // The cache exposes no Peek action for this door today.
    actions: { peek: [] },
});

const armadylAltar = defineGwdAltar({
    locId: ARMADYL_ALTAR_LOC_ID,
    roomDefinitionId: ARMADYL_DEFINITION_ID,
    cooldownTicks: CRATE_COOLDOWN_TICKS,
    messages: {
        cooldown: "The gods have already blessed you recently.",
        alreadyFull: "You already have full Prayer points.",
        restored: "The gods bless you, restoring your Prayer points.",
    },
});

function hasGrappleEquipment(player: PlayerState, services: ScriptServices): boolean {
    const weapon = services.equipment.getEquippedItem(player, EquipmentSlot.WEAPON);
    const ammo = services.equipment.getEquippedItem(player, EquipmentSlot.AMMO);
    return MITHRIL_GRAPPLE_IDS.has(ammo) && (services.data.getItemDefinition(weapon)?.name ?? "").toLowerCase().includes("crossbow");
}
function grapple({ player, services, tick }: LocInteractionEvent): void {
    const ranged = player.skillSystem.getSkill(SkillId.Ranged);
    if (ranged.baseLevel < 70) { services.messaging.sendGameMessage(player, "You need a Ranged level of 70 to use this grapple."); return; }
    if (!hasGrappleEquipment(player, services)) { services.messaging.sendGameMessage(player, "You need to wear a crossbow and mithril grapple to do that."); return; }
    const entering = player.tileY >= 5275;
    const destination = entering ? INSIDE_PILLAR : OUTSIDE_PILLAR;
    const previousLock = player.lock;
    player.lock = LockState.FULL;
    services.scheduler.after(3, () => { if (player.lock === LockState.FULL) player.lock = previousLock; }, { kind: "player", id: player.id });
    const startTile = { x: player.tileX, y: player.tileY };
    services.movement.teleportPlayer(player, destination.x, destination.y, destination.level);
    services.movement.queueForcedMovement(player, { startTile, endTile: { x: destination.x, y: destination.y }, endTick: tick + 2, direction: entering ? 0 : 1024 });
    player.clearPendingSeqs();
    services.animation.playPlayerSeq(player, GRAPPLE_ANIMATION_ID);
}
function searchCrate({ player, services, tick }: LocInteractionEvent): void {
    const readyAt = (crateUses.get(player) ?? -Infinity) + CRATE_COOLDOWN_TICKS;
    if (tick < readyAt) { services.messaging.sendGameMessage(player, "You have already searched this crate recently."); return; }
    const added = services.inventory.addItemToInventory(player, MITHRIL_GRAPPLE_ITEM_ID, 1);
    if (added.added < 1) { services.messaging.sendGameMessage(player, "You need an empty inventory space to take the mithril grapple."); return; }
    crateUses.set(player, tick);
    services.inventory.snapshotInventoryImmediate(player);
    services.messaging.sendGameMessage(player, "You find a mithril grapple in the crate.");
}
function kreeTornado(event: NpcAttackEvent): void {
    const room = event.services.instances.get(event.target.id);
    if (room?.definitionId !== ARMADYL_DEFINITION_ID) return;
    const runtime = event.services.encounters.ensure(event.npc);
    if (!runtime) return;
    for (const player of event.services.instances.getMemberPlayers(room.id)) {
        // The primary target is resolved through the normal combat evaluator,
        // preserving its accuracy and prayer calculation. Every other player
        // receives this room-wide tornado impact.
        if (player !== event.target) {
            const maximum = event.attack.traits.maxHitOverride ?? 0;
            event.services.combat.applyNpcDamageToPlayer(
                event.npc,
                player,
                event.attack.traits.type === AttackType.Magic ? 2 : 1,
                runtime.rng.nextInt(maximum + 1),
                event.tick,
            );
        }
        knockback(runtime, event.services, {
            target: player,
            distance: 1,
            tick: event.tick,
            stunTicks: 2,
            preserveNpcTarget: true,
        });
    }
}
function kreeAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    if (event.attack.traits.type === AttackType.Melee) return;
    kreeTornado(event);
}
export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerArmadylEncounters(registry);
    registry.registerLocInteraction(ARMADYL_PILLAR_LOC_ID, grapple, "grapple");
    registry.registerLocInteraction(ARMADYL_PILLAR_LOC_ID, grapple);
    registry.registerLocInteraction(ARMADYL_CRATE_LOC_ID, searchCrate, "search");
    armadylAltar.register(registry);
    armadylRoom.register(registry);
    registry.registerNpcAttack(3162, kreeAttack);
}
