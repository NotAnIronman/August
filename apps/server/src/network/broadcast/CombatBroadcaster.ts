import type { WebSocket } from "ws";

import type { TickFrame } from "@server/game/tick/TickPhaseOrchestrator";
import { encodeMessage } from "@server/network/messages";
import type { BroadcastContext, BroadcastDomain } from "@server/network/broadcast/BroadcastDomain";

const TILE_SPOT_BROADCAST_RADIUS_TILES = 17;

export interface CombatBroadcasterServices {
    forEachPlayer(fn: (sock: WebSocket, player: { id: number; worldViewId?: number; tileX?: number; tileY?: number; level?: number }) => void): void;
    withDirectSendBypass<T>(context: string, fn: () => T): T;
    enableBinaryNpcSync?: boolean;
}

/**
 * Broadcasts combat-related packets: hitsplats, NPC effect events,
 * spot animations, and combat state snapshots.
 */
export class CombatBroadcaster implements BroadcastDomain {
    constructor(private readonly services: CombatBroadcasterServices) {}

    flush(frame: TickFrame, ctx: BroadcastContext): void {
        this.flushSpotAnimations(frame, ctx);
        this.flushCombatSnapshots(frame, ctx);
    }

    private flushSpotAnimations(frame: TickFrame, ctx: BroadcastContext): void {
        if (!frame.spotAnimations || frame.spotAnimations.length === 0) return;

        for (const event of frame.spotAnimations) {
            if (!(event && event.spotId >= 0)) continue;
            // Player spot animations are encoded as update blocks. NPC spot animations are encoded
            // there too when binary NPC sync is active; tile graphics use a nearby zone broadcast.
            if (event.playerId !== undefined) continue;
            if (this.services.enableBinaryNpcSync && event.npcId !== undefined) {
                continue;
            }
            const payload: {
                spotId: number;
                durationCycles?: number;
                playerId?: number;
                npcId?: number;
                height?: number;
                delay?: number;
                tile?: { x: number; y: number; level?: number };
            } = {
                spotId: event.spotId,
            };
            if(event.durationTicks!==undefined)payload.durationCycles=Math.max(0,Math.min(65535,Math.round(event.durationTicks*ctx.cyclesPerTick)));
            if (event.delay !== undefined && Number.isFinite(event.delay)) {
                const delayServerTicks = Math.max(0, event.delay);
                payload.delay = Math.min(
                    0xffff,
                    Math.max(0, Math.round(delayServerTicks * ctx.cyclesPerTick)),
                );
            }
            if (event.height !== undefined && Number.isFinite(event.height)) {
                payload.height = event.height;
            }
            if (event.playerId !== undefined && event.playerId >= 0) {
                payload.playerId = event.playerId;
            } else if (event.npcId !== undefined && event.npcId >= 0) {
                payload.npcId = event.npcId;
            } else if (event.tile) {
                payload.tile = {
                    x: event.tile.x,
                    y: event.tile.y,
                    level: event.tile.level,
                };
            } else {
                continue;
            }
            const msg = encodeMessage({ type: "spot", payload });
            this.services.withDirectSendBypass("combat_spot", () => {
                if (payload.tile) {
                    if (event.worldViewId !== undefined) {
                        const tile = payload.tile;
                        this.services.forEachPlayer((sock, player) => {
                            if (player.worldViewId === event.worldViewId && player.level === (tile.level ?? 0) &&
                                Math.max(Math.abs(player.tileX! - tile.x), Math.abs(player.tileY! - tile.y)) <= TILE_SPOT_BROADCAST_RADIUS_TILES)
                                ctx.sendWithGuard(sock, msg, "combat_spot");
                        });
                        return;
                    }
                    ctx.broadcastToNearby(
                        payload.tile.x,
                        payload.tile.y,
                        payload.tile.level ?? 0,
                        TILE_SPOT_BROADCAST_RADIUS_TILES,
                        msg,
                        "combat_spot",
                    );
                    return;
                }
                ctx.broadcast(msg, "combat_spot");
            });
        }
    }

    private flushCombatSnapshots(frame: TickFrame, ctx: BroadcastContext): void {
        if (!frame.combatSnapshots || frame.combatSnapshots.length === 0) return;

        for (const snapshot of frame.combatSnapshots) {
            const sock = ctx.getSocketByPlayerId(snapshot.playerId);
            ctx.sendWithGuard(
                sock,
                encodeMessage({
                    type: "combat",
                    payload: {
                        weaponCategory: snapshot.weaponCategory,
                        weaponItemId: snapshot.weaponItemId,
                        autoRetaliate: snapshot.autoRetaliate,
                        activeStyle: snapshot.activeStyle,
                        activePrayers: snapshot.activePrayers,
                        activeSpellId: snapshot.activeSpellId,
                        specialEnergy: snapshot.specialEnergy,
                        specialActivated: snapshot.specialActivated,
                        quickPrayers: snapshot.quickPrayers,
                        quickPrayersEnabled: snapshot.quickPrayersEnabled,
                    },
                }),
                "combat_snapshot",
            );
        }
    }
}
