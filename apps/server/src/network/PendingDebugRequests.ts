export const MAX_PENDING_DEBUG_REQUESTS = 256;

/**
 * Retain a bounded number of diagnostic request correlations. Debug packet
 * identifiers originate at the network boundary and must not grow a process-
 * lifetime map without limit.
 */
export function rememberPendingDebugRequest<T>(
    requests: Map<number, T>,
    requestId: number,
    requester: T,
): boolean {
    if (!Number.isSafeInteger(requestId) || requestId < 0) return false;

    // Refresh an existing key's insertion order so active requests survive
    // eviction before stale requests do.
    requests.delete(requestId);
    while (requests.size >= MAX_PENDING_DEBUG_REQUESTS) {
        const oldest = requests.keys().next().value as number | undefined;
        if (oldest === undefined) break;
        requests.delete(oldest);
    }
    requests.set(requestId, requester);
    return true;
}
