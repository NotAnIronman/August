/**
 * Produces a review queue for NPC combat-animation definitions.
 *
 * The cache can prove that an NPC/sequence exists, but it does not label
 * sequences as attack, block, or death.  A reference dataset supplies those
 * roles; this script then checks that the IDs are valid for August's cache
 * before they are considered for a manual in-game test.
 *
 * Example:
 *   yarn audit-npc-animations --reference C:\\path\\to\\npc-combat-defs-239.json
 *
 * Useful options:
 *   --ids 2205,2215,3129,3162     Review only selected NPC IDs.
 *   --include-generic             Include 422/424/836 placeholder rows.
 *   --no-cache                    Compare data only when a cache is unavailable.
 *   --output path/to/report.json  Override the report location.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

import { getCacheLoaderFactory } from "../../client/rs/cache/loader/CacheLoaderFactory";
import { initCacheEnv } from "../src/world/CacheEnv";

type Animations = {
    attack?: number;
    block?: number;
    death?: number;
};

type CombatDefinition = {
    name?: string;
    anims?: Animations;
};

type CombatDefinitionFile = {
    npcs?: Record<string, CombatDefinition>;
};

type AuditAction = "add" | "replace" | "unchanged";

type CacheValidation = {
    enabled: boolean;
    revision?: number;
    error?: string;
    validate: (npcId: number, animations: Animations) => {
        npcName?: string;
        npcFound: boolean;
        sequences: Partial<Record<keyof Animations, boolean>>;
    };
};

const SERVER_ROOT = path.resolve(__dirname, "..");
const DEFAULT_AUGUST_DEFINITIONS = path.join(SERVER_ROOT, "data", "npc-combat-defs.json");
const DEFAULT_OUTPUT = path.join(SERVER_ROOT, "data", "reports", "npc-animation-audit.json");
const DEFAULT_REFERENCE_GIT_REPOSITORY = path.resolve(SERVER_ROOT, "..", "..", "Elvarg", "Elvarg-TS");
const OPENRUNE_REFERENCE_SPEC = "74feb43b:data/definitions/npc-combat-defs-239.json";
const GENERIC_ANIMATIONS: Required<Animations> = { attack: 422, block: 424, death: 836 };

function usage(): never {
    throw new Error(
        "Usage: yarn audit-npc-animations [--reference <npc-combat-defs.json>] " +
            "[--reference-git <Elvarg repository>] [--ids 2205,2215] " +
            "[--include-generic] [--no-cache] [--output report.json]",
    );
}

function readArgument(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    if (index < 0) return undefined;
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) usage();
    return value;
}

function readJson(filePath: string): CombatDefinitionFile {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as CombatDefinitionFile;
}

function loadReference(referencePath: string | undefined, referenceGit: string | undefined): {
    source: string;
    data: CombatDefinitionFile;
} {
    if (referencePath) {
        const resolved = path.resolve(referencePath);
        return { source: resolved, data: readJson(resolved) };
    }

    const repository = path.resolve(referenceGit ?? DEFAULT_REFERENCE_GIT_REPOSITORY);
    if (!fs.existsSync(repository)) {
        throw new Error(
            "No reference file was supplied and the default Elvarg checkout was not found. " +
                "Pass --reference <file> or --reference-git <Elvarg repository>.",
        );
    }
    const raw = execFileSync("git", ["-C", repository, "show", OPENRUNE_REFERENCE_SPEC], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    return {
        source: `${repository}@${OPENRUNE_REFERENCE_SPEC}`,
        data: JSON.parse(raw) as CombatDefinitionFile,
    };
}

function normaliseName(name: string | undefined): string | undefined {
    const trimmed = name?.trim();
    return trimmed && trimmed.toLowerCase() !== "null" ? trimmed.toLowerCase() : undefined;
}

function isGeneric(animations: Animations): boolean {
    return (
        animations.attack === GENERIC_ANIMATIONS.attack &&
        animations.block === GENERIC_ANIMATIONS.block &&
        animations.death === GENERIC_ANIMATIONS.death
    );
}

function hasAnimation(animations: Animations | undefined): animations is Animations {
    return !!animations && Object.values(animations).some((id) => Number.isInteger(id) && id! >= 0);
}

function matches(left: Animations | undefined, right: Animations | undefined): boolean {
    return (
        left?.attack === right?.attack &&
        left?.block === right?.block &&
        left?.death === right?.death
    );
}

function loadCacheValidation(disabled: boolean): CacheValidation {
    if (disabled) {
        return {
            enabled: false,
            validate: () => ({ npcFound: false, sequences: {} }),
        };
    }

    try {
        const cacheEnv = initCacheEnv(path.join(SERVER_ROOT, "caches"));
        const loaders = getCacheLoaderFactory(cacheEnv.info, cacheEnv.cacheSystem);
        const npcLoader = loaders.getNpcTypeLoader();
        const seqLoader = loaders.getSeqTypeLoader();
        return {
            enabled: true,
            revision: cacheEnv.info.revision,
            validate: (npcId, animations) => {
                let npcName: string | undefined;
                let npcFound = false;
                try {
                    const npc = npcLoader.load(npcId);
                    npcFound = !!npc;
                    npcName = npc?.name;
                } catch {}

                const sequences: Partial<Record<keyof Animations, boolean>> = {};
                for (const role of ["attack", "block", "death"] as const) {
                    const id = animations[role];
                    if (!Number.isInteger(id) || id! < 0) continue;
                    try {
                        sequences[role] = !!seqLoader.load(id!);
                    } catch {
                        sequences[role] = false;
                    }
                }
                return { npcName, npcFound, sequences };
            },
        };
    } catch (error) {
        return {
            enabled: false,
            error: String(error),
            validate: () => ({ npcFound: false, sequences: {} }),
        };
    }
}

function main(): void {
    const referencePath = readArgument("--reference");
    const referenceGit = readArgument("--reference-git");
    const outputPath = path.resolve(readArgument("--output") ?? DEFAULT_OUTPUT);
    const onlyIds = new Set(
        (readArgument("--ids") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
    );
    const includeGeneric = process.argv.includes("--include-generic");
    const cache = loadCacheValidation(process.argv.includes("--no-cache"));
    const august = readJson(DEFAULT_AUGUST_DEFINITIONS).npcs ?? {};
    const referenceSource = loadReference(referencePath, referenceGit);
    const reference = referenceSource.data.npcs ?? {};

    const entries = Object.entries(reference)
        .filter(([id, entry]) => {
            if (onlyIds.size > 0 && !onlyIds.has(id)) return false;
            return hasAnimation(entry.anims) && (includeGeneric || !isGeneric(entry.anims));
        })
        .map(([id, referenceEntry]) => {
            const npcId = Number(id);
            const augustEntry = august[id];
            const referenceAnimations = referenceEntry.anims as Animations;
            const cacheResult = cache.validate(npcId, referenceAnimations);
            const referenceName = normaliseName(referenceEntry.name);
            const cacheName = normaliseName(cacheResult.npcName);
            const sequenceRoles = (["attack", "block", "death"] as const).filter((role) =>
                Number.isInteger(referenceAnimations[role]) && referenceAnimations[role]! >= 0,
            );
            const allSequencesPresent =
                sequenceRoles.length > 0 && sequenceRoles.every((role) => cacheResult.sequences[role] === true);
            const nameMatchesCache =
                !cache.enabled || !referenceName || !cacheName || referenceName === cacheName;
            const action: AuditAction = !augustEntry
                ? "add"
                : matches(augustEntry.anims, referenceAnimations)
                  ? "unchanged"
                  : "replace";

            return {
                npcId,
                name: referenceEntry.name,
                action,
                reference: referenceAnimations,
                august: augustEntry?.anims,
                cache: {
                    npcFound: cacheResult.npcFound,
                    npcName: cacheResult.npcName,
                    nameMatchesReference: nameMatchesCache,
                    sequencesPresent: cacheResult.sequences,
                    allSequencesPresent,
                },
                review: {
                    required: !matches(augustEntry?.anims, referenceAnimations),
                    reason: !cache.enabled
                        ? "Cache validation unavailable; confirm in-game before importing."
                        : !cacheResult.npcFound
                          ? "NPC ID is absent from the local cache."
                          : !nameMatchesCache
                            ? "Reference and local-cache NPC names differ."
                            : !allSequencesPresent
                              ? "At least one referenced sequence is absent from the local cache."
                              : "Reference differs and all candidate sequences exist; verify in-game.",
                },
            };
        })
        .sort((left, right) => {
            const actionRank = { replace: 0, add: 1, unchanged: 2 } as const;
            return actionRank[left.action] - actionRank[right.action] || left.npcId - right.npcId;
        });

    const report = {
        generatedAt: new Date().toISOString(),
        augustDefinitions: DEFAULT_AUGUST_DEFINITIONS,
        referenceDefinitions: referenceSource.source,
        cache: { enabled: cache.enabled, revision: cache.revision, error: cache.error },
        filters: { ids: [...onlyIds], includeGeneric },
        summary: {
            entries: entries.length,
            additions: entries.filter((entry) => entry.action === "add").length,
            replacements: entries.filter((entry) => entry.action === "replace").length,
            unchanged: entries.filter((entry) => entry.action === "unchanged").length,
            readyForInGameReview: entries.filter(
                (entry) => entry.review.required && entry.cache.npcFound && entry.cache.allSequencesPresent,
            ).length,
        },
        entries,
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(
        `[npc-animation-audit] wrote ${entries.length} entries to ${outputPath}; ` +
            `${report.summary.readyForInGameReview} are ready for in-game review.`,
    );
}

main();
