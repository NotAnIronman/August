import { SkillId } from "../../../../../client/rs/skill/skills";
import type { SkillGuideData } from "../types";

export const smithingSkillGuide: SkillGuideData = {
    skillId: SkillId.Smithing,
    tabs: [
        {
            label: "Smelting",
                entries: [
                    { itemId: 2349, level: 1, name: "Bronze", description: "1 tin ore & 1 copper ore" },
                    { itemId: 9467, level: 8, name: "Blurite", description: "(after Knight's Sword quest)" },
                    { itemId: 2351, level: 15, name: "Iron", description: "50% chance of success" },
                    { itemId: 2355, level: 20, name: "Silver" },
                    { itemId: 2353, level: 30, name: "Steel", description: "2 coal & 1 iron ore" },
                    { itemId: 2357, level: 40, name: "Gold" },
                    { itemId: 2359, level: 50, name: "Mithril", description: "4 coal & 1 mithril ore" },
                    { itemId: 2361, level: 70, name: "Adamant", description: "6 coal & 1 adamantite ore" },
                    { itemId: 2363, level: 85, name: "Rune", description: "8 coal & 1 runite ore" },
            ],
        },
        { label: "Bronze",
            entries: [
                { itemId: 995, level: 1, name: "Bronze Dagger", description: "1 Bronze Bar" },
            ],

        },
        { label: "Blurite", entries: [] },
        { label: "Iron", entries: [] },
        { label: "Steel", entries: [] },
        { label: "Mithril", entries: [] },
        { label: "Adamant", entries: [] },
        { label: "Rune", entries: [] },
        { label: "Dragon", entries: [] },
    ],
};
