import assert from "node:assert/strict";

type Listener = (event: any) => void;

class FakeInput {
    type = "";
    autocomplete = "";
    inputMode = "";
    placeholder = "";
    value = "";
    style = { cssText: "" };
    isConnected = false;
    parentNode: { removeChild: (child: FakeInput) => void } | null = null;
    private readonly listeners = new Map<string, Set<Listener>>();

    addEventListener(type: string, listener: Listener): void {
        let entries = this.listeners.get(type);
        if (!entries) {
            entries = new Set();
            this.listeners.set(type, entries);
        }
        entries.add(listener);
    }

    removeEventListener(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener);
    }

    dispatch(type: string, event: any = {}): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    listenerCount(type: string): number {
        return this.listeners.get(type)?.size ?? 0;
    }

    focus(): void {}
    blur(): void {}

    remove(): void {
        this.parentNode?.removeChild(this);
    }
}

async function main(): Promise<void> {
    const inputs: FakeInput[] = [];
    const body = {
        appendChild(input: FakeInput): void {
            input.isConnected = true;
            input.parentNode = body;
            inputs.push(input);
        },
        removeChild(input: FakeInput): void {
            input.isConnected = false;
            input.parentNode = null;
            const index = inputs.indexOf(input);
            if (index >= 0) inputs.splice(index, 1);
        },
    };

    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { userAgent: "Android", maxTouchPoints: 1 },
    });
    (globalThis as any).window = {
        location: { search: "" },
        navigator: (globalThis as any).navigator,
    };
    (globalThis as any).document = {
        body,
        documentElement: { ontouchstart: null, dataset: {} },
        createElement(tag: string) {
            if (tag === "input") return new FakeInput();
            return { getContext: () => null };
        },
    };

    const { MobileChatKeyboard } = await import(
        "@client/features/chat/MobileChatKeyboard"
    );
    const typed: number[] = [];
    const keys: Array<{ code: number; key: string }> = [];
    const keyboard = new MobileChatKeyboard({
        inputManager: {
            enqueueTypedChar: (charCode: number) => typed.push(charCode),
            enqueueOsrsKeyPress: (code: number, key: string) => keys.push({ code, key }),
        } as any,
        varManager: {
            getVarcString: () => "",
        } as any,
    });

    keyboard.show("Message");
    assert.equal(inputs.length, 1);
    assert.equal(keyboard.isOpen, true);
    const input = inputs[0];
    input.value = "ab";
    input.dispatch("input");
    assert.deepEqual(typed, ["a".charCodeAt(0), "b".charCodeAt(0)]);

    input.value = "a";
    input.dispatch("input");
    assert.deepEqual(keys, [{ code: 85, key: "Backspace" }]);

    let prevented = false;
    input.dispatch("keydown", {
        key: "Enter",
        preventDefault: () => {
            prevented = true;
        },
    });
    assert.equal(prevented, true);
    assert.deepEqual(keys.at(-1), { code: 84, key: "Enter" });

    keyboard.dispose();
    assert.equal(keyboard.isOpen, false);
    assert.equal(inputs.length, 0, "dispose must remove the hidden DOM input");
    assert.equal(input.listenerCount("input"), 0);
    assert.equal(input.listenerCount("keydown"), 0);

    input.value = "abc";
    input.dispatch("input");
    assert.deepEqual(typed, ["a".charCodeAt(0), "b".charCodeAt(0)]);
    keyboard.dispose();

    console.log("Mobile chat keyboard lifecycle regression test passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
