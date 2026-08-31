import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    STAGE_COMPLETE,
    STAGE_STARTED,
    TREE_GNOME_VILLAGE_QUEST_KEY,
    VARP_TREE_GNOME_VILLAGE,
} from "@server/content/gamemodes/vanilla/quests/definitions/tree-gnome-village/constants";
import { registerTreeGnomeVillageInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/tree-gnome-village/interactions";
import { buildTreeGnomeVillageJournal } from "@server/content/gamemodes/vanilla/quests/definitions/tree-gnome-village/journal";

export const treeGnomeVillageQuest: QuestDefinition = {
    key: TREE_GNOME_VILLAGE_QUEST_KEY,
    name: "Tree Gnome Village",
    members: true,
    varpId: VARP_TREE_GNOME_VILLAGE,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 2,
        xp: [{ skillId: SkillId.Attack, amount: 11_450, label: "Attack" }],
        items: [{ itemId: ITEM.gnomeAmulet, quantity: 1, label: "Gnome amulet" }],
        other: ["Use of the Spirit Tree network"],
    },
    rewardItemId: ITEM.gnomeAmulet,
    overviewStartText: "speaking to <col=800000>King Bolren<col=000080> in the Tree Gnome Village maze.",
    buildJournal(player, services): string[] {
        return buildTreeGnomeVillageJournal(player, services, treeGnomeVillageQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerTreeGnomeVillageInteractions(treeGnomeVillageQuest, registry, services);
    },
};
