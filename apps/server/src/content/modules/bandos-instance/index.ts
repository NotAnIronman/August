import type { PlayerState } from "@server/game/player";
import type {
    IScriptRegistry,
    LocInteractionEvent,
    ScriptServices,
} from "@server/game/scripts/types";
import { AttackType } from "@server/game/combat/AttackType";
import {
    INSTANCE_GRAVE_RECLAIM_LOC_ID,
    INSTANCE_GRAVE_RECLAIM_TILE,
    isAuthorizedInstanceGraveInteraction,
    syncInstanceGravePresentation,
} from "@server/game/death/InstanceGravePresentation";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { PRAYER_RECHARGE_SOUND_ID } from "@august/osrs-engine/prayer/prayers";

const BANDOS_DOOR_LOC_ID = 26503;
const BANDOS_STRONGHOLD_DOOR_LOC_ID = 26461;
const BANDOS_ALTAR_LOC_ID = 26366;
const BANDOS_DEFINITION_ID = "graardor-room";
const BANDOS_BOSS_MAX_HEALTH = 255;
const BANDOS_ALTAR_COOLDOWN_TICKS = 500;
const lastBandosAltarUse = new WeakMap<PlayerState, number>();
const BANDOS_STRONGHOLD_OUTSIDE = Object.freeze({ x: 2851, y: 5333, level: 2 });
const BANDOS_STRONGHOLD_INSIDE = Object.freeze({ x: 2850, y: 5333, level: 2 });
const BANDOS_DOOR_HAMMERING_SEQ = 898;

function isBandosDoorHammer(itemId: number, services: ScriptServices): boolean {
    const item = services.data.getItemDefinition(itemId);
    if (!item || item.noted) return false;
    const name = item.name.trim().toLowerCase();
    return (
        name === "hammer" ||
        name === "imcando hammer" ||
        name === "torag's hammers" ||
        name === "elder maul" ||
        name.endsWith(" warhammer") ||
        item.weaponInterface === "WARHAMMER"
    );
}

function openBandosStrongholdDoor({ player, services }: LocInteractionEvent): void {
    const entering = player.tileX >= BANDOS_STRONGHOLD_OUTSIDE.x;
    if (!entering) {
        services.movement.teleportPlayer(
            player,
            BANDOS_STRONGHOLD_OUTSIDE.x,
            BANDOS_STRONGHOLD_OUTSIDE.y,
            BANDOS_STRONGHOLD_OUTSIDE.level,
        );
        return;
    }

    const hammer = services.inventory
        .getInventoryItems(player)
        .find((entry) => isBandosDoorHammer(entry.itemId, services));
    if (!hammer) {
        services.messaging.sendGameMessage(
            player,
            "You need a hammer to bang the gong and enter the Bandos Stronghold.",
        );
        return;
    }

    player.faceTile(BANDOS_STRONGHOLD_INSIDE.x, BANDOS_STRONGHOLD_INSIDE.y);
    services.animation.playPlayerSeq(player, BANDOS_DOOR_HAMMERING_SEQ);
    services.scheduler.after(
        2,
        () => {
            if (
                player.level !== BANDOS_STRONGHOLD_OUTSIDE.level ||
                Math.max(
                    Math.abs(player.tileX - BANDOS_STRONGHOLD_OUTSIDE.x),
                    Math.abs(player.tileY - BANDOS_STRONGHOLD_OUTSIDE.y),
                ) > 1
            ) {
                return;
            }
            services.movement.teleportPlayer(
                player,
                BANDOS_STRONGHOLD_INSIDE.x,
                BANDOS_STRONGHOLD_INSIDE.y,
                BANDOS_STRONGHOLD_INSIDE.level,
            );
        },
        { kind: "player", id: player.id },
    );
}

const INSTANCE_EXIT = Object.freeze({ x: 2862, y: 5354, level: 2 });
const INSTANCE_ENTRANCE = Object.freeze({ x: 2864, y: 5354, level: 2 });
const INSTANCE_GRAVE = Object.freeze({
    locId: INSTANCE_GRAVE_RECLAIM_LOC_ID,
    tile: { x: INSTANCE_GRAVE_RECLAIM_TILE.x, y: INSTANCE_GRAVE_RECLAIM_TILE.y },
    level: INSTANCE_GRAVE_RECLAIM_TILE.level,
});
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
            maxHealth: BANDOS_BOSS_MAX_HEALTH,
            bossHealthBar: {
                name: "General Graardor",
                npcTypeId: 2215,
            },
            movement: {
                wanderRadius: 10,
                aggressionRadius: 15,
                aggressionToleranceTicks: 2_147_483_647,
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
                aggressionToleranceTicks: 2_147_483_647,
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

function formatCooldown(ticks: number): string {
    const seconds = Math.max(1, Math.ceil((ticks * 600) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes <= 0) return `${seconds} second${seconds === 1 ? "" : "s"}`;
    if (remainder === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function prayAtBandosAltar({ player, services, tick }: LocInteractionEvent): void {
    if (!isBandosInstance(player, services)) return;
    const readyTick = (lastBandosAltarUse.get(player) ?? -Infinity) + BANDOS_ALTAR_COOLDOWN_TICKS;
    if (tick < readyTick) {
        services.messaging.sendGameMessage(
            player,
            `The gods have already blessed you recently. Wait ${formatCooldown(readyTick - tick)} and try again.`,
        );
        return;
    }

    const prayer = player.skillSystem.getSkill(SkillId.Prayer);
    const current = Math.max(0, prayer.baseLevel + prayer.boost);
    if (current >= prayer.baseLevel) {
        services.messaging.sendGameMessage(player, "You already have full Prayer points.");
        return;
    }
    services.animation.playPlayerSeq(player, 645);
    player.skillSystem.setSkillBoost(SkillId.Prayer, prayer.baseLevel);
    player.prayer.resetDrainAccumulator();
    services.sound.sendSound(player, PRAYER_RECHARGE_SOUND_ID);
    services.messaging.sendGameMessage(player, "The gods bless you, restoring your Prayer points.");
    lastBandosAltarUse.set(player, tick);
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
        grave: INSTANCE_GRAVE,
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

export function reclaimInstanceGrave({
    player,
    services,
    locId,
    tile,
    level,
}: LocInteractionEvent): void {
    if (!player.instanceGrave.hasItems()) {
        services.messaging.sendGameMessage(player, "Your instanced-death grave is empty.");
        return;
    }
    if (
        !isAuthorizedInstanceGraveInteraction(services.location, player, {
            locId,
            tile,
            level,
        })
    ) {
        services.messaging.sendGameMessage(
            player,
            "You need to return to your gravestone to reclaim those items.",
        );
        return;
    }
    const inventoryBeforeReclaim = player.items
        .getInventoryEntries()
        .map((entry) => ({ itemId: entry.itemId, quantity: entry.quantity }));
    const graveBeforeReclaim = player.instanceGrave.serialize();
    const rollbackReclaim = (): void => {
        for (let slot = 0; slot < inventoryBeforeReclaim.length; slot++) {
            const entry = inventoryBeforeReclaim[slot];
            player.items.setInventorySlot(slot, entry.itemId, entry.quantity);
        }
        player.instanceGrave.deserialize(graveBeforeReclaim);
    };
    const reclaimCost = player.instanceGrave.getReclaimCost();
    try {
        if (reclaimCost > 0) {
            if (!player.items.hasItem(995, reclaimCost)) {
                services.messaging.sendGameMessage(
                    player,
                    `You need ${reclaimCost.toLocaleString()} coins to reclaim these items.`,
                );
                return;
            }
            const payment = player.items.removeItem(995, reclaimCost, {
                assureFullRemoval: true,
            });
            if (payment.completed !== reclaimCost) {
                rollbackReclaim();
                services.inventory.snapshotInventoryImmediate(player);
                services.messaging.sendGameMessage(
                    player,
                    "Your reclaim payment could not be processed.",
                );
                return;
            }
            player.instanceGrave.markReclaimCostPaid();
        }
        const result = player.instanceGrave.reclaim((itemId, quantity) =>
            player.items.addItem(itemId, quantity, { assureFullInsertion: false }).completed,
        );
        services.inventory.snapshotInventoryImmediate(player);
        syncInstanceGravePresentation(services.location, player);
        if (result.remaining > 0) {
            services.messaging.sendGameMessage(
                player,
                `You reclaim ${result.reclaimed} item${result.reclaimed === 1 ? "" : "s"}. Make more inventory space for the remaining ${result.remaining} stack${result.remaining === 1 ? "" : "s"}.`,
            );
            return;
        }
        services.messaging.sendGameMessage(
            player,
            `You reclaim ${result.reclaimed} item${result.reclaimed === 1 ? "" : "s"} from your grave.${reclaimCost > 0 ? ` You paid ${reclaimCost.toLocaleString()} coins.` : " Reclaiming is currently free."}`,
        );
    } catch {
        rollbackReclaim();
        services.inventory.snapshotInventoryImmediate(player);
        syncInstanceGravePresentation(services.location, player);
        services.messaging.sendGameMessage(
            player,
            "Your grave could not be reclaimed. No items or coins were lost; please try again.",
        );
    }
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerBandosEncounters();
    // Remove the legacy shared reclaim loc during hot reloads. Owner-scoped
    // graves are created from persistent storage by the death/login flow.
    _services.location.clearTemporaryLoc(
        { worldViewId: -1 },
        0,
        INSTANCE_GRAVE_RECLAIM_TILE,
        INSTANCE_GRAVE_RECLAIM_TILE.level,
        10,
    );
    registry.registerLocInteraction(
        BANDOS_STRONGHOLD_DOOR_LOC_ID,
        openBandosStrongholdDoor,
        "open",
    );
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
    registry.registerLocInteraction(BANDOS_ALTAR_LOC_ID, prayAtBandosAltar, "pray");
    registry.registerLocInteraction(BANDOS_ALTAR_LOC_ID, prayAtBandosAltar, "pray-at");
    registry.registerLocInteraction(INSTANCE_GRAVE_RECLAIM_LOC_ID, reclaimInstanceGrave, "read");
}
