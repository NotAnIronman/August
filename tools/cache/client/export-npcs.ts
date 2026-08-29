/**
 * Exports NPC definitions (id, name, examine, actions) to npcs.json, mirroring
 * export-items.ts. Run with: pnpm --filter @august/client export-npcs [cacheName]
 *
 * The live server's examine system currently resolves NPC examine text via the
 * standard NpcType.decode() path, which — for reasons not yet fully
 * root-caused (see docs/CLEANUP_ROADMAP.md and the examine investigation
 * notes) — comes back empty for every NPC tested against cache revision 237,
 * even though other fields (name, actions, params) decode correctly and
 * nothing throws. This script does a second, independent, freshly-isolated
 * re-scan of each NPC's raw config bytes specifically hunting the opcode-3
 * (examine) field, the same technique export-items.ts already uses
 * successfully for items. Whatever this script finds gets written to
 * npcs.json — copy that to data/generated/server/npcs.json and it becomes another
 * fallback source examineHandler.ts can consult (see server/src/data/npcs.ts,
 * mirroring items.ts).
 *
 * To be clear about what this experiment tells us either way:
 *  - If this finds real examine text where the live path finds none, that's
 *    strong evidence of a buffer-state or decode-ordering bug in the shared
 *    loader/decode path specifically, not a "cache genuinely has no text"
 *    situation — worth digging into BaseTypeLoader/IndexTypeLoader further.
 *  - If this ALSO comes back empty, that's strong (though not 100%
 *    conclusive) evidence the cache genuinely doesn't carry this text for
 *    NPCs in this revision, and the examine_overrides table
 *    (::setexamine) is the right long-term answer, not a decode bug.
 */
import fs from "fs";

import { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { NpcType } from "@august/osrs-engine/config/npctype/NpcType";
import { NpcTypeLoader } from "@august/osrs-engine/config/npctype/NpcTypeLoader";
import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import {
    GENERATED_CACHE_DATA,
    loadCache,
    loadCacheInfos,
    loadCacheList,
} from "@tools/cache/client/load-util";

interface ExportedNpc {
    id: number;
    name: string;
    examine?: string;
    examineSource?: "decode" | "manual-rescan";
    actions?: (string | null)[];
}

/**
 * Re-scan this NPC's raw bytes from a completely fresh buffer (independent of
 * whatever buffer/offset state the standard loader's cache/decode path may be
 * in), walking opcodes with the class's own (already-correct) decodeOpcode
 * for skipping, and grabbing opcode 3 (examine) directly the moment we see it.
 */
function readNpcExamineManual(
    loader: NpcTypeLoader,
    id: number,
    cacheInfo: CacheInfo,
): string | undefined {
    const anyLoader = loader as any;
    const buf: ByteBuffer | undefined = anyLoader.getDataBuffer ? anyLoader.getDataBuffer(id) : undefined;
    if (!buf) return undefined;

    const start = buf.offset;
    // Scratch instance purely so we can reuse its already-correct decodeOpcode
    // for skipping every opcode we don't care about — avoids hand-porting a
    // second copy of that (large, easy-to-get-subtly-wrong) switch statement.
    const scratch = new NpcType(id, cacheInfo);
    try {
        while (true) {
            if (buf.offset > buf.length - 1) break;
            const opcode = buf.readUnsignedByte();
            if (opcode === 0) break;
            if (opcode === 3) {
                return scratch.readString(buf);
            }
            scratch.decodeOpcode(opcode, buf);
        }
    } catch {
        // Any decode hiccup here just means "couldn't confirm an examine
        // string" — never let this script crash the whole export over one id.
    } finally {
        buf.offset = start;
    }
    return undefined;
}

function exportNpcs() {
    const caches = loadCacheInfos();
    const cacheArg = (process.argv[2] || "").trim();
    let cacheInfo = loadCacheList(caches).latest;

    if (cacheArg) {
        const name = cacheArg
            .replace(/\\/g, "/")
            .replace(/^\.\/?/, "")
            .replace(/^caches\//, "")
            .replace(/\/$/, "");
        const found = caches.find((c) => c.name === name);
        if (!found) {
            throw new Error(`Cache '${name}' not found in caches/caches.json`);
        }
        cacheInfo = found;
    }
    const loaded = loadCache(cacheInfo);

    const cacheSystem = CacheSystem.fromFiles(loaded.type, loaded.files);
    const loaderFactory = getCacheLoaderFactory(cacheInfo, cacheSystem);
    const npcTypeLoader = loaderFactory.getNpcTypeLoader();

    const outDir = GENERATED_CACHE_DATA;
    fs.mkdirSync(outDir, { recursive: true });

    let decodeHits = 0;
    let manualHits = 0;
    const npcs: ExportedNpc[] = [];
    for (let id = 0; id < npcTypeLoader.getCount(); id++) {
        let type: NpcType;
        try {
            type = npcTypeLoader.load(id);
        } catch {
            continue;
        }
        if (!type?.name || type.name === "null") continue;

        const decoded = (type as any).desc as string | undefined;
        const manual = decoded ? undefined : readNpcExamineManual(npcTypeLoader, id, cacheInfo);
        const examine = decoded ?? manual;
        if (decoded) decodeHits++;
        else if (manual) manualHits++;

        npcs.push({
            id,
            name: type.name,
            examine,
            examineSource: decoded ? "decode" : manual ? "manual-rescan" : undefined,
            actions: type.actions,
        });
    }

    const outPath = `${outDir}/npcs.json`;
    fs.writeFileSync(outPath, JSON.stringify(npcs, null, 2) + "\n", "utf8");
    // eslint-disable-next-line no-console
    console.log(
        `Exported ${npcs.length} npcs to ${outPath} using cache '${cacheInfo.name}'. ` +
            `examine via standard decode: ${decodeHits}, via manual re-scan: ${manualHits}, ` +
            `total with no examine text found either way: ${npcs.length - decodeHits - manualHits}.`,
    );
}

exportNpcs();
