
import {
    getClientCycle
} from "@client/core/network/ServerConnection";
import type { PlayerSpotAnimationEvent } from "@client/engine/game/sync/PlayerSyncTypes";
import type { HitsplatEventPayload } from "@client/engine/rendering/core/GameRenderer";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function registerNpcHealthBarUpdate(host: WebGLOsrsRendererHost, event: {
        serverId: number;
        bar: {
            id: number;
            cycle: number;
            health: number;
            health2: number;
            cycleOffset: number;
            removed?: boolean;
        };
    }): void {

        const serverId = event.serverId | 0;
        if (serverId <= 0) return;
        const bar = event.bar;
        const defId = bar.id | 0;
        const actor = host.npcHealthBars.get(serverId);
        if (bar.removed === true) {
            if (!actor) return;
            host.actorRemoveHealthBar(actor, defId);
            if (actor.bars.length === 0) host.npcHealthBars.delete(serverId);
            return;
        }

        const state = actor ?? host.ensureActorHealthBars(host.npcHealthBars, serverId);
        host.actorAddHealthBar(state, defId, {
            cycle: bar.cycle | 0,
            health: bar.health | 0,
            health2: bar.health2 | 0,
            cycleOffset: bar.cycleOffset | 0,
        });
    
}

export function clearNpcHealthBars(host: WebGLOsrsRendererHost, serverId: number): void {

        host.npcHealthBars.delete(serverId | 0);
    
}

export function clearPlayerHealthBars(host: WebGLOsrsRendererHost, serverId: number): void {

        host.playerHealthBars.delete(serverId | 0);
    
}

export function registerHitsplat(host: WebGLOsrsRendererHost, event: HitsplatEventPayload): void {

        // Use CLIENT CYCLES (20ms each) for hitsplat timing.
        // Client.cycle in OSRS is a client-side counter incrementing every 20ms.
        const clientCycle = getClientCycle() | 0;

        // `delayCycles` is already in client-cycle units (see Actor.addHitSplat var6).
        const delayCycles =
            typeof event.delayCycles === "number" ? Math.max(0, event.delayCycles | 0) : 0;

        // Preserve raw value parity (`-1` is meaningful for sentinel no-type hitsplats).
        const damage = event.damage | 0;
        const type = typeof event.style === "number" ? event.style | 0 : -1;
        const type2 = typeof event.type2 === "number" ? event.type2 | 0 : -1;
        const damage2 = typeof event.damage2 === "number" ? event.damage2 | 0 : -1;
        const targetId = event.targetId | 0;
        if (event.targetType === "player") {
            if (targetId > 0) {
                const controlledId = host.osrsClient.controlledPlayerServerId | 0;
                if (controlledId <= 0) {
                    host.pendingControlledPlayerServerId = targetId;
                } else if (host.pendingControlledPlayerServerId !== undefined) {
                    host.pendingControlledPlayerServerId = undefined;
                }
            }
            const state = host.ensureHitsplatState(host.playerHitsplats, targetId);
            host.addHitSplatOsrs(state, type, damage, type2, damage2, clientCycle, delayCycles);
        } else {
            const state = host.ensureHitsplatState(host.npcHitsplats, targetId);
            host.addHitSplatOsrs(state, type, damage, type2, damage2, clientCycle, delayCycles);
        }
        // Use client cycle for trim operations too
        host.trimHitsplats(clientCycle);
        host.trimHealthBars(clientCycle);
    
}

export function registerSpotAnimation(host: WebGLOsrsRendererHost, event: PlayerSpotAnimationEvent): void {

        try {
            const sid = event.serverId | 0;
            const spotId = event.spotId | 0;
            if (spotId < 0) {
                host.gfxManager?.clearAttachedSlotPlayer(
                    sid,
                    typeof event.slot === "number" ? (event.slot | 0) & 0xff : 0,
                );
                return;
            }
            const heightUnits = (event.height ?? 0) | 0;
            const offsetTiles = heightUnits / 128;
            host.gfxManager?.spawnAttachedToPlayer(
                spotId,
                sid,
                offsetTiles !== 0 ? "offset" : "ground",
                offsetTiles !== 0 ? offsetTiles : undefined,
                false,
                event.startCycle | 0,
                typeof event.slot === "number" ? (event.slot | 0) & 0xff : undefined,
            );
        } catch (err) {
            console.warn("[renderer] registerSpotAnimation error", err);
        }
    
}

export function registerNpcSpotAnimation(host: WebGLOsrsRendererHost, event: {
        npcServerId: number;
        spotId: number;
        height: number;
        startCycle: number;
        slot?: number;
    }): void {

        try {
            const sid = event.npcServerId | 0;
            const spotId = event.spotId | 0;
            const slot = typeof event.slot === "number" ? (event.slot | 0) & 0xff : 0;
            if (spotId < 0) {
                host.gfxManager?.clearAttachedSlotNpc(sid, slot);
                return;
            }
            const heightUnits = (event.height ?? 0) | 0;
            const offsetTiles = heightUnits / 128;
            host.gfxManager?.spawnAttachedToNpc(
                spotId,
                sid,
                offsetTiles !== 0 ? "offset" : "ground",
                offsetTiles !== 0 ? offsetTiles : undefined,
                false,
                event.startCycle | 0,
                slot,
            );
        } catch (err) {
            console.warn("[renderer] registerNpcSpotAnimation error", err);
        }
    
}

export function registerWorldSpotAnimation(host: WebGLOsrsRendererHost, event: {
        spotId: number;
        durationCycles?: number;
        tile: { x: number; y: number; level?: number };
        height?: number;
        startCycle: number;
    }): void {

        try {
            const heightUnits = Number(event.height ?? 0) | 0;
            const heightTiles = heightUnits !== 0 ? heightUnits / 128 : undefined;
            host.gfxManager?.spawnAtTile(
                event.spotId | 0,
                {
                    x: event.tile.x | 0,
                    y: event.tile.y | 0,
                    level: event.tile.level ?? 0,
                },
                {
                    heightTiles,
                    startCycle: event.startCycle | 0,
                    durationCycles: event.durationCycles,
                },
            );
        } catch (err) {
            console.warn("[renderer] registerWorldSpotAnimation error", err);
        }
    
}

export function resolvePlayerIdleSeqMaxId(host: WebGLOsrsRendererHost, ): number {

        if (host.playerIdleSeqMaxId >= 0) return host.playerIdleSeqMaxId;
        const fallbackMax = 12000;
        let maxId = fallbackMax;
        try {
            const loader = host.osrsClient.seqTypeLoader;
            const count = loader?.getCount?.();
            if (typeof count === "number" && count > 0) {
                maxId = Math.max(0, (count | 0) - 1);
            }
        } catch {}
        host.playerIdleSeqMaxId = maxId;
        return maxId;
    
}

export function ensureActorTileSelectionForFrame(host: WebGLOsrsRendererHost, ): void {

        host.resetActorTileSelectionFrameIfNeeded();
        if (host.frameActorTileSelectionBuilt) {
            return;
        }

        host.frameActorTileSelectionBuilt = true;

        const pe = host.osrsClient.playerEcs;
        const renderSelf = host.osrsClient.renderSelf !== false;
        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        const controlledPid =
            controlledServerId > 0 ? pe.getIndexForServerId(controlledServerId) : undefined;

        if (
            renderSelf &&
            controlledPid !== undefined &&
            host.isPlayerSceneTileMarkerCandidate(controlledPid | 0)
        ) {
            host.registerPlayerSceneTileCandidate(controlledPid | 0, Number.MAX_SAFE_INTEGER);
        }

        const combatTargetPid = host.getCombatTargetPlayerEcsIndex();
        if (
            combatTargetPid !== undefined &&
            (combatTargetPid | 0) !== (controlledPid ?? -1) &&
            host.isPlayerSceneTileMarkerCandidate(combatTargetPid | 0)
        ) {
            host.registerPlayerSceneTileCandidate(
                combatTargetPid | 0,
                pe.getRenderPidPriority(combatTargetPid),
            );
        }

        const activeServerIds = Array.from(pe.getAllServerIds()).sort((a, b) => a - b);
        for (const serverId of activeServerIds) {
            const pid = pe.getIndexForServerId(serverId | 0);
            if (pid === undefined) {
                continue;
            }
            if (controlledPid !== undefined && (pid | 0) === (controlledPid | 0)) {
                continue;
            }
            if (combatTargetPid !== undefined && (pid | 0) === (combatTargetPid | 0)) {
                continue;
            }
            if (!host.isPlayerSceneTileMarkerCandidate(pid | 0)) {
                continue;
            }

            // A third observer sees only the highest-PID player at an exact
            // overlap. The controlled player is registered above with a
            // larger local-only priority and therefore always sees themself.
            host.registerPlayerSceneTileCandidate(pid | 0, pe.getRenderPidPriority(pid));
        }
    
}
