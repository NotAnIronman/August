function normalizePublicBase(value: string | undefined): string {
    return (value ?? "").trim().replace(/\/+$/, "");
}

/** Resolve a file from public/ for both root and sub-path deployments. */
export function getPublicAssetUrl(path: string): string {
    const relativePath = path.trim().replace(/^\/+/, "");
    const publicBase = normalizePublicBase(
        typeof process !== "undefined" && process.env ? process.env.PUBLIC_URL : undefined,
    );
    return publicBase ? `${publicBase}/${relativePath}` : `/${relativePath}`;
}
