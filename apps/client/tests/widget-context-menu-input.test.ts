import assert from "node:assert/strict";

import { WidgetInputController } from "@client/engine/game/widgets/WidgetInputController";
import { shouldSkipWidgetPointerInput } from "@client/engine/game/widgets/input/widgetClickGuard";

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
        isDragging: () => false,
    };
    const widgetManager = {
        rootInterface: 1,
        interfaceParents: new Map(),
        getAllGroupRoots: () => [{}],
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
        getEnterToTypeChat: () => ({}),
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
}

console.log("widget-context-menu-input.test.ts: all tests passed");
