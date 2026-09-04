import type { IScriptRegistry, LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";
import { AttackType } from "@server/game/combat/AttackType";
import { attack, defineBoss } from "@server/game/encounters/BossDefinition";
import { defineBossRoom } from "@server/game/encounters/BossRoom";
import { registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import { defineGwdAltar, formatGwdAltarCooldown } from "@server/game/encounters/GwdAltar";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import { LockState } from "@server/game/model/LockState";

const ZAMORAK_DOOR_LOC_ID = 26505;
const ZAMORAK_ALTAR_LOC_ID = 26363;
const ICE_BRIDGE_LOC_ID = 26518;
const ZAMORAK_DEFINITION_ID = "kril-room";
const ALTAR_COOLDOWN_TICKS = 500;
const JUMP_ANIMATION_ID = 6132;
const BRIDGE_START = Object.freeze({ x: 2885, y: 5331, level: 2 });
const BRIDGE_END = Object.freeze({ x: 2885, y: 5347, level: 2 });
const INSTANCE_EXIT = Object.freeze({ x: 2925, y: 5333, level: 2 });
const INSTANCE_ENTRANCE = Object.freeze({ x: 2925, y: 5332, level: 2 });
const INSTANCE_GRAVE = Object.freeze({
    locId: INSTANCE_GRAVE_RECLAIM_LOC_ID,
    tile: { x: 2925, y: 5335 },
    level: 2,
});
// The copied 4x4-chunk room preserves the native K'ril arena and its altar.
const INSTANCE_BASE = Object.freeze({ x: 2872, y: 5280 });
const ZAMORAK_NPCS = Object.freeze([
    Object.freeze({ id: 3129, offsetX: 2925 - INSTANCE_BASE.x, offsetY: 5322 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 3130, offsetX: 2932 - INSTANCE_BASE.x, offsetY: 5328 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 3131, offsetX: 2919 - INSTANCE_BASE.x, offsetY: 5327 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 3132, offsetX: 2921 - INSTANCE_BASE.x, offsetY: 5319 - INSTANCE_BASE.y, level: 2 }),
]);

function registerZamorakEncounters(registry: IScriptRegistry): void {
    registerOwnedEncounter(registry, defineBoss({
            id: "kril-tsutsaroth", npcTypeIds: [3129], maxHealth: 255,
            bossHealthBar: { name: "K'ril Tsutsaroth", npcTypeId: 3129 },
            killcount: { name: "K'ril Tsutsaroth", collectionLogStructId: 494 },
            movement: { wanderRadius: 10, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 30, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [
                attack.melee({ id: "melee", speedTicks: 6, maxHit: 46, weight: (context) => context.targetProtectingFromMelee ? 16 : 2, animation: "attack", effects: { poisonDamage: 16 } }),
                attack.magic({ id: "magic", maxDistance: 10, preferredDistance: 1, speedTicks: 6, maxHit: 30, weight: (context) => context.targetProtectingFromMelee ? 9 : 1, animation: "attack", effects: { minimumHit: 10 } }),
                // 2/27 total attacks: one ninth of K'ril's two-thirds melee share.
                attack.melee({ id: "prayer-smash", speedTicks: 6, maxHit: 49, weight: 2, animation: "attack", condition: (context) => context.targetProtectingFromMelee, effects: { ignoreProtectionPrayer: true, guaranteedHit: true, minimumHit: 35, prayerDrainFraction: 0.5 } }),
            ],
        }));
    const guards = [
        { id: "tstanon-karlak", npcTypeId: 3130, type: AttackType.Melee, range: 1, maxHit: 15 },
        { id: "zakln-gritch", npcTypeId: 3131, type: AttackType.Ranged, range: 10, maxHit: 21 },
        { id: "balfrug-kreeyath", npcTypeId: 3132, type: AttackType.Magic, range: 10, maxHit: 16 },
    ] as const;
    for (const guard of guards) {
        registerOwnedEncounter(registry, defineBoss({
            id: guard.id, npcTypeIds: [guard.npcTypeId],
            movement: { wanderRadius: 8, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 30, retreatInteractionRange: 40 },
            attacks: [{ id: "attack", type: guard.type, rangeTiles: guard.range, preferredDistance: guard.type === AttackType.Melee ? 1 : guard.range, speedTicks: 5, maxHit: guard.maxHit, animation: "attack" }],
        }));
    }
}

const zamorakRoom = defineBossRoom({
    id: ZAMORAK_DEFINITION_ID,
    doorLocId: ZAMORAK_DOOR_LOC_ID,
    // The instance view begins six chunks behind its destination.  K'ril's
    // native source starts five/four chunks into that view; using 4/3 shifts
    // the copied landscape one chunk south-west even though NPC coordinates
    // themselves remain correct.
    templateCopies: [
        {
            sourceBaseX: 2912,
            sourceBaseY: 5312,
            widthChunks: 4,
            heightChunks: 4,
            sourcePlanes: [2],
            destinationChunkX: 5,
            destinationChunkY: 4,
        },
    ],
    destination: INSTANCE_ENTRANCE,
    exit: INSTANCE_EXIT,
    grave: INSTANCE_GRAVE,
    npcs: ZAMORAK_NPCS,
    dialogs: {
        entry: { id: "zamorak-instance-entry", title: "Enter the Zamorak chamber" },
        join: { id: "zamorak-instance-join", title: "Join a Zamorak party" },
    },
    messages: {
        alreadyInside: "You are already inside an instance.",
        unavailable: "The Zamorak room is unavailable right now.",
        leaveBeforeJoining: "Leave your current instance before joining another party.",
        noJoinableParties: "There are no joinable Zamorak parties.",
        partyUnavailable: "That party is no longer available.",
        peek: (count) =>
            count > 0
                ? `You can see ${count} adventurer${count === 1 ? "" : "s"} in this room.`
                : "You cannot see anyone waiting in a joinable Zamorak room.",
    },
});

const zamorakAltar = defineGwdAltar({
    locId: ZAMORAK_ALTAR_LOC_ID,
    roomDefinitionId: ZAMORAK_DEFINITION_ID,
    cooldownTicks: ALTAR_COOLDOWN_TICKS,
    messages: {
        cooldown: (remainingTicks) =>
            `The gods have already blessed you recently. Wait ${formatGwdAltarCooldown(remainingTicks)} and try again.`,
        alreadyFull: "You already have full Prayer points.",
        restored: "The gods bless you, restoring your Prayer points.",
    },
});

function crossIceBridge({ player, services, tick }: LocInteractionEvent): void {
    const hitpoints = player.skillSystem.getSkill(SkillId.Hitpoints);
    // The identical bridge loc exists on both banks. Its clicked anchor tile
    // is therefore not a reliable direction signal; the player's bank is.
    const forward = player.tileY < 5340;
    if (forward && hitpoints.baseLevel + hitpoints.boost < 70) { services.messaging.sendGameMessage(player, "You need a Hitpoints level of 70 to cross this bridge."); return; }
    const destination = forward ? BRIDGE_END : BRIDGE_START;
    const previousLock = player.lock;
    player.lock = LockState.FULL;
    services.scheduler.after(3, () => { if (player.lock === LockState.FULL) player.lock = previousLock; }, { kind: "player", id: player.id });
    const startTile = { x: player.tileX, y: player.tileY };
    services.movement.teleportPlayer(player, destination.x, destination.y, destination.level);
    services.movement.queueForcedMovement(player, { startTile, endTile: { x: destination.x, y: destination.y }, endTick: tick + 2, direction: forward ? 1024 : 0 });
    player.clearPendingSeqs();
    services.animation.playPlayerSeq(player, JUMP_ANIMATION_ID);
    if (forward) { player.skillSystem.setSkillBoost(SkillId.Prayer, 0); player.prayer.resetDrainAccumulator(); }
    services.messaging.sendGameMessage(player, "Dripping, you climb out of the water.");
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerZamorakEncounters(registry);
    zamorakRoom.register(registry);
    zamorakAltar.register(registry);
    registry.registerLocInteraction(ICE_BRIDGE_LOC_ID, crossIceBridge, "climb-off");
    // The cache has only option 1, but retain an id-specific fallback for
    // clients that submit a loc-op before its action string is resolved.
    registry.registerLocInteraction(ICE_BRIDGE_LOC_ID, crossIceBridge);
}
