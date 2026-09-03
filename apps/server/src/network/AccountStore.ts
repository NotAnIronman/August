import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "crypto";
import type { StatementSync } from "node:sqlite";

import {
    ACCOUNT_NAME_PATTERN,
    MAX_ACCOUNT_NAME_LENGTH,
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
} from "@august/protocol/authentication";
import { type SqliteDatabase, getSqliteDatabase } from "@server/game/state/SqliteDatabase";
import {
    type PlayerPermission,
    normalizePlayerPermission,
} from "@server/network/PlayerPermission";

const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
    cost: 1 << 14,
    blockSize: 8,
    parallelization: 1,
    maxmem: 64 * 1024 * 1024,
};

type StoredAccount = {
    passwordAlgorithm: "scrypt";
    passwordSalt: string;
    passwordHash: string;
    createdAt: string;
    passwordChangedAt: string;
};

export type AccountAuthenticationResult =
    | { ok: true; created: boolean; accountName: string }
    | { ok: false };

export interface AccountStoreOptions {
    dataDir: string;
    databasePath?: string;
}

type AccountStatements = {
    selectExists: StatementSync;
    selectPermission: StatementSync;
    updatePermission: StatementSync;
    insert: StatementSync;
    selectCredentials: StatementSync;
};

/**
 * Normalizes the name used for account credentials and player persistence.
 * Account names remain compatible with the 12-character RuneScape display-name limit.
 */
export function normalizeAccountName(name: string | undefined): string | undefined {
    const normalized = (name ?? "").trim().toLowerCase();
    if (normalized.length < 1 || normalized.length > MAX_ACCOUNT_NAME_LENGTH) return undefined;
    if (!ACCOUNT_NAME_PATTERN.test(normalized)) return undefined;
    return normalized;
}

function isValidPassword(password: string | undefined): password is string {
    return (
        typeof password === "string" &&
        password.length >= MIN_PASSWORD_LENGTH &&
        password.length <= MAX_PASSWORD_LENGTH
    );
}

/**
 * Persistent SQLite credential store for a single gamemode.
 *
 * Only a random salt and an scrypt-derived hash are written to the database.
 * Passwords are never stored or logged in plaintext.
 */
export class AccountStore {
    private readonly database: SqliteDatabase;
    private readonly statements: AccountStatements;

    constructor(options: AccountStoreOptions) {
        this.database = getSqliteDatabase(options);
        const connection = this.database.connection;
        this.statements = {
            selectExists: connection.prepare("SELECT 1 FROM accounts WHERE username = ?"),
            selectPermission: connection.prepare(
                "SELECT permission_level AS permissionLevel FROM accounts WHERE username = ?",
            ),
            updatePermission: connection.prepare(
                "UPDATE accounts SET permission_level = ? WHERE username = ?",
            ),
            insert: connection.prepare(
                `INSERT INTO accounts (
                    username,
                    password_algorithm,
                    password_salt,
                    password_hash,
                    created_at,
                    password_changed_at
                ) VALUES (?, ?, ?, ?, ?, ?)`,
            ),
            selectCredentials: connection.prepare(
                `SELECT
                    password_algorithm AS passwordAlgorithm,
                    password_salt AS passwordSalt,
                    password_hash AS passwordHash,
                    created_at AS createdAt,
                    password_changed_at AS passwordChangedAt
                 FROM accounts
                 WHERE username = ?`,
            ),
        };
    }

    authenticate(
        username: string | undefined,
        password: string | undefined,
        allowRegistration: boolean,
    ): AccountAuthenticationResult {
        const accountName = normalizeAccountName(username);
        if (!accountName || !isValidPassword(password)) {
            return { ok: false };
        }

        const existing = this.getAccount(accountName);
        if (existing) {
            return this.verifyPassword(existing, password)
                ? { ok: true, created: false, accountName }
                : { ok: false };
        }

        if (!allowRegistration) {
            return { ok: false };
        }

        const now = new Date().toISOString();
        const salt = randomBytes(16);
        const account: StoredAccount = {
            passwordAlgorithm: "scrypt",
            passwordSalt: salt.toString("base64"),
            passwordHash: this.derivePasswordHash(password, salt),
            createdAt: now,
            passwordChangedAt: now,
        };
        return this.insertAccount(accountName, account)
            ? { ok: true, created: true, accountName }
            : { ok: false };
    }

    /**
     * Non-blocking credential verification for the live login path. Scrypt is
     * deliberately delegated to libuv's worker pool so an expensive password
     * attempt cannot pause the game tick on Node's main event loop.
     *
     * The synchronous authenticate() method remains available for maintenance
     * scripts and backward compatibility; network code should use this method.
     */
    async authenticateAsync(
        username: string | undefined,
        password: string | undefined,
        allowRegistration: boolean,
    ): Promise<AccountAuthenticationResult> {
        const accountName = normalizeAccountName(username);
        if (!accountName || !isValidPassword(password)) {
            return { ok: false };
        }

        const existing = this.getAccount(accountName);
        if (existing) {
            return (await this.verifyPasswordAsync(existing, password))
                ? { ok: true, created: false, accountName }
                : { ok: false };
        }

        if (!allowRegistration) {
            return { ok: false };
        }

        const now = new Date().toISOString();
        const salt = randomBytes(16);
        const account: StoredAccount = {
            passwordAlgorithm: "scrypt",
            passwordSalt: salt.toString("base64"),
            passwordHash: await this.derivePasswordHashAsync(password, salt),
            createdAt: now,
            passwordChangedAt: now,
        };
        return this.insertAccount(accountName, account)
            ? { ok: true, created: true, accountName }
            : { ok: false };
    }

    hasAccount(username: string | undefined): boolean {
        const accountName = normalizeAccountName(username);
        if (!accountName) return false;
        return this.statements.selectExists.get(accountName) !== undefined;
    }

    getPermissionLevel(username: string | undefined): PlayerPermission {
        const accountName = normalizeAccountName(username);
        if (!accountName) return "player";
        const row = this.statements.selectPermission.get(accountName) as
            | { permissionLevel?: unknown }
            | undefined;
        return normalizePlayerPermission(row?.permissionLevel);
    }

    /**
     * Persist a permission level for an existing account. Returns false if no
     * account exists with that username (case/space-insensitive, same as login).
     * Env-var ranks (ADMIN_USERNAMES / MODERATOR_USERNAMES / DEVELOPER_USERNAMES)
     * still take priority over this at read time — see AuthenticationService.getPlayerPermission.
     */
    setPermissionLevel(username: string | undefined, level: PlayerPermission): boolean {
        const accountName = normalizeAccountName(username);
        if (!accountName) return false;
        const result = this.statements.updatePermission.run(
            normalizePlayerPermission(level),
            accountName,
        );
        return result.changes > 0;
    }

    private derivePasswordHash(password: string, salt: Buffer): string {
        return scryptSync(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS).toString("base64");
    }

    private derivePasswordHashAsync(password: string, salt: Buffer): Promise<string> {
        return new Promise((resolve, reject) => {
            scrypt(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(Buffer.from(derivedKey).toString("base64"));
            });
        });
    }

    private verifyPassword(account: StoredAccount, password: string): boolean {
        try {
            if (account.passwordAlgorithm !== "scrypt") return false;
            const salt = Buffer.from(account.passwordSalt, "base64");
            const expected = Buffer.from(account.passwordHash, "base64");
            if (salt.length !== 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
            const actual = Buffer.from(this.derivePasswordHash(password, salt), "base64");
            return timingSafeEqual(expected, actual);
        } catch {
            return false;
        }
    }

    private async verifyPasswordAsync(account: StoredAccount, password: string): Promise<boolean> {
        try {
            if (account.passwordAlgorithm !== "scrypt") return false;
            const salt = Buffer.from(account.passwordSalt, "base64");
            const expected = Buffer.from(account.passwordHash, "base64");
            if (salt.length !== 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
            const actual = Buffer.from(await this.derivePasswordHashAsync(password, salt), "base64");
            return timingSafeEqual(expected, actual);
        } catch {
            return false;
        }
    }

    private insertAccount(accountName: string, account: StoredAccount): boolean {
        try {
            this.statements.insert.run(
                accountName,
                account.passwordAlgorithm,
                account.passwordSalt,
                account.passwordHash,
                account.createdAt,
                account.passwordChangedAt,
            );
            return true;
        } catch {
            return false;
        }
    }

    private isStoredAccount(value: unknown): value is StoredAccount {
        if (!value || typeof value !== "object") return false;
        const account = value as Partial<StoredAccount>;
        return (
            account.passwordAlgorithm === "scrypt" &&
            typeof account.passwordSalt === "string" &&
            typeof account.passwordHash === "string" &&
            typeof account.createdAt === "string" &&
            typeof account.passwordChangedAt === "string"
        );
    }

    private getAccount(accountName: string): StoredAccount | undefined {
        const row = this.statements.selectCredentials.get(accountName);
        return this.isStoredAccount(row) ? row : undefined;
    }
}
