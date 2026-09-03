const DEFAULT_JSON_RESPONSE_LIMIT_BYTES = 1024 * 1024;

function validateLimit(maxBytes: number): number {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new RangeError("Response byte limit must be a positive safe integer");
    }
    return maxBytes;
}

function validateDeclaredLength(response: Response, maxBytes: number): void {
    const header = response.headers.get("Content-Length");
    if (header === null) return;
    const length = Number(header);
    if (!Number.isSafeInteger(length) || length < 0) {
        throw new RangeError(`Invalid Content-Length from ${response.url || "response"}`);
    }
    if (length > maxBytes) {
        throw new RangeError(
            `${response.url || "Response"} exceeds the ${maxBytes}-byte response limit`,
        );
    }
}

/** Read a response body while enforcing a hard limit for chunked as well as sized responses. */
export async function readBoundedResponseBytes(
    response: Response,
    maxBytes: number,
): Promise<Uint8Array> {
    const limit = validateLimit(maxBytes);
    validateDeclaredLength(response, limit);

    if (!response.body) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > limit) {
            throw new RangeError(
                `${response.url || "Response"} exceeds the ${limit}-byte response limit`,
            );
        }
        return bytes;
    }

    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    let total = 0;
    try {
        for (let result = await reader.read(); !result.done; result = await reader.read()) {
            if (!result.value) continue;
            total += result.value.byteLength;
            if (!Number.isSafeInteger(total) || total > limit) {
                throw new RangeError(
                    `${response.url || "Response"} exceeds the ${limit}-byte response limit`,
                );
            }
            chunks.push(result.value);
        }
    } catch (error) {
        try {
            await reader.cancel();
        } catch {}
        throw error;
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/** Parse bounded UTF-8 JSON without first accepting an unbounded response body. */
export async function readBoundedJsonResponse(
    response: Response,
    maxBytes: number = DEFAULT_JSON_RESPONSE_LIMIT_BYTES,
): Promise<unknown> {
    const bytes = await readBoundedResponseBytes(response, maxBytes);
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
