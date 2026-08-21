import {
    JOURNAL_PANEL_COMPONENT_FRAME,
    JOURNAL_PANEL_COMPONENT_SWITCH,
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
} from "../../../../client/common/ui/widgets";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { getQuestDefinition, getQuestDefinitionByKey } from "../quests/QuestRegistry";
import {
    buildQuestMap,
    getQuestCompletionInfo,
    type QuestEntry,
} from "./questListData";
import { findPlayerQuestListQuestBySlot } from "./questListUi";
import { reflowLines, sendJournalPanelLines, wrapTextToLines } from "./journalPanelHelpers";

// ============================================================================
// Constants
// ============================================================================

/** Quest list interface group (side journal quest tab content) */
const QUEST_LIST_GROUP_ID = 399;
/** Dynamic list component inside quest list interface */
const QUEST_LIST_COMPONENT = 7;

/** Varp: currently viewed quest (stores dbrow ID) */
const VARP_LATEST_QUEST_JOURNAL = 3679;
/** Varp: number of journal text lines */
const VARP_QJ_LINES = 4398;

/** OP ID for "Read journal:" right-click option */
const OP_READ_JOURNAL = 2;

// Rebuilt as custom widget groups (see client/widgets/custom/journalPanel.cs2.ts)
// mounted in mainmodal + steelbordered at open time, instead of the cache
// interfaces (119 / 782) whose backgrounds never render in this client.
//
// SCRIPT_STEELBORDER (227, not the "_NOCLOSE" variant) draws the title bar
// text AND a working X close button directly onto the frame, matching
// Bank/Settings/Trade - no separate title widget or stone button needed.
const SCRIPT_STEELBORDER = 227;

function packUid(groupId: number, componentId: number): number {
    return ((groupId & 0xffff) << 16) | (componentId & 0xffff);
}

// ============================================================================
// Journal text generation
// ============================================================================

/**
 * Build journal lines for a quest based on its completion status.
 *
 * Implemented quests (registered in the quest registry) generate stage-specific
 * journal text from their definitions. For the rest, we check the quest's
 * progress varp against its completion value to determine basic status.
 */
function buildJournalLines(
    player: PlayerState,
    quest: QuestEntry,
    services: ScriptServices,
): string[] {
    const definition = getQuestDefinition(quest.displayName);
    if (definition) {
        return definition.buildJournal(player, services);
    }
    // Check if quest was completed via ::quest command by checking known quest varps
    const completionEntry = getQuestCompletionInfo(quest.displayName);
    if (completionEntry) {
        const currentValue =
            completionEntry.varpId >= 0 ? player.varps.getVarpValue(completionEntry.varpId) : 0;

        // Check varbit entries too
        let allVarbitsComplete = true;
        if (completionEntry.varbitEntries) {
            for (const { varbitId, value } of completionEntry.varbitEntries) {
                if (player.varps.getVarbitValue(varbitId) < value) {
                    allVarbitsComplete = false;
                    break;
                }
            }
        }

        const isComplete =
            (completionEntry.varpId >= 0 && currentValue >= completionEntry.completionValue) ||
            (completionEntry.varpId < 0 && allVarbitsComplete);

        if (isComplete) {
            return ["<str>I have completed this quest.", "", "<col=ff0000>QUEST COMPLETE!"];
        }
    }

    // Not started (default state)
    return [
        "I should read the quest overview for",
        "more information on how to start",
        "this quest.",
    ];
}

export function registerQuestJournalWidgetHandlers(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    // Lazy-loaded quest map: the DbRepository is not available at module registration
    // time (scripts bootstrap before cache DB is initialized). Build on first click.
    let questMap: Map<number, QuestEntry> | undefined;

    const getQuestMap = (): Map<number, QuestEntry> => {
        if (!questMap) {
            questMap = buildQuestMap(services);
        }
        return questMap;
    };

    const findQuestByDbrowId = (dbrowId: number): QuestEntry | undefined => {
        for (const entry of getQuestMap().values()) {
            if (entry.dbrowId === dbrowId) return entry;
        }
        return undefined;
    };

    const findQuestByDisplayName = (displayName: string): QuestEntry | undefined => {
        const normalized = displayName.toLowerCase();
        for (const entry of getQuestMap().values()) {
            if (entry.displayName.toLowerCase() === normalized) return entry;
        }
        return undefined;
    };

    const findQuestByQuestListKey = (key: string): QuestEntry | undefined => {
        const definition = getQuestDefinitionByKey(key);
        if (!definition) return undefined;
        return findQuestByDisplayName(definition.name);
    };

    // Handle quest list clicks (399:7)
    // Gamemode-owned dynamic children use the visible row slot as their child index.
    registry.onButton(QUEST_LIST_GROUP_ID, QUEST_LIST_COMPONENT, (event) => {
        const { player, slot, opId } = event;

        if (opId !== OP_READ_JOURNAL) return;

        const visibleQuest = findPlayerQuestListQuestBySlot(player, slot);
        if (!visibleQuest) return;

        const quest =
            findQuestByQuestListKey(visibleQuest.key) ??
            findQuestByDisplayName(visibleQuest.displayName);
        if (!quest) {
            const label = `slot=${slot} key="${visibleQuest.key}" name="${visibleQuest.displayName}"`;
            services.system.logger.info?.(
                `[quest-journal] No quest found for visible ${label}`,
            );
            return;
        }

        openQuestJournal(player, quest, services);
    });

    // Switch View button: journal text -> quest overview
    registry.onButton(QUEST_JOURNAL_PANEL_GROUP_ID, JOURNAL_PANEL_COMPONENT_SWITCH, (event) => {
        const { player } = event;
        const dbrowId = player.varps.getVarpValue(VARP_LATEST_QUEST_JOURNAL);
        if (dbrowId <= 0) return;

        const quest = findQuestByDbrowId(dbrowId);
        if (!quest) return;

        openQuestOverview(player, quest, services);
    });

    // Switch View button: quest overview -> journal text
    registry.onButton(QUEST_OVERVIEW_PANEL_GROUP_ID, JOURNAL_PANEL_COMPONENT_SWITCH, (event) => {
        const { player } = event;
        const dbrowId = player.varps.getVarpValue(VARP_LATEST_QUEST_JOURNAL);
        if (dbrowId <= 0) return;

        const quest = findQuestByDbrowId(dbrowId);
        if (!quest) return;

        openQuestJournal(player, quest, services);
    });
}

// ============================================================================
// Quest journal opening
// ============================================================================

/**
 * Open the quest journal overlay for a specific quest.
 *
 * Client parity note: Unlike OSRS where widget state persists across open/close,
 * this client only resolves set_text for widgets that are currently loaded.
 * Therefore we must open the interface FIRST, then set text and run scripts.
 *
 * Flow:
 * 1. Set varps (latest_quest_journal, qj_lines)
 * 2. Open interface 119 as overlay (loads widgets)
 * 3. Run quest_journal_reset to clear stale text
 * 4. Set title and journal line text
 * 5. Run scroll configuration script
 */
function openQuestJournal(player: PlayerState, quest: QuestEntry, services: ScriptServices): void {
    // Reflow: each quest's journal.ts hard-wraps its lines for the old,
    // narrower cache interface. Re-wrapping to our panel's actual width
    // lets the text use the full available space instead of stopping
    // halfway across. Blank-line section breaks are preserved.
    const lines = reflowLines(buildJournalLines(player, quest, services));
    const lineCount = lines.length;
    const playerId = player.id;

    // 1. Set varps
    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    player.varps.setVarpValue(VARP_QJ_LINES, lineCount);
    services.variables.sendVarp?.(player, VARP_QJ_LINES, lineCount);

    // 2. Open the quest journal panel (custom widget group, mounted in mainmodal).
    const interfaceService = services.dialog.getInterfaceService();
    interfaceService?.openModal(player, QUEST_JOURNAL_PANEL_GROUP_ID, undefined, {
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
            [VARP_QJ_LINES]: lineCount,
        },
    });

    // 3. Draw the frame, title bar text, and a working X close button.
    services.dialog.queueWidgetEvent(playerId, {
        action: "run_script",
        scriptId: SCRIPT_STEELBORDER,
        args: [
            packUid(QUEST_JOURNAL_PANEL_GROUP_ID, JOURNAL_PANEL_COMPONENT_FRAME),
            quest.displayName,
        ],
    });

    // 4. Set journal line text (blank-line entries render as dividers)
    sendJournalPanelLines(services, playerId, QUEST_JOURNAL_PANEL_GROUP_ID, lines);

    // 5. Show the "View Quest Overview" switch button, if this quest has one.
    const definition = getQuestDefinition(quest.displayName);
    services.dialog.queueWidgetEvent(playerId, {
        action: "set_hidden",
        uid: packUid(QUEST_JOURNAL_PANEL_GROUP_ID, JOURNAL_PANEL_COMPONENT_SWITCH),
        hidden: !definition?.overviewStartText,
    });
    services.dialog.queueWidgetEvent(playerId, {
        action: "set_text",
        uid: packUid(QUEST_JOURNAL_PANEL_GROUP_ID, JOURNAL_PANEL_COMPONENT_SWITCH),
        text: "View Quest Overview",
    });

    services.system.logger.info?.(
        `[quest-journal] Opened journal for player=${playerId} quest="${quest.displayName}" (id=${quest.questId}, dbrow=${quest.dbrowId}) lines=${lineCount}`,
    );
}

function openQuestOverview(player: PlayerState, quest: QuestEntry, services: ScriptServices): void {
    const playerId = player.id;
    const definition = getQuestDefinition(quest.displayName);
    if (!definition?.overviewStartText) {
        services.system.logger.info?.(
            `[quest-journal] No overview start text for quest="${quest.displayName}" (dbrow=${quest.dbrowId})`,
        );
        return;
    }
    const overviewStartText = definition.overviewStartText;
    const lines = wrapTextToLines(overviewStartText);

    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);

    // Open the quest overview panel (custom widget group, mounted in mainmodal).
    const interfaceService = services.dialog.getInterfaceService();
    interfaceService?.openModal(player, QUEST_OVERVIEW_PANEL_GROUP_ID, undefined, {
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
            [definition.varpId]: player.varps.getVarpValue(definition.varpId),
        },
    });

    services.dialog.queueWidgetEvent(playerId, {
        action: "run_script",
        scriptId: SCRIPT_STEELBORDER,
        args: [
            packUid(QUEST_OVERVIEW_PANEL_GROUP_ID, JOURNAL_PANEL_COMPONENT_FRAME),
            quest.displayName,
        ],
    });

    sendJournalPanelLines(services, playerId, QUEST_OVERVIEW_PANEL_GROUP_ID, lines);

    services.dialog.queueWidgetEvent(playerId, {
        action: "set_text",
        uid: packUid(QUEST_OVERVIEW_PANEL_GROUP_ID, JOURNAL_PANEL_COMPONENT_SWITCH),
        text: "View Journal",
    });

    services.system.logger.info?.(
        `[quest-journal] Opened overview for player=${playerId} quest="${quest.displayName}" (id=${quest.questId}, dbrow=${quest.dbrowId})`,
    );
}
