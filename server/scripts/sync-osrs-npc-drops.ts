/**
 * Downloads the full public OSRS monster/drop-table dataset used by the
 * runtime drop registry.  The source file is intentionally ignored (large,
 * reproducible reference content), while the loader is part of the game.
 *
 * Usage:
 *   yarn --cwd server sync-npc-drops
 *   yarn --cwd server sync-npc-drops -- --source <local-monsters-complete.json>
 *   yarn --cwd server ensure-npc-drops
 *
 * The dataset comes from osrsbox-db, whose monster data is derived from the
 * OSRS Wiki dump.  It is a bootstrap source rather than cache data: the
 * client cache contains NPC definitions, but never their server-side drops.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const DESTINATION = path.join(ROOT, "references", "monsters-complete.json");
const SOURCE_URL =
    "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/monsters-complete.json";

function hasFlag(name: string): boolean {
    return process.argv.includes(name);
}

function getArg(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

async function getSourceText(): Promise<{ text: string; source: string }> {
    const localSource = getArg("--source");
    if (localSource) {
        const resolved = path.resolve(localSource);
        return { text: fs.readFileSync(resolved, "utf8"), source: resolved };
    }

    const response = await fetch(SOURCE_URL, {
        headers: { "user-agent": "xrsps-npc-drop-sync/1.0" },
    });
    if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }
    return { text: await response.text(), source: SOURCE_URL };
}

function validate(text: string): number {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Downloaded data is not the expected monster object map.");
    }
    const count = Object.keys(parsed).length;
    if (count < 100) throw new Error(`Downloaded data has only ${count} entries; refusing to write it.`);
    return count;
}

async function main(): Promise<void> {
    if (hasFlag("--if-missing") && fs.existsSync(DESTINATION)) {
        console.log(`NPC drop reference already present: ${DESTINATION}`);
        return;
    }
    const { text, source } = await getSourceText();
    const count = validate(text);
    fs.mkdirSync(path.dirname(DESTINATION), { recursive: true });
    fs.writeFileSync(DESTINATION, text.endsWith("\n") ? text : `${text}\n`);
    console.log(`Saved ${count} monster definitions from ${source}`);
    console.log(`Runtime source: ${DESTINATION}`);
}

void main().catch((error) => {
    console.error(`[sync-npc-drops] ${error instanceof Error ? error.message : String(error)}`);
    if (hasFlag("--if-missing")) {
        // Full drop data improves the game but must never prevent a local
        // world from starting when a developer is offline. The next normal
        // start will retry the bootstrap automatically.
        console.warn("[sync-npc-drops] Continuing without the optional full drop reference.");
        return;
    }
    process.exitCode = 1;
});
