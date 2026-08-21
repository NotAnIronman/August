/**
 * One-off diagnostic — fetches the wiki's RENDERED HTML for a single page
 * and prints the raw text surrounding every "Examine" occurrence, so we can
 * see the actual infobox markup instead of guessing at it. Used to fix
 * scrape-loc-examine.ts's HTML fallback pattern, which is currently matching
 * nothing (0/125 in testing) — meaning the assumed <th>/<td> table structure
 * is wrong for however this wiki's infobox module actually renders.
 *
 * Run with: yarn --cwd server diagnose-loc-html [pageName]
 * (defaults to "Furnace", a page we know has real examine text)
 */
const WIKI_API = "https://oldschool.runescape.wiki/api.php";
const USER_AGENT = "xrsps-examine-importer/1.0 (private server tooling; contact via project repo)";

async function main() {
    const pageName = process.argv[2] || "Furnace";
    const url =
        `${WIKI_API}?action=parse&prop=text&format=json&redirects=1` +
        `&page=${encodeURIComponent(pageName)}`;

    console.log(`[diagnose-loc-html] Fetching: ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    console.log(`[diagnose-loc-html] HTTP ${res.status}`);
    const json = (await res.json()) as { parse?: { text?: { "*"?: string } }; error?: unknown };

    if (json.error) {
        console.log(`[diagnose-loc-html] API error:`, json.error);
        return;
    }

    const html = json.parse?.text?.["*"];
    if (!html) {
        console.log(`[diagnose-loc-html] No html in response. Full response:`, JSON.stringify(json).slice(0, 2000));
        return;
    }

    console.log(`[diagnose-loc-html] Got ${html.length} chars of HTML.`);

    // Find every occurrence of "examine" (case-insensitive) and print 300
    // chars of raw context around each — this shows us the real tag
    // structure regardless of what it turns out to be.
    const re = /examine/gi;
    let match: RegExpExecArray | null;
    let count = 0;
    while ((match = re.exec(html)) !== null && count < 10) {
        const start = Math.max(0, match.index - 150);
        const end = Math.min(html.length, match.index + 300);
        console.log(`\n[diagnose-loc-html] --- match ${count + 1} at offset ${match.index} ---`);
        console.log(html.slice(start, end));
        count++;
    }
    if (count === 0) {
        console.log(`[diagnose-loc-html] No occurrence of "examine" found anywhere in the HTML at all.`);
    }
}

main().catch((err) => {
    console.error("[diagnose-loc-html] Failed:", err);
    process.exit(1);
});
