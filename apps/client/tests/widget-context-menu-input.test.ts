import assert from "node:assert/strict";
import { InputManager, ClickMode } from "@client/core/input/InputManager";

import { WidgetInputController } from "@client/engine/game/widgets/WidgetInputController";
import { shouldSkipWidgetPointerInput } from "@client/engine/game/widgets/input/widgetClickGuard";

const nativeInput = new InputManager() as any;
nativeInput.element = { width: 800, height: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
nativeInput.installDocumentGrab = () => {};
let prevented = 0;
nativeInput.onMouseDown({ button: 2, shiftKey: true, clientX: 100, clientY: 100,
    preventDefault: () => prevented++ });
assert.equal(prevented, 1, "modified right-button press cancels the browser gesture");
assert.equal(nativeInput.shiftDown, true);
assert.equal(nativeInput.clickMode1, ClickMode.RIGHT, "in-game menu still receives the right click");
nativeInput.onContextMenu({ preventDefault: () => prevented++ });
assert.equal(prevented, 2, "contextmenu default is also cancelled");

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
try {
    Object.assign(globalThis, { window: new EventTarget(), document: new EventTarget() });
    const surface = Object.assign(new EventTarget(), { contains: (target: unknown) => target === surface || target === canvas });
    const canvas = Object.assign(new EventTarget(), { style: { pointerEvents: "auto" }, parentElement: surface,
        width: 800, height: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) });
    const input = new InputManager();
    input.init(canvas as unknown as HTMLElement);
    assert.equal(canvas.style.pointerEvents, "none", "image canvas is no longer the browser gesture target");
    const down = Object.assign(new Event("mousedown", { cancelable: true }), { button: 2, shiftKey: true, clientX: 100, clientY: 100 });
    surface.dispatchEvent(down);
    assert(down.defaultPrevented);
    assert.equal(input.clickMode1, ClickMode.RIGHT);
    assert.equal(input.clickX, 200, "surface input retains canvas buffer coordinate scaling");
    const context = new Event("contextmenu", { cancelable: true });
    surface.dispatchEvent(context);
    assert(context.defaultPrevented);
    surface.dispatchEvent(Object.assign(new Event("mousedown", { cancelable: true }), {
        button: 2, ctrlKey: true, shiftKey: false, clientX: 100, clientY: 100,
    }));
    assert.equal(input.controlDown, true, "Ctrl-right-click works even without a preceding keydown");
    assert.equal(input.shiftDown, false, "Ctrl must not impersonate Shift-click behavior");
    assert.equal(input.clickMode1, ClickMode.RIGHT);
    // Browser default focus moves from the canvas to its focusable input wrapper
    // after mousedown. That is not a loss of focus from the game.
    for (let n = 0; n < 6; n++) {
        surface.dispatchEvent(Object.assign(new Event("mousedown", { cancelable: true }), {
            button: 0, clientX: 100, clientY: 100, shiftKey: true,
        }));
        surface.dispatchEvent(Object.assign(new Event("focusout"), { relatedTarget: surface }));
        assert.equal(input.mouseX, 200, "internal focus transfer must retain pointer coordinates");
        assert.equal(input.clickMode2, ClickMode.LEFT, "internal focus transfer must retain the pressed button");
        assert.equal(input.shiftDown, true, "internal focus transfer must retain modifiers");
        input.onFrameStart();
        assert.equal(input.leftClickX, 200, `left click ${n + 1} must reach the frame`);
        surface.dispatchEvent(Object.assign(new Event("focusout"), { relatedTarget: canvas }));
        assert.equal(input.mouseX, 200, "menu focus restoration within the game is also harmless");
        surface.dispatchEvent(Object.assign(new Event("mouseup"), { button: 0, clientX: 100, clientY: 100 }));
        input.onFrameEnd();
    }
    surface.dispatchEvent(Object.assign(new Event("focusout"), { relatedTarget: null }));
    assert.equal(input.mouseX, -1, "leaving the game still resets input");
    assert.equal(input.shiftDown, false);
    assert.equal(input.controlDown, false);
    input.cleanUp();
    assert.equal(canvas.style.pointerEvents, "auto", "teardown restores original hit testing");
    const later = Object.assign(new Event("mousedown", { cancelable: true }), { button: 2 });
    surface.dispatchEvent(later);
    assert.equal(later.defaultPrevented, false, "teardown removes surface handlers");
    // Also protect a canvas attached or reparented after input initialization.
    const detached = Object.assign(new EventTarget(), {style:{pointerEvents:"auto"},parentElement:null as any,
        contains:(t: unknown)=>t===detached, width:800,height:600,
        getBoundingClientRect:()=>({left:0,top:0,right:400,bottom:300,width:400,height:300})});
    input.init(detached as any);
    detached.parentElement=surface;
    const captured = Object.assign(new Event("contextmenu",{cancelable:true}),{clientX:100,clientY:100,shiftKey:true});
    Object.defineProperty(captured,"target",{value:surface});
    document.dispatchEvent(captured);
    assert(captured.defaultPrevented,"late-attached canvas and overlay descendants are protected in document capture");
    const pointerDown = Object.assign(new Event("pointerdown", {cancelable:true}), {button:2, clientX:100, clientY:100, shiftKey:true});
    Object.defineProperty(pointerDown,"target",{value:surface});
    document.dispatchEvent(pointerDown);
    assert(pointerDown.defaultPrevented,"right-button pointer gesture is cancelled before browser image handling");
    assert.equal(input.clickMode1,ClickMode.RIGHT,"pointer capture delivers the game click even when compatibility mouse events are suppressed");
    assert.equal(input.clickMode2,ClickMode.RIGHT);
    document.dispatchEvent(Object.assign(new Event("pointerup"),{button:2}));
    assert.equal(input.clickMode2,ClickMode.NONE,"release outside canvas cannot leave right button held");
    const outside = Object.assign(new Event("contextmenu",{cancelable:true}),{clientX:100,clientY:100});
    document.dispatchEvent(outside);
    assert.equal(outside.defaultPrevented,false,"context menus outside game surface remain native");
    input.cleanUp();
} finally { Object.assign(globalThis, { window: previousWindow, document: previousDocument }); }

function createDeps(options: {
    worldMenuOpen?: boolean;
    widgetMenuOpen?: boolean;
    menuJustClosed?: boolean;
}) {
    let menuJustClosed = options.menuJustClosed ?? false;
    return {
        deps: {
            getMenuOpen: () => options.worldMenuOpen ?? false,
            getMenuJustClosed: () => menuJustClosed,
            setMenuJustClosed: (value: boolean) => {
                menuJustClosed = value;
            },
            getRenderer: () => ({
                canvas: {
                    __ui: {
                        menu: { open: options.widgetMenuOpen ?? false },
                    },
                },
            }),
        } as any,
        getMenuJustClosed: () => menuJustClosed,
    };
}

{
    const { deps } = createDeps({ worldMenuOpen: true });
    assert.equal(shouldSkipWidgetPointerInput(deps), true);
}

{
    const { deps } = createDeps({ widgetMenuOpen: true });
    assert.equal(shouldSkipWidgetPointerInput(deps), true);
}

{
    const { deps, getMenuJustClosed } = createDeps({ menuJustClosed: true });
    assert.equal(shouldSkipWidgetPointerInput(deps), true);
    assert.equal(getMenuJustClosed(), false);
}

{
    const { deps } = createDeps({});
    assert.equal(shouldSkipWidgetPointerInput(deps), false);
}

{
    const cs2Vm = {
        inputDialogType: 1,
        inputDialogWidgetId: -1,
        inputDialogString: "",
        onInputDialogComplete: undefined,
    };
    const input = {
        mouseX: 0,
        mouseY: 0,
        leftClickX: -1,
        leftClickY: -1,
        wheelDeltaY: 0,
        keyEvents: [{ keyTyped: 0, keyPressed: 65 }],
        keyArray: [],
        isDragging: () => false,
    };
    const widgetManager = {
        rootInterface: 1,
        interfaceParents: new Map(),
        getAllGroupRoots: () => [{uid:162<<16,onKey:[1]}],
        getWidgetByUid: () => null,
        getStaticChildrenByParentUid: () => [],
        getWidgetFlags: () => 0,
        invalidateWidgetRender: () => {},
        isEffectivelyHidden: () => false,
    };
    const widgetInteraction = {
        clickedWidget: null,
        isDraggingWidget: false,
        isPointerOverMinimapClickTarget: () => false,
    };
    let worldMapPointerCalls = 0;
    const deps = {
        getInputManager: () => input,
        getWidgetManager: () => widgetManager,
        getWidgetInteraction: () => widgetInteraction,
        getTransmitCycles: () => ({ cycleCntr: 0 }),
        getRenderer: () => ({ canvas: { __ui: { menu: { open: true } } } }),
        getCs2Vm: () => cs2Vm,
        getVarManager: () => ({ setVarcString: () => {} }),
        getWorldMap: () => ({
            handleWorldMapDragInput: () => {
                worldMapPointerCalls++;
            },
        }),
        getItemSpawnerUi: () => ({ handleSearchKeyEvents: () => false }),
        getEnterToTypeChat: () => ({handleKeyEvent:()=>false,shouldBlockChatboxKeys:()=>false,isUnlocked:false}),
        executeScriptListener: (_w:unknown,_listener:unknown,event:{keyPressed:number}) => {
            cs2Vm.inputDialogString += String.fromCharCode(event.keyPressed);
        },
        getMenuOpen: () => false,
        getMenuJustClosed: () => false,
        setMenuJustClosed: () => {},
        getMinimapZoomEnabled: () => false,
        getPendingInputDialogAction: () => null,
        getPendingTradeQuantityAction: () => null,
    } as any;

    const controller = new WidgetInputController(deps);
    const state = (controller as any).state;
    state.lastHoverHitX = 0;
    state.lastHoverHitY = 0;
    state.cachedHoverHits = [];
    state.lastHoverListenerCycle = 0;

    controller.handleUiInput();

    assert.equal(worldMapPointerCalls, 0, "open context menu must block pointer input");
    assert.equal(cs2Vm.inputDialogString, "A", "open context menu must not discard keyboard input");
    controller.reset();
    assert.equal(state.cachedHoverHits,null,"root replacement discards cached widget references");
}

console.log("widget-context-menu-input.test.ts: all tests passed");
