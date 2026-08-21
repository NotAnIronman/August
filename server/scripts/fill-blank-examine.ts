/**
 * Fills any blank `examine` field in server/data/locs.json (and npcs.json,
 * same gap, same fix) with a generic, clearly-fake placeholder: "(It's a
 * <Name>!)" / "(It's an <Name>!)". The leading "(" is intentional and
 * load-bearing — it makes every placeholder trivially searchable later
 * (grep/search your data files for "(" to find every one that still needs a
 * real, wiki-or-hand-written examine text) without needing a separate
 * "is this real" flag anywhere.
 *
 * The a/an choice is phonetic, not just "vowel letter = an" — e.g.
 * "Hourglass" (silent h, vowel sound) gets "An Hourglass", while "Horror"
 * (pronounced h, consonant sound) gets "A Horror", and "Unicorn" (starts
 * with a "yoo" consonant sound despite the vowel letter) gets "A Unicorn".
 * The exception lists below cover the common English cases; anything not
 * listed falls back to the simple first-letter-is-a-vowel rule, which is
 * correct for the large majority of names.
 *
 * Run with: yarn --cwd server fill-blank-examine [--locs] [--npcs]
 * (defaults to both if neither flag is given)
 */
import fs from "fs";
import path from "path";

interface Definition {
    id: number;
    name: string;
    examine: string;
    actions?: (string | null)[];
}

// Words that LOOK like they start with a vowel but SOUND like a consonant
// ("yoo", "wuh", "juh" sounds) — these take "a", not "an".
const CONSONANT_SOUND_EXCEPTIONS = [
    /^uni/i, // unicorn, uniform, university, unique, union
    /^us(e|er|able)/i, // useful, user, usable
    /^one/i,
    /^once/i,
    /^eu\w/i, // european, eulogy, euphoria
    /^ubiquit/i,
];

// Words that LOOK like they start with a consonant but SOUND like a vowel
// (silent h, mostly) — these take "an", not "a".
const VOWEL_SOUND_EXCEPTIONS = [
    /^hour/i, // hour, hourglass, hourly
    /^honor/i,
    /^honour/i,
    /^honest/i,
    /^heir/i,
    /^herb/i, // American pronunciation; harmless either way for a filler text
];

function article(name: string): "a" | "an" {
    const trimmed = name.trim();
    if (CONSONANT_SOUND_EXCEPTIONS.some((re) => re.test(trimmed))) return "a";
    if (VOWEL_SOUND_EXCEPTIONS.some((re) => re.test(trimmed))) return "an";
    return /^[aeiou]/i.test(trimmed) ? "an" : "a";
}

function fillerExamine(name: string): string {
    return `(It's ${article(name)} ${name}!)`;
}

function processFile(filePath: string, label: string): void {
    if (!fs.existsSync(filePath)) {
        console.warn(`[fill-blank-examine] ${filePath} not found — skipping ${label}.`);
        return;
    }
    const entries = JSON.parse(fs.readFileSync(filePath, "utf8")) as Definition[];
    let filled = 0;
    for (const entry of entries) {
        if (!entry.examine || entry.examine.trim().length === 0) {
            entry.examine = fillerExamine(entry.name);
            filled++;
        }
    }
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + "\n", "utf8");
    console.log(
        `[fill-blank-examine] ${label}: filled ${filled}/${entries.length} blank entries. Wrote ${filePath}.`,
    );
}

function main() {
    const args = process.argv.slice(2);
    const doLocs = args.includes("--locs") || args.length === 0;
    const doNpcs = args.includes("--npcs") || args.length === 0;

    if (doLocs) processFile(path.resolve(__dirname, "../data/locs.json"), "locs");
    if (doNpcs) processFile(path.resolve(__dirname, "../data/npcs.json"), "npcs");

    console.log(
        `[fill-blank-examine] Done. Search either file for '"(It\\'s ' (or just '"(' ) to find every ` +
            `placeholder that still wants a real examine text.`,
    );
}

main();
