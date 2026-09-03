import { performance } from "perf_hooks";

import { upsertNpcUpdateDelta } from "@server/network/NpcExternalSync";
import { logger } from "@server/observability/logger";
import type { ServerServices } from "@server/game/ServerServices";
import type { PlayerState } from "@server/game/player";
import { buildPlayerSaveKey } from "@server/game/state/PlayerSessionKeys";
import type { TickFrame } from "@server/game/tick/TickPhaseOrchestrator";

export const DEFAULT_AUTOSAVE_BATCH_SIZE = 16;

export interface TickFrameServiceOptions {
    /**
     * Maximum players serialized and committed without yielding. Each batch is
     * its own SQLite transaction, keeping regular autosaves below a game-tick
     * sized event-loop stall even when banks are large.
     */
    autosaveBatchSize?: number;
    /** Injectable scheduler used by focused tests. */
    yieldControl?: () => Promise<void>;
}

export class TickFrameService {
    private autosaveIntervalTicks: number;
    private nextAutosaveTick: number;
    private autosaveRunning = false;
    private autosaveOperation: Promise<void> | undefined;
    private scheduledAutosave: NodeJS.Immediate | undefined;
    private autosavesAccepting = true;
    private shutdownFlush: Promise<void> | undefined;
    private readonly autosaveBatchSize: number;
    private readonly autosaveYieldControl: () => Promise<void>;

    constructor(
        private readonly svc: ServerServices,
        autosaveIntervalTicks: number,
        options: TickFrameServiceOptions = {},
    ) {
        this.autosaveIntervalTicks = autosaveIntervalTicks;
        this.nextAutosaveTick =
            autosaveIntervalTicks > 0 ? autosaveIntervalTicks : Number.MAX_SAFE_INTEGER;
        this.autosaveBatchSize = Math.max(
            1,
            Math.min(
                256,
                Math.trunc(options.autosaveBatchSize ?? DEFAULT_AUTOSAVE_BATCH_SIZE),
            ),
        );
        this.autosaveYieldControl =
            options.yieldControl ??
            (() =>
                new Promise<void>((resolve) => {
                    setImmediate(resolve);
                }));
    }

    async handleTick(data: { tick: number; time: number }): Promise<void> {
        const orchestrator = this.svc.tickOrchestrator;
        if (orchestrator) {
            await orchestrator.processTick(data.tick, data.time);
        }
    }

    createTickFrame(data: { tick: number; time: number }): TickFrame {
        const npcUpdates = this.svc.pendingNpcUpdates;
        const npcPackets = new Map(this.svc.pendingNpcPackets);
        const projectilePackets = this.svc.projectileSystem?.drainPendingPackets() ?? new Map();
        this.svc.pendingNpcPackets.clear();
        this.svc.pendingNpcUpdates = [];

        const scheduler = this.svc.broadcastScheduler;
        const widgetEvents = scheduler.drainWidgetEvents();
        const notifications = scheduler.drainNotifications();
        const keyedMessages = scheduler.drainAllKeyedMessages();
        const locChanges = scheduler.drainLocChanges();
        const chatMessages = scheduler.drainChatMessages();
        const inventorySnapshots = scheduler.drainInventorySnapshots();
        const gamemodeSnapshots = scheduler.drainGamemodeSnapshots();
        const appearanceSnapshots = scheduler.drainAppearanceSnapshots();
        const skillSnapshots = scheduler.drainSkillSnapshots();
        const combatSnapshots = scheduler.drainCombatSnapshots();
        const runEnergySnapshots = scheduler.drainRunEnergySnapshots();
        const animSnapshots = scheduler.drainAnimSnapshots();
        const spellResults = scheduler.drainSpellResults();
        const hitsplats = scheduler.drainHitsplats();
        const forcedChats = scheduler.drainForcedChats();
        const forcedMovements = scheduler.drainForcedMovements();
        const spotAnimations = scheduler.drainSpotAnimations();
        const locAnimations = scheduler.drainLocAnimations();
        const varps = scheduler.drainVarps();
        const varbits = scheduler.drainVarbits();
        const clientScripts = scheduler.drainClientScripts();

        return {
            tick: data.tick,
            time: data.time,
            npcUpdates,
            npcEffectEvents: [],
            playerSteps: new Map(),
            hitsplats,
            forcedChats,
            forcedMovements,
            pendingSequences: new Map(),
            actionEffects: [],
            interactionIndices: new Map(),
            pendingFaceDirs: new Map(),
            playerViews: new Map(),
            npcViews: new Map(),
            widgetEvents,
            notifications,
            keyedMessages,
            locChanges,
            chatMessages,
            inventorySnapshots,
            gamemodeSnapshots,
            appearanceSnapshots,
            skillSnapshots,
            combatSnapshots,
            runEnergySnapshots,
            animSnapshots,
            npcPackets,
            projectilePackets,
            spotAnimations,
            locAnimations,
            spellResults,
            varps,
            varbits,
            clientScripts,
            colorOverrides: new Map(),
            npcColorOverrides: new Map(),
        };
    }

    restorePendingFrame(frame: TickFrame): void {
        if (frame.npcUpdates.length > 0) {
            const pendingNpcUpdates = this.svc.pendingNpcUpdates;
            for (const update of frame.npcUpdates) {
                upsertNpcUpdateDelta(pendingNpcUpdates, update);
            }
        }
        if (frame.npcPackets.size > 0) {
            const pendingNpcPackets = this.svc.pendingNpcPackets;
            for (const [playerId, packet] of frame.npcPackets.entries()) {
                const existing = pendingNpcPackets.get(playerId);
                if (existing) {
                    existing.snapshots.push(...packet.snapshots);
                    existing.updates.push(...packet.updates);
                    existing.despawns.push(...packet.despawns);
                } else {
                    pendingNpcPackets.set(playerId, packet);
                }
            }
        }
        const projectilePackets = frame.projectilePackets ?? new Map();
        if (projectilePackets.size > 0) {
            this.svc.projectileSystem?.restorePackets(projectilePackets);
        }

        const scheduler = this.svc.broadcastScheduler;
        if (frame.widgetEvents.length > 0) {
            scheduler.restoreWidgetEvents(frame.widgetEvents);
        }
        if (frame.notifications.length > 0) {
            scheduler.restoreNotifications(frame.notifications);
        }
        if (frame.keyedMessages.size > 0) {
            scheduler.restoreAllKeyedMessages(frame.keyedMessages);
        }
        if (frame.locChanges.length > 0) {
            scheduler.restoreLocChanges(frame.locChanges);
        }
        if (frame.chatMessages.length > 0) {
            scheduler.restoreChatMessages(frame.chatMessages);
        }
        if (frame.inventorySnapshots.length > 0) {
            scheduler.restoreInventorySnapshots(frame.inventorySnapshots);
        }
        if (frame.gamemodeSnapshots.size > 0) {
            scheduler.restoreGamemodeSnapshots(frame.gamemodeSnapshots);
        }
        if (frame.varps && frame.varps.length > 0) {
            scheduler.restoreVarps(frame.varps);
        }
        if (frame.varbits && frame.varbits.length > 0) {
            scheduler.restoreVarbits(frame.varbits);
        }
        if (frame.appearanceSnapshots.length > 0) {
            scheduler.restoreAppearanceSnapshots(frame.appearanceSnapshots);
        }
        if (frame.skillSnapshots.length > 0) {
            scheduler.restoreSkillSnapshots(frame.skillSnapshots);
        }
        if (frame.combatSnapshots.length > 0) {
            scheduler.restoreCombatSnapshots(frame.combatSnapshots);
        }
        if (frame.runEnergySnapshots.length > 0) {
            scheduler.restoreRunEnergySnapshots(frame.runEnergySnapshots);
        }
        if (frame.animSnapshots.length > 0) {
            scheduler.restoreAnimSnapshots(frame.animSnapshots);
        }
        if (frame.spellResults.length > 0) {
            scheduler.restoreSpellResults(frame.spellResults);
        }
        if (frame.hitsplats.length > 0) {
            scheduler.restoreHitsplats(frame.hitsplats);
        }
        if (frame.forcedChats.length > 0) {
            scheduler.restoreForcedChats(frame.forcedChats);
        }
        if (frame.forcedMovements.length > 0) {
            scheduler.restoreForcedMovements(frame.forcedMovements);
        }
        if (frame.spotAnimations.length > 0) {
            scheduler.restoreSpotAnimations(frame.spotAnimations);
        }
        if (frame.locAnimations.length > 0) {
            scheduler.restoreLocAnimations(frame.locAnimations);
        }
    }

    maybeRunAutosave(frame: TickFrame): void {
        if (!this.autosavesAccepting) return;
        if (this.autosaveIntervalTicks <= 0) return;
        if (this.autosaveRunning) return;
        if (frame.tick < this.nextAutosaveTick) return;
        this.nextAutosaveTick = frame.tick + this.autosaveIntervalTicks;
        this.autosaveRunning = true;
        this.scheduleAutosaveAttempt(frame.tick);
    }

    private scheduleAutosaveAttempt(triggerTick: number): void {
        if (!this.autosavesAccepting) {
            this.autosaveRunning = false;
            return;
        }
        if (this.scheduledAutosave !== undefined) return;
        this.scheduledAutosave = setImmediate(() => {
            this.scheduledAutosave = undefined;
            this.tryRunAutosave(triggerTick);
        });
    }

    private tryRunAutosave(triggerTick: number): void {
        if (!this.autosavesAccepting) {
            this.autosaveRunning = false;
            return;
        }
        // During catch-up the next tick may already be mid-flight when this
        // immediate fires; defer until the server is between ticks so the save
        // observes end-of-tick state and adds no latency inside a tick.
        if (this.svc.activeFrame) {
            this.scheduleAutosaveAttempt(triggerTick);
            return;
        }
        this.runAutosave(triggerTick)
            .catch((err) => {
                logger.warn(`[autosave] tick=${triggerTick} failed`, err);
            })
            .finally(() => {
                this.autosaveRunning = false;
            });
    }

    runAutosave(triggerTick: number): Promise<void> {
        if (!this.autosavesAccepting) {
            return this.shutdownFlush ?? this.autosaveOperation ?? Promise.resolve();
        }
        return this.enqueueAutosave(triggerTick);
    }

    /**
     * Stops scheduling regular saves, drains any save already in progress, and
     * performs one final complete pass. Once this resolves, no deferred
     * autosave callback can begin another database write.
     */
    shutdownAndFlush(triggerTick: number): Promise<void> {
        if (this.shutdownFlush) return this.shutdownFlush;

        this.autosavesAccepting = false;
        if (this.scheduledAutosave !== undefined) {
            clearImmediate(this.scheduledAutosave);
            this.scheduledAutosave = undefined;
            this.autosaveRunning = false;
        }

        this.shutdownFlush = this.enqueueAutosave(triggerTick);
        return this.shutdownFlush;
    }

    private enqueueAutosave(triggerTick: number): Promise<void> {
        // Shutdown can request a final flush while a regular batched autosave is
        // still yielding. Serialize complete save passes so SQLite transactions
        // never overlap and the final pass always observes the newest state.
        const previous = this.autosaveOperation?.catch(() => undefined) ?? Promise.resolve();
        const operation = previous.then(() => this.performAutosave(triggerTick));
        this.autosaveOperation = operation;
        return operation.finally(() => {
            if (this.autosaveOperation === operation) {
                this.autosaveOperation = undefined;
            }
        });
    }

    private async performAutosave(triggerTick: number): Promise<void> {
        const players = this.svc.players;
        if (!players) return;
        const entries: Array<{ key: string; player: PlayerState }> = [];
        players.forEach((_ws, player) => {
            const key = player.__saveKey ?? buildPlayerSaveKey(player.name, player.id);
            if (key && key.length > 0) {
                entries.push({ key, player });
            }
        });
        if (entries.length === 0) return;
        const started = performance.now();

        let savedPlayers = 0;
        let stalePlayers = 0;
        for (let offset = 0; offset < entries.length; offset += this.autosaveBatchSize) {
            if (offset > 0) {
                await this.waitForAutosaveWindow();
            }

            // A player can disconnect and their protocol ID can be reused while
            // a multi-batch autosave is yielding. Never let the older PlayerState
            // overwrite the newer session (the disconnect path already persisted
            // the old state synchronously).
            const batch = entries
                .slice(offset, offset + this.autosaveBatchSize)
                .filter(({ player }) => {
                    const current = players.getPlayerById(player.id);
                    if (current === player) return true;
                    stalePlayers++;
                    return false;
                });
            if (batch.length === 0) continue;

            try {
                this.svc.playerPersistence.savePlayers(batch);
                savedPlayers += batch.length;
            } catch (cause) {
                throw new Error(
                    `Autosave failed after ${savedPlayers}/${entries.length} player(s) at tick ${triggerTick}`,
                    { cause },
                );
            }
        }

        const elapsed = performance.now() - started;
        logger.info(
            `[autosave] tick=${triggerTick} saved ${savedPlayers} player(s) in ${elapsed.toFixed(1)}ms across ${Math.ceil(
                entries.length / this.autosaveBatchSize,
            )} batch(es)${stalePlayers > 0 ? `; skipped ${stalePlayers} stale session(s)` : ""}`,
        );
    }

    private async waitForAutosaveWindow(): Promise<void> {
        do {
            await this.autosaveYieldControl();
        } while (this.svc.activeFrame !== undefined);
    }

    async yieldToEventLoop(stage: string): Promise<void> {
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        this.svc.networkLayer.flushDirectSendWarnings(stage);
    }
}
