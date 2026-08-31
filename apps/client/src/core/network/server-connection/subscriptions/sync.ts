import { state } from "@client/core/network/server-connection/state";
import type { NpcInfoPayload, SpellResultPayload } from "@client/core/network/server-connection/types/index";
import type { PlayerSyncFrame } from "@client/engine/game/sync/PlayerSyncTypes";
import type { ProjectileLaunch } from "@august/protocol/projectiles/ProjectileLaunch";
import type {
    RebuildNormalPayload,
    RebuildRegionPayload,
    RebuildWorldEntityPayload,
    WorldEntityInfoPayload,
} from "@client/core/network/server-connection/types/sync";

export function subscribeServerPath(
    fn: (waypoints: { x: number; y: number }[] | undefined) => void,
): () => void {
    state.pathDebugListeners.add(fn);
    return () => state.pathDebugListeners.delete(fn);
}
export function getLastServerPath(): { x: number; y: number }[] | undefined {
    return state.lastServerPath ? state.lastServerPath.slice() : undefined;
}

export function subscribeRebuildRegion(fn: (payload: RebuildRegionPayload) => void): () => void {
    state.rebuildRegionListeners.add(fn);
    return () => state.rebuildRegionListeners.delete(fn);
}

export function subscribeRebuildNormal(fn: (payload: RebuildNormalPayload) => void): () => void {
    state.rebuildNormalListeners.add(fn);
    return () => state.rebuildNormalListeners.delete(fn);
}

export function subscribeRebuildWorldEntity(
    fn: (payload: RebuildWorldEntityPayload) => void,
): () => void {
    state.rebuildWorldEntityListeners.add(fn);
    return () => state.rebuildWorldEntityListeners.delete(fn);
}

export function subscribeWorldEntityInfo(fn: (payload: WorldEntityInfoPayload) => void): () => void {
    state.worldEntityInfoListeners.add(fn);
    return () => state.worldEntityInfoListeners.delete(fn);
}

export function subscribeDevAreaPreview(
    fn: (payload: {
        mode: "point" | "perimeter" | "clear";
        level?: number;
        tiles?: { x: number; y: number }[];
    }) => void,
): () => void {
    state.devAreaPreviewListeners.add(fn);
    return () => state.devAreaPreviewListeners.delete(fn);
}

export function subscribePlayerSync(cb: (frame: PlayerSyncFrame) => void): () => void {
    state.playerSyncListeners.add(cb);
    return () => state.playerSyncListeners.delete(cb);
}

export function subscribeNpcInfo(cb: (payload: NpcInfoPayload) => void): () => void {
    state.npcInfoListeners.add(cb);
    return () => state.npcInfoListeners.delete(cb);
}

export function subscribeSpellResults(cb: (payload: SpellResultPayload) => void): () => void {
    state.spellResultListeners.add(cb);
    if (state.lastSpellResult) {
        try {
            cb({
                ...state.lastSpellResult,
                runesConsumed: state.lastSpellResult.runesConsumed
                    ? state.lastSpellResult.runesConsumed.map((entry) => ({ ...entry }))
                    : undefined,
                runesRefunded: state.lastSpellResult.runesRefunded
                    ? state.lastSpellResult.runesRefunded.map((entry) => ({ ...entry }))
                    : undefined,
                tile: state.lastSpellResult.tile ? { ...state.lastSpellResult.tile } : undefined,
                modifiers: state.lastSpellResult.modifiers
                    ? { ...state.lastSpellResult.modifiers }
                    : undefined,
            });
        } catch {}
    }
    return () => state.spellResultListeners.delete(cb);
}

export function subscribeProjectiles(cb: (spawn: ProjectileLaunch) => void): () => void {
    state.projectileListeners.add(cb);
    return () => state.projectileListeners.delete(cb);
}
