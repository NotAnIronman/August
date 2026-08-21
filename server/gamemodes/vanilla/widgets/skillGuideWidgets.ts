import {
    VARBIT_SKILL_GUIDE_SKILL,
    VARBIT_SKILL_GUIDE_SUBSECTION,
} from "../../../../client/common/vars";
import { SKILL_GUIDE_PANEL_GROUP_ID } from "../../../../client/common/ui/widgets";
import { ComponentIds } from "../../../../client/widgets/uikit/types";
import { SkillId } from "../../../../client/rs/skill/skills";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { getSkillGuideData } from "../skillGuide";
import { openUiPanel, sendUiIconRows, sendUiTabs } from "../uikit/panelData";

/**
 * Skill guide widget handlers - opens a tabbed skill guide panel when a
 * skill tab is clicked, driven by server/gamemodes/vanilla/skillGuide/
 * data/<skill>.ts.
 *
 * Built entirely on the UI kit (server/gamemodes/vanilla/uikit/
 * panelData.ts + client/widgets/custom/skillGuidePanel.ts) - this file
 * only supplies skill-guide-specific data (which skill's data to load,
 * the skills-tab-to-skill mapping) and no longer duplicates the
 * frame/tab/row population logic every other custom panel also needs.
 */

const SKILLS_TAB_GROUP_ID = 320;

type SkillGuideEntryDef = {
    childId: number;
    skillVarbitValue: number;
    skillName: string;
    skillId: SkillId;
};

/**
 * Skill guide buttons in interface 320 mapped to their guide varbit values.
 * Based on RSMod's SkillGuide.kt enum.
 */
const SKILL_GUIDE_ENTRIES: readonly SkillGuideEntryDef[] = [
    { childId: 1, skillVarbitValue: 1, skillName: "Attack", skillId: SkillId.Attack },
    { childId: 2, skillVarbitValue: 2, skillName: "Strength", skillId: SkillId.Strength },
    { childId: 3, skillVarbitValue: 5, skillName: "Defence", skillId: SkillId.Defence },
    { childId: 4, skillVarbitValue: 3, skillName: "Ranged", skillId: SkillId.Ranged },
    { childId: 5, skillVarbitValue: 7, skillName: "Prayer", skillId: SkillId.Prayer },
    { childId: 6, skillVarbitValue: 4, skillName: "Magic", skillId: SkillId.Magic },
    { childId: 7, skillVarbitValue: 12, skillName: "Runecrafting", skillId: SkillId.Runecraft },
    { childId: 8, skillVarbitValue: 22, skillName: "Construction", skillId: SkillId.Construction },
    { childId: 9, skillVarbitValue: 6, skillName: "Hitpoints", skillId: SkillId.Hitpoints },
    { childId: 10, skillVarbitValue: 8, skillName: "Agility", skillId: SkillId.Agility },
    { childId: 11, skillVarbitValue: 9, skillName: "Herblore", skillId: SkillId.Herblore },
    { childId: 12, skillVarbitValue: 10, skillName: "Thieving", skillId: SkillId.Thieving },
    { childId: 13, skillVarbitValue: 11, skillName: "Crafting", skillId: SkillId.Crafting },
    { childId: 14, skillVarbitValue: 19, skillName: "Fletching", skillId: SkillId.Fletching },
    { childId: 15, skillVarbitValue: 20, skillName: "Slayer", skillId: SkillId.Slayer },
    { childId: 16, skillVarbitValue: 23, skillName: "Hunter", skillId: SkillId.Hunter },
    { childId: 17, skillVarbitValue: 13, skillName: "Mining", skillId: SkillId.Mining },
    { childId: 18, skillVarbitValue: 14, skillName: "Smithing", skillId: SkillId.Smithing },
    { childId: 19, skillVarbitValue: 15, skillName: "Fishing", skillId: SkillId.Fishing },
    { childId: 20, skillVarbitValue: 16, skillName: "Cooking", skillId: SkillId.Cooking },
    { childId: 21, skillVarbitValue: 17, skillName: "Firemaking", skillId: SkillId.Firemaking },
    { childId: 22, skillVarbitValue: 18, skillName: "Woodcutting", skillId: SkillId.Woodcutting },
    { childId: 23, skillVarbitValue: 21, skillName: "Farming", skillId: SkillId.Farming },
    { childId: 24, skillVarbitValue: 24, skillName: "Sailing", skillId: SkillId.Sailing },
];

function findSkillGuideEntryByVarbitValue(value: number): SkillGuideEntryDef | undefined {
    return SKILL_GUIDE_ENTRIES.find((e) => e.skillVarbitValue === value);
}

/**
 * Populates the sidebar tabs + the currently selected tab's entries.
 * Safe to call repeatedly (tab clicks) without reopening the modal.
 */
function renderSkillGuidePanel(
    services: ScriptServices,
    playerId: number,
    skillId: SkillId,
    activeTabIndex: number,
): void {
    const data = getSkillGuideData(skillId);
    const tabs = data.tabs;
    const clampedIndex =
        tabs.length === 0 ? 0 : Math.min(Math.max(activeTabIndex, 0), tabs.length - 1);

    sendUiTabs(services, playerId, SKILL_GUIDE_PANEL_GROUP_ID, tabs, clampedIndex);
    sendUiIconRows(
        services,
        playerId,
        SKILL_GUIDE_PANEL_GROUP_ID,
        tabs[clampedIndex]?.entries ?? [],
    );
}

export function registerSkillGuideWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    // Register a handler for each skill in the skills tab (interface 320)
    // Uses onButton since binary IF_BUTTON packets don't send option strings
    for (const entry of SKILL_GUIDE_ENTRIES) {
        registry.onButton(SKILLS_TAB_GROUP_ID, entry.childId, (event) => {
            const player = event.player;
            const playerId = player.id;

            player.varps.setVarbitValue(VARBIT_SKILL_GUIDE_SUBSECTION, 0);
            player.varps.setVarbitValue(VARBIT_SKILL_GUIDE_SKILL, entry.skillVarbitValue);
            services.variables.queueVarbit?.(playerId, VARBIT_SKILL_GUIDE_SUBSECTION, 0);
            services.variables.queueVarbit?.(
                playerId,
                VARBIT_SKILL_GUIDE_SKILL,
                entry.skillVarbitValue,
            );

            openUiPanel(services, player, SKILL_GUIDE_PANEL_GROUP_ID, `${entry.skillName} Guide`, {
                varbits: {
                    [VARBIT_SKILL_GUIDE_SUBSECTION]: 0,
                    [VARBIT_SKILL_GUIDE_SKILL]: entry.skillVarbitValue,
                },
            });

            renderSkillGuidePanel(services, playerId, entry.skillId, 0);
        });
    }

    // Sidebar tab clicks - switch the active tab without reopening the modal.
    for (let i = 0; i < ComponentIds.MAX_TABS; i++) {
        registry.onButton(
            SKILL_GUIDE_PANEL_GROUP_ID,
            ComponentIds.TAB_BASE + i,
            (event) => {
                const player = event.player;
                const playerId = player.id;
                const skillVarbitValue = player.varps.getVarbitValue(VARBIT_SKILL_GUIDE_SKILL);
                const entry = findSkillGuideEntryByVarbitValue(skillVarbitValue);
                if (!entry) return;

                player.varps.setVarbitValue(VARBIT_SKILL_GUIDE_SUBSECTION, i);
                services.variables.queueVarbit?.(playerId, VARBIT_SKILL_GUIDE_SUBSECTION, i);

                renderSkillGuidePanel(services, playerId, entry.skillId, i);
            },
        );
    }
}
