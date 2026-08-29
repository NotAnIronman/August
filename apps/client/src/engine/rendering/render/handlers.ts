import { isMobileMode } from "@client/core/platform/device/DeviceUtil";
import { GameRenderer } from "@client/engine/rendering/core/GameRenderer";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import {
    getActiveLoginFieldValue,
    getCanvasTouchPos,
    requestMobileLoginKeyboard,
    resolveLoginFieldAtCanvasPoint,
    setActiveLoginFieldValue,
    syncMobileLoginInput,
    updateMobileLoginViewportBaseline,
} from "@client/engine/rendering/render/mobileLogin";

export function onCanvasTouchStart(host: WebGLOsrsRendererHost, event: TouchEvent): void {
    if (!host.osrsClient.isOnLoginScreen()) return;
    if (!isMobileMode) return;
    const touch = event.changedTouches[0] ?? event.touches[0];
    if (!touch) return;
    const { x, y } = getCanvasTouchPos(host, touch);
    const field = resolveLoginFieldAtCanvasPoint(host, x, y);
    if (field === undefined) return;
    event.preventDefault();
    host.osrsClient.loginState.currentLoginField = field;
    requestMobileLoginKeyboard(host, field);
}

export function onMobileLoginViewportChange(host: WebGLOsrsRendererHost): void {
    updateMobileLoginViewportBaseline(host, true);
    host.syncMobileLoginInputPosition?.();
}

export function onMobileLoginInput(host: WebGLOsrsRendererHost, _event: Event): void {
    const input = host.mobileLoginInput;
    if (!input) return;
    setActiveLoginFieldValue(host, input.value);
}

export function onMobileLoginKeyDown(host: WebGLOsrsRendererHost, event: KeyboardEvent): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const state = host.osrsClient.loginState;
    if (state.currentLoginField === 0) {
        state.currentLoginField = 1;
        syncMobileLoginInput(host, true);
    }
}

export function onMobileLoginInputFocus(host: WebGLOsrsRendererHost): void {
    host.mobileLoginInputFocused = true;
    host.mobileLoginKeyboardOpen = true;
}

export function onMobileLoginInputBlur(host: WebGLOsrsRendererHost): void {
    host.mobileLoginInputFocused = false;
    if (!host.allowMobileLoginInputBlur) {
        syncMobileLoginInput(host, true);
        return;
    }
    host.mobileLoginKeyboardOpen = false;
    host.allowMobileLoginInputBlur = false;
    host.preserveMobileLoginInputModeOnBlur = false;
    const input = host.mobileLoginInput;
    if (input) {
        setActiveLoginFieldValue(host, input.value);
    }
}

export function onServerTick(host: WebGLOsrsRendererHost, tick: number): void {
    host.lastTick = tick | 0;
}

export async function initRenderer(host: WebGLOsrsRendererHost): Promise<void> {
    await GameRenderer.prototype.init.call(host);
}

export function cleanUpRenderer(host: WebGLOsrsRendererHost): void {
    GameRenderer.prototype.cleanUp.call(host);
}

export function getActiveLoginFieldValueForHost(host: WebGLOsrsRendererHost): string {
    return getActiveLoginFieldValue(host);
}
