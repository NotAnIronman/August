/**
 * Hard ceiling for any single cache artifact accepted from HTTP or browser
 * persistence. The normal OSRS dat2 is only a fraction of this size; the
 * generous ceiling leaves room for future revisions while preventing a corrupt
 * or hostile endpoint from driving an effectively unbounded ArrayBuffer.
 */
export const MAX_CACHE_FILE_BYTES = 2 * 1024 * 1024 * 1024;

/** Cache index IDs are one byte in every supported cache generation. */
export const MAX_CACHE_INDEX_COUNT = 256;

/** Validate a byte length against a caller-selected resource ceiling. */
export function assertByteLengthWithinLimit(
    value: number,
    resource: string,
    maxBytes: number,
): number {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        throw new RangeError(`Invalid byte limit configured for ${resource}`);
    }
    if (!Number.isSafeInteger(value) || value < 0 || value > maxBytes) {
        throw new RangeError(`${resource} exceeds the supported ${maxBytes}-byte limit`);
    }
    return value;
}

/** Validate a byte length before it is used for streaming or allocation. */
export function assertCacheFileByteLength(value: number, resource: string): number {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CACHE_FILE_BYTES) {
        throw new RangeError(
            `${resource} exceeds the supported cache-file limit of ${MAX_CACHE_FILE_BYTES} bytes`,
        );
    }
    return value;
}

/** Add byte lengths without permitting integer overflow or limit bypasses. */
export function addCacheFileByteLengths(
    current: number,
    additional: number,
    resource: string,
): number {
    assertCacheFileByteLength(current, resource);
    assertCacheFileByteLength(additional, resource);
    return assertCacheFileByteLength(current + additional, resource);
}

/** Add byte lengths without permitting overflow or a caller-selected limit bypass. */
export function addByteLengthsWithinLimit(
    current: number,
    additional: number,
    resource: string,
    maxBytes: number,
): number {
    assertByteLengthWithinLimit(current, resource, maxBytes);
    assertByteLengthWithinLimit(additional, resource, maxBytes);
    return assertByteLengthWithinLimit(current + additional, resource, maxBytes);
}
