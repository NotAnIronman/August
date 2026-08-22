import {
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
} from "../../../../client/common/ui/widgets";
import { ComponentIds } from "../../../../client/common/uikit/contracts";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { getQuestDefinition, getQuestDefinitionByKey } from "../quests/QuestRegistry";
import {
    buildQuestMap,
    getQuestCompletionInfo,
    type QuestEntry,
} from "./questListData";
import { findPlayerQuestListQuestBySlot } from "./questListUi";
import {
    openUiPanel,
    packUid,
    reflowLines,
    sendUiFooterButton,
    sendUiTextRows,
    wrapTextToLines,
} from "../uikit/panelData";
import { registerUiPanelActions } from "../uikit/actions";

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

    // Server-authoritative footer actions: a forged component packet is
    // ignored unless the corresponding UIKit modal is actually open.
    registerUiPanelActions(registry, services, QUEST_JOURNAL_PANEL_GROUP_ID, [{
        componentId: ComponentIds.FOOTER_BUTTON,
        actionId: "view_quest_overview",
        handle: (event) => {
        const { player } = event;
        const dbrowId = player.varps.getVarpValue(VARP_LATEST_QUEST_JOURNAL);
        if (dbrowId <= 0) return;

        const quest = findQuestByDbrowId(dbrowId);
        if (!quest) return;

        openQuestOverview(player, quest, services);
        },
    }]);

    registerUiPanelActions(registry, services, QUEST_OVERVIEW_PANEL_GROUP_ID, [{
        componentId: ComponentIds.FOOTER_BUTTON,
        actionId: "view_quest_journal",
        handle: (event) => {
        const { player } = event;
        const dbrowId = player.varps.getVarpValue(VARP_LATEST_QUEST_JOURNAL);
        if (dbrowId <= 0) return;

        const quest = findQuestByDbrowId(dbrowId);
        if (!quest) return;

        openQuestJournal(player, quest, services);
        },
    }]);
}

// ============================================================================
// Quest journal opening
// ============================================================================

function openQuestJournal(player: PlayerState, quest: QuestEntry, services: ScriptServices): void {
    // Reflow: each quest's journal.ts hard-wraps its lines for the old,
    // narrower cache interface. Re-wrapping to our panel's actual width
    // lets the text use the full available space instead of stopping
    // halfway across. Blank-line section breaks are preserved.
    const lines = reflowLines(buildJournalLines(player, quest, services), 110);
    const lineCount = lines.length;
    const playerId = player.id;

    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    player.varps.setVarpValue(VARP_QJ_LINES, lineCount);
    services.variables.sendVarp?.(player, VARP_QJ_LINES, lineCount);

    openUiPanel(services, player, QUEST_JOURNAL_PANEL_GROUP_ID, quest.displayName, {
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
            [VARP_QJ_LINES]: lineCount,
        },
    });

    sendUiTextRows(services, playerId, QUEST_JOURNAL_PANEL_GROUP_ID, lines);

    // Show the "View Quest Overview" switch button, if this quest has one.
    const definition = getQuestDefinition(quest.displayName);
    for (const componentId of [ComponentIds.FOOTER_BUTTON, ComponentIds.FOOTER_BUTTON_LABEL]) {
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: packUid(QUEST_JOURNAL_PANEL_GROUP_ID, componentId),
            hidden: !definition?.overviewStartText,
        });
    }
    if (definition?.overviewStartText) {
        sendUiFooterButton(services, playerId, QUEST_JOURNAL_PANEL_GROUP_ID, "View Quest Overview");
    }

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
    const lines = wrapTextToLines(overviewStartText, 110);

    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);

    openUiPanel(services, player, QUEST_OVERVIEW_PANEL_GROUP_ID, quest.displayName, {
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
            [definition.varpId]: player.varps.getVarpValue(definition.varpId),
        },
    });

    sendUiTextRows(services, playerId, QUEST_OVERVIEW_PANEL_GROUP_ID, lines);
    sendUiFooterButton(services, playerId, QUEST_OVERVIEW_PANEL_GROUP_ID, "View Journal");

    services.system.logger.info?.(
        `[quest-journal] Opened overview for player=${playerId} quest="${quest.displayName}" (id=${quest.questId}, dbrow=${quest.dbrowId})`,
    );
}
