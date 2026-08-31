import { REWARD_DISPLAY_PANEL_GROUP_ID } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { openUiPanel, packUid } from "@server/content/gamemodes/vanilla/uikit/panelData";
import type { PlayerState } from "@server/game/player";
import type { ScriptServices } from "@server/game/scripts/types";

export const REWARD_DISPLAY_SLOT_BASE = 1000;
// Matches the client's 4x4 grid in rewardDisplayPanel.ts.
const REWARD_DISPLAY_CAPACITY = 16;

export type VisualReward = { itemId: number; quantity: number };

/** Opens the shared visual-only reward grid. It never owns or moves items. */
export function openRewardDisplay(
    player: PlayerState,
    services: ScriptServices,
    title: string,
    rewards: readonly VisualReward[],
): void {
    openUiPanel(services, player, REWARD_DISPLAY_PANEL_GROUP_ID, title);
    for (let slot = 0; slot < REWARD_DISPLAY_CAPACITY; slot += 1) {
        const reward = rewards[slot];
        services.dialog.queueWidgetEvent(player.id, {
            action: "set_item",
            uid: packUid(REWARD_DISPLAY_PANEL_GROUP_ID, REWARD_DISPLAY_SLOT_BASE + slot * 2 + 1),
            itemId: reward?.itemId ?? -1,
            quantity: reward?.quantity ?? 0,
        });
    }
}
