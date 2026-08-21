import type { DiaryAreaTasks } from "../types";

// TODO: fill in descriptions (and triggers once ready - see types.ts).
// Slot counts below match the real tier totals already tracked in
// diaryJournalWidgets.ts's DIARY_AREAS - do not add/remove slots without
// also updating that total, or the tier counter (e.g. "Easy 2/12")
// will be wrong.
export const lumbridgeAndDraynorDiaryTasks: DiaryAreaTasks = {
    areaName: "Lumbridge & Draynor",
    easy: { tasks: [
        { description: "Kill a goblin in Lumbridge", trigger: { type: "kill", npcId: 3030 } },
        { description: "Do this thing" /* TODO */ },
        { description: "Search a thing" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
    ] },
    medium: { tasks: [
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
    ] },
    hard: { tasks: [
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
    ] },
    elite: { tasks: [
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
        { description: "" /* TODO */ },
    ] },
};
