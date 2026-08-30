import { logger } from "@server/observability/logger";
import type { MessageHandlerServices } from "@server/network/MessageHandlers";
import { normalizeModifierFlags, resolveRunWithModifier } from "@server/network/MessageHandlers";
import type { MessageRouter } from "@server/network/MessageRouter";

export function registerNpcHandlers(router: MessageRouter, services: MessageHandlerServices): void {
    router.register("npc_interact", (ctx) => {
        try {
            // Starting an interaction should consume any stale queued walk click.
            services.clearPendingWalkCommand(ctx.ws);
            const { npcId, opNum, modifierFlags: rawModifierFlags } = ctx.payload;
            const npc = services.getNpcById(npcId);
            const player = ctx.player;
            if (!npc) {
                logger.info?.(`[npc] interact target ${npcId} not found`);
                return;
            }
            const option =
                opNum !== undefined && opNum > 0
                    ? services.resolveNpcOption(npc, opNum)
                    : undefined;
            if (!option) {
                logger.info?.(`[npc] interact option ${opNum ?? "?"} not found for npc=${npcId}`);
                return;
            }
            const modifierFlags = normalizeModifierFlags(rawModifierFlags);
            const optNorm = (option ?? "").trim().toLowerCase();
            logger.info?.(
                `[npc] recv npc_interact player=${player?.id ?? "?"} opt=${
                    option
                } npc=${npcId} type=${npc?.typeId ?? "?"} playerPos=(${player?.tileX ?? "?"},${
                    player?.tileY ?? "?"
                },${player?.level ?? "?"})`,
            );

            // "Attack" is encoded as a regular NPC option packet (OPNPC*),
            // not a dedicated attack message, so route it through combat here.
            if (optNorm === "attack") {
                const tick = services.currentTick();
                const attackSpeed = ctx.player ? services.pickAttackSpeed(ctx.player) : 4;
                const res = services.startNpcAttack(ctx.ws, npc, tick, attackSpeed, modifierFlags);
                if (!res.ok) {
                    logger.info?.(
                        `[combat] npc attack rejected: ${res.message || "no_path"} (npc=${npcId})`,
                    );
                    if (res.chatMessage && ctx.player) {
                        services.queueChatMessage({
                            messageType: "game",
                            text: res.chatMessage,
                            targetPlayerIds: [ctx.player.id],
                        });
                    }
                } else if (ctx.player) {
                    ctx.player.setInteraction("npc", npc.id);
                }
                return;
            }

            // Handle banking over the counter
            if (optNorm === "bank" && player) {
                const canBank = services.hasNpcOption(npc, "bank");
                if (canBank) {
                    const sameLevel = player.level === npc.level;
                    const px = player.tileX;
                    const py = player.tileY;
                    const tx = npc.tileX;
                    const ty = npc.tileY;
                    const size = Math.max(1, npc.size);
                    const minNx = tx;
                    const minNy = ty;
                    const maxNx = tx + size - 1;
                    const maxNy = ty + size - 1;
                    const dx = px < minNx ? minNx - px : px > maxNx ? px - maxNx : 0;
                    const dy = py < minNy ? minNy - py : py > maxNy ? py - maxNy : 0;
                    const dCheb = Math.max(dx, dy);

                    // Bankers stand behind counters. Banking is intentionally
                    // allowed across that one-tile barrier (and at the normal
                    // two-tile counter distance), so do not make the player
                    // path toward an unreachable NPC first.
                    if (sameLevel && dCheb <= 2) {
                        try {
                            services.startNpcInteraction(ctx.ws, npc, option, modifierFlags);
                        } catch (err) {
                            logger.warn("Failed to start NPC bank interaction", err);
                        }
                        return;
                    }

                    // Route player to nearest tile around NPC
                    let routed = false;
                    for (let ringRadius = 1; ringRadius <= 4 && !routed; ringRadius++) {
                        const candidates: { x: number; y: number }[] = [];
                        for (let x = minNx - ringRadius; x <= maxNx + ringRadius; x++) {
                            candidates.push({ x, y: minNy - ringRadius });
                            candidates.push({ x, y: maxNx + ringRadius });
                        }
                        for (let y = minNy - ringRadius; y <= maxNy + ringRadius; y++) {
                            candidates.push({ x: minNx - ringRadius, y });
                            candidates.push({ x: maxNx + ringRadius, y });
                        }
                        const uniq = new Map<string, { x: number; y: number }>();
                        for (const c of candidates) uniq.set(`${c.x}|${c.y}`, c);
                        const sorted = Array.from(uniq.values()).sort((a, b) => {
                            const da = Math.max(Math.abs(a.x - px), Math.abs(a.y - py));
                            const db = Math.max(Math.abs(b.x - px), Math.abs(b.y - py));
                            return da - db;
                        });

                        for (const slot of sorted) {
                            const res = services.findPath({
                                from: { x: px, y: py, plane: player.level },
                                to: { x: slot.x, y: slot.y },
                                size: 1,
                            });
                            if (
                                res.ok &&
                                Array.isArray(res.waypoints) &&
                                res.waypoints.length > 0
                            ) {
                                const run = player.energy.resolveRequestedRun(
                                    resolveRunWithModifier(
                                        player.energy.wantsToRun(),
                                        modifierFlags,
                                    ),
                                );
                                services.routePlayer(
                                    ctx.ws,
                                    { x: slot.x, y: slot.y },
                                    run,
                                    services.currentTick(),
                                );
                                try {
                                    services.startNpcInteraction(
                                        ctx.ws,
                                        npc,
                                        option,
                                        modifierFlags,
                                    );
                                } catch (err) {
                                    logger.warn("Failed to start NPC interaction after walk", err);
                                }
                                routed = true;
                                break;
                            }
                        }
                    }
                    if (!routed && sameLevel && dCheb <= 4) {
                        services.queueChatMessage({
                            messageType: "game",
                            text: "I can't reach that.",
                            targetPlayerIds: [player.id],
                        });
                        return;
                    }
                    if (routed) return;
                }
            }

            const res = services.startNpcInteraction(ctx.ws, npc, option, modifierFlags);
            if (!res?.ok) {
                logger.info?.(
                    `[npc] interaction rejected: ${res?.message || "invalid"} (npc=${npcId})`,
                );
            }
        } catch (err) {
            logger.warn("[npc] npc_interact handling failed", err);
        }
    });
}
