import type { DiaryAreaTasks } from "./types";

import { ardougneDiaryTasks } from "./data/ardougne";
import { desertDiaryTasks } from "./data/desert";
import { faladorDiaryTasks } from "./data/falador";
import { fremennikDiaryTasks } from "./data/fremennik";
import { kandarinDiaryTasks } from "./data/kandarin";
import { karamjaDiaryTasks } from "./data/karamja";
import { kourendAndKebosDiaryTasks } from "./data/kourendandkebos";
import { lumbridgeAndDraynorDiaryTasks } from "./data/lumbridgeanddraynor";
import { morytaniaDiaryTasks } from "./data/morytania";
import { varrockDiaryTasks } from "./data/varrock";
import { westernProvincesDiaryTasks } from "./data/westernprovinces";
import { wildernessDiaryTasks } from "./data/wilderness";

/**
 * Areas in the same order as DIARY_AREAS in diaryJournalWidgets.ts (area
 * id = array index). Keep this order in sync with that array - it's how
 * the diary panel's areaId maps to which task list it shows.
 */
export const DIARY_AREA_TASKS: readonly DiaryAreaTasks[] = [
    karamjaDiaryTasks,
    ardougneDiaryTasks,
    faladorDiaryTasks,
    fremennikDiaryTasks,
    kandarinDiaryTasks,
    desertDiaryTasks,
    lumbridgeAndDraynorDiaryTasks,
    morytaniaDiaryTasks,
    varrockDiaryTasks,
    wildernessDiaryTasks,
    westernProvincesDiaryTasks,
    kourendAndKebosDiaryTasks,
];

export function getDiaryAreaTasks(areaId: number): DiaryAreaTasks | undefined {
    return DIARY_AREA_TASKS[areaId];
}
