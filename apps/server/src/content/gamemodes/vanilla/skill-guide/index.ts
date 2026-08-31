import { SkillId } from "@august/osrs-engine/skill/skills";
import type { SkillGuideData } from "@server/content/gamemodes/vanilla/skill-guide/types";

import { agilitySkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/agility";
import { attackSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/attack";
import { constructionSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/construction";
import { cookingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/cooking";
import { craftingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/crafting";
import { defenceSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/defence";
import { farmingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/farming";
import { firemakingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/firemaking";
import { fishingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/fishing";
import { fletchingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/fletching";
import { herbloreSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/herblore";
import { hitpointsSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/hitpoints";
import { hunterSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/hunter";
import { magicSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/magic";
import { miningSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/mining";
import { prayerSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/prayer";
import { rangedSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/ranged";
import { runecraftSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/runecraft";
import { sailingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/sailing";
import { slayerSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/slayer";
import { smithingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/smithing";
import { strengthSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/strength";
import { thievingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/thieving";
import { woodcuttingSkillGuide } from "@server/content/gamemodes/vanilla/skill-guide/data/woodcutting";

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
