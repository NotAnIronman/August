import type { PlayerState } from "@server/game/player";
import { getQuestDefinition } from "./QuestRegistry";
import { getQuestStage } from "./QuestService";

const QUEST_BONES = new Map<number, { quest: string; variants: readonly number[] }>([
    [7824, { quest: "Rag and Bone Man I", variants: [7824, 7825] }],
    [7836, { quest: "Rag and Bone Man II", variants: [7836, 7837] }],
]);

/** Restrictions shared by imported and authored ordinary NPC loot tables. */
export function canReceiveQuestDrop(itemId: number, player: PlayerState | undefined): boolean {
    // Witch's Potion awards this itself on npc:death, with quest stage/ownership checks.
    // Never award a second, unconditionally imported copy through the ordinary loot table.
    if (itemId === 300) return false;
    const requirement = QUEST_BONES.get(itemId);
    if (!requirement) return true;
    if (!player) return false;
    const quest = getQuestDefinition(requirement.quest);
    // A journal catalog entry is not an implemented quest. Fail closed until authored.
    if (!quest) return false;
    const stage = getQuestStage(player, quest);
    if (stage < quest.startedValue || stage >= quest.completionValue) return false;
    return !requirement.variants.some(id => player.items.hasItem(id) ||
        player.bank.getBankEntries().some(entry => entry.itemId === id && entry.quantity > 0));
}
