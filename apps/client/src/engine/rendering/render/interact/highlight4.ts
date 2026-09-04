
import { MenuTargetType } from "@august/osrs-engine/MenuEntry";
import {
    getCurrentTick
} from "@client/core/network/ServerConnection";
import { ClientState } from "@client/engine/game/ClientState";
import { InteractHighlightTarget } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import { MenuAction } from "@client/ui/runtime/menu/MenuAction";
import type { SimpleMenuEntry } from "@client/ui/runtime/menu/MenuEngine";
import { chooseDefaultMenuEntry } from "@client/ui/runtime/menu/MenuEngine";

export function resolveInteractHighlightTargetFromEntry(host: WebGLOsrsRendererHost, 
        entry: Pick<SimpleMenuEntry, "targetType" | "targetId" | "mapX" | "mapY"> | undefined,
        fallbackTile?: { tileX: number; tileY: number; plane?: number },
    ): InteractHighlightTarget | undefined {

        if (!entry) return undefined;
        if (entry.targetType === MenuTargetType.LOC) {
            return host.resolveLocHighlightTargetFromEntry(entry, fallbackTile);
        }
        if (entry.targetType === MenuTargetType.NPC) {
            return host.resolveNpcHighlightTargetFromEntry(entry, fallbackTile);
        }
        return undefined;
    
}

export function updateInteractHighlightHoverTarget(host: WebGLOsrsRendererHost, simpleEntries: SimpleMenuEntry[]): void {

        const config = host.osrsClient.interactHighlightPlugin.getConfig();
        if (!config.enabled || !config.showHover) {
            host.clearInteractHighlightHoverTarget();
            return;
        }

        const entry = chooseDefaultMenuEntry(simpleEntries, {
            hasSelectedSpell: ClientState.isSpellSelected,
            hasSelectedItem: ClientState.isItemSelected === 1,
        });
        const target = host.resolveInteractHighlightTargetFromEntry(
            entry,
            host.osrsClient.menuTile,
        );
        if (!target) {
            host.clearInteractHighlightHoverTarget();
            return;
        }
        host.interactHighlightHoverTarget = target;
    
}

export function onInteractHighlightEntryInvoked(host: WebGLOsrsRendererHost, 
        entry: SimpleMenuEntry | undefined,
        clickedTile?: { tileX: number; tileY: number; plane?: number },
    ): void {

        const config = host.osrsClient.interactHighlightPlugin.getConfig();
        if (!config.enabled) {
            host.clearInteractHighlightActiveTarget();
            return;
        }
        if (!entry) return;

        const optionLower = String(entry.option || "").toLowerCase();
        if (entry.targetType === MenuTargetType.LOC || entry.targetType === MenuTargetType.NPC) {
            if (optionLower === "examine") {
                return;
            }
            const target = host.resolveInteractHighlightTargetFromEntry(entry, clickedTile);
            if (target) {
                host.interactHighlightActiveTarget = target;
                host.interactHighlightActiveFromInteraction = false;
                host.interactHighlightClickTick = getCurrentTick() | 0;
            } else {
                host.clearInteractHighlightActiveTarget();
            }
            return;
        }

        if (
            optionLower === "walk here" ||
            entry.targetType === MenuTargetType.OBJ ||
            entry.targetType === MenuTargetType.PLAYER
        ) {
            host.clearInteractHighlightActiveTarget();
            return;
        }

        if (entry.action === MenuAction.Use || entry.action === MenuAction.Cast) {
            host.clearInteractHighlightActiveTarget();
        }
    
}

export function spawnClickCross(host: WebGLOsrsRendererHost, 
        tile: { tileX: number; tileY: number; plane?: number } | undefined,
        xy: { sx: number; sy: number },
        color: "red" | "yellow",
    ): void {

        if (!tile) return;
        const playerPlane = host.getPlayerBasePlane() | 0;
        const plane = tile.plane ?? playerPlane;
        host.clickCrossOverlay?.spawn(
            tile.tileX | 0,
            tile.tileY | 0,
            xy.sx,
            xy.sy,
            plane,
            undefined,
            color,
        );
    
}
