/**
 * Shared, environment-agnostic helpers for the cache-sprite common-name
 * registry - safe to import from both client and server code (no fetch, no
 * bundled JSON, no Node fs). The actual name *data* lives in two places:
 *
 *   - the server reads/writes data/catalogs/client/sprite-names.json
 *     on disk (used by the ::Rename command).
 *   - apps/client/src/ui/widgets/uikit/SpriteNameCache.ts polls the emitted file over
 *     HTTP at runtime and answers lookups in the sprite gallery.
 *
 * Splitting it this way means a rename takes effect the next time the
 * client polls (one game tick, see SpriteNameCache.ts) after Webpack re-emits
 * the watched catalog. No dev-server restart or page reload is required.
 * Earlier versions imported the JSON as a bundled ES module and kept a
 * second editable copy under the client public directory.
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
