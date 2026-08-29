import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    MERLINS_CRYSTAL_QUEST_KEY,
    STAGE_BITS,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_MERLINS_CRYSTAL,
} from "@server/content/gamemodes/vanilla/quests/definitions/merlins-crystal/constants";
import { registerMerlinsCrystalInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/merlins-crystal/interactions";
import { buildMerlinsCrystalJournal } from "@server/content/gamemodes/vanilla/quests/definitions/merlins-crystal/journal";

export { MERLINS_CRYSTAL_QUEST_KEY } from "@server/content/gamemodes/vanilla/quests/definitions/merlins-crystal/constants";

export const merlinsCrystalQuest: QuestDefinition = {
    key: MERLINS_CRYSTAL_QUEST_KEY,
    name: "Merlin's Crystal",
    members: true,
    varpId: VARP_MERLINS_CRYSTAL,
    stageBits: STAGE_BITS,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 6,
        other: ["Excalibur", "Become a Knight of the Round Table"],
    },
    rewardItemId: ITEM.excalibur,
    overviewStartText: "speaking to <col=800000>King Arthur<col=000080> in Camelot Castle.",
    buildJournal(player, services): string[] {
        return buildMerlinsCrystalJournal(player, services, merlinsCrystalQuest);
    },
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerMerlinsCrystalInteractions(merlinsCrystalQuest, registry, services);
    },
};
