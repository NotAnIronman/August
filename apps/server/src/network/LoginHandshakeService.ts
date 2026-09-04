import { WebSocket } from "ws";
import type { RawData } from "ws";
import type { IncomingMessage } from "node:http";

import {
    QUEST_LIST_ENTRY_EVENT_FLAGS,
    QUEST_LIST_ENTRY_LIST_UID,
    QUEST_LIST_ENTRY_MAX_SLOT,
    SIDE_JOURNAL_GROUP_ID,
} from "@august/protocol/ui/sideJournal";
import {
    VARBIT_SIDE_JOURNAL_TAB,
    VARBIT_XPDROPS_ENABLED,
    VARP_SIDE_JOURNAL_STATE,
} from "@august/game-model/state/vars";
import { getItemDefinition } from "@server/data/items";
import { readPositiveEnvInteger } from "@server/config/environment";
import type { ServerServices } from "@server/game/ServerServices";
import { syncInstanceGravePresentation } from "@server/game/death/InstanceGravePresentation";
import type { PlayerState } from "@server/game/player";
import { buildPlayerSaveKey, normalizePlayerAccountName } from "@server/game/state/PlayerSessionKeys";
import { logger } from "@server/observability/logger";
import { INVENTORY_EVENT_FLAGS } from "@server/widgets/InterfaceService";
import {
    DisplayMode,
    getDefaultInterfaces,
    getMainmodalUid,
    getRootInterfaceId,
} from "@server/widgets/WidgetManager";
import {
    MINIMAP_WIDGET_GROUP_ID,
    VARBIT_MINIMAP_TOGGLE,
    createOrbsBootstrapActions,
    getMapClockValue,
    getMinimapToggleVarbits,
    rewriteMinimapOrbsMount,
} from "@server/widgets/minimapOrbs";
import { getEnhancedClientLoginScripts, getViewportRootInitScripts } from "@server/widgets/viewport";
import { ADMIN_CROWN_ICON } from "@server/network/AuthenticationService";
import type { RoutedMessage } from "@server/network/MessageRouter";
import { PlayerSyncSession } from "@server/network/PlayerSyncSession";
import { resolveClientAddress } from "@server/network/TrustedProxyClientAddress";
import { handleExaminePacket as handleExaminePacketFn } from "@server/network/handlers/examineHandler";
import { encodeMessage } from "@server/network/messages";
import {
    type AppearanceSetPacket,
    type DecodedPacket,
    isBinaryData,
    isClientMessagePacket,
    parsePacketsAsMessages,
    toUint8Array,
} from "@server/network/packet";
import { decodeClientPacket } from "@server/network/packet/ClientBinaryDecoder";

const NPC_STREAM_RADIUS_TILES = 15;
export const PENDING_LOGIN_RESERVATION_MS = 60_000;
const DEBUG_NPC_STREAM =
    (process?.env?.DEBUG_NPC_STREAM ?? "").toString().toLowerCase() === "1" ||
    (process?.env?.DEBUG_NPC_STREAM ?? "").toString().toLowerCase() === "true";

type PlayerAppearanceState = NonNullable<PlayerState["appearance"]>;

interface HandshakeAppearance {
    gender?: number;
    kits?: number[];
    colors?: number[];
}

type PendingLoginReservation = {
    name: string;
    accountName?: string;
    expiresAt: number;
    socket: WebSocket;
};

export interface LoginHandshakeOptions {
    /** Maximum password hashes allowed in the worker pool at once. */
    maxConcurrentCredentialChecks?: number;
    /** Maximum pre-authentication frames accepted from one socket per window. */
    maxPreAuthMessages?: number;
    preAuthWindowMs?: number;
    /** Maximum time a socket may remain connected without entering the world. */
    preAuthTimeoutMs?: number;
    /** Test seam for deterministic connection-deadline coverage. */
    scheduleTimeout?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
    cancelTimeout?: (timeout: NodeJS.Timeout) => void;
}

type PreAuthWindow = { count: number; resetAt: number };

/**
 * Manages the login validation, handshake negotiation, and WebSocket
 * connection lifecycle (message routing + disconnect cleanup).
 *
 * Extracted from WSServer to reduce the size of the god object while
 * keeping the deeply-coupled handshake flow intact.
 */
export class LoginHandshakeService {
    private readonly pendingLoginNames = new WeakMap<WebSocket, PendingLoginReservation>();
    /**
     * A successful login response precedes the handshake that creates the
     * PlayerState. Keep a short-lived reservation for that gap so two sockets
     * cannot authenticate the same account and both enter the world.
     */
    private readonly pendingLoginSockets = new Map<string, PendingLoginReservation>();
    private readonly credentialChecksInFlight = new WeakSet<WebSocket>();
    private readonly authenticatingAccountNames = new Set<string>();
    private readonly preAuthWindows = new WeakMap<WebSocket, PreAuthWindow>();
    private readonly clientAddresses = new WeakMap<WebSocket, string>();
    private readonly preAuthDeadlines = new WeakMap<WebSocket, NodeJS.Timeout>();
    private readonly maxConcurrentCredentialChecks: number;
    private readonly maxPreAuthMessages: number;
    private readonly preAuthWindowMs: number;
    private readonly preAuthTimeoutMs: number;
    private readonly scheduleTimeout: (callback: () => void, delayMs: number) => NodeJS.Timeout;
    private readonly cancelTimeout: (timeout: NodeJS.Timeout) => void;
    private activeCredentialChecks = 0;

    constructor(
        private readonly svc: ServerServices,
        private readonly now: () => number = Date.now,
        options: LoginHandshakeOptions = {},
    ) {
        this.maxConcurrentCredentialChecks = Math.min(
            64,
            Math.max(
                1,
                Math.trunc(
                    options.maxConcurrentCredentialChecks ??
                        readPositiveEnvInteger("LOGIN_HASH_CONCURRENCY") ??
                        4,
                ),
            ),
        );
        this.maxPreAuthMessages = Math.min(
            1_000,
            Math.max(
                2,
                Math.trunc(
                    options.maxPreAuthMessages ??
                        readPositiveEnvInteger("WS_PREAUTH_MESSAGES_PER_WINDOW") ??
                        20,
                ),
            ),
        );
        this.preAuthWindowMs = Math.min(
            60_000,
            Math.max(
                1_000,
                Math.trunc(
                    options.preAuthWindowMs ??
                        readPositiveEnvInteger("WS_PREAUTH_WINDOW_MS") ??
                        5_000,
                ),
            ),
        );
        this.preAuthTimeoutMs = Math.min(
            120_000,
            Math.max(
                5_000,
                Math.trunc(
                    options.preAuthTimeoutMs ??
                        readPositiveEnvInteger("WS_PREAUTH_TIMEOUT_MS") ??
                        30_000,
                ),
            ),
        );
        this.scheduleTimeout =
            options.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
        this.cancelTimeout = options.cancelTimeout ?? clearTimeout;
    }

    private armPreAuthDeadline(ws: WebSocket): void {
        this.clearPreAuthDeadline(ws);
        const timeout = this.scheduleTimeout(() => {
            this.preAuthDeadlines.delete(ws);
            if (this.svc.players?.get(ws)) return;
            logger.warn(
                `[login] closing connection that did not enter the world within ${this.preAuthTimeoutMs}ms`,
            );
            try {
                ws.close(1008, "authentication_timeout");
            } catch {
                // Socket may already be gone.
            }
        }, this.preAuthTimeoutMs);
        timeout.unref?.();
        this.preAuthDeadlines.set(ws, timeout);
    }

    private clearPreAuthDeadline(ws: WebSocket): void {
        const timeout = this.preAuthDeadlines.get(ws);
        if (!timeout) return;
        this.preAuthDeadlines.delete(ws);
        this.cancelTimeout(timeout);
    }

    private acceptPreAuthMessage(ws: WebSocket): boolean {
        const now = this.now();
        const existing = this.preAuthWindows.get(ws);
        if (!existing || now >= existing.resetAt) {
            this.preAuthWindows.set(ws, { count: 1, resetAt: now + this.preAuthWindowMs });
            return true;
        }
        if (existing.count >= this.maxPreAuthMessages) return false;
        existing.count++;
        return true;
    }

    setPendingLoginName(ws: WebSocket, name: string): void {
        this.clearPendingLoginName(ws);
        const accountName = normalizePlayerAccountName(name);
        const reservation: PendingLoginReservation = {
            name,
            accountName,
            expiresAt: this.now() + PENDING_LOGIN_RESERVATION_MS,
            socket: ws,
        };
        this.pendingLoginNames.set(ws, reservation);
        if (accountName) this.pendingLoginSockets.set(accountName, reservation);
    }

    consumePendingLoginName(ws: WebSocket): string | undefined {
        const reservation = this.pendingLoginNames.get(ws);
        this.clearPendingLoginName(ws);
        if (!reservation || reservation.expiresAt <= this.now()) return undefined;
        return reservation.name;
    }

    private isLoginPendingForAnotherSocket(ws: WebSocket, username: string): boolean {
        const accountName = normalizePlayerAccountName(username);
        if (!accountName) return false;
        const reservation = this.pendingLoginSockets.get(accountName);
        if (!reservation) return false;
        if (reservation.expiresAt <= this.now()) {
            this.clearPendingLoginName(reservation.socket);
            return false;
        }
        return reservation.socket !== ws;
    }

    private clearPendingLoginName(ws: WebSocket): void {
        const reservation = this.pendingLoginNames.get(ws);
        this.pendingLoginNames.delete(ws);
        if (
            reservation?.accountName &&
            this.pendingLoginSockets.get(reservation.accountName) === reservation
        ) {
            this.pendingLoginSockets.delete(reservation.accountName);
        }
    }

    getSocketRemoteAddress(ws: WebSocket): string | undefined {
        const resolvedAddress = this.clientAddresses.get(ws);
        if (resolvedAddress) return resolvedAddress;
        const transport = Reflect.get(ws, "_socket") as { remoteAddress?: string } | undefined;
        const remoteAddress = transport?.remoteAddress;
        return remoteAddress && remoteAddress.length > 0 ? remoteAddress : undefined;
    }

    completeLogout(ws: WebSocket, player?: PlayerState, source?: string): void {
        const normalizedSource = source?.trim().slice(0, 64) ?? "";
        const sourceSuffix =
            normalizedSource.length > 0 && normalizedSource !== "logout"
                ? ` source=${normalizedSource}`
                : "";

        if (player) {
            logger.info(`[logout] Player ${player.id} logout approved${sourceSuffix}`);

            try {
                const response = encodeMessage({
                    type: "logout_response",
                    payload: { success: true },
                });
                ws.send(response);
            } catch (err) {
                logger.warn("[logout] send logout response failed", err);
            }

            try {
                const saveKey = player.__saveKey ?? buildPlayerSaveKey(player.name, player.id);
                this.svc.playerPersistence.saveSnapshot(saveKey, player);
                logger.info(`[logout] Saved player state for key: ${saveKey}${sourceSuffix}`);
            } catch (err) {
                logger.warn(`[logout] Failed to save player state${sourceSuffix}:`, err);
            }
        }

        try {
            ws.close(1000, "logout");
        } catch (err) {
            logger.warn("[logout] ws close failed", err);
        }
    }

    async handleLoginMessage(
        ws: WebSocket,
        payload: { username?: string; password?: string; revision?: number },
    ): Promise<void> {
        const { username, password, revision } = payload;
        const normalizedUsername = this.svc.authService.normalizePlayerNameForAuth(username);

        const sendLoginError = (errorCode: number, error: string) => {
            this.svc.networkLayer.withDirectSendBypass("login_response", () =>
                this.svc.networkLayer.sendWithGuard(
                    ws,
                    encodeMessage({
                        type: "login_response",
                        payload: { success: false, errorCode, error },
                    }),
                    "login_response",
                ),
            );
            logger.info(`Login failed (code ${errorCode}): ${username} - ${error}`);
        };

        const clientIp = this.getSocketRemoteAddress(ws) ?? "ws-unknown";
        logger.info(`Login attempt from: ${username} (${clientIp})`);

        // 0. Check client revision matches server
        const serverRevision = this.svc.cacheEnv?.info?.revision ?? 0;
        if (serverRevision > 0 && revision !== serverRevision) {
            sendLoginError(6, "Please close the client and reload to update.");
            return;
        }

        // 1. Check rate limiting first
        if (this.svc.authService.checkLoginRateLimit(clientIp)) {
            sendLoginError(9, "Login limit exceeded. Please wait a minute.");
            return;
        }

        // 2. Check maintenance mode
        if (this.svc.maintenanceMode) {
            sendLoginError(14, "The server is being updated. Please wait.");
            return;
        }

        // 3. Check world capacity
        if (this.svc.authService.isWorldFull()) {
            sendLoginError(2, "This world is full. Please use a different world.");
            return;
        }

        // 4. Validate username is not empty
        if (!normalizedUsername || normalizedUsername.length === 0) {
            sendLoginError(3, "Invalid username or password.");
            return;
        }

        // 5. Check if already logged in
        if (
            this.svc.authService.isPlayerAlreadyLoggedIn(normalizedUsername) ||
            this.isLoginPendingForAnotherSocket(ws, normalizedUsername)
        ) {
            sendLoginError(5, "Your account is already logged in. Try again in 60 seconds.");
            return;
        }

        // 6. Verify an existing password hash or register a new account.
        // Imported pre-password character saves require the temporary legacy
        // claim switch before a new password can be assigned to their name.
        if (this.credentialChecksInFlight.has(ws)) {
            sendLoginError(9, "A login attempt is already in progress.");
            return;
        }
        if (this.authenticatingAccountNames.has(normalizedUsername)) {
            sendLoginError(5, "Your account is already logging in. Try again shortly.");
            return;
        }
        if (this.activeCredentialChecks >= this.maxConcurrentCredentialChecks) {
            sendLoginError(9, "The login service is busy. Please try again shortly.");
            return;
        }

        this.credentialChecksInFlight.add(ws);
        this.authenticatingAccountNames.add(normalizedUsername);
        this.activeCredentialChecks++;
        let authentication;
        try {
            authentication = await this.svc.authService.authenticateCredentialsAsync(
                username,
                password,
                this.svc.playerPersistence.hasKey(normalizedUsername),
            );
        } catch (err) {
            logger.warn(`[login] credential check failed for ${normalizedUsername}`, err);
            sendLoginError(3, "Invalid username or password.");
            return;
        } finally {
            this.activeCredentialChecks = Math.max(0, this.activeCredentialChecks - 1);
            this.credentialChecksInFlight.delete(ws);
            this.authenticatingAccountNames.delete(normalizedUsername);
        }

        if (ws.readyState !== WebSocket.OPEN) return;
        // State may have changed while the password hash ran off-thread.
        if (this.svc.authService.isWorldFull()) {
            sendLoginError(2, "This world is full. Please use a different world.");
            return;
        }
        if (
            this.svc.authService.isPlayerAlreadyLoggedIn(normalizedUsername) ||
            this.isLoginPendingForAnotherSocket(ws, normalizedUsername)
        ) {
            sendLoginError(5, "Your account is already logged in. Try again in 60 seconds.");
            return;
        }
        if (!authentication.ok) {
            sendLoginError(
                3,
                authentication.reason === "password_too_short"
                    ? "Password must be at least 8 characters."
                    : "Invalid username or password.",
            );
            return;
        }

        // All checks passed - login successful
        const displayName = (username ?? "").trim().slice(0, 12);
        this.setPendingLoginName(ws, displayName);
        this.svc.networkLayer.withDirectSendBypass("login_response", () =>
            this.svc.networkLayer.sendWithGuard(
                ws,
                encodeMessage({
                    type: "login_response",
                    payload: {
                        success: true,
                        displayName,
                    },
                }),
                "login_response",
            ),
        );
        logger.info(
            `Login successful: ${authentication.accountName}${
                authentication.created ? " (new account)" : ""
            }`,
        );
    }

    handleHandshakeMessage(
        ws: WebSocket,
        payload: { name?: string; appearance?: AppearanceSetPacket; displayMode?: number },
    ): void {
        const parsed = { type: "handshake" as const, payload };
        try {
            const pendingLoginName = this.consumePendingLoginName(ws);
            if (!pendingLoginName) {
                logger.warn("[handshake] rejected unauthenticated handshake");
                try {
                    ws.close(1008, "login_required");
                } catch (err) {
                    logger.warn("[handshake] failed to close unauthenticated client", err);
                }
                return;
            }
            const name = pendingLoginName;

            const preliminarySaveKey = normalizePlayerAccountName(name);
            let p: PlayerState | undefined;
            let isReconnect = false;

            if (preliminarySaveKey && this.svc.players?.hasOrphanedPlayer(preliminarySaveKey)) {
                p = this.svc.players.reconnectOrphanedPlayer(ws, preliminarySaveKey);
                if (p) {
                    isReconnect = true;
                    logger.info(
                        `[handshake] Player ${name} reconnected to orphaned session (id=${p.id})`,
                    );
                }
            }

            if (!p) {
                const spawn = this.svc.gamemode.getSpawnLocation(
                    undefined as unknown as PlayerState,
                );
                const spawnX = spawn.x,
                    spawnY = spawn.y,
                    level = spawn.level;
                p = this.svc.players?.add(ws, spawnX, spawnY, level);
            }

            if (!p) {
                try {
                    ws.close(1013, "server_full");
                } catch (err) {
                    logger.warn("[handshake] failed to close socket", err);
                }
                return;
            }
            this.clearPreAuthDeadline(ws);
            {
                p.widgets.setDispatcher((action) => {
                    if (action.action === "close") {
                        this.svc.widgetDialogHandler!.handleWidgetCloseState(p!, action.groupId);
                    }
                    this.svc.queueWidgetEvent(p!.id, action);
                });

                if (!isReconnect) {
                    this.svc.actionScheduler.registerPlayer(p);
                }

                p.items.setItemDefResolver((id) => getItemDefinition(id));

                p.status.onDeath = () => {
                    if (this.svc.playerDeathService) {
                        this.svc.playerDeathService.startPlayerDeath(p!);
                    }
                };

                const appearance =
                    parsed.payload.appearance !== undefined
                        ? this.svc.playerAppearanceManager!.sanitizeHandshakeAppearance(
                              parsed.payload.appearance,
                          )
                        : this.svc.appearanceService.createDefaultAppearance();

                if (!isReconnect) {
                    if (!this.svc.players?.setConnectedPlayerName(ws, name ?? "")) {
                        this.svc.actionScheduler.unregisterPlayer(p.id);
                        this.svc.players?.remove(ws);
                        try {
                            ws.close(1008, "duplicate_account");
                        } catch {
                            // Socket may already be gone.
                        }
                        return;
                    }
                    p.appearance = appearance;
                    this.svc.equipmentService.ensureEquipArray(p);
                    this.svc.appearanceService.refreshAppearanceKits(p);
                    this.svc.equipmentService.refreshCombatWeaponCategory(p);
                    p.combat.attackDelay = this.svc.playerCombatService!.pickAttackSpeed(p);
                    const saveKey = buildPlayerSaveKey(name, p.id);
                    p.__saveKey = saveKey;
                    try {
                        this.svc.playerPersistence.applyToPlayer(p, saveKey);
                    } catch (err) {
                        logger.warn("[player] failed to apply persistent vars", err);
                    }
                    try {
                        if (!this.svc.playerPersistence.hasKey(saveKey)) {
                            p.account.accountStage = 0;
                        } else if (!Number.isFinite(p.account.accountStage)) {
                            p.account.accountStage = 1;
                        }
                    } catch {
                        if (!Number.isFinite(p.account.accountStage)) p.account.accountStage = 1;
                    }
                    try {
                        this.svc.gamemode.resolveAccountStage?.(p);
                    } catch (err) {
                        logger.warn("[handshake] resolveAccountStage failed", err);
                    }
                    p.setRunToggle(true);
                    try {
                        this.svc.appearanceService.refreshAppearanceKits(p);
                        this.svc.equipmentService.refreshCombatWeaponCategory(p);
                    } catch (err) {
                        logger.warn("[player] failed to refresh appearance after persist", err);
                    }
                    try {
                        this.svc.tradeManager?.restorePendingRefunds(p);
                    } catch (err) {
                        logger.warn("[trade] failed to restore pending trade refunds", err);
                    }
                } else {
                    logger.info(`[handshake] Resuming player ${name} at (${p.tileX}, ${p.tileY})`);
                }

                try {
                    this.svc.followerManager?.restoreFollowerForPlayer(p);
                } catch (err) {
                    logger.warn("[follower] failed to restore player follower", err);
                }

                // Apply gamemode login varbits (diary unlocks, xp drops, etc.)
                const loginVarbits = this.svc.gamemode.getLoginVarbits?.(p) ?? [];
                for (const [varbitId, value] of loginVarbits) {
                    p.varps.setVarbitValue(varbitId, value);
                }

                const handshakeAppearance = p.appearance;
                const handshakeName =
                    this.svc.appearanceService.getAppearanceDisplayName(p) || name;
                const isAdmin = this.svc.authService.isAdminPlayer(p);
                const handshakeChatIcons = isAdmin ? [ADMIN_CROWN_ICON] : undefined;
                this.svc.networkLayer.withDirectSendBypass("handshake_ack", () =>
                    this.svc.networkLayer.sendWithGuard(
                        ws,
                        encodeMessage({
                            type: "handshake",
                            payload: {
                                id: p.id,
                                name: handshakeName,
                                appearance:
                                    handshakeAppearance as unknown as import("@server/network/messages").Appearance,
                                chatIcons: handshakeChatIcons,
                                isAdmin,
                            },
                        }),
                        "handshake_ack",
                    ),
                );
                this.svc.appearanceService.sendAnimUpdate(p);
                this.svc.inventoryService.sendInventorySnapshotImmediate(ws, p);
                p.skillSystem.requestFullSkillSync();
                this.svc.skillService.sendSkillsSnapshotImmediate(ws, p);
                this.svc.queueCombatState(p);
                this.svc.movementService.sendRunEnergyState(ws, p);
                this.svc.varpSyncService.sendSavedTransmitVarps(ws, p);
                this.svc.collectionLogService.sendCollectionLogDisplayVarps(ws, p);
                this.svc.varpSyncService.sendSavedAutocastTransmitVarbits(ws, p);
                this.svc.varpSyncService.sendSavedSpellbookState(ws, p);
                this.svc.varpSyncService.syncAccountTypeVarbit(ws, p);
                const sideJournalState = this.svc.gamemodeUi.normalizeSideJournalState(p);
                this.svc.networkLayer.withDirectSendBypass("varp", () =>
                    this.svc.networkLayer.sendWithGuard(
                        ws,
                        encodeMessage({
                            type: "varp",
                            payload: {
                                varpId: VARP_SIDE_JOURNAL_STATE,
                                value: sideJournalState.stateVarp,
                            },
                        }),
                        "varp",
                    ),
                );
                this.svc.networkLayer.withDirectSendBypass("varbit", () =>
                    this.svc.networkLayer.sendWithGuard(
                        ws,
                        encodeMessage({
                            type: "varbit",
                            payload: {
                                varbitId: VARBIT_SIDE_JOURNAL_TAB,
                                value: sideJournalState.tab,
                            },
                        }),
                        "varbit",
                    ),
                );

                for (const [varbitId, value] of loginVarbits) {
                    this.svc.networkLayer.withDirectSendBypass("varbit", () =>
                        this.svc.networkLayer.sendWithGuard(
                            ws,
                            encodeMessage({
                                type: "varbit",
                                payload: { varbitId, value },
                            }),
                            "varbit",
                        ),
                    );
                }

                const contentDataPacket = this.svc.gamemode.getContentDataPacket?.();
                if (contentDataPacket) {
                    this.svc.networkLayer.withDirectSendBypass("gamemode_data", () =>
                        this.svc.networkLayer.sendWithGuard(ws, contentDataPacket, "gamemode_data"),
                    );
                }

                this.svc.gamemode.onPlayerHandshake(p, {
                    sendVarp: (varpId, value) =>
                        this.svc.networkLayer.withDirectSendBypass("varp", () =>
                            this.svc.networkLayer.sendWithGuard(
                                ws,
                                encodeMessage({
                                    type: "varp",
                                    payload: { varpId, value },
                                }),
                                "varp",
                            ),
                        ),
                    sendVarbit: (varbitId, value) =>
                        this.svc.networkLayer.withDirectSendBypass("varbit", () =>
                            this.svc.networkLayer.sendWithGuard(
                                ws,
                                encodeMessage({
                                    type: "varbit",
                                    payload: { varbitId, value },
                                }),
                                "varbit",
                            ),
                        ),
                    queueVarp: (playerId, varpId, value) =>
                        this.svc.variableService.queueVarp(playerId, varpId, value),
                    queueVarbit: (playerId, varbitId, value) =>
                        this.svc.variableService.queueVarbit(playerId, varbitId, value),
                    queueNotification: (playerId, notification) =>
                        this.svc.messagingService.queueNotification(
                            playerId,
                            notification as Record<string, unknown>,
                        ),
                });

                const clientType = (parsed.payload as any).clientType;
                const isMobileClient = clientType === 1;

                {
                    const displayMode = isMobileClient
                        ? DisplayMode.MOBILE
                        : p.varps.preferredDisplayMode;
                    const rootInterfaceGroupId = getRootInterfaceId(displayMode);
                    for (const script of getViewportRootInitScripts()) {
                        this.svc.networkLayer.withDirectSendBypass("runClientScript", () =>
                            this.svc.networkLayer.sendWithGuard(
                                ws,
                                encodeMessage({
                                    type: "runClientScript",
                                    payload: {
                                        scriptId: script.scriptId,
                                        args: script.args,
                                    },
                                }),
                                "runClientScript",
                            ),
                        );
                    }
                    this.svc.queueWidgetEvent(p.id, {
                        action: "set_root",
                        groupId: rootInterfaceGroupId,
                    });

                    p.displayMode = displayMode;

                    const accountStage = p.account.accountStage;
                    const tutorialActive = this.svc.gamemode.isTutorialActive(p);
                    const tutorialMode = accountStage >= 1 && tutorialActive;
                    const charCreationMode = accountStage === 0;
                    const preStartMode =
                        charCreationMode || (this.svc.gamemode.isTutorialPreStart?.(p) ?? false);

                    const interfaces = getDefaultInterfaces(displayMode, {
                        tutorialMode: tutorialMode || charCreationMode,
                    });
                    const filteredInterfaces = preStartMode
                        ? interfaces.filter((i: { groupId: number }) => i.groupId !== 629)
                        : interfaces;
                    const xpDropsEnabled = p.varps.getVarbitValue(VARBIT_XPDROPS_ENABLED) === 1;
                    const minimapToggleValue = p.varps.getVarbitValue(VARBIT_MINIMAP_TOGGLE);
                    const mapClock = getMapClockValue(p.varps, this.svc.ticker.currentTick());
                    for (const mount of filteredInterfaces) {
                        const intf = rewriteMinimapOrbsMount(
                            mount,
                            displayMode,
                            minimapToggleValue,
                        );
                        const questVarps: Record<number, number> = {};
                        const questVarbits: Record<number, number> = {};
                        if (intf.groupId === SIDE_JOURNAL_GROUP_ID) {
                            const gamemodeSideJournalBootstrap =
                                this.svc.gamemodeUi.getSideJournalBootstrapState(p);
                            Object.assign(questVarps, gamemodeSideJournalBootstrap.varps);
                            Object.assign(questVarbits, gamemodeSideJournalBootstrap.varbits);
                        }
                        const minimapVarbits =
                            mount.groupId === MINIMAP_WIDGET_GROUP_ID
                                ? getMinimapToggleVarbits(minimapToggleValue)
                                : {};
                        const mergedVarbits = {
                            ...(intf.varbits ?? {}),
                            ...questVarbits,
                            ...minimapVarbits,
                        };
                        const mergedVarps = {
                            ...(intf.varps ?? {}),
                            ...questVarps,
                        };
                        const hideXpCounterOnOpen = intf.groupId === 122 && !xpDropsEnabled;
                        this.svc.queueWidgetEvent(p.id, {
                            action: "open_sub",
                            targetUid: intf.targetUid,
                            groupId: intf.groupId,
                            type: intf.type,
                            ...(Array.isArray(intf.postScripts) && intf.postScripts.length > 0
                                ? { postScripts: intf.postScripts }
                                : {}),
                            ...(hideXpCounterOnOpen ? { hiddenUids: [intf.targetUid] } : {}),
                            ...(Object.keys(mergedVarps).length > 0 ? { varps: mergedVarps } : {}),
                            ...(Object.keys(mergedVarbits).length > 0
                                ? { varbits: mergedVarbits }
                                : {}),
                        });

                        if (mount.groupId === MINIMAP_WIDGET_GROUP_ID) {
                            for (const action of createOrbsBootstrapActions(
                                intf.groupId,
                                mapClock,
                            )) {
                                this.svc.queueWidgetEvent(p.id, action);
                            }
                        }
                        if (intf.groupId === SIDE_JOURNAL_GROUP_ID) {
                            this.svc.gamemodeUi.applySideJournalUi(p);
                        }
                    }
                    if (
                        tutorialMode &&
                        !preStartMode &&
                        this.svc.gamemodeUi.shouldActivateQuestTabOnLogin(p)
                    ) {
                        this.svc.gamemodeUi.activateQuestTab(p.id);
                    }
                    if (p.account.accountStage >= 1 && this.svc.gamemode.isTutorialActive(p)) {
                        this.svc.gamemodeUi.queueTutorialOverlay(p);
                    }
                    if (!preStartMode) {
                        for (const script of getEnhancedClientLoginScripts(p.name)) {
                            this.svc.queueWidgetEvent(p.id, {
                                action: "run_script",
                                scriptId: script.scriptId,
                                args: script.args,
                            });
                        }
                    }

                    // IF_SETEVENTS for inventory widget slots
                    const INVENTORY_GROUP_ID = 149;
                    const INVENTORY_CONTAINER_COMPONENT = 0;
                    const INVENTORY_SLOT_COUNT = 28;
                    const INVENTORY_FLAGS = INVENTORY_EVENT_FLAGS;

                    this.svc.queueWidgetEvent(p.id, {
                        action: "set_flags_range",
                        uid: (INVENTORY_GROUP_ID << 16) | INVENTORY_CONTAINER_COMPONENT,
                        fromSlot: 0,
                        toSlot: INVENTORY_SLOT_COUNT - 1,
                        flags: INVENTORY_FLAGS,
                    });

                    // IF_SETEVENTS for prayer filter dynamic rows
                    const PRAYER_GROUP_ID = 541;
                    const PRAYER_FILTER_COMPONENT = 42;
                    const PRAYER_FILTER_SLOT_START = 0;
                    const PRAYER_FILTER_SLOT_END = 4;
                    const PRAYER_FILTER_FLAGS = 1 << 1;

                    this.svc.queueWidgetEvent(p.id, {
                        action: "set_flags_range",
                        uid: (PRAYER_GROUP_ID << 16) | PRAYER_FILTER_COMPONENT,
                        fromSlot: PRAYER_FILTER_SLOT_START,
                        toSlot: PRAYER_FILTER_SLOT_END,
                        flags: PRAYER_FILTER_FLAGS,
                    });

                    // IF_SETEVENTS for equipment widget slots
                    const EQUIPMENT_GROUP_ID = 387;
                    const EQUIPMENT_SLOT_START = 15;
                    const EQUIPMENT_SLOT_END = 25;
                    const EQUIPMENT_FLAGS = 62;

                    for (let comp = EQUIPMENT_SLOT_START; comp <= EQUIPMENT_SLOT_END; comp++) {
                        this.svc.queueWidgetEvent(p.id, {
                            action: "set_flags_range",
                            uid: (EQUIPMENT_GROUP_ID << 16) | comp,
                            fromSlot: -1,
                            toSlot: -1,
                            flags: EQUIPMENT_FLAGS,
                        });
                    }

                    // IF_SETEVENTS for quest list dynamic children.
                    // Also re-sent on every quest subtab open (the client purges
                    // flag overrides when the content interface unmounts).
                    this.svc.queueWidgetEvent(p.id, {
                        action: "set_flags_range",
                        uid: QUEST_LIST_ENTRY_LIST_UID,
                        fromSlot: 0,
                        toSlot: QUEST_LIST_ENTRY_MAX_SLOT,
                        flags: QUEST_LIST_ENTRY_EVENT_FLAGS,
                    });

                    // IF_SETEVENTS for emote tab dynamic children (216:2).
                    // emote_init creates one clickable rect per emote at slots 0-55
                    // on the contents container ($com_emote_contents = 216:2 per the
                    // 216:0 onLoad args); ops (Perform/Loop) come from cc_setop.
                    const EMOTE_GROUP_ID = 216;
                    const EMOTE_CONTENTS_COMPONENT = 2;
                    const EMOTE_MAX_SLOT = 55;
                    const EMOTE_EVENT_FLAGS = (1 << 1) | (1 << 2); // op1 + op2

                    this.svc.queueWidgetEvent(p.id, {
                        action: "set_flags_range",
                        uid: (EMOTE_GROUP_ID << 16) | EMOTE_CONTENTS_COMPONENT,
                        fromSlot: 0,
                        toSlot: EMOTE_MAX_SLOT,
                        flags: EMOTE_EVENT_FLAGS,
                    });
                }

                if (p.account.accountStage === 0) {
                    try {
                        const targetUid = getMainmodalUid(p.displayMode);
                        p.widgets.open(679, { targetUid, type: 0 });
                    } catch (err) {
                        logger.warn("[handshake] failed to open char creation widget", err);
                    }
                }

                try {
                    if (p.account.accountStage >= 1 && this.svc.gamemode.isTutorialActive(p)) {
                        const spawn = this.svc.gamemode.getSpawnLocation(p);
                        p.teleport(spawn.x, spawn.y, spawn.level);
                    }
                } catch (err) {
                    logger.warn("[handshake] tutorial spawn teleport failed", err);
                }

                this.svc.gamemode.onPlayerRestore?.(p);

                const startTileX = p.tileX;
                const startTileY = p.tileY;
                const startLevel = p.level;
                logger.info(
                    `Handshake ok id=${p.id} spawn=(${startTileX},${startTileY},L${startLevel})`,
                );
                const appearanceSnapshot = p.appearance;
                this.svc.playerAppearanceManager!.queueAppearanceSnapshot(p, {
                    x: (startTileX << 7) + 64,
                    y: (startTileY << 7) + 64,
                    level: startLevel,
                    rot: p.rot,
                    orientation: p.getOrientation() & 2047,
                    running: false,
                    appearance: appearanceSnapshot,
                    name,
                    moved: true,
                    turned: false,
                    snap: true,
                });
                p.markSent();

                this.svc.messagingService.queueChatMessage({
                    messageType: "server",
                    text: "Welcome to Old School Runescape!",
                    targetPlayerIds: [p.id],
                });

                if (this.svc.npcManager && p) {
                    const player = p;
                    try {
                        const nearby = this.svc.npcManager.getNearby(
                            startTileX,
                            startTileY,
                            startLevel,
                            NPC_STREAM_RADIUS_TILES,
                        );
                        player.visibleNpcIds.clear();
                        if (DEBUG_NPC_STREAM) {
                            logger.info(
                                `[npcs] initial snapshot -> player=${player.id} count=${nearby.length}`,
                            );
                        }
                        for (const npc of nearby) {
                            const snap = this.svc.npcSyncManager!.serializeNpcSnapshot(npc);
                            player.visibleNpcIds.add(snap.id);
                            this.svc.npcSyncManager!.queueNpcSnapshot(player.id, snap);
                        }
                    } catch (err) {
                        logger.warn("[NpcManager] snapshot send failed", err);
                    }
                }

                syncInstanceGravePresentation(this.svc.locationService, p);
                this.svc.locationService.maybeReplayDynamicLocState(ws, p, true);

                this.svc.eventBus.emit("player:login", { player: p });
            }
        } catch (err) {
            logger.warn("[handshake] handleHandshakeMessage error:", err);
        }
    }

    onConnection(ws: WebSocket, request?: IncomingMessage): void {
        logger.info("Client connected");
        this.armPreAuthDeadline(ws);
        const peerAddress = request?.socket.remoteAddress ?? this.getSocketRemoteAddress(ws);
        const clientAddress = resolveClientAddress(peerAddress, request?.headers ?? {});
        if (clientAddress) this.clientAddresses.set(ws, clientAddress);
        this.svc.playerSyncSessions.set(ws, new PlayerSyncSession());
        this.svc.networkLayer.withDirectSendBypass("welcome_packet", () =>
            this.svc.networkLayer.sendWithGuard(
                ws,
                encodeMessage({
                    type: "welcome",
                    payload: { tickMs: this.svc.tickMs, serverTime: Date.now() },
                }),
                "welcome_packet",
            ),
        );

        const handleRawMessage = (raw: RawData) => {
            let binaryParsed: RoutedMessage | null = null;

            if (isBinaryData(raw)) {
                if (isClientMessagePacket(raw as Buffer | ArrayBuffer)) {
                    const decoded = decodeClientPacket(toUint8Array(raw));
                    if (!decoded) {
                        return;
                    }
                    binaryParsed = decoded;
                } else {
                    const data = toUint8Array(raw);
                    const packets = parsePacketsAsMessages(data);
                    for (const { msg, packet } of packets) {
                        if (packet.type === "appearance_set") {
                            const p = this.svc.players?.get(ws);
                            if (!p) continue;
                            const ap = packet as AppearanceSetPacket;

                            const appearance = this.svc.appearanceService.getOrCreateAppearance(p);
                            appearance.gender = ap.gender === 1 ? 1 : 0;
                            appearance.kits = new Array<number>(7).fill(-1);
                            appearance.colors = new Array<number>(5).fill(0);
                            for (let i = 0; i < 7 && i < ap.kits.length; i++) {
                                appearance.kits[i] = ap.kits[i];
                            }
                            for (let i = 0; i < 5 && i < ap.colors.length; i++) {
                                appearance.colors[i] = ap.colors[i];
                            }

                            this.svc.appearanceService.refreshAppearanceKits(p);
                            p.markAppearanceDirty();
                            this.svc.playerAppearanceManager!.queueAppearanceSnapshot(p);

                            p.account.accountStage = 1;
                            try {
                                const key = p.__saveKey;
                                if (key && key.length > 0) {
                                    this.svc.playerPersistence.saveSnapshot(key, p);
                                }
                            } catch (err) {
                                logger.warn("[handshake] failed to save after design", err);
                            }

                            try {
                                p.widgets.close(679);
                            } catch (err) {
                                logger.warn("[handshake] failed to close design widget", err);
                            }

                            try {
                                this.svc.gamemode.onPostDesignComplete?.(p);
                                const spawn = this.svc.gamemode.getSpawnLocation(p);
                                this.svc.movementService.teleportPlayer(
                                    p,
                                    spawn.x,
                                    spawn.y,
                                    spawn.level,
                                );
                                const name = p.name;
                                const appearanceSnapshot = p.appearance;
                                this.svc.playerAppearanceManager!.queueAppearanceSnapshot(p, {
                                    x: (spawn.x << 7) + 64,
                                    y: (spawn.y << 7) + 64,
                                    level: spawn.level,
                                    rot: p.rot,
                                    orientation: p.getOrientation() & 2047,
                                    running: false,
                                    appearance: appearanceSnapshot,
                                    name,
                                    moved: true,
                                    turned: false,
                                    snap: true,
                                });
                            } catch (err) {
                                logger.warn("[handshake] post-design spawn failed", err);
                            }

                            if (this.svc.gamemode.isTutorialActive(p)) {
                                this.svc.gamemodeUi.queueTutorialOverlay(p, {
                                    queueFlashsideVarbitOnStep3: true,
                                });
                            } else {
                                p.account.accountStage = 2;
                                const displayMode = p.displayMode ?? 1;
                                const minimapToggleValue =
                                    p.varps.getVarbitValue(VARBIT_MINIMAP_TOGGLE);
                                const mapClock = getMapClockValue(
                                    p.varps,
                                    this.svc.ticker.currentTick(),
                                );
                                const allInterfaces = getDefaultInterfaces(displayMode);
                                for (const mount of allInterfaces) {
                                    const intf = rewriteMinimapOrbsMount(
                                        mount,
                                        displayMode,
                                        minimapToggleValue,
                                    );
                                    this.svc.queueWidgetEvent(p.id, {
                                        action: "open_sub",
                                        targetUid: intf.targetUid,
                                        groupId: intf.groupId,
                                        type: intf.type,
                                        ...(Array.isArray(intf.postScripts) &&
                                        intf.postScripts.length > 0
                                            ? { postScripts: intf.postScripts }
                                            : {}),
                                        ...(mount.groupId === MINIMAP_WIDGET_GROUP_ID
                                            ? {
                                                  varbits:
                                                      getMinimapToggleVarbits(minimapToggleValue),
                                              }
                                            : {}),
                                    });
                                    if (mount.groupId === MINIMAP_WIDGET_GROUP_ID) {
                                        for (const action of createOrbsBootstrapActions(
                                            intf.groupId,
                                            mapClock,
                                        )) {
                                            this.svc.queueWidgetEvent(p.id, action);
                                        }
                                    }
                                }
                                for (const script of getEnhancedClientLoginScripts(p.name)) {
                                    this.svc.queueWidgetEvent(p.id, {
                                        action: "run_script",
                                        scriptId: script.scriptId,
                                        args: script.args,
                                    });
                                }
                            }
                            continue;
                        }

                        if (
                            !msg &&
                            handleExaminePacketFn(
                                {
                                    getPlayer: (sock) => this.svc.players?.get(sock),
                                    queuePlayerGameMessage: (player, text) =>
                                        this.svc.messagingService.queueChatMessage({
                                            messageType: "game",
                                            text,
                                            targetPlayerIds: [player.id],
                                        }),
                                    queryGroundItemArea: (
                                        x,
                                        y,
                                        level,
                                        radius,
                                        tick,
                                        playerId,
                                        wvId,
                                    ) =>
                                        this.svc.groundItems.queryArea(
                                            x,
                                            y,
                                            level,
                                            radius,
                                            tick,
                                            playerId,
                                            wvId,
                                        ),
                                    getCurrentTick: () => this.svc.ticker.currentTick(),
                                    locTypeLoader: this.svc.locTypeLoader,
                                    npcTypeLoader: this.svc.npcTypeLoader,
                                    objTypeLoader: this.svc.objTypeLoader,
                                    getNpcType: (npc: { typeId?: number } | number) =>
                                        this.svc.npcTypeLoader?.load(
                                            typeof npc === "number" ? npc : (npc?.typeId ?? 0),
                                        ),
                                    getObjType: (itemId: number) =>
                                        this.svc.objTypeLoader?.load(itemId),
                                },
                                ws,
                                packet,
                            )
                        ) {
                            continue;
                        }

                        if (msg && !this.svc.messageRouter!.dispatch(ws, msg)) {
                            logger.info(`[binary] Unhandled: ${msg.type}`);
                        }
                    }
                    return;
                }
            }

            if (!binaryParsed) {
                logger.warn("[ws] Received non-binary message, ignoring");
                return;
            }
            const parsed = binaryParsed;

            if (this.svc.messageRouter!.dispatch(ws, parsed)) {
                return;
            }

            if (parsed.type === "login") {
                void this.handleLoginMessage(ws, parsed.payload).catch((err) => {
                    logger.warn("[login] unexpected login handler failure", err);
                    try {
                        ws.close(1011, "login_failed");
                    } catch {
                        // Socket may already be gone.
                    }
                });
            } else if (parsed.type === "handshake") {
                // World entry is tick-aligned: a handshake arriving between
                // ticks is queued and re-processed during the client_input
                // drain so players are never added to the world mid-phase.
                if (this.svc.clientInputService.isDraining()) {
                    this.handleHandshakeMessage(ws, parsed.payload as any);
                } else {
                    this.svc.clientInputService.enqueue(ws, raw);
                }
            } else {
                logger.info(`[binary] Unhandled: ${parsed.type}`);
            }
        };
        this.svc.clientInputService.registerConnection(ws, handleRawMessage);

        ws.on("message", (raw) => {
            // In-world input is queued and drained at a fixed point at the
            // start of the game tick. Pre-login traffic (handshake/login) is
            // handled immediately since the player is not yet in the world —
            // except when a deferred handshake is already queued, in which
            // case later messages queue behind it to preserve ordering.
            if (this.svc.players?.get(ws) || this.svc.clientInputService.hasQueued(ws)) {
                this.svc.clientInputService.enqueue(ws, raw);
            } else {
                if (!this.acceptPreAuthMessage(ws)) {
                    logger.warn(
                        `[login] closing connection after more than ${this.maxPreAuthMessages} pre-auth messages in ${this.preAuthWindowMs}ms`,
                    );
                    try {
                        ws.close(1008, "preauth_rate_limit");
                    } catch {
                        // Socket may already be gone.
                    }
                    return;
                }
                handleRawMessage(raw);
            }
        });

        ws.on("close", () => {
            this.clearPreAuthDeadline(ws);
            this.svc.clientInputService.removeConnection(ws);
            this.svc.networkLayer.removeConnection?.(ws);
            this.preAuthWindows.delete(ws);
            this.clientAddresses.delete(ws);
            this.clearPendingLoginName(ws);
            try {
                this.svc.movementService.getPendingWalkCommands().delete(ws);
                const player = this.svc.players?.get(ws);
                const id = player?.id;
                if (player) {
                    const saveKey = player.__saveKey ?? buildPlayerSaveKey(player.name, player.id);
                    // A disconnect cannot bypass the item-loss transaction.
                    // Complete it while the instance and its immutable death
                    // context still exist, before either persistence or
                    // instance disposal can observe pre-death inventory.
                    if (id !== undefined) {
                        const completedDeath =
                            this.svc.playerDeathService?.forceCompleteDeath(id) === true;
                        if (completedDeath) {
                            try {
                                // A recently-hit player enters the orphan path below, where
                                // the ordinary disconnect save is intentionally deferred.
                                // Make the completed death/grave transaction durable first.
                                this.svc.playerPersistence.saveSnapshot(saveKey, player);
                            } catch (err) {
                                logger.warn(
                                    "[persist] failed to save force-completed death state",
                                    err,
                                );
                            }
                        }
                    }
                    if (id !== undefined) {
                        this.svc.groundItemHandler?.clearPlayerState(id);
                        this.svc.playerDynamicLocSceneKeys.delete(id);
                    }
                    this.svc.interfaceManager.clearUiTrackingForPlayer(player.id);
                    this.svc.tradeManager?.handlePlayerLogout(
                        player,
                        "The other player has declined the trade.",
                    );
                    if (id !== undefined) {
                        this.svc.widgetDialogHandler!.cleanupPlayerDialogState(id);
                    }
                    const widgetCloseHandlers =
                        this.svc.scriptRuntime.getServices().widgetCloseHandlers;
                    if (widgetCloseHandlers) {
                        for (const handler of widgetCloseHandlers.values()) {
                            handler(player);
                        }
                    }
                    this.svc.interfaceService?.onPlayerDisconnect(player);
                    try {
                        const closedWidgets = player.widgets.closeAll({ silent: true });
                        if (closedWidgets.length > 0) {
                            logger.info(
                                `[disconnect] Closed ${
                                    closedWidgets.length
                                } widgets for player ${id}: ${closedWidgets
                                    .map((entry) => entry.groupId)
                                    .join(", ")}`,
                            );
                        }
                    } catch (err) {
                        logger.warn(`[disconnect] Failed to close widgets for player ${id}:`, err);
                    }
                    player.widgets.setDispatcher(undefined);

                    this.svc.sailingInstanceManager?.disposeInstance(player);
                    // Private instances end immediately on disconnect. Do not let
                    // combat orphaning retain a player in a destroyed world view.
                    const disconnectedFromInstance =
                        this.svc.instancedAreaManager?.get(player.id) !== undefined;
                    this.svc.instancedAreaManager?.dispose(player);
                    this.svc.worldEntityInfoEncoder.removePlayer(player.id);

                    const currentTick = this.svc.ticker.currentTick();
                    const wasOrphaned = disconnectedFromInstance
                        ? false
                        : this.svc.players?.orphanPlayer(ws, saveKey, currentTick);

                    if (wasOrphaned) {
                        logger.info(
                            `[disconnect] Player ${id} orphaned (in combat) - staying in world`,
                        );
                    } else {
                        try {
                            this.svc.playerPersistence.saveSnapshot(saveKey, player);
                        } catch (err) {
                            logger.warn("[persist] failed to save player state", err);
                        }
                        this.svc.followerCombatManager?.resetPlayer(player.id);
                        this.svc.followerManager?.despawnFollowerForPlayer(player.id, false);
                        this.svc.npcManager?.removeNpcsOwnedByPlayer(player.id);
                        this.svc.locationService.clearTemporaryLocsOwnedByPlayer(player.id);
                        this.svc.eventBus.emit("player:logout", {
                            playerId: player.id,
                            username: player.name ?? "unknown",
                        });
                        this.svc.players?.remove(ws);
                        if (id != null) this.svc.actionScheduler.unregisterPlayer(id);
                        if (id != null) logger.info(`Client disconnected id=${id}`);
                        else logger.info("Client disconnected");
                    }
                } else {
                    this.svc.players?.remove(ws);
                    logger.info("Client disconnected (no player)");
                }
            } catch {
                logger.info("Client disconnected");
            }
            this.svc.playerSyncSessions.delete(ws);
            this.svc.npcSyncSessions.delete(ws);
        });
        ws.on("error", (err) => logger.warn("Client error:", err));
    }
}
