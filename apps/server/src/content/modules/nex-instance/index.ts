import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";

const KILLCOUNT_DOOR_ID = 42933;
const BANK_DOOR_ID = 42934;
const ANCIENT_BARRIER_ID = 42967;
const BANK_BOOTH_ID = 6084;
const ASHUELOT_REIS_ID = 11289;
const NEX_DEFINITION_ID = "nex-room";

const KILLCOUNT_OUTSIDE = Object.freeze({ x: 2861, y: 5219, level: 0 });
const KILLCOUNT_INSIDE = Object.freeze({ x: 2863, y: 5219, level: 0 });
const BANK_OUTSIDE = Object.freeze({ x: 2898, y: 5203, level: 0 });
const BANK_INSIDE = Object.freeze({ x: 2900, y: 5203, level: 0 });
const BARRIER_OUTSIDE = Object.freeze({ x: 2908, y: 5204, level: 0 });
const BARRIER_INSIDE = Object.freeze({ x: 2910, y: 5203, level: 0 });
const BANK_TILE = Object.freeze({ x: 2904, y: 5205, level: 0 });
const BANKER_TILE = Object.freeze({ x: 2904, y: 5206, level: 0 });

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
    // The ancient prison occupies the eight-by-eight chunk area beginning at
    // 2880,5152. The barrier's instance view begins at 2856,5152, so the
    // source lands at chunks 3..10 / 0..7 without an offset.
    const templateChunks = services.instances.buildTemplate([{
        sourceBaseX: 2880,
        sourceBaseY: 5152,
        widthChunks: 8,
        heightChunks: 8,
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
    });
    if (!room) {
        services.messaging.sendGameMessage(player, "The Ancient Prison is unavailable right now.");
        return;
    }
    services.instances.markStarted(room.id);
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
    services.location.replaceTemporaryLoc(
        { worldViewId: -1 },
        0,
        BANK_BOOTH_ID,
        { x: BANK_TILE.x, y: BANK_TILE.y },
        BANK_TILE.level,
        { newShape: 10, newRotation: 0 },
    );
    services.npc.spawnNpc({
        id: ASHUELOT_REIS_ID,
        x: BANKER_TILE.x,
        y: BANKER_TILE.y,
        level: BANKER_TILE.level,
        worldViewId: -1,
        wanderRadius: 0,
        isAggressive: false,
        isUnattackable: true,
        direction: 0,
    });
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    installNexBank(services);
    registry.registerLocInteraction(KILLCOUNT_DOOR_ID, (event) => crossDoor(event, KILLCOUNT_OUTSIDE, KILLCOUNT_INSIDE), "open");
    registry.registerLocInteraction(KILLCOUNT_DOOR_ID, (event) => crossDoor(event, KILLCOUNT_OUTSIDE, KILLCOUNT_INSIDE));
    registry.registerLocInteraction(BANK_DOOR_ID, (event) => crossDoor(event, BANK_OUTSIDE, BANK_INSIDE), "open");
    registry.registerLocInteraction(BANK_DOOR_ID, (event) => crossDoor(event, BANK_OUTSIDE, BANK_INSIDE));
    registry.registerLocInteraction(ANCIENT_BARRIER_ID, ({ player, services: eventServices }) => showEntryOptions(player, eventServices), "open");
    registry.registerLocInteraction(ANCIENT_BARRIER_ID, peek, "peek");
    registry.registerLocInteraction(ANCIENT_BARRIER_ID, ({ player, services: eventServices }) => createRoom(player, eventServices, "solo"), "enter solo");
    registry.registerLocInteraction(ANCIENT_BARRIER_ID, ({ player, services: eventServices }) => createRoom(player, eventServices, "party"), "enter party");
    registry.registerLocInteraction(ANCIENT_BARRIER_ID, ({ player, services: eventServices }) => showJoinOptions(player, eventServices), "join party");
}
