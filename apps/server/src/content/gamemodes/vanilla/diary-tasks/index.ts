import type { DiaryAreaTasks } from "@server/content/gamemodes/vanilla/diary-tasks/types";

import { ardougneDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/ardougne";
import { desertDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/desert";
import { faladorDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/falador";
import { fremennikDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/fremennik";
import { kandarinDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/kandarin";
import { karamjaDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/karamja";
import { kourendAndKebosDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/kourendandkebos";
import { lumbridgeAndDraynorDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/lumbridgeanddraynor";
import { morytaniaDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/morytania";
import { varrockDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/varrock";
import { westernProvincesDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/westernprovinces";
import { wildernessDiaryTasks } from "@server/content/gamemodes/vanilla/diary-tasks/data/wilderness";

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
