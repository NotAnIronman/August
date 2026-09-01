import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";
import { PRAYER_RECHARGE_SOUND_ID } from "@august/osrs-engine/prayer/prayers";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { AttackType } from "@server/game/combat/AttackType";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import type { NpcState } from "@server/game/npc";

const KILLCOUNT_DOOR_ID = 42933;
const BANK_DOOR_ID = 42934;
const ANCIENT_BARRIER_ID = 42967;
// The current cache exposes the barrier under these IDs.  Keep the requested
// 42967 registration too, so this content remains valid when its map data is
// updated to the newer cache revision.
const ANCIENT_BARRIER_VARIANT_IDS = [42937, 42938, 42939, 42940, ANCIENT_BARRIER_ID] as const;
const ASHUELOT_REIS_ID = 11289;
const BANK_BOOTH_ID = 6084;
const NEX_ALTAR_ID = 42965;
const NEX_DEFINITION_ID = "nex-room";

const KILLCOUNT_OUTSIDE = Object.freeze({ x: 2861, y: 5219, level: 0 });
const KILLCOUNT_INSIDE = Object.freeze({ x: 2863, y: 5219, level: 0 });
const BANK_OUTSIDE = Object.freeze({ x: 2898, y: 5203, level: 0 });
const BANK_INSIDE = Object.freeze({ x: 2900, y: 5203, level: 0 });
const BARRIER_OUTSIDE = Object.freeze({ x: 2908, y: 5204, level: 0 });
const BARRIER_INSIDE = Object.freeze({ x: 2910, y: 5203, level: 0 });
const BANK_TILE = Object.freeze({ x: 2904, y: 5205, level: 0 });
const INSTANCE_BASE = Object.freeze({ x: 2856, y: 5152 });
const NEX_NPCS = Object.freeze([
    Object.freeze({ id: 11278, offsetX: 2924 - INSTANCE_BASE.x, offsetY: 5202 - INSTANCE_BASE.y, level: 0, direction: 3, isAggressive: true, aggressionRadius: 15, attackSpeed: 4 }),
    Object.freeze({ id: 11283, offsetX: 2913 - INSTANCE_BASE.x, offsetY: 5215 - INSTANCE_BASE.y, level: 0, wanderRadius: 0, isUnattackable: true, isAggressive: true, aggressionRadius: 10, attackSpeed: 5 }),
    Object.freeze({ id: 11284, offsetX: 2937 - INSTANCE_BASE.x, offsetY: 5215 - INSTANCE_BASE.y, level: 0, wanderRadius: 0, isUnattackable: true, isAggressive: true, aggressionRadius: 10, attackSpeed: 5 }),
    Object.freeze({ id: 11285, offsetX: 2937 - INSTANCE_BASE.x, offsetY: 5191 - INSTANCE_BASE.y, level: 0, wanderRadius: 0, isUnattackable: true, isAggressive: true, aggressionRadius: 10, attackSpeed: 5 }),
    Object.freeze({ id: 11286, offsetX: 2913 - INSTANCE_BASE.x, offsetY: 5191 - INSTANCE_BASE.y, level: 0, wanderRadius: 0, isUnattackable: true, isAggressive: true, aggressionRadius: 10, attackSpeed: 5 }),
]);
// The cache revision used by August has the Ancient Prison map but omits its
// NPC-spawn records.  These are the full live population (12/9/5/5) in the
// prison's killcount hall; keep them separate from the private Nex encounter.
const ANCIENT_PRISON_NPCS = Object.freeze([
    ...[[2864, 5228], [2868, 5225], [2872, 5229], [2876, 5224], [2880, 5228], [2884, 5225], [2888, 5229], [2892, 5224], [2896, 5228], [2900, 5225], [2904, 5229], [2906, 5223]].map(([x, y]) => Object.freeze({ id: 11293, x, y, level: 0, wanderRadius: 3, isAggressive: true, aggressionRadius: 12 })),
    ...[[2865, 5215], [2870, 5219], [2875, 5213], [2880, 5218], [2885, 5214], [2890, 5219], [2895, 5213], [2900, 5218], [2905, 5214]].map(([x, y]) => Object.freeze({ id: 11290, x, y, level: 0, wanderRadius: 3, isAggressive: true, aggressionRadius: 12 })),
    ...[[2867, 5208], [2876, 5208], [2885, 5208], [2894, 5208], [2903, 5208]].map(([x, y]) => Object.freeze({ id: 11291, x, y, level: 0, wanderRadius: 3, isAggressive: true, aggressionRadius: 12 })),
    ...[[2867, 5220], [2876, 5220], [2885, 5220], [2894, 5220], [2903, 5220]].map(([x, y]) => Object.freeze({ id: 11292, x, y, level: 0, wanderRadius: 3, isAggressive: true, aggressionRadius: 12 })),
]);
const altarUses = new WeakMap<PlayerState, number>();
const ALTAR_COOLDOWN_TICKS = 500;

const PHASE_GATES = Object.freeze([
    Object.freeze({ hitpoints: 2720, mageId: 11283, name: "Fumus", transition: "Fumus, don't fail me!" }),
    Object.freeze({ hitpoints: 2040, mageId: 11284, name: "Umbra", transition: "Umbra, don't fail me!" }),
    Object.freeze({ hitpoints: 1360, mageId: 11285, name: "Cruor", transition: "Cruor, don't fail me!" }),
    Object.freeze({ hitpoints: 680, mageId: 11286, name: "Glacies", transition: "Glacies, don't fail me!" }),
]);

interface NexPhaseController {
    readonly nex: NpcState;
    readonly mages: Map<number, NpcState>;
    gateIndex: number;
    waitingForMageId?: number;
    readyToAdvance: boolean;
}

function registerNexEncounters(): void {
    if (!EncounterRegistry.shared.get("nex")) {
        registerEncounter({
            id: "nex",
            npcTypeIds: [11278],
            maxHealth: 3400,
            bossHealthBar: { name: "Nex", npcTypeId: 11278 },
            killcount: { name: "Nex", collectionLogStructId: 3769 },
            movement: { wanderRadius: 10, aggressionRadius: 15, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 35, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            // Phase-specific attack pools and specials are intentionally added
            // after this lifecycle layer. Until then Nex has her authentic
            // smoke-phase base styles rather than a misleading mixed pool.
            attacks: [
                { id: "melee", type: AttackType.Melee, rangeTiles: 1, maxDistance: 1, preferredDistance: 1, speedTicks: 4, maxHit: 27, animation: "melee" },
                { id: "smoke-magic", type: AttackType.Magic, rangeTiles: 10, preferredDistance: 1, speedTicks: 4, maxHit: 33, animation: "magic" },
            ],
        });
    }

    for (const mage of [
        { id: "fumus", npcTypeId: 11283, maxHealth: 2720 },
        { id: "umbra", npcTypeId: 11284, maxHealth: 2040 },
        { id: "cruor", npcTypeId: 11285, maxHealth: 1360 },
        { id: "glacies", npcTypeId: 11286, maxHealth: 680 },
    ] as const) {
        if (EncounterRegistry.shared.get(`nex-${mage.id}`)) continue;
        registerEncounter({
            id: `nex-${mage.id}`,
            npcTypeIds: [mage.npcTypeId],
            maxHealth: mage.maxHealth,
            movement: { wanderRadius: 0, aggressionRadius: 10, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 0, retreatInteractionRange: 40 },
            immunities: { poison: true, venom: true },
            attacks: [{ id: "ancient-magic", type: AttackType.Magic, rangeTiles: 10, preferredDistance: 10, speedTicks: 5, maxHit: 29, animation: "magic" }],
        });
    }
}

function crossDoor(
    event: LocInteractionEvent,
    outside: Readonly<{ x: number; y: number; level: number }>,
    inside: Readonly<{ x: number; y: number; level: number }>,
): void {
    const { player, services } = event;
    const outsideDistance = Math.max(Math.abs(player.tileX - outside.x), Math.abs(player.tileY - outside.y));
    const insideDistance = Math.max(Math.abs(player.tileX - inside.x), Math.abs(player.tileY - inside.y));
    const destination = outsideDistance <= insideDistance ? inside : outside;
    services.movement.teleportPlayer(player, destination.x, destination.y, destination.level);
}

function isNexInstance(player: PlayerState, services: ScriptServices): boolean {
    return services.instances.get(player.id)?.definitionId === NEX_DEFINITION_ID;
}

function createRoom(player: PlayerState, services: ScriptServices, access: "solo" | "party"): void {
    if (services.instances.get(player.id)) {
        services.messaging.sendGameMessage(player, "You are already inside an instance.");
        return;
    }
    // The ancient prison occupies the eight-by-nine chunk area beginning at
    // 2880,5152. The barrier's instance view begins at 2856,5152, so the
    // source lands at chunks 3..10 / 0..8 without an offset. The extra north
    // chunk preserves the arena's upper edge rather than clipping it.
    const templateChunks = services.instances.buildTemplate([{
        sourceBaseX: 2880,
        sourceBaseY: 5152,
        widthChunks: 8,
        heightChunks: 9,
        sourcePlanes: [0],
        destinationChunkX: 3,
        destinationChunkY: 0,
    }]);
    const room = services.instances.create(player, {
        definitionId: NEX_DEFINITION_ID,
        access,
        maxPlayers: access === "solo" ? 1 : 5,
        joinInProgress: access === "party",
        templateChunks,
        destination: BARRIER_INSIDE,
        exit: BARRIER_OUTSIDE,
        npcs: NEX_NPCS,
    });
    if (!room) {
        services.messaging.sendGameMessage(player, "The Ancient Prison is unavailable right now.");
        return;
    }
    installPhaseController(player, services);
    services.instances.markStarted(room.id);
}

function installPhaseController(player: PlayerState, services: ScriptServices): void {
    const nex = services.npc.findNearbyNpc(player, 11278, 50);
    if (!nex) return;
    const mages = new Map<number, NpcState>();
    for (const gate of PHASE_GATES) {
        const mage = services.npc.findNearbyNpc(player, gate.mageId, 50);
        if (mage) mages.set(gate.mageId, mage);
    }
    const controller: NexPhaseController = { nex, mages, gateIndex: 0, readyToAdvance: false };

    nex.onHealthChange((change) => {
        if (change.reason === "reset") {
            controller.gateIndex = 0;
            controller.waitingForMageId = undefined;
            controller.readyToAdvance = false;
            for (const mage of controller.mages.values()) mage.setUnattackable(true);
            return;
        }
        // Killing a mage only makes the transition available. The next
        // successful hit on Nex starts the following Ancient Magicks phase.
        if (controller.readyToAdvance) {
            controller.readyToAdvance = false;
            controller.gateIndex++;
            if (controller.gateIndex === PHASE_GATES.length) {
                services.npc.queueNpcForcedChat(nex, "NOW, THE POWER OF ZAROS!");
            }
        }

        const gate = PHASE_GATES[controller.gateIndex];
        if (!gate || change.current > gate.hitpoints) return;

        // The clamp is applied during the committed HP event, before death can
        // be queued. This also catches development commands that would
        // otherwise skip the entire fight in a single hit.
        nex.heal(gate.hitpoints - change.current);
        if (controller.waitingForMageId === gate.mageId) return;
        controller.waitingForMageId = gate.mageId;
        const mage = controller.mages.get(gate.mageId);
        mage?.setUnattackable(false);
        services.npc.queueNpcForcedChat(nex, gate.transition);
    });

    for (const [mageId, mage] of mages) {
        mage.onHealthChange((change) => {
            if (change.reason === "reset") {
                mage.setUnattackable(true);
                return;
            }
            if (change.current > 0 || controller.waitingForMageId !== mageId) return;
            controller.waitingForMageId = undefined;
            controller.readyToAdvance = true;
        });
    }
}

function showJoinOptions(player: PlayerState, services: ScriptServices): void {
    if (services.instances.get(player.id)) {
        services.messaging.sendGameMessage(player, "Leave your current instance before joining another party.");
        return;
    }
    const rooms = services.instances.listJoinable(NEX_DEFINITION_ID);
    if (rooms.length === 0) {
        services.messaging.sendGameMessage(player, "There are no joinable Nex parties.");
        return;
    }
    const visible = rooms.slice(0, 5);
    services.dialog.openDialogOptions(player, {
        id: "nex-instance-join",
        title: "Join a Nex party",
        options: visible.map((room) => `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`),
        modal: true,
        onSelect: (choice) => {
            const room = visible[choice];
            if (!room || !services.instances.join(player, room.id)) {
                services.messaging.sendGameMessage(player, "That party is no longer available.");
            }
        },
    });
}

function showEntryOptions(player: PlayerState, services: ScriptServices): void {
    if (isNexInstance(player, services)) {
        services.instances.leave(player, BARRIER_OUTSIDE);
        return;
    }
    services.dialog.openDialogOptions(player, {
        id: "nex-instance-entry",
        title: "Enter the Ancient Prison",
        options: ["Enter solo", "Create a party instance", "Join a party instance"],
        modal: true,
        onSelect: (choice) => {
            if (choice === 0) createRoom(player, services, "solo");
            else if (choice === 1) createRoom(player, services, "party");
            else if (choice === 2) showJoinOptions(player, services);
        },
    });
}

function peek({ player, services }: LocInteractionEvent): void {
    const ownRoom = services.instances.get(player.id);
    const adventurers = ownRoom?.definitionId === NEX_DEFINITION_ID
        ? ownRoom.memberPlayerIds.length
        : services.instances.listJoinable(NEX_DEFINITION_ID).reduce((count, room) => count + room.memberPlayerIds.length, 0);
    services.messaging.sendGameMessage(player, adventurers > 0
        ? `You can see ${adventurers} adventurer${adventurers === 1 ? "" : "s"} in this room.`
        : "You cannot see anyone waiting in a joinable Nex room.");
}

function installNexBank(services: ScriptServices): void {
    // The booth is part of the base map, not a temporary object created by
    // this module. Explicitly remove it so Ashuelot is the sole bank access.
    services.location.removeTemporaryLoc(
        { worldViewId: -1 },
        BANK_BOOTH_ID,
        { x: BANK_TILE.x, y: BANK_TILE.y },
        BANK_TILE.level,
        { oldShape: 10, newShape: 10 },
    );
    services.npc.spawnNpc({
        id: ASHUELOT_REIS_ID,
        x: BANK_TILE.x,
        y: BANK_TILE.y,
        level: BANK_TILE.level,
        worldViewId: -1,
        wanderRadius: 0,
        isAggressive: false,
        isUnattackable: true,
        direction: 0,
    });
}

function spawnAncientPrisonPopulation(services: ScriptServices): void {
    for (const npc of ANCIENT_PRISON_NPCS) {
        services.npc.spawnNpc({ ...npc, worldViewId: -1 });
    }
}

function prayAtNexAltar({ player, services, tick }: LocInteractionEvent): void {
    if (!isNexInstance(player, services)) return;
    const readyAt = (altarUses.get(player) ?? -Infinity) + ALTAR_COOLDOWN_TICKS;
    if (tick < readyAt) {
        services.messaging.sendGameMessage(player, "The gods have already blessed you recently.");
        return;
    }
    const prayer = player.skillSystem.getSkill(SkillId.Prayer);
    if (prayer.baseLevel + prayer.boost >= prayer.baseLevel) {
        services.messaging.sendGameMessage(player, "You already have full Prayer points.");
        return;
    }
    services.animation.playPlayerSeq(player, 645);
    player.skillSystem.setSkillBoost(SkillId.Prayer, prayer.baseLevel);
    player.prayer.resetDrainAccumulator();
    services.sound.sendSound(player, PRAYER_RECHARGE_SOUND_ID);
    altarUses.set(player, tick);
    services.messaging.sendGameMessage(player, "The gods bless you, restoring your Prayer points.");
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    registerNexEncounters();
    installNexBank(services);
    spawnAncientPrisonPopulation(services);
    registry.registerLocInteraction(NEX_ALTAR_ID, prayAtNexAltar, "pray");
    registry.registerLocInteraction(NEX_ALTAR_ID, prayAtNexAltar, "pray-at");
    registry.registerLocInteraction(KILLCOUNT_DOOR_ID, (event) => crossDoor(event, KILLCOUNT_OUTSIDE, KILLCOUNT_INSIDE), "open");
    registry.registerLocInteraction(KILLCOUNT_DOOR_ID, (event) => crossDoor(event, KILLCOUNT_OUTSIDE, KILLCOUNT_INSIDE));
    registry.registerLocInteraction(BANK_DOOR_ID, (event) => crossDoor(event, BANK_OUTSIDE, BANK_INSIDE), "open");
    registry.registerLocInteraction(BANK_DOOR_ID, (event) => crossDoor(event, BANK_OUTSIDE, BANK_INSIDE));
    for (const barrierId of ANCIENT_BARRIER_VARIANT_IDS) {
        // "Pass" is the live Ancient Barrier action.  The remaining aliases
        // cover the legacy/custom loc definition and expose the explicit
        // party controls requested for this instance.
        for (const action of ["pass", "open", "enter"]) {
            registry.registerLocInteraction(barrierId, ({ player, services: eventServices }) => showEntryOptions(player, eventServices), action);
        }
        registry.registerLocInteraction(barrierId, ({ player, services: eventServices }) => createRoom(player, eventServices, "solo"), "pass (normal)");
        registry.registerLocInteraction(barrierId, ({ player, services: eventServices }) => createRoom(player, eventServices, "party"), "pass (private)");
        registry.registerLocInteraction(barrierId, peek, "peek");
        registry.registerLocInteraction(barrierId, ({ player, services: eventServices }) => createRoom(player, eventServices, "solo"), "enter solo");
        registry.registerLocInteraction(barrierId, ({ player, services: eventServices }) => createRoom(player, eventServices, "party"), "enter party");
        registry.registerLocInteraction(barrierId, ({ player, services: eventServices }) => showJoinOptions(player, eventServices), "join party");
    }
}
