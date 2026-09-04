/**
 * Fetch with a portable timeout and optional caller cancellation.
 *
 * AbortSignal.timeout is newer than several browsers supported by the client.
 * Using an AbortController also lets us reliably clear the timer and listener
 * once the request settles.
 */
export async function fetchWithTimeout(
    input: RequestInfo | URL,
    timeoutMs: number,
    init: RequestInit = {},
): Promise<Response> {
    const duration = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 0;
    if (duration === 0 || typeof AbortController === "undefined") {
        return fetch(input, init);
    }

    const controller = new AbortController();
    const sourceSignal = init.signal;
    const abortFromSource = () => controller.abort();

    if (sourceSignal?.aborted) {
        controller.abort();
    } else {
        sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
    }

    const timer = setTimeout(() => controller.abort(), duration);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
        sourceSignal?.removeEventListener("abort", abortFromSource);
    }
}
