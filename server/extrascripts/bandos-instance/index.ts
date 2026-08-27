import type { PlayerState } from "../../src/game/player";
import type {
    IScriptRegistry,
    LocInteractionEvent,
    ScriptServices,
} from "../../src/game/scripts/types";
import { AttackType } from "../../src/game/combat/AttackType";
import { EncounterRegistry, registerEncounter } from "../../src/game/encounters/EncounterRegistry";

const BANDOS_DOOR_LOC_ID = 26503;
const BANDOS_DEFINITION_ID = "graardor-room";

const INSTANCE_EXIT = Object.freeze({ x: 2862, y: 5354, level: 2 });
const INSTANCE_ENTRANCE = Object.freeze({ x: 2864, y: 5354, level: 2 });
// InstancedAreaManager centers its 13x13-chunk view six chunks behind the
// destination chunk. These values keep the copied room at its native world
// coordinates while still assigning it a private world view.
const INSTANCE_BASE = Object.freeze({ x: 2816, y: 5304 });

const BANDOS_NPCS = Object.freeze([
    Object.freeze({ id: 2215, offsetX: 2872 - INSTANCE_BASE.x, offsetY: 5358 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 2216, offsetX: 2866 - INSTANCE_BASE.x, offsetY: 5358 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 2217, offsetX: 2872 - INSTANCE_BASE.x, offsetY: 5352 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 2218, offsetX: 2868 - INSTANCE_BASE.x, offsetY: 5362 - INSTANCE_BASE.y, level: 2 }),
]);

function registerBandosEncounters(): void {
    if (!EncounterRegistry.shared.get("general-graardor")) {
        registerEncounter({
            id: "general-graardor",
            npcTypeIds: [2215],
            movement: {
                wanderRadius: 10,
                aggressionRadius: 15,
                combatLeashRadius: 30,
                retreatInteractionRange: 40,
            },
            immunities: { poison: true, venom: true },
            attacks: [
                {
                    id: "melee",
                    type: AttackType.Melee,
                    rangeTiles: 1,
                    maxDistance: 1,
                    preferredDistance: 1,
                    speedTicks: 6,
                    maxHit: 60,
                    weight: 2,
                    animation: "attack",
                },
                {
                    id: "ranged",
                    type: AttackType.Ranged,
                    rangeTiles: 15,
                    preferredDistance: 1,
                    speedTicks: 6,
                    maxHit: 35,
                    weight: 1,
                    animationId: 7021,
                },
            ],
        });
    }
    const minions = [
        { id: "strongstack", npcTypeId: 2216, type: AttackType.Melee, range: 1, maxHit: 15 },
        { id: "steelwill", npcTypeId: 2217, type: AttackType.Magic, range: 10, maxHit: 15 },
        { id: "grimspike", npcTypeId: 2218, type: AttackType.Ranged, range: 10, maxHit: 21 },
    ] as const;
    for (const minion of minions) {
        const encounterId = `bandos-${minion.id}`;
        if (EncounterRegistry.shared.get(encounterId)) continue;
        registerEncounter({
            id: encounterId,
            npcTypeIds: [minion.npcTypeId],
            movement: {
                wanderRadius: 8,
                aggressionRadius: 15,
                combatLeashRadius: 30,
                retreatInteractionRange: 40,
            },
            attacks: [
                {
                    id: minion.id,
                    type: minion.type,
                    rangeTiles: minion.range,
                    preferredDistance: minion.type === AttackType.Melee ? 1 : minion.range,
                    speedTicks: 5,
                    maxHit: minion.maxHit,
                    animation: "attack",
                },
            ],
        });
    }
}

function isBandosInstance(player: PlayerState, services: ScriptServices): boolean {
    return services.instances.get(player.id)?.definitionId === BANDOS_DEFINITION_ID;
}

function createBandosInstance(
    player: PlayerState,
    services: ScriptServices,
    access: "solo" | "party",
): void {
    if (services.instances.get(player.id)) {
        services.messaging.sendGameMessage(player, "You are already inside an instance.");
        return;
    }

    const templateChunks = services.instances.buildTemplate([
        {
            sourceBaseX: 2848,
            sourceBaseY: 5328,
            widthChunks: 5,
            // Include the northern altar and complete back wall. Five chunks
            // ended at Y=5367 and clipped the top of the native room.
            heightChunks: 7,
            sourcePlanes: [2],
            destinationChunkX: 4,
            destinationChunkY: 3,
        },
    ]);
    const room = services.instances.create(player, {
        definitionId: BANDOS_DEFINITION_ID,
        access,
        maxPlayers: access === "solo" ? 1 : 5,
        joinInProgress: access === "party",
        templateChunks,
        destination: INSTANCE_ENTRANCE,
        exit: INSTANCE_EXIT,
        npcs: BANDOS_NPCS,
    });
    if (!room) {
        services.messaging.sendGameMessage(player, "The Bandos room is unavailable right now.");
        return;
    }
    services.instances.markStarted(room.id);
}

function showEntryOptions(player: PlayerState, services: ScriptServices): void {
    if (isBandosInstance(player, services)) {
        services.instances.leave(player, INSTANCE_EXIT);
        return;
    }
    services.dialog.openDialogOptions(player, {
        id: "bandos-instance-entry",
        title: "Enter the Bandos chamber",
        options: ["Enter solo", "Create a party instance", "Join a party instance"],
        modal: true,
        onSelect: (choice) => {
            if (choice === 0) createBandosInstance(player, services, "solo");
            else if (choice === 1) createBandosInstance(player, services, "party");
            else if (choice === 2) showJoinOptions(player, services);
        },
    });
}

function showJoinOptions(player: PlayerState, services: ScriptServices): void {
    if (services.instances.get(player.id)) {
        services.messaging.sendGameMessage(
            player,
            "Leave your current instance before joining another party.",
        );
        return;
    }
    const rooms = services.instances.listJoinable(BANDOS_DEFINITION_ID);
    if (rooms.length === 0) {
        services.messaging.sendGameMessage(player, "There are no joinable Bandos parties.");
        return;
    }
    const visibleRooms = rooms.slice(0, 5);
    services.dialog.openDialogOptions(player, {
        id: "bandos-instance-join",
        title: "Join a Bandos party",
        options: visibleRooms.map(
            (room) => `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`,
        ),
        modal: true,
        onSelect: (choice) => {
            const room = visibleRooms[choice];
            if (!room || !services.instances.join(player, room.id)) {
                services.messaging.sendGameMessage(player, "That party is no longer available.");
            }
        },
    });
}

function handlePeek({ player, services }: LocInteractionEvent): void {
    const ownRoom = services.instances.get(player.id);
    if (ownRoom?.definitionId === BANDOS_DEFINITION_ID) {
        services.messaging.sendGameMessage(
            player,
            `There ${ownRoom.memberPlayerIds.length === 1 ? "is" : "are"} ${ownRoom.memberPlayerIds.length} adventurer${ownRoom.memberPlayerIds.length === 1 ? "" : "s"} in this room.`,
        );
        return;
    }
    const rooms = services.instances.listJoinable(BANDOS_DEFINITION_ID);
    const adventurers = rooms.reduce((total, room) => total + room.memberPlayerIds.length, 0);
    services.messaging.sendGameMessage(
        player,
        adventurers > 0
            ? `You can see ${adventurers} adventurer${adventurers === 1 ? "" : "s"} in joinable party rooms.`
            : "You cannot see anyone waiting in a joinable Bandos room.",
    );
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerBandosEncounters();
    registry.registerLocInteraction(BANDOS_DOOR_LOC_ID, ({ player, services }) => {
        showEntryOptions(player, services);
    }, "open");
    registry.registerLocInteraction(BANDOS_DOOR_LOC_ID, handlePeek, "peek");
    registry.registerLocInteraction(BANDOS_DOOR_LOC_ID, ({ player, services }) => {
        createBandosInstance(player, services, "solo");
    }, "enter solo");
    registry.registerLocInteraction(BANDOS_DOOR_LOC_ID, ({ player, services }) => {
        createBandosInstance(player, services, "party");
    }, "enter party");
    registry.registerLocInteraction(BANDOS_DOOR_LOC_ID, ({ player, services }) => {
        showJoinOptions(player, services);
    }, "join party");
}
