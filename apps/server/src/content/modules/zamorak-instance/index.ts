import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { PRAYER_RECHARGE_SOUND_ID } from "@august/osrs-engine/prayer/prayers";
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
const altarUses = new WeakMap<PlayerState, number>();

function registerZamorakEncounters(): void {
    if (!EncounterRegistry.shared.get("kril-tsutsaroth")) {
        registerEncounter({
            id: "kril-tsutsaroth", npcTypeIds: [3129], maxHealth: 255,
            bossHealthBar: { name: "K'ril Tsutsaroth", npcTypeId: 3129 },
            killcount: { name: "K'ril Tsutsaroth", collectionLogStructId: 494 },
            movement: { wanderRadius: 10, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 30, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [
                { id: "melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 6, maxHit: 46, weight: (context) => context.targetProtectingFromMelee ? 16 : 2, animation: "attack", effects: { poisonDamage: 16 } },
                { id: "magic", type: AttackType.Magic, rangeTiles: 10, maxDistance: 10, preferredDistance: 1, speedTicks: 6, maxHit: 30, weight: (context) => context.targetProtectingFromMelee ? 9 : 1, animation: "attack", effects: { minimumHit: 10 } },
                // 2/27 total attacks: one ninth of K'ril's two-thirds melee share.
                { id: "prayer-smash", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 6, maxHit: 49, weight: 2, animation: "attack", condition: (context) => context.targetProtectingFromMelee, effects: { ignoreProtectionPrayer: true, guaranteedHit: true, minimumHit: 35, prayerDrainFraction: 0.5 } },
            ],
        });
    }
    const guards = [
        { id: "tstanon-karlak", npcTypeId: 3130, type: AttackType.Melee, range: 1, maxHit: 15 },
        { id: "zakln-gritch", npcTypeId: 3131, type: AttackType.Ranged, range: 10, maxHit: 21 },
        { id: "balfrug-kreeyath", npcTypeId: 3132, type: AttackType.Magic, range: 10, maxHit: 16 },
    ] as const;
    for (const guard of guards) {
        if (EncounterRegistry.shared.get(guard.id)) continue;
        registerEncounter({
            id: guard.id, npcTypeIds: [guard.npcTypeId],
            movement: { wanderRadius: 8, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 30, retreatInteractionRange: 40 },
            attacks: [{ id: "attack", type: guard.type, rangeTiles: guard.range, preferredDistance: guard.type === AttackType.Melee ? 1 : guard.range, speedTicks: 5, maxHit: guard.maxHit, animation: "attack" }],
        });
    }
}

function inKrilRoom(player: PlayerState, services: ScriptServices): boolean {
    return services.instances.get(player.id)?.definitionId === ZAMORAK_DEFINITION_ID;
}

function formatCooldown(ticks: number): string {
    const seconds = Math.max(1, Math.ceil((ticks * 600) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes <= 0) return `${seconds} second${seconds === 1 ? "" : "s"}`;
    return remainder === 0 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function prayAtAltar({ player, services, tick }: LocInteractionEvent): void {
    if (!inKrilRoom(player, services)) return;
    const ready = (altarUses.get(player) ?? -Infinity) + ALTAR_COOLDOWN_TICKS;
    if (tick < ready) { services.messaging.sendGameMessage(player, `The gods have already blessed you recently. Wait ${formatCooldown(ready - tick)} and try again.`); return; }
    const prayer = player.skillSystem.getSkill(SkillId.Prayer);
    if (prayer.baseLevel + prayer.boost >= prayer.baseLevel) { services.messaging.sendGameMessage(player, "You already have full Prayer points."); return; }
    services.animation.playPlayerSeq(player, 645);
    player.skillSystem.setSkillBoost(SkillId.Prayer, prayer.baseLevel);
    player.prayer.resetDrainAccumulator();
    services.sound.sendSound(player, PRAYER_RECHARGE_SOUND_ID);
    services.messaging.sendGameMessage(player, "The gods bless you, restoring your Prayer points.");
    altarUses.set(player, tick);
}

function createRoom(player: PlayerState, services: ScriptServices, access: "solo" | "party"): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    // The instance view begins six chunks behind its destination.  K'ril's
    // native source starts five/four chunks into that view; using 4/3 shifts
    // the copied landscape one chunk south-west even though NPC coordinates
    // themselves remain correct.
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: 2912, sourceBaseY: 5312, widthChunks: 4, heightChunks: 4, sourcePlanes: [2], destinationChunkX: 5, destinationChunkY: 4 }]);
    const room = services.instances.create(player, { definitionId: ZAMORAK_DEFINITION_ID, access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party", templateChunks, destination: INSTANCE_ENTRANCE, exit: INSTANCE_EXIT, grave: INSTANCE_GRAVE, npcs: ZAMORAK_NPCS });
    if (!room) { services.messaging.sendGameMessage(player, "The Zamorak room is unavailable right now."); return; }
    services.instances.markStarted(room.id);
}

function showJoinOptions(player: PlayerState, services: ScriptServices): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "Leave your current instance before joining another party."); return; }
    const rooms = services.instances.listJoinable(ZAMORAK_DEFINITION_ID);
    if (!rooms.length) { services.messaging.sendGameMessage(player, "There are no joinable Zamorak parties."); return; }
    const visible = rooms.slice(0, 5);
    services.dialog.openDialogOptions(player, { id: "zamorak-instance-join", title: "Join a Zamorak party", options: visible.map((room) => `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`), modal: true, onSelect: (choice) => { const room = visible[choice]; if (!room || !services.instances.join(player, room.id)) services.messaging.sendGameMessage(player, "That party is no longer available."); } });
}

function showEntryOptions(player: PlayerState, services: ScriptServices): void {
    if (inKrilRoom(player, services)) { services.instances.leave(player, INSTANCE_EXIT); return; }
    services.dialog.openDialogOptions(player, { id: "zamorak-instance-entry", title: "Enter the Zamorak chamber", options: ["Enter solo", "Create a party instance", "Join a party instance"], modal: true, onSelect: (choice) => { if (choice === 0) createRoom(player, services, "solo"); else if (choice === 1) createRoom(player, services, "party"); else if (choice === 2) showJoinOptions(player, services); } });
}

function peek({ player, services }: LocInteractionEvent): void {
    const room = services.instances.get(player.id);
    const adventurers = room?.definitionId === ZAMORAK_DEFINITION_ID ? room.memberPlayerIds.length : services.instances.listJoinable(ZAMORAK_DEFINITION_ID).reduce((total, entry) => total + entry.memberPlayerIds.length, 0);
    services.messaging.sendGameMessage(player, adventurers ? `You can see ${adventurers} adventurer${adventurers === 1 ? "" : "s"} in this room.` : "You cannot see anyone waiting in a joinable Zamorak room.");
}

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
    registerZamorakEncounters();
    registry.registerLocInteraction(ZAMORAK_DOOR_LOC_ID, ({ player, services }) => showEntryOptions(player, services), "open");
    registry.registerLocInteraction(ZAMORAK_DOOR_LOC_ID, peek, "peek");
    registry.registerLocInteraction(ZAMORAK_DOOR_LOC_ID, ({ player, services }) => createRoom(player, services, "solo"), "enter solo");
    registry.registerLocInteraction(ZAMORAK_DOOR_LOC_ID, ({ player, services }) => createRoom(player, services, "party"), "enter party");
    registry.registerLocInteraction(ZAMORAK_DOOR_LOC_ID, ({ player, services }) => showJoinOptions(player, services), "join party");
    registry.registerLocInteraction(ZAMORAK_ALTAR_LOC_ID, prayAtAltar, "pray");
    registry.registerLocInteraction(ZAMORAK_ALTAR_LOC_ID, prayAtAltar, "pray-at");
    registry.registerLocInteraction(ICE_BRIDGE_LOC_ID, crossIceBridge, "climb-off");
    // The cache has only option 1, but retain an id-specific fallback for
    // clients that submit a loc-op before its action string is resolved.
    registry.registerLocInteraction(ICE_BRIDGE_LOC_ID, crossIceBridge);
}
