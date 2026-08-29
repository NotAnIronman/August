import fs from "fs";

import { serverGeneratedDataPath } from "@server/paths";

export interface NpcDefinition {
    id: number;
    name: string;
    examine: string;
    actions?: (string | null)[];
}

const NPCS_PATH = serverGeneratedDataPath("npcs.json");

let cachedNpcs: NpcDefinition[] | undefined;
let cachedNpcsById: Map<number, NpcDefinition> | undefined;

export function loadNpcDefinitions(): NpcDefinition[] {
    if (!cachedNpcs) {
        if (!fs.existsSync(NPCS_PATH)) {
            cachedNpcs = [];
            cachedNpcsById = new Map();
            return cachedNpcs;
        }
        const text = fs.readFileSync(NPCS_PATH, "utf8");
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            throw new Error("npcs.json must be an array");
        }
        cachedNpcs = parsed as NpcDefinition[];
        cachedNpcsById = new Map(cachedNpcs.map((n) => [n.id, n]));
    }
    return cachedNpcs;
}

export function getNpcDefinition(npcId: number): NpcDefinition | undefined {
    if (!cachedNpcsById) loadNpcDefinitions();
    return cachedNpcsById?.get(npcId);
}

/** Convenience: examine text for this npc id, or undefined if none/blank. */
export function getNpcExamine(npcId: number): string | undefined {
    const text = getNpcDefinition(npcId)?.examine;
    return text && text.length > 0 ? text : undefined;
}
