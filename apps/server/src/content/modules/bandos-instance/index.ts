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
import { attack, defineBoss } from "@server/game/encounters/BossDefinition";
import { defineBossRoom } from "@server/game/encounters/BossRoom";
import { registerOwnedEncounter } from "@server/game/encounters/EncounterRegistry";
import { defineGwdAltar, formatGwdAltarCooldown } from "@server/game/encounters/GwdAltar";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { LockState } from "@server/game/model/LockState";
import { payGraveFee } from "@server/game/death/payGraveFee";

const BANDOS_DOOR_LOC_ID = 26503;
const BANDOS_STRONGHOLD_DOOR_LOC_ID = 26461;
const BANDOS_ALTAR_LOC_ID = 26366;
const BANDOS_DEFINITION_ID = "graardor-room";
const BANDOS_BOSS_MAX_HEALTH = 255;
const BANDOS_ALTAR_COOLDOWN_TICKS = 500;
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

    const strength = player.skillSystem.getSkill(SkillId.Strength);
    if (strength.baseLevel + strength.boost < 70) {
        services.messaging.sendGameMessage(
            player,
            "You need a Strength level of 70 to bang the gong and enter the Bandos Stronghold.",
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
    const previousLock = player.lock;
    player.lock = LockState.FULL;
    services.scheduler.after(3, () => { if (player.lock === LockState.FULL) player.lock = previousLock; }, { kind: "player", id: player.id });
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

function registerBandosEncounters(registry: IScriptRegistry): void {
    registerOwnedEncounter(registry, defineBoss({
            id: "general-graardor",
            npcTypeIds: [2215],
            maxHealth: BANDOS_BOSS_MAX_HEALTH,
            bossHealthBar: {
                name: "General Graardor",
                npcTypeId: 2215,
            },
            killcount: { name: "General Graardor", collectionLogStructId: 487 },
            movement: {
                wanderRadius: 10,
                aggressionRadius: 15,
                aggressionToleranceTicks: 2_147_483_647,
                combatLeashRadius: 30,
                retreatInteractionRange: 40,
            },
            immunities: { poison: true, venom: true },
            attacks: [
                attack.melee({
                    id: "melee",
                    speedTicks: 6,
                    maxHit: 60,
                    weight: 2,
                    animation: "attack",
                }),
                attack.ranged({
                    id: "ranged",
                    rangeTiles: 15,
                    preferredDistance: 1,
                    speedTicks: 6,
                    maxHit: 35,
                    weight: 1,
                    animationId: 7021,
                }),
            ],
        }));
    const minions = [
        { id: "strongstack", npcTypeId: 2216, type: AttackType.Melee, range: 1, maxHit: 15 },
        { id: "steelwill", npcTypeId: 2217, type: AttackType.Magic, range: 10, maxHit: 15 },
        { id: "grimspike", npcTypeId: 2218, type: AttackType.Ranged, range: 10, maxHit: 21 },
    ] as const;
    for (const minion of minions) {
        const encounterId = `bandos-${minion.id}`;
        registerOwnedEncounter(registry, defineBoss({
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
        }));
    }
}

const bandosRoom = defineBossRoom({
    id: BANDOS_DEFINITION_ID,
    doorLocId: BANDOS_DOOR_LOC_ID,
    templateCopies: [
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
    ],
    destination: INSTANCE_ENTRANCE,
    exit: INSTANCE_EXIT,
    grave: INSTANCE_GRAVE,
    npcs: BANDOS_NPCS,
    dialogs: {
        entry: { id: "bandos-instance-entry", title: "Enter the Bandos chamber" },
        join: { id: "bandos-instance-join", title: "Join a Bandos party" },
    },
    messages: {
        alreadyInside: "You are already inside an instance.",
        unavailable: "The Bandos room is unavailable right now.",
        leaveBeforeJoining: "Leave your current instance before joining another party.",
        noJoinableParties: "There are no joinable Bandos parties.",
        partyUnavailable: "That party is no longer available.",
        peek: (count, scope) => {
            if (scope === "current") {
                return `There ${count === 1 ? "is" : "are"} ${count} adventurer${count === 1 ? "" : "s"} in this room.`;
            }
            return count > 0
                ? `You can see ${count} adventurer${count === 1 ? "" : "s"} in joinable party rooms.`
                : "You cannot see anyone waiting in a joinable Bandos room.";
        },
    },
});

const bandosAltar = defineGwdAltar({
    locId: BANDOS_ALTAR_LOC_ID,
    roomDefinitionId: BANDOS_DEFINITION_ID,
    cooldownTicks: BANDOS_ALTAR_COOLDOWN_TICKS,
    messages: {
        cooldown: (remainingTicks) =>
            `The gods have already blessed you recently. Wait ${formatGwdAltarCooldown(remainingTicks)} and try again.`,
        alreadyFull: "You already have full Prayer points.",
        restored: "The gods bless you, restoring your Prayer points.",
    },
});

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
    const bankBeforeReclaim=(player.items.bank??[]).map(i=>({...i}));
    const rollbackReclaim = (): void => {
        for (let slot = 0; slot < inventoryBeforeReclaim.length; slot++) {
            const entry = inventoryBeforeReclaim[slot];
            player.items.setInventorySlot(slot, entry.itemId, entry.quantity);
        }
        player.instanceGrave.deserialize(graveBeforeReclaim);
        player.items.bank=bankBeforeReclaim;player.items.bankDirty=true;
    };
    const reclaimCost = player.instanceGrave.getReclaimCost();
    try {
        if (reclaimCost > 0) {
            if (!payGraveFee(player,reclaimCost,locId===32656)) {
                services.messaging.sendGameMessage(
                    player,
                    `You need ${reclaimCost.toLocaleString()} coins to reclaim these items.`,
                );
                return;
            }
        }
        const result = player.instanceGrave.reclaim((itemId, quantity) =>
            player.items.addItem(itemId, quantity, { assureFullInsertion: false }).completed,
        );
        if(locId===32656)services.appearance.savePlayerSnapshotChecked(player);
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
    registerBandosEncounters(registry);
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
    bandosRoom.register(registry);
    bandosAltar.register(registry);
    registry.registerLocInteraction(INSTANCE_GRAVE_RECLAIM_LOC_ID, reclaimInstanceGrave, "read");
}
