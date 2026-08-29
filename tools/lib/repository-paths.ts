import path from "path";

/** Absolute repository paths for maintenance tools; never depend on process.cwd(). */
export const REPOSITORY_ROOT = path.resolve(__dirname, "../..");
export const SERVER_APP_ROOT = path.join(REPOSITORY_ROOT, "apps", "server");
export const CLIENT_APP_ROOT = path.join(REPOSITORY_ROOT, "apps", "client");
export const DATA_ROOT = path.join(REPOSITORY_ROOT, "data");
export const SERVER_GENERATED_DATA_ROOT = path.join(DATA_ROOT, "generated", "server");
export const CACHE_GENERATED_DATA_ROOT = path.join(DATA_ROOT, "generated", "cache");
export const SERVER_CATALOG_ROOT = path.join(DATA_ROOT, "catalogs", "server");
export const GENERATED_REPORT_ROOT = path.join(DATA_ROOT, "generated", "reports");
export const REFERENCE_ROOT = path.join(DATA_ROOT, "references");
export const SERVER_CONTENT_ROOT = path.join(SERVER_APP_ROOT, "src", "content");
export const SERVER_VAR_ROOT = path.join(SERVER_APP_ROOT, "var");

export function repositoryPath(...parts: string[]): string {
    return path.join(REPOSITORY_ROOT, ...parts);
}

export function serverAppPath(...parts: string[]): string {
    return path.join(SERVER_APP_ROOT, ...parts);
}

export function clientAppPath(...parts: string[]): string {
    return path.join(CLIENT_APP_ROOT, ...parts);
}

export function serverGeneratedDataPath(...parts: string[]): string {
    return path.join(SERVER_GENERATED_DATA_ROOT, ...parts);
}

export function cacheGeneratedDataPath(...parts: string[]): string {
    return path.join(CACHE_GENERATED_DATA_ROOT, ...parts);
}

export function serverCatalogPath(...parts: string[]): string {
    return path.join(SERVER_CATALOG_ROOT, ...parts);
}

export function generatedReportPath(...parts: string[]): string {
    return path.join(GENERATED_REPORT_ROOT, ...parts);
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
