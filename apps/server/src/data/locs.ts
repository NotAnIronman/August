import fs from "fs";

import { serverGeneratedDataPath } from "@server/paths";

export interface LocDefinition {
    id: number;
    name: string;
    examine: string;
    actions?: (string | null)[];
}

const LOCS_PATH = serverGeneratedDataPath("locs.json");

let cachedLocs: LocDefinition[] | undefined;
let cachedLocsById: Map<number, LocDefinition> | undefined;

export function loadLocDefinitions(): LocDefinition[] {
    if (!cachedLocs) {
        if (!fs.existsSync(LOCS_PATH)) {
            cachedLocs = [];
            cachedLocsById = new Map();
            return cachedLocs;
        }
        const text = fs.readFileSync(LOCS_PATH, "utf8");
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            throw new Error("locs.json must be an array");
        }
        cachedLocs = parsed as LocDefinition[];
        cachedLocsById = new Map(cachedLocs.map((l) => [l.id, l]));
    }
    return cachedLocs;
}

export function getLocDefinition(locId: number): LocDefinition | undefined {
    if (!cachedLocsById) loadLocDefinitions();
    return cachedLocsById?.get(locId);
}

/** Convenience: examine text for this loc id, or undefined if none/blank. */
export function getLocExamine(locId: number): string | undefined {
    const text = getLocDefinition(locId)?.examine;
    return text && text.length > 0 ? text : undefined;
}
