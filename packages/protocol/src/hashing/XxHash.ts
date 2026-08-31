import { xxHash32 } from "js-xxhash";

interface HashApi {
    h32Raw(data: Uint8Array): number;
    h64Raw(data: Uint8Array): bigint;
}

/** XXHash implementation with an optional WASM fast path. */
export class XxHasher {
    static hashApi: HashApi | undefined;

    static async init(): Promise<HashApi> {
        const { default: createXxhash } = await import("xxhash-wasm");
        const hashApi: HashApi = await createXxhash();
        XxHasher.hashApi = hashApi;
        return hashApi;
    }

    static hash32Int(n: number): number {
        const buf = new Int32Array([n]);
        return this.hash32(new Uint8Array(buf.buffer));
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
        const v0 = xxHash32(data, Math.random() * 0xffffff);
        const v1 = xxHash32(data, Math.random() * 0xffffff);
        return (BigInt(v0) << 32n) | BigInt(v1);
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
