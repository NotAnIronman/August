import { DEV_MODEL_VIEWER_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { sendChat } from "@client/core/network/server-connection/outgoing/inventoryChat";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { createSearchController } from "@client/ui/widgets/uikit/SearchController";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";

function logLocDefinition(id: number): void {
    const global = (typeof window === "undefined" ? globalThis : window) as {
        __osrsClient?: { locTypeLoader?: { load?: (locId: number) => Record<string, unknown> | undefined } };
    };
    const definition = global.__osrsClient?.locTypeLoader?.load?.(id);
    if (!definition) {
        console.info(`[modelviewer] object ${id} could not be loaded from the client cache.`);
        return;
    }
    // This is intentionally concise and copyable. A morph object often has
    // no standalone model; its varbit/varp and transforms determine which
    // concrete object the renderer actually displays.
    console.info("[modelviewer] loc definition", {
        id,
        name: definition.name,
        models: definition.models,
        types: definition.types,
        seqId: definition.seqId,
        randomSeqIds: definition.randomSeqIds,
        transforms: definition.transforms,
        transformVarbit: definition.transformVarbit,
        transformVarp: definition.transformVarp,
        sizeX: definition.sizeX,
        sizeY: definition.sizeY,
    });
}

/**
 * Cache scenery is best reviewed in the actual scene renderer rather than a
 * synthetic thumbnail: model transforms, lighting, and animation variants
 * remain exactly as they will appear in-game.
 */
registerUiPanel({
    groupId: DEV_MODEL_VIEWER_PANEL_GROUP_ID,
    build: () => buildUiPanel(DEV_MODEL_VIEWER_PANEL_GROUP_ID, {
        width: 370,
        height: 168,
        content: { rowKind: "mixed", rowHeight: 34, scrollbarWidth: 0 },
        footerButton: true,
        search: { placeholder: "Object ID — Enter", width: 230 },
        inputCapture: false,
    }),
    searchController: createSearchController(
        DEV_MODEL_VIEWER_PANEL_GROUP_ID,
        "Object ID — Enter",
        () => {},
        (query) => {
            const id = query.trim();
            if (/^\d+$/.test(id)) {
                logLocDefinition(Number(id));
                sendChat(`::modelviewer ${id}`);
            }
        },
        8,
    ),
});
