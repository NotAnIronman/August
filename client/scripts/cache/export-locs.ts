/**
 * Exports loc (scenery object) definitions (id, name, examine, actions) to
 * locs.json. Same purpose and same manual-rescan technique as
 * export-npcs.ts — see that file's header for the full rationale. Run with:
 * yarn --cwd client export-locs [cacheName]
 */
import fs from "fs";

import { CacheInfo } from "../../rs/cache/CacheInfo";
import { CacheSystem } from "../../rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../rs/cache/loader/CacheLoaderFactory";
import { LocType } from "../../rs/config/loctype/LocType";
import { LocTypeLoader } from "../../rs/config/loctype/LocTypeLoader";
import { ByteBuffer } from "../../rs/io/ByteBuffer";
import { loadCache, loadCacheInfos, loadCacheList } from "./load-util";

interface ExportedLoc {
    id: number;
    name: string;
    examine?: string;
    examineSource?: "decode" | "manual-rescan";
    actions?: (string | null)[];
}

function readLocExamineManual(loader: LocTypeLoader, id: number, cacheInfo: CacheInfo): string | undefined {
    const anyLoader = loader as any;
    const buf: ByteBuffer | undefined = anyLoader.getDataBuffer ? anyLoader.getDataBuffer(id) : undefined;
    if (!buf) return undefined;

    const start = buf.offset;
    const scratch = new LocType(id, cacheInfo);
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
        // Same policy as export-npcs.ts: never let one bad id abort the export.
    } finally {
        buf.offset = start;
    }
    return undefined;
}

function exportLocs() {
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
    const locTypeLoader = loaderFactory.getLocTypeLoader();

    const outDir = "./locs";
    fs.mkdirSync(outDir, { recursive: true });

    let decodeHits = 0;
    let manualHits = 0;
    const locs: ExportedLoc[] = [];
    for (let id = 0; id < locTypeLoader.getCount(); id++) {
        let type: LocType;
        try {
            type = locTypeLoader.load(id);
        } catch {
            continue;
        }
        if (!type?.name || type.name === "null") continue;

        const decoded = (type as any).desc as string | undefined;
        const manual = decoded ? undefined : readLocExamineManual(locTypeLoader, id, cacheInfo);
        const examine = decoded ?? manual;
        if (decoded) decodeHits++;
        else if (manual) manualHits++;

        locs.push({
            id,
            name: type.name,
            examine,
            examineSource: decoded ? "decode" : manual ? "manual-rescan" : undefined,
            actions: type.actions,
        });
    }

    const outPath = `${outDir}/locs.json`;
    fs.writeFileSync(outPath, JSON.stringify(locs, null, 2) + "\n", "utf8");
    // eslint-disable-next-line no-console
    console.log(
        `Exported ${locs.length} locs to ${outPath} using cache '${cacheInfo.name}'. ` +
            `examine via standard decode: ${decodeHits}, via manual re-scan: ${manualHits}, ` +
            `total with no examine text found either way: ${locs.length - decodeHits - manualHits}.`,
    );
}

exportLocs();
