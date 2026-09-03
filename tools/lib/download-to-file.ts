import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1_000;
export const DEFAULT_DOWNLOAD_MAX_BYTES = 2 * 1_024 * 1_024 * 1_024;

export type DownloadProgress = Readonly<{
    receivedBytes: number;
    totalBytes?: number;
}>;

export type DownloadToFileOptions = Readonly<{
    url: string;
    destinationPath: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxBytes?: number;
    onProgress?: (progress: DownloadProgress) => void;
}>;

/**
 * Stream an HTTP response into a new file without buffering the payload in memory.
 * Partial output is removed on every failure, and an existing destination is never
 * overwritten. Callers remain responsible for atomically publishing the completed file.
 */
export async function downloadToFile(options: DownloadToFileOptions): Promise<DownloadProgress> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_DOWNLOAD_MAX_BYTES;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`Download timeout must be a positive integer (received ${timeoutMs})`);
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        throw new Error(`Download size limit must be a positive integer (received ${maxBytes})`);
    }

    const timeoutController = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, timeoutMs);
    const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutController.signal])
        : timeoutController.signal;

    try {
        return await downloadResponseToFile(options, signal, maxBytes);
    } catch (error) {
        if (timedOut) {
            throw new Error(`Download timed out after ${timeoutMs} ms (${options.url})`, {
                cause: error,
            });
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function downloadResponseToFile(
    options: DownloadToFileOptions,
    signal: AbortSignal,
    maxBytes: number,
): Promise<DownloadProgress> {
    const response = await fetch(options.url, { signal });
    if (!response.ok) {
        throw new Error(
            `Download failed: ${response.status} ${response.statusText} (${options.url})`,
        );
    }
    if (!response.body) throw new Error(`Download response had no body (${options.url})`);

    const declaredLength = Number(response.headers.get("content-length"));
    const totalBytes = Number.isSafeInteger(declaredLength) && declaredLength > 0
        ? declaredLength
        : undefined;
    if (totalBytes !== undefined && totalBytes > maxBytes) {
        throw new Error(
            `Download exceeds the ${maxBytes}-byte limit: server declared ${totalBytes} bytes ` +
                `(${options.url})`,
        );
    }
    let receivedBytes = 0;
    const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            try {
                receivedBytes += chunk.length;
                if (receivedBytes > maxBytes) {
                    callback(
                        new Error(
                            `Download exceeded the ${maxBytes}-byte limit (${options.url})`,
                        ),
                    );
                    return;
                }
                options.onProgress?.({ receivedBytes, totalBytes });
                callback(null, chunk);
            } catch (error) {
                callback(error instanceof Error ? error : new Error(String(error)));
            }
        },
    });

    fs.mkdirSync(path.dirname(options.destinationPath), { recursive: true });
    const destinationDescriptor = fs.openSync(options.destinationPath, "wx");
    const destination = fs.createWriteStream(options.destinationPath, {
        fd: destinationDescriptor,
        autoClose: true,
    });
    try {
        await pipeline(
            Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
            progress,
            destination,
            { signal },
        );
        if (totalBytes !== undefined && receivedBytes !== totalBytes) {
            throw new Error(
                `Download was incomplete: received ${receivedBytes} of ${totalBytes} bytes ` +
                    `(${options.url})`,
            );
        }
    } catch (error) {
        // pipeline() destroys and closes every owned stream before rejecting.
        // Closing the descriptor again emitted noisy Node warnings and could
        // race with descriptor reuse under concurrent downloads.
        destination.destroy();
        fs.rmSync(options.destinationPath, { force: true });
        throw error;
    }

    return { receivedBytes, totalBytes };
}
