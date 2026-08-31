/**
 * Trace every unresolved NPC in `NPC Notes` to its first archived OSRS cache
 * appearance, then diff that release window's sequence configs.
 *
 * Unlike the original one-off historical inspector, this downloads only the
 * small config reference/NPC/sequence groups from OpenRS2. It never downloads
 * an entire cache. Results are observations: a release batch may include
 * sequences for other content shipped in the same update and must be reviewed
 * in-game before assigning combat roles.
 *
 * Run from the repository root:
 *   node --experimental-strip-types server/scripts/trace-unresolved-npc-animations.ts
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const OPENRS2 = "https://archive.openrs2.org";
const RUNELITE_ANIMATION_ID_URL =
    "https://raw.githubusercontent.com/runelite/runelite/master/runelite-api/src/main/java/net/runelite/api/gameval/AnimationID.java";
const CONFIG_INDEX = 2;
const NPC_ARCHIVE = 9;
const SEQUENCE_ARCHIVE = 12;
const META_INDEX = 255;
const AUGUST_CACHE_REVISION = 237;
const AUGUST_OPENRS2_CACHE_ID = 2504; // osrs-237_2026-03-25
const OUTPUT_PATH = path.resolve(
    process.cwd(),
    "server/data/reports/unresolved-npc-historical-animation-batches.json",
);
const MARKDOWN_OUTPUT_PATH = path.resolve(
    process.cwd(),
    "NPC Animation Batches.md",
);

type CacheBuild = { major: number; minor: number | null };
type CacheSpec = {
    id: number;
    game: string;
    environment: string;
    language: string;
    timestamp: string | null;
    builds: CacheBuild[];
    disk_store_valid: boolean;
};
type ArchiveReference = { revision: number; fileIds: number[] };
type NpcSummary = {
    npcRevision: number;
    sequenceRevision: number;
    sequenceIds: number[];
    presentTargets: Set<string>;
};
type SequenceBatch = {
    candidates: number[];
    newCandidates: number[];
    modifiedCandidates: number[];
};
type NpcMatch = {
    ids: number[];
    movementSequenceIds: number[];
};
type ForcedWindow = { before: number; after: number; reason: string };
type Target = {
    key: string;
    label: string;
    names: readonly string[];
    /** IDs used to locate the first historical appearance. Keep this list narrow. */
    probeIds: readonly number[];
    /** Every form from NPC Notes that should inherit this review batch. */
    reviewIds?: readonly number[];
    /** Extra Jagex gameval families for NPCs whose config omits movement sequences. */
    animationNamePrefixes?: readonly string[];
    forcedWindow?: ForcedWindow;
    nonNpcReason?: string;
    legacyBaselineReason?: string;
};

const TARGETS: readonly Target[] = [
    { key: "gemstone-crab", label: "Gemstone Crab", names: ["Gemstone Crab"], probeIds: [14779] },
    { key: "scurrius", label: "Scurrius", names: ["Scurrius"], probeIds: [7221, 7222] },
    {
        key: "blood-moon",
        label: "Blood Moon",
        names: ["Blood Moon"],
        probeIds: [13011],
        animationNamePrefixes: ["NPC_DJINN"],
    },
    {
        key: "blue-moon",
        label: "Blue Moon",
        names: ["Blue Moon"],
        probeIds: [13013],
        animationNamePrefixes: ["NPC_DJINN"],
    },
    {
        key: "eclipse-moon",
        label: "Eclipse Moon",
        names: ["Eclipse Moon"],
        probeIds: [13012],
        animationNamePrefixes: ["NPC_DJINN"],
    },
    { key: "hueycoatl", label: "The Hueycoatl", names: ["The Hueycoatl"], probeIds: [14009, 14010, 14011, 14012, 14013] },
    { key: "nex", label: "Nex", names: ["Nex"], probeIds: [11278, 11279, 11280, 11281, 11282] },
    { key: "revenant-maledictus", label: "Revenant maledictus", names: ["Revenant maledictus"], probeIds: [11246] },
    {
        key: "vetion",
        label: "Vet'ion (2023 rework)",
        names: ["Vet'ion"],
        probeIds: [6611, 6612],
        forcedWindow: { before: 1247, after: 1252, reason: "The NPC predates OSRS; use its 2023 Wilderness boss rework." },
    },
    {
        key: "callisto",
        label: "Callisto (2023 rework)",
        names: ["Callisto"],
        probeIds: [6609],
        forcedWindow: { before: 1247, after: 1252, reason: "The NPC predates OSRS; use its 2023 Wilderness boss rework." },
    },
    {
        key: "demonic-brutus",
        label: "Demonic Brutus",
        names: ["Demonic Brutus"],
        probeIds: [15628],
        reviewIds: [15628, 15629],
    },
    { key: "amoxliatl", label: "Amoxliatl", names: ["Amoxliatl"], probeIds: [13685, 13686, 13687, 13689] },
    {
        key: "royal-titans",
        label: "Royal Titans",
        names: ["Eldric the Ice King", "Branda the Fire Queen"],
        // Branda 12596 was preloaded. Eldric's ID isolates the actual release.
        probeIds: [14147, 14148, 14149],
        reviewIds: [12596, 14147, 14148, 14149],
    },
    { key: "doom-of-mokhaiotl", label: "Doom of Mokhaiotl", names: ["Doom of Mokhaiotl"], probeIds: [14707] },
    {
        key: "mad-angel",
        label: "Mad Angel",
        names: ["Mad Angel"],
        probeIds: [16305],
        reviewIds: [16305, 16306, 16307, 16308, 16309, 16310, 16311, 16312, 16314, 16315],
    },
    {
        key: "phantom-muspah",
        label: "Phantom Muspah",
        names: ["Phantom Muspah"],
        probeIds: [12077, 12078, 12079, 12080, 12082],
    },
    {
        key: "maggot-king",
        label: "Maggot King",
        names: ["Maggot King"],
        probeIds: [15742],
        forcedWindow: {
            before: 2614,
            after: 2615,
            reason: "The Blood Moon Rises launched at 10:00 UTC between these two 30 June 2026 snapshots.",
        },
    },
    {
        key: "phosanis-nightmare",
        label: "Phosani's Nightmare",
        names: ["Phosani's Nightmare"],
        probeIds: [9416, 9417, 9418, 9419, 9420, 9421, 9422, 9423, 9424],
        reviewIds: [9416, 9417, 9418, 9419, 9420, 9421, 9422, 9423, 9424, 11153, 11154, 11155],
        forcedWindow: {
            before: 507,
            after: 524,
            reason: "Uses the permanent redesigned encounter released 30 June 2021, not the one-week March 2020 prototype.",
        },
    },
    { key: "yama", label: "Yama", names: ["Yama"], probeIds: [14176] },
    {
        key: "duke-sucellus",
        label: "Duke Sucellus",
        names: ["Duke Sucellus"],
        probeIds: [12191, 12192, 12193, 12194, 12195, 12196],
        reviewIds: [12166, 12167, 12191, 12192, 12193, 12194, 12195, 12196],
    },
    { key: "leviathan", label: "The Leviathan", names: ["The Leviathan"], probeIds: [12214, 12215, 12219] },
    { key: "whisperer", label: "The Whisperer", names: ["The Whisperer"], probeIds: [12204, 12205, 12206, 12207] },
    {
        key: "vardorvis",
        label: "Vardorvis",
        names: ["Vardorvis"],
        probeIds: [12223, 12224, 12228],
        reviewIds: [12223, 12224, 12228, 12425, 12426],
    },
    {
        key: "mimic",
        label: "The Mimic",
        names: ["The Mimic"],
        probeIds: [8633],
        reviewIds: [7979, 8633],
    },
    {
        key: "hespori",
        label: "Hespori",
        names: ["Hespori"],
        probeIds: [8583],
        reviewIds: [8583, 11192],
    },
    { key: "skotizo", label: "Skotizo", names: ["Skotizo"], probeIds: [7286] },
    {
        key: "shellbane-gryphon",
        label: "Shellbane gryphon",
        names: ["Shellbane gryphon"],
        probeIds: [14860, 15010],
    },
    {
        key: "grotesque-guardians",
        label: "Grotesque Guardians",
        names: ["Dawn", "Dusk"],
        probeIds: [7849, 7850, 7851, 7852, 7853, 7854, 7855, 7882, 7883, 7884, 7885, 7886, 7887, 7888, 7889],
    },
    { key: "abyssal-sire", label: "Abyssal Sire", names: ["Abyssal Sire"], probeIds: [5886, 5887, 5888, 5889, 5890, 5891, 5908] },
    { key: "kraken", label: "Kraken", names: ["Kraken"], probeIds: [494] },
    { key: "cerberus", label: "Cerberus", names: ["Cerberus"], probeIds: [5862, 5863, 5866] },
    {
        key: "araxxor",
        label: "Araxxor",
        names: ["Araxxor"],
        probeIds: [13668],
        reviewIds: [13668, 13669],
    },
    {
        key: "thermonuclear-smoke-devil",
        label: "Thermonuclear smoke devil",
        names: ["Thermonuclear smoke devil"],
        probeIds: [499],
    },
    {
        key: "alchemical-hydra",
        label: "Alchemical Hydra",
        names: ["Alchemical Hydra"],
        probeIds: [8615, 8616, 8617, 8618, 8619, 8620, 8621, 8622, 8634],
    },
    {
        key: "crystalline-hunllef",
        label: "Crystalline Hunllef",
        names: ["Crystalline Hunllef"],
        probeIds: [9021, 9022, 9023, 9024],
    },
    {
        key: "corrupted-hunllef",
        label: "Corrupted Hunllef",
        names: ["Corrupted Hunllef"],
        probeIds: [9035, 9036, 9037, 9038],
    },
    {
        key: "tztok-jad",
        label: "TzTok-Jad",
        names: ["TzTok-Jad"],
        probeIds: [3127],
        legacyBaselineReason:
            "TzTok-Jad predates Old School RuneScape and is already present in the baseline game data; OpenRS2 has no pre-Jad OSRS cache to diff.",
    },
    { key: "tzkal-zuk", label: "TzKal-Zuk", names: ["TzKal-Zuk"], probeIds: [7706] },
    { key: "sol-heredit", label: "Sol Heredit", names: ["Sol Heredit"], probeIds: [12821, 12827] },
    { key: "tempoross", label: "Tempoross", names: ["Tempoross"], probeIds: [10572, 10574, 10575] },
    {
        key: "wintertodt",
        label: "Wintertodt",
        names: [],
        probeIds: [],
        nonNpcReason: "Wintertodt is an environment/object encounter, not an NPC definition with combat sequences.",
    },
    { key: "zalcano", label: "Zalcano", names: ["Zalcano"], probeIds: [9049, 9050] },
    { key: "tekton", label: "Tekton", names: ["Tekton"], probeIds: [7540, 7541, 7542, 7545] },
    { key: "vanguard", label: "Vanguard", names: ["Vanguard"], probeIds: [7525, 7526, 7527, 7528, 7529] },
    { key: "vespula", label: "Vespula", names: ["Vespula"], probeIds: [7530, 7531, 7532] },
    { key: "vasa-nistirio", label: "Vasa Nistirio", names: ["Vasa Nistirio"], probeIds: [7566, 7567] },
    { key: "muttadile", label: "Muttadile", names: ["Muttadile"], probeIds: [7561, 7562, 7563] },
    {
        key: "great-olm",
        label: "Great Olm",
        names: ["Great Olm", "Great Olm (Left claw)", "Great Olm (Right claw)"],
        probeIds: [7550, 7551, 7552, 7553, 7554, 7555],
        forcedWindow: {
            before: 455,
            after: 421,
            reason: "Chambers of Xeric release window; early Olm definitions used decorated names that defeat exact-name first-appearance matching.",
        },
    },
    {
        key: "maiden",
        label: "The Maiden of Sugadinti",
        names: ["The Maiden of Sugadinti"],
        probeIds: [8360, 8361, 8362, 8363, 8364, 8365],
    },
    { key: "pestilent-bloat", label: "Pestilent Bloat", names: ["Pestilent Bloat"], probeIds: [8359] },
    {
        key: "nylocas-vasilias",
        label: "Nylocas Vasilias",
        names: ["Nylocas Vasilias"],
        probeIds: [8354, 8355, 8356, 8357],
    },
    { key: "sotetseg", label: "Sotetseg", names: ["Sotetseg"], probeIds: [8387, 8388] },
    { key: "xarpus", label: "Xarpus", names: ["Xarpus"], probeIds: [8338, 8339, 8340, 8341] },
    { key: "verzik-vitur", label: "Verzik Vitur", names: ["Verzik Vitur"], probeIds: [8370, 8371, 8372, 8373, 8374, 8375] },
    { key: "akkha", label: "Akkha", names: ["Akkha"], probeIds: [11789, 11790, 11791, 11792, 11793, 11794, 11795, 11796] },
    { key: "ba-ba", label: "Ba-Ba", names: ["Ba-Ba"], probeIds: [11778, 11779, 11780] },
    { key: "kephri", label: "Kephri", names: ["Kephri"], probeIds: [11719, 11720, 11721, 11722] },
    { key: "zebak", label: "Zebak", names: ["Zebak"], probeIds: [11730, 11732, 11733] },
    {
        key: "tumekens-warden",
        label: "Tumeken's Warden",
        names: ["Tumeken's Warden"],
        probeIds: [11747, 11749, 11756, 11757, 11758, 11760, 11762, 11764],
    },
    {
        key: "elidinis-warden",
        label: "Elidinis' Warden",
        names: ["Elidinis' Warden"],
        probeIds: [11746, 11748, 11753, 11754, 11755, 11759, 11761, 11763],
    },
] as const;

const targetNamePatterns = new Map(
    TARGETS.map((target) => [
        target.key,
        target.names.map((name) =>
            Buffer.concat([Buffer.from([2]), Buffer.from(name, "latin1"), Buffer.from([0])]),
        ),
    ]),
);

function readMedium(data: Buffer, offset: number): number {
    return data.readUIntBE(offset, 3);
}

function readBigSmart(data: Buffer, offset: number): [number, number] {
    return data.readUInt16BE(offset) < 0x8000
        ? [data.readUInt16BE(offset), offset + 2]
        : [data.readInt32BE(offset) & 0x7fffffff, offset + 4];
}

function decodeContainer(container: Buffer): Buffer {
    const compression = container[0];
    const compressedSize = container.readUInt32BE(1);
    if (compression === 0) return container.subarray(5, 5 + compressedSize);
    const uncompressedSize = container.readUInt32BE(5);
    const compressed = container.subarray(9, 9 + compressedSize);
    let decoded: Buffer;
    if (compression === 1) {
        const result = spawnSync(
            "py",
            ["-3", "-c", "import bz2,sys;sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))"],
            {
                input: Buffer.concat([Buffer.from("BZh1", "ascii"), compressed]),
                maxBuffer: 512 * 1024 * 1024,
            },
        );
        if (result.error || result.status !== 0) {
            throw new Error(`Bzip2 decompression failed: ${result.error?.message ?? result.stderr.toString()}`);
        }
        decoded = result.stdout;
    } else if (compression === 2) {
        decoded = gunzipSync(compressed);
    } else {
        throw new Error(`Unsupported cache compression ${compression}.`);
    }
    if (decoded.length !== uncompressedSize) {
        throw new Error(`Decoded container length ${decoded.length} did not match ${uncompressedSize}.`);
    }
    return decoded;
}

function parseReferenceTable(data: Buffer): Map<number, ArchiveReference> {
    let offset = 0;
    const protocol = data[offset++];
    if (protocol < 5 || protocol > 7) throw new Error(`Unsupported reference protocol ${protocol}.`);
    if (protocol > 5) offset += 4;
    const flags = data[offset++];
    const hasNames = (flags & 1) !== 0;
    const hasWhirlpool = (flags & 2) !== 0;
    const hasSizes = (flags & 4) !== 0;
    const [archiveCount, nextOffset] = protocol === 7
        ? readBigSmart(data, offset)
        : [data.readUInt16BE(offset), offset + 2];
    offset = nextOffset;

    const archiveIds: number[] = [];
    let lastArchiveId = 0;
    for (let index = 0; index < archiveCount; index++) {
        const [delta, next] = protocol === 7
            ? readBigSmart(data, offset)
            : [data.readUInt16BE(offset), offset + 2];
        offset = next;
        archiveIds.push((lastArchiveId += delta));
    }
    if (hasNames) offset += archiveCount * 4;
    if (hasWhirlpool) offset += archiveCount * 64;
    offset += archiveCount * 4;
    if (hasSizes) offset += archiveCount * 8;

    const revisions = new Map<number, number>();
    for (const archiveId of archiveIds) {
        revisions.set(archiveId, data.readInt32BE(offset));
        offset += 4;
    }

    const fileCounts: number[] = [];
    for (let index = 0; index < archiveCount; index++) {
        if (protocol === 7) {
            const [count, next] = readBigSmart(data, offset);
            fileCounts.push(count);
            offset = next;
        } else {
            fileCounts.push(data.readUInt16BE(offset));
            offset += 2;
        }
    }

    const references = new Map<number, ArchiveReference>();
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
        references.set(archiveIds[archiveIndex], {
            revision: revisions.get(archiveIds[archiveIndex]) ?? -1,
            fileIds,
        });
    }
    return references;
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

async function fetchBuffer(url: string, attempt = 1): Promise<Buffer> {
    const response = await fetch(url, {
        headers: { "user-agent": "August historical NPC animation tracer/1.0" },
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 6) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
        return fetchBuffer(url, attempt + 1);
    }
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
}

async function fetchGroup(cacheId: number, archive: number, group: number): Promise<Buffer> {
    return fetchBuffer(`${OPENRS2}/caches/runescape/${cacheId}/archives/${archive}/groups/${group}.dat`);
}

async function loadGamevalAnimationNames(): Promise<Map<number, string[]>> {
    try {
        const source = (await fetchBuffer(RUNELITE_ANIMATION_ID_URL)).toString("utf8");
        const names = new Map<number, string[]>();
        const pattern = /public static final int ([A-Z0-9_]+) = (\d+);/g;
        for (const match of source.matchAll(pattern)) {
            const id = Number.parseInt(match[2], 10);
            const values = names.get(id) ?? [];
            values.push(match[1]);
            names.set(id, values);
        }
        console.log(`Loaded ${names.size} RuneLite/Jagex gameval animation names.`);
        return names;
    } catch (error) {
        console.warn(
            `Could not load RuneLite gameval animation names; continuing without labels: ${error instanceof Error ? error.message : String(error)}`,
        );
        return new Map();
    }
}

function hasTargetName(file: Buffer | undefined, target: Target): boolean {
    if (!file) return false;
    return (targetNamePatterns.get(target.key) ?? []).some((pattern) => file.includes(pattern));
}

function skipNullTerminatedString(data: Buffer, offset: number): number {
    const terminator = data.indexOf(0, offset);
    if (terminator < 0) throw new Error("Unterminated NPC config string.");
    return terminator + 1;
}

function skipBigSmart(data: Buffer, offset: number): number {
    return offset + ((data[offset] & 0x80) !== 0 ? 4 : 2);
}

function skipUnsignedSmart(data: Buffer, offset: number): number {
    return offset + (data[offset] < 128 ? 1 : 2);
}

/**
 * Read only the movement sequence fields needed for candidate ranking. The
 * remaining OSRS NPC opcodes are skipped without decoding their values.
 */
function readNpcMovementSequenceIds(data: Buffer, cacheRevision: number): number[] {
    let offset = 0;
    let modelCount = 0;
    const sequences = new Set<number>();
    const addSequence = (id: number) => {
        if (id !== 0xffff) sequences.add(id);
    };
    const readSequence = () => {
        addSequence(data.readUInt16BE(offset));
        offset += 2;
    };

    while (offset < data.length) {
        const opcode = data[offset++];
        if (opcode === 0) break;
        if (opcode === 1) {
            modelCount = data[offset++];
            offset += modelCount * 2;
        } else if (opcode === 2 || opcode === 3 || (opcode >= 30 && opcode < 35)) {
            offset = skipNullTerminatedString(data, offset);
        } else if (opcode === 12 || opcode === 100 || opcode === 101 || opcode === 119 ||
            opcode === 125 || opcode === 128 || opcode === 140 || opcode === 163 ||
            opcode === 165 || opcode === 168) {
            offset += 1;
        } else if (opcode >= 13 && opcode <= 16) {
            readSequence();
        } else if (opcode === 17 || opcode === 115 || opcode === 117) {
            for (let index = 0; index < 4; index++) readSequence();
        } else if (opcode === 18 || opcode === 44 || opcode === 45 || opcode === 74 ||
            opcode === 75 || opcode === 76 || opcode === 77 || opcode === 78 ||
            opcode === 79 || opcode === 95 || opcode === 97 || opcode === 98 ||
            opcode === 103 || opcode === 113 || opcode === 124 || opcode === 126 ||
            opcode === 127 || opcode === 137 || opcode === 138 || opcode === 139 ||
            opcode === 142 || opcode === 144 || opcode === 146 ||
            (opcode >= 170 && opcode < 176)) {
            // Opcode 113 has two ushorts; all other entries in this branch have one.
            offset += opcode === 113 ? 4 : 2;
        } else if (opcode === 40 || opcode === 41) {
            offset += data[offset] * 4 + 1;
        } else if (opcode === 60) {
            offset += data[offset] * 2 + 1;
        } else if (opcode === 61 || opcode === 62) {
            offset += data[offset] * 4 + 1;
        } else if (opcode === 93 || opcode === 99 || opcode === 107 || opcode === 109 ||
            opcode === 111 || opcode === 112 || opcode === 122 || opcode === 123 ||
            opcode === 130 || opcode === 141 || opcode === 143 || opcode === 145 ||
            opcode === 147 || opcode === 158 || opcode === 159 || opcode === 161 ||
            opcode === 162) {
            // Boolean/marker opcodes have no payload.
        } else if (opcode === 102) {
            if (cacheRevision < 210) {
                offset += 2;
            } else {
                let mask = data[offset++];
                while (mask !== 0) {
                    if ((mask & 1) !== 0) {
                        offset = skipBigSmart(data, offset);
                        offset = skipUnsignedSmart(data, offset);
                    }
                    mask >>= 1;
                }
            }
        } else if (opcode === 106 || opcode === 118) {
            offset += opcode === 118 ? 6 : 4;
            const count = data[offset++];
            offset += (count + 1) * 2;
        } else if (opcode === 114 || opcode === 116) {
            readSequence();
        } else if (opcode === 121) {
            if (modelCount <= 0) throw new Error("NPC opcode 121 appeared before its model list.");
            const count = data[offset++];
            offset += count * 4;
        } else if (opcode === 134) {
            offset += 8;
        } else if (opcode === 135 || opcode === 136) {
            offset += 3;
        } else if (opcode >= 150 && opcode < 155) {
            offset = skipNullTerminatedString(data, offset);
        } else if (opcode === 155 || opcode === 164) {
            offset += 4;
        } else if (opcode === 160) {
            offset += data[offset] * 2 + 1;
        } else if (opcode === 249) {
            const count = data[offset++];
            for (let index = 0; index < count; index++) {
                const isString = data[offset++] === 1;
                offset += 3;
                offset = isString ? skipNullTerminatedString(data, offset) : offset + 4;
            }
        } else if (opcode === 251) {
            offset += 2;
            offset = skipNullTerminatedString(data, offset);
        } else if (opcode === 252) {
            offset += 13;
            offset = skipNullTerminatedString(data, offset);
        } else if (opcode === 253) {
            offset += 15;
            offset = skipNullTerminatedString(data, offset);
        } else {
            throw new Error(`Unsupported NPC opcode ${opcode}.`);
        }
        if (offset > data.length) throw new Error(`NPC opcode ${opcode} exceeded its config file.`);
    }
    return [...sequences].sort((left, right) => left - right);
}

function rankCandidates(
    candidates: readonly number[],
    movementSequenceIds: readonly number[],
    animationNames: ReadonlyMap<number, readonly string[]>,
    targetLabel: string,
    animationNamePrefixes: readonly string[] = [],
): number[] {
    const movementFamilies = new Set<string>();
    const manualFamilies = new Set(animationNamePrefixes);
    for (const sequenceId of movementSequenceIds) {
        for (const name of animationNames.get(sequenceId) ?? []) {
            const match = name.match(
                /^(.*?)(?:_(?:COMBAT_)?(?:IDLE|WALK|RUN|READY|TURN|CRAWL))(?:_|\d|$)/,
            );
            if (match?.[1] && match[1].length >= 3) movementFamilies.add(match[1]);
        }
    }
    const ignoredTargetWords = new Set(["THE", "AND", "WITH", "REWORK"]);
    const targetTokens = targetLabel
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !ignoredTargetWords.has(token));
    const isVisualEffect = (name: string) =>
        /(?:^|_)(?:VFX|FX|SPOTANIM|PROJANIM|PROJ|PROJECTILE|LOC|OBJ|OBJECT|INTERFACE|CHATHEAD|PET)(?:_|$)/.test(name);
    const distance = (candidate: number) => movementSequenceIds.length === 0
        ? Number.MAX_SAFE_INTEGER
        : Math.min(...movementSequenceIds.map((sequenceId) => Math.abs(candidate - sequenceId)));
    const score = (candidate: number) => {
        const names = animationNames.get(candidate) ?? [];
        const familyMatch = names.some((name) =>
            [...movementFamilies].some((family) => name === family || name.startsWith(`${family}_`)),
        );
        const manualFamilyMatch = names.some((name) =>
            [...manualFamilies].some((family) => name === family || name.startsWith(`${family}_`)),
        );
        const tokenMatches = Math.max(
            0,
            ...names.map((name) => targetTokens.filter((token) => name.includes(token)).length),
        );
        const effectOnly = names.length > 0 && names.every(isVisualEffect);
        const category = effectOnly ? 5 : familyMatch ? 0 : manualFamilyMatch ? 1 :
            tokenMatches > 0 ? 2 : names.length > 0 ? 3 : 4;
        return { category, tokenMatches, distance: distance(candidate) };
    };
    const scored = new Map(candidates.map((candidate) => [candidate, score(candidate)]));
    return [...candidates].sort((left, right) => {
        const leftScore = scored.get(left)!;
        const rightScore = scored.get(right)!;
        return leftScore.category - rightScore.category ||
            rightScore.tokenMatches - leftScore.tokenMatches ||
            leftScore.distance - rightScore.distance ||
            left - right;
    });
}

const summaryPromises = new Map<number, Promise<NpcSummary>>();

function loadNpcSummary(cache: CacheSpec): Promise<NpcSummary> {
    const existing = summaryPromises.get(cache.id);
    if (existing) return existing;
    const promise = (async () => {
        const [referenceContainer, npcContainer] = await Promise.all([
            fetchGroup(cache.id, META_INDEX, CONFIG_INDEX),
            fetchGroup(cache.id, CONFIG_INDEX, NPC_ARCHIVE),
        ]);
        const references = parseReferenceTable(decodeContainer(referenceContainer));
        const npcReference = references.get(NPC_ARCHIVE);
        const sequenceReference = references.get(SEQUENCE_ARCHIVE);
        if (!npcReference || !sequenceReference) {
            throw new Error(`Cache ${cache.id} is missing NPC or sequence references.`);
        }
        const npcFiles = unpackArchive(decodeContainer(npcContainer), npcReference.fileIds);
        const presentTargets = new Set<string>();
        for (const target of TARGETS) {
            if (target.nonNpcReason) continue;
            if (target.probeIds.some((id) => hasTargetName(npcFiles.get(id), target))) {
                presentTargets.add(target.key);
            }
        }
        return {
            npcRevision: npcReference.revision,
            sequenceRevision: sequenceReference.revision,
            sequenceIds: sequenceReference.fileIds,
            presentTargets,
        };
    })();
    summaryPromises.set(cache.id, promise);
    return promise;
}

async function mapLimit<T, R>(
    values: readonly T[],
    limit: number,
    mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
        while (true) {
            const index = nextIndex++;
            if (index >= values.length) return;
            results[index] = await mapper(values[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function cacheDetails(cache: CacheSpec) {
    return {
        openRs2Id: cache.id,
        timestamp: cache.timestamp,
        builds: cache.builds.map((build) =>
            build.minor === null ? String(build.major) : `${build.major}.${build.minor}`,
        ),
    };
}

async function findFirstAppearances(caches: CacheSpec[]): Promise<Map<string, number | undefined>> {
    const searchable = TARGETS.filter(
        (target) => !target.nonNpcReason && !target.legacyBaselineReason && !target.forcedWindow,
    );
    const results = new Map<string, number | undefined>();
    let completed = 0;
    const summaries = await mapLimit(caches, 6, async (cache) => {
        const summary = await loadNpcSummary(cache);
        completed++;
        if (completed % 25 === 0 || completed === caches.length) {
            console.log(`Historical NPC scan: ${completed}/${caches.length} snapshots.`);
        }
        return summary;
    });
    for (const target of searchable) {
        const firstIndex = summaries.findIndex((summary) => summary.presentTargets.has(target.key));
        results.set(target.key, firstIndex >= 0 ? firstIndex : undefined);
    }
    return results;
}

async function reuseFirstAppearances(caches: CacheSpec[]): Promise<Map<string, number | undefined>> {
    const raw = JSON.parse(await fs.readFile(OUTPUT_PATH, "utf8")) as {
        targets?: Array<{
            key?: unknown;
            status?: unknown;
            firstObservedCache?: { openRs2Id?: unknown };
        }>;
    };
    const cacheIndexById = new Map(caches.map((cache, index) => [cache.id, index]));
    const results = new Map<string, number | undefined>();
    for (const target of TARGETS) {
        if (target.nonNpcReason || target.legacyBaselineReason || target.forcedWindow) continue;
        const previous = raw.targets?.find((entry) => entry.key === target.key);
        if (previous?.status === "absent_from_latest_openrs2_cache") {
            results.set(target.key, undefined);
            continue;
        }
        const cacheId = previous?.firstObservedCache?.openRs2Id;
        const cacheIndex = typeof cacheId === "number" ? cacheIndexById.get(cacheId) : undefined;
        if (cacheIndex === undefined) {
            throw new Error(`Cannot reuse discovery for ${target.label}; run once without --reuse-discovery.`);
        }
        results.set(target.key, cacheIndex);
    }
    console.log("Reused first-appearance results from the existing report.");
    return results;
}

async function findMatchingNpcData(cache: CacheSpec, targets: readonly Target[]): Promise<Map<string, NpcMatch>> {
    const [referenceContainer, npcContainer] = await Promise.all([
        fetchGroup(cache.id, META_INDEX, CONFIG_INDEX),
        fetchGroup(cache.id, CONFIG_INDEX, NPC_ARCHIVE),
    ]);
    const references = parseReferenceTable(decodeContainer(referenceContainer));
    const npcReference = references.get(NPC_ARCHIVE);
    if (!npcReference) throw new Error(`Cache ${cache.id} has no NPC reference.`);
    const files = unpackArchive(decodeContainer(npcContainer), npcReference.fileIds);
    const result = new Map<string, NpcMatch>();
    for (const target of targets) {
        result.set(target.key, { ids: [], movementSequenceIds: [] });
    }
    for (const [id, file] of files) {
        for (const target of targets) {
            if (hasTargetName(file, target)) result.get(target.key)!.ids.push(id);
        }
    }

    const cacheRevision = Math.max(...cache.builds.map((build) => build.major));
    for (const target of targets) {
        const match = result.get(target.key)!;
        const movementSequenceIds = new Set<number>();
        const attemptedNpcIds = new Set<number>();
        const requestedIds = target.reviewIds ?? target.probeIds;
        const collect = (npcIds: readonly number[]) => {
            for (const npcId of npcIds) {
                if (attemptedNpcIds.has(npcId)) continue;
                attemptedNpcIds.add(npcId);
                const file = files.get(npcId);
                if (!file) continue;
                try {
                    for (const sequenceId of readNpcMovementSequenceIds(file, cacheRevision)) {
                        movementSequenceIds.add(sequenceId);
                    }
                } catch (error) {
                    console.warn(
                        `Could not read movement sequences for ${target.label} NPC ${npcId} in cache ${cache.id}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        };
        collect(requestedIds);
        if (movementSequenceIds.size === 0) {
            // Some encounter NPCs keep the animated form on an adjacent ID with
            // the same name. Only use nearby exact-name forms to avoid unrelated
            // historical name collisions such as the older NPC named Yama.
            collect(match.ids.filter((id) =>
                requestedIds.some((requestedId) => Math.abs(id - requestedId) <= 64),
            ));
        }
        match.movementSequenceIds = [...movementSequenceIds]
            .sort((left, right) => left - right);
    }
    return result;
}

async function loadSequenceFingerprints(cache: CacheSpec): Promise<Map<number, string>> {
    const summary = await loadNpcSummary(cache);
    const sequenceContainer = await fetchGroup(cache.id, CONFIG_INDEX, SEQUENCE_ARCHIVE);
    const sequenceFiles = unpackArchive(decodeContainer(sequenceContainer), summary.sequenceIds);
    return new Map(
        [...sequenceFiles].map(([id, file]) => [
            id,
            createHash("sha1").update(file).digest("hex"),
        ]),
    );
}

async function buildSequenceBatch(before: CacheSpec, after: CacheSpec): Promise<SequenceBatch> {
    console.log(`Sequence diff ${before.id} -> ${after.id}...`);
    const beforeFingerprints = await loadSequenceFingerprints(before);
    const afterFingerprints = await loadSequenceFingerprints(after);
    const newCandidates: number[] = [];
    const modifiedCandidates: number[] = [];
    for (const [id, fingerprint] of afterFingerprints) {
        const before = beforeFingerprints.get(id);
        if (before === undefined) newCandidates.push(id);
        else if (before !== fingerprint) modifiedCandidates.push(id);
    }
    newCandidates.sort((left, right) => left - right);
    modifiedCandidates.sort((left, right) => left - right);
    return {
        candidates: [...newCandidates, ...modifiedCandidates].sort((left, right) => left - right),
        newCandidates,
        modifiedCandidates,
    };
}

function loadLocalNpcIds(): Map<string, number[]> {
    const candidates = [
        path.resolve(process.cwd(), "server/data/npcs.json"),
        path.resolve(process.cwd(), "data/npcs.json"),
    ];
    const npcPath = candidates.find((candidate) => {
        try {
            return existsSync(candidate);
        } catch {
            return false;
        }
    });
    if (!npcPath) return new Map();
    const raw = readFileSync(npcPath, "utf8");
    const npcs = JSON.parse(raw) as Array<{ id?: unknown; name?: unknown }>;
    const ids = new Map<string, number[]>();
    for (const npc of npcs) {
        if (typeof npc.id !== "number" || typeof npc.name !== "string") continue;
        const list = ids.get(npc.name) ?? [];
        list.push(npc.id);
        ids.set(npc.name, list);
    }
    return ids;
}

function appendCandidateIds(lines: string[], ids: readonly number[]): void {
    if (ids.length === 0) {
        lines.push("- None.", "");
        return;
    }
    for (let index = 0; index < ids.length; index += 40) {
        lines.push(`- \`${ids.slice(index, index + 40).join(", ")}\``);
    }
    lines.push("");
}

function appendNamedCandidateIds(
    lines: string[],
    ids: readonly number[],
    animationNames: ReadonlyMap<number, readonly string[]>,
): void {
    if (ids.length === 0) {
        lines.push("- None.", "");
        return;
    }
    for (let index = 0; index < ids.length; index += 4) {
        const entries = ids.slice(index, index + 4).map((id) => {
            const names = animationNames.get(id) ?? [];
            return names.length > 0
                ? `\`${id} ${names.join(" / ")}\``
                : `\`${id}\``;
        });
        lines.push(`- ${entries.join("; ")}`);
    }
    lines.push("");
}

function buildMarkdownReport(
    generatedAt: string,
    targets: Array<Record<string, unknown>>,
    windows: Map<
        string,
        {
            before: CacheSpec;
            after: CacheSpec;
            newCandidates: number[];
            modifiedCandidates: number[];
            augustCandidates: number[];
        }
    >,
    augustCache: CacheSpec,
    animationNames: ReadonlyMap<number, readonly string[]>,
): string {
    const lines = [
        "# NPC Animation Batches",
        "",
        `Generated ${generatedAt} from OpenRS2 historical cache groups. August uses cache revision ${AUGUST_CACHE_REVISION} (OpenRS2 ${augustCache.id}).`,
        "",
        "Use `::npcreview <NPC ID>`. The review menu now loads each mapped historical batch automatically, testing newly added sequences first and modified legacy sequences afterward.",
        "",
        "Within those two groups, `::npcreview` prioritizes matching gameval NPC families and IDs nearest to that NPC's cached movement sequences. This ordering is only a convenience heuristic; the complete release batch remains available and no candidate is discarded.",
        "",
        `Where available, labels come from RuneLite's Jagex-generated [AnimationID gameval](${RUNELITE_ANIMATION_ID_URL}). Obvious NPC-family names are ranked ahead of VFX, projectiles, chatheads, and pet animations, but labels are still not server combat-role assignments.`,
        "",
        "These are release-window candidates, not cache-labelled combat roles. Every animation still needs visual review before it is assigned as melee, ranged, magic, defend, death, or special.",
        "",
        "## NPC index",
        "",
        "| NPC | Review NPC IDs | Status | Cache window | New | Modified |",
        "| --- | --- | --- | --- | ---: | ---: |",
    ];
    for (const entry of targets) {
        const label = String(entry.label ?? "Unknown").replaceAll("|", "\\|");
        const ids = Array.isArray(entry.suppliedNpcIds) ? entry.suppliedNpcIds.join(", ") : "";
        const status = String(entry.status ?? "unknown").replaceAll("_", " ");
        const window = typeof entry.sequenceWindow === "string" ? entry.sequenceWindow : "—";
        const added = typeof entry.newSequenceCandidateCount === "number"
            ? entry.newSequenceCandidateCount
            : 0;
        const modified = typeof entry.modifiedSequenceCandidateCount === "number"
            ? entry.modifiedSequenceCandidateCount
            : 0;
        lines.push(`| ${label} | ${ids || "—"} | ${status} | ${window} | ${added} | ${modified} |`);
    }

    lines.push(
        "",
        "## Target-specific review order",
        "",
        "The first 120 candidates shown for each NPC prioritize matching gameval families and cached movement-sequence proximity. For bosses present in August, only IDs available in revision 237 are shown here; the next section retains the complete historical batch.",
        "",
    );
    for (const entry of targets) {
        const movement = Array.isArray(entry.movementSequenceIds)
            ? entry.movementSequenceIds.filter((id): id is number => typeof id === "number")
            : [];
        const rankedInAugust = Array.isArray(entry.rankedAugustCandidates)
            ? entry.rankedAugustCandidates.filter((id): id is number => typeof id === "number")
            : [];
        const ranked = rankedInAugust.length > 0
            ? rankedInAugust
            : Array.isArray(entry.rankedCandidates)
                ? entry.rankedCandidates.filter((id): id is number => typeof id === "number")
                : [];
        if (ranked.length === 0) continue;
        lines.push(`### ${String(entry.label ?? "Unknown")}`, "");
        lines.push(
            movement.length > 0
                ? `Movement anchors: \`${movement.join(", ")}\`.`
                : "Movement anchors could not be decoded; this list retains release order.",
            "",
            `Prioritized candidates (showing ${Math.min(120, ranked.length)} of ${ranked.length}):`,
            "",
        );
        appendNamedCandidateIds(lines, ranked.slice(0, 120), animationNames);
    }

    lines.push("", "## Candidate batches", "");
    for (const [key, window] of windows) {
        const labels = targets
            .filter((entry) => entry.sequenceWindow === key)
            .map((entry) => String(entry.label))
            .join(", ");
        const afterAugust = Date.parse(window.after.timestamp!) > Date.parse(augustCache.timestamp!);
        lines.push(
            `### ${key}: ${labels}`,
            "",
            `OpenRS2 ${window.before.id} (${window.before.timestamp}) → ${window.after.id} (${window.after.timestamp}).`,
            "",
        );
        if (afterAugust) {
            lines.push(
                `> This batch is newer than August revision ${AUGUST_CACHE_REVISION}. Its sequence data cannot be tested until the project cache is upgraded.`,
                "",
            );
        }
        lines.push(`New sequences — test first (${window.newCandidates.length}):`, "");
        appendCandidateIds(lines, window.newCandidates);
        lines.push(`Modified sequences — fallback (${window.modifiedCandidates.length}):`, "");
        appendCandidateIds(lines, window.modifiedCandidates);
    }
    return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
    console.log("Loading OpenRS2 cache catalog...");
    const [cacheCatalog, animationNames] = await Promise.all([
        fetchBuffer(`${OPENRS2}/caches.json`),
        loadGamevalAnimationNames(),
    ]);
    const allCaches = JSON.parse(cacheCatalog.toString("utf8")) as CacheSpec[];
    const sortedCaches = allCaches
        .filter(
            (cache) =>
                cache.game === "oldschool" &&
                cache.environment === "live" &&
                cache.language === "en" &&
                cache.timestamp !== null &&
                cache.disk_store_valid &&
                cache.builds.length > 0,
        )
        .sort(
            (left, right) =>
                Date.parse(left.timestamp!) - Date.parse(right.timestamp!) || left.id - right.id,
        );
    // Imported historical snapshots occasionally have an older build assigned a
    // later timestamp. Keep a monotonic build timeline, while retaining same-build
    // hotfix snapshots, so "first observed" cannot jump backward in game history.
    let highestBuild = -1;
    const caches = sortedCaches.filter((cache) => {
        const build = Math.max(...cache.builds.map((entry) => entry.major));
        if (build < highestBuild) return false;
        highestBuild = Math.max(highestBuild, build);
        return true;
    });
    const cacheById = new Map(caches.map((cache) => [cache.id, cache]));
    const augustCache = cacheById.get(AUGUST_OPENRS2_CACHE_ID);
    if (!augustCache) throw new Error(`August cache ${AUGUST_OPENRS2_CACHE_ID} is absent from OpenRS2 metadata.`);
    console.log(`Searching ${caches.length} archived OSRS snapshots for ${TARGETS.length} note entries...`);

    const firstAppearances = process.argv.includes("--reuse-discovery")
        ? await reuseFirstAppearances(caches)
        : await findFirstAppearances(caches);
    const localNpcIds = loadLocalNpcIds();
    const augustNpcData = await findMatchingNpcData(
        augustCache,
        TARGETS.filter((target) => !target.nonNpcReason),
    );
    const targetResults: Array<Record<string, unknown>> = [];
    const targetsByAfterCache = new Map<number, Target[]>();
    const targetWindow = new Map<string, { before: CacheSpec; after: CacheSpec; reason: string }>();

    for (const target of TARGETS) {
        if (target.nonNpcReason || target.legacyBaselineReason) continue;
        if (target.forcedWindow) {
            const before = cacheById.get(target.forcedWindow.before);
            const after = cacheById.get(target.forcedWindow.after);
            if (!before || !after) throw new Error(`Forced window for ${target.label} is unavailable.`);
            targetWindow.set(target.key, {
                before,
                after,
                reason: target.forcedWindow.reason,
            });
            const list = targetsByAfterCache.get(after.id) ?? [];
            list.push(target);
            targetsByAfterCache.set(after.id, list);
            continue;
        }

        const firstIndex = firstAppearances.get(target.key);
        if (firstIndex === undefined) continue;
        const after = caches[firstIndex];
        const list = targetsByAfterCache.get(after.id) ?? [];
        list.push(target);
        targetsByAfterCache.set(after.id, list);
        if (firstIndex === 0) continue;

        const afterSummary = await loadNpcSummary(after);
        let beforeIndex = firstIndex - 1;
        // Skip duplicate snapshots where the sequence archive did not change.
        while (beforeIndex > 0) {
            const beforeSummary = await loadNpcSummary(caches[beforeIndex]);
            if (beforeSummary.sequenceRevision !== afterSummary.sequenceRevision) break;
            beforeIndex--;
        }
        targetWindow.set(target.key, {
            before: caches[beforeIndex],
            after,
            reason:
                beforeIndex === firstIndex - 1
                    ? "First archived appearance."
                    : "First archived appearance; widened backward past snapshots with an unchanged sequence archive.",
        });
    }

    console.log(`Resolving exact NPC/form IDs in ${targetsByAfterCache.size} release snapshots...`);
    const releaseNpcData = new Map<string, NpcMatch>();
    await mapLimit([...targetsByAfterCache], 4, async ([cacheId, targets]) => {
        const cache = cacheById.get(cacheId)!;
        const matches = await findMatchingNpcData(cache, targets);
        for (const [key, match] of matches) releaseNpcData.set(key, match);
    });

    const windowsByKey = new Map<
        string,
        {
            before: CacheSpec;
            after: CacheSpec;
            candidates: number[];
            newCandidates: number[];
            modifiedCandidates: number[];
            augustCandidates: number[];
            augustNewCandidates: number[];
            augustModifiedCandidates: number[];
        }
    >();
    for (const window of targetWindow.values()) {
        const key = `${window.before.id}-${window.after.id}`;
        if (windowsByKey.has(key)) continue;
        const batch = await buildSequenceBatch(window.before, window.after);
        const augustSequenceIds = new Set((await loadNpcSummary(augustCache)).sequenceIds);
        const windowIsAfterAugust =
            Date.parse(window.after.timestamp!) > Date.parse(augustCache.timestamp!);
        windowsByKey.set(key, {
            before: window.before,
            after: window.after,
            ...batch,
            augustCandidates: windowIsAfterAugust
                ? []
                : batch.candidates.filter((id) => augustSequenceIds.has(id)),
            augustNewCandidates: windowIsAfterAugust
                ? []
                : batch.newCandidates.filter((id) => augustSequenceIds.has(id)),
            augustModifiedCandidates: windowIsAfterAugust
                ? []
                : batch.modifiedCandidates.filter((id) => augustSequenceIds.has(id)),
        });
    }

    for (const target of TARGETS) {
        const idsInServerData = [...new Set(target.names.flatMap((name) => localNpcIds.get(name) ?? []))]
            .sort((left, right) => left - right);
        const augustMatch = augustNpcData.get(target.key);
        const releaseMatch = releaseNpcData.get(target.key);
        const idsInAugust = augustMatch?.ids ?? [];
        const reviewIds = target.reviewIds ?? target.probeIds;
        if (target.nonNpcReason) {
            targetResults.push({
                key: target.key,
                label: target.label,
                status: "not_an_npc",
                reason: target.nonNpcReason,
                npcIdsInAugust: [],
                npcIdsInServerData: [],
            });
            continue;
        }
        if (target.legacyBaselineReason) {
            targetResults.push({
                key: target.key,
                label: target.label,
                status: "present_in_first_osrs_archive",
                names: target.names,
                suppliedNpcIds: reviewIds,
                npcIdsInAugust: idsInAugust,
                npcIdsInServerData: idsInServerData,
                reason: target.legacyBaselineReason,
            });
            continue;
        }
        const firstIndex = firstAppearances.get(target.key);
        const window = targetWindow.get(target.key);
        if (firstIndex === undefined && !target.forcedWindow) {
            targetResults.push({
                key: target.key,
                label: target.label,
                status: "absent_from_latest_openrs2_cache",
                names: target.names,
                suppliedNpcIds: reviewIds,
                npcIdsInAugust: idsInAugust,
                npcIdsInServerData: idsInServerData,
            });
            continue;
        }
        const firstCache = target.forcedWindow ? window!.after : caches[firstIndex!];
        if (!window) {
            targetResults.push({
                key: target.key,
                label: target.label,
                status: "present_in_first_osrs_archive",
                names: target.names,
                suppliedNpcIds: reviewIds,
                npcIdsAtFirstAppearance:
                    (releaseMatch?.ids.length ?? 0) > 0
                        ? releaseMatch?.ids
                        : target.probeIds,
                npcIdsInAugust: idsInAugust,
                npcIdsInServerData: idsInServerData,
                firstObservedCache: cacheDetails(firstCache),
                reason: "OpenRS2 has no earlier OSRS cache from which to isolate this legacy NPC's animations.",
            });
            continue;
        }
        const windowKey = `${window.before.id}-${window.after.id}`;
        const batch = windowsByKey.get(windowKey)!;
        const movementSequenceIds = releaseMatch?.movementSequenceIds.length
            ? releaseMatch.movementSequenceIds
            : (augustMatch?.movementSequenceIds ?? []);
        const rankedNewCandidates = rankCandidates(
            batch.newCandidates,
            movementSequenceIds,
            animationNames,
            target.label,
            target.animationNamePrefixes ?? [],
        );
        const rankedModifiedCandidates = rankCandidates(
            batch.modifiedCandidates,
            movementSequenceIds,
            animationNames,
            target.label,
            target.animationNamePrefixes ?? [],
        );
        const rankedAugustNewCandidates = rankCandidates(
            batch.augustNewCandidates,
            movementSequenceIds,
            animationNames,
            target.label,
            target.animationNamePrefixes ?? [],
        );
        const rankedAugustModifiedCandidates = rankCandidates(
            batch.augustModifiedCandidates,
            movementSequenceIds,
            animationNames,
            target.label,
            target.animationNamePrefixes ?? [],
        );
        targetResults.push({
            key: target.key,
            label: target.label,
            status: idsInAugust.length > 0 ? "ready_for_august_review" : "not_in_august_revision_237",
            names: target.names,
            suppliedNpcIds: reviewIds,
            npcIdsAtRelease:
                (releaseMatch?.ids.length ?? 0) > 0
                    ? releaseMatch?.ids
                    : target.probeIds,
            npcIdsInAugust: idsInAugust,
            npcIdsInServerData: idsInServerData,
            firstObservedCache: cacheDetails(firstCache),
            sequenceWindow: windowKey,
            movementSequenceIds,
            sequenceCandidateCount: batch.candidates.length,
            newSequenceCandidateCount: batch.newCandidates.length,
            modifiedSequenceCandidateCount: batch.modifiedCandidates.length,
            candidatesAvailableInAugust: batch.augustCandidates.length,
            rankedNewCandidates,
            rankedModifiedCandidates,
            rankedCandidates: [...rankedNewCandidates, ...rankedModifiedCandidates],
            rankedAugustNewCandidates,
            rankedAugustModifiedCandidates,
            rankedAugustCandidates: [
                ...rankedAugustNewCandidates,
                ...rankedAugustModifiedCandidates,
            ],
            reason: window.reason,
        });
    }

    const generatedAt = new Date().toISOString();
    const relevantSequenceIds = new Set(
        [...windowsByKey.values()].flatMap((window) => window.candidates),
    );
    const relevantAnimationNames = Object.fromEntries(
        [...relevantSequenceIds]
            .map((id) => [String(id), animationNames.get(id) ?? []] as const)
            .filter(([, names]) => names.length > 0),
    );
    const report = {
        generatedAt,
        methodology: {
            source: "OpenRS2 Archive individual JS5 config groups",
            caveat:
                "Candidates are every new/changed sequence in the isolated release window. They are not cache-labelled attack roles and still require visual review.",
            openRs2Api: `${OPENRS2}/api`,
            gamevalAnimationNames: RUNELITE_ANIMATION_ID_URL,
            ranking:
                "New sequences precede modified sequences. Within each group, matching NPC-family gameval names and movement-sequence proximity are prioritized; VFX/projectile/chathead/pet labels are pushed later. No candidate is removed.",
        },
        augustCache: {
            revision: AUGUST_CACHE_REVISION,
            ...cacheDetails(augustCache),
        },
        targets: targetResults,
        gamevalAnimationNames: relevantAnimationNames,
        windows: Object.fromEntries(
            [...windowsByKey].map(([key, window]) => [
                key,
                {
                    before: cacheDetails(window.before),
                    after: cacheDetails(window.after),
                    candidateCount: window.candidates.length,
                    newCandidateCount: window.newCandidates.length,
                    modifiedCandidateCount: window.modifiedCandidates.length,
                    candidatesAvailableInAugust: window.augustCandidates.length,
                    newCandidates: window.newCandidates,
                    modifiedCandidates: window.modifiedCandidates,
                    candidates: window.candidates,
                    augustNewCandidates: window.augustNewCandidates,
                    augustModifiedCandidates: window.augustModifiedCandidates,
                    augustCandidates: window.augustCandidates,
                },
            ]),
        ),
    };
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fs.writeFile(
        MARKDOWN_OUTPUT_PATH,
        buildMarkdownReport(
            generatedAt,
            targetResults,
            windowsByKey,
            augustCache,
            animationNames,
        ),
        "utf8",
    );
    console.log(`Wrote ${OUTPUT_PATH}`);
    console.log(`Wrote ${MARKDOWN_OUTPUT_PATH}`);
    console.log(`Targets: ${targetResults.length}; unique sequence windows: ${windowsByKey.size}.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
