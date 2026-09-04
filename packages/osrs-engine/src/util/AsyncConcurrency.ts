/** Map values in stable order without starting an unbounded number of promises. */
export async function mapWithConcurrency<T, R>(
    values: readonly T[],
    concurrency: number,
    fn: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (values.length === 0) return [];
    const workerCount = Math.max(1, Math.min(values.length, Math.trunc(concurrency) || 1));
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < values.length) {
            const index = nextIndex++;
            results[index] = await fn(values[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}
