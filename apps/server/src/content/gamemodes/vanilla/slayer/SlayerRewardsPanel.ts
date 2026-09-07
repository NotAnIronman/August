import { logger } from "@server/observability/logger";
import { SLAYER_REWARDS_PANEL_GROUP_ID } from "@august/protocol/ui/widgets";
import { ComponentIds, type UiTextRow } from "@august/protocol/uikit/contracts";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";
import {
    openUiPanel,
    sendUiRowCheckboxes,
    sendUiRowClickZones,
    sendUiTabs,
    sendUiTextRows,
} from "@server/content/gamemodes/vanilla/uikit/panelData";
import {
    SLAYER_BUY_CATALOG,
    SLAYER_EXTEND_CATALOG,
    SLAYER_UNLOCK_CATALOG,
    getSlayerBuyEntry,
    getSlayerExtendEntry,
    getSlayerUnlockEntry,
    type SlayerCatalogEntry,
} from "@server/content/gamemodes/vanilla/slayer/SlayerRewardCatalog";
import { cancelTask } from "@server/content/gamemodes/vanilla/slayer/SlayerService";
import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";
import { getSlayerPoints, spendSlayerPoints } from "@server/content/gamemodes/vanilla/slayer/SlayerVarbitSync";

/**
 * Slayer Rewards panel — 4 tabs (Unlock / Extend / Buy / Tasks), matching
 * the real interface's structure, built on this project's own UI kit
 * (see SlayerRewardCatalog.ts and SlayerService.ts's doc comments for why
 * a custom panel + real varbits instead of the real cache interface / a
 * shadow points counter).
 *
 * rowKind is "text" (not "icon"): clickable row hit-zones
 * (DIALOGUE_ROW_HITZONE_BASE) are only built for text/mixed content in
 * the client's PanelBuilder.ts — see apps/client/.../slayerRewardsPanel.ts
 * for the full explanation of why an earlier icon-row version broke.
 *
 * Tab switching and per-row purchase both route through the same
 * DIALOGUE_ROW_HITZONE_BASE / TAB_BASE component ids; a small per-player
 * "which tab is currently open" map resolves a row click back to the
 * right catalog, since the row index alone is ambiguous across tabs.
 *
 * Ownership on Unlock/Extend rows is shown with a real checkbox sprite
 * (ROW_CHECKBOX_BASE, checked=942/unchecked=941 — see sendUiRowCheckboxes
 * in panelData.ts) rather than a text suffix, using real cache sprite ids.
 */

const TAB_LABELS = ["Unlock", "Extend", "Buy", "Tasks"] as const;
type TabIndex = 0 | 1 | 2 | 3;

const activeTabByPlayer = new Map<number, TabIndex>();
/** First click on a row selects it and shows its description; a second
 *  click on the SAME row (same tab) confirms the purchase/action. Clicking
 *  a different row or switching tabs clears the pending selection. */
const pendingSelectionByPlayer = new Map<number, { tab: TabIndex; rowIndex: number }>();

function getActiveTab(playerId: number): TabIndex {
    return activeTabByPlayer.get(playerId) ?? 0;
}

function getPendingSelection(playerId: number): { tab: TabIndex; rowIndex: number } | undefined {
    return pendingSelectionByPlayer.get(playerId);
}

function isSelected(playerId: number, tab: TabIndex, rowIndex: number): boolean {
    const pending = getPendingSelection(playerId);
    return pending !== undefined && pending.tab === tab && pending.rowIndex === rowIndex;
}

function catalogRowLine(playerId: number, tab: TabIndex, rowIndex: number, entry: SlayerCatalogEntry, owned: boolean): UiTextRow {
    const selected = isSelected(playerId, tab, rowIndex);
    // Ownership is now shown via a real checkbox sprite (sendUiRowCheckboxes)
    // instead of a text suffix — see checkboxStateFor below.
    if (owned) return { kind: "text", text: entry.name, style: { color: "00ff00" } };
    const prefix = selected ? "> " : "";
    const suffix = selected ? " (click again to confirm)" : "";
    if (entry.cost === 0) return { kind: "text", text: `${prefix}${entry.name} — Free${suffix}`, style: { color: "00ff00" } };
    return { kind: "text", text: `${prefix}${entry.name} — ${entry.cost} points${suffix}`, style: { color: selected ? "ffffff" : "ff981f" } };
}

/** Checkbox state per row for the currently active tab — true/false shows a
 *  checked/unchecked sprite, undefined hides the checkbox entirely (Buy and
 *  Tasks rows have no persistent "owned" concept, nor do toggle-type
 *  Unlock/Extend entries, which can be bought repeatedly rather than owned). */
function checkboxStatesForTab(tab: TabIndex, player: PlayerState): (boolean | undefined)[] {
    if (tab === 0) {
        return SLAYER_UNLOCK_CATALOG.map((entry) =>
            entry.toggle === "toggle" ? undefined : slayerTaskTracker.hasUnlock(player.id, entry.key),
        );
    }
    if (tab === 1) {
        return SLAYER_EXTEND_CATALOG.map((entry) =>
            entry.toggle === "toggle" ? undefined : slayerTaskTracker.hasUnlock(player.id, entry.key),
        );
    }
    return [];
}

function buildUnlockRows(player: PlayerState): UiTextRow[] {
    return SLAYER_UNLOCK_CATALOG.map((entry, i) =>
        catalogRowLine(player.id, 0, i, entry, entry.toggle !== "toggle" && slayerTaskTracker.hasUnlock(player.id, entry.key)),
    );
}

function buildExtendRows(player: PlayerState): UiTextRow[] {
    return SLAYER_EXTEND_CATALOG.map((entry, i) =>
        catalogRowLine(player.id, 1, i, entry, entry.toggle !== "toggle" && slayerTaskTracker.hasUnlock(player.id, entry.key)),
    );
}

function buildBuyRows(player: PlayerState): UiTextRow[] {
    return SLAYER_BUY_CATALOG.map((entry, i) => {
        const selected = isSelected(player.id, 2, i);
        return {
            kind: "text",
            text: `${selected ? "> " : ""}${entry.name} — ${entry.cost} points${selected ? " (click again to confirm)" : ""}`,
            style: { color: selected ? "ffffff" : "ff981f" },
        };
    });
}

function buildTaskRows(player: PlayerState): UiTextRow[] {
    const hasTask = Boolean(slayerTaskTracker.getTask(player.id));
    const selected0 = isSelected(player.id, 3, 0);
    return [
        {
            kind: "text",
            text: `${selected0 ? "> " : ""}Cancel current task${hasTask ? "" : " (none active)"}${selected0 ? " (click again to confirm)" : ""}`,
            style: { color: !hasTask ? "808080" : selected0 ? "ffffff" : "ff981f" },
        },
        { kind: "text", text: "Block current task (not yet implemented)", style: { color: "808080" } },
        { kind: "text", text: "Store/swap task (not yet implemented)", style: { color: "808080" } },
    ];
}

function buildRowsForTab(tab: TabIndex, player: PlayerState): UiTextRow[] {
    switch (tab) {
        case 0: return buildUnlockRows(player);
        case 1: return buildExtendRows(player);
        case 2: return buildBuyRows(player);
        case 3: return buildTaskRows(player);
    }
}

export function resetSlayerRewardsPanelState(playerId: number): void {
    activeTabByPlayer.delete(playerId);
    pendingSelectionByPlayer.delete(playerId);
}

export function openSlayerRewardsPanel(player: PlayerState, services: ScriptServices): void {
    const points = getSlayerPoints(player);
    const tab = getActiveTab(player.id);

    openUiPanel(services, player, SLAYER_REWARDS_PANEL_GROUP_ID, `Slayer Rewards - ${points} points`);
    sendUiTabs(services, player.id, SLAYER_REWARDS_PANEL_GROUP_ID, TAB_LABELS.map((label) => ({ label })), tab);

    const rows = buildRowsForTab(tab, player);
    sendUiTextRows(services, player.id, SLAYER_REWARDS_PANEL_GROUP_ID, rows);
    sendUiRowClickZones(services, player.id, SLAYER_REWARDS_PANEL_GROUP_ID, rows.length);
    sendUiRowCheckboxes(services, player.id, SLAYER_REWARDS_PANEL_GROUP_ID, checkboxStatesForTab(tab, player));
}

/** Re-renders the panel in place (after a tab switch or purchase) without a full reopen. */
function refreshSlayerRewardsPanel(player: PlayerState, services: ScriptServices): void {
    openSlayerRewardsPanel(player, services);
}

type PurchaseCatalogResult =
    | { kind: "purchased"; name: string; cost: number; remainingPoints: number }
    | { kind: "already-owned" }
    | { kind: "not-enough-points"; required: number; available: number }
    | { kind: "unknown-reward" };

function purchaseUnlockOrExtend(
    player: PlayerState,
    entry: SlayerCatalogEntry | undefined,
): PurchaseCatalogResult {
    if (!entry) return { kind: "unknown-reward" };
    if (entry.toggle !== "toggle" && slayerTaskTracker.hasUnlock(player.id, entry.key)) {
        return { kind: "already-owned" };
    }
    const available = getSlayerPoints(player);
    if (available < entry.cost) return { kind: "not-enough-points", required: entry.cost, available };

    if (entry.cost > 0) spendSlayerPoints(player, entry.cost);
    slayerTaskTracker.grantUnlock(player.id, entry.key);
    return { kind: "purchased", name: entry.name, cost: entry.cost, remainingPoints: getSlayerPoints(player) };
}

type PurchaseBuyResult = PurchaseCatalogResult | { kind: "inventory-full" };

function purchaseBuyItem(player: PlayerState, rowIndex: number): PurchaseBuyResult {
    const entry = SLAYER_BUY_CATALOG[rowIndex];
    if (!entry) return { kind: "unknown-reward" };

    const available = getSlayerPoints(player);
    if (available < entry.cost) return { kind: "not-enough-points", required: entry.cost, available };

    const result = player.items.addItem(entry.itemId, entry.itemQuantity, { assureFullInsertion: true });
    if (result.completed < entry.itemQuantity) return { kind: "inventory-full" };

    spendSlayerPoints(player, entry.cost);
    return { kind: "purchased", name: entry.name, cost: entry.cost, remainingPoints: getSlayerPoints(player) };
}

function reportPurchaseResult(services: ScriptServices, player: PlayerState, result: PurchaseCatalogResult | PurchaseBuyResult): void {
    switch (result.kind) {
        case "purchased":
            services.messaging.sendGameMessage(
                player,
                `Purchased ${result.name} for ${result.cost} Slayer points (${result.remainingPoints} remaining).`,
            );
            break;
        case "already-owned":
            services.messaging.sendGameMessage(player, "You already own that.");
            break;
        case "not-enough-points":
            services.messaging.sendGameMessage(
                player,
                `You need ${result.required} points for that (you have ${result.available}).`,
            );
            break;
        case "inventory-full":
            services.messaging.sendGameMessage(player, "You don't have space in your inventory for that.");
            break;
        case "unknown-reward":
            break;
    }
}

function describeRowForSelection(services: ScriptServices, player: PlayerState, tab: TabIndex, rowIndex: number): void {
    if (tab === 0 || tab === 1) {
        const entry = (tab === 0 ? SLAYER_UNLOCK_CATALOG : SLAYER_EXTEND_CATALOG)[rowIndex];
        if (!entry) return;
        services.messaging.sendGameMessage(
            player,
            `${entry.name} (${entry.cost} points): ${entry.description} Click it again to confirm.`,
        );
        return;
    }
    if (tab === 2) {
        const entry = SLAYER_BUY_CATALOG[rowIndex];
        if (!entry) return;
        services.messaging.sendGameMessage(
            player,
            `${entry.name} (${entry.cost} points): ${entry.description} Click it again to confirm.`,
        );
        return;
    }
    if (rowIndex === 0) {
        services.messaging.sendGameMessage(player, "Cancel your current Slayer task with no penalty. Click it again to confirm.");
    }
}

function handleTaskRowClick(services: ScriptServices, player: PlayerState, rowIndex: number): void {
    if (rowIndex === 0) {
        if (!slayerTaskTracker.getTask(player.id)) {
            services.messaging.sendGameMessage(player, "You don't have a Slayer task to cancel.");
            return;
        }
        cancelTask(player);
        services.messaging.sendGameMessage(player, "Your Slayer task has been cancelled.");
        return;
    }
    services.messaging.sendGameMessage(player, "That option isn't implemented yet.");
}

export function registerSlayerRewardsPanelHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    // Every click still passes through the interface-service "is this panel
    // actually open for this player" guard before running — see
    // registerUiPanelActions in uikit/actions.ts for the equivalent
    // reusable helper. Registered manually here (not via that helper) only
    // so the guard-failure path can log a warning; find/fix confirmed the
    // actual root cause of "clicks did nothing" was a missing
    // actions/FLAG_TRANSMIT_OP1 on the shared DIALOGUE_ROW_HITZONE_BASE
    // widget in PanelBuilder.ts (client-side), not this guard.
    function register(componentId: number, actionId: string, handle: (event: { player: PlayerState }) => void): void {
        registry.onButton(SLAYER_REWARDS_PANEL_GROUP_ID, componentId, (event) => {
            const isOpen = services.dialog.getInterfaceService()?.isModalOpen(event.player, SLAYER_REWARDS_PANEL_GROUP_ID);
            if (!isOpen) {
                logger.warn(`[slayer-rewards] click IGNORED — isModalOpen() returned ${isOpen} for group ${SLAYER_REWARDS_PANEL_GROUP_ID}, component=${componentId} action=${actionId}`);
                return;
            }
            handle(event);
        });
    }

    for (let i = 0; i < TAB_LABELS.length; i++) {
        const tabIndex = i as TabIndex;
        register(ComponentIds.TAB_BASE + i, `slayer_rewards_tab_${i}`, ({ player }) => {
            activeTabByPlayer.set(player.id, tabIndex);
            pendingSelectionByPlayer.delete(player.id);
            refreshSlayerRewardsPanel(player, services);
        });
    }

    for (let rowIndex = 0; rowIndex < ComponentIds.MAX_ROWS; rowIndex++) {
        register(ComponentIds.DIALOGUE_ROW_HITZONE_BASE + rowIndex, `slayer_rewards_row_${rowIndex}`, ({ player }) => {
            const tab = getActiveTab(player.id);

            if (!isSelected(player.id, tab, rowIndex)) {
                // First click: select + show full info, don't act yet.
                pendingSelectionByPlayer.set(player.id, { tab, rowIndex });
                describeRowForSelection(services, player, tab, rowIndex);
                refreshSlayerRewardsPanel(player, services);
                return;
            }

            // Second click on the same row: confirm.
            pendingSelectionByPlayer.delete(player.id);
            if (tab === 0) {
                reportPurchaseResult(services, player, purchaseUnlockOrExtend(player, SLAYER_UNLOCK_CATALOG[rowIndex]));
            } else if (tab === 1) {
                reportPurchaseResult(services, player, purchaseUnlockOrExtend(player, SLAYER_EXTEND_CATALOG[rowIndex]));
            } else if (tab === 2) {
                reportPurchaseResult(services, player, purchaseBuyItem(player, rowIndex));
            } else {
                handleTaskRowClick(services, player, rowIndex);
            }
            refreshSlayerRewardsPanel(player, services);
        });
    }

    logger.info(`[slayer-rewards] registered ${TAB_LABELS.length} tab + ${ComponentIds.MAX_ROWS} row button handlers for group ${SLAYER_REWARDS_PANEL_GROUP_ID}.`);
}

export { getSlayerUnlockEntry, getSlayerExtendEntry, getSlayerBuyEntry };
