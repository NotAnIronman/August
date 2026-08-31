import type { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { Huffman, tryLoadOsrsHuffman } from "@august/osrs-engine/chat/Huffman";

let huffman: Huffman | undefined;

export function initPlayerSyncHuffman(cacheSystem: CacheSystem | undefined): void {
    huffman = tryLoadOsrsHuffman(cacheSystem);
    if (!huffman) {
        // public chat in player update blocks is Huffman-compressed; without this table
        // the payload will decode as gibberish.
        console.warn(
            "[chat] failed to load OSRS Huffman table (idx10); public chat may be garbled",
        );
    }
}

export function getPlayerSyncHuffman(): Huffman | undefined {
    return huffman;
}
