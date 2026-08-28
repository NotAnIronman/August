import fs from "fs";
import path from "path";

import { NPC_ANIMATION_REVIEW_PANEL_GROUP_ID } from "../../../../client/common/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds, type UiMenuButton } from "../../../../client/common/uikit/contracts";
import type { NpcState } from "../../../src/game/npc";
import {
    assignNpcCombatAnimation,
    getPrimaryNpcAnimation,
    normalizeNpcSpecialName,
    type NpcCombatAnimationData,
    type NpcCombatAnimationRole,
} from "../../../src/game/npc/NpcCombatAnimationData";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { registerUiPanelActions } from "../uikit/actions";
import { openUiPanel, sendUiFooterButton, sendUiMenuButtons } from "../uikit/panelData";

/**
 * Candidate sequence ids observed by the OpenOSRS-style animation collector.
 * They are observations, not labelled combat roles: never load them as live
 * combat definitions without reviewing them in-game first.
 */
const CANDIDATE_SOURCE = "historical cache + OpenOSRS observed sequence data";
const PREVIEW_LIFETIME_TICKS = 6_000;
const PREVIEW_DISTANCE_TILES = 8;
// The old combat-definitions file used this as the broad humanoid fallback.
// A reviewed combat style should replace it, but a deliberately chosen primary
// animation must never be silently replaced by a later style review.
const GENERIC_HUMANOID_ATTACK_ANIMATION = 422;

export type ReviewAnimationRole = NpcCombatAnimationRole | "special";

export function shouldAdvanceNpcAnimationReviewCandidate(
    role: ReviewAnimationRole,
): boolean {
    // Primary is deliberately non-consuming: reviewers commonly mark the
    // default and then assign that same candidate to Melee/Ranged/Magic.
    return role !== "attack";
}

type NpcCombatDefinitionsFile = {
    npcs?: Record<string, { name?: string; anims?: NpcCombatAnimationData }>;
    [key: string]: unknown;
};

type ReviewSession = {
    npcTypeId: number;
    previewNpcId: number;
    candidates: number[];
    candidateIndex: number;
    selectedSequenceId?: number;
    /** Named mechanic used by the panel's Special button. */
    specialName?: string;
    /** Invalidates the reset callback from an older candidate preview. */
    playbackGeneration: number;
};

const sessionsByPlayerId = new Map<number, ReviewSession>();

const REVIEW_BUTTONS: readonly UiMenuButton[] = [
    { itemId: 4151, label: "Previous" },
    { itemId: 4151, label: "Next" },
    { itemId: 4151, label: "Primary" },
    { itemId: 1305, label: "Melee" },
    { itemId: 861, label: "Ranged" },
    { itemId: 1381, label: "Magic" },
    { itemId: 8850, label: "Defend" },
    { itemId: 964, label: "Death" },
    { itemId: 1050, label: "Spawn" },
    { itemId: 11802, label: "Special" },
];

function resolveDataPath(fileName: string): string {
    const paths = [
        path.resolve(__dirname, "../../../data", fileName),
        path.resolve(process.cwd(), "data", fileName),
        path.resolve(process.cwd(), "server/data", fileName),
    ];
    return paths.find((candidate) => fs.existsSync(candidate)) ?? paths[0];
}

function parseNpcTypeId(value: string | undefined): number | undefined {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const id = Number(value);
    return Number.isFinite(id) && id >= 0 ? id : undefined;
}

function parseSequenceId(value: string | undefined): number | undefined {
    // Keep mechanic names such as "3-hit-combo" from being mistaken for the
    // legacy `save special <sequence>` form. parseInt would accept the prefix.
    if (!value || !/^\d+$/.test(value)) return undefined;
    const id = Number(value);
    return Number.isFinite(id) && id >= 0 ? id : undefined;
}

function readCandidateArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<number>();
    return value.filter((candidate): candidate is number => {
        if (
            typeof candidate !== "number" ||
            !Number.isInteger(candidate) ||
            candidate < 0 ||
            seen.has(candidate)
        ) {
            return false;
        }
        seen.add(candidate);
        return true;
    });
}

function readObservedCandidates(npcTypeId: number): number[] {
    try {
        const raw = JSON.parse(
            fs.readFileSync(resolveDataPath("npc-animation-candidates.json"), "utf8"),
        ) as Record<string, unknown>;
        return readCandidateArray(raw[String(npcTypeId)]);
    } catch {
        return [];
    }
}

type HistoricalCandidateReport = {
    targets?: Array<{
        suppliedNpcIds?: unknown;
        sequenceWindow?: unknown;
        rankedAugustNewCandidates?: unknown;
        rankedAugustModifiedCandidates?: unknown;
    }>;
    windows?: Record<
        string,
        {
            augustNewCandidates?: unknown;
            augustModifiedCandidates?: unknown;
        }
    >;
};

let historicalReportCache:
    | { path: string; modifiedAtMs: number; report: HistoricalCandidateReport }
    | undefined;

function loadHistoricalCandidateReport(): HistoricalCandidateReport {
    const reportPath = resolveDataPath(
        "reports/unresolved-npc-historical-animation-batches.json",
    );
    const modifiedAtMs = fs.statSync(reportPath).mtimeMs;
    if (
        historicalReportCache?.path === reportPath &&
        historicalReportCache.modifiedAtMs === modifiedAtMs
    ) {
        return historicalReportCache.report;
    }
    const report = JSON.parse(
        fs.readFileSync(reportPath, "utf8"),
    ) as HistoricalCandidateReport;
    historicalReportCache = { path: reportPath, modifiedAtMs, report };
    return report;
}

function readHistoricalCandidates(npcTypeId: number): number[] {
    try {
        const report = loadHistoricalCandidateReport();
        const target = report.targets?.find(
            (entry) =>
                readCandidateArray(entry.suppliedNpcIds).includes(npcTypeId) &&
                typeof entry.sequenceWindow === "string",
        );
        if (!target || typeof target.sequenceWindow !== "string") return [];
        const targetRanked = [
            ...readCandidateArray(target.rankedAugustNewCandidates),
            ...readCandidateArray(target.rankedAugustModifiedCandidates),
        ];
        if (targetRanked.length > 0) return targetRanked;
        const window = report.windows?.[target.sequenceWindow];
        if (!window) return [];
        return [
            ...readCandidateArray(window.augustNewCandidates),
            ...readCandidateArray(window.augustModifiedCandidates),
        ];
    } catch {
        return [];
    }
}

function readCandidates(npcTypeId: number): number[] {
    const seen = new Set<number>();
    return [
        ...readHistoricalCandidates(npcTypeId),
        ...readObservedCandidates(npcTypeId),
    ].filter((candidate) => {
        if (seen.has(candidate)) return false;
        seen.add(candidate);
        return true;
    });
}

function getPreviewNpc(
    services: ScriptServices,
    playerId: number,
    session: ReviewSession,
): NpcState | undefined {
    const npc = services.combat.getNpc(session.previewNpcId);
    if (
        !npc ||
        npc.typeId !== session.npcTypeId ||
        npc.ownerPlayerId !== playerId
    ) {
        sessionsByPlayerId.delete(playerId);
        return undefined;
    }
    return npc;
}

/** Returns this cache sequence's visual duration in server ticks. */
function getPreviewSequenceDurationTicks(services: ScriptServices, sequenceId: number): number {
    try {
        const sequence = services.data.getSeqTypeLoader()?.load(sequenceId);
        if (!sequence) return 1;
        if (sequence.isSkeletalSeq()) {
            return Math.max(1, Math.ceil(Math.max(1, sequence.getSkeletalDuration?.() ?? 1) / 30));
        }
        const frameLengths = sequence.frameLengths;
        if (!frameLengths?.length) return 1;
        const cycles = frameLengths.reduce(
            (total, length, index) => total + (
                index === frameLengths.length - 1 && length >= 200 ? 0 : Math.max(1, length)
            ),
            0,
        );
        return Math.max(1, Math.ceil(cycles / 30));
    } catch {
        return 1;
    }
}

function playCandidate(
    services: ScriptServices,
    playerId: number,
    session: ReviewSession,
    sequenceId: number,
): string {
    const npc = getPreviewNpc(services, playerId, session);
    if (!npc) {
        return "Your preview NPC is gone. Start another review with ::npcreview <npc id>.";
    }

    services.npc.queueNpcSeq(npc, sequenceId);
    const playbackGeneration = ++session.playbackGeneration;
    services.scheduler.after(getPreviewSequenceDurationTicks(services, sequenceId) + 1, () => {
        // A stale callback must not cancel a candidate selected after this one.
        if (sessionsByPlayerId.get(playerId) !== session || session.playbackGeneration !== playbackGeneration) return;
        const current = getPreviewNpc(services, playerId, session);
        if (current) current.stopAnimation();
    });
    return `NPC ${session.npcTypeId}: playing sequence ${sequenceId}.`;
}

function getCurrentCandidate(session: ReviewSession): number | undefined {
    return session.candidates[session.candidateIndex];
}

function openReviewPanel(player: PlayerState, services: ScriptServices, session: ReviewSession): void {
    const candidate = getCurrentCandidate(session);
    const sequenceId = session.selectedSequenceId;
    openUiPanel(
        services,
        player,
        NPC_ANIMATION_REVIEW_PANEL_GROUP_ID,
        `NPC ${session.npcTypeId} animation review`,
    );
    sendUiMenuButtons(
        services,
        player.id,
        NPC_ANIMATION_REVIEW_PANEL_GROUP_ID,
        REVIEW_BUTTONS,
    );
    const candidateLabel =
        candidate === undefined
            ? "No recorded candidates"
            : `Candidate ${session.candidateIndex + 1}/${session.candidates.length}: ${candidate}`;
    sendUiFooterButton(
        services,
        player.id,
        NPC_ANIMATION_REVIEW_PANEL_GROUP_ID,
        `${candidateLabel} | Playing: ${sequenceId ?? "none"} | ${
            session.specialName
                ? `Special: ${session.specialName}`
                : "Special: name not set"
        }`,
    );
}

function saveConfirmedAnimation(
    npcTypeId: number,
    role: ReviewAnimationRole,
    sequenceId: number,
    specialName?: string,
): void {
    const combatDefsPath = resolveDataPath("npc-combat-defs.json");
    const text = fs.readFileSync(combatDefsPath, "utf8");
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const definitions = JSON.parse(text) as NpcCombatDefinitionsFile;
    definitions.npcs ??= {};

    const entry = (definitions.npcs[String(npcTypeId)] ??= {});
    entry.anims ??= {};
    assignNpcCombatAnimation(
        entry.anims,
        role === "special"
            ? { role, sequenceId, name: specialName }
            : { role, sequenceId },
    );
    // A normal combat-style review should immediately repair a missing or
    // generic live attack. Once a real primary has been saved, later style
    // choices do not replace it; use the Primary button when that is intended.
    if (
        (role === "melee" || role === "ranged" || role === "magic") &&
        (getPrimaryNpcAnimation(entry.anims.attack) === undefined ||
            getPrimaryNpcAnimation(entry.anims.attack) ===
                GENERIC_HUMANOID_ATTACK_ANIMATION)
    ) {
        assignNpcCombatAnimation(entry.anims, { role: "attack", sequenceId });
    }

    const formatted = `${JSON.stringify(definitions, null, 2)}\n`.replace(/\n/g, lineEnding);
    fs.writeFileSync(combatDefsPath, formatted, "utf8");
}

function isRole(value: string | undefined): value is ReviewAnimationRole {
    return (
        value === "attack" ||
        value === "melee" ||
        value === "ranged" ||
        value === "magic" ||
        value === "block" ||
        value === "death" ||
        value === "spawn" ||
        value === "special"
    );
}

function help(): string {
    return [
        "::npcreview <npc id> - spawn a private review NPC and open the button panel.",
        "::npcreview next|prev|show - cycle or inspect the observed candidates.",
        "::npcreview play <sequence id> - preview any sequence manually.",
        "::npcreview special <name> - select the named mechanic used by the panel's Special button.",
        "::npcreview save <attack|melee|ranged|magic|block|death|spawn> [sequence id] - save a reviewed role.",
        "::npcreview save special <name> [sequence id] - add to a named special pool (a numeric third argument keeps the legacy anonymous slot format).",
        "::npcreview clear - remove your current preview NPC.",
        "Saved roles apply after a server restart. Candidates are observations, not assignments.",
    ].join(" ");
}

export function registerNpcAnimationReviewCommands(
    registry: IScriptRegistry,
    services: ScriptServices,
): void {
    registry.registerCommand("npcreview", ({ player, args }) => {
        const action = args[0]?.toLowerCase();

        if (!action || action === "help") return help();

        const requestedNpcId = parseNpcTypeId(action);
        if (requestedNpcId !== undefined) {
            const candidates = readCandidates(requestedNpcId);

            const previous = sessionsByPlayerId.get(player.id);
            if (previous) services.npc.removeNpc(previous.previewNpcId);

            const preview = services.npc.spawnNpc({
                id: requestedNpcId,
                x: player.tileX + PREVIEW_DISTANCE_TILES,
                y: player.tileY,
                level: player.level,
                wanderRadius: 0,
                isAggressive: false,
                // Death candidates are visual previews. The dummy must never
                // be killable, otherwise a normal combat death/respawn steals
                // time from the review workflow.
                isUnattackable: true,
                worldViewId: player.worldViewId,
                ownerPlayerId: player.id,
                lifetimeTicks: PREVIEW_LIFETIME_TICKS,
            });
            if (!preview) return `Could not spawn NPC ${requestedNpcId}; check that it exists in this cache.`;

            services.npc.stopNpcMovement(preview, PREVIEW_LIFETIME_TICKS);
            const session: ReviewSession = {
                npcTypeId: requestedNpcId,
                previewNpcId: preview.id,
                candidates,
                candidateIndex: 0,
                selectedSequenceId: candidates[0],
                playbackGeneration: 0,
            };
            sessionsByPlayerId.set(player.id, session);
            const sequenceId = candidates[0];
            openReviewPanel(player, services, session);
            if (sequenceId === undefined) {
                return `Reviewing NPC ${requestedNpcId}: it has no ${CANDIDATE_SOURCE} candidates. Use ::npcreview play <sequence id> to test one manually.`;
            }
            playCandidate(services, player.id, session, sequenceId);
            return `Reviewing NPC ${requestedNpcId}: candidate 1/${candidates.length} is ${sequenceId}. Use ::npcreview next.`;
        }

        const session = sessionsByPlayerId.get(player.id);
        if (!session || !getPreviewNpc(services, player.id, session)) {
            return "Start with ::npcreview <npc id>.";
        }

        if (action === "clear") {
            services.npc.removeNpc(session.previewNpcId);
            sessionsByPlayerId.delete(player.id);
            services.dialog.getInterfaceService()?.closeModal(player);
            return `Removed the NPC ${session.npcTypeId} preview.`;
        }

        if (action === "next" || action === "prev") {
            if (session.candidates.length === 0) {
                return "This NPC has no recorded candidates. Use ::npcreview play <sequence id>.";
            }
            const change = action === "next" ? 1 : -1;
            session.candidateIndex =
                (session.candidateIndex + change + session.candidates.length) % session.candidates.length;
            const sequenceId = getCurrentCandidate(session)!;
            session.selectedSequenceId = sequenceId;
            playCandidate(services, player.id, session, sequenceId);
            openReviewPanel(player, services, session);
            return `NPC ${session.npcTypeId}: candidate ${session.candidateIndex + 1}/${session.candidates.length} is ${sequenceId}.`;
        }

        if (action === "show") {
            const sequenceId = getCurrentCandidate(session);
            if (sequenceId === undefined) {
                return `NPC ${session.npcTypeId} has no ${CANDIDATE_SOURCE} candidates.`;
            }
            return `NPC ${session.npcTypeId}: candidate ${session.candidateIndex + 1}/${session.candidates.length} is ${sequenceId}.`;
        }

        if (action === "play") {
            const sequenceId = parseSequenceId(args[1]);
            if (sequenceId === undefined) return "Usage: ::npcreview play <sequence id>";
            const candidateIndex = session.candidates.indexOf(sequenceId);
            if (candidateIndex >= 0) session.candidateIndex = candidateIndex;
            session.selectedSequenceId = sequenceId;
            const result = playCandidate(services, player.id, session, sequenceId);
            openReviewPanel(player, services, session);
            return result;
        }

        if (action === "special") {
            const specialName = normalizeNpcSpecialName(args.slice(1).join("-"));
            if (!specialName) {
                return "Usage: ::npcreview special <name> (letters, numbers, hyphens, or underscores)";
            }
            session.specialName = specialName;
            openReviewPanel(player, services, session);
            return `NPC ${session.npcTypeId}: the Special button now saves to '${specialName}'.`;
        }

        if (action === "save") {
            const role = args[1]?.toLowerCase();
            if (!isRole(role)) {
                return "Usage: ::npcreview save <attack|melee|ranged|magic|block|death|spawn|special> ...";
            }

            let specialName: string | undefined;
            let sequenceId: number | undefined;
            if (role === "special") {
                const legacySequenceId = parseSequenceId(args[2]);
                if (legacySequenceId !== undefined) {
                    // Backward compatibility with ::npcreview save special <sequence>.
                    sequenceId = legacySequenceId;
                } else {
                    specialName = normalizeNpcSpecialName(args[2] ?? "");
                    if (!specialName) {
                        return "Usage: ::npcreview save special <name> [sequence id]";
                    }
                    sequenceId = parseSequenceId(args[3]) ?? session.selectedSequenceId;
                    session.specialName = specialName;
                }
            } else {
                sequenceId = parseSequenceId(args[2]) ?? session.selectedSequenceId;
            }
            if (sequenceId === undefined) return "No candidate is selected; provide a sequence id explicitly.";

            try {
                saveConfirmedAnimation(session.npcTypeId, role, sequenceId, specialName);
                openReviewPanel(player, services, session);
                const roleLabel = specialName ? `special '${specialName}'` : role;
                return `Saved NPC ${session.npcTypeId} ${roleLabel} animation ${sequenceId} to npc-combat-defs.json. Restart the server to use it in combat.`;
            } catch (error) {
                services.system.logger.error("[npcreview] failed to save animation", error);
                return "Could not save npc-combat-defs.json; see the server log for details.";
            }
        }

        return help();
    });

    const getPanelSession = (player: PlayerState): ReviewSession | undefined => {
        const session = sessionsByPlayerId.get(player.id);
        return session && getPreviewNpc(services, player.id, session) ? session : undefined;
    };

    const moveCandidate = (player: PlayerState, change: number): void => {
        const session = getPanelSession(player);
        if (!session) return;
        if (session.candidates.length === 0) {
            services.messaging.sendGameMessage(player, "This NPC has no recorded candidates.");
            return;
        }
        session.candidateIndex =
            (session.candidateIndex + change + session.candidates.length) % session.candidates.length;
        const sequenceId = getCurrentCandidate(session)!;
        session.selectedSequenceId = sequenceId;
        playCandidate(services, player.id, session, sequenceId);
        openReviewPanel(player, services, session);
    };

    const savePanelRole = (player: PlayerState, role: ReviewAnimationRole): void => {
        const session = getPanelSession(player);
        const sequenceId = session?.selectedSequenceId;
        if (!session || sequenceId === undefined) return;
        if (role === "special" && !session.specialName) {
            services.messaging.sendGameMessage(
                player,
                "Choose a mechanic name first with ::npcreview special <name>.",
            );
            return;
        }
        try {
            saveConfirmedAnimation(
                session.npcTypeId,
                role,
                sequenceId,
                role === "special" ? session.specialName : undefined,
            );
            const roleLabel =
                role === "special" ? `special '${session.specialName}'` : role;
            services.messaging.sendGameMessage(
                player,
                `Saved ${roleLabel} animation ${sequenceId} for NPC ${session.npcTypeId}.`,
            );
            // Reviewing is usually a one-pass job: one role click saves this
            // sequence and immediately shows the next candidate. Previous is
            // always available for a correction.
            if (shouldAdvanceNpcAnimationReviewCandidate(role)) {
                moveCandidate(player, 1);
            }
        } catch (error) {
            services.system.logger.error("[npcreview] failed to save animation", error);
            services.messaging.sendGameMessage(player, "Could not save npc-combat-defs.json.");
        }
    };

    registerUiPanelActions(registry, services, NPC_ANIMATION_REVIEW_PANEL_GROUP_ID, [
        {
            componentId: ComponentIds.MENU_BUTTON_BACKGROUND_BASE,
            actionId: "review_previous",
            handle: ({ player }) => moveCandidate(player, -1),
        },
        {
            componentId: ComponentIds.MENU_BUTTON_BACKGROUND_BASE + 1,
            actionId: "review_next",
            handle: ({ player }) => moveCandidate(player, 1),
        },
        {
            componentId: ComponentIds.MENU_BUTTON_BACKGROUND_BASE + 2,
            actionId: "review_save_attack",
            handle: ({ player }) => savePanelRole(player, "attack"),
        },
        ...(["melee", "ranged", "magic", "block", "death", "spawn", "special"] as const).map((role, index) => ({
            componentId: ComponentIds.MENU_BUTTON_BACKGROUND_BASE + index + 3,
            actionId: `review_save_${role}`,
            handle: ({ player }: { player: PlayerState }) => savePanelRole(player, role),
        })),
    ]);
}
