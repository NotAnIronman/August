/**
 * Achievement diary task data schema - fill-in-by-hand layout.
 *
 * One file per area under ./data/<area>.ts, each exporting a single
 * DiaryAreaTasks object with four tiers (easy/medium/hard/elite), each
 * holding a fixed-size array of task stubs already sized to match the
 * real tier totals already tracked elsewhere in this codebase (see
 * DIARY_AREAS in diaryJournalWidgets.ts) - so you're filling in
 * descriptions/triggers for exactly the right number of tasks, not
 * guessing counts.
 *
 * trigger is optional and can be left out entirely while you're doing a
 * first pass of just descriptions - the tracking system (see the design
 * note in diaryTaskTracker.ts) treats a task with no trigger as "not
 * auto-tracked", not as an error.
 */

/**
 * Rectangular tile-coordinate bounds a trigger can be restricted to, so
 * e.g. "kill a goblin in Lumbridge" only counts goblins killed within
 * Lumbridge, not a goblin killed anywhere in the game. Checked against
 * the triggering NPC/object's tile position (min/max inclusive).
 *
 * level is the dungeon/floor plane (0 = ground floor) - omit it to match
 * any plane at that x/y (rarely what you want if there's a dungeon
 * directly below/above the surface area, so set it when in doubt).
 *
 * Finding coordinates: right-click -> Examine on the ground, or check
 * an existing loc/npc spawn near the area in data/generated/server/*.json for
 * real tile values already used nearby.
 */
export interface DiaryTaskArea {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    level?: number;
}

/**
 * What action completes this task, and the auto-tracking system's
 * matching parameters for it. All five trigger types from your message
 * are represented. `count` defaults to 1 (a single kill/collect/craft/
 * interact) if omitted - only set it for tasks that need e.g. "kill 3".
 *
 * `area` is optional on the types where location matters (kill/collect/
 * interact/talk) - omit it and the trigger fires anywhere in the game,
 * which is almost never what you want for "do X in Y place" tasks (see
 * the note above your Lumbridge goblin task). craft has no area since
 * you can usually craft an item from anywhere with the right tool.
 */
export type DiaryTaskTrigger =
    | { type: "kill"; npcId: number; count?: number; area?: DiaryTaskArea }
    | { type: "collect"; itemId: number; count?: number; area?: DiaryTaskArea }
    | { type: "craft"; itemId: number; count?: number }
    | {
          type: "interact";
          objectId: number;
          action?: string;
          count?: number;
          area?: DiaryTaskArea;
      }
    | { type: "talk"; npcId: number; area?: DiaryTaskArea };

export interface DiaryTask {
    /** Task text as shown in the achievement diary, e.g.
     *  "Have a Falador guard give you directions". */
    description: string;
    /** Leave undefined until you're ready to wire up auto-completion -
     *  see the schema doc comment above. */
    trigger?: DiaryTaskTrigger;
}

export interface DiaryTierTasks {
    tasks: DiaryTask[];
}

export interface DiaryAreaTasks {
    areaName: string;
    easy: DiaryTierTasks;
    medium: DiaryTierTasks;
    hard: DiaryTierTasks;
    elite: DiaryTierTasks;
}
