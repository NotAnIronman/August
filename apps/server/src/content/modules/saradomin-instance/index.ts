import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";
import { AttackType } from "@server/game/combat/AttackType";
import { attack, defineBoss } from "@server/game/encounters/BossDefinition";
import { defineBossRoom } from "@server/game/encounters/BossRoom";
import { registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import { defineGwdAltar } from "@server/game/encounters/GwdAltar";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import { setAccountProgress, VARP_SARADOMIN_FIRST_ROPE, VARP_SARADOMIN_SECOND_ROPE } from "@server/content/modules/frozen-door/progress";

const ZILYANA_DOOR_LOC_ID = 26504;
const SARADOMIN_ALTAR_LOC_ID = 26364;
const ROPE_ITEM_ID = 954;
const FIRST_ROCK_LOC_ID = 26561;
const SECOND_ROCK_LOC_ID = 26562;
// Cache-confirmed Saradomin Encampment rope states. The supplied map uses
// newer anchor ids (26561/26562), while the tied and hanging assets remain
// these canonical rope variants.
const FIRST_TIED_ROCK_LOC_ID = 26372;
const FIRST_HANGING_ROPE_LOC_ID = 26374;
const SECOND_TIED_ROCK_LOC_ID = 26376;
const SECOND_HANGING_ROPE_LOC_ID = 26378;
const ROPE_LOC_SHAPE = 10;
const ZILYANA_DEFINITION_ID = "zilyana-room";
const INSTANCE_ENTRANCE = Object.freeze({ x: 2908, y: 5265, level: 0 });
const INSTANCE_EXIT = Object.freeze({ x: 2909, y: 5265, level: 0 });
const INSTANCE_GRAVE = Object.freeze({
    locId: INSTANCE_GRAVE_RECLAIM_LOC_ID,
    tile: { x: 2910, y: 5267 },
    level: 0,
});
const FIRST_ROCK_TILE = Object.freeze({ x: 2912, y: 5300, level: 2 });
const FIRST_LOWER_ROPE_TILE = Object.freeze({ x: 2914, y: 5300, level: 1 });
const SECOND_ROCK_TILE = Object.freeze({ x: 2920, y: 5276, level: 1 });
const SECOND_LOWER_ROPE_TILE = Object.freeze({ x: 2920, y: 5274, level: 0 });
const FIRST_DESCENT = Object.freeze({ x: 2915, y: 5300, level: 1 });
const SECOND_DESCENT = Object.freeze({ x: 2919, y: 5274, level: 0 });
const INSTANCE_BASE = Object.freeze({ x: 2856, y: 5216 });
const SARADOMIN_NPCS = Object.freeze([
    Object.freeze({ id: 2205, offsetX: 2897 - INSTANCE_BASE.x, offsetY: 5269 - INSTANCE_BASE.y, level: 0 }),
    Object.freeze({ id: 2206, offsetX: 2903 - INSTANCE_BASE.x, offsetY: 5261 - INSTANCE_BASE.y, level: 0 }),
    Object.freeze({ id: 2207, offsetX: 2896 - INSTANCE_BASE.x, offsetY: 5264 - INSTANCE_BASE.y, level: 0 }),
    Object.freeze({ id: 2208, offsetX: 2902 - INSTANCE_BASE.x, offsetY: 5274 - INSTANCE_BASE.y, level: 0 }),
]);

function registerSaradominEncounters(registry: IScriptRegistry): void {
    registerOwnedEncounter(registry, defineBoss({
            id: "commander-zilyana", npcTypeIds: [2205], maxHealth: 255,
            bossHealthBar: { name: "Commander Zilyana", npcTypeId: 2205 },
            killcount: { name: "Commander Zilyana", collectionLogStructId: 483 },
            movement: { wanderRadius: 12, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            // Both attacks require melee distance: Zilyana cannot attack a kited target.
            attacks: [
                attack.melee({ id: "melee", speedTicks: 2, maxHit: 27, weight: 1, animation: "melee" }),
                attack.magic({ id: "magic", rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 2, maxHit: 20, weight: 1, animation: "attack", effects: { minimumHit: 10 } }),
            ],
        }));
    const guards = [
        { id: "starlight", npcTypeId: 2206, type: AttackType.Melee, range: 1, maxHit: 15 },
        { id: "growler", npcTypeId: 2207, type: AttackType.Magic, range: 10, maxHit: 16 },
        { id: "bree", npcTypeId: 2208, type: AttackType.Ranged, range: 10, maxHit: 16 },
    ] as const;
    for (const guard of guards) {
        registerOwnedEncounter(registry, defineBoss({
            id: `zilyana-${guard.id}`, npcTypeIds: [guard.npcTypeId],
            movement: { wanderRadius: 10, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            attacks: [{ id: "attack", type: guard.type, rangeTiles: guard.range, preferredDistance: guard.type === AttackType.Melee ? 1 : guard.range, speedTicks: 4, maxHit: guard.maxHit, animation: "attack" }],
        }));
    }
}

const saradominRoom = defineBossRoom({
    id: ZILYANA_DEFINITION_ID,
    doorLocId: ZILYANA_DOOR_LOC_ID,
    // The room's native source starts three/four chunks into this player's instance view.
    templateCopies: [
        {
            sourceBaseX: 2880,
            sourceBaseY: 5248,
            widthChunks: 5,
            heightChunks: 5,
            sourcePlanes: [0],
            destinationChunkX: 3,
            destinationChunkY: 4,
        },
    ],
    destination: INSTANCE_ENTRANCE,
    exit: INSTANCE_EXIT,
    grave: INSTANCE_GRAVE,
    npcs: SARADOMIN_NPCS,
    dialogs: {
        entry: { id: "saradomin-instance-entry", title: "Enter the Saradomin chamber" },
        join: { id: "saradomin-instance-join", title: "Join a Saradomin party" },
    },
    messages: {
        alreadyInside: "You are already inside an instance.",
        unavailable: "The Saradomin room is unavailable right now.",
        leaveBeforeJoining: "Leave your current instance before joining another party.",
        noJoinableParties: "There are no joinable Saradomin parties.",
        partyUnavailable: "That party is no longer available.",
        peek: (count) =>
            count > 0
                ? `You can see ${count} adventurer${count === 1 ? "" : "s"} in this room.`
                : "You cannot see anyone waiting in a joinable Saradomin room.",
    },
});

const saradominAltar = defineGwdAltar({
    locId: SARADOMIN_ALTAR_LOC_ID,
    roomDefinitionId: ZILYANA_DEFINITION_ID,
    messages: {
        cooldown: "The gods have already blessed you recently.",
        alreadyFull: "You already have full Prayer points.",
        restored: "The gods bless you, restoring your Prayer points.",
    },
});

function hasUnboostedAgility(player: PlayerState): boolean {
    return player.skillSystem.getSkill(SkillId.Agility).baseLevel >= 70;
}

function tieRope(event: LocInteractionEvent, tiedRockId: number, hangingRopeId: number, lowerRopeTile: { x: number; y: number; level: number }, rotation: number, hangingRotation: number, progressVarp: number): void {
    const { player, services, tile, level, locId } = event;
    if (!hasUnboostedAgility(player)) { services.messaging.sendGameMessage(player, "You need an Agility level of 70 to climb here."); return; }
    const alreadyTied = player.varps.getVarpValue(progressVarp) >= 1;
    if (!alreadyTied) {
        if (!player.items.hasItem(ROPE_ITEM_ID, 1)) { services.messaging.sendGameMessage(player, "You need a rope to tie here."); return; }
        const removed = player.items.removeItem(ROPE_ITEM_ID, 1, { assureFullRemoval: true });
        if (removed.completed !== 1) { services.messaging.sendGameMessage(player, "You need a rope to tie here."); return; }
        setAccountProgress(player, services, progressVarp);
    }
    services.inventory.snapshotInventoryImmediate(player);
    services.location.replaceTemporaryLoc({ worldViewId: -1 }, locId, tiedRockId, tile, level, { newShape: ROPE_LOC_SHAPE, newRotation: rotation });
    services.location.replaceTemporaryLoc({ worldViewId: -1 }, 0, hangingRopeId, lowerRopeTile, lowerRopeTile.level, { newShape: ROPE_LOC_SHAPE, newRotation: hangingRotation });
    services.messaging.sendGameMessage(player, alreadyTied ? "The rope is already tied securely here." : "You tie the rope securely to the rock.");
}

function climb(player: PlayerState, services: ScriptServices, destination: { x: number; y: number; level: number }): void {
    if (!hasUnboostedAgility(player)) { services.messaging.sendGameMessage(player, "You need an Agility level of 70 to climb here."); return; }
    services.movement.teleportPlayer(player, destination.x, destination.y, destination.level);
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerSaradominEncounters(registry);
    saradominRoom.register(registry);
    // First descent faces back toward the waterfall (180°); second faces west (90° CCW).
    registry.registerLocInteraction(FIRST_ROCK_LOC_ID, (event) => tieRope(event, FIRST_TIED_ROCK_LOC_ID, FIRST_HANGING_ROPE_LOC_ID, FIRST_LOWER_ROPE_TILE, 2, 2, VARP_SARADOMIN_FIRST_ROPE), "tie-rope");
    registry.registerLocInteraction(SECOND_ROCK_LOC_ID, (event) => tieRope(event, SECOND_TIED_ROCK_LOC_ID, SECOND_HANGING_ROPE_LOC_ID, SECOND_LOWER_ROPE_TILE, 3, 3, VARP_SARADOMIN_SECOND_ROPE), "tie-rope");
    saradominAltar.register(registry);
    registry.registerLocInteraction(FIRST_TIED_ROCK_LOC_ID, ({ player, services }) => climb(player, services, FIRST_DESCENT), "climb-down");
    registry.registerLocInteraction(FIRST_HANGING_ROPE_LOC_ID, ({ player, services }) => climb(player, services, FIRST_ROCK_TILE), "climb-up");
    registry.registerLocInteraction(SECOND_TIED_ROCK_LOC_ID, ({ player, services }) => climb(player, services, SECOND_DESCENT), "climb-down");
    registry.registerLocInteraction(SECOND_HANGING_ROPE_LOC_ID, ({ player, services }) => climb(player, services, SECOND_ROCK_TILE), "climb-up");
}
