import fs from "fs";
import path from "path";

import { NPC_ANIMATION_REVIEW_PANEL_GROUP_ID } from "../../../../client/common/ui/widgets/custom/journalPanel.cs2";
import { ComponentIds, type UiMenuButton } from "../../../../client/common/uikit/contracts";
import type { NpcState } from "../../../src/game/npc";
import type { PlayerState } from "../../../src/game/player";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";
import { registerUiPanelActions } from "../uikit/actions";
import { openUiPanel, sendUiFooterButton, sendUiMenuButtons } from "../uikit/panelData";

/**
 * Candidate sequence ids observed by the OpenOSRS-style animation collector.
 * They are observations, not labelled combat roles: never load them as live
 * combat definitions without reviewing them in-game first.
 */
const CANDIDATE_SOURCE = "OpenOSRS service-animations observed sequence data";
const PREVIEW_LIFETIME_TICKS = 6_000;
const PREVIEW_DISTANCE_TILES = 8;
// The old combat-definitions file used this as the broad humanoid fallback.
// A reviewed combat style should replace it, but a deliberately chosen primary
// animation must never be silently replaced by a later style review.
const GENERIC_HUMANOID_ATTACK_ANIMATION = 422;

type CombatAnimationRole =
    | "attack"
    | "melee"
    | "ranged"
    | "magic"
    | "block"
    | "death"
    | "special";

type NpcCombatAnimationData = Partial<
    Record<Exclude<CombatAnimationRole, "special">, number>
> & {
    specials?: number[];
};

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
    const id = Number.parseInt(value ?? "", 10);
    return Number.isFinite(id) && id >= 0 ? id : undefined;
}

function parseSequenceId(value: string | undefined): number | undefined {
    const id = Number.parseInt(value ?? "", 10);
    return Number.isFinite(id) && id >= 0 ? id : undefined;
}

function readCandidates(npcTypeId: number): number[] {
    try {
        const raw = JSON.parse(
            fs.readFileSync(resolveDataPath("npc-animation-candidates.json"), "utf8"),
        ) as Record<string, unknown>;
        const values = raw[String(npcTypeId)];
        if (!Array.isArray(values)) return [];

        const seen = new Set<number>();
        return values.filter((value): value is number => {
            if (
                typeof value !== "number" ||
                !Number.isInteger(value) ||
                value < 0 ||
                seen.has(value)
            ) {
                return false;
            }
            seen.add(value);
            return true;
        });
    } catch {
        return [];
    }
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
        `${candidateLabel} | Playing: ${sequenceId ?? "none"}`,
    );
}

function saveConfirmedAnimation(
    npcTypeId: number,
    role: CombatAnimationRole,
    sequenceId: number,
): void {
    const combatDefsPath = resolveDataPath("npc-combat-defs.json");
    const text = fs.readFileSync(combatDefsPath, "utf8");
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const definitions = JSON.parse(text) as NpcCombatDefinitionsFile;
    definitions.npcs ??= {};

    const entry = (definitions.npcs[String(npcTypeId)] ??= {});
    entry.anims ??= {};
    if (role === "special") {
        const specials = Array.isArray(entry.anims.specials) ? entry.anims.specials : [];
        if (!specials.includes(sequenceId)) specials.push(sequenceId);
        entry.anims.specials = specials;
    } else {
        entry.anims[role] = sequenceId;
    }
    // A normal combat-style review should immediately repair a missing or
    // generic live attack. Once a real primary has been saved, later style
    // choices do not replace it; use the Primary button when that is intended.
    if (
        (role === "melee" || role === "ranged" || role === "magic") &&
        (entry.anims.attack === undefined ||
            entry.anims.attack === GENERIC_HUMANOID_ATTACK_ANIMATION)
    ) {
        entry.anims.attack = sequenceId;
    }

    const formatted = `${JSON.stringify(definitions, null, 2)}\n`.replace(/\n/g, lineEnding);
    fs.writeFileSync(combatDefsPath, formatted, "utf8");
}

function isRole(value: string | undefined): value is CombatAnimationRole {
    return (
        value === "attack" ||
        value === "melee" ||
        value === "ranged" ||
        value === "magic" ||
        value === "block" ||
        value === "death" ||
        value === "special"
    );
}

function help(): string {
    return [
        "::npcreview <npc id> - spawn a private review NPC and open the button panel.",
        "::npcreview next|prev|show - cycle or inspect the observed candidates.",
        "::npcreview play <sequence id> - preview any sequence manually.",
        "::npcreview save <attack|melee|ranged|magic|block|death|special> [sequence id] - save a reviewed role.",
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
            };
            sessionsByPlayerId.set(player.id, session);
            const sequenceId = candidates[0];
            openReviewPanel(player, services, session);
            if (sequenceId === undefined) {
                return `Reviewing NPC ${requestedNpcId}: it has no ${CANDIDATE_SOURCE} candidates. Use ::npcreview play <sequence id> to test one manually.`;
            }
            services.npc.queueNpcSeq(preview, sequenceId);
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

        if (action === "save") {
            const role = args[1]?.toLowerCase();
            if (!isRole(role)) {
                return "Usage: ::npcreview save <attack|melee|ranged|magic|block|death|special> [sequence id]";
            }

            const sequenceId = parseSequenceId(args[2]) ?? session.selectedSequenceId;
            if (sequenceId === undefined) return "No candidate is selected; provide a sequence id explicitly.";

            try {
                saveConfirmedAnimation(session.npcTypeId, role, sequenceId);
                openReviewPanel(player, services, session);
                return `Saved NPC ${session.npcTypeId} ${role} animation ${sequenceId} to npc-combat-defs.json. Restart the server to use it in combat.`;
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

    const savePanelRole = (player: PlayerState, role: CombatAnimationRole): void => {
        const session = getPanelSession(player);
        const sequenceId = session?.selectedSequenceId;
        if (!session || sequenceId === undefined) return;
        try {
            saveConfirmedAnimation(session.npcTypeId, role, sequenceId);
            services.messaging.sendGameMessage(
                player,
                `Saved ${role} animation ${sequenceId} for NPC ${session.npcTypeId}.`,
            );
            // Reviewing is usually a one-pass job: one role click saves this
            // sequence and immediately shows the next candidate. Previous is
            // always available for a correction.
            moveCandidate(player, 1);
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
        ...(["melee", "ranged", "magic", "block", "death", "special"] as const).map((role, index) => ({
            componentId: ComponentIds.MENU_BUTTON_BACKGROUND_BASE + index + 3,
            actionId: `review_save_${role}`,
            handle: ({ player }: { player: PlayerState }) => savePanelRole(player, role),
        })),
    ]);
}
