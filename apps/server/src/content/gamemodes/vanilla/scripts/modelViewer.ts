import { DEV_MODEL_VIEWER_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import type { PlayerState } from "@server/game/player";
import { registerPlayerLifecycleCleanup } from "@server/game/scripts/ScriptLifecycle";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { openUiPanel, sendUiFooterButton } from "@server/content/gamemodes/vanilla/uikit/panelData";

type Preview = {
    locId: number;
    tile: { x: number; y: number };
    level: number;
    shape: number;
    worldViewId: number;
};
const previews = new Map<number, Preview>();
const PREVIEW_DISTANCE = 5;

function clearPreview(player: PlayerState, services: ScriptServices): void {
    clearPreviewByPlayerId(player.id, services);
}

function clearPreviewByPlayerId(playerId: number, services: ScriptServices): void {
    const preview = previews.get(playerId);
    if (!preview) return;
    services.location.clearTemporaryLoc(
        { worldViewId: preview.worldViewId, ownerPlayerId: playerId },
        0,
        preview.tile,
        preview.level,
        preview.shape,
    );
    previews.delete(playerId);
}

function openPreviewPanel(player: PlayerState, services: ScriptServices, preview: Preview): void {
    openUiPanel(services, player, DEV_MODEL_VIEWER_PANEL_GROUP_ID, "Cache object model viewer");
    sendUiFooterButton(
        services,
        player.id,
        DEV_MODEL_VIEWER_PANEL_GROUP_ID,
        `Viewing object ${preview.locId} at ${preview.tile.x}, ${preview.tile.y}. Type another ID and press Enter, or use ::modelviewer clear.`,
    );
}

export function registerModelViewerCommands(registry: IScriptRegistry, services: ScriptServices): void {
    registerPlayerLifecycleCleanup(registry, services, {
        player: (playerId) => clearPreviewByPlayerId(playerId, services),
        reset: () => {
            for (const playerId of [...previews.keys()]) {
                clearPreviewByPlayerId(playerId, services);
            }
        },
    });

    registry.registerCommand("modelviewer", ({ player, args }) => {
        const request = args[0]?.toLowerCase();
        if (!request || request === "help") {
            return "::modelviewer <object id> [shape] [rotation] previews a cache object five tiles east. ::modelviewer clear removes it.";
        }
        if (request === "clear") {
            clearPreview(player, services);
            services.dialog.getInterfaceService()?.closeModal(player);
            return "Removed your object preview.";
        }
        if (!/^\d+$/.test(request)) return "Object ID must be a non-negative whole number.";
        const locId = Number(request);
        const shape = Math.max(0, Math.min(22, Math.trunc(Number(args[1] ?? 10)) || 10));
        const rotation = Math.max(0, Math.min(3, Math.trunc(Number(args[2] ?? 0)) || 0));
        clearPreview(player, services);
        const preview: Preview = {
            locId,
            tile: { x: player.tileX + PREVIEW_DISTANCE, y: player.tileY },
            level: player.level,
            shape,
            worldViewId: player.worldViewId,
        };
        services.location.replaceTemporaryLoc(
            { worldViewId: player.worldViewId, ownerPlayerId: player.id },
            0,
            locId,
            preview.tile,
            preview.level,
            { newShape: shape, newRotation: rotation },
        );
        previews.set(player.id, preview);
        openPreviewPanel(player, services, preview);
        return `Previewing object ${locId}.`;
    }, {
        permission: "developer",
        owner: "developer:model-viewer",
        summary: "Preview a cache scenery object in the live scene.",
    });
}
