import fs from "fs";
import path from "path";

import type { NpcState } from "../../../src/game/npc";
import type { IScriptRegistry, ScriptServices } from "../../../src/game/scripts/types";

/**
 * Candidate sequence ids observed by the OpenOSRS-style animation collector.
 * They are observations, not labelled combat roles: never load them as live
 * combat definitions without reviewing them in-game first.
 */
const CANDIDATE_SOURCE = "OpenOSRS service-animations observed sequence data";
const PREVIEW_LIFETIME_TICKS = 6_000;

type CombatAnimationRole = "attack" | "block" | "death";

type NpcCombatDefinitionsFile = {
    npcs?: Record<string, { name?: string; anims?: Partial<Record<CombatAnimationRole, number>> }>;
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
    entry.anims[role] = sequenceId;

    const formatted = `${JSON.stringify(definitions, null, 2)}\n`.replace(/\n/g, lineEnding);
    fs.writeFileSync(combatDefsPath, formatted, "utf8");
}

function isRole(value: string | undefined): value is CombatAnimationRole {
    return value === "attack" || value === "block" || value === "death";
}

function help(): string {
    return [
        "::npcreview <npc id> - spawn a private review NPC and play its first candidate.",
        "::npcreview next|prev|show - cycle or inspect the observed candidates.",
        "::npcreview play <sequence id> - preview any sequence manually.",
        "::npcreview save <attack|block|death> [sequence id] - save a reviewed role.",
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
                x: player.tileX + 1,
                y: player.tileY,
                level: player.level,
                wanderRadius: 0,
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
            return playCandidate(services, player.id, session, sequenceId);
        }

        if (action === "save") {
            const role = args[1]?.toLowerCase();
            if (!isRole(role)) return "Usage: ::npcreview save <attack|block|death> [sequence id]";

            const sequenceId = parseSequenceId(args[2]) ?? session.selectedSequenceId;
            if (sequenceId === undefined) return "No candidate is selected; provide a sequence id explicitly.";

            try {
                saveConfirmedAnimation(session.npcTypeId, role, sequenceId);
                return `Saved NPC ${session.npcTypeId} ${role} animation ${sequenceId} to npc-combat-defs.json. Restart the server to use it in combat.`;
            } catch (error) {
                services.system.logger.error("[npcreview] failed to save animation", error);
                return "Could not save npc-combat-defs.json; see the server log for details.";
            }
        }

        return help();
    });
}
