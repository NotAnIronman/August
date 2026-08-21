import { SkillId } from "../../../../../client/rs/skill/skills";
import type { SkillGuideData } from "../types";

// TODO: fill in tabs - see data/smithing.ts for a fully worked example.
// Each tab needs a label and a list of entries ({ itemId, level, name,
// description? }). Look up real item ids in server/data/items.json by
// name - do not guess/invent one.
export const rangedSkillGuide: SkillGuideData = {
    skillId: SkillId.Ranged,
    tabs: [],
};
