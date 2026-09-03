import {
    getCanvasCssSize,
    invalidateCanvasCssSize,
} from "@client/core/platform/device/DeviceUtil";
import { RenderStats } from "@client/engine/rendering/core/RenderStats";

function isResizeDebug(): boolean {
    try {
        return window.__RESIZE_DEBUG__ === true;
    } catch {
        return false;
    }
}

function resizeCanvas(renderer: Renderer) {
    const canvas = renderer.canvas;
    const { width: cssW, height: cssH } = getCanvasCssSize(canvas);
    const resolutionScale = renderer.getCanvasResolutionScale(cssW, cssH);
    const safeResolutionScale =
        Number.isFinite(resolutionScale) && resolutionScale > 0 ? resolutionScale : 1;
    const width = Math.max(1, Math.round(cssW * safeResolutionScale));
    const height = Math.max(1, Math.round(cssH * safeResolutionScale));

    const changed = canvas.width !== width || canvas.height !== height;
    if (changed && isResizeDebug()) {
        // eslint-disable-next-line no-console
        console.log(
            `[resize] measure -> css=${Math.round(cssW)}x${Math.round(cssH)} ` +
                `canvas=${width}x${height} prev=${canvas.width}x${canvas.height}`,
        );
    }

    if (changed) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }

    return false;
}

export abstract class Renderer {
    canvas: HTMLCanvasElement;
    animationId: number | undefined;
    running: boolean = false;

    fpsLimit: number = 120;

    stats: RenderStats = new RenderStats();

    private _resizeObs?: ResizeObserver;
    private _timeoutId?: ReturnType<typeof setTimeout>;
    private _initPromise?: Promise<void>;
    private _disposed: boolean = false;
    private _useTimeout: boolean = false;
    private _framePacingDebtMs: number = 0;
    private _framesUntilResizePoll: number = 0;
    private _lastDevicePixelRatio: number = 0;

    private static readonly RESIZE_FALLBACK_POLL_FRAMES = 60;

    constructor() {
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.tabIndex = 0;
    }

    abstract init(): Promise<void>;

    initOnce(): Promise<void> {
        if (!this._initPromise) {
            const initPromise = this.init();
            this._initPromise = initPromise;
            // A renderer can be disposed while asynchronous shader/texture setup is
            // still running. Clean up once more after that setup settles so resources
            // created after the initial dispose() call cannot survive unmount/HMR.
            void initPromise.then(
                () => {
                    if (this._disposed) this.stop();
                },
                () => {
                    if (this._disposed) this.stop();
                },
            );
        }
        return this._initPromise;
    }

    abstract cleanUp(): void;

    start() {
        if (this.running || this._disposed) return;
        this.running = true;
        this._framePacingDebtMs = 0;
        this._updateVisibilityMode();
        this._scheduleNextFrame();
        if (this.runInBackground) {
            document.addEventListener("visibilitychange", this._onVisibilityChange);
        }
    }

    stop() {
        this.running = false;
        this._framePacingDebtMs = 0;
        document.removeEventListener("visibilitychange", this._onVisibilityChange);
        if (this.animationId !== undefined) {
            cancelAnimationFrame(this.animationId);
            this.animationId = undefined;
        }
        if (this._timeoutId !== undefined) {
            clearTimeout(this._timeoutId);
            this._timeoutId = undefined;
        }
        this.cleanUp();
        // Disconnect observer if attached
        try {
            this._resizeObs?.disconnect();
            this._resizeObs = undefined;
        } catch {}
    }

    /** Permanently stop this renderer and release resources, including late async init work. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.stop();
    }

    private _onVisibilityChange = () => {
        if (!this.running || !this.runInBackground) return;
        const wasTimeout = this._useTimeout;
        this._updateVisibilityMode();
        // If switching from timeout to RAF, cancel timeout and start RAF
        if (wasTimeout && !this._useTimeout) {
            if (this._timeoutId !== undefined) {
                clearTimeout(this._timeoutId);
                this._timeoutId = undefined;
            }
            this._scheduleNextFrame();
        }
        // If switching from RAF to timeout, cancel RAF and start timeout
        else if (!wasTimeout && this._useTimeout) {
            if (this.animationId !== undefined) {
                cancelAnimationFrame(this.animationId);
                this.animationId = undefined;
            }
            this._scheduleNextFrame();
        }
    };

    private _updateVisibilityMode() {
        this._useTimeout = this.runInBackground && document.hidden;
    }

    private _recordSchedulerCallback(
        time: DOMHighResTimeStamp,
        viaTimeout: boolean,
        fpsLimit: number,
    ) {
        const budgetMs = fpsLimit > 0 ? 1000 / fpsLimit : 0;
        this.stats.noteFrameCallback(time, { viaTimeout, frameBudgetMs: budgetMs });
    }

    protected getEffectiveFpsLimit(): number {
        const raw = Number(this.fpsLimit);
        if (!Number.isFinite(raw)) return 0;
        const limit = raw | 0;
        return limit > 0 ? limit : 0;
    }

    private _scheduleNextFrame() {
        if (!this.running) return;
        const fpsLimit = this.getEffectiveFpsLimit();
        if (this._useTimeout) {
            const targetMs = fpsLimit > 0 ? 1000 / fpsLimit : 16;
            this._timeoutId = setTimeout(() => {
                this._timeoutId = undefined;
                this.frameCallback(performance.now());
            }, targetMs);
        } else {
            this.animationId = requestAnimationFrame(this.frameCallback);
        }
    }

    private _readDevicePixelRatio(): number {
        try {
            const value = window.devicePixelRatio;
            return Number.isFinite(value) && value > 0 ? value : 1;
        } catch {
            return 1;
        }
    }

    private _resizeForFrame(): boolean {
        const devicePixelRatio = this._readDevicePixelRatio();
        const deviceScaleChanged = devicePixelRatio !== this._lastDevicePixelRatio;
        this._lastDevicePixelRatio = devicePixelRatio;

        // ResizeObserver handles ordinary layout changes immediately. Poll at a
        // low cadence as a safety net for DPR, browser zoom, and older WebViews.
        if (
            this._resizeObs &&
            !deviceScaleChanged &&
            this._framesUntilResizePoll > 0
        ) {
            this._framesUntilResizePoll--;
            return false;
        }

        this._framesUntilResizePoll = Renderer.RESIZE_FALLBACK_POLL_FRAMES;
        invalidateCanvasCssSize(this.canvas);
        return resizeCanvas(this);
    }

    onResize(width: number, height: number) {}

    /**
     * Return the internal backing-store scale for the canvas.
     * Default is CSS pixel parity; renderers can override for HiDPI paths.
     */
    getCanvasResolutionScale(_cssWidth: number, _cssHeight: number): number {
        return 1;
    }

    // Public hook for hosts/observers to force size check immediately (no RAF delay)
    forceResize = () => {
        invalidateCanvasCssSize(this.canvas);
        const resized = resizeCanvas(this);
        this._framesUntilResizePoll = Renderer.RESIZE_FALLBACK_POLL_FRAMES;
        this._lastDevicePixelRatio = this._readDevicePixelRatio();
        if (isResizeDebug()) {
            // eslint-disable-next-line no-console
            console.log(
                `[resize] forceResize running=${this.running} -> ${this.canvas.width}x${this.canvas.height}`,
            );
        }
        // Always call onResize if dimensions changed, even before running
        // This ensures WebGL resources are sized correctly during init
        if (resized) {
            this.onResize(this.canvas.width, this.canvas.height);
        }
    };

    frameCallback = (time: DOMHighResTimeStamp) => {
        // Queue the following callback before doing any frame work. At high
        // refresh rates, scheduling only after rendering can miss the
        // compositor's next-frame deadline even when the render itself is
        // short, producing an avoidable 60–90 Hz callback cadence.
        if (this.running) {
            this._scheduleNextFrame();
        }
        try {
            if (this.shouldSkipFrame(time)) {
                return;
            }

            const fpsLimit = this.getEffectiveFpsLimit();
            const usingTimeoutScheduler = this._useTimeout;
            this._recordSchedulerCallback(time, usingTimeoutScheduler, fpsLimit);

            const resized = this._resizeForFrame();
            if (resized) {
                if (isResizeDebug()) {
                    // eslint-disable-next-line no-console
                    console.log(`[resize] raf -> ${this.canvas.width}x${this.canvas.height}`);
                }
                this.onResize(this.canvas.width, this.canvas.height);
            }

            const deltaTime = this.stats.getDeltaTime(time);

            if (usingTimeoutScheduler) {
                this._framePacingDebtMs = 0;
            }

            // Pace capped rendering from raw callback cadence rather than rendered-frame delta.
            // This avoids 90Hz->60fps aliasing without depending on foreground setTimeout timers.
            if (!usingTimeoutScheduler && fpsLimit > 0 && this.stats.lastFrameTime !== undefined) {
                const frameBudgetMs = 1000 / fpsLimit;
                const callbackDeltaMs = Math.max(0, this.stats.callbackDeltaMs);
                this._framePacingDebtMs = Math.min(
                    frameBudgetMs * 2,
                    this._framePacingDebtMs + callbackDeltaMs,
                );
                if (this._framePacingDebtMs < frameBudgetMs) {
                    this.stats.noteLimiterSkip(frameBudgetMs - this._framePacingDebtMs);
                    return;
                }
                this._framePacingDebtMs = Math.max(0, this._framePacingDebtMs - frameBudgetMs);
            }

            this.stats.update(time);

            this.render(time, deltaTime, resized);

            this.onFrameEnd();
        } finally {
            // The next callback was deliberately scheduled before rendering.
        }
    };

    abstract render(
        time: DOMHighResTimeStamp,
        deltaTime: DOMHighResTimeStamp,
        resized: boolean,
    ): void;

    onFrameEnd() {
        this.stats.onFrameEnd();
    }

    /**
     * Force an immediate render, bypassing FPS limiter.
     * Used for loading screen progress updates.
     */
    forceImmediateRender(): void {
        if (!this.running) return;
        const time = performance.now();
        this._framePacingDebtMs = 0;
        invalidateCanvasCssSize(this.canvas);
        const resized = resizeCanvas(this);
        if (resized) {
            this.onResize(this.canvas.width, this.canvas.height);
        }
        // Bypass FPS limiter - render immediately
        const deltaTime = this.stats.getDeltaTime(time);
        this.stats.update(time);
        this.render(time, deltaTime, resized);
        this.onFrameEnd();
    }

    /** When true, continue rendering even when the tab is hidden/backgrounded. */
    runInBackground: boolean = true;

    protected shouldSkipFrame(time: DOMHighResTimeStamp): boolean {
        // Allow background rendering when runInBackground is enabled
        if (this.runInBackground) {
            return false;
        }
        try {
            if (typeof document !== "undefined") {
                const doc = document as Document & {
                    webkitHidden?: boolean;
                    webkitVisibilityState?: DocumentVisibilityState;
                };
                const hidden = doc.hidden || doc.webkitHidden === true;
                const visibilityState =
                    typeof doc.visibilityState === "string"
                        ? doc.visibilityState
                        : doc.webkitVisibilityState;
                if (hidden || visibilityState === "hidden") {
                    this.stats.lastFrameTime = time;
                    return true;
                }
            }
        } catch {
            // Ignore visibility errors and continue rendering
        }
        return false;
    }

    // Helper for React hosts to attach a ResizeObserver to this canvas element.
    // Observes the canvas' content box so changes in parent/layout propagate.
    attachResizeObserver(): void {
        if (this._resizeObs) return;
        try {
            this._resizeObs = new ResizeObserver(() => this.forceResize());
            this._resizeObs.observe(this.canvas);
        } catch {
            // Older browsers: no-op; RAF path will still resize
        }
    }
}
