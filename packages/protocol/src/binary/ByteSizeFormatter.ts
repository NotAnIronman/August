export function formatBytes(bytes: number, decimals: number = 2): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 Bytes";
    }

    const k = 1024;
    const dm = Number.isFinite(decimals) ? Math.min(100, Math.max(0, Math.trunc(decimals))) : 2;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    const i = Math.max(
        0,
        Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1),
    );

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
