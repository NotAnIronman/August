import { ACHIEVEMENT_DIARY_PANEL_GROUP_ID } from "../../../../client/common/ui/widgets";
import { ComponentIds } from "../../../../client/common/uikit/contracts";
import type { PlayerState } from "../../../src/game/player";
import { achievementTaskTracker } from "../diaryTasks/AchievementTaskTracker";
import { getDiaryAreaTasks } from "../diaryTasks";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { openUiPanel, sendUiTabs, sendUiTextRows } from "../uikit/panelData";

/** Achievement diary always has exactly these 4 tiers as tabs. */
const TIER_COUNT = 4;

// ============================================================================
// Constants
// ============================================================================

/** Achievement diary list interface (side journal diary tab content) */
const DIARY_LIST_GROUP_ID = 259;
/**
 * Container whose dynamic rows carry the per-area ops.
 * [clientscript,build_achievement_list] (709) creates 12 clickable rows as
 * children 0-11 of 259:2 where the child index IS the area index, with
 * op1 "Open <Area> Journal" and op2 "Wiki <Area> Journal".
 */
const DIARY_LIST_TASKBOX_COMPONENT = 2;

/** OP ID for "Open <Area> Journal" */
const OP_OPEN_JOURNAL = 1;
/** OP ID for "Wiki <Area> Journal" (handled client-side in OSRS; ignored here) */
const OP_WIKI_JOURNAL = 2;

const TIER_NAMES = ["Easy", "Medium", "Hard", "Elite"] as const;

// ============================================================================
// Diary area data
// ============================================================================

interface DiaryTier {
    /** Varbit holding the player's completed-task count for the tier */
    countVarbit: number;
    /** Total tasks in the tier ([proc,diary_completion_info] (2200)) */
    total: number;
    /** Varbit holding the tier completion flag */
    completeVarbit: number;
    /** Value of completeVarbit that marks the tier complete (Karamja uses 2) */
    completeValue: number;
}

interface DiaryArea {
    /** Display name (enum 595, indexed by area id) */
    name: string;
    /** Easy / Medium / Hard / Elite */
    tiers: [DiaryTier, DiaryTier, DiaryTier, DiaryTier];
}

function tier(
    countVarbit: number,
    total: number,
    completeVarbit: number,
    completeValue = 1,
): DiaryTier {
    return { countVarbit, total, completeVarbit, completeValue };
}

/**
 * Diary areas indexed by area id (= dynamic child index in the diary list).
 * Names from enum 595; totals from [proc,diary_completion_info] (2200);
 * varbits match the ones the diary list CS2 reads (see data/loginVarbits.ts).
 */
const DIARY_AREAS: ReadonlyArray<DiaryArea> = [
    {
        name: "Karamja",
        tiers: [
            tier(2423, 10, 3578, 2),
            tier(6288, 19, 3599, 2),
            tier(6289, 10, 3611, 2),
            tier(6290, 5, 4566),
        ],
    },
    {
        name: "Ardougne",
        tiers: [
            tier(6291, 10, 4458),
            tier(6292, 12, 4459),
            tier(6293, 12, 4460),
            tier(6294, 8, 4461),
        ],
    },
    {
        name: "Falador",
        tiers: [
            tier(6299, 11, 4462),
            tier(6300, 14, 4463),
            tier(6301, 11, 4464),
            tier(6302, 6, 4465),
        ],
    },
    {
        name: "Fremennik",
        tiers: [
            tier(6303, 10, 4491),
            tier(6304, 9, 4492),
            tier(6305, 9, 4493),
            tier(6306, 6, 4494),
        ],
    },
    {
        name: "Kandarin",
        tiers: [
            tier(6307, 11, 4475),
            tier(6308, 14, 4476),
            tier(6309, 11, 4477),
            tier(6310, 7, 4478),
        ],
    },
    {
        name: "Desert",
        tiers: [
            tier(6295, 11, 4483),
            tier(6296, 12, 4484),
            tier(6297, 10, 4485),
            tier(6298, 6, 4486),
        ],
    },
    {
        name: "Lumbridge & Draynor",
        tiers: [
            tier(6311, 12, 4495),
            tier(6312, 12, 4496),
            tier(6313, 11, 4497),
            tier(6314, 6, 4498),
        ],
    },
    {
        name: "Morytania",
        tiers: [
            tier(6315, 11, 4487),
            tier(6316, 11, 4488),
            tier(6317, 10, 4489),
            tier(6318, 6, 4490),
        ],
    },
    {
        name: "Varrock",
        tiers: [
            tier(6319, 14, 4479),
            tier(6320, 13, 4480),
            tier(6321, 10, 4481),
            tier(6322, 5, 4482),
        ],
    },
    {
        name: "Wilderness",
        tiers: [
            tier(6323, 12, 4466),
            tier(6324, 11, 4467),
            tier(6325, 10, 4468),
            tier(6326, 7, 4469),
        ],
    },
    {
        name: "Western Provinces",
        tiers: [
            tier(6327, 11, 4471),
            tier(6328, 13, 4472),
            tier(6329, 13, 4473),
            tier(6330, 7, 4474),
        ],
    },
    {
        name: "Kourend & Kebos",
        tiers: [
            tier(7933, 12, 7925),
            tier(7934, 13, 7926),
            tier(7935, 10, 7927),
            tier(7936, 8, 7928),
        ],
    },
];

// ============================================================================
// Tab text generation
// ============================================================================

const COLOR_COMPLETE = "0dc10d";
const COLOR_IN_PROGRESS = "ffff00";
const COLOR_NOT_STARTED = "ff0000";

/**
 * Lines shown within ONE tier's tab (Easy/Medium/Hard/Elite are now
 * separate tabs, not stacked in one scroll like the old flat panel).
 *
 * If the area's task data (server/gamemodes/vanilla/diaryTasks/data/) has
 * been filled in for this tier, shows the real itemized checklist -
 * one line per task, struck through in the same style as the old
 * aggregate summary once completed (tracked per-task by
 * achievementTaskTracker, not just the aggregate count). While a tier's
 * task descriptions are still blank stubs (the generated fill-sheet
 * default), falls back to the old aggregate summary so the panel isn't
 * empty before you've filled anything in.
 */
function buildDiaryTierLines(
    player: PlayerState,
    area: DiaryArea,
    areaId: number,
    tierIndex: number,
): string[] {
    const t = area.tiers[tierIndex];
    const tierKey = TIER_NAMES[tierIndex].toLowerCase() as "easy" | "medium" | "hard" | "elite";
    const tasks = getDiaryAreaTasks(areaId)?.[tierKey]?.tasks ?? [];
    const filledIn = tasks.filter((task) => task.description.trim().length > 0);

    if (filledIn.length === 0) {
        // No task data filled in yet for this tier - fall back to the
        // OLD aggregate varbit-based summary so the tab isn't just a
        // blank header. Nothing writes to these varbits anymore (see
        // AchievementTaskTracker.ts's TIER COUNT NOTE), so this always
        // reads whatever a fresh player's default is (typically 0) until
        // this tier's data.ts file gets filled in, at which point the
        // branch below takes over and this fallback stops being used
        // for that tier.
        const count = Math.min(player.varps.getVarbitValue(t.countVarbit), t.total);
        const complete = player.varps.getVarbitValue(t.completeVarbit) >= t.completeValue;
        const colour = complete ? COLOR_COMPLETE : count > 0 ? COLOR_IN_PROGRESS : COLOR_NOT_STARTED;
        const shown = complete ? t.total : count;
        return [
            `<col=${colour}>${TIER_NAMES[tierIndex]} tasks: ${shown}/${t.total}</col>`,
            complete
                ? `<str>You have completed all of the ${tierKey} tasks.`
                : `You have completed ${shown} of the ${t.total} ${tierKey} tasks.`,
        ];
    }

    // Real task data exists for this tier - the header now reflects the
    // ACTUAL filled-in task count (not the old hardcoded tier total,
    // which was the "12/12 instead of 0/3" bug) and completion is read
    // straight from the tracker, not a varbit nothing writes to anymore.
    const totalCount = filledIn.length;
    const doneCount = achievementTaskTracker.countCompletedInTier(
        player.id,
        areaId,
        tierIndex,
        tasks.length,
    );
    const complete = doneCount >= totalCount;
    const colour = complete ? COLOR_COMPLETE : doneCount > 0 ? COLOR_IN_PROGRESS : COLOR_NOT_STARTED;
    const header = `<col=${colour}>${TIER_NAMES[tierIndex]} tasks: ${doneCount}/${totalCount}</col>`;

    const lines = [header, ""];
    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
        const task = tasks[taskIndex];
        if (task.description.trim().length === 0) continue;
        const done = achievementTaskTracker.isTaskComplete(player.id, {
            areaId,
            tierIndex,
            taskIndex,
        });
        lines.push(done ? `<str>${task.description}` : task.description);
    }
    return lines;
}

// ============================================================================
// Journal opening
// ============================================================================

/**
 * Open the achievement diary journal panel for an area.
 *
 * Built as a custom widget group (ACHIEVEMENT_DIARY_PANEL_GROUP_ID) mounted
 * in mainmodal, with its frame/backdrop drawn by the steelborder script -
 * the same working mechanism Bank, the Settings modal and the Smithing bar
 * picker already use. Tabs (Easy/Medium/Hard/Elite) reuse the same
 * sidebar architecture as the skill guide.
 */
type DiaryPanelState = { areaId: number };

/**
 * Populates the sidebar tabs + the currently selected tier's lines for
 * the diary panel. Safe to call repeatedly (tab clicks) without
 * reopening the modal.
 */
function renderDiaryPanel(
    services: ScriptServices,
    playerId: number,
    player: PlayerState,
    area: DiaryArea,
    areaId: number,
    activeTierIndex: number,
): void {
    sendUiTabs(
        services,
        playerId,
        ACHIEVEMENT_DIARY_PANEL_GROUP_ID,
        TIER_NAMES.map((label) => ({ label })),
        activeTierIndex,
    );

    const lines = buildDiaryTierLines(player, area, areaId, activeTierIndex);
    sendUiTextRows(services, playerId, ACHIEVEMENT_DIARY_PANEL_GROUP_ID, lines);
}

function openDiaryJournal(player: PlayerState, areaId: number, services: ScriptServices): void {
    const area = DIARY_AREAS[areaId];
    if (!area) return;

    const playerId = player.id;
    const title = `${area.name} Area Tasks`;

    openUiPanel(services, player, ACHIEVEMENT_DIARY_PANEL_GROUP_ID, title, {
        data: { areaId } satisfies DiaryPanelState,
    });

    renderDiaryPanel(services, playerId, player, area, areaId, 0);

    services.system.logger.info?.(
        `[diary-journal] Opened journal for player=${playerId} area="${area.name}" (id=${areaId})`,
    );
}

// ============================================================================
// Module
// ============================================================================

export function registerDiaryJournalWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    // Live-refresh the diary panel when a task auto-completes while it's
    // open on the relevant area (e.g. player kills a monster that
    // completes a filled-in kill-trigger task). Switches to and shows
    // the tier the completed task belongs to - InterfaceService has no
    // way to read back "which tab is currently active" without storing
    // it ourselves, and doing that would need updating the modal's data
    // on every tab click (no update-in-place API, only a full reopen),
    // so this deliberately keeps it simple: show the tier that changed.
    achievementTaskTracker.onTaskCompleted = (player, areaId, tierIndex, svc) => {
        const state = svc.dialog.getInterfaceService()?.getModalData<DiaryPanelState>(player);
        if (!state || state.areaId !== areaId) return;
        const area = DIARY_AREAS[areaId];
        if (!area) return;
        renderDiaryPanel(svc, player.id, player, area, areaId, tierIndex);
    };

    // Wires the achievement diary's kill-trigger tracker to the real,
    // confirmed-kill hook in combat (see CombatFacade.registerOnNpcKilled
    // and NpcHitHandler.handleNpcDeath). Fires once per confirmed kill,
    // any NPC, any player - checkKillTrigger internally scans for any
    // filled-in kill-trigger task matching this NPC (and its area bounds
    // if one is set) and does nothing if none match.
    services.combat.registerOnNpcKilled?.((killer, npc, _tick) => {
        achievementTaskTracker.checkKillTrigger(killer, npc, services);
    });

    // Handle diary list clicks (259:2). Dynamic child index = area id.
    registry.onButton(DIARY_LIST_GROUP_ID, DIARY_LIST_TASKBOX_COMPONENT, (event) => {
        const { player, slot, opId } = event;
        const areaId = slot ?? -1;
        if (areaId < 0 || areaId >= DIARY_AREAS.length) return;

        if (opId === OP_OPEN_JOURNAL) {
            openDiaryJournal(player, areaId, services);
            return;
        }
        if (opId === OP_WIKI_JOURNAL) {
            // Wiki lookups open the browser client-side in OSRS; nothing to do here.
            return;
        }
    });

    // Sidebar tab clicks - switch the active tier without reopening the modal.
    for (let i = 0; i < TIER_COUNT; i++) {
        registry.onButton(
            ACHIEVEMENT_DIARY_PANEL_GROUP_ID,
            ComponentIds.TAB_BASE + i,
            (event) => {
                const { player } = event;
                const state = services.dialog
                    .getInterfaceService()
                    ?.getModalData<DiaryPanelState>(player);
                if (!state) return;
                const area = DIARY_AREAS[state.areaId];
                if (!area) return;

                renderDiaryPanel(services, player.id, player, area, state.areaId, i);
            },
        );
    }
}
