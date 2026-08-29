import path from "path";

/** Absolute path to the `@august/server` package root. */
export const SERVER_ROOT = path.resolve(__dirname, "..");

/** Absolute path to the monorepo root. */
export const REPOSITORY_ROOT = path.resolve(SERVER_ROOT, "../..");

/** Absolute path to the browser application. */
export const CLIENT_ROOT = path.join(REPOSITORY_ROOT, "apps", "client");

/** Source-controlled data boundaries. */
export const DATA_ROOT = path.join(REPOSITORY_ROOT, "data");
export const SERVER_GENERATED_DATA_ROOT = path.join(DATA_ROOT, "generated", "server");
export const GENERATED_REPORT_ROOT = path.join(DATA_ROOT, "generated", "reports");
export const SERVER_CATALOG_ROOT = path.join(DATA_ROOT, "catalogs", "server");
export const CLIENT_CATALOG_ROOT = path.join(DATA_ROOT, "catalogs", "client");
export const REFERENCE_ROOT = path.join(DATA_ROOT, "references");

/** Server-owned content and mutable runtime-state boundaries. */
export const SERVER_CONTENT_ROOT = path.join(SERVER_ROOT, "src", "content");
export const SERVER_VAR_ROOT = path.join(SERVER_ROOT, "var");

export function serverPath(...parts: string[]): string {
    return path.join(SERVER_ROOT, ...parts);
}

export function clientPath(...parts: string[]): string {
    return path.join(CLIENT_ROOT, ...parts);
}

export function repositoryPath(...parts: string[]): string {
    return path.join(REPOSITORY_ROOT, ...parts);
}

export function serverGeneratedDataPath(...parts: string[]): string {
    return path.join(SERVER_GENERATED_DATA_ROOT, ...parts);
}

export function generatedReportPath(...parts: string[]): string {
    return path.join(GENERATED_REPORT_ROOT, ...parts);
}

export function serverCatalogPath(...parts: string[]): string {
    return path.join(SERVER_CATALOG_ROOT, ...parts);
}

export function clientCatalogPath(...parts: string[]): string {
    return path.join(CLIENT_CATALOG_ROOT, ...parts);
}

export function referencePath(...parts: string[]): string {
    return path.join(REFERENCE_ROOT, ...parts);
}

export function serverContentPath(...parts: string[]): string {
    return path.join(SERVER_CONTENT_ROOT, ...parts);
}

export function serverVarPath(...parts: string[]): string {
    return path.join(SERVER_VAR_ROOT, ...parts);
}
