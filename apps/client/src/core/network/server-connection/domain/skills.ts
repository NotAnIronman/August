import type { SkillsServerPayload } from "@client/core/network/server-connection/types/index";
import type { SkillsUpdateEvent } from "@client/core/network/server-connection/types/sync";
import { state } from "@client/core/network/server-connection/state";
import { sanitizeSkillEntry } from "@client/core/network/server-connection/normalization/InboundPayloads";

export function emitSkills(payload: SkillsServerPayload): void {
    if (!state.lastSkillsState || payload.kind === "snapshot") {
        state.lastSkillsState = {
            totalLevel: Number(payload.totalLevel) || 0,
            combatLevel: Number(payload.combatLevel) || 0,
            byId: new Map(),
        };
    } else {
        state.lastSkillsState.totalLevel = Number(payload.totalLevel) || 0;
        state.lastSkillsState.combatLevel = Number(payload.combatLevel) || 0;
    }

    const changed: import("@client/core/network/server-connection/types").SkillEntryMessage[] = [];
    for (const raw of payload.skills || []) {
        const entry = sanitizeSkillEntry(raw);
        state.lastSkillsState.byId.set(entry.id, entry);
        changed.push({ ...entry });
    }

    const event: SkillsUpdateEvent = {
        kind: payload.kind,
        totalLevel: state.lastSkillsState.totalLevel,
        combatLevel: state.lastSkillsState.combatLevel,
        skills:
            payload.kind === "snapshot"
                ? Array.from(state.lastSkillsState.byId.values()).map((entry) => ({ ...entry }))
                : changed,
    };

    for (const listener of state.skillsListeners) {
        try {
            listener(event);
        } catch (err) {
            console.warn("skills listener error", err);
        }
    }
}

export function emitPlayerSync(frame: import("@client/engine/game/sync/PlayerSyncTypes").PlayerSyncFrame): void {
    for (const listener of state.playerSyncListeners) {
        try {
            listener(frame);
        } catch (err) {
            console.warn("player sync listener error", err);
        }
    }
}
