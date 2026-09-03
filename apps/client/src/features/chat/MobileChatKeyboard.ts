import type { InputManager } from "@client/core/input/InputManager";
import type { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import { isMobileMode, isTouchDevice } from "@client/core/platform/device/DeviceUtil";

const CHAT_INPUT_VARC = 335;
const OSRS_KEY_ENTER = 84;
const OSRS_KEY_BACKSPACE = 85;

export type MobileChatKeyboardDeps = {
    inputManager: InputManager;
    varManager: VarManager;
};

/**
 * Soft-keyboard bridge for mobile chat (CS2 mobile_keyboardshow / hide).
 * Uses a near-invisible HTML input focused under the tap gesture when possible.
 */
export class MobileChatKeyboard {
    private input?: HTMLInputElement;
    private open = false;
    private lastValue = "";

    private readonly handleInput = (): void => {
        const input = this.input;
        if (!this.open || !input) return;
        const next = input.value;
        const prev = this.lastValue;
        for (let i = prev.length; i > 0 && next.length < i; i--) {
            this.deps.inputManager.enqueueOsrsKeyPress(OSRS_KEY_BACKSPACE, "Backspace");
        }
        const start = Math.min(prev.length, next.length);
        for (let i = start; i < next.length; i++) {
            this.deps.inputManager.enqueueTypedChar(next.charCodeAt(i));
        }
        this.lastValue = next;
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        this.deps.inputManager.enqueueOsrsKeyPress(OSRS_KEY_ENTER, "Enter");
    };

    constructor(private readonly deps: MobileChatKeyboardDeps) {}

    get isOpen(): boolean {
        return this.open;
    }

    show(hint: string = "", keyboardType: number = 0): void {
        if (typeof document === "undefined" || (!isMobileMode && !isTouchDevice)) return;
        const input = this.ensureInput();
        input.placeholder = hint;
        input.inputMode = (keyboardType | 0) === 1 ? "numeric" : "text";
        input.value = this.deps.varManager.getVarcString(CHAT_INPUT_VARC) ?? "";
        this.lastValue = input.value;
        this.open = true;
        try {
            input.focus({ preventScroll: true });
        } catch {
            try {
                input.focus();
            } catch {}
        }
    }

    hide(): void {
        this.open = false;
        try {
            this.input?.blur();
        } catch {}
    }

    dispose(): void {
        this.hide();
        const input = this.input;
        this.input = undefined;
        this.lastValue = "";
        if (!input) return;
        input.removeEventListener("input", this.handleInput);
        input.removeEventListener("keydown", this.handleKeyDown);
        try {
            input.remove();
        } catch {
            try {
                input.parentNode?.removeChild(input);
            } catch {}
        }
    }

    private ensureInput(): HTMLInputElement {
        if (this.input?.isConnected) return this.input;
        if (this.input) {
            this.input.removeEventListener("input", this.handleInput);
            this.input.removeEventListener("keydown", this.handleKeyDown);
        }
        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.style.cssText =
            "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
        this.input = input;
        input.addEventListener("input", this.handleInput);
        input.addEventListener("keydown", this.handleKeyDown);
        document.body.appendChild(input);
        return input;
    }
}
