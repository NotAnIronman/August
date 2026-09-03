import type { WebSocket } from "ws";
import type { ProjectileLaunch } from "@august/protocol/projectiles/ProjectileLaunch";

import {
    PRAYER_DEACTIVATE_SOUND_ID,
    type PrayerName,
    getPrayerDefinition,
} from "@august/osrs-engine/prayer/prayers";
import type { SkillId } from "@august/osrs-engine/skill/skills";
import { faceAngleRs } from "@august/osrs-engine/geometry";
import { SIDE_JOURNAL_GROUP_ID } from "@august/protocol/ui/sideJournal";
import { VARBIT_XPDROPS_ENABLED } from "@august/game-model/state/vars";
import type { MusicCatalogService } from "@server/audio/MusicCatalogService";
import { getItemDefinition, loadItemDefinitions } from "@server/data/items";
import type { WorldEntityInfoEncoder } from "@server/network/encoding/WorldEntityInfoEncoder";
import type { Cs2ModalManager } from "@server/network/managers/Cs2ModalManager";
import type { CombatActionHandler } from "@server/game/actions/handlers/CombatActionHandler";
import type { PathService } from "@server/pathfinding/PathService";
import { logger } from "@server/observability/logger";
import type { InterfaceService } from "@server/widgets/InterfaceService";
import { type WidgetAction, getDefaultInterfaces } from "@server/widgets/WidgetManager";
import {
    MINIMAP_WIDGET_GROUP_ID,
    VARBIT_MINIMAP_TOGGLE,
    createOrbsBootstrapActions,
    getMapClockValue,
    getMinimapToggleVarbits,
    rewriteMinimapOrbsMount,
} from "@server/widgets/minimapOrbs";
import {
    getEnhancedClientLoginScripts,
    getMainmodalUid,
    getPrayerTabUid,
    getSidemodalUid,
    getViewportTrackerFrontUid,
} from "@server/widgets/viewport";
import type { DoorStateManager } from "@server/world/DoorStateManager";
import { resolveLocTransformId } from "@server/world/LocTransforms";
import type { PlayerManager } from "@server/game/PlayerManager";
import type { ActionScheduler } from "@server/game/actions";
import type { EffectDispatcher } from "@server/game/actions/handlers/EffectDispatcher";
import type { InventoryActionHandler } from "@server/game/actions/handlers/InventoryActionHandler";
import type { WidgetDialogHandler } from "@server/game/actions/handlers/WidgetDialogHandler";
import { applyAutocastState, clearAutocastState } from "@server/game/combat/AutocastState";
import { hasNpcLineOfSightToPlayer } from "@server/game/combat/CombatAction";
import { AttackType } from "@server/game/combat/AttackType";
import type { CombatEffectApplicator } from "@server/game/combat/CombatEffectApplicator";
import type { CombatEffectService } from "@server/game/services/CombatEffectService";
import type { DamageTracker } from "@server/game/combat/DamageTracker";
import type { MultiCombatSystem } from "@server/game/combat/MultiCombatZones";
import { getEmoteSeq } from "@server/game/emotes";
import { getSkillcapeSeqId, getSkillcapeSpotId } from "@server/game/equipment";
import type { GameEventBus } from "@server/game/events/GameEventBus";
import type { FollowerCombatManager } from "@server/game/followers/FollowerCombatManager";
import type { FollowerManager } from "@server/game/followers/FollowerManager";
import type { EncounterManager } from "@server/game/encounters/EncounterManager";
import {
    FOLLOWER_ITEM_DEFINITIONS,
    getFollowerDefinitionByItemId,
    getFollowerDefinitionByNpcTypeId,
} from "@server/game/followers/followerDefinitions";
import { STUN_TIMER } from "@server/game/model/timer/Timers";
import { isNpcVisibleToPlayer, type NpcState } from "@server/game/npc";
import type { NpcManager } from "@server/game/npcManager";
import type { PlayerState } from "@server/game/player";
import type { GroundItemManager, GroundItemStack } from "@server/game/items/GroundItemManager";
import type { PrayerSystem } from "@server/game/prayer/PrayerSystem";
import { getProviderRegistry } from "@server/game/providers/ProviderRegistry";
import type { SailingInstanceManager } from "@server/game/sailing/SailingInstanceManager";
import type {
    ProviderRegistrationFacade,
    ScriptDialogOptionRequest,
    ScriptDialogRequest,
    ScriptGroundItem,
    ScriptServices,
} from "@server/game/scripts/types";
import type { FollowerServiceFacade } from "@server/game/scripts/serviceInterfaces";
import { triggerLocEffect } from "@server/game/scripts/effects/locEffects";
import { RuneValidator } from "@server/game/spells/RuneValidator";
import type { PersistenceProvider } from "@server/game/state/PersistenceProvider";
import type { ForcedMovementBroadcast, PendingSpotAnimation } from "@server/game/systems/BroadcastScheduler";
import type { GatheringSystemManager } from "@server/game/systems/GatheringSystemManager";
import type { TickFrame } from "@server/game/tick/TickPhaseOrchestrator";
import type { AppearanceService } from "@server/game/services/AppearanceService";
import type { CollectionLogService } from "@server/game/services/CollectionLogService";
import type { DataLoaderService } from "@server/game/services/DataLoaderService";
import type { EquipmentService } from "@server/game/services/EquipmentService";
import type { InventoryService } from "@server/game/services/InventoryService";
import type { LocationService } from "@server/game/services/LocationService";
import type { MessagingService } from "@server/game/services/MessagingService";
import type { MovementService } from "@server/game/services/MovementService";
import type { SkillService } from "@server/game/services/SkillService";
import type { SoundService } from "@server/game/services/SoundService";
import type { VariableService } from "@server/game/services/VariableService";
import type { CameraControlPayload } from "@server/network/messages";
import type { ScriptScheduler } from "@server/game/systems/ScriptScheduler";
import { LockState } from "@server/game/model/LockState";
import {
    buildInstanceTemplate,
    type InstancedAreaManager,
} from "@server/world/InstancedAreaManager";

/**
 * Dependencies injected from WSServer that are not yet in extracted services.
 * These will shrink as more systems are extracted.
 */
export interface ScriptServiceAdapterDeps {
    dataLoaders: DataLoaderService;
    variableService: VariableService;
    messagingService: MessagingService;
    skillService: SkillService;
    inventoryService: InventoryService;
    equipmentService: EquipmentService;
    appearanceService: AppearanceService;
    locationService: LocationService;
    movementService: MovementService;
    collectionLogService: CollectionLogService;
    soundService: SoundService;
    actionScheduler: ActionScheduler;
    groundItems: GroundItemManager;
    scriptScheduler: ScriptScheduler;
    instancedAreaManager: InstancedAreaManager;
    // Not-yet-extracted deps (still on WSServer)
    getCurrentTick: () => number;
    isDeveloper?: (player: PlayerState) => boolean;
    getPathService: () => PathService;
    doorManager: DoorStateManager;
    npcManager: NpcManager;
    encounterManager: EncounterManager;
    interfaceService: InterfaceService;
    widgetDialogHandler: WidgetDialogHandler;
    prayerSystem: PrayerSystem;
    gatheringSystem: GatheringSystemManager;
    cs2ModalManager: Cs2ModalManager;
    followerManager?: FollowerManager;
    followerCombatManager?: FollowerCombatManager;
    sailingInstanceManager?: SailingInstanceManager;
    worldEntityInfoEncoder: WorldEntityInfoEncoder;
    playerPersistence: PersistenceProvider;
    musicCatalogService: MusicCatalogService | undefined;
    inventoryActionHandler: InventoryActionHandler;
    effectDispatcher: EffectDispatcher;
    combatEffectApplicator: CombatEffectApplicator;
    /** Deferred until the combat service has completed its construction. */
    combatEffectService?: CombatEffectService;
    combatActionHandler?: CombatActionHandler;
    damageTracker: DamageTracker;
    multiCombatSystem: MultiCombatSystem;
    getPlayers: () => PlayerManager | undefined;
    enqueueSpotAnimation: (anim: PendingSpotAnimation) => void;
    enqueueForcedMovement: (data: ForcedMovementBroadcast) => void;
    enqueueSoundBroadcast: (soundId: number, x: number, y: number, level: number) => void;
    syncMusicInterface?: (player: PlayerState) => void;
    playSongForPlayer?: (player: PlayerState, trackId: number, trackName?: string) => void;
    skipMusicTrack?: (player: PlayerState) => boolean;
    queueCombatSnapshot: (
        playerId: number,
        weaponCategory: number,
        weaponItemId: number,
        autoRetaliate: boolean,
        activeStyle?: number,
        activePrayers?: string[],
        activeSpellId?: number,
    ) => void;
    queueClientScript: (playerId: number, scriptId: number, ...args: (number | string)[]) => void;
    queueWidgetEvent: (playerId: number, event: WidgetAction) => void;
    queueCameraEvent: (playerId: number, payload: CameraControlPayload) => void;
    queueProjectile: (projectile: ProjectileLaunch) => void;
    queueSmithingInterfaceMessage: (playerId: number, payload: Record<string, unknown>) => void;
    queueDebugMessage: (playerId: number, payload: Record<string, unknown>) => void;
    queueExternalNpcTeleportSync: (npc: NpcState) => void;
    teleportToWorldEntity: (
        player: PlayerState,
        x: number,
        y: number,
        level: number,
        entityIndex: number,
        configId: number,
        sizeX: number,
        sizeZ: number,
        templateChunks: number[][][],
        buildAreas: import("@august/protocol/worldentity/WorldEntityTypes").WorldEntityBuildArea[],
        extraLocs?: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }>,
    ) => void;
    sendWorldEntity: (
        player: PlayerState,
        entityIndex: number,
        configId: number,
        sizeX: number,
        sizeZ: number,
        templateChunks: number[][][],
        buildAreas: import("@august/protocol/worldentity/WorldEntityTypes").WorldEntityBuildArea[],
        extraLocs?: Array<{
            id: number;
            x: number;
            y: number;
            level: number;
            shape: number;
            rotation: number;
        }>,
        extraNpcs?: Array<{ id: number; x: number; y: number; level: number }>,
        drawMode?: number,
    ) => void;
    completeLogout: (sock: WebSocket, player: PlayerState, reason?: string) => void;
    closeInterruptibleInterfaces: (player: PlayerState) => void;
    activeFrame: () => TickFrame | undefined;
    gamemode?: { onItemCraft?: (playerId: number, itemId: number, count: number) => void };
    eventBus?: GameEventBus;
}

function buildProviderRegistrationFacade(): ProviderRegistrationFacade {
    const reg = getProviderRegistry();
    return {
        registerWeaponData: (p) => {
            reg.weaponData = p;
        },
        registerFallbackSpecialAttack: (p) => {
            reg.fallbackSpecialAttack = p;
        },
        registerCombatStyleSequence: (p) => {
            reg.combatStyleSequence = p;
        },
        registerEquipmentBonus: (p) => {
            reg.equipmentBonus = p;
        },
        registerSpellXp: (p) => {
            reg.spellXp = p;
        },
        registerSpecialAttackVisual: (p) => {
            reg.specialAttackVisual = p;
        },
        registerInstantUtilitySpecial: (p) => {
            reg.instantUtilitySpecial = p;
        },
        registerSkillConfiguration: (c) => {
            reg.skillConfiguration = c;
        },
        registerSpellData: (p) => {
            reg.spellData = p;
        },
        registerRuneData: (p) => {
            reg.runeData = p;
        },
        registerProjectileParams: (p) => {
            reg.projectileParams = p;
        },
        registerAmmoData: (p) => {
            reg.ammoData = p;
        },
    };
}

/**
 * Adapts the extracted service classes into the ScriptServices interface
 * consumed by scripts and gamemodes. Replaces the 559-line buildScriptServiceObject
 * anonymous object from WSServer.
 */
export function buildScriptServices(deps: ScriptServiceAdapterDeps): ScriptServices {
    const toScriptGroundItem = (stack: GroundItemStack): ScriptGroundItem => ({
        stackId: stack.id,
        itemId: stack.itemId,
        quantity: stack.quantity,
        tile: { ...stack.tile },
        worldViewId: stack.worldViewId,
        ownerId: stack.ownerId,
    });
    const snapshotInventoryFn = (player: PlayerState): void => {
        deps.inventoryService.snapshotInventory(player);
    };

    const services: ScriptServices = {
        // Provider registration facade (available to gamemodes and content modules)
        providers: buildProviderRegistrationFacade(),
        groundItems: {
            spawn: (itemId, quantity, tile, options) => {
                const { worldViewId = -1, ...spawnOptions } = options ?? {};
                const stack = deps.groundItems.spawn(
                    itemId,
                    quantity,
                    tile,
                    deps.getCurrentTick(),
                    spawnOptions,
                    worldViewId,
                );
                return stack ? toScriptGroundItem(stack) : undefined;
            },
            remove: (stackId, quantity, requester) => {
                const removed = deps.groundItems.removeById(
                    stackId,
                    quantity,
                    deps.getCurrentTick(),
                    requester?.id,
                );
                if (!removed) return undefined;
                return { removed: removed.removed, remaining: removed.remaining };
            },
            query: (tile, options) => {
                const observer = options?.observer;
                return deps.groundItems
                    .queryArea(
                        tile.x,
                        tile.y,
                        tile.level,
                        options?.radius ?? 0,
                        deps.getCurrentTick(),
                        observer?.id,
                        options?.worldViewId ?? observer?.worldViewId ?? -1,
                    )
                    .map(toScriptGroundItem);
            },
        },
        // Gamemode-contributed facades (populated by contributeScriptServices)
        // gathering is deferred — wired after GatheringSystemManager construction.
        // Use a getter so registerTracker/add see the live instance (not the boot undefined).
        stopGatheringInteraction: (player) => {
            try {
                player.clearInteraction();
            } catch {}
            try {
                player.stopAnimation();
            } catch {}
            try {
                player.clearPath();
            } catch {}
            try {
                player.clearWalkDestination();
            } catch {}
        },
        production: {
            takeInventoryItems: (player, inputs) =>
                deps.inventoryService.takeInventoryItems(player, inputs),
            restoreInventoryRemovals: (player, removed) =>
                deps.inventoryService.restoreInventoryRemovals(player, removed),
            restoreInventoryItems: (player, itemId, removed) =>
                deps.inventoryService.restoreInventoryItems(player, itemId, removed),
            queueSmithingMessage: (playerId, payload) =>
                deps.queueSmithingInterfaceMessage(playerId, payload),
            openSmithingModal: (player, groupId, varbits) =>
                deps.interfaceService?.openModal(
                    player,
                    groupId,
                    undefined,
                    varbits ? { varbits } : undefined,
                ),
            closeSmithingModal: (player) => deps.interfaceService?.closeModal(player),
            isSmithingModalOpen: (player, groupId) =>
                deps.interfaceService?.isModalOpen(player, groupId) ?? false,
            openSmithingBarModal: undefined,
            getBarTypeByItemId: (_itemId) => undefined,
        },
        get followers(): FollowerServiceFacade | undefined {
            return deps.followerManager
                ? {
                  summonFollowerFromItem: (player, itemId, npcTypeId) => {
                      const result = deps.followerManager!.summonFollowerFromItem(
                          player,
                          itemId,
                          npcTypeId,
                      ) ?? { ok: false as const, reason: "spawn_failed" };
                      if (result.ok) deps.followerCombatManager?.resetPlayer(player.id);
                      return result;
                  },
                  pickupFollower: (player, npcId) => {
                      const result = deps.followerManager!.pickupFollower(player, npcId) ?? {
                          ok: false as const,
                          reason: "missing",
                      };
                      if (result.ok) deps.followerCombatManager?.resetPlayer(player.id);
                      return result;
                  },
                  metamorphFollower: (player, npcId) => {
                      const result = deps.followerManager!.metamorphFollower(player, npcId) ?? {
                          ok: false as const,
                          reason: "missing",
                      };
                      if (result.ok) deps.followerCombatManager?.resetPlayer(player.id);
                      return result;
                  },
                  callFollower: (player) => {
                      const result = deps.followerManager!.callFollower(player) ?? {
                          ok: false as const,
                          reason: "missing",
                      };
                      if (result.ok) {
                          deps.followerCombatManager?.resetPlayer(player.id);
                          const npc = deps.npcManager?.getById(result.npcId);
                          if (npc) deps.queueExternalNpcTeleportSync(npc);
                      }
                      return result;
                  },
                  despawnFollowerForPlayer: (playerId, clearPersistentState) => {
                      deps.followerCombatManager?.resetPlayer(playerId);
                      return (
                          deps.followerManager!.despawnFollowerForPlayer(
                              playerId,
                              clearPersistentState,
                          ) ?? false
                      );
                  },
                  getItemDefinitions: () => FOLLOWER_ITEM_DEFINITIONS,
                  getDefinitionByItemId: (itemId) => getFollowerDefinitionByItemId(itemId),
                  getDefinitionByNpcTypeId: (npcTypeId) =>
                      getFollowerDefinitionByNpcTypeId(npcTypeId),
                  }
                : undefined;
        },
        sailing: deps.sailingInstanceManager
            ? {
                  initSailingInstance: (player) =>
                      deps.sailingInstanceManager!.initInstance(player),
                  disposeSailingInstance: (player) =>
                      deps.sailingInstanceManager!.disposeInstance(player),
                  isInSailingInstanceRegion: (player) =>
                      deps.sailingInstanceManager!.isInSailingInstanceRegion(player),
                  teleportToWorldEntity: (
                      player,
                      x,
                      y,
                      level,
                      entityIndex,
                      configId,
                      sizeX,
                      sizeZ,
                      templateChunks,
                      buildAreas,
                      extraLocs,
                  ) =>
                      deps.teleportToWorldEntity(
                          player,
                          x,
                          y,
                          level,
                          entityIndex,
                          configId,
                          sizeX,
                          sizeZ,
                          templateChunks,
                          buildAreas,
                          extraLocs,
                      ),
                  sendWorldEntity: (
                      player,
                      entityIndex,
                      configId,
                      sizeX,
                      sizeZ,
                      templateChunks,
                      buildAreas,
                      extraLocs,
                      extraNpcs,
                      drawMode,
                  ) =>
                      deps.sendWorldEntity(
                          player,
                          entityIndex,
                          configId,
                          sizeX,
                          sizeZ,
                          templateChunks,
                          buildAreas,
                          extraLocs,
                          extraNpcs,
                          drawMode,
                      ),
                  removeWorldEntity: (playerId, entityIndex) =>
                      deps.worldEntityInfoEncoder.removeEntity(playerId, entityIndex),
                  queueWorldEntityPosition: (playerId, entityIndex, position) =>
                      deps.worldEntityInfoEncoder.queuePosition(playerId, entityIndex, position),
                  setWorldEntityPosition: (playerId, entityIndex, position) =>
                      deps.worldEntityInfoEncoder.setPosition(playerId, entityIndex, position),
                  queueWorldEntityMask: (playerId, entityIndex, mask) =>
                      deps.worldEntityInfoEncoder.queueMaskUpdate(playerId, entityIndex, mask),
                  buildSailingDockedCollision: () =>
                      deps.sailingInstanceManager!.buildDockedCollision(),
              }
            : undefined,

        // Grouped facades - constructed directly from deps
        messaging: {
            sendGameMessage: (player, text) =>
                deps.messagingService.sendGameMessageToPlayer(player, text),
            queueNotification: (playerId, payload) =>
                deps.messagingService.queueNotification(playerId, payload),
        },
        variables: {
            sendVarp: (player, varpId, value) =>
                deps.variableService.queueVarp(player.id, varpId, value),
            sendVarbit: (player, varbitId, value) =>
                deps.variableService.queueVarbit(player.id, varbitId, value),
            queueVarp: (playerId, varpId, value) =>
                deps.variableService.queueVarp(playerId, varpId, value),
            queueVarbit: (playerId, varbitId, value) =>
                deps.variableService.queueVarbit(playerId, varbitId, value),
        },
        skills: {
            addSkillXp: (player, skillId, xp) => {
                try {
                    deps.skillService.awardSkillXp(
                        player,
                        skillId as SkillId,
                        Number.isFinite(xp) ? xp : 0,
                    );
                } catch (err) {
                    logger.warn("Failed to award skill XP", err);
                }
            },
            getSkill: (player, skillId) => {
                const skill = player.skillSystem.getSkill(skillId);
                return { baseLevel: skill.baseLevel, boost: skill.boost, xp: skill.xp };
            },
        },
        data: {
            getDbRepository: () => deps.dataLoaders.getDbRepository(),
            getEnumTypeLoader: () => deps.dataLoaders.getEnumTypeLoader(),
            getStructTypeLoader: () => deps.dataLoaders.getStructTypeLoader(),
            getIdkTypeLoader: () => deps.dataLoaders.getIdkTypeLoader(),
            getObjType: (id) => deps.dataLoaders.getObjType(id),
            getLocDefinition: (id) => deps.dataLoaders.getLocDefinition(id),
            getLocTypeLoader: () => deps.dataLoaders.getLocTypeLoader(),
            getNpcTypeLoader: () => deps.dataLoaders.getNpcTypeLoader(),
            getSeqTypeLoader: () => deps.dataLoaders.getSeqTypeLoader(),
            getItemDefinition: (itemId) => getItemDefinition(itemId),
            loadItemDefinitions: () => loadItemDefinitions(),
        },
        system: {
            logger,
            getCurrentTick: () => deps.getCurrentTick(),
            isDeveloper: (player) => deps.isDeveloper?.(player) ?? false,
            eventBus: deps.eventBus,
        },
        inventory: {
            consumeItem: (player, slotIndex) =>
                deps.inventoryService.consumeItem(player, slotIndex),
            getInventoryItems: (player) =>
                deps.inventoryService.getInventory(player).map((entry, idx) => ({
                    slot: idx,
                    itemId: entry ? entry.itemId : -1,
                    quantity: entry ? entry.quantity : 0,
                })),
            addItemToInventory: (player, itemId, qty) =>
                deps.inventoryService.addItemToInventory(player, itemId, qty),
            setInventorySlot: (player, slotIndex, itemId, qty) =>
                deps.inventoryService.setInventorySlot(player, slotIndex, itemId, qty),
            snapshotInventory: snapshotInventoryFn,
            snapshotInventoryImmediate: snapshotInventoryFn,
            findOwnedItemLocation: (player, itemId) =>
                deps.inventoryService.findOwnedItemLocation(player, itemId),
            collectCarriedItemIds: (player) => deps.inventoryService.collectCarriedItemIds(player),
            findInventorySlotWithItem: (player, itemId) =>
                deps.inventoryService.findInventorySlotWithItem(player, itemId),
            canStoreItem: (player, itemId) => deps.inventoryService.canStoreItem(player, itemId),
            playerHasItem: (player, itemId) => deps.inventoryService.playerHasItem(player, itemId),
            hasInventorySlot: (player) => player.items.getFreeSlotCount() > 0,
        },
        equipment: {
            getEquippedItem: (player, slot) => {
                try {
                    return deps.equipmentService.ensureEquipArray(player)[slot] ?? -1;
                } catch {
                    return -1;
                }
            },
            getEquipArray: (player) => deps.equipmentService.ensureEquipArray(player),
            unequipItem: (player, slot) => {
                try {
                    const slotIndex = Math.max(0, Math.min(13, slot));
                    const equip = deps.equipmentService.ensureEquipArray(player);
                    if (!(equip[slotIndex] > 0)) return false;
                    const result = deps.inventoryActionHandler.executeInventoryUnequipAction(
                        player,
                        { slot: slotIndex, playSound: true },
                    );
                    if (result.ok && result.effects)
                        deps.effectDispatcher.dispatchActionEffects(result.effects);
                    return result.ok;
                } catch {
                    return false;
                }
            },
        },
        animation: {
            playPlayerSeq: (player, seqId, delay = 0) => {
                try {
                    player.queueOneShotSeq(seqId, delay);
                } catch {}
            },
            playPlayerSeqImmediate: (player, seqId) => {
                try {
                    player.queueOneShotSeq(seqId, 0);
                } catch {}
            },
            broadcastPlayerSpot: (player, spotId, height = 0, delay = 0, slotArg?) => {
                try {
                    const slot =
                        slotArg !== undefined && Number.isFinite(slotArg)
                            ? slotArg & 0xff
                            : undefined;
                    deps.enqueueSpotAnimation({
                        tick: deps.getCurrentTick(),
                        playerId: player.id,
                        spotId,
                        height,
                        delay,
                        slot,
                    });
                } catch {}
            },
            playLocGraphic: (opts) => deps.soundService.playLocGraphic(opts),
            playLocAnimation: (opts) => deps.soundService.playLocAnimation(opts),
            stopPlayerAnimation: (player) => {
                try {
                    player.stopAnimation();
                } catch {}
            },
            getEmoteSeq: (index) => getEmoteSeq(index),
            getSkillcapeSeqId: (capeItemId) => getSkillcapeSeqId(capeItemId),
            getSkillcapeSpotId: (capeItemId) => getSkillcapeSpotId(capeItemId),
        },
        sound: {
            playLocSound: (opts) => deps.soundService.playLocSound(opts),
            playAreaSound: (opts) => deps.soundService.playAreaSound(opts),
            playSong: (player, trackId, trackName) =>
                deps.playSongForPlayer?.(player, trackId, trackName),
            skipMusicTrack: (player) => deps.skipMusicTrack?.(player) ?? false,
            getMusicTrackId: (trackName) => deps.soundService.getMusicTrackIdByName(trackName),
            getMusicTrackBySlot: (slot) => deps.musicCatalogService?.getBaseListTrackBySlot(slot),
            sendSound: (player, soundId, opts) =>
                deps.soundService.sendSound(player, soundId, opts),
            sendJingle: (player, jingleId, delay) =>
                deps.soundService.sendJingle(player, jingleId, delay),
            enqueueSoundBroadcast: (soundId, x, y, level) =>
                deps.enqueueSoundBroadcast(soundId, x, y, level),
            syncMusicInterface: deps.syncMusicInterface
                ? (player) => deps.syncMusicInterface!(player)
                : undefined,
        },
        appearance: {
            refreshAppearanceKits: (player) => deps.appearanceService.refreshAppearanceKits(player),
            queueAppearanceSnapshot: (player) =>
                deps.appearanceService.queueAppearanceSnapshot(player),
            savePlayerSnapshot: (player) => {
                try {
                    const key = player.__saveKey;
                    if (key && key.length > 0) deps.playerPersistence.saveSnapshot(key, player);
                } catch {}
            },
            logoutPlayer: (player, reason) => {
                try {
                    const sock = deps.getPlayers()?.getSocketByPlayerId?.(player.id);
                    if (sock) deps.completeLogout(sock, player, reason);
                } catch {}
            },
        },
        dialog: {
            openDialog: (player, request) => deps.widgetDialogHandler.openDialog(player, request),
            openDialogOptions: (player, options) =>
                deps.widgetDialogHandler.openDialogOptions(player, options),
            openSkillMulti: (player, request) =>
                deps.widgetDialogHandler.openSkillMulti(player, request),
            closeDialog: (player, dialogId) =>
                deps.widgetDialogHandler.closeDialog(player, dialogId),
            closeInterruptibleInterfaces: (player) => deps.closeInterruptibleInterfaces(player),
            openSubInterface: (player, targetUid, groupId, type = 0, opts) => {
                if (type === 0 || type === 1) {
                    const modal = opts?.modal ?? type === 0;
                    if (modal) {
                        deps.interfaceService.closeModalInterfaces(player, {
                            exceptGroupId: groupId,
                        });
                    }
                    player.widgets.open(groupId, {
                        targetUid,
                        type,
                        modal,
                        varps: opts?.varps,
                        varbits: opts?.varbits,
                        preScripts: opts?.preScripts,
                        postScripts: opts?.postScripts,
                        hiddenUids: opts?.hiddenUids,
                    });
                    return;
                }
                deps.queueWidgetEvent(player.id, {
                    action: "open_sub",
                    targetUid,
                    groupId,
                    type,
                    varps: opts?.varps,
                    varbits: opts?.varbits,
                    preScripts: opts?.preScripts,
                    postScripts: opts?.postScripts,
                    hiddenUids: opts?.hiddenUids,
                });
            },
            closeSubInterface: (player, targetUid, groupId) => {
                const closed =
                    groupId !== undefined
                        ? player.widgets.closeByTargetUid(targetUid, { groupId })
                        : player.widgets.closeByTargetUid(targetUid);
                deps.interfaceService?.triggerCloseHooksForEntries(player, closed);
            },
            closeModal: (player) => deps.interfaceService?.closeModal(player),
            getInterfaceService: () => deps.interfaceService,
            openRemainingTabs: (player) => {
                const displayMode = player.displayMode ?? 1;
                const xpDropsEnabled = player.varps.getVarbitValue(VARBIT_XPDROPS_ENABLED) === 1;
                const minimapToggleValue = player.varps.getVarbitValue(VARBIT_MINIMAP_TOGGLE);
                const mapClock = getMapClockValue(player.varps, deps.getCurrentTick());
                for (const mount of getDefaultInterfaces(displayMode)) {
                    const intf = rewriteMinimapOrbsMount(mount, displayMode, minimapToggleValue);
                    if (intf.groupId === SIDE_JOURNAL_GROUP_ID) continue;
                    const hideXpCounterOnOpen = intf.groupId === 122 && !xpDropsEnabled;
                    player.widgets?.open(intf.groupId, {
                        targetUid: intf.targetUid,
                        type: intf.type,
                        modal: false,
                        postScripts: intf.postScripts,
                        varbits:
                            mount.groupId === MINIMAP_WIDGET_GROUP_ID
                                ? getMinimapToggleVarbits(minimapToggleValue)
                                : intf.varbits,
                        hiddenUids: hideXpCounterOnOpen ? [intf.targetUid] : undefined,
                    });
                    if (mount.groupId === MINIMAP_WIDGET_GROUP_ID) {
                        for (const action of createOrbsBootstrapActions(intf.groupId, mapClock)) {
                            deps.queueWidgetEvent(player.id, action);
                        }
                    }
                }
                for (const script of getEnhancedClientLoginScripts(player.name)) {
                    deps.queueWidgetEvent(player.id, {
                        action: "run_script",
                        scriptId: script.scriptId,
                        args: script.args,
                    });
                }
            },
            queueClientScript: (playerId, scriptId, ...args) =>
                deps.queueClientScript(playerId, scriptId, ...args),
            queueWidgetEvent: (playerId, event) => deps.queueWidgetEvent(playerId, event),
            queueDebugMessage: (playerId, payload) => deps.queueDebugMessage(playerId, payload),
        },
        movement: {
            teleportPlayer: (player, x, y, level, forceRebuild) =>
                deps.movementService.teleportPlayer(player, x, y, level, forceRebuild),
            teleportToInstance: (player, x, y, level, templateChunks, extraLocs) =>
                deps.movementService.teleportToInstance(
                    player,
                    x,
                    y,
                    level,
                    templateChunks,
                    extraLocs,
                ),
            requestTeleportAction: (player, request) =>
                deps.movementService.requestTeleportAction(player, request),
            queueForcedMovement: (player, params) => {
                const currentTick = deps.getCurrentTick();
                const frame = deps.activeFrame();
                const deliveryTick = frame ? frame.tick : currentTick + 1;
                const requestedStartTick = params.startTick ?? deliveryTick;
                const durationTicks = Math.max(0, params.endTick - requestedStartTick);
                const normalizedStartTick = Math.max(deliveryTick, requestedStartTick);
                const normalizedEndTick = normalizedStartTick + durationTicks;
                const startX = (params.startTile.x << 7) + 64;
                const startY = (params.startTile.y << 7) + 64;
                const endX = (params.endTile.x << 7) + 64;
                const endY = (params.endTile.y << 7) + 64;
                deps.enqueueForcedMovement({
                    targetId: player.id,
                    startDeltaX: params.startTile.x - player.tileX,
                    startDeltaY: params.startTile.y - player.tileY,
                    endDeltaX: params.endTile.x - player.tileX,
                    endDeltaY: params.endTile.y - player.tileY,
                    startCycle: normalizedStartTick,
                    endCycle: normalizedEndTick,
                    direction: params.direction ?? faceAngleRs(startX, startY, endX, endY),
                });
            },
            getPathService: () => deps.getPathService(),
        },
        camera: {
            move: (player, tile, height, instant) =>
                deps.queueCameraEvent(player.id, {
                    mode: "move",
                    x: Math.trunc(tile.x),
                    y: Math.trunc(tile.y),
                    height: Math.max(0, Math.trunc(height)),
                    instant,
                }),
            lookAt: (player, tile, height, instant) =>
                deps.queueCameraEvent(player.id, {
                    mode: "look",
                    x: Math.trunc(tile.x),
                    y: Math.trunc(tile.y),
                    height: Math.max(0, Math.trunc(height)),
                    instant,
                }),
            shake: (player, slot, randomAmplitude, sineAmplitude, sineFrequency) =>
                deps.queueCameraEvent(player.id, {
                    mode: "shake",
                    slot: Math.max(0, Math.min(4, Math.trunc(slot))),
                    randomAmplitude: Math.max(0, Math.trunc(randomAmplitude)),
                    sineAmplitude: Math.max(0, Math.trunc(sineAmplitude)),
                    sineFrequency: Math.max(0, Math.trunc(sineFrequency)),
                }),
            reset: (player) => deps.queueCameraEvent(player.id, { mode: "reset" }),
        },
        projectiles: {
            launch: (projectile) => deps.queueProjectile(projectile),
        },
        scheduler: {
            after: (delayTicks, handler, owner) =>
                deps.scriptScheduler.scheduleIn(
                    deps.getCurrentTick(),
                    delayTicks,
                    handler,
                    owner,
                ),
            repeat: (delayTicks, repeatTicks, handler, owner) =>
                deps.scriptScheduler.scheduleAt(
                    deps.getCurrentTick() + Math.max(0, Math.trunc(delayTicks)),
                    handler,
                    repeatTicks,
                    owner,
                ),
            cancel: (taskId) => deps.scriptScheduler.cancel(taskId),
            cancelOwner: (owner) => deps.scriptScheduler.cancelOwner(owner),
        },
        sequence: {
            run: (player, generator, options) => {
                const previousLock = player.lock;
                const requestedLock = options?.lock ?? LockState.FULL_WITH_DAMAGE_IMMUNITY;
                const task = player.taskQueue.queueStrong(function* (queueTask) {
                    player.lock = requestedLock;
                    try {
                        yield* generator(queueTask);
                    } finally {
                        player.lock = previousLock;
                        if (options?.resetCamera) {
                            deps.queueCameraEvent(player.id, { mode: "reset" });
                        }
                        options?.onCleanup?.();
                    }
                });
                return task;
            },
        },
        instances: {
            buildTemplate: (copies) => buildInstanceTemplate(copies),
            create: (player, spec) => deps.instancedAreaManager.create(player, spec),
            get: (playerId) => deps.instancedAreaManager.get(playerId),
            getById: (instanceId) => deps.instancedAreaManager.getById(instanceId),
            getMemberPlayers: (instanceId) =>
                deps.instancedAreaManager.getMemberPlayers(instanceId),
            listJoinable: (definitionId) =>
                deps.instancedAreaManager.listJoinable(definitionId),
            join: (player, instanceId) => deps.instancedAreaManager.join(player, instanceId),
            markStarted: (instanceId) => deps.instancedAreaManager.markStarted(instanceId),
            leave: (player, destination) =>
                deps.instancedAreaManager.leave(player, destination),
            dispose: (player, destination) =>
                deps.instancedAreaManager.dispose(player, destination),
        },
        location: {
            doorManager: deps.doorManager,
            resolveLocTransformId: (player, locDef) => resolveLocTransformId(player, locDef),
            emitLocChange: (oldId, newId, tile, level, opts) =>
                deps.locationService.emitLocChange(oldId, newId, tile, level, opts),
            sendLocChangeToPlayer: (player, oldId, newId, tile, level) =>
                deps.locationService.sendLocChangeToPlayer(player, oldId, newId, tile, level),
            spawnLocForPlayer: (player, locId, tile, level, shape, rotation) =>
                deps.locationService.spawnLocForPlayer(player, locId, tile, level, shape, rotation),
            replaceTemporaryLoc: (scope, oldId, newId, tile, level, options) =>
                deps.locationService.replaceTemporaryLoc(
                    scope,
                    oldId,
                    newId,
                    tile,
                    level,
                    options,
                ),
            removeTemporaryLoc: (scope, oldId, tile, level, options) =>
                deps.locationService.removeTemporaryLoc(scope, oldId, tile, level, options),
            clearTemporaryLoc: (scope, oldId, tile, level, oldShape) =>
                deps.locationService.clearTemporaryLoc(scope, oldId, tile, level, oldShape),
            hasTemporaryLocVisibleToPlayer: (player, locId, tile, level) =>
                deps.locationService.hasTemporaryLocVisibleToPlayer(
                    player,
                    locId,
                    tile,
                    level,
                ),
            triggerLocEffect: () => false, // replaced below with self-referencing version
            isAdjacentToLoc: (player, locId, tile, level) =>
                deps.locationService.isAdjacentToLoc(player, locId, tile, level),
            isAdjacentToNpc: (player, npc) => deps.locationService.isAdjacentToNpc(player, npc),
            faceTile: (player, tile) => deps.locationService.faceTile(player, tile),
        },
        combat: {
            registerOnNpcKilled: (fn) => {
                deps.combatActionHandler?.registerOnNpcKilled(fn);
            },
            requestAction: (player, request, currentTick) => {
                try {
                    const groups = Array.isArray(request?.groups) ? request.groups : [];
                    if (groups.includes("skill.woodcut"))
                        deps.actionScheduler.clearActionsInGroup(player.id, "skill.woodcut");
                } catch {}
                return deps.actionScheduler.requestAction(
                    player.id,
                    request,
                    Number.isFinite(currentTick) ? (currentTick as number) : deps.getCurrentTick(),
                );
            },
            applyPrayers: (player, prayers) => {
                const result = deps.prayerSystem.applySelection(player, prayers);
                // Prayer button scripts optimistically toggle their local
                // varbits. Push the resolved server set straight back so the
                // UI clears every prayer removed by conflict resolution.
                if (result.changed) {
                    deps.queueCombatSnapshot(
                        player.id,
                        player.combat?.weaponCategory ?? 0,
                        player.combat?.weaponItemId ?? -1,
                        player.combat?.autoRetaliate ?? true,
                        player.combat?.styleSlot,
                        Array.from(player.prayer.getActivePrayers()),
                        player.combat?.spellId !== undefined && player.combat.spellId >= 0
                            ? player.combat.spellId
                            : undefined,
                    );
                }
                if (result.activated.length > 0) {
                    for (const prayer of result.activated) {
                        const soundId = getPrayerDefinition(prayer).soundId;
                        if (soundId !== undefined) {
                            deps.soundService.sendSound(player, soundId);
                        }
                    }
                } else if (result.deactivated.length > 0) {
                    deps.soundService.sendSound(player, PRAYER_DEACTIVATE_SOUND_ID);
                }
                return result;
            },
            setCombatSpell: undefined,
            queueCombatState: (player) =>
                deps.queueCombatSnapshot(
                    player.id,
                    player.combat?.weaponCategory ?? 0,
                    player.combat?.weaponItemId ?? -1,
                    player.combat?.autoRetaliate ?? true,
                    player.combat?.styleSlot,
                    Array.from(player.prayer.getActivePrayers()),
                    player.combat?.spellId !== undefined && player.combat.spellId >= 0
                        ? player.combat.spellId
                        : undefined,
                ),
            getNpc: (id) => deps.npcManager?.getById(id) ?? undefined,
            isPlayerStunned: (player) => player.timers.has(STUN_TIMER),
            isPlayerInCombat: (player) => player.isBeingAttacked(),
            applyPlayerHitsplat: (player, style, damage, tick) =>
                deps.combatEffectApplicator.applyPlayerHitsplat(player, style, damage, tick),
            applyNpcDamageToPlayer: (npc, player, style, damage, tick) => {
                const currentTick = tick ?? deps.getCurrentTick();
                const result = deps.combatEffectApplicator.applyPlayerHitsplat(
                    player,
                    style,
                    damage,
                    currentTick,
                );
                deps.activeFrame()?.hitsplats.push({
                    targetType: "player",
                    targetId: player.id,
                    damage: result.amount,
                    style: result.style,
                    sourceType: "npc",
                    hpCurrent: result.hpCurrent,
                    hpMax: result.hpMax,
                });
                return result;
            },
            applyPlayerDamageToNpc: (player, npc, style, damage, tick) =>
                deps.combatEffectService?.applyPlayerDamageToNpc(
                    player,
                    npc,
                    damage,
                    style,
                    tick ?? deps.getCurrentTick(),
                    AttackType.Melee,
                ),
            applyNpcHitsplat: (npc, style, damage, tick, maxHit) => {
                const currentTick = tick ?? deps.getCurrentTick();
                const result = deps.combatEffectApplicator.applyNpcHitsplat(
                    npc,
                    style,
                    damage,
                    currentTick,
                    maxHit,
                );
                deps.activeFrame()?.hitsplats.push({
                    targetType: "npc",
                    targetId: npc.id,
                    damage: result.amount,
                    style: result.style,
                    sourceType: "npc",
                    hpCurrent: result.hpCurrent,
                    hpMax: result.hpMax,
                });
                return result;
            },
            stunPlayer: (player, ticks) => {
                player.timers.set(STUN_TIMER, ticks);
            },
            scheduleAction: (playerId, request, tick) =>
                deps.actionScheduler.requestAction(playerId, request, tick),
            clearPlayerFaceTarget: (player) => {
                try {
                    player.clearInteraction();
                } catch {}
            },
            getDropEligibility: (npc) => deps.damageTracker.getDropEligibility(npc),
            rollNpcDrops: (npc, eligibility) =>
                deps.combatEffectService?.rollNpcDrops(npc, eligibility) ?? [],
            clearNpcDamageRecords: (npc) => deps.damageTracker.clearNpc(npc),
            getLastAttacker: (actor, currentTick) =>
                deps.multiCombatSystem.getLastAttacker(actor, currentTick),
            isMultiCombat: (x, y, plane) => deps.multiCombatSystem.isMultiCombat(x, y, plane),
            applyAutocastState: (player, spellId, autocastIndex, isDefensive, callbacks) =>
                applyAutocastState(player, spellId, autocastIndex, isDefensive, callbacks),
            clearAutocastState: (player, callbacks) => clearAutocastState(player, callbacks),
            validateRunes: (runeCosts, inventory, equippedItems) =>
                RuneValidator.validateAndCalculate(runeCosts, inventory, equippedItems),
        },
        npc: {
            spawnNpc: (config) => deps.npcManager?.spawnTransientNpc(config),
            removeNpc: (npcId) => deps.npcManager?.removeNpc(npcId) ?? false,
            findNearbyNpc: (player, npcTypeId, radius) =>
                deps.npcManager
                    ?.getNearby(player.tileX, player.tileY, player.level, radius)
                    .find(
                        (npc) =>
                            npc.typeId === npcTypeId && isNpcVisibleToPlayer(npc, player),
                    ),
            hasLineOfSightToPlayer: (npc, player) =>
                hasNpcLineOfSightToPlayer(npc, player, deps.getPathService()),
            stopNpcMovement: (npc, holdTicks) => {
                const ticks = Math.max(0, Math.trunc(holdTicks ?? 0));
                if (ticks > 0) {
                    npc.holdMovementUntil(deps.getCurrentTick() + ticks);
                } else {
                    npc.clearPath();
                    npc.running = false;
                }
            },
            queueNpcForcedChat: (npc, text) => {
                npc.pendingSay = text;
            },
            queueNpcSeq: (npc, seqId) => {
                npc.queueOneShotSeq(seqId);
            },
            faceNpcToPlayer: (npc, player) => {
                // Face-pawn: the client turns the NPC toward the player
                // continuously, and idle roaming is suppressed until the
                // facing hold expires.
                npc.setInteraction("player", player.id);
                npc.faceTile(player.tileX, player.tileY);
            },
            faceNpcToTile: (npc, tile) => {
                npc.clearInteractionTarget();
                npc.faceTile(Math.trunc(tile.x), Math.trunc(tile.y));
            },
            moveNpcTo: (npc, tile, run) => {
                npc.running = run === true;
                return npc.pathTo(Math.trunc(tile.x), Math.trunc(tile.y));
            },
            teleportNpc: (npc, tile) => {
                npc.teleport(Math.trunc(tile.x), Math.trunc(tile.y), tile.level ?? npc.level);
                deps.queueExternalNpcTeleportSync(npc);
            },
            engageCombat: (npc, player) =>
                npc.engageCombat(player.id, deps.getCurrentTick(), player),
            disengageCombat: (npc) => npc.disengageCombat(),
            queueNpcSpotAnim: (npc, spotId, height, delay) =>
                deps.enqueueSpotAnimation({
                    tick: deps.getCurrentTick(),
                    npcId: npc.id,
                    spotId,
                    height,
                    delay,
                }),
            replaceNpc: (npc, newTypeId, lifetimeTicks) => {
                const hitpoints = npc.getHitpoints();
                const targetPlayerId = npc.getCombatTargetPlayerId();
                const replacement = deps.npcManager.spawnTransientNpc({
                    id: newTypeId,
                    x: npc.tileX,
                    y: npc.tileY,
                    level: npc.level,
                    wanderRadius: npc.wanderRadius,
                    direction: 0,
                    worldViewId: npc.worldViewId,
                    ownerPlayerId: npc.ownerPlayerId,
                    lifetimeTicks,
                });
                if (replacement) {
                    const damageToPreserve = Math.max(
                        0,
                        replacement.getMaxHitpoints() -
                            Math.min(hitpoints, replacement.getMaxHitpoints()),
                    );
                    const transitioned =
                        deps.encounterManager.transitionFormIfCompatible(
                            npc.id,
                            replacement,
                        );
                    if (!transitioned) replacement.applyDamage(damageToPreserve);
                    if (targetPlayerId !== undefined) {
                        replacement.engageCombat(targetPlayerId, deps.getCurrentTick());
                    }
                    deps.npcManager.removeNpc(npc.id);
                }
                return replacement;
            },
        },
        encounters: {
            ensure: (npc) => deps.encounterManager.ensureForNpc(npc),
            getByNpcRuntimeId: (npcRuntimeId) => deps.encounterManager.getByNpcRuntimeId(npcRuntimeId),
        },
        collectionLog: {
            trackCollectionLogItem: (player, itemId) =>
                deps.collectionLogService.trackCollectionLogItem(player, itemId),
            sendCollectionLogSnapshot: (player) =>
                deps.collectionLogService.sendCollectionLogSnapshot(player),
            openCollectionLog: (player) => deps.collectionLogService.openCollectionLog(player),
            openCollectionOverview: (player) =>
                deps.collectionLogService.openCollectionOverview(player),
            populateCollectionLogCategories: (player, tabIndex) =>
                deps.collectionLogService.populateCollectionLogCategories(player, tabIndex),
        },
        viewport: {
            getMainmodalUid: (displayMode) => getMainmodalUid(displayMode),
            getSidemodalUid: (displayMode) => getSidemodalUid(displayMode),
            getPrayerTabUid: (displayMode) => getPrayerTabUid(displayMode),
            getViewportTrackerFrontUid: (displayMode) => getViewportTrackerFrontUid(displayMode),
            getDefaultInterfaces: (displayMode) => getDefaultInterfaces(displayMode),
        },
    } as ScriptServices;

    // Deferred: GatheringSystemManager is constructed after buildScriptServices().
    // A plain `gathering: deps.gatheringSystem` would freeze undefined forever.
    Object.defineProperty(services, "gathering", {
        get: () => deps.gatheringSystem,
        enumerable: true,
        configurable: true,
    });

    // triggerLocEffect needs a reference to `services` itself for recursive loc effect chains
    services.location.triggerLocEffect = (locId, tile, level) =>
        triggerLocEffect(services, locId, tile, level);

    return services;
}
