
import { getMousePos } from "@client/core/input/InputManager";
import {
    isMobileMode
} from "@client/core/platform/device/DeviceUtil";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import { LoginIndex } from "@client/features/login/index";

export function shouldUseMobileLoginInput(host: WebGLOsrsRendererHost, ): boolean {

        const state = host.osrsClient.loginState;
        return (
            isMobileMode &&
            host.osrsClient.isOnLoginScreen() &&
            state.loginIndex === LoginIndex.LOGIN_FORM &&
            state.virtualKeyboardVisible === true
        );
    
}

export function getCanvasTouchPos(host: WebGLOsrsRendererHost, touch: Touch): { x: number; y: number } {

        const [x, y] = getMousePos(host.canvas, touch);
        return {
            x: x | 0,
            y: y | 0,
        };
    
}

export function resolveLoginFieldAt(host: WebGLOsrsRendererHost, y: number): 0 | 1 | undefined {

        if (y >= host.LOGIN_FIELD_BASE_Y - 12 && y < host.LOGIN_FIELD_BASE_Y + 3) {
            return 0;
        }
        if (y >= host.LOGIN_FIELD_BASE_Y + 3 && y < host.LOGIN_FIELD_BASE_Y + 18) {
            return 1;
        }
        return undefined;
    
}

export function resolveLoginFieldAtCanvasPoint(host: WebGLOsrsRendererHost, x: number, y: number): 0 | 1 | undefined {

        const loginRenderer = host.osrsClient.loginRenderer;
        const uiMetrics = host.computeUiRenderMetrics(host.canvas.width, host.canvas.height);
        loginRenderer.syncMobileViewportState(
            host.osrsClient.loginState,
            host.isMobileLoginKeyboardOpen(),
        );
        loginRenderer.updateLayout(
            uiMetrics.layoutW,
            uiMetrics.layoutH,
            host.canvas.width,
            host.canvas.height,
        );
        loginRenderer.setMousePosition(x, y);
        const content = loginRenderer.mapPointerToContent(
            loginRenderer.mouseX,
            loginRenderer.mouseY,
        );
        return host.resolveLoginFieldAt(content.y);
    
}

export function isMobileLoginInputActive(host: WebGLOsrsRendererHost, ): boolean {

        return host.isMobileLoginKeyboardOpen();
    
}

export function readMobileLoginViewportMetrics(host: WebGLOsrsRendererHost, ):
        | { width: number; height: number; offsetLeft: number; offsetTop: number }
        | undefined {

        if (typeof window === "undefined") {
            return undefined;
        }

        const viewport = window.visualViewport;
        const width = Math.round(viewport?.width ?? window.innerWidth ?? 0);
        const height = Math.round(viewport?.height ?? window.innerHeight ?? 0);
        if (!(width > 0) || !(height > 0)) {
            return undefined;
        }

        return {
            width,
            height,
            offsetLeft: Math.round(viewport?.offsetLeft ?? 0),
            offsetTop: Math.round(viewport?.offsetTop ?? 0),
        };
    
}

export function updateMobileLoginViewportBaseline(host: WebGLOsrsRendererHost, force: boolean = false): void {

        const viewport = host.readMobileLoginViewportMetrics();
        if (!viewport) {
            return;
        }

        const widthChanged =
            host.mobileLoginViewportBaselineWidth <= 0 ||
            Math.abs(viewport.width - host.mobileLoginViewportBaselineWidth) > 40;
        if (
            force ||
            widthChanged ||
            !host.mobileLoginInputFocused ||
            !host.mobileLoginKeyboardOpen ||
            viewport.height > host.mobileLoginViewportBaselineHeight
        ) {
            host.mobileLoginViewportBaselineWidth = viewport.width;
            host.mobileLoginViewportBaselineHeight = viewport.height;
        }
    
}

export function refreshMobileLoginKeyboardState(host: WebGLOsrsRendererHost, ): boolean {

        if (!host.mobileLoginInputFocused) {
            host.mobileLoginKeyboardOpen = false;
            host.updateMobileLoginViewportBaseline(true);
            return false;
        }

        if (typeof window === "undefined") {
            host.mobileLoginKeyboardOpen = true;
            return true;
        }

        const viewport = window.visualViewport;
        if (!viewport) {
            host.mobileLoginKeyboardOpen = true;
            return true;
        }

        const width = Math.round(viewport.width);
        const height = Math.round(viewport.height);
        const offsetTop = Math.round(viewport.offsetTop ?? 0);
        const widthChanged =
            host.mobileLoginViewportBaselineWidth <= 0 ||
            Math.abs(width - host.mobileLoginViewportBaselineWidth) > 40;
        if (widthChanged) {
            host.mobileLoginViewportBaselineWidth = width;
            host.mobileLoginViewportBaselineHeight = height;
            host.mobileLoginKeyboardOpen = false;
            return false;
        }

        if (height >= host.mobileLoginViewportBaselineHeight - 20 && offsetTop < 20) {
            host.mobileLoginViewportBaselineHeight = height;
        }

        const heightDelta = host.mobileLoginViewportBaselineHeight - height;
        host.mobileLoginKeyboardOpen = heightDelta >= 80 || offsetTop >= 40;
        return host.mobileLoginKeyboardOpen;
    
}

export function isMobileLoginKeyboardOpen(host: WebGLOsrsRendererHost, ): boolean {

        return host.refreshMobileLoginKeyboardState();
    
}

export function syncMobileLoginInputPosition(host: WebGLOsrsRendererHost, ): void {

        const input = host.mobileLoginInput;
        if (!input) {
            return;
        }

        const viewport = host.readMobileLoginViewportMetrics();
        if (!viewport) {
            input.style.left = "50%";
            input.style.top = "46%";
            input.style.transform = "translate(-50%, -50%)";
            return;
        }

        const focusRatioY = 0.46;
        input.style.left = `${viewport.offsetLeft + Math.round(viewport.width / 2)}px`;
        input.style.top = `${viewport.offsetTop + Math.round(viewport.height * focusRatioY)}px`;
        input.style.transform = "translate(-50%, -50%)";
    
}

export function requestMobileLoginKeyboard(host: WebGLOsrsRendererHost, field: 0 | 1): void {

        const state = host.osrsClient.loginState;
        state.currentLoginField = field;
        state.onMobile = true;
        state.virtualKeyboardVisible = true;
        if (!host.mobileLoginInputFocused && !host.mobileLoginKeyboardOpen) {
            host.updateMobileLoginViewportBaseline(true);
        }
        const input = host.ensureMobileLoginInput();
        if (
            input &&
            typeof document !== "undefined" &&
            document.activeElement === input &&
            !host.isMobileLoginKeyboardOpen()
        ) {
            host.allowMobileLoginInputBlur = true;
            host.preserveMobileLoginInputModeOnBlur = true;
            input.blur();
        }
        host.syncMobileLoginInput(true);
    
}

export function syncLoginRendererLayoutForCanvas(host: WebGLOsrsRendererHost, ): void {

        const loginRenderer = host.osrsClient.loginRenderer;
        const uiMetrics = host.computeUiRenderMetrics(host.canvas.width, host.canvas.height);
        loginRenderer.syncMobileViewportState(
            host.osrsClient.loginState,
            host.isMobileLoginKeyboardOpen(),
        );
        loginRenderer.updateLayout(
            uiMetrics.layoutW,
            uiMetrics.layoutH,
            host.canvas.width,
            host.canvas.height,
        );
    
}

export function getActiveLoginFieldValue(host: WebGLOsrsRendererHost, ): string {

        const state = host.osrsClient.loginState;
        return state.currentLoginField === 0 ? state.username : state.password;
    
}

export function setActiveLoginFieldValue(host: WebGLOsrsRendererHost, raw: string): void {

        const state = host.osrsClient.loginState;
        if (state.currentLoginField === 0) {
            state.username = raw.slice(0, 320);
        } else {
            state.password = raw.slice(0, 20);
        }
        state.savePersistedLoginState();
    
}

export function ensureMobileLoginInput(host: WebGLOsrsRendererHost, ): HTMLInputElement | undefined {

        if (!isMobileMode) return undefined;

        const existing = host.mobileLoginInput;
        if (existing && existing.isConnected) {
            return existing;
        }

        if (typeof document === "undefined") return undefined;

        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.autocapitalize = "none";
        input.setAttribute("autocorrect", "off");
        input.spellcheck = false;
        input.inputMode = "email";
        (input as any).enterKeyHint = "next";
        input.tabIndex = -1;
        input.style.position = "fixed";
        input.style.width = "16px";
        input.style.height = "16px";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        input.style.border = "0";
        input.style.margin = "0";
        input.style.padding = "0";
        input.style.background = "transparent";
        input.style.color = "transparent";
        input.style.caretColor = "transparent";
        input.style.fontSize = "16px";

        input.addEventListener("input", host.onMobileLoginInput);
        input.addEventListener("keydown", host.onMobileLoginKeyDown);
        input.addEventListener("focus", host.onMobileLoginInputFocus);
        input.addEventListener("blur", host.onMobileLoginInputBlur);
        document.body.appendChild(input);
        host.mobileLoginInput = input;
        host.syncMobileLoginInputPosition();
        return input;
    
}

export function destroyMobileLoginInput(host: WebGLOsrsRendererHost, ): void {

        const input = host.mobileLoginInput;
        if (!input) return;
        input.removeEventListener("input", host.onMobileLoginInput);
        input.removeEventListener("keydown", host.onMobileLoginKeyDown);
        input.removeEventListener("focus", host.onMobileLoginInputFocus);
        input.removeEventListener("blur", host.onMobileLoginInputBlur);
        try {
            input.remove();
        } catch {}
        host.mobileLoginInput = undefined;
        host.mobileLoginInputFocused = false;
        host.mobileLoginKeyboardOpen = false;
    
}

export function syncMobileLoginInput(host: WebGLOsrsRendererHost, focus: boolean): void {

        if (!host.shouldUseMobileLoginInput()) {
            const input = host.mobileLoginInput;
            if (input && document.activeElement === input) {
                host.allowMobileLoginInputBlur = true;
                host.preserveMobileLoginInputModeOnBlur = false;
                input.blur();
            }
            return;
        }

        const input = host.ensureMobileLoginInput();
        if (!input) return;

        const state = host.osrsClient.loginState;
        const wantsPassword = state.currentLoginField === 1;
        const nextType = wantsPassword ? "password" : "text";
        if (input.type !== nextType) {
            input.type = nextType;
        }
        input.inputMode = wantsPassword ? "text" : "email";
        (input as any).enterKeyHint = wantsPassword ? "go" : "next";

        const value = host.getActiveLoginFieldValue();
        if (input.value !== value) {
            input.value = value;
        }

        host.syncMobileLoginInputPosition();

        if (focus && document.activeElement !== input) {
            try {
                input.focus({ preventScroll: true });
            } catch {
                input.focus();
            }
        }
        if (focus) {
            const end = input.value.length;
            input.setSelectionRange(end, end);
        }
    
}
