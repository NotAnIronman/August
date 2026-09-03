import { resolvePlayerDisplay } from "@august/osrs-engine/chat/PlayerType";
import { MIN_PASSWORD_LENGTH } from "@august/protocol/authentication";
import { VARBIT_ACCOUNT_TYPE } from "@august/game-model/state/vars";
import type { GamemodeDefinition } from "@server/game/gamemodes/GamemodeDefinition";
import type { PlayerState } from "@server/game/player";
import { logger } from "@server/observability/logger";
import { AccountStore, normalizeAccountName } from "@server/network/AccountStore";
import { type PlayerPermission, hasPermission } from "@server/network/PlayerPermission";

const ADMIN_USERNAMES_ENV = (
    process?.env?.ADMIN_USERNAMES ??
    process?.env?.ADMIN_PLAYERS ??
    process?.env?.ADMIN_NAMES ??
    ""
).toString();

const ADMIN_USERNAMES = new Set(
    ADMIN_USERNAMES_ENV.split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
);
const MODERATOR_USERNAMES = usernamesFromEnv("MODERATOR_USERNAMES");
const DEVELOPER_USERNAMES = usernamesFromEnv("DEVELOPER_USERNAMES");

function usernamesFromEnv(name: string): Set<string> {
    return new Set(
        (process.env[name] ?? "")
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
    );
}

export const ADMIN_CROWN_ICON = 1;

export interface PlayerLookup {
    hasConnectedPlayer(username: string): boolean;
    getTotalPlayerCount(): number;
}

export interface AuthenticationOptions {
    accountStore: AccountStore;
    allowAccountRegistration?: boolean;
    allowLegacyAccountClaim?: boolean;
    /** Protocol-safe world capacity. Defaults to the 2047-player sync limit. */
    maxPlayers?: number;
    /** Bounds unique source addresses retained by the login limiter. */
    maxTrackedLoginSources?: number;
    /** Injectable clock for deterministic tests. */
    now?: () => number;
}

export type CredentialAuthenticationResult =
    | { ok: true; created: boolean; accountName: string }
    | { ok: false; reason: "invalid_credentials" | "password_too_short" };

/**
 * Handles login rate limiting, admin detection, and account type normalization.
 * Extracted from WSServer.
 */
export class AuthenticationService {
    private loginAttempts = new Map<string, { count: number; resetTime: number }>();
    private readonly MAX_LOGIN_ATTEMPTS = 5;
    private readonly LOGIN_ATTEMPT_WINDOW_MS = 60000;
    private readonly maxTrackedLoginSources: number;
    private readonly maxPlayers: number;
    private readonly now: () => number;
    private rateLimitChecks = 0;

    constructor(
        private readonly playerLookup: PlayerLookup,
        private readonly gamemode: GamemodeDefinition,
        private readonly options: AuthenticationOptions,
    ) {
        this.maxPlayers = Math.max(1, Math.min(2047, Math.trunc(options.maxPlayers ?? 2047)));
        this.maxTrackedLoginSources = Math.max(
            128,
            Math.min(100_000, Math.trunc(options.maxTrackedLoginSources ?? 10_000)),
        );
        this.now = options.now ?? Date.now;
    }

    checkLoginRateLimit(ip: string): boolean {
        const now = this.now();
        this.rateLimitChecks++;
        if (
            this.loginAttempts.size >= this.maxTrackedLoginSources ||
            this.rateLimitChecks % 256 === 0
        ) {
            this.pruneExpiredLoginAttempts(now);
        }
        const entry = this.loginAttempts.get(ip);

        if (!entry || now >= entry.resetTime) {
            // At capacity, reject an unseen source rather than allowing an
            // address spray to grow process memory without bound.
            if (!entry && this.loginAttempts.size >= this.maxTrackedLoginSources) {
                return true;
            }
            this.loginAttempts.set(ip, {
                count: 1,
                resetTime: now + this.LOGIN_ATTEMPT_WINDOW_MS,
            });
            return false;
        }

        entry.count++;

        if (entry.count > this.MAX_LOGIN_ATTEMPTS) {
            return true;
        }

        return false;
    }

    isPlayerAlreadyLoggedIn(username: string): boolean {
        return this.playerLookup.hasConnectedPlayer(username);
    }

    isWorldFull(): boolean {
        return this.playerLookup.getTotalPlayerCount() >= this.maxPlayers;
    }

    private pruneExpiredLoginAttempts(now: number): void {
        for (const [ip, attempt] of this.loginAttempts) {
            if (now >= attempt.resetTime) this.loginAttempts.delete(ip);
        }
    }

    normalizePlayerNameForAuth(name: string | undefined): string {
        return (name ?? "").trim().toLowerCase();
    }

    authenticateCredentials(
        username: string | undefined,
        password: string | undefined,
        hasLegacyPlayerState: boolean,
    ): CredentialAuthenticationResult {
        const accountName = normalizeAccountName(username);
        if (!accountName) return { ok: false, reason: "invalid_credentials" };
        if (typeof password === "string" && password.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, reason: "password_too_short" };
        }

        const allowRegistration =
            this.options.allowAccountRegistration !== false &&
            (!hasLegacyPlayerState || this.options.allowLegacyAccountClaim === true);
        const authentication = this.options.accountStore.authenticate(
            username,
            password,
            allowRegistration,
        );
        return authentication.ok
            ? authentication
            : { ok: false, reason: "invalid_credentials" };
    }

    /** Non-blocking equivalent used by live WebSocket login handling. */
    async authenticateCredentialsAsync(
        username: string | undefined,
        password: string | undefined,
        hasLegacyPlayerState: boolean,
    ): Promise<CredentialAuthenticationResult> {
        const accountName = normalizeAccountName(username);
        if (!accountName) return { ok: false, reason: "invalid_credentials" };
        if (typeof password === "string" && password.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, reason: "password_too_short" };
        }

        const allowRegistration =
            this.options.allowAccountRegistration !== false &&
            (!hasLegacyPlayerState || this.options.allowLegacyAccountClaim === true);
        const authentication = await this.options.accountStore.authenticateAsync(
            username,
            password,
            allowRegistration,
        );
        return authentication.ok
            ? authentication
            : { ok: false, reason: "invalid_credentials" };
    }

    isAdminPlayer(player: PlayerState | undefined): boolean {
        return !!player && hasPermission(this.getPlayerPermission(player), "admin");
    }

    getPlayerPermission(player: PlayerState | undefined): PlayerPermission {
        if (!player) return "player";
        const name = this.normalizePlayerNameForAuth(player.name);
        if (DEVELOPER_USERNAMES.has(name)) return "developer";
        if (ADMIN_USERNAMES.has(name)) return "admin";
        if (MODERATOR_USERNAMES.has(name)) return "moderator";
        return this.options.accountStore.getPermissionLevel(name);
    }

    /**
     * Persist a permission level for an account (::promote / ::demote). Note this is
     * overridden at read time by the ADMIN_USERNAMES / MODERATOR_USERNAMES /
     * DEVELOPER_USERNAMES env vars — a name listed there always wins regardless of
     * what's stored here. Returns false if no account exists with that username.
     */
    setPlayerPermission(username: string, level: PlayerPermission): boolean {
        return this.options.accountStore.setPermissionLevel(username, level);
    }

    normalizeAccountType(value: number): number {
        const normalized = Number.isFinite(value) ? Math.floor(value) : 0;
        return normalized >= 0 && normalized <= 5 ? normalized : 0;
    }

    resolvePlayerDisplay(player: PlayerState): { playerType: number; displayName: string } {
        const types = this.gamemode.getPlayerTypes(player, this.isAdminPlayer(player));
        return resolvePlayerDisplay(types, player.name ?? "");
    }

    getPublicChatPlayerType(player: PlayerState): number {
        return this.resolvePlayerDisplay(player).playerType;
    }

    syncAccountTypeVarbit(
        player: PlayerState,
        sendFn: (varbitId: number, value: number) => void,
    ): void {
        const raw = player.varps.getVarbitValue(VARBIT_ACCOUNT_TYPE);
        const accountType = this.normalizeAccountType(raw);
        if (accountType !== raw) {
            player.varps.setVarbitValue(VARBIT_ACCOUNT_TYPE, accountType);
        }
        sendFn(VARBIT_ACCOUNT_TYPE, accountType);
    }
}
