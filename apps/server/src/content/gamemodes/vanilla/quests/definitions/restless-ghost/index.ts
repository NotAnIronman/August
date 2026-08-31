import { SkillId } from "@august/osrs-engine/skill/skills";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    ITEM,
    RESTLESS_GHOST_KEY,
    STAGE_COMPLETE,
    STAGE_STARTED,
    VARP_RESTLESS_GHOST,
} from "@server/content/gamemodes/vanilla/quests/definitions/restless-ghost/constants";
import { registerRestlessGhostInteractions } from "@server/content/gamemodes/vanilla/quests/definitions/restless-ghost/interactions";
import { buildRestlessGhostJournal } from "@server/content/gamemodes/vanilla/quests/definitions/restless-ghost/journal";

export const restlessGhostQuest: QuestDefinition = {
    key: RESTLESS_GHOST_KEY,
    name: "The Restless Ghost",
    varpId: VARP_RESTLESS_GHOST,
    startedValue: STAGE_STARTED,
    completionValue: STAGE_COMPLETE,
    rewards: {
        questPoints: 1,
        xp: [{ skillId: SkillId.Prayer, amount: 1125, label: "Prayer" }],
        other: ["Amulet of ghostspeak"],
    },
    rewardItemId: ITEM.ghostSkull,
    overviewStartText:
        "speaking to <col=800000>Father Aereck<col=000080> in the church east of <col=800000>Lumbridge Castle<col=000080>.",
    buildJournal: buildRestlessGhostJournal,
    register(registry: IScriptRegistry, services: ScriptServices): void {
        registerRestlessGhostInteractions(restlessGhostQuest, registry, services);
    },
};
