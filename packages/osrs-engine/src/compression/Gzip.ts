import pako from "pako";

export class Gzip {
    static async initWasm(): Promise<void> {}

    static decompress(compressed: Uint8Array): Int8Array {
        const decompressed = pako.ungzip(compressed);
        return new Int8Array(
            decompressed.buffer,
            decompressed.byteOffset,
            decompressed.byteLength,
        );
    }
}
