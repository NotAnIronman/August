import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const compendiumPath = path.join(rootDir, "data", "catalogs", "developer-combat-compendium.json");

function readOption(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

const databasePath = readOption("--database");
const accountName = readOption("--account");
const write = process.argv.includes("--write");
if (!databasePath || !accountName) {
    throw new Error("Usage: node tools/development/import-combat-test-bank.mjs --database <game.sqlite> --account <name> [--write]");
}

const compendium = JSON.parse(fs.readFileSync(compendiumPath, "utf8"));
const entries = Array.isArray(compendium.entries) ? compendium.entries : [];
const capacity = Number(compendium.defaultBankCapacity);
if (!Number.isInteger(capacity) || capacity < entries.length) {
    throw new Error(`Invalid compendium capacity ${capacity}; it must fit ${entries.length} entries.`);
}

const db = new DatabaseSync(path.resolve(databasePath));
try {
    const row = db
        .prepare("SELECT state_json AS stateJson FROM player_states WHERE account_name = ?")
        .get(accountName);
    if (!row?.stateJson) throw new Error(`No persisted player state exists for account '${accountName}'.`);

    const state = JSON.parse(row.stateJson);
    const nextBank = entries.map((entry, slot) => ({
        slot,
        itemId: entry.itemId,
        quantity: entry.quantity,
        placeholder: false,
        filler: false,
        tab: entry.tab,
    }));
    const summary = {
        account: accountName,
        previousOccupiedSlots: Array.isArray(state.bank) ? state.bank.length : 0,
        nextOccupiedSlots: nextBank.length,
        capacity,
        byTab: Object.fromEntries(
            [...new Set(nextBank.map((entry) => entry.tab))].map((tab) => [
                tab,
                nextBank.filter((entry) => entry.tab === tab).length,
            ]),
        ),
    };

    if (!write) {
        console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
        process.exitCode = 0;
    } else {
        state.bank = nextBank;
        state.bankCapacity = capacity;
        state.bankCurrentTab = 0;
        db.prepare("UPDATE player_states SET state_json = ?, updated_at = ? WHERE account_name = ?").run(
            JSON.stringify(state),
            new Date().toISOString(),
            accountName,
        );
        console.log(JSON.stringify({ imported: true, ...summary }, null, 2));
    }
} finally {
    db.close();
}
