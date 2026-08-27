import type { PlayerState } from "../../src/game/player";
import type {
    IScriptRegistry,
    LocInteractionEvent,
    ScriptServices,
} from "../../src/game/scripts/types";

const BANDOS_DOOR_LOC_ID = 26503;
const BANDOS_DEFINITION_ID = "graardor-room";

const INSTANCE_EXIT = Object.freeze({ x: 2851, y: 5333, level: 2 });
const INSTANCE_ENTRANCE = Object.freeze({ x: 2851, y: 5335, level: 2 });
const INSTANCE_BASE = Object.freeze({ x: 2800, y: 5280 });

const BANDOS_NPCS = Object.freeze([
    Object.freeze({ id: 2215, offsetX: 2872 - INSTANCE_BASE.x, offsetY: 5358 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 2216, offsetX: 2866 - INSTANCE_BASE.x, offsetY: 5358 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 2217, offsetX: 2872 - INSTANCE_BASE.x, offsetY: 5352 - INSTANCE_BASE.y, level: 2 }),
    Object.freeze({ id: 2218, offsetX: 2868 - INSTANCE_BASE.x, offsetY: 5362 - INSTANCE_BASE.y, level: 2 }),
]);

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
            heightChunks: 5,
            sourcePlanes: [2],
            destinationChunkX: 6,
            destinationChunkY: 6,
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
