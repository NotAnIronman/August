/**
 * Shared, environment-agnostic helpers for the cache-sprite common-name
 * registry - safe to import from both client and server code (no fetch, no
 * bundled JSON, no Node fs). The actual name *data* lives in two places:
 *
 *   - server/src/world/SpriteNameCatalogFile.ts reads/writes the JSON file
 *     on disk (used by the ::Rename command).
 *   - client/widgets/uikit/SpriteNameCache.ts polls that same file over
 *     HTTP at runtime and answers lookups in the sprite gallery.
 *
 * Splitting it this way means a rename takes effect the next time the
 * client polls (about a second, see SpriteNameCache.ts) with no rebuild,
 * dev-server restart, or page reload required - editing the JSON directly
 * on disk works the same way. Earlier versions imported the JSON as a
 * bundled ES module, which only picked up new names after a full webpack
 * recompile.
 */
export type SpriteNameMap = Readonly<Record<string, string>>;

/** Canonical "archiveId:frame" key format, matching the gallery's on-screen id. */
export function spriteRefKey(archiveId: number, frame: number): string {
    return `${archiveId | 0}:${Math.max(0, frame | 0)}`;
}

const SPRITE_REF_PATTERN = /^(\d+):(\d+)$/;

/** Parses a user-typed "archiveId:frame" reference, e.g. from ::Rename. */
export function parseSpriteRef(input: string): { archiveId: number; frame: number } | undefined {
    const match = SPRITE_REF_PATTERN.exec(input.trim());
    if (!match) return undefined;
    return { archiveId: Number(match[1]) | 0, frame: Number(match[2]) | 0 };
}

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Same convention as "Minimap.Compass-dial": dot-namespaced, no spaces. */
export function isValidSpriteCommonName(name: string): boolean {
    return NAME_PATTERN.test(name) && name.length <= 80;
}
