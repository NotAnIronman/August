import {
    QUEST_JOURNAL_PANEL_GROUP_ID,
    QUEST_OVERVIEW_PANEL_GROUP_ID,
} from "@august/protocol/ui/widgets";
import { ComponentIds } from "@august/protocol/uikit/contracts";
import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { getQuestDefinition, getQuestDefinitionByKey } from "@server/content/gamemodes/vanilla/quests/QuestRegistry";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";
import {
    buildFreeToPlayQuestJournal,
    buildFreeToPlayQuestOverview,
    getFreeToPlayQuestContent,
    type FreeToPlayQuestContent,
} from "@server/content/gamemodes/vanilla/quests/content/freeToPlay";
import { getMembersQuestContent } from "@server/content/gamemodes/vanilla/quests/content/members";
import { getMiniquestContent } from "@server/content/gamemodes/vanilla/quests/content/miniquests";
import {
    buildQuestMap,
    getQuestCompletionInfo,
    type QuestEntry,
} from "@server/content/gamemodes/vanilla/widgets/questListData";
import { findPlayerQuestListQuestBySlot } from "@server/content/gamemodes/vanilla/widgets/questListUi";
import {
    openUiPanel,
    packUid,
    reflowLines,
    sendUiFooterButton,
    sendUiInfoColumnRows,
    sendUiTextRows,
    wrapTextToLines,
} from "@server/content/gamemodes/vanilla/uikit/panelData";
import { registerUiPanelActions } from "@server/content/gamemodes/vanilla/uikit/actions";

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
/** The custom journal uses a much wider text column than the cache panel. */
// The journal now reserves a right-hand facts column. This width keeps the
// left narrative column inside its visible bounds even with markup applied.
const QUEST_JOURNAL_CHARS_PER_LINE = 46;

/** The selected quest must survive a journal/overview view switch even when
 * the current cache does not have a dbrow for a newly catalogued quest. */
type QuestJournalPanelState = { quest: QuestEntry };

// ============================================================================
// Journal text generation
// ============================================================================

/**
 * Build journal lines for a quest based on its completion status.
 *
 * Implemented quests (registered in the quest registry) generate stage-specific
 * journal text from their definitions. F2P catalog content supplies a complete
 * state-neutral journal until its dedicated state script exists. Other quests
 * retain the legacy completion-varp fallback.
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

    const freeToPlayContent =
        getFreeToPlayQuestContent(quest.displayName) ??
        getMembersQuestContent(quest.displayName) ??
        getMiniquestContent(quest.displayName);
    if (freeToPlayContent) {
        return buildFreeToPlayQuestJournal(freeToPlayContent);
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

    // Display-only default for wiki-catalogued quests that have not been
    // implemented yet. This deliberately provides no objectives, triggers,
    // or completion state until the quest is built.
    return [
        "This quest is not implemented yet.",
        "",
        "Quest objectives and completion checks will be added",
        "in a future update.",
    ];
}

/** Formats shared quest metadata rather than hard-coding it into individual
 * journal prose. Stateful definitions and display-only F2P content both use
 * the same difficulty/length/storyline/requirements presentation. */
function buildJournalInfoColumnLines(
    definition: QuestDefinition | undefined,
    freeToPlayContent: FreeToPlayQuestContent | undefined,
): string[] {
    // A quest can be catalogued before its scripted definition and its wiki
    // facts have been authored. Keep the same two-column journal structure in
    // that case, rather than making the interface visibly change from quest to
    // quest. These neutral values intentionally do not pretend to be wiki data.
    const info = freeToPlayContent?.journalInfo ?? definition?.journalInfo ?? {
        difficulty: "Not yet catalogued",
        length: "Not yet catalogued",
        storyline: "Not yet catalogued",
    };

    const requirements: string[] = freeToPlayContent
        ? [...freeToPlayContent.requirementLines]
        : buildDefinitionRequirementLines(definition);

    // The column contains 16 rows. Preserve a clear indication that a very
    // requirement-heavy quest has more prerequisites rather than throwing or
    // silently clipping the panel.
    const requirementCapacity = 5;
    const visibleRequirements = requirements.slice(0, requirementCapacity);
    if (requirements.length > requirementCapacity) {
        visibleRequirements.push(`...and ${requirements.length - requirementCapacity} more`);
    }

    return [
        "<col=000080>Difficulty:</col>",
        `<col=800000>${info.difficulty}</col>`,
        "",
        "<col=000080>Length:</col>",
        `<col=800000>${info.length}</col>`,
        "",
        "<col=000080>Storyline:</col>",
        `<col=800000>${info.storyline}</col>`,
        "",
        "<col=000080>Requirements:</col>",
        ...(visibleRequirements.length > 0
            ? visibleRequirements.map((requirement) => `<col=800000>${requirement}</col>`)
            : ["<col=800000>None</col>"]),
    ];
}

function buildDefinitionRequirementLines(definition: QuestDefinition | undefined): string[] {
    const requirements: string[] = [];
    if (definition?.requirements?.questPoints !== undefined) {
        requirements.push(`${definition.requirements.questPoints} Quest Points`);
    }
    for (const requirement of definition?.requirements?.quests ?? []) {
        requirements.push(requirement.label);
    }
    for (const requirement of definition?.requirements?.skills ?? []) {
        requirements.push(`Level ${requirement.level} ${requirement.label}`);
    }
    return requirements;
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

    const getOpenQuest = (player: PlayerState): QuestEntry | undefined => {
        const panelState = services.dialog
            .getInterfaceService()
            ?.getModalData<QuestJournalPanelState>(player);
        if (panelState?.quest) return panelState.quest;

        // Cache-backed legacy journal opens may not have modal data (for
        // example, an already-open panel after a hot reload), so retain the
        // dbrow lookup as a backwards-compatible fallback.
        const dbrowId = player.varps.getVarpValue(VARP_LATEST_QUEST_JOURNAL);
        return dbrowId > 0 ? findQuestByDbrowId(dbrowId) : undefined;
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
        // The catalog can advance ahead of the cache revision. Keep those
        // rows readable with a display-only journal rather than making the
        // UI look broken; a cache-backed entry is used whenever available.
        const resolvedQuest = quest ?? {
            questId: 0,
            dbrowId: 0,
            displayName: visibleQuest.displayName,
        };

        openQuestJournal(player, resolvedQuest, services);
    });

    // Server-authoritative footer actions: a forged component packet is
    // ignored unless the corresponding UIKit modal is actually open.
    registerUiPanelActions(registry, services, QUEST_JOURNAL_PANEL_GROUP_ID, [{
        componentId: ComponentIds.FOOTER_BUTTON,
        actionId: "view_quest_overview",
        handle: (event) => {
            const quest = getOpenQuest(event.player);
            if (!quest) return;

            openQuestOverview(event.player, quest, services);
        },
    }]);

    registerUiPanelActions(registry, services, QUEST_OVERVIEW_PANEL_GROUP_ID, [{
        componentId: ComponentIds.FOOTER_BUTTON,
        actionId: "view_quest_journal",
        handle: (event) => {
            const quest = getOpenQuest(event.player);
            if (!quest) return;

            openQuestJournal(event.player, quest, services);
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
    const lines = reflowLines(
        buildJournalLines(player, quest, services),
        QUEST_JOURNAL_CHARS_PER_LINE,
    );
    const lineCount = lines.length;
    const playerId = player.id;

    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    player.varps.setVarpValue(VARP_QJ_LINES, lineCount);
    services.variables.sendVarp?.(player, VARP_QJ_LINES, lineCount);

    openUiPanel(services, player, QUEST_JOURNAL_PANEL_GROUP_ID, quest.displayName, {
        data: { quest } satisfies QuestJournalPanelState,
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
            [VARP_QJ_LINES]: lineCount,
        },
    });

    sendUiTextRows(services, playerId, QUEST_JOURNAL_PANEL_GROUP_ID, lines);

    // Show the "View Quest Overview" switch button, if this quest has one.
    const definition = getQuestDefinition(quest.displayName);
    const freeToPlayContent =
        getFreeToPlayQuestContent(quest.displayName) ??
        getMembersQuestContent(quest.displayName) ??
        getMiniquestContent(quest.displayName);
    sendUiInfoColumnRows(
        services,
        playerId,
        QUEST_JOURNAL_PANEL_GROUP_ID,
        buildJournalInfoColumnLines(definition, freeToPlayContent),
    );
    for (const componentId of [ComponentIds.FOOTER_BUTTON, ComponentIds.FOOTER_BUTTON_LABEL]) {
        services.dialog.queueWidgetEvent(playerId, {
            action: "set_hidden",
            uid: packUid(QUEST_JOURNAL_PANEL_GROUP_ID, componentId),
            hidden: !freeToPlayContent && !definition?.overviewStartText,
        });
    }
    if (freeToPlayContent || definition?.overviewStartText) {
        sendUiFooterButton(services, playerId, QUEST_JOURNAL_PANEL_GROUP_ID, "View Quest Overview");
    }

    services.system.logger.info?.(
        `[quest-journal] Opened journal for player=${playerId} quest="${quest.displayName}" (id=${quest.questId}, dbrow=${quest.dbrowId}) lines=${lineCount}`,
    );
}

function openQuestOverview(player: PlayerState, quest: QuestEntry, services: ScriptServices): void {
    const playerId = player.id;
    const definition = getQuestDefinition(quest.displayName);
    const freeToPlayContent =
        getFreeToPlayQuestContent(quest.displayName) ??
        getMembersQuestContent(quest.displayName) ??
        getMiniquestContent(quest.displayName);
    if (!freeToPlayContent && !definition?.overviewStartText) {
        services.system.logger.info?.(
            `[quest-journal] No overview start text for quest="${quest.displayName}" (dbrow=${quest.dbrowId})`,
        );
        return;
    }
    const lines = freeToPlayContent
        ? reflowLines(buildFreeToPlayQuestOverview(freeToPlayContent), QUEST_JOURNAL_CHARS_PER_LINE)
        : wrapTextToLines(definition!.overviewStartText!, QUEST_JOURNAL_CHARS_PER_LINE);

    player.varps.setVarpValue(VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);
    services.variables.sendVarp?.(player, VARP_LATEST_QUEST_JOURNAL, quest.dbrowId);

    openUiPanel(services, player, QUEST_OVERVIEW_PANEL_GROUP_ID, quest.displayName, {
        data: { quest } satisfies QuestJournalPanelState,
        varps: {
            [VARP_LATEST_QUEST_JOURNAL]: quest.dbrowId,
        },
    });

    sendUiTextRows(services, playerId, QUEST_OVERVIEW_PANEL_GROUP_ID, lines);
    sendUiFooterButton(services, playerId, QUEST_OVERVIEW_PANEL_GROUP_ID, "View Journal");

    services.system.logger.info?.(
        `[quest-journal] Opened overview for player=${playerId} quest="${quest.displayName}" (id=${quest.questId}, dbrow=${quest.dbrowId})`,
    );
}
