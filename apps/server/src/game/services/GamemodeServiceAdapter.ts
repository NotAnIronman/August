import type { WebSocket } from "ws";

import { logger } from "@server/observability/logger";
import type { InterfaceService } from "@server/widgets/InterfaceService";
import type { PathService } from "@server/pathfinding/PathService";
import type { GameEventBus } from "@server/game/events/GameEventBus";
import type { GamemodeServerServices } from "@server/game/gamemodes/GamemodeDefinition";
import type { GroundItemManager } from "@server/game/items/GroundItemManager";
import type { PlayerState } from "@server/game/player";
import type { NpcManager } from "@server/game/npcManager";
import type { AppearanceService } from "@server/game/services/AppearanceService";
import type { DataLoaderService } from "@server/game/services/DataLoaderService";
import type { EquipmentService } from "@server/game/services/EquipmentService";
import type { InventoryService } from "@server/game/services/InventoryService";
import type { LocationService } from "@server/game/services/LocationService";
import type { MessagingService } from "@server/game/services/MessagingService";
import type { PlayerCombatService } from "@server/game/services/PlayerCombatService";
import type { VariableService } from "@server/game/services/VariableService";

export interface GamemodeServiceAdapterDeps {
    dataLoaders: DataLoaderService;
    variableService: VariableService;
    messagingService: MessagingService;
    inventoryService: InventoryService;
    equipmentService: EquipmentService;
    playerCombatService?: PlayerCombatService;
    appearanceService: AppearanceService;
    getCurrentTick: () => number;
    getPlayerById: (id: number) => PlayerState | undefined;
    getSocketByPlayerId: (id: number) => WebSocket | undefined;
    refreshCombatWeaponCategory: (player: PlayerState) => {
        categoryChanged: boolean;
        weaponItemChanged: boolean;
    };
    queueCombatSnapshot: (
        playerId: number,
        category: number,
        weaponItemId: number,
        autoRetaliate: boolean,
        styleSlot: number,
        activePrayers: string[],
        combatSpellId?: number,
    ) => void;
    queueWidgetEvent: (playerId: number, event: unknown) => void;
    queueGamemodeSnapshot: (key: string, playerId: number, payload: unknown) => void;
    registerSnapshotEncoder: (
        key: string,
        encoder: (
            playerId: number,
            payload: unknown,
        ) => { message: string | Uint8Array; context: string } | undefined,
        onSent?: (playerId: number, payload: unknown) => void,
    ) => void;
    gamemodeTickCallbacks: Array<(tick: number) => void>;
    interfaceService: InterfaceService | undefined;
    eventBus: GameEventBus;
    npcManager?: NpcManager;
    groundItems?: Pick<GroundItemManager, "registerStaticSpawn">;
    locationService?: LocationService;
    pathService?: PathService;
}

/**
 * Builds the GamemodeServerServices bag from extracted services.
 * Replaces the buildGamemodeServerServices anonymous object from WSServer.
 */
export function buildGamemodeServices(deps: GamemodeServiceAdapterDeps): GamemodeServerServices {
    return {
        getPlayer: (playerId) => deps.getPlayerById(playerId),
        getInventory: (player) => deps.inventoryService.getInventory(player),
        getEquipArray: (player) => deps.equipmentService.ensureEquipArray(player),
        getEquipQtyArray: (player) => deps.equipmentService.ensureEquipQtyArray(player),
        computeEquipmentStatBonuses: (player) =>
            deps.equipmentService.computeEquipmentStatBonuses(player),
        resolveBaseAttackSpeed: (player) =>
            deps.playerCombatService?.resolveBaseAttackSpeed(player) ?? 4,
        pickAttackSpeed: (player) => deps.playerCombatService?.pickAttackSpeed(player) ?? 4,
        addItemToInventory: (player, itemId, qty) =>
            deps.inventoryService.addItemToInventory(player, itemId, qty),
        sendInventorySnapshot: (playerId) => {
            const player = deps.getPlayerById(playerId);
            if (player) deps.inventoryService.snapshotInventory(player);
        },
        refreshAppearance: (player) => deps.appearanceService.refreshAppearanceKits(player),
        refreshCombatWeapon: (player) => deps.refreshCombatWeaponCategory(player),
        sendAppearanceUpdate: (playerId) => {
            const player = deps.getPlayerById(playerId);
            if (player) deps.appearanceService.sendAppearanceUpdate(player);
        },
        queueCombatSnapshot: (
            playerId,
            category,
            weaponItemId,
            autoRetaliate,
            styleSlot,
            activePrayers,
            combatSpellId,
        ) => {
            deps.queueCombatSnapshot(
                playerId,
                category,
                weaponItemId,
                autoRetaliate,
                styleSlot,
                activePrayers,
                combatSpellId,
            );
        },
        queueChatMessage: (opts) => deps.messagingService.queueChatMessage(opts),
        queueVarbit: (playerId, varbitId, value) =>
            deps.variableService.queueVarbit(playerId, varbitId, value),
        queueWidgetEvent: (playerId, event) => deps.queueWidgetEvent(playerId, event),
        queueGamemodeSnapshot: (key, playerId, payload) =>
            deps.queueGamemodeSnapshot(key, playerId, payload),
        registerSnapshotEncoder: (key, encoder, onSent) =>
            deps.registerSnapshotEncoder(key, encoder, onSent),
        getObjType: (itemId) => deps.dataLoaders.getObjType(itemId),
        spawnNpc: (config) => deps.npcManager?.spawnTransientNpc(config),
        removeNpc: (npcId) => deps.npcManager?.removeNpc(npcId) ?? false,
        emitLocChange: (oldId, newId, tile, level, opts) =>
            deps.locationService?.emitLocChange(oldId, newId, tile, level, opts),
        addCollisionFlags: (x, y, level, flags) =>
            deps.pathService?.getCollisionOverlays()?.addFlags(x, y, level, flags),
        removeCollisionFlags: (x, y, level, flags) =>
            deps.pathService?.getCollisionOverlays()?.removeFlags(x, y, level, flags),
        registerStaticGroundItem: (spawn) => {
            deps.groundItems?.registerStaticSpawn(spawn, deps.getCurrentTick());
        },
        getInterfaceService: () => deps.interfaceService,
        getCurrentTick: () => deps.getCurrentTick(),
        registerTickCallback: (callback) => deps.gamemodeTickCallbacks.push(callback),
        eventBus: deps.eventBus,
        logger,
    };
}
