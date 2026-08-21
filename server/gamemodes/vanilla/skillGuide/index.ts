import { SkillId } from "../../../../client/rs/skill/skills";
import type { SkillGuideData } from "./types";

import { agilitySkillGuide } from "./data/agility";
import { attackSkillGuide } from "./data/attack";
import { constructionSkillGuide } from "./data/construction";
import { cookingSkillGuide } from "./data/cooking";
import { craftingSkillGuide } from "./data/crafting";
import { defenceSkillGuide } from "./data/defence";
import { farmingSkillGuide } from "./data/farming";
import { firemakingSkillGuide } from "./data/firemaking";
import { fishingSkillGuide } from "./data/fishing";
import { fletchingSkillGuide } from "./data/fletching";
import { herbloreSkillGuide } from "./data/herblore";
import { hitpointsSkillGuide } from "./data/hitpoints";
import { hunterSkillGuide } from "./data/hunter";
import { magicSkillGuide } from "./data/magic";
import { miningSkillGuide } from "./data/mining";
import { prayerSkillGuide } from "./data/prayer";
import { rangedSkillGuide } from "./data/ranged";
import { runecraftSkillGuide } from "./data/runecraft";
import { sailingSkillGuide } from "./data/sailing";
import { slayerSkillGuide } from "./data/slayer";
import { smithingSkillGuide } from "./data/smithing";
import { strengthSkillGuide } from "./data/strength";
import { thievingSkillGuide } from "./data/thieving";
import { woodcuttingSkillGuide } from "./data/woodcutting";

/** SkillId -> that skill's guide data. Add nothing here when filling in
 * data - just edit the per-skill file under ./data/, this map already
 * points at all 24 of them. */
export const SKILL_GUIDE_DATA: Readonly<Record<SkillId, SkillGuideData>> = {
    [SkillId.Attack]: attackSkillGuide,
    [SkillId.Defence]: defenceSkillGuide,
    [SkillId.Strength]: strengthSkillGuide,
    [SkillId.Hitpoints]: hitpointsSkillGuide,
    [SkillId.Ranged]: rangedSkillGuide,
    [SkillId.Prayer]: prayerSkillGuide,
    [SkillId.Magic]: magicSkillGuide,
    [SkillId.Cooking]: cookingSkillGuide,
    [SkillId.Woodcutting]: woodcuttingSkillGuide,
    [SkillId.Fletching]: fletchingSkillGuide,
    [SkillId.Fishing]: fishingSkillGuide,
    [SkillId.Firemaking]: firemakingSkillGuide,
    [SkillId.Crafting]: craftingSkillGuide,
    [SkillId.Smithing]: smithingSkillGuide,
    [SkillId.Mining]: miningSkillGuide,
    [SkillId.Herblore]: herbloreSkillGuide,
    [SkillId.Agility]: agilitySkillGuide,
    [SkillId.Thieving]: thievingSkillGuide,
    [SkillId.Slayer]: slayerSkillGuide,
    [SkillId.Farming]: farmingSkillGuide,
    [SkillId.Runecraft]: runecraftSkillGuide,
    [SkillId.Hunter]: hunterSkillGuide,
    [SkillId.Construction]: constructionSkillGuide,
    [SkillId.Sailing]: sailingSkillGuide,
};

export function getSkillGuideData(skillId: SkillId): SkillGuideData {
    return SKILL_GUIDE_DATA[skillId] ?? { skillId, tabs: [] };
}
