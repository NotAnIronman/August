/** Optional accelerators must never prevent the JavaScript codecs from running. */
export async function initOptionalWasm(
    name: string,
    initialize: () => Promise<unknown>,
    timeoutMs: number = 10_000,
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            Promise.resolve().then(initialize),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Initialization timed out")), timeoutMs);
            }),
        ]);
    } catch (error) {
        console.warn(`[${name}] WASM unavailable; using JavaScript fallback`, error);
    } finally {
        clearTimeout(timer);
    }
}
