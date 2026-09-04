/**
 * Owner: vanilla Thieving NPC catalog. Read-only; prints JSON, never edits catalogs.
 * Snapshot: node tools/node_modules/tsx/dist/cli.mjs --tsconfig tools/tsconfig.json tools/diagnostics/audit-pickpocket-npcs.ts
 * Raw: append --cache-root=<cache-root> --cache-name=<name> --require-morphs
 * Snapshot cannot prove morph completeness. Raw mode decodes every config file,
 * including null-name parents, and follows transitive morph edges without assigning
 * parent behavior from names or copying one child's reward to all parent states.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PICKPOCKET_NPCS, PICKPOCKET_MORPH_PARENTS, COIN_POUCH_VALUES } from "@server/content/gamemodes/vanilla/skills/thieving/pickpocketDefinitions";
import type { PickpocketNpcDef } from "@server/content/gamemodes/vanilla/skills/thieving/pickpocketDefinitions";
import { repositoryPath } from "@tools/lib/repository-paths";

export interface AuditNpc {
    id: number;
    name: string;
    actions?: readonly (string | null | undefined)[];
    transforms?: readonly number[];
    transformVarbit?: number;
    transformVarp?: number;
}

const hasPickpocket = (npc: AuditNpc) => npc.actions?.some(a => a?.trim().toLowerCase() === "pickpocket") ?? false;

export function auditPickpocketNpcs(npcs: readonly AuditNpc[], definitions: readonly PickpocketNpcDef[], morphComplete = false) {
    const byId = new Map<number, AuditNpc>();
    const inputDuplicates: number[] = [];
    for (const npc of npcs) {
        if (!Number.isInteger(npc.id) || npc.id < 0 || typeof npc.name !== "string") throw new Error("Invalid NPC input");
        if (byId.has(npc.id)) inputDuplicates.push(npc.id);
        byId.set(npc.id, npc);
    }
    if (!npcs.length) throw new Error("Refusing empty NPC audit input");
    const assignments = new Map<number, PickpocketNpcDef>();
    const duplicateAssignments: number[] = [];
    const invalidDefinitions: string[] = [];
    for (const def of definitions) {
        if (!def.npcIds.length) invalidDefinitions.push(`${def.displayName}: empty IDs`);
        if (!Number.isInteger(def.reqLevel) || def.reqLevel < 1 || def.reqLevel > 99 || !Number.isFinite(def.xp) || def.xp < 0) invalidDefinitions.push(`${def.displayName}: level/XP`);
        if (!Number.isInteger(def.stunTicks) || def.stunTicks < 0 || def.minDamage < 0 || def.maxDamage < def.minDamage) invalidDefinitions.push(`${def.displayName}: failure values`);
        if ((def.lowChance === undefined) !== (def.highChance === undefined)) invalidDefinitions.push(`${def.displayName}: incomplete chance curve`);
        if (!def.disabledReason && !def.lootTable.length && !def.guaranteedLoot?.length) invalidDefinitions.push(`${def.displayName}: no rewards`);
        for (const entry of [...def.lootTable, ...(def.guaranteedLoot ?? [])]) {
            if (!Number.isInteger(entry.itemId) || entry.itemId < 0 || !Number.isInteger(entry.minAmount) || entry.minAmount < 1 || !Number.isInteger(entry.maxAmount) || entry.maxAmount < entry.minAmount || !Number.isFinite(entry.weight) || entry.weight <= 0) invalidDefinitions.push(`${def.displayName}: invalid loot ${entry.itemId}`);
        }
        if (def.coinPouchId !== undefined && !COIN_POUCH_VALUES[def.coinPouchId]) invalidDefinitions.push(`${def.displayName}: unknown pouch ${def.coinPouchId}`);
        for (const id of def.npcIds) {
            if (!Number.isInteger(id) || id < 0) invalidDefinitions.push(`${def.displayName}: invalid NPC ID ${id}`);
            if (assignments.has(id)) duplicateAssignments.push(id);
            assignments.set(id, def);
        }
    }
    const direct = npcs.filter(hasPickpocket).sort((a, b) => a.id - b.id);
    const directIds = new Set(direct.map(n => n.id));
    // Per-root traversal deliberately handles cycles without memoizing incomplete paths.
    const reachable = (id: number, visited = new Set<number>()): Set<number> => {
        if (visited.has(id)) return new Set();
        visited.add(id);
        const found = new Set<number>(directIds.has(id) ? [id] : []);
        for (const child of byId.get(id)?.transforms ?? []) {
            if (child >= 0) for (const target of reachable(child, visited)) found.add(target);
        }
        return found;
    };
    const unresolvedMorphEdges: { parent: number; child: number }[] = [];
    for (const npc of npcs) for (const child of npc.transforms ?? []) {
        if (child >= 0 && !byId.has(child)) unresolvedMorphEdges.push({ parent: npc.id, child });
    }
    const morphParents = npcs.filter(n => n.transforms?.some(id => id >= 0)).map(n => ({
        id: n.id, name: n.name, varbit: n.transformVarbit, varp: n.transformVarp,
        children: [...(n.transforms ?? [])], pickpocketDescendants: [...reachable(n.id)].sort((a, b) => a - b),
    })).filter(n => n.pickpocketDescendants.length).sort((a, b) => a.id - b.id);
    const parentIds = new Set(morphParents.map(n => n.id));
    const declaredParents = new Set(PICKPOCKET_MORPH_PARENTS.map(n => n.id));
    const rows = direct.map(n => ({ id: n.id, name: n.name,
        family: assignments.get(n.id)?.displayName ?? null,
        status: !assignments.has(n.id) ? "missing" : assignments.get(n.id)?.disabledReason ? "disabled" : "enabled",
    }));
    const missing = rows.filter(r => r.status === "missing").map(r => r.id);
    const invalidIds = [...assignments.keys()].filter(id => !directIds.has(id) && !parentIds.has(id) && (morphComplete || !declaredParents.has(id))).sort((a, b) => a - b);
    const unclassifiedMorphParents = morphParents.filter(p => p.pickpocketDescendants.some(id => !assignments.has(id))).map(p => p.id);
    const eligibleIds = new Set([...directIds, ...parentIds]);
    const unsafeParentAssignments = morphParents.filter(p => {
        const def = assignments.get(p.id);
        return def && !def.disabledReason && (!directIds.has(p.id) || p.children.some(child => child < 0 || !directIds.has(child)) || p.pickpocketDescendants.some(id => assignments.get(id) !== def));
    }).map(p => p.id);
    const families = definitions.map(d => ({ name: d.displayName ?? "Unnamed", ids: [...d.npcIds].sort((a,b) => a-b),
        level: d.reqLevel, xp: d.xp, damage: [d.minDamage, d.maxDamage], stunTicks: d.stunTicks,
        coinPouchId: d.coinPouchId, lowChance: d.lowChance, highChance: d.highChance,
        requiredQuest: d.requiredQuest, disabledReason: d.disabledReason,
        loot: d.lootTable, guaranteedLoot: d.guaranteedLoot, failure: d.failure,
        successDamage: d.successDamage, failureChat: d.failureChat,
        lootEvidence: d.lootEvidence, chanceEvidence: d.chanceEvidence,
        requirementEvidence: d.requirementEvidence, failureEvidence: d.failureEvidence,
    })).sort((a, b) => a.ids[0] - b.ids[0]);
    return { summary: {
        npcRecords: npcs.length, directPickpocketIds: direct.length, definitionGroups: definitions.length,
        assignedIds: assignments.size,
        enabledIds: [...eligibleIds].filter(id => assignments.has(id) && !assignments.get(id)?.disabledReason).length,
        disabledIds: [...eligibleIds].filter(id => !!assignments.get(id)?.disabledReason).length, missingIds: missing.length,
        directEnabledIds: rows.filter(r => r.status === "enabled").length,
        directDisabledIds: rows.filter(r => r.status === "disabled").length,
        eligibleIds: eligibleIds.size, unclassifiedMorphParents: unclassifiedMorphParents.length,
        dynamicallyResolvedParents: morphParents.length - unclassifiedMorphParents.length,
        classifiedIds: [...eligibleIds].filter(id => assignments.has(id) || (parentIds.has(id) && !unclassifiedMorphParents.includes(id))).length,
        morphCoverage: morphComplete && !unresolvedMorphEdges.length ? "complete" : "unverified",
        morphParents: morphParents.length,
    }, missing, invalidIds, inputDuplicates, duplicateAssignments, invalidDefinitions,
        unsafeParentAssignments, unclassifiedMorphParents, unresolvedMorphEdges, morphParents, rows, families };
}

export async function readRawNpcs(root: string, name?: string): Promise<{ npcs: AuditNpc[]; revision: number; cacheName: string }> {
    const [{ CacheFiles }, { CacheSystem }, { detectCacheType }, { getCacheLoaderFactory }, { loadDat2CacheFiles }, { NpcType }] = await Promise.all([
        import("@august/osrs-engine/cache/CacheFiles"), import("@august/osrs-engine/cache/CacheSystem"),
        import("@august/osrs-engine/cache/CacheType"), import("@august/osrs-engine/cache/loader/CacheLoaderFactory"),
        import("@server/world/cacheFs"), import("@august/osrs-engine/config/npctype/NpcType"),
    ]);
    const infos = JSON.parse(readFileSync(path.join(root, "caches.json"), "utf8"));
    const info = name ? infos.find((i: { name: string }) => i.name === name) : infos[0];
    if (!info || !Number.isInteger(info.revision)) throw new Error("Cache manifest must contain selected cache and revision");
    const system = CacheSystem.fromFiles(detectCacheType(info), new CacheFiles(loadDat2CacheFiles({ rootDir: root, name: info.name })));
    const loader = getCacheLoaderFactory(info, system).getNpcTypeLoader();
    // getCount() may mean file count, not highest ID+1 in a sparse archive.
    const raw = loader as typeof loader & { archive?: { fileIds: Int32Array }; getDataBuffer(id: number): import("@august/osrs-engine/io/ByteBuffer").ByteBuffer | undefined };
    const ids = raw.archive ? [...raw.archive.fileIds] : Array.from({ length: loader.getCount() }, (_, i) => i);
    const npcs: AuditNpc[] = [];
    for (const id of ids) {
        const buffer = raw.getDataBuffer(id);
        if (!buffer) continue;
        // Decode directly: BaseTypeLoader.load catches decode errors and could hide an incomplete audit.
        const npc = new NpcType(id, info);
        npc.decode(buffer);
        npc.post();
        npcs.push({ id, name: npc.name, actions: npc.actions, transforms: npc.transforms ? [...npc.transforms] : [], transformVarbit: npc.transformVarbit, transformVarp: npc.transformVarp });
    }
    return { npcs, revision: info.revision, cacheName: info.name };
}

export function renderPickpocketReport(audit: ReturnType<typeof auditPickpocketNpcs>, provenance: Record<string, unknown>): string {
    const lines = ["# Thieving NPC catalog audit", "", "Owner: vanilla Thieving. Review artifact; never a runtime input.", "",
        "## Provenance", "", ...Object.entries(provenance).filter(([,v]) => v !== null).map(([k,v]) => `- ${k}: ${String(v)}`), "",
        "## Coverage", "", ...Object.entries(audit.summary).map(([k,v]) => `- ${k}: ${v}`), "",
        "Missing literal IDs: " + (audit.missing.join(", ") || "none"),
        "Unclassified morph parents: " + (audit.unclassifiedMorphParents.join(", ") || "none"),
        "Invalid IDs: " + (audit.invalidIds.join(", ") || "none"),
        "Duplicate assignments: " + (audit.duplicateAssignments.join(", ") || "none"),
        "Unsafe parent assignments: " + (audit.unsafeParentAssignments.join(", ") || "none"),
        "Unresolved morph edges: " + audit.unresolvedMorphEdges.length, "",
        "The original catalog registered 231 IDs. The named snapshot exposed 474 actions; raw r237 has 475, including unnamed Fenkenstrain parent 1955. The 57 morph parents overlap literal IDs once, so the union is 531. Counts are catalog coverage, not a claim that every quest, special reward or presentation behavior is implemented.", "",
        "## Corrected existing data", "",
        "- Both H.A.M. forms: level 15, 22.2 XP. Gnome 133.3 XP, Paladin 131.8 XP, Hero 163.3 XP / 3 damage; Rogue 36.5 XP, desert bandit 79.4 XP, TzHaar-Hur 103.4 XP.",
        "- Watchman always awards 60 coins AND bread; Paladin always awards 80 coins AND two chaos runes. Guaranteed loot is separate from weighted selection.",
        "- Pouch IDs were shifted after Farmer: HAM 22523, Warrior 22524, Rogue 22525, Cave goblin 22526, Guard 22527, Fremennik 22528, bearded bandit 22529, desert bandit 22530, Knight 22531, nonbearded bandit 22532, Watchman 22533, Menaphite 22534, Paladin 22535, Gnome 22536, Hero 22537, Elf 22538, Vyre 24703, Wealthy citizen 28822, Pirate 32895. TzHaar has no pouch. Source: [Coin pouch](https://oldschool.runescape.wiki/w/Coin_pouch) and generated server item examine strings.",
        "- Rogue: remove gold bar, 25-40 coins and exact 144-slot weights. Gnome: restore arrow shafts / 128-slot weights. Cave goblin: restore wire 10981 and swamp tar, 10-50 coins / 20-slot table. Desert bandit: Antipoison(1) 179 and 5:1:1 weights. TzHaar: 3-7 Tokkul / 195-slot weights.",
        "- Cave goblin food identity corrected against server item definitions: green gloop soup 10960, frogspawn gumbo 10961, frogburger 10962, coated frogs' legs 10963, bat shish 10964, fingers 10965. Old food IDs accidentally included grubs la mode, mushrooms and loach.",
        "- Master Farmer: 45 seeds including snape grass, seaweed and potato cactus; hop quantities corrected. Rounded Farming-85 frequencies remain explicitly provisional, not a replacement for Farming-level scaling.", "",
        "## NPC families and all explicit IDs", "",
        "Chance columns are Wiki endpoints at levels 1 and 99. Runtime uses round-half-up combined interpolation plus one, divided by 256; bonus endpoint truncation precedes interpolation. Missing curves retain a provisional runtime fallback. Stun ticks are action timing, not automatically identical to rounded Wiki seconds.", "",
        "| Family | Exact IDs | Level / XP | Failure damage / ticks | Curve | Pouch | Status |",
        "| --- | --- | --- | --- | --- | --- | --- |"];
    const parents = new Set(PICKPOCKET_MORPH_PARENTS.map(p => p.id));
    const ordinary = audit.families.filter(f => !f.ids.every(id => parents.has(id)));
    for (const f of ordinary) lines.push(`| [${f.name}](${f.requirementEvidence?.source}) | ${f.ids.join(", ")} | ${f.level} / ${f.xp} | ${f.damage.join("-")} / ${f.stunTicks} | ${f.lowChance === undefined ? "provisional" : `${f.lowChance}, ${f.highChance}`} | ${f.coinPouchId ?? "direct"} | ${f.disabledReason ? "disabled" : "enabled"} |`);
    lines.push("", "## Loot, gating, and failure evidence by family", "", "Loot notation: item ID × amount @ relative weight. Weighted entries select ONE reward; guaranteed entries all apply. Weights are not independent probabilities. Evidence labels distinguish verified ordinary tables from provisional/missing special rolls.", "");
    for (const f of ordinary) {
        const lootText = (entries: typeof f.loot) => entries.map(e => `${e.itemId} × ${e.minAmount === e.maxAmount ? e.minAmount : `${e.minAmount}-${e.maxAmount}`} @ ${Number(e.weight.toPrecision(8))}`).join("; ");
        lines.push(`### ${f.name} (${f.ids[0]})`, "",
            `Weighted: ${lootText(f.loot) || "none"}.`,
            `Guaranteed: ${lootText(f.guaranteedLoot ?? []) || "none"}.`);
        if (f.disabledReason) lines.push(`Disabled: ${f.disabledReason}`);
        if (f.requiredQuest) lines.push(`Required completed internal quest: ${f.requiredQuest}.`);
        if (f.successDamage) lines.push(`Success damage: ${JSON.stringify(f.successDamage)}.`);
        if (f.failure?.kind !== "stun") lines.push(`Failure policy: ${JSON.stringify(f.failure)}.`);
        for (const [label, ev] of [["Loot", f.lootEvidence], ["Chance", f.chanceEvidence], ["Requirement", f.requirementEvidence], ["Failure", f.failureEvidence]] as const) {
            if (ev) lines.push(`${label}: [${ev.status}](${ev.source})${ev.notes ? "; " + ev.notes : ""}.`);
        }
        lines.push("");
    }
    lines.push("## All morph parents", "", "Parents are classified dynamically resolved when all reachable Pickpocket definitions are mapped, including explicit unsupported children. This does not mean every child is enabled. Runtime must resolve the player's current transformed ID and revalidate its action before lookup; there are no unconditional parent aliases. Targets include non-Pickpocket states. Repeated selector-array values are deduplicated here; raw JSON preserves complete indexed arrays.", "",
        "| Parent | Varbit | Varp | All nonnegative targets | Pickpocket descendants |", "| --- | --- | --- | --- | --- |");
    for (const p of audit.morphParents) lines.push(`| ${p.id} | ${p.varbit} | ${p.varp} | ${[...new Set(p.children.filter(id => id >= 0))].join(", ")} | ${p.pickpocketDescendants.join(", ")} |`);
    lines.push("", "## Remaining integration work", "",
        "- Resolve morphs per player before lookup and at resolution time. Some parents have hidden states and different non-thieving children. 1955 has a literal action despite its null name; 6138 has non-pickpocket target 3549 as well as 3550.",
        "- Keep ordinary elf/vyre/TzHaar/wealthy-citizen loot enabled. Entrance progression belongs to area integration. Add conditional rare pre-rolls, clues/pets and distractions using each family's evidence; do not flatten independent or ordered rolls into arbitrary weights.",
        "- H.A.M. three-concussion/Agility model uses one documented outside tile. Jail-vs-outside split, clothing reduction and exact reset bounds remain provisional. Coordinate any jail destination with an escape handler.",
        "- Cave goblin guard IDs 2316/2317 are verified; alert probability/radius are not. TzHaar combat assistance is not evidence of pickpocket guard calls. Nonhuman failure animations and NPC-specific overhead chat remain unverified.",
        "- Quest-only thefts, villagers, builder special rewards, head guards and unidentified priests remain explicit unsupported catalog entries; preserve exact context rather than assigning a same-name family's table.",
        "- Raw decoding validates action/transform identity, not server-side XP, loot odds or quest scripts. Wiki was fetched through the approved public API because browser access was blocked; per-NPC pages supersede the stale general Thieving table and historical charts.", "");
    return lines.join("\n") + "\n";
}

async function main() {
    const args = process.argv.slice(2);
    const value = (key: string) => args.find(a => a.startsWith(key + "="))?.slice(key.length + 1);
    const snapshotPath = value("--snapshot") ?? repositoryPath("data/generated/cache/npcs.json");
    const cacheRoot = value("--cache-root");
    const raw = cacheRoot ? await readRawNpcs(cacheRoot, value("--cache-name")) : undefined;
    const bytes = raw ? undefined : readFileSync(snapshotPath);
    const npcs = raw?.npcs ?? JSON.parse(bytes!.toString("utf8"));
    const audit = auditPickpocketNpcs(npcs, PICKPOCKET_NPCS, !!raw);
    const definitionsPath = repositoryPath("apps/server/src/content/gamemodes/vanilla/skills/thieving/pickpocketDefinitions.ts");
    const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
    const provenance = {
        owner: "vanilla-thieving-npc-catalog", consumer: "NPC catalog review; not runtime input",
        generator: "tools/diagnostics/audit-pickpocket-npcs.ts", generatorSha256: sha256(readFileSync(repositoryPath("tools/diagnostics/audit-pickpocket-npcs.ts"))),
        command: "node tools/node_modules/tsx/dist/cli.mjs --tsconfig tools/tsconfig.json tools/diagnostics/audit-pickpocket-npcs.ts" + (cacheRoot ? ` --cache-root=${cacheRoot} --cache-name=${raw!.cacheName} --require-morphs` : "") + (value("--as-of") ? ` --as-of=${value("--as-of")}` : "") + (args.includes("--markdown") ? " --markdown" : ""),
        generatedAt: value("--as-of") ?? null,
        input: raw ? "raw-cache" : path.relative(repositoryPath(), snapshotPath).replace(/\\/g, "/"),
        inputSha256: sha256(bytes ?? JSON.stringify(npcs)), definitionsSha256: sha256(readFileSync(definitionsPath)),
        revision: raw?.revision ?? null, cacheName: raw?.cacheName ?? null,
        snapshotLimitation: raw ? null : "Export contains named NPCs/actions only; cache revision and morph parents cannot be established from this input.",
        retention: "Regenerate when NPC cache or definitions change; replace previous audit after review.",
        license: "Project cache-derived IDs/actions; linked OSRS Wiki evidence is CC BY-NC-SA 3.0, no article text copied.",
    };
    if (args.includes("--markdown")) console.log(renderPickpocketReport(audit, provenance));
    else console.log(JSON.stringify({ provenance, ...(args.includes("--summary") ? { ...audit, rows: undefined, families: undefined, morphParents: audit.morphParents.map(p => ({ ...p, children: [...new Set(p.children)] })) } : audit) }, null, args.includes("--compact") ? undefined : 2));
    if (audit.missing.length || audit.invalidIds.length || audit.inputDuplicates.length || audit.duplicateAssignments.length || audit.invalidDefinitions.length || audit.unsafeParentAssignments.length || audit.unclassifiedMorphParents.length || audit.unresolvedMorphEdges.length || (args.includes("--require-morphs") && audit.summary.morphCoverage !== "complete")) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === repositoryPath("tools/diagnostics/audit-pickpocket-npcs.ts")) {
    main().catch(error => { console.error(error); process.exitCode = 1; });
}
