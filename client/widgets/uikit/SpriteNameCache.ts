import { parseSpriteRef, spriteRefKey, type SpriteNameMap } from "../../common/uikit/spriteNames";

/**
 * Polls client/public/spriteNames.json over HTTP instead of importing it as
 * a bundled module. Files under client/public are served unbundled by the
 * dev server straight off disk, so a write from the ::Rename command (or a
 * hand-edit of the file) shows up here within one poll interval - no
 * webpack recompile, dev-server restart, or page reload needed.
 */
const SPRITE_NAMES_URL = "/spriteNames.json";
// 1 game tick (600ms), not the earlier 1500ms - the original interval
// assumed occasional single renames; bulk-skipping thousands of icons
// wants the gallery to catch up in one tick, not lag a full second-plus
// behind every click.
const POLL_INTERVAL_MS = 600;

let names: SpriteNameMap = {};
let namesByCommonName: ReadonlyMap<string, { archiveId: number; frame: number }> = new Map();
let version = 0;
let lastPollStartedAt = 0;
let pollInFlight = false;
/**
 * Refs we've optimistically applied locally but the server's own file
 * hasn't confirmed yet. A poll can be in flight (started before, resolving
 * after) an optimistic update - without this, that poll's response would
 * wholesale-overwrite `names` with the pre-update data it actually fetched,
 * making the just-renamed/skipped entry visibly reappear for one tick
 * before the next poll corrects it again ("rubber-banding"). Re-applying
 * every pending override on top of each poll response closes that window;
 * an override is dropped once the poll's own data matches it, so this
 * can't mask a later, real change to the same ref.
 */
const pendingLocalOverrides = new Map<string, string>();

function rebuildReverseMap(): void {
    const reverse = new Map<string, { archiveId: number; frame: number }>();
    for (const [ref, name] of Object.entries(names)) {
        const parsed = parseSpriteRef(ref);
        if (parsed) reverse.set(name, parsed);
    }
    namesByCommonName = reverse;
}

function pollIfDue(): void {
    const now = Date.now();
    if (pollInFlight || now - lastPollStartedAt < POLL_INTERVAL_MS) return;
    lastPollStartedAt = now;
    pollInFlight = true;
    fetch(SPRITE_NAMES_URL, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((data) => {
            if (data && typeof data === "object" && !Array.isArray(data)) {
                let next = data as SpriteNameMap;
                for (const [ref, name] of pendingLocalOverrides) {
                    if (next[ref] === name) {
                        pendingLocalOverrides.delete(ref);
                    } else {
                        next = { ...next, [ref]: name };
                    }
                }
                names = next;
                rebuildReverseMap();
                version++;
            }
        })
        .catch(() => {
            // Keep the last known-good names on a transient fetch failure
            // (e.g. dev server mid-restart) rather than blanking everything.
        })
        .finally(() => {
            pollInFlight = false;
        });
}

/**
 * Call once per gallery render tick. Cheap no-op between poll intervals;
 * kicks off a background fetch when the cache is due for a refresh.
 */
export function pollSpriteNames(): void {
    pollIfDue();
}

/** Bumps every time a poll returns successfully - use to invalidate a render cache key. */
export function getSpriteNamesVersion(): number {
    return version;
}

/**
 * Applies a name locally, immediately, ahead of the server actually writing
 * it and this poll picking it up - the client already knows exactly what it
 * just asked for, no reason to wait ~600ms to reflect it. The next
 * successful poll overwrites `names` wholesale with the server's actual
 * file contents, which naturally reconciles this: if the write succeeds it
 * matches what we set here already (no visible change), and if the server
 * rejected it (e.g. failed validation), the poll quietly corrects the
 * optimistic guess back within one tick - no rollback logic needed either way.
 */
export function applyLocalSpriteName(archiveId: number, frame: number, name: string): void {
    const ref = spriteRefKey(archiveId, frame);
    pendingLocalOverrides.set(ref, name);
    names = { ...names, [ref]: name };
    namesByCommonName = new Map(namesByCommonName).set(name, { archiveId, frame });
    version++;
}

export function getSpriteCommonName(archiveId: number, frame: number): string | undefined {
    return names[spriteRefKey(archiveId, frame)];
}

/** Reverse lookup: common name (e.g. "skill.smithing") -> archiveId/frame. */
export function resolveSpriteByCommonName(name: string): { archiveId: number; frame: number } | undefined {
    return namesByCommonName.get(name);
}

/** Common name once assigned, otherwise the raw "archiveId:frame" reference. */
export function formatSpriteGalleryLabel(archiveId: number, frame: number): string {
    return getSpriteCommonName(archiveId, frame) ?? spriteRefKey(archiveId, frame);
}
