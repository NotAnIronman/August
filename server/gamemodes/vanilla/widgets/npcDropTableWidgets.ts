import { NPC_DROP_TABLE_PANEL_GROUP_ID } from "../../../../client/common/ui/widgets";
import { ComponentIds, type UiIconRow } from "../../../../client/common/uikit/contracts";
import type { NpcTypeLoader } from "../../../../client/rs/config/npctype/NpcTypeLoader";
import { NpcDropRegistry } from "../../../src/game/drops/NpcDropRegistry";
import { appendRuntimeProbe } from "../../../src/debug/runtimeProbeLog";
import type { NpcDropEntry, NpcDropPool, NpcDropTable } from "../../../src/game/drops/types";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { openUiPanel, sendUiIconRows, sendUiTabs } from "../uikit/panelData";

type DropCategory = {
    id: string;
    label: string;
    entries: NpcDropEntry[];
};

type DropPanelState = {
    npcTypeId: number;
    npcName: string;
    categories: DropCategory[];
};

export type NpcDropViewer = {
    open(player: PlayerState, npcTypeId: number): boolean;
};

function categoryLabel(pool: NpcDropPool): string {
    switch (pool.category) {
        case "pre_roll":
            return "Pre-roll";
        case "unique":
            return "Unique";
        case "secondary":
            return "Secondary drops";
        case "weapons_armour":
            return "Equipment";
        case "runes_ammo":
            return "Runes & ammo";
        case "coins":
            return "Coins";
        case "other":
            return "Other";
        case "tertiary":
            return "Tertiary";
        case "shared":
            return "Rare drop table";
        default:
            return "Main drops";
    }
}

function rateColor(probability: number | undefined): string {
    const chance = probability ?? 0;
    if (chance >= 1) return "00a000";
    if (chance >= 1 / 16) return "008000";
    if (chance >= 1 / 64) return "808000";
    if (chance >= 1 / 256) return "b06000";
    return "a00000";
}

function formatRate(probability: number | undefined): string {
    const chance = probability ?? 0;
    if (chance >= 1) return "Always";
    if (!(chance > 0)) return "Unknown";
    return `1/${Math.max(1, Math.round(1 / chance)).toLocaleString("en-US")}`;
}

function formatQuantity(entry: NpcDropEntry): string {
    const { min, max } = entry.quantity;
    return min === max ? `x${min.toLocaleString("en-US")}` : `x${min.toLocaleString("en-US")}-${max.toLocaleString("en-US")}`;
}

function makeIconRow(entry: NpcDropEntry, services: ScriptServices): UiIconRow {
    const item = services.data.getItemDefinition(entry.itemId);
    const name = item?.name || `Item ${entry.itemId}`;
    const rate = formatRate(entry.probability);
    const color = rateColor(entry.probability);
    return {
        itemId: entry.itemId,
        level: 0,
        levelLabel: formatQuantity(entry),
        name,
        description: `<col=${color}>${rate}</col>`,
    };
}

function buildCategories(table: NpcDropTable): DropCategory[] {
    const out: DropCategory[] = [];
    const byCategory = new Map<string, NpcDropEntry[]>();
    // OSRS presents bones and other guaranteed drops with ordinary loot, not
    // behind a tab users must dismiss before seeing the actual table.
    if (table.always.length > 0) {
        byCategory.set("Main drops", [...table.always]);
    }
    for (const pool of table.pools) {
        const label = categoryLabel(pool);
        const bucket = byCategory.get(label) ?? [];
        bucket.push(...pool.entries);
        byCategory.set(label, bucket);
    }
    for (const [label, entries] of byCategory) {
        // The source does not label every wiki subtable. Keep its genuine
        // groups intact, while giving very-low-chance main-pool entries their
        // own clearly named tab rather than burying them in a long main list.
        // "Rare drops" is intentionally not called "Unique" because that
        // distinction is boss-specific and cannot be inferred safely here.
        if (label === "Main drops") {
            const rare = entries.filter((entry) => (entry.probability ?? 0) <= 1 / 128);
            const common = entries.filter((entry) => (entry.probability ?? 0) > 1 / 128);
            if (common.length > 0) {
                out.push({ id: "main-drops", label, entries: common });
            }
            if (rare.length > 0) {
                out.push({ id: "rare-drops", label: "Rare drops", entries: rare });
            }
            continue;
        }
        out.push({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, entries });
    }
    return out;
}

function renderDropPanel(
    services: ScriptServices,
    player: PlayerState,
    state: DropPanelState,
    requestedIndex: number,
): void {
    const activeIndex = Math.max(0, Math.min(requestedIndex, state.categories.length - 1));
    const category = state.categories[activeIndex];
    sendUiTabs(
        services,
        player.id,
        NPC_DROP_TABLE_PANEL_GROUP_ID,
        state.categories.map(({ label }) => ({ label })),
        activeIndex,
    );
    sendUiIconRows(
        services,
        player.id,
        NPC_DROP_TABLE_PANEL_GROUP_ID,
        (category?.entries ?? []).map((entry) => makeIconRow(entry, services)),
    );
}

function getNpcName(loader: NpcTypeLoader, npcTypeId: number): string {
    try {
        const name = String(loader.load(npcTypeId)?.name ?? "").trim();
        return name && name !== "null" ? name : `NPC ${npcTypeId}`;
    } catch {
        return `NPC ${npcTypeId}`;
    }
}

/** Registers a player-facing, data-driven drop-table browser and ::drops. */
export function registerNpcDropTableWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): NpcDropViewer {
    let cachedLoader: NpcTypeLoader | undefined;
    let cachedRegistry: NpcDropRegistry | undefined;

    const getDropRegistry = (): { registry: NpcDropRegistry; loader: NpcTypeLoader } | undefined => {
        const loader = services.data.getNpcTypeLoader() as unknown as NpcTypeLoader | undefined;
        if (!loader) return undefined;
        if (loader !== cachedLoader || !cachedRegistry) {
            cachedLoader = loader;
            cachedRegistry = new NpcDropRegistry(loader);
        }
        return { registry: cachedRegistry, loader };
    };

    const open = (player: PlayerState, npcTypeId: number): boolean => {
        const source = getDropRegistry();
        if (!source || !(npcTypeId >= 0)) return false;
        const table = source.registry.get(npcTypeId);
        if (!table) return false;
        const categories = buildCategories(table);
        if (categories.length === 0) return false;

        const state: DropPanelState = {
            npcTypeId,
            npcName: getNpcName(source.loader, npcTypeId),
            categories,
        };
        openUiPanel(services, player, NPC_DROP_TABLE_PANEL_GROUP_ID, `${state.npcName} drops`, {
            data: state,
        });
        renderDropPanel(services, player, state, 0);
        return true;
    };

    registry.registerCommand("drops", ({ player, args }) => {
        const npcTypeId = Number.parseInt(args[0] ?? "", 10);
        if (!Number.isInteger(npcTypeId) || npcTypeId < 0) {
            return "Usage: ::drops <NpcID>";
        }
        const source = getDropRegistry();
        const details = source?.registry.describe(npcTypeId);
        appendRuntimeProbe("drops_lookup", {
            npcTypeId,
            source: details?.source ?? "registry-unavailable",
            sourceEntries: details?.sourceEntries ?? 0,
            sourcePath: details?.sourcePath ?? "",
            sourceError: details?.sourceError ?? "",
            runtimeNpcName: details?.runtimeNpcName ?? "",
            runtimeCombatLevel: details?.runtimeCombatLevel ?? -1,
            directImportedName: details?.directImportedName ?? "",
            nameCandidateCount: details?.nameCandidateCount ?? 0,
            exactNameCombatMatch: details?.exactNameCombatMatch ?? false,
            entries: details?.entryCount ?? 0,
        }, player.id);
        return open(player, npcTypeId)
            ? undefined
            : `No imported drop table is available for NPC ${npcTypeId}.`;
    });

    // A compact, in-game proof of the data path. This avoids guessing whether
    // a running server actually loaded the ignored source file or fell back to
    // a small hand-written table.
    registry.registerCommand("dropsdebug", ({ player, args }) => {
        const npcTypeId = Number.parseInt(args[0] ?? "", 10);
        if (!Number.isInteger(npcTypeId) || npcTypeId < 0) {
            return "Usage: ::dropsdebug <NpcID>";
        }
        const source = getDropRegistry();
        if (!source) return "Drop registry is not available.";
        const details = source.registry.describe(npcTypeId);
        appendRuntimeProbe("drops_debug", {
            npcTypeId,
            source: details.source,
            sourceEntries: details.sourceEntries,
            sourcePath: details.sourcePath,
            sourceError: details.sourceError ?? "",
            runtimeNpcName: details.runtimeNpcName,
            runtimeCombatLevel: details.runtimeCombatLevel,
            directImportedName: details.directImportedName ?? "",
            nameCandidateCount: details.nameCandidateCount,
            exactNameCombatMatch: details.exactNameCombatMatch,
            entries: details.entryCount,
        }, player.id);
        const sourceState = details.sourceError
            ? `source ERROR: ${details.sourceError.slice(0, 120)}`
            : `source tables=${details.sourceEntries}`;
        return (
            `Drops ${npcTypeId}: ${details.source}; always=${details.alwaysCount}, ` +
            `pools=${details.poolCount}, entries=${details.entryCount}; ${sourceState}; ` +
            `path=${details.sourcePath}`
        );
    });

    for (let index = 0; index < ComponentIds.MAX_TABS; index++) {
        registry.onButton(NPC_DROP_TABLE_PANEL_GROUP_ID, ComponentIds.TAB_BASE + index, (event) => {
            const state = services.dialog
                .getInterfaceService()
                ?.getModalData<DropPanelState>(event.player);
            if (!state || index >= state.categories.length) return;
            renderDropPanel(services, event.player, state, index);
        });
    }

    return { open };
}
