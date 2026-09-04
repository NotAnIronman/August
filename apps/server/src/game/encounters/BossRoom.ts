import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { InstanceGraveLocation } from "@server/game/state/PlayerInstanceGraveState";
import type {
    InstanceAreaCopy,
    QuestInstanceHandle,
    QuestInstanceLoc,
    QuestInstanceNpc,
} from "@server/world/InstancedAreaManager";

export type BossRoomAccess = "solo" | "party";
export type BossRoomPeekScope = "current" | "joinable";
export type BossRoomDoorAction = string | undefined;

export interface BossRoomDoorActions {
    readonly entry?: readonly BossRoomDoorAction[];
    readonly peek?: readonly BossRoomDoorAction[];
    readonly solo?: readonly BossRoomDoorAction[];
    readonly party?: readonly BossRoomDoorAction[];
    readonly join?: readonly BossRoomDoorAction[];
    readonly leave?: readonly BossRoomDoorAction[];
}

export interface BossRoomDialogs {
    readonly entry: {
        readonly id: string;
        readonly title: string;
        readonly options?: readonly [string, string, string];
    };
    readonly join: {
        readonly id: string;
        readonly title: string;
    };
}

export interface BossRoomMessages {
    readonly alreadyInside: string;
    readonly unavailable: string;
    readonly leaveBeforeJoining: string;
    readonly noJoinableParties: string;
    readonly partyUnavailable: string;
    readonly peek: (adventurers: number, scope: BossRoomPeekScope) => string;
}

export interface BossRoomDefinition {
    /** Stable `QuestInstanceSpec.definitionId`. */
    readonly id: string;
    readonly doorLocId: number;
    readonly templateCopies: readonly InstanceAreaCopy[];
    readonly destination: Readonly<{ x: number; y: number; level: number }>;
    readonly exit: Readonly<{ x: number; y: number; level: number }>;
    readonly grave?: InstanceGraveLocation;
    readonly npcs?: readonly QuestInstanceNpc[];
    readonly locs?: readonly QuestInstanceLoc[];
    readonly partyMaxPlayers?: number;
    readonly visiblePartyLimit?: number;
    readonly joinInProgress?: boolean;
    readonly markStarted?: boolean;
    readonly dialogs: BossRoomDialogs;
    readonly messages: BossRoomMessages;
    readonly actions?: BossRoomDoorActions;
}

export interface DefinedBossRoom {
    readonly definition: BossRoomDefinition;
    isInside(player: PlayerState, services: ScriptServices): boolean;
    create(
        player: PlayerState,
        services: ScriptServices,
        access: BossRoomAccess,
    ): QuestInstanceHandle | undefined;
    join(
        player: PlayerState,
        services: ScriptServices,
        instanceId: string,
    ): QuestInstanceHandle | undefined;
    leave(player: PlayerState, services: ScriptServices): boolean;
    showEntryOptions(player: PlayerState, services: ScriptServices): void;
    showJoinOptions(player: PlayerState, services: ScriptServices): void;
    peek(player: PlayerState, services: ScriptServices): void;
    register(registry: IScriptRegistry): void;
}

const DEFAULT_ENTRY_OPTIONS = Object.freeze([
    "Enter solo",
    "Create a party instance",
    "Join a party instance",
] as const);

const DEFAULT_ACTIONS: Required<BossRoomDoorActions> = Object.freeze({
    entry: Object.freeze(["open"]),
    peek: Object.freeze(["peek"]),
    solo: Object.freeze(["enter solo"]),
    party: Object.freeze(["enter party"]),
    join: Object.freeze(["join party"]),
    leave: Object.freeze([]),
});

function normalizedActions(definition: BossRoomDefinition): Required<BossRoomDoorActions> {
    const configured = definition.actions ?? {};
    const actions = {
        entry: configured.entry ?? DEFAULT_ACTIONS.entry,
        peek: configured.peek ?? DEFAULT_ACTIONS.peek,
        solo: configured.solo ?? DEFAULT_ACTIONS.solo,
        party: configured.party ?? DEFAULT_ACTIONS.party,
        join: configured.join ?? DEFAULT_ACTIONS.join,
        leave: configured.leave ?? DEFAULT_ACTIONS.leave,
    };
    const seen = new Set<string>();
    for (const [route, values] of Object.entries(actions)) {
        for (const value of values) {
            const key = value?.trim().toLowerCase() ?? "<default>";
            if (seen.has(key)) {
                throw new Error(
                    `Boss room '${definition.id}' registers door action '${key}' more than once (at '${route}').`,
                );
            }
            seen.add(key);
        }
    }
    return actions;
}

function validateDefinition(definition: BossRoomDefinition): void {
    if (!definition.id.trim()) throw new Error("Boss room id cannot be empty.");
    if (!Number.isInteger(definition.doorLocId) || definition.doorLocId <= 0) {
        throw new Error(`Boss room '${definition.id}' requires a positive door loc id.`);
    }
    if (definition.templateCopies.length === 0) {
        throw new Error(`Boss room '${definition.id}' requires at least one template copy.`);
    }
    if (!definition.dialogs.entry.id.trim() || !definition.dialogs.join.id.trim()) {
        throw new Error(`Boss room '${definition.id}' dialog ids cannot be empty.`);
    }
    normalizedActions(definition);
}

/**
 * Defines the common instance-room plumbing used by GWD-style boss chambers.
 * Encounter combat and stronghold traversal deliberately remain outside this API.
 */
export function defineBossRoom(definition: BossRoomDefinition): DefinedBossRoom {
    validateDefinition(definition);
    const actions = normalizedActions(definition);
    const partyMaxPlayers = Math.max(1, Math.trunc(definition.partyMaxPlayers ?? 5));
    const visiblePartyLimit = Math.max(1, Math.trunc(definition.visiblePartyLimit ?? 5));
    const entryOptions = definition.dialogs.entry.options ?? DEFAULT_ENTRY_OPTIONS;

    const isInside = (player: PlayerState, services: ScriptServices): boolean =>
        services.instances.get(player.id)?.definitionId === definition.id;

    const create = (
        player: PlayerState,
        services: ScriptServices,
        access: BossRoomAccess,
    ): QuestInstanceHandle | undefined => {
        if (services.instances.get(player.id)) {
            services.messaging.sendGameMessage(player, definition.messages.alreadyInside);
            return undefined;
        }
        const templateChunks = services.instances.buildTemplate(definition.templateCopies);
        const room = services.instances.create(player, {
            definitionId: definition.id,
            access,
            maxPlayers: access === "solo" ? 1 : partyMaxPlayers,
            joinInProgress: access === "party" && (definition.joinInProgress ?? true),
            templateChunks,
            destination: definition.destination,
            exit: definition.exit,
            grave: definition.grave,
            npcs: definition.npcs,
            locs: definition.locs,
        });
        if (!room) {
            services.messaging.sendGameMessage(player, definition.messages.unavailable);
            return undefined;
        }
        if (definition.markStarted !== false) services.instances.markStarted(room.id);
        return room;
    };

    const join = (
        player: PlayerState,
        services: ScriptServices,
        instanceId: string,
    ): QuestInstanceHandle | undefined => {
        const current = services.instances.get(player.id);
        if (current) {
            if (current.id === instanceId && current.definitionId === definition.id) {
                return current;
            }
            services.messaging.sendGameMessage(player, definition.messages.leaveBeforeJoining);
            return undefined;
        }
        const candidate = services.instances.getById(instanceId);
        if (!candidate || candidate.definitionId !== definition.id) {
            services.messaging.sendGameMessage(player, definition.messages.partyUnavailable);
            return undefined;
        }
        const room = services.instances.join(player, instanceId);
        if (!room) services.messaging.sendGameMessage(player, definition.messages.partyUnavailable);
        return room;
    };

    const leave = (player: PlayerState, services: ScriptServices): boolean => {
        if (!isInside(player, services)) return false;
        return services.instances.leave(player, definition.exit);
    };

    const showJoinOptions = (player: PlayerState, services: ScriptServices): void => {
        if (services.instances.get(player.id)) {
            services.messaging.sendGameMessage(player, definition.messages.leaveBeforeJoining);
            return;
        }
        const visible = services.instances
            .listJoinable(definition.id)
            .slice(0, visiblePartyLimit);
        if (visible.length === 0) {
            services.messaging.sendGameMessage(player, definition.messages.noJoinableParties);
            return;
        }
        services.dialog.openDialogOptions(player, {
            id: definition.dialogs.join.id,
            title: definition.dialogs.join.title,
            options: visible.map(
                (room) =>
                    `${room.ownerName}'s party (${room.memberPlayerIds.length}/${room.maxPlayers})`,
            ),
            modal: true,
            onSelect: (choice) => {
                const selected = visible[choice];
                if (!selected) {
                    services.messaging.sendGameMessage(
                        player,
                        definition.messages.partyUnavailable,
                    );
                    return;
                }
                join(player, services, selected.id);
            },
        });
    };

    const showEntryOptions = (player: PlayerState, services: ScriptServices): void => {
        if (isInside(player, services)) {
            leave(player, services);
            return;
        }
        services.dialog.openDialogOptions(player, {
            id: definition.dialogs.entry.id,
            title: definition.dialogs.entry.title,
            options: [...entryOptions],
            modal: true,
            onSelect: (choice) => {
                if (choice === 0) create(player, services, "solo");
                else if (choice === 1) create(player, services, "party");
                else if (choice === 2) showJoinOptions(player, services);
            },
        });
    };

    const peek = (player: PlayerState, services: ScriptServices): void => {
        const ownRoom = services.instances.get(player.id);
        const current = ownRoom?.definitionId === definition.id;
        const adventurers = current
            ? ownRoom.memberPlayerIds.length
            : services.instances
                  .listJoinable(definition.id)
                  .reduce((total, room) => total + room.memberPlayerIds.length, 0);
        services.messaging.sendGameMessage(
            player,
            definition.messages.peek(adventurers, current ? "current" : "joinable"),
        );
    };

    const register = (registry: IScriptRegistry): void => {
        for (const action of actions.entry) {
            registry.registerLocInteraction(
                definition.doorLocId,
                ({ player, services }) => showEntryOptions(player, services),
                action,
            );
        }
        for (const action of actions.peek) {
            registry.registerLocInteraction(
                definition.doorLocId,
                ({ player, services }) => peek(player, services),
                action,
            );
        }
        for (const action of actions.solo) {
            registry.registerLocInteraction(
                definition.doorLocId,
                ({ player, services }) => {
                    create(player, services, "solo");
                },
                action,
            );
        }
        for (const action of actions.party) {
            registry.registerLocInteraction(
                definition.doorLocId,
                ({ player, services }) => {
                    create(player, services, "party");
                },
                action,
            );
        }
        for (const action of actions.join) {
            registry.registerLocInteraction(
                definition.doorLocId,
                ({ player, services }) => showJoinOptions(player, services),
                action,
            );
        }
        for (const action of actions.leave) {
            registry.registerLocInteraction(
                definition.doorLocId,
                ({ player, services }) => {
                    leave(player, services);
                },
                action,
            );
        }
    };

    return Object.freeze({
        definition,
        isInside,
        create,
        join,
        leave,
        showEntryOptions,
        showJoinOptions,
        peek,
        register,
    });
}
