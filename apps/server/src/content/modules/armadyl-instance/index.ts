import { EquipmentSlot } from "@august/osrs-engine/config/player/Equipment";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { PRAYER_RECHARGE_SOUND_ID } from "@august/osrs-engine/prayer/prayers";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import type { PlayerState } from "@server/game/player";
import { NpcAttackDecision, type IScriptRegistry, type LocInteractionEvent, type NpcAttackEvent, type ScriptServices } from "@server/game/scripts/types";

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
const altarUses = new WeakMap<PlayerState, number>();

function registerArmadylEncounters(): void {
    if (!EncounterRegistry.shared.get("kreearra")) {
        registerEncounter({
            id: "kreearra", npcTypeIds: [3162], maxHealth: 255,
            bossHealthBar: { name: "Kree'arra", npcTypeId: 3162 },
            movement: { wanderRadius: 10, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [
                // While engaged, Kree rolls these two tornadoes evenly. If nobody is attacking her,
                // she instead closes in and uses her melee attack.
                { id: "ranged-tornado", type: AttackType.Ranged, rangeTiles: 15, speedTicks: 3, maxHit: 69, weight: 1, animation: "ranged", condition: (context) => context.targetIsAttackingNpc },
                { id: "magic-tornado", type: AttackType.Magic, rangeTiles: 15, speedTicks: 3, maxHit: 21, weight: 1, animation: "magic", effects: { defenceRollAttackType: AttackType.Ranged }, condition: (context) => context.targetIsAttackingNpc },
                { id: "melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 3, maxHit: 26, weight: 1, animation: "melee", condition: (context) => !context.targetIsAttackingNpc },
            ],
        });
    }
    const guards = [
        { id: "wingman-skree", npcTypeId: 3163, type: AttackType.Magic, range: 10, maxHit: 16 },
        { id: "flockleader-geerin", npcTypeId: 3164, type: AttackType.Ranged, range: 10, maxHit: 25 },
        { id: "flight-kilisa", npcTypeId: 3165, type: AttackType.Melee, range: 1, maxHit: 15 },
    ] as const;
    for (const guard of guards) {
        if (EncounterRegistry.shared.get(guard.id)) continue;
        registerEncounter({ id: guard.id, npcTypeIds: [guard.npcTypeId], movement: { wanderRadius: 8, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 }, attacks: [{ id: "attack", type: guard.type, rangeTiles: guard.range, preferredDistance: guard.type === AttackType.Melee ? 1 : guard.range, speedTicks: 4, maxHit: guard.maxHit, animation: "attack" }] });
    }
}

function inKreeRoom(player: PlayerState, services: ScriptServices): boolean { return services.instances.get(player.id)?.definitionId === ARMADYL_DEFINITION_ID; }
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
function prayAtAltar({ player, services, tick }: LocInteractionEvent): void {
    if (!inKreeRoom(player, services)) return;
    const readyAt = (altarUses.get(player) ?? -Infinity) + CRATE_COOLDOWN_TICKS;
    if (tick < readyAt) { services.messaging.sendGameMessage(player, "The gods have already blessed you recently."); return; }
    const prayer = player.skillSystem.getSkill(SkillId.Prayer);
    if (prayer.baseLevel + prayer.boost >= prayer.baseLevel) { services.messaging.sendGameMessage(player, "You already have full Prayer points."); return; }
    services.animation.playPlayerSeq(player, 645);
    player.skillSystem.setSkillBoost(SkillId.Prayer, prayer.baseLevel);
    player.prayer.resetDrainAccumulator();
    services.sound.sendSound(player, PRAYER_RECHARGE_SOUND_ID);
    altarUses.set(player, tick);
    services.messaging.sendGameMessage(player, "The gods bless you, restoring your Prayer points.");
}
function createRoom(player: PlayerState, services: ScriptServices, access: "solo" | "party"): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 2808, sourceBaseY: 5280, widthChunks: 5, heightChunks: 5, sourcePlanes: [2], destinationChunkX: 3, destinationChunkY: 5 }]);
    const room = services.instances.create(player, { definitionId: ARMADYL_DEFINITION_ID, access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party", templateChunks, destination: INSTANCE_ENTRANCE, exit: INSTANCE_EXIT, grave: INSTANCE_GRAVE, npcs: ARMADYL_NPCS });
    if (!room) { services.messaging.sendGameMessage(player, "The Armadyl room is unavailable right now."); return; }
    services.instances.markStarted(room.id);
}
function joinOptions(player: PlayerState, services: ScriptServices): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "Leave your current instance before joining another party."); return; }
    const rooms = services.instances.listJoinable(ARMADYL_DEFINITION_ID);
    if (!rooms.length) { services.messaging.sendGameMessage(player, "There are no joinable Armadyl parties."); return; }
    const visible = rooms.slice(0, 5);
    services.dialog.openDialogOptions(player, { id: "armadyl-instance-join", title: "Join an Armadyl party", options: visible.map((room) => `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`), modal: true, onSelect: (choice) => { const room = visible[choice]; if (!room || !services.instances.join(player, room.id)) services.messaging.sendGameMessage(player, "That party is no longer available."); } });
}
function entryOptions(player: PlayerState, services: ScriptServices): void {
    if (inKreeRoom(player, services)) { services.instances.leave(player, INSTANCE_EXIT); return; }
    services.dialog.openDialogOptions(player, { id: "armadyl-instance-entry", title: "Enter the Armadyl chamber", options: ["Enter solo", "Create a party instance", "Join a party instance"], modal: true, onSelect: (choice) => { if (choice === 0) createRoom(player, services, "solo"); else if (choice === 1) createRoom(player, services, "party"); else if (choice === 2) joinOptions(player, services); } });
}
function knockback(event: NpcAttackEvent): void {
    const room = event.services.instances.get(event.target.id);
    if (room?.definitionId !== ARMADYL_DEFINITION_ID) return;
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
                Math.floor(Math.random() * (maximum + 1)),
                event.tick,
            );
        }
        const dx = Math.sign(player.tileX - event.npc.tileX) || 1;
        const dy = Math.sign(player.tileY - event.npc.tileY) || 1;
        const destination = { x: player.tileX + dx, y: player.tileY + dy };
        const path = event.services.movement.getPathService()?.findPathSteps({ from: { x: player.tileX, y: player.tileY, plane: player.level }, to: destination, size: 1, worldViewId: player.worldViewId }, { maxSteps: 1 });
        if (path?.ok && path.steps?.length === 1 && path.steps[0].x === destination.x && path.steps[0].y === destination.y) {
            const startTile = { x: player.tileX, y: player.tileY };
            event.services.movement.teleportPlayer(player, destination.x, destination.y, player.level);
            event.services.movement.queueForcedMovement(player, { startTile, endTile: destination, endTick: event.tick + 1 });
            // MovementService deliberately clears interactions on teleports. Kree's
            // tornado is forced movement, not a target change, so restore it.
            player.setCombatTarget(event.npc);
            player.setInteraction("npc", event.npc.id);
            event.services.combat.stunPlayer(player, 2);
        }
    }
}
function kreeAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    if (event.attack.traits.type === AttackType.Melee) return;
    knockback(event);
}
export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerArmadylEncounters();
    registry.registerLocInteraction(ARMADYL_PILLAR_LOC_ID, grapple, "grapple");
    registry.registerLocInteraction(ARMADYL_PILLAR_LOC_ID, grapple);
    registry.registerLocInteraction(ARMADYL_CRATE_LOC_ID, searchCrate, "search");
    registry.registerLocInteraction(ARMADYL_ALTAR_LOC_ID, prayAtAltar, "pray");
    registry.registerLocInteraction(ARMADYL_ALTAR_LOC_ID, prayAtAltar, "pray-at");
    registry.registerLocInteraction(ARMADYL_DOOR_LOC_ID, ({ player, services }) => entryOptions(player, services), "open");
    registry.registerLocInteraction(ARMADYL_DOOR_LOC_ID, ({ player, services }) => createRoom(player, services, "solo"), "enter solo");
    registry.registerLocInteraction(ARMADYL_DOOR_LOC_ID, ({ player, services }) => createRoom(player, services, "party"), "enter party");
    registry.registerLocInteraction(ARMADYL_DOOR_LOC_ID, ({ player, services }) => joinOptions(player, services), "join party");
    registry.registerNpcAttack(3162, kreeAttack);
}
