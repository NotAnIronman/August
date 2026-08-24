import type { PlayerState } from "../../../../../src/game/player";
import type { ScriptServices } from "../../../../../src/game/scripts/types";
import { getQuestStage } from "../../QuestService";
import type { QuestDefinition } from "../../types";
import {
    STAGE_CHOP_ORANGE_TREE,
    STAGE_COMPLETE,
    STAGE_DEFEAT_CUTHBERT,
    STAGE_FIND_EVIDENCE,
    STAGE_FRAME_THE_FLIES,
    STAGE_NOT_STARTED,
    STAGE_PLANT_EVIDENCE,
    STAGE_REPORT_SABOTAGE,
    STAGE_REPORT_TO_MARCELLUS,
    STAGE_RETURN_TO_FROGS,
    STAGE_RETURN_TO_MARCELLUS,
    STAGE_SABOTAGE_LILY_PAD,
    STAGE_SPEAK_TO_BLUE_FROGS,
    STAGE_SPEAK_TO_FROG_LEADER,
    STAGE_SPEAK_TO_MARCELLUS_ABOUT_FLIES,
    STAGE_SPEAK_TO_ORANGE_FROGS,
    STAGE_START_CUTSCENE,
} from "./constants";

/**
 * State-specific journal authored for the server quest implementation.
 * It intentionally describes objectives rather than copying the wiki's
 * transcript, while retaining the cache's real stage progression.
 */
export function buildLilyPadJournal(
    player: PlayerState,
    _services: ScriptServices,
    quest: QuestDefinition,
): string[] {
    const stage = getQuestStage(player, quest);

    if (stage === STAGE_NOT_STARTED) {
        return [
            "I can start this quest by talking to <col=800000>Marcellus</col> in the <col=800000>Locus Oasis</col>.",
            "",
            "<col=000080>Difficulty:</col>",
            "<col=800000>Novice</col>",
            "<col=000080>Length:</col>",
            "<col=800000>Very Short</col>",
            "<col=000080>Storyline:</col>",
            "<col=800000>Standalone</col>",
            "<col=000080>Requirements:</col>",
            "<col=800000>Children of the Sun</col>",
            "<col=800000>Level 15 Woodcutting</col>",
        ];
    }

    if (stage >= STAGE_COMPLETE) {
        return [
            "<str>I helped the frogs resolve their labour dispute.</str>",
            "<str>I exposed the flies' scheme and defeated Cuthbert, Lord of Dread.</str>",
            "",
            "<col=ff0000>QUEST COMPLETE!</col>",
        ];
    }

    const completed = "<str>I agreed to help Marcellus settle the dispute at Locus Oasis.</str>";
    if (stage === STAGE_SPEAK_TO_BLUE_FROGS) {
        return [completed, "", "I should speak to <col=800000>Sue and Gary</col> from the blue frogs."];
    }
    if (stage === STAGE_RETURN_TO_MARCELLUS) {
        return [completed, "<str>I heard the blue frogs' concerns.</str>", "", "I should return to <col=800000>Marcellus</col>."];
    }
    if (stage === STAGE_SPEAK_TO_FROG_LEADER) {
        return [completed, "", "I should ask <col=800000>Sue and Gary</col> who leads the frogs."];
    }
    if (stage === STAGE_SPEAK_TO_ORANGE_FROGS) {
        return [completed, "", "I should speak to <col=800000>Jane and Dave</col> from the orange frogs."];
    }
    if (stage === STAGE_CHOP_ORANGE_TREE) {
        return [completed, "", "I need an axe to chop down the <col=800000>orange tree</col> near the frogs."];
    }
    if (stage === STAGE_SABOTAGE_LILY_PAD) {
        return [completed, "<str>I chopped down the orange tree.</str>", "", "I should sabotage the <col=800000>lily pad</col>."];
    }
    if (stage === STAGE_REPORT_SABOTAGE) {
        return [completed, "<str>I sabotaged the lily pad.</str>", "", "I should tell <col=800000>Sue and Gary</col> what happened."];
    }
    if (stage === STAGE_START_CUTSCENE) {
        return [completed, "", "I should speak to <col=800000>Sue and Gary</col> and see how the frogs respond."];
    }
    if (stage === STAGE_SPEAK_TO_MARCELLUS_ABOUT_FLIES) {
        return [completed, "", "I should speak to <col=800000>Marcellus</col> about the flies."];
    }
    if (stage === STAGE_FRAME_THE_FLIES) {
        return [completed, "", "I should help <col=800000>Sue and Gary</col> find a way to expose the flies."];
    }
    if (stage === STAGE_FIND_EVIDENCE) {
        return [completed, "", "I should search the <col=800000>chest</col> for something that can be used as evidence."];
    }
    if (stage === STAGE_PLANT_EVIDENCE) {
        return [completed, "<str>I found a letter and a plushy in the chest.</str>", "", "I should plant the plushy in the <col=800000>capybara dung</col>."];
    }
    if (stage === STAGE_DEFEAT_CUTHBERT) {
        return [completed, "<str>I planted the evidence.</str>", "", "I should inspect the <col=800000>capybara dung</col> and deal with Cuthbert."];
    }
    if (stage === STAGE_REPORT_TO_MARCELLUS) {
        return [completed, "<str>I defeated Cuthbert, Lord of Dread.</str>", "", "I should report back to <col=800000>Marcellus</col>."];
    }
    if (stage === STAGE_RETURN_TO_FROGS) {
        return [completed, "<str>I reported the truth to Marcellus.</str>", "", "I should return to <col=800000>Sue and Gary</col> to settle the dispute."];
    }

    return [completed, "", "I should continue investigating the frogs' dispute at <col=800000>Locus Oasis</col>."];
}
