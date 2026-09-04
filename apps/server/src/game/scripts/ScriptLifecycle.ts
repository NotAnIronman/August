import type { EventSubscription } from "@server/game/events/GameEventBus";
import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";

export interface PlayerLifecycleCleanup {
    /** Release state owned by one permanently-disconnected player. */
    player(playerId: number): void;
    /** Release all state owned by this provider during reset or hot reload. */
    reset(): void;
}

export interface PlayerScopedCollection {
    delete(playerId: number): unknown;
    clear(): unknown;
}

/**
 * Remove a cached NPC reference only while it still belongs to that player.
 * Runtime NPC ids wrap and may eventually be reused, so cleanup must never
 * trust a long-lived numeric id by itself.
 */
export function removeTrackedPlayerNpc(
    services: ScriptServices,
    playerId: number,
    npcId: number | undefined,
): boolean {
    if (npcId === undefined) return false;
    const npc = services.combat.getNpc(npcId);
    if (!npc || npc.ownerPlayerId !== playerId) return false;
    return services.npc.removeNpc(npcId);
}

/** Attach an event subscription to the current script provider. */
export function registerEventSubscription(
    registry: IScriptRegistry,
    subscription: EventSubscription,
): void {
    registry.registerCleanup(() => subscription.unsubscribe());
}

/**
 * Binds player-owned content state to both player and provider lifecycles.
 *
 * The event subscription is itself provider-owned, so a hot reload cannot
 * retain old callbacks. Cleanup registration is idempotent and also runs if a
 * provider throws part-way through registration.
 */
export function registerPlayerLifecycleCleanup(
    registry: IScriptRegistry,
    services: ScriptServices | undefined,
    cleanup: PlayerLifecycleCleanup,
): void {
    // A few lightweight registration fixtures intentionally implement only
    // the handler methods they exercise. Do not create a subscription unless
    // that registry can also own and release it.
    if (typeof registry?.registerCleanup !== "function") return;

    let subscription: EventSubscription | undefined;
    subscription = services?.system?.eventBus?.on("player:logout", ({ playerId }) => {
        cleanup.player(playerId);
    });

    registry.registerCleanup(() => {
        subscription?.unsubscribe();
        subscription = undefined;
        cleanup.reset();
    });
}

/** Bind one or more Map/Set-like player-id collections to script lifecycle. */
export function registerPlayerScopedCollections(
    registry: IScriptRegistry,
    services: ScriptServices | undefined,
    ...collections: readonly PlayerScopedCollection[]
): void {
    registerPlayerLifecycleCleanup(registry, services, {
        player: (playerId) => {
            for (const collection of collections) collection.delete(playerId);
        },
        reset: () => {
            for (const collection of collections) collection.clear();
        },
    });
}

/**
 * Bind active chatbox dialogs to player and provider lifecycles.
 *
 * Disconnect cleanup deliberately avoids writing to a closed transport; the
 * dialog engine performs its own per-player disconnect cleanup. Provider reset
 * closes still-connected players' dialogs so callbacks from an unloaded script
 * cannot remain reachable and execute after hot reload.
 */
export function registerPlayerDialogSessions(
    registry: IScriptRegistry,
    services: ScriptServices | undefined,
    sessions: Map<number, PlayerState>,
): void {
    registerPlayerLifecycleCleanup(registry, services, {
        player: (playerId) => sessions.delete(playerId),
        reset: () => {
            const activePlayers = [...sessions.values()];
            sessions.clear();
            for (const player of activePlayers) {
                try {
                    services?.dialog?.closeDialog?.(player);
                } catch (error) {
                    services?.system?.logger?.warn?.(
                        `[script] failed to close dialog during provider cleanup for player=${player.id}`,
                        error,
                    );
                }
            }
        },
    });
}
