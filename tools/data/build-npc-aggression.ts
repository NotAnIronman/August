/**
 * Builds data/generated/server/npc-aggression.json from the monster reference.
 * (osrsbox-db). Run after downloading monsters-complete.json.
 */
import fs from "fs";
import { referencePath, serverGeneratedDataPath } from "@tools/lib/repository-paths";

const SOURCE = referencePath("monsters-complete.json");
const OUT = serverGeneratedDataPath("npc-aggression.json");

type RawMonster = {
    name?: string;
    aggressive?: unknown;
    combat_level?: unknown;
};

function main(): void {
    if (!fs.existsSync(SOURCE)) {
        console.error(`Missing ${SOURCE}`);
        console.error(
            "Download from https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/monsters-complete.json",
        );
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(SOURCE, "utf8")) as Record<string, RawMonster>;
    const npcs: Record<string, { aggressive: boolean; combatLevel?: number }> = {};
    let total = 0;
    let aggressive = 0;

    for (const [id, monster] of Object.entries(data)) {
        if (!monster || typeof monster.aggressive !== "boolean") continue;
        total++;
        if (monster.aggressive) aggressive++;
        const entry: { aggressive: boolean; combatLevel?: number } = {
            aggressive: monster.aggressive,
        };
        if (typeof monster.combat_level === "number" && Number.isFinite(monster.combat_level)) {
            entry.combatLevel = Math.trunc(monster.combat_level);
        }
        npcs[id] = entry;
    }

    const payload = {
        $comment:
            "OSRS monster aggression flags derived from osrsbox-db monsters-complete.json. Standard aggressive NPCs use the combat-level formula from https://oldschool.runescape.wiki/w/Aggressiveness",
        npcs,
    };
    fs.writeFileSync(OUT, JSON.stringify(payload));
    console.log(`Wrote ${OUT}`);
    console.log(`NPCs: ${total}, aggressive: ${aggressive}`);
}

main();
