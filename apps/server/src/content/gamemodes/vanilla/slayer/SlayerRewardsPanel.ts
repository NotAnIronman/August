import { SLAYER_REWARDS_PANEL_GROUP_ID } from "@august/protocol/ui/widgets";
import { ComponentIds, type UiTextRow } from "@august/protocol/uikit/contracts";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";
import {
    openUiPanel,
    sendUiRowClickZones,
    sendUiTextRows,
} from "@server/content/gamemodes/vanilla/uikit/panelData";
import {
    getAllSlayerRewards,
    getSlayerReward,
    type SlayerRewardDefinition,
} from "@server/content/gamemodes/vanilla/slayer/SlayerRewardShop";
import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer/SlayerTaskTracker";

/**
 * Custom Slayer Rewards panel — a clickable list of purchasable rewards,
 * styled to resemble the real interface (points shown in the title,
 * cost/owned status colour-coded per row). Built entirely from this
 * project's own proven UI kit (uikit/panelData.ts) rather than the real
 * cache interface, which this client has no rendering support for at all
 * (checked — no bespoke code anywhere, and the generic widget renderer
 * needs a registered group id/layout the real interface was never given).
 *
 * IMPORTANT — rowKind must be "text" (or "mixed"), not "icon": clickable
 * row hit-zones (DIALOGUE_ROW_HITZONE_BASE) are only ever built for
 * text-based content in the client's PanelBuilder.ts. An earlier version
 * of this panel used icon rows with click-zones anyway, AND never
 * registered a client-side panel file for the new group id at all — the
 * client had no widget tree whatsoever for it, and processing widget
 * events against a nonexistent tree corrupted its interaction state
 * entirely (broke all further clicks, no exceptions visible). Fixed by
 * following the exact same combination already proven by the Dialogue
 * Tree Editor: text rows + clickableRows (see
 * apps/client/src/ui/widgets/custom/slayerRewardsPanel.ts).
 *
 * Deliberately does not use a currency item or reward "items" for
 * anything except the one reward that genuinely is a real item (the
 * Slayer helmet) — see SlayerRewardShop.ts's doc comment.
 */
function rewardRowLine(reward: SlayerRewardDefinition, owned: boolean): UiTextRow {
    return owned
        ? { kind: "text", text: `${reward.name} — Owned`, style: { color: "00ff00" } }
        : { kind: "text", text: `${reward.name} — ${reward.cost} points`, style: { color: "ff981f" } };
}

export function openSlayerRewardsPanel(player: PlayerState, services: ScriptServices): void {
    const points = slayerTaskTracker.getPoints(player.id);
    openUiPanel(services, player, SLAYER_REWARDS_PANEL_GROUP_ID, `Slayer Rewards - ${points} points`);

    const rewards = getAllSlayerRewards();
    sendUiTextRows(
        services,
        player.id,
        SLAYER_REWARDS_PANEL_GROUP_ID,
        rewards.map((reward) =>
            rewardRowLine(reward, reward.oneTime === true && slayerTaskTracker.hasUnlock(player.id, reward.key)),
        ),
    );
    sendUiRowClickZones(services, player.id, SLAYER_REWARDS_PANEL_GROUP_ID, rewards.length);
}

/** Re-renders the panel in place (after a purchase) without a full reopen. */
function refreshSlayerRewardsPanel(player: PlayerState, services: ScriptServices): void {
    openSlayerRewardsPanel(player, services);
}

export type PurchaseRewardResult =
    | { kind: "purchased"; reward: SlayerRewardDefinition; remainingPoints: number }
    | { kind: "already-owned" }
    | { kind: "not-enough-points"; required: number; available: number }
    | { kind: "unknown-reward" }
    | { kind: "inventory-full" };

function purchaseReward(player: PlayerState, rewardKey: string): PurchaseRewardResult {
    const reward = getSlayerReward(rewardKey);
    if (!reward) return { kind: "unknown-reward" };

    if (reward.oneTime && slayerTaskTracker.hasUnlock(player.id, reward.key)) {
        return { kind: "already-owned" };
    }

    const available = slayerTaskTracker.getPoints(player.id);
    if (available < reward.cost) {
        return { kind: "not-enough-points", required: reward.cost, available };
    }

    if (reward.kind === "item") {
        const quantity = reward.itemQuantity ?? 1;
        const result = player.items.addItem(reward.itemId, quantity, { assureFullInsertion: true });
        if (result.completed < quantity) return { kind: "inventory-full" };
    }

    slayerTaskTracker.spendPoints(player.id, reward.cost);
    if (reward.oneTime) slayerTaskTracker.grantUnlock(player.id, reward.key);

    const remainingPoints = slayerTaskTracker.getPoints(player.id);
    return { kind: "purchased", reward, remainingPoints };
}

export function registerSlayerRewardsPanelHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    const handlers = services.modalActionHandlers ?? new Map();

    handlers.set(SLAYER_REWARDS_PANEL_GROUP_ID, (player: PlayerState, componentId: number) => {
        const rewards = getAllSlayerRewards();
        const rowIndex = componentId - ComponentIds.DIALOGUE_ROW_HITZONE_BASE;
        if (rowIndex < 0 || rowIndex >= rewards.length) return false;

        const reward = rewards[rowIndex];
        const result = purchaseReward(player, reward.key);
        switch (result.kind) {
            case "purchased":
                services.messaging.sendGameMessage(
                    player,
                    `Purchased ${result.reward.name} for ${result.reward.cost} Slayer points (${result.remainingPoints} remaining).`,
                );
                break;
            case "already-owned":
                services.messaging.sendGameMessage(player, `You already own ${reward.name}.`);
                break;
            case "not-enough-points":
                services.messaging.sendGameMessage(
                    player,
                    `You need ${result.required} points for ${reward.name} (you have ${result.available}).`,
                );
                break;
            case "inventory-full":
                services.messaging.sendGameMessage(player, "You don't have space in your inventory for that.");
                break;
            case "unknown-reward":
                return false;
        }
        refreshSlayerRewardsPanel(player, services);
        return true;
    });

    services.modalActionHandlers = handlers;
}
