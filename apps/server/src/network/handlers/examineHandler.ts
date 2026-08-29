import type { WebSocket } from "ws";

import type { TypeLoader } from "@august/osrs-engine/config/TypeLoader";
import type { LocType } from "@august/osrs-engine/config/loctype/LocType";
import type { NpcType } from "@august/osrs-engine/config/npctype/NpcType";
import type { ObjType } from "@august/osrs-engine/config/objtype/ObjType";
import { getLocExamine } from "@server/data/locs";
import { getNpcExamine } from "@server/data/npcs";
import {
    resolveLocExamineText,
    resolveNpcExamineText,
    resolveObjExamineText,
} from "@server/game/interactions/ExamineText";
import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { resolveLocActions } from "@august/game-model/world/LocActionOverrides";
import { logger } from "@server/observability/logger";
import { loadVisibleLocTypeForPlayer } from "@server/world/LocTransforms";

export interface ExamineHandlerDeps {
    getPlayer: (ws: WebSocket) => PlayerState | undefined;
    queuePlayerGameMessage: (player: PlayerState, text: string) => void;
    queryGroundItemArea: (
        x: number,
        y: number,
        level: number,
        radius: number,
        tick: number,
        playerId: number,
        worldViewId?: number,
    ) => Array<{ itemId: number }>;
    getCurrentTick: () => number;
    locTypeLoader: TypeLoader<LocType> | undefined;
    npcTypeLoader: TypeLoader<NpcType> | undefined;
    objTypeLoader: TypeLoader<ObjType> | undefined;
    getNpcType: (npc: NpcState) => NpcType | undefined;
    getObjType: (itemId: number) => ObjType | undefined;
}

export interface ExaminePacket {
    type: string;
    locId?: number;
    npcId?: number;
    itemId?: number;
    worldX?: number;
    worldY?: number;
}

export function handleExaminePacket(
    deps: ExamineHandlerDeps,
    ws: WebSocket,
    packet: ExaminePacket,
): boolean {
    const player = deps.getPlayer(ws);
    if (!player) {
        logger.warn(`[examine] Packet '${packet.type}' arrived with no resolvable player for ws`);
        return false;
    }

    switch (packet.type) {
        case "examine_loc": {
            if (packet.locId === undefined) return false;
            // Cache text first (works today for essentially nothing on this
            // revision, but stays first so it wins automatically if that ever
            // changes), then the static wiki-merged data file
            // (data/generated/server/locs.json — see merge-wiki-examine.ts). No SQLite
            // involved in this path at all.
            const locText = resolveLocExamineText(deps.locTypeLoader, player, packet.locId) ?? getLocExamine(packet.locId);
            logger.debug(`[examine] loc id=${packet.locId} player=${player.name} -> ${locText ?? "NO TEXT"}`);
            if (locText) deps.queuePlayerGameMessage(player, locText);
            return true;
        }

        case "examine_npc": {
            if (packet.npcId === undefined) return false;
            // Vanilla uses Examine as the natural entry point for the NPC
            // drop viewer. Keep the hook gamemode-owned so other modes can
            // retain the normal examine text, and do not emit both UI and
            // chat text for the same action.
            if (player.gamemode.onNpcExamine?.(player, packet.npcId) === true) {
                return true;
            }
            const npcText = resolveNpcExamineText(deps.npcTypeLoader, packet.npcId) ?? getNpcExamine(packet.npcId);
            logger.debug(`[examine] npc id=${packet.npcId} player=${player.name} -> ${npcText ?? "NO TEXT"}`);
            if (npcText) deps.queuePlayerGameMessage(player, npcText);
            return true;
        }

        case "examine_obj": {
            if (packet.worldX === undefined || packet.worldY === undefined) return false;
            if (packet.itemId === undefined) return false;
            const visible = deps
                .queryGroundItemArea(
                    packet.worldX,
                    packet.worldY,
                    player.level,
                    0,
                    deps.getCurrentTick(),
                    player.id,
                    player.worldViewId,
                )
                .some((stack) => stack.itemId === packet.itemId);
            if (!visible) {
                logger.debug(
                    `[examine] obj id=${packet.itemId} at (${packet.worldX},${packet.worldY}) ` +
                        `player=${player.name} -> NOT VISIBLE at that tile`,
                );
                return true;
            }

            const objText = resolveObjExamineText(deps.objTypeLoader, packet.itemId);
            logger.debug(`[examine] obj id=${packet.itemId} player=${player.name} -> ${objText ?? "NO TEXT"}`);
            if (objText) deps.queuePlayerGameMessage(player, objText);
            return true;
        }

        default:
            return false;
    }
}

export function resolveNpcOptionByOpNum(
    getNpcType: (npc: NpcState) => NpcType | undefined,
    npc: NpcState,
    opNum: number,
): string | undefined {
    const idx = opNum - 1;
    if (idx < 0 || idx > 4) return undefined;
    try {
        const type = getNpcType(npc);
        const raw = Array.isArray(type?.actions) ? type.actions[idx] : undefined;
        if (!raw) return undefined;
        const normalized = raw.trim();
        return normalized.length > 0 ? normalized : undefined;
    } catch {
        return undefined;
    }
}

export function resolveLocActionByOpNum(
    locTypeLoader: TypeLoader<LocType> | undefined,
    locId: number,
    opNum: number,
    player?: PlayerState,
): string | undefined {
    const idx = opNum - 1;
    if (idx < 0 || idx > 4) return undefined;
    if (!(locId > 0)) return undefined;
    try {
        const visible = player
            ? loadVisibleLocTypeForPlayer(locTypeLoader, player, locId)
            : undefined;
        const def = (visible?.type ?? locTypeLoader?.load?.(locId)) as LocType | undefined;
        const raw = resolveLocActions(locId, def?.actions)[idx];
        if (!raw) return undefined;
        const normalized = raw.trim();
        return normalized.length > 0 ? normalized : undefined;
    } catch {
        return undefined;
    }
}

export function resolveGroundItemOptionByOpNum(
    getObjType: (itemId: number) => ObjType | undefined,
    itemId: number,
    opNum: number,
): string | undefined {
    const idx = opNum - 1;
    if (idx < 0 || idx > 4) return undefined;
    if (!(itemId > 0)) return undefined;
    try {
        const obj = getObjType(itemId);
        const raw = Array.isArray(obj?.groundActions) ? obj.groundActions[idx] : undefined;
        if (!raw) return undefined;
        const normalized = raw.trim();
        return normalized.length > 0 ? normalized : undefined;
    } catch {
        return undefined;
    }
}
