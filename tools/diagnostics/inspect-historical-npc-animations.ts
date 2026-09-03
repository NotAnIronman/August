/**
 * Read-only historical cache comparison for NPC animation discovery.
 *
 * The cache does not link an NPC directly to its combat sequences, but this
 * tool finds the release window for named NPCs and confirms whether the
 * sequence archive changed in that same window. The downloaded cache zips are
 * kept in a temporary directory and removed when the command exits. A later,
 * memory-bounded pass can then diff only that narrowed sequence cohort.
 *
 * Example:
 *   node --experimental-strip-types scripts/inspect-historical-npc-animations.ts
 *   node --experimental-strip-types scripts/inspect-historical-npc-animations.ts --window scurrius
 */
import AdmZip from "adm-zip";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, promises as fs, readSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { downloadToFile } from "@tools/lib/download-to-file";

const OPENRS2 = "https://archive.openrs2.org/caches/runescape";
const CONFIG_INDEX = 2;
const NPC_ARCHIVE = 9;
const SEQUENCE_ARCHIVE = 12;
const META_INDEX = 255;

type SnapshotSpec = { id: number; label: string };
type ArchiveReference = { revision: number; fileIds: number[] };
type Snapshot = {
    spec: SnapshotSpec;
    npcFiles: Map<number, Buffer>;
    npcRevision: number;
    sequenceRevision: number;
};

const SNAPSHOTS: readonly SnapshotSpec[] = [
    { id: 1247, label: "before wilderness-boss rework (2023-01-18)" },
    { id: 1252, label: "wilderness-boss rework (2023-01-25)" },
    { id: 1682, label: "before Scurrius (2024-01-17)" },
    { id: 1689, label: "Scurrius release (2024-01-24)" },
];

const TARGETS = ["Spindel", "Venenatis", "Scurrius"] as const;

function readMedium(data: Buffer, offset: number): number {
    return data.readUIntBE(offset, 3);
}

function readBigSmart(data: Buffer, offset: number): [number, number] {
    return data.readUInt16BE(offset) < 0x8000
        ? [data.readUInt16BE(offset), offset + 2]
        : [data.readInt32BE(offset) & 0x7fffffff, offset + 4];
}

function readStoreFile(data: Buffer, index: Buffer, indexId: number, archiveId: number): Buffer {
    const pointer = archiveId * 6;
    if (pointer + 6 > index.length) throw new Error(`Index ${indexId} has no archive ${archiveId}.`);

    const size = readMedium(index, pointer);
    let sector = readMedium(index, pointer + 3);
    const extended = archiveId > 0xffff;
    const headerSize = extended ? 10 : 8;
    const payloadSize = extended ? 510 : 512;
    const output = Buffer.alloc(size);
    let written = 0;
    let chunk = 0;

    while (written < size) {
        const offset = sector * 520;
        if (sector <= 0 || offset + headerSize > data.length) {
            throw new Error(`Archive ${archiveId} points to an invalid sector.`);
        }
        const storedArchiveId = extended ? data.readUInt32BE(offset) : data.readUInt16BE(offset);
        const storedChunk = data.readUInt16BE(offset + (extended ? 4 : 2));
        const nextSector = readMedium(data, offset + (extended ? 6 : 4));
        const storedIndexId = data[offset + (extended ? 9 : 7)];
        if (storedArchiveId !== archiveId || storedChunk !== chunk || storedIndexId !== indexId) {
            throw new Error(`Archive ${archiveId} has an invalid sector chain.`);
        }

        const bytes = Math.min(payloadSize, size - written);
        data.copy(output, written, offset + headerSize, offset + headerSize + bytes);
        written += bytes;
        sector = nextSector;
        chunk++;
    }
    return output;
}

function decodeContainer(container: Buffer): Buffer {
    const compression = container[0];
    const compressedSize = container.readUInt32BE(1);
    if (compression === 0) return container.subarray(5, 5 + compressedSize);
    const uncompressedSize = container.readUInt32BE(5);
    const compressed = container.subarray(9, 9 + compressedSize);
    let decoded: Buffer;
    if (compression === 1) {
        // JS5 Bzip2 omits the normal BZh1 file header. August's regular cache
        // reader adds it back before decoding; use Python's standard library
        // here so this standalone inspector needs no package installation.
        const result = spawnSync(
            "py",
            ["-3", "-c", "import bz2,sys;sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))"],
            {
                input: Buffer.concat([Buffer.from("BZh1", "ascii"), compressed]),
                // The sequence-config archive expands beyond spawnSync's 1 MB
                // default even though the compressed historical cache is small.
                maxBuffer: 256 * 1024 * 1024,
            },
        );
        if (result.error || result.status !== 0) {
            throw new Error(`Bzip2 decompression failed: ${result.error?.message ?? result.stderr.toString()}`);
        }
        decoded = result.stdout;
    } else if (compression === 2) {
        decoded = gunzipSync(compressed);
    } else {
        throw new Error(`Unsupported historical-cache compression ${compression}.`);
    }
    if (decoded.length !== uncompressedSize) throw new Error("Historical cache container size mismatch.");
    return decoded;
}

function parseReferenceTable(data: Buffer): Map<number, ArchiveReference> {
    let offset = 0;
    const protocol = data[offset++];
    if (protocol < 5 || protocol > 7) throw new Error(`Unsupported reference-table protocol ${protocol}.`);
    if (protocol > 5) offset += 4;
    const flags = data[offset++];
    const hasNames = (flags & 1) !== 0;
    const hasWhirlpool = (flags & 2) !== 0;
    const hasSizes = (flags & 4) !== 0;
    const [archiveCount, afterCount] = protocol === 7
        ? readBigSmart(data, offset)
        : [data.readUInt16BE(offset), offset + 2];
    offset = afterCount;

    const archiveIds: number[] = [];
    let lastArchiveId = 0;
    for (let i = 0; i < archiveCount; i++) {
        const [delta, next] = protocol === 7
            ? readBigSmart(data, offset)
            : [data.readUInt16BE(offset), offset + 2];
        offset = next;
        archiveIds.push((lastArchiveId += delta));
    }
    if (hasNames) offset += archiveCount * 4;
    if (hasWhirlpool) offset += archiveCount * 64;
    offset += archiveCount * 4; // CRCs
    if (hasSizes) offset += archiveCount * 8;

    const revisions = new Map<number, number>();
    for (const archiveId of archiveIds) {
        revisions.set(archiveId, data.readInt32BE(offset));
        offset += 4;
    }

    const fileCounts: number[] = [];
    for (let i = 0; i < archiveCount; i++) {
        if (protocol === 7) {
            const [value, next] = readBigSmart(data, offset);
            fileCounts.push(value);
            offset = next;
        } else {
            fileCounts.push(data.readUInt16BE(offset));
            offset += 2;
        }
    }

    const result = new Map<number, ArchiveReference>();
    for (let archiveIndex = 0; archiveIndex < archiveCount; archiveIndex++) {
        const fileIds: number[] = [];
        let lastFileId = 0;
        for (let fileIndex = 0; fileIndex < fileCounts[archiveIndex]; fileIndex++) {
            const [delta, next] = protocol === 7
                ? readBigSmart(data, offset)
                : [data.readUInt16BE(offset), offset + 2];
            offset = next;
            fileIds.push((lastFileId += delta));
        }
        result.set(archiveIds[archiveIndex], {
            revision: revisions.get(archiveIds[archiveIndex]) ?? -1,
            fileIds,
        });
    }
    return result;
}

function unpackArchive(data: Buffer, fileIds: number[]): Map<number, Buffer> {
    if (fileIds.length === 1) return new Map([[fileIds[0], data]]);
    const chunks = data[data.length - 1];
    const tableOffset = data.length - 1 - chunks * fileIds.length * 4;
    if (chunks < 1 || tableOffset < 0) throw new Error("Invalid archive file table.");

    const chunkSizes: number[][] = Array.from({ length: chunks }, () => []);
    const fileSizes = new Array<number>(fileIds.length).fill(0);
    let offset = tableOffset;
    for (let chunk = 0; chunk < chunks; chunk++) {
        let previousSize = 0;
        for (let fileIndex = 0; fileIndex < fileIds.length; fileIndex++) {
            previousSize += data.readInt32BE(offset);
            offset += 4;
            chunkSizes[chunk][fileIndex] = previousSize;
            fileSizes[fileIndex] += previousSize;
        }
    }

    const files = fileSizes.map((size) => Buffer.alloc(size));
    const writeOffsets = new Array<number>(fileIds.length).fill(0);
    offset = 0;
    for (let chunk = 0; chunk < chunks; chunk++) {
        for (let fileIndex = 0; fileIndex < fileIds.length; fileIndex++) {
            const size = chunkSizes[chunk][fileIndex];
            data.copy(files[fileIndex], writeOffsets[fileIndex], offset, offset + size);
            offset += size;
            writeOffsets[fileIndex] += size;
        }
    }
    return new Map(fileIds.map((fileId, index) => [fileId, files[index]]));
}

async function decodeContainerToFile(container: Buffer, destination: string): Promise<void> {
    const compression = container[0];
    const compressedSize = container.readUInt32BE(1);
    if (compression === 0) {
        await fs.writeFile(destination, container.subarray(5, 5 + compressedSize));
        return;
    }
    if (compression !== 1 && compression !== 2) {
        throw new Error(`Unsupported historical-cache compression ${compression}.`);
    }

    const expectedSize = container.readUInt32BE(5);
    const input = `${destination}.${compression === 1 ? "bz2" : "gz"}`;
    const payload = container.subarray(9, 9 + compressedSize);
    // JS5 Bzip2 stores a headerless stream; restore the standard header first.
    await fs.writeFile(input, compression === 1 ? Buffer.concat([Buffer.from("BZh1"), payload]) : payload);
    try {
        const python = [
            "import bz2,gzip,shutil,sys",
            "op=bz2.open if sys.argv[3]=='bz2' else gzip.open",
            "with op(sys.argv[1],'rb') as src,open(sys.argv[2],'wb') as dst:",
            "    shutil.copyfileobj(src,dst,1024*1024)",
        ].join("\n");
        execFileSync(
            "py",
            [
                "-3",
                "-c",
                python,
                input,
                destination,
                compression === 1 ? "bz2" : "gzip",
            ],
            { stdio: "pipe", maxBuffer: 1024 * 1024 },
        );
    } finally {
        await fs.rm(input, { force: true });
    }
    const actualSize = (await fs.stat(destination)).size;
    if (actualSize !== expectedSize) throw new Error("Historical sequence archive size mismatch.");
}

function readAt(fd: number, size: number, position: number): Buffer {
    const output = Buffer.alloc(size);
    let written = 0;
    while (written < size) {
        const read = readSync(fd, output, written, size - written, position + written);
        if (read <= 0) throw new Error("Unexpected end of historical sequence archive.");
        written += read;
    }
    return output;
}

function fingerprintArchiveFile(filePath: string, fileIds: number[]): Map<number, string> {
    const fd = openSync(filePath, "r");
    try {
        const actualSize = statSync(filePath).size;
        const chunks = readAt(fd, 1, actualSize - 1)[0];
        const tableOffset = actualSize - 1 - chunks * fileIds.length * 4;
        if (chunks < 1 || tableOffset < 0) throw new Error("Invalid historical sequence file table.");

        const hashes = fileIds.map(() => createHash("sha1"));
        const work = Buffer.alloc(64 * 1024);
        let dataOffset = 0;
        for (let chunk = 0; chunk < chunks; chunk++) {
            const table = readAt(fd, fileIds.length * 4, tableOffset + chunk * fileIds.length * 4);
            let previousSize = 0;
            for (let fileIndex = 0; fileIndex < fileIds.length; fileIndex++) {
                previousSize += table.readInt32BE(fileIndex * 4);
                let remaining = previousSize;
                while (remaining > 0) {
                    const length = Math.min(remaining, work.length);
                    const read = readSync(fd, work, 0, length, dataOffset);
                    if (read <= 0) throw new Error("Unexpected sequence data end.");
                    hashes[fileIndex].update(work.subarray(0, read));
                    dataOffset += read;
                    remaining -= read;
                }
            }
        }
        return new Map(fileIds.map((id, index) => [id, hashes[index].digest("hex")]));
    } finally {
        closeSync(fd);
    }
}

async function loadSnapshot(root: string, spec: SnapshotSpec): Promise<Snapshot> {
    const zipPath = path.join(root, `${spec.id}.zip`);
    const extracted = path.join(root, String(spec.id));
    await downloadToFile({
        url: `${OPENRS2}/${spec.id}/disk.zip`,
        destinationPath: zipPath,
    });
    await fs.mkdir(extracted, { recursive: true });
    new AdmZip(zipPath).extractAllTo(extracted, true);

    const find = async (name: string): Promise<Buffer> => {
        const nested = path.join(extracted, "cache", name);
        const flat = path.join(extracted, name);
        return fs.readFile(nested).catch(() => fs.readFile(flat));
    };
    const [dat, configIndex, metaIndex] = await Promise.all([
        find("main_file_cache.dat2"),
        find("main_file_cache.idx2"),
        find("main_file_cache.idx255"),
    ]);
    const table = parseReferenceTable(
        decodeContainer(readStoreFile(dat, metaIndex, META_INDEX, CONFIG_INDEX)),
    );
    const loadArchive = (archiveId: number): { files: Map<number, Buffer>; revision: number } => {
        const reference = table.get(archiveId);
        if (!reference) throw new Error(`Config archive ${archiveId} is missing from cache ${spec.id}.`);
        const group = decodeContainer(readStoreFile(dat, configIndex, CONFIG_INDEX, archiveId));
        return { files: unpackArchive(group, reference.fileIds), revision: reference.revision };
    };
    const npcs = loadArchive(NPC_ARCHIVE);
    const sequenceReference = table.get(SEQUENCE_ARCHIVE);
    if (!sequenceReference) throw new Error(`Sequence archive is missing from cache ${spec.id}.`);
    return {
        spec,
        npcFiles: npcs.files,
        npcRevision: npcs.revision,
        sequenceRevision: sequenceReference.revision,
    };
}

async function loadSequenceFingerprints(root: string, spec: SnapshotSpec): Promise<Map<number, string>> {
    const zipPath = path.join(root, `${spec.id}.zip`);
    const extracted = path.join(root, String(spec.id));
    const sequencePath = path.join(root, `${spec.id}-sequences.bin`);
    try {
        await downloadToFile({
            url: `${OPENRS2}/${spec.id}/disk.zip`,
            destinationPath: zipPath,
        });
        await fs.mkdir(extracted, { recursive: true });
        new AdmZip(zipPath).extractAllTo(extracted, true);
        const find = async (name: string): Promise<Buffer> => {
            const nested = path.join(extracted, "cache", name);
            const flat = path.join(extracted, name);
            return fs.readFile(nested).catch(() => fs.readFile(flat));
        };
        const [dat, configIndex, metaIndex] = await Promise.all([
            find("main_file_cache.dat2"),
            find("main_file_cache.idx2"),
            find("main_file_cache.idx255"),
        ]);
        const table = parseReferenceTable(
            decodeContainer(readStoreFile(dat, metaIndex, META_INDEX, CONFIG_INDEX)),
        );
        const reference = table.get(SEQUENCE_ARCHIVE);
        if (!reference) throw new Error(`Sequence archive is missing from cache ${spec.id}.`);
        const container = readStoreFile(dat, configIndex, CONFIG_INDEX, SEQUENCE_ARCHIVE);
        await decodeContainerToFile(container, sequencePath);
        return fingerprintArchiveFile(sequencePath, reference.fileIds);
    } finally {
        await Promise.all([
            fs.rm(sequencePath, { force: true }),
            fs.rm(extracted, { recursive: true, force: true }),
            fs.rm(zipPath, { force: true }),
        ]);
    }
}

function findNamedNpcs(snapshot: Snapshot, name: string): number[] {
    const needle = Buffer.from(name, "latin1");
    return [...snapshot.npcFiles]
        .filter(([, value]) => value.includes(needle))
        .map(([id]) => id)
        .sort((a, b) => a - b);
}

function fileDigest(file: Buffer | undefined): string {
    return file ? createHash("sha1").update(file).digest("hex").slice(0, 10) : "absent";
}

function printComparison(before: Snapshot, after: Snapshot, names: readonly string[]): void {
    console.log(`\n${before.spec.label} -> ${after.spec.label}`);
    console.log(`NPC archive revision: ${before.npcRevision} -> ${after.npcRevision}`);
    console.log(`Sequence archive revision: ${before.sequenceRevision} -> ${after.sequenceRevision}`);
    for (const name of names) {
        const beforeIds = findNamedNpcs(before, name);
        const afterIds = findNamedNpcs(after, name);
        const allIds = [...new Set([...beforeIds, ...afterIds])].sort((a, b) => a - b);
        console.log(`${name}: before=[${beforeIds.join(", ") || "none"}] after=[${afterIds.join(", ") || "none"}]`);
        for (const id of allIds) {
            const left = before.npcFiles.get(id);
            const right = after.npcFiles.get(id);
            console.log(`  NPC ${id}: ${fileDigest(left)} -> ${fileDigest(right)}${left?.equals(right ?? Buffer.alloc(0)) ? " (unchanged)" : " (changed)"}`);
        }
    }
    console.log(
        before.sequenceRevision === after.sequenceRevision
            ? "Sequence archive revision is unchanged."
            : "Sequence archive revision changed: this release window contains the candidate sequences to diff in a memory-bounded second pass.",
    );
}

async function buildSequenceBatch(root: string, window: "wilderness" | "scurrius"): Promise<number[]> {
    const pair = window === "wilderness" ? [SNAPSHOTS[0], SNAPSHOTS[1]] : [SNAPSHOTS[2], SNAPSHOTS[3]];
    console.log(`Downloading and fingerprinting sequences for ${pair[0].label}...`);
    const before = await loadSequenceFingerprints(root, pair[0]);
    console.log(`Downloading and fingerprinting sequences for ${pair[1].label}...`);
    const after = await loadSequenceFingerprints(root, pair[1]);
    const changed = [...after]
        .filter(([id, fingerprint]) => before.get(id) !== fingerprint)
        .map(([id]) => id)
        .sort((left, right) => left - right);
    console.log(`\n${window} candidate batch (${changed.length} changed/new sequences):`);
    console.log(changed.join(","));
    return changed;
}

async function main(): Promise<void> {
    const requestedWindow = process.argv.includes("--window")
        ? process.argv[process.argv.indexOf("--window") + 1]
        : undefined;
    const batchOnly = process.argv.includes("--batch");
    const outputIndex = process.argv.indexOf("--output");
    const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
    if (requestedWindow && requestedWindow !== "wilderness" && requestedWindow !== "scurrius") {
        throw new Error("Usage: --window wilderness|scurrius");
    }
    if (batchOnly && !requestedWindow) {
        throw new Error("Use --batch with --window wilderness or --window scurrius.");
    }
    if (outputIndex >= 0 && !outputPath) throw new Error("Usage: --output <path>");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "august-historical-cache-"));
    try {
        console.log(`Using temporary directory: ${root}`);
        if (batchOnly) {
            const window = requestedWindow as "wilderness" | "scurrius";
            const candidates = await buildSequenceBatch(root, window);
            if (outputPath) {
                const resolvedOutput = path.resolve(outputPath);
                await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
                await fs.writeFile(
                    resolvedOutput,
                    JSON.stringify({ window, candidates }, null, 2) + "\n",
                    "utf8",
                );
                console.log(`Wrote candidate batch to ${resolvedOutput}`);
            }
            return;
        }
        const comparePair = async (
            beforeSpec: SnapshotSpec,
            afterSpec: SnapshotSpec,
            names: readonly string[],
        ): Promise<void> => {
            console.log(`Downloading and reading cache ${beforeSpec.id} (${beforeSpec.label})...`);
            const before = await loadSnapshot(root, beforeSpec);
            console.log(`Downloading and reading cache ${afterSpec.id} (${afterSpec.label})...`);
            const after = await loadSnapshot(root, afterSpec);
            printComparison(before, after, names);
            // Do not retain two release windows' worth of unpacked sequence
            // definitions at once; those archives are intentionally large.
            await fs.rm(path.join(root, String(beforeSpec.id)), { recursive: true, force: true });
            await fs.rm(path.join(root, `${beforeSpec.id}.zip`), { force: true });
            await fs.rm(path.join(root, String(afterSpec.id)), { recursive: true, force: true });
            await fs.rm(path.join(root, `${afterSpec.id}.zip`), { force: true });
        };
        if (!requestedWindow || requestedWindow === "wilderness") {
            await comparePair(SNAPSHOTS[0], SNAPSHOTS[1], ["Spindel", "Venenatis"]);
        }
        if (!requestedWindow || requestedWindow === "scurrius") {
            await comparePair(SNAPSHOTS[2], SNAPSHOTS[3], ["Scurrius"]);
        }
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
