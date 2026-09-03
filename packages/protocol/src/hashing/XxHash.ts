import { xxHash32 } from "js-xxhash";

interface HashApi {
    h32Raw(data: Uint8Array): number;
    h64Raw(data: Uint8Array): bigint;
}

const UINT64_MASK = 0xffffffffffffffffn;
const PRIME64_1 = 0x9e3779b185ebca87n;
const PRIME64_2 = 0xc2b2ae3d27d4eb4fn;
const PRIME64_3 = 0x165667b19e3779f9n;
const PRIME64_4 = 0x85ebca77c2b2ae63n;
const PRIME64_5 = 0x27d4eb2f165667c5n;

function add64(left: bigint, right: bigint): bigint {
    return (left + right) & UINT64_MASK;
}

function multiply64(left: bigint, right: bigint): bigint {
    return (left * right) & UINT64_MASK;
}

function rotateLeft64(value: bigint, bits: bigint): bigint {
    return ((value << bits) | (value >> (64n - bits))) & UINT64_MASK;
}

function round64(accumulator: bigint, lane: bigint): bigint {
    return multiply64(rotateLeft64(add64(accumulator, multiply64(lane, PRIME64_2)), 31n), PRIME64_1);
}

function mergeRound64(accumulator: bigint, lane: bigint): bigint {
    const mixed = accumulator ^ round64(0n, lane);
    return add64(multiply64(mixed, PRIME64_1), PRIME64_4);
}

/** XXHash implementation with an optional WASM fast path. */
export class XxHasher {
    static hashApi: HashApi | undefined;
    private static initPromise: Promise<HashApi> | undefined;

    static async init(): Promise<HashApi> {
        if (XxHasher.hashApi) return XxHasher.hashApi;
        if (!XxHasher.initPromise) {
            XxHasher.initPromise = import("xxhash-wasm")
                .then(({ default: createXxhash }) => createXxhash())
                .then((hashApi: HashApi) => {
                    XxHasher.hashApi = hashApi;
                    return hashApi;
                })
                .catch((error) => {
                    XxHasher.initPromise = undefined;
                    throw error;
                });
        }
        return XxHasher.initPromise;
    }

    static hash32Int(n: number): number {
        // The historic implementation emitted little-endian bytes on all
        // supported machines. Encode that wire order explicitly so hashes do
        // not change on a big-endian runtime.
        const buffer = new ArrayBuffer(4);
        new DataView(buffer).setInt32(0, n | 0, true);
        return this.hash32(new Uint8Array(buffer));
    }

    static hash32(data: Uint8Array): number {
        if (XxHasher.hashApi) {
            return XxHasher.hashApi.h32Raw(data);
        }
        return XxHasher.hash32js(data);
    }

    static hash32js(data: Uint8Array): number {
        return xxHash32(data);
    }

    static hash64(data: Uint8Array): bigint {
        if (XxHasher.hashApi) {
            return XxHasher.hashApi.h64Raw(data);
        }
        return XxHasher.hash64js(data);
    }

    static hash64js(data: Uint8Array): bigint {
        // Exact, deterministic XXH64(seed=0) fallback. The previous fallback
        // combined two randomly-seeded 32-bit hashes, so equal input produced
        // a different value on every call and disagreed with the WASM path.
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const length = data.byteLength;
        let offset = 0;
        let hash: bigint;

        if (length >= 32) {
            let v1 = add64(PRIME64_1, PRIME64_2);
            let v2 = PRIME64_2;
            let v3 = 0n;
            let v4 = (-PRIME64_1) & UINT64_MASK;
            const limit = length - 32;
            do {
                v1 = round64(v1, view.getBigUint64(offset, true));
                offset += 8;
                v2 = round64(v2, view.getBigUint64(offset, true));
                offset += 8;
                v3 = round64(v3, view.getBigUint64(offset, true));
                offset += 8;
                v4 = round64(v4, view.getBigUint64(offset, true));
                offset += 8;
            } while (offset <= limit);

            hash = add64(
                add64(rotateLeft64(v1, 1n), rotateLeft64(v2, 7n)),
                add64(rotateLeft64(v3, 12n), rotateLeft64(v4, 18n)),
            );
            hash = mergeRound64(hash, v1);
            hash = mergeRound64(hash, v2);
            hash = mergeRound64(hash, v3);
            hash = mergeRound64(hash, v4);
        } else {
            hash = PRIME64_5;
        }

        hash = add64(hash, BigInt(length));
        while (offset + 8 <= length) {
            hash ^= round64(0n, view.getBigUint64(offset, true));
            hash = add64(multiply64(rotateLeft64(hash, 27n), PRIME64_1), PRIME64_4);
            offset += 8;
        }
        if (offset + 4 <= length) {
            hash ^= multiply64(BigInt(view.getUint32(offset, true)), PRIME64_1);
            hash = add64(multiply64(rotateLeft64(hash, 23n), PRIME64_2), PRIME64_3);
            offset += 4;
        }
        while (offset < length) {
            hash ^= multiply64(BigInt(data[offset]), PRIME64_5);
            hash = multiply64(rotateLeft64(hash, 11n), PRIME64_1);
            offset++;
        }

        hash ^= hash >> 33n;
        hash = multiply64(hash, PRIME64_2);
        hash ^= hash >> 29n;
        hash = multiply64(hash, PRIME64_3);
        hash ^= hash >> 32n;
        return hash & UINT64_MASK;
    }

    static bufToBigInt(data: Uint8Array): bigint {
        let bits = 8n;

        let ret = 0n;
        for (const i of data.values()) {
            const bi = BigInt(i);
            ret = (ret << bits) + bi;
        }
        return ret;
    }
}
