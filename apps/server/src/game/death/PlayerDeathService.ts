/**
 * Player Death Service
 *
 * Main orchestration for player death handling following OSRS/RSMod patterns.
 * Uses tick-based death sequence (not async) for proper game loop integration.
 *
 * Death Flow:
 * 1. HP reaches 0: Lock player, snapshot skull/prayer state, queue death
 * 2. Next tick: Play death animation, start death timer
 * 3. After animation (6 ticks): calculate items, drop to ground
 * 4. Restore stats, teleport to respawn
 * 5. Send death message, unlock player
 *
 * Note: In OSRS, the death animation plays on the tick AFTER HP reaches 0,
 * not the same tick. This is why we use the "queued" phase before "animation".
 *
 * Security Checkpoints:
 * - Snapshot skull state immediately (prevents toggle exploit)
 * - Snapshot prayer state immediately (prevents Protect Item toggle)
 * - Full lock before any work (prevents action queueing)
 * - Server-side item values only
 * - Validate respawn location (no wilderness respawns)
 */
import { SKILL_IDS, SkillId } from "@august/osrs-engine/skill/skills";
import { getItemDefinition } from "@server/data/items";
import { logger } from "@server/observability/logger";
import type { ServerServices } from "@server/game/ServerServices";
import { RUN_ENERGY_MAX } from "@server/game/actor";
import { getWildernessLevel, isInWilderness } from "@server/game/combat/MultiCombatZones";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import { LockState } from "@server/game/model/LockState";
import type { PlayerState } from "@server/game/player";
import { recordTheatreDeath, storeTheatreWipe } from "@server/content/modules/theatre-of-blood/TheatreDeaths";
import { THEATRE_OUTSIDE, THEATRE_ROOMS } from "@server/content/modules/theatre-of-blood/rooms";
import { DeathHookRegistry } from "@server/game/death/DeathHookRegistry";
import {
    INSTANCE_GRAVE_RECLAIM_COST,
    syncInstanceGravePresentation,
} from "@server/game/death/InstanceGravePresentation";
import { ItemProtectionCalculator } from "@server/game/death/ItemProtectionCalculator";
import {
    DEATH_ANIMATION_ID,
    DEATH_ANIMATION_TICKS,
    DEATH_JINGLE_ID,
    DEFAULT_RESPAWN_LOCATIONS,
    type DeathContext,
    DeathType,
    ItemSourceType,
    type RespawnLocation,
    type ValuedItem,
} from "@server/game/death/types";

/** Coins item ID for untradeable PvP conversion */
const COINS_ITEM_ID = 995;

/** Wilderness boundaries for respawn validation */
const WILDERNESS_MIN_Y = 3520;

/**
 * Pending death state for a player
 */
interface PendingDeath {
    theatre?: {runId:string;roomIndex:number;instanceId:string};
    player: PlayerState;
    context: DeathContext;
    ticksRemaining: number;
    phase: "queued" | "animation" | "complete";
}

export class PlayerDeathService {
    private readonly svc: ServerServices;
    private readonly hookRegistry: DeathHookRegistry;
    private defaultRespawn: RespawnLocation;

    /** Players currently in death animation - maps playerId to death state */
    private readonly pendingDeaths: Map<number, PendingDeath> = new Map();

    constructor(svc: ServerServices) {
        this.svc = svc;
        this.hookRegistry = new DeathHookRegistry({
            log: (level, message) => {
                if (level === "error") logger.error(`[death] ${message}`);
                else if (level === "warn") logger.warn(`[death] ${message}`);
                else logger.info(`[death] ${message}`);
            },
        });
        this.defaultRespawn = DEFAULT_RESPAWN_LOCATIONS.lumbridge;
    }

    /**
     * Check if a player is currently dying (in death animation).
     */
    isDying(player: PlayerState): boolean {
        return this.pendingDeaths.has(player.id);
    }

    /**
     * Start the death sequence for a player.
     * This is called when player HP reaches 0.
     * The death will complete after DEATH_ANIMATION_TICKS.
     */
    startPlayerDeath(
        player: PlayerState,
        options?: {
            killer?: PlayerState;
            deathType?: DeathType;
            customRespawn?: RespawnLocation;
        },
    ): boolean {
        // Skip if already dying
        if (this.pendingDeaths.has(player.id)) {
            return false;
        }

        // ========================================
        // Phase 1: Lock & Capture State
        // ========================================
        // CRITICAL: Lock player FIRST to prevent action queueing exploits
        const raidInstance=this.svc.instancedAreaManager?.get(player.id);
        const store=this.svc.playerPersistence?.theatreRuns;
        const checkpoint=player.raidProgress?.checkpoint;
        const run=checkpoint && store?.load(checkpoint.runId);
        const theatre=run && !run.wiped && run.completedRooms===run.roomIndex &&
            raidInstance?.definitionId===`theatre-of-blood:${run.id}:${run.roomIndex}` &&
            run.roster.includes((player.__saveKey||player.name).trim().toLowerCase())
            ? {runId:run.id,roomIndex:run.roomIndex,instanceId:raidInstance.id}:undefined;
        if(theatre){recordTheatreDeath(run!,player);store!.save(run!);}
        else player.raidProgress?.clear();
        player.lock = LockState.FULL;

        // SECURITY: Snapshot skull and prayer state IMMEDIATELY
        const appearance = player.appearance;
        const wasSkulled =
            appearance?.headIcons?.skull !== undefined && appearance.headIcons.skull >= 0;
        const hadProtectItem = player.prayer.hasPrayerActive("protect_item");

        // Capture death location
        const deathLocation = {
            x: player.tileX,
            y: player.tileY,
            level: player.level,
        };

        // Determine death type
        const wildernessLevel = getWildernessLevel(deathLocation.x, deathLocation.y);
        const deathType =
            options?.deathType ??
            this.determineDeathType(deathLocation, wildernessLevel, options?.killer);

        // Calculate item protection with snapshot state
        const itemProtection = new ItemProtectionCalculator({
            getItemDefinition: (itemId) => getItemDefinition(itemId),
            deathType,
        }).calculate(player, wasSkulled, hadProtectItem);

        // Create immutable death context
        const instance = this.svc.instancedAreaManager?.get(player.id);
        const context: DeathContext = Object.freeze({
            player,
            deathType,
            wasSkulled,
            hadProtectItem,
            deathLocation: Object.freeze(deathLocation),
            wildernessLevel,
            deathTick: this.svc.ticker.currentTick(),
            // Instance teardown, disconnect cleanup, and the six-tick death
            // animation can race. Classification must reflect the moment of
            // death, not whichever manager entry happens to exist later.
            wasInInstance: instance !== undefined,
            instanceGraveLocation: instance?.grave,
            killer: options?.killer ? new WeakRef(options.killer) : undefined,
            itemProtection,
        });

        logger.info(
            `[death] Player death started: ${player.name ?? player.id} at (${deathLocation.x}, ${
                deathLocation.y
            }) - ${deathType}`,
        );

        // ========================================
        // Phase 2: Queue death for next tick
        // ========================================
        // In OSRS, the death animation plays on the tick AFTER HP reaches 0,
        // not the same tick. We queue the death and play animation on first tick().
        this.pendingDeaths.set(player.id, {
            theatre,
            player,
            context,
            ticksRemaining: DEATH_ANIMATION_TICKS,
            phase: "queued",
        });

        return true;
    }

    /**
     * Tick the death system - call this once per game tick.
     * Processes all pending deaths and completes them when animation finishes.
     */
    tick(): void {
        for (const [playerId, death] of this.pendingDeaths) {
            // On the first tick after death is queued, play the animation
            // This ensures the death animation plays on the tick AFTER HP reaches 0 (OSRS behavior)
            if (death.phase === "queued") {
                try {
                    death.player.queueOneShotSeq(DEATH_ANIMATION_ID, 0);
                } catch (err) {
                    logger.warn("Failed to play death animation", err);
                }
                death.phase = "animation";
                continue; // Don't decrement on the same tick we start the animation
            }

            death.ticksRemaining--;

            if (death.ticksRemaining <= 0) {
                this.completePlayerDeath(death);
                this.pendingDeaths.delete(playerId);
            }
        }
        // Includes revived spectators and disconnected sessions still in memory.
        // Fully offline members are settled by account loading before login.
        this.svc.players?.forEachIncludingOrphaned?.((_ws,player)=>{
            if(this.pendingDeaths.has(player.id))return;
            this.settleTheatreWipe(player);
        });
    }

    private settleTheatreWipe(player:PlayerState):boolean {
        const store=this.svc.playerPersistence?.theatreRuns;
        if(!store || !player.raidProgress.checkpoint)return false;
        if(!storeTheatreWipe(player,store,()=>this.svc.playerPersistence.saveSnapshot(player.__saveKey!,player)))return false;
        this.restorePlayerState(player);
        if(!this.svc.instancedAreaManager?.leave(player,THEATRE_OUTSIDE))
            this.svc.movementService.teleportPlayer(player,THEATRE_OUTSIDE.x,THEATRE_OUTSIDE.y,0);
        syncInstanceGravePresentation(this.svc.locationService,player);
        this.svc.appearanceService.refreshAppearanceKits(player);player.markAppearanceDirty();
        this.svc.playerAppearanceManager?.queueAppearanceSnapshot(player);
        const socket=this.svc.players?.getSocketByPlayerId(player.id);
        if(socket)this.svc.inventoryService.sendInventorySnapshot(socket,player);
        this.svc.playerPersistence.saveSnapshot(player.__saveKey!,player);
        return true;
    }

    /**
     * Complete the death sequence after animation.
     */
    private completePlayerDeath(death: PendingDeath): void {
        const { player, context } = death;

        // ========================================
        // Phase 3: Drop Items
        // ========================================
        if (!death.theatre && context.deathType !== DeathType.SAFE) {
            this.processItemsOnDeath(
                player,
                context,
                context.wasInInstance,
            );
        }

        // ========================================
        // Phase 4: Restore Player State
        // ========================================
        this.restorePlayerState(player);

        // Update inventory/equipment display
        const sock = this.svc.players?.getSocketByPlayerId(player.id);
        if (sock) {
            this.svc.inventoryService.sendInventorySnapshot(sock, player);
        }
        this.svc.appearanceService.refreshAppearanceKits(player);
        player.markAppearanceDirty();
        this.svc.playerAppearanceManager?.queueAppearanceSnapshot(player);

        // ========================================
        // Phase 5: Teleport to Respawn
        // ========================================
        if(death.theatre) {
            if(!this.settleTheatreWipe(player)) {
                // A teammate can clear/advance the room during this six-tick
                // animation. Respawn in the party's current room, not its old coordinates.
                const run=this.svc.playerPersistence.theatreRuns?.load(death.theatre.runId);
                const current=this.svc.instancedAreaManager?.get(player.id);
                const same=!!run && current?.definitionId===`theatre-of-blood:${run.id}:${run.roomIndex}`;
                const room=THEATRE_ROOMS[same?run!.roomIndex:death.theatre.roomIndex];
                const respawn=same?room.entrance:THEATRE_OUTSIDE;
                if(!same) {
                    player.raidProgress.disconnected();
                    player.raidProgress.internally(()=>this.svc.instancedAreaManager?.leave(player,THEATRE_OUTSIDE));
                }
                player.raidProgress.internally(()=>this.svc.movementService.teleportPlayer(player,respawn.x,respawn.y,respawn.level));
                this.svc.playerPersistence.saveSnapshot(player.__saveKey!,player);
            }
        } else {
            const respawn = this.validateRespawnLocation(this.defaultRespawn);
            const disposedInstance = this.svc.instancedAreaManager?.dispose(player, respawn) ?? false;
            if (!disposedInstance) this.svc.movementService.teleportPlayer(player, respawn.x, respawn.y, respawn.level);
        }

        // Clear animation
        try {
            player.queueOneShotSeq(-1, 0);
        } catch (err) {
            logger.warn("Failed to clear death animation", err);
        }

        // ========================================
        // Phase 6: Jingle, Message & Unlock
        // ========================================
        // Play death jingle on respawn ("You Are Dead!" jingle)
        this.svc.soundManager?.sendJingle(player, DEATH_JINGLE_ID);

        this.svc.messagingService.queueChatMessage({
            messageType: "game",
            text: "Oh dear, you are dead!",
            targetPlayerIds: [player.id],
        });

        // Unlock player
        player.lock = LockState.NONE;

        logger.info(`[death] Death sequence complete for ${player.name ?? player.id}`);

        // Execute post-death hooks (fire and forget)
        this.hookRegistry.executePostDeathHooks(context).catch(() => {});
    }

    /**
     * Force complete death for a player (used on disconnect).
     */
    forceCompleteDeath(playerId: number): boolean {
        const death = this.pendingDeaths.get(playerId);
        if (!death) return false;
        this.completePlayerDeath(death);
        this.pendingDeaths.delete(playerId);
        return true;
    }

    /**
     * Cancel death for a player (used if death was cancelled by hook).
     */
    cancelDeath(playerId: number): void {
        const death = this.pendingDeaths.get(playerId);
        if (death) {
            death.player.lock = LockState.NONE;
            try {
                death.player.queueOneShotSeq(-1, 0);
            } catch (err) {
                logger.warn("Failed to clear death animation", err);
            }
            this.pendingDeaths.delete(playerId);
        }
    }

    /**
     * Legacy async method - wraps the tick-based approach.
     * @deprecated Use startPlayerDeath() and tick() instead
     */
    async executePlayerDeath(
        player: PlayerState,
        options?: {
            killer?: PlayerState;
            deathType?: DeathType;
            customRespawn?: RespawnLocation;
        },
    ): Promise<boolean> {
        // Start the death sequence
        if (!this.startPlayerDeath(player, options)) {
            return false;
        }

        // Wait for animation to complete (fallback for async usage)
        return new Promise((resolve) => {
            let settled = false;
            let checkInterval: ReturnType<typeof setInterval> | undefined;
            let safetyTimeout: ReturnType<typeof setTimeout> | undefined;
            const finish = (force: boolean): void => {
                if (settled) return;
                settled = true;
                if (checkInterval) clearInterval(checkInterval);
                if (safetyTimeout) clearTimeout(safetyTimeout);
                if (force) this.forceCompleteDeath(player.id);
                resolve(true);
            };

            checkInterval = setInterval(() => {
                if (!this.pendingDeaths.has(player.id)) {
                    finish(false);
                }
            }, 100);

            // Safety timeout - force complete after 10 seconds
            safetyTimeout = setTimeout(() => finish(true), 10000);
        });
    }

    /**
     * Determine death type based on location and context.
     */
    private determineDeathType(
        location: { x: number; y: number; level: number },
        wildernessLevel: number,
        killer?: PlayerState,
    ): DeathType {
        if (killer) {
            return DeathType.PVP;
        }
        if (wildernessLevel > 0) {
            return DeathType.DANGEROUS;
        }
        return DeathType.DANGEROUS;
    }

    /**
     * Process items on death - move kept equipment to inventory, drop lost items to ground.
     */
    private processItemsOnDeath(
        player: PlayerState,
        context: DeathContext,
        storeInInstanceGrave = false,
    ): void {
        const { itemProtection, deathLocation, deathType } = context;
        const currentTick = this.svc.ticker.currentTick();
        const inWilderness = context.wildernessLevel > 0;

        logger.info(
            `[death] Processing ${itemProtection.lost.length} lost items, keeping ${itemProtection.kept.length} items`,
        );

        // Instanced deaths retain lost items at the dedicated reclaim grave.
        // Protected items still follow ordinary OSRS keep-on-death rules.
        if (storeInInstanceGrave) {
            player.instanceGrave.deposit(
                itemProtection.lost.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
                INSTANCE_GRAVE_RECLAIM_COST,
                context.instanceGraveLocation,
            );
            syncInstanceGravePresentation(this.svc.locationService, player);
        }

        // Remove lost items from player
        for (const item of itemProtection.lost) {
            this.removeItemFromPlayer(player, item);
            logger.info(
                `[death] Dropped item ${item.itemId} x${item.quantity} from ${item.source.type}:${item.source.slot}`,
            );

            if (storeInInstanceGrave) continue;

            // Handle untradeable coin conversion in PvP
            let dropItemId = item.itemId;
            let dropQuantity = item.quantity;

            if (deathType === DeathType.PVP && !item.tradeable && item.value > 0) {
                dropItemId = COINS_ITEM_ID;
                dropQuantity = item.value * item.quantity;
            }

            // In wilderness/PvP, items are immediately visible
            const privateTicks = inWilderness || deathType === DeathType.PVP ? 0 : 100;

            // Get killer reference if PvP
            let ownerId: number | undefined;
            if (deathType === DeathType.PVP && context.killer) {
                const killer = context.killer.deref();
                if (killer) {
                    ownerId = killer.id;
                }
            }

            this.svc.groundItems.spawn(
                dropItemId,
                dropQuantity,
                {
                    x: deathLocation.x,
                    y: deathLocation.y,
                    level: deathLocation.level,
                },
                currentTick,
                {
                    ownerId,
                    privateTicks,
                    durationTicks: 300,
                },
            );
        }

        // Remove lost inventory entries before unequipping protected gear. A
        // full inventory commonly becomes sparse as part of this same death;
        // moving kept equipment first could otherwise find no slot and delete
        // the protected item. The transfer itself is all-or-nothing and leaves
        // the equipment in place if an unusual all-kept inventory is still full.
        for (const item of itemProtection.kept) {
            if (item.source.type !== ItemSourceType.Equipment) continue;
            if (this.moveEquipmentToInventory(player, item)) {
                logger.info(
                    `[death] Moved kept item ${item.itemId} x${item.quantity} from equipment:${item.source.slot} to inventory`,
                );
            } else {
                logger.warn(
                    `[death] Retained protected item ${item.itemId} x${item.quantity} in equipment:${item.source.slot} because inventory insertion was unavailable`,
                );
            }
        }
    }

    /**
     * Remove an item from player inventory or equipment.
     */
    private removeItemFromPlayer(player: PlayerState, item: ValuedItem): void {
        if (item.source.type === ItemSourceType.Inventory) {
            const inventory = player.getInventoryEntries();
            const entry = inventory[item.source.slot];
            if (entry && entry.itemId === item.itemId) {
                entry.itemId = -1;
                entry.quantity = 0;
            }
            player.markInventoryDirty();
        } else {
            this.removeEquipmentSlot(player, item.source.slot);
            player.markEquipmentDirty();
        }
    }

    /**
     * Remove equipment from a specific slot.
     */
    private removeEquipmentSlot(player: PlayerState, slot: number): void {
        const appearance = player.appearance;
        if (!appearance) return;

        const equip = appearance.equip;
        const equipQty = appearance.equipQty;

        if (Array.isArray(equip) && slot < equip.length) {
            equip[slot] = -1;
        }
        if (Array.isArray(equipQty) && slot < equipQty.length) {
            equipQty[slot] = 0;
        }
    }

    /**
     * Move an equipment item to inventory (for kept items on death).
     */
    private moveEquipmentToInventory(player: PlayerState, item: ValuedItem): boolean {
        if (item.source.type !== ItemSourceType.Equipment) return false;

        // Insert first, then remove the source. This transaction ordering makes
        // protected equipment loss impossible even if the inventory cannot
        // accept the complete stack (for example capped ammunition).
        const insertion = player.items.addItem(item.itemId, item.quantity, {
            assureFullInsertion: true,
        });
        if (insertion.completed !== item.quantity) return false;

        this.removeEquipmentSlot(player, item.source.slot);
        player.markEquipmentDirty();
        return true;
    }

    /**
     * Restore player state after death.
     */
    private restorePlayerState(player: PlayerState): void {
        // Clear all prayers
        player.prayer.clearActivePrayers();

        // Clear death-related timers (stuns, freezes, etc.)
        player.timers.clearOnDeath();

        // Restore HP to max
        const maxHp = player.skillSystem.getHitpointsMax();
        player.skillSystem.setHitpointsCurrent(maxHp);

        // Reset all skill boosts/drains to base level (OSRS behavior)
        // This includes prayer points, stat drains from monsters, and potion boosts
        for (const skillId of SKILL_IDS) {
            if (skillId === SkillId.Hitpoints) continue; // HP handled separately above
            const skill = player.skillSystem.getSkill(skillId);
            player.skillSystem.setSkillBoost(skillId, skill.baseLevel);
        }

        // Restore run energy to 100% (OSRS behavior)
        player.energy.setRunEnergyUnits(RUN_ENERGY_MAX);

        // Clear poison/venom/disease effects
        player.skillSystem.curePoison();
        player.skillSystem.cureVenom();
        player.skillSystem.cureDisease();

        // Reset special attack energy to 100%
        player.specEnergy.setPercent(1000);
        player.combatAttributes.set(CombatAttributes.POWER_OF_DEATH_UNTIL_CLOCK, 0);

        // Clear any queued actions
        player.interruptQueues();

        // Clear all combat and interaction state so the player does not auto-re-engage
        try {
            const sock = this.svc.players?.getSocketByPlayerId(player.id);
            if (sock) {
                this.svc.players?.clearAllInteractions(sock);
            }
        } catch (err) {
            logger.warn("[death] failed to clear combat", err);
        }
        try {
            player.resetInteractions();
        } catch (err) {
            logger.warn("[death] failed to reset interactions", err);
        }
        try {
            player.clearInteraction();
        } catch (err) {
            logger.warn("[death] failed to clear interaction", err);
        }
        try {
            player.clearPath();
        } catch (err) {
            logger.warn("[death] failed to clear path", err);
        }
        // Clear any NPCs that are still targeting this player
        try {
            const nowTick = this.svc.ticker.currentTick();
            this.svc.npcManager?.forEach((npc) => {
                try {
                    if (npc.getCombatTargetPlayerId() === player.id) {
                        npc.disengageCombat();
                        npc.scheduleNextAggressionCheck(nowTick, 10);
                    }
                } catch (err) {
                    logger.warn("Failed to clear NPC combat target for player", err);
                }
            });
        } catch (err) {
            logger.warn("[death] failed to clear npc targets", err);
        }
    }

    /**
     * Validate respawn location - prevent wilderness respawns.
     */
    private validateRespawnLocation(location: RespawnLocation): RespawnLocation {
        if (location.y >= WILDERNESS_MIN_Y && isInWilderness(location.x, location.y)) {
            logger.warn(
                `[death] Invalid respawn location in wilderness: (${location.x}, ${location.y})`,
            );
            return this.defaultRespawn;
        }

        if (location.x < 0 || location.y < 0 || location.level < 0 || location.level > 3) {
            logger.warn(
                `[death] Invalid respawn location out of bounds: (${location.x}, ${location.y}, ${location.level})`,
            );
            return this.defaultRespawn;
        }

        return location;
    }

    /**
     * Get the hook registry for registering custom hooks.
     */
    getHookRegistry(): DeathHookRegistry {
        return this.hookRegistry;
    }

    /**
     * Set a custom default respawn location.
     */
    setDefaultRespawn(location: RespawnLocation): void {
        this.defaultRespawn = this.validateRespawnLocation(location);
    }
}
