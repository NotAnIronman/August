/**
 * A two-dimensional canvas that can be drawn by the browser's main thread.
 *
 * OffscreenCanvas is preferable for caches, but it is not available in every
 * browser supported by the client. Keeping the capability check here prevents
 * individual UI systems from growing their own incomplete fallback paths.
 */
export type CanvasSurface = OffscreenCanvas | HTMLCanvasElement;
export type CanvasSurfaceContext =
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D;

export type CanvasSurface2D = {
    canvas: CanvasSurface;
    context: CanvasSurfaceContext;
};

function normalizeDimension(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.floor(value));
}

export function createCanvasSurface2D(width: number, height: number): CanvasSurface2D | undefined {
    const safeWidth = normalizeDimension(width);
    const safeHeight = normalizeDimension(height);

    if (typeof OffscreenCanvas !== "undefined") {
        try {
            const canvas = new OffscreenCanvas(safeWidth, safeHeight);
            const context = canvas.getContext("2d");
            if (context) return { canvas, context };
        } catch {
            // Some browsers expose OffscreenCanvas but reject 2D contexts.
        }
    }

    if (typeof document === "undefined") return undefined;
    try {
        const canvas = document.createElement("canvas");
        canvas.width = safeWidth;
        canvas.height = safeHeight;
        const context = canvas.getContext("2d");
        return context ? { canvas, context } : undefined;
    } catch {
        return undefined;
    }
}
