import assert from "node:assert/strict";
import { InputManager, ClickMode } from "@client/core/input/InputManager";
import { ClientState } from "@client/engine/game/ClientState";
import { MenuState } from "@client/ui/runtime/menu/MenuState";
import { MenuEntrySwapperPlugin } from "@client/features/plugins/menuentryswapper/MenuEntrySwapperPlugin";

(globalThis as { self?: unknown }).self = globalThis;
const { checkInteractions } = require("@client/engine/rendering/render/interact/check");
const { buildSimpleMenuEntries, performWorldEntryAction } = require("@client/engine/rendering/render/interact/menu");
const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
try {
    Object.assign(globalThis, { window: new EventTarget(), document: new EventTarget() });
    const surface = Object.assign(new EventTarget(), { contains: (t: unknown) => t === surface || t === canvas });
    const canvas = Object.assign(new EventTarget(), { parentElement: surface, style: { pointerEvents: "" },
        width: 800, height: 600, __ui: {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) });
    let focus: unknown = surface;
    const focusOn = (target: unknown) => {
        if (focus === target) return;
        focus = target;
        surface.dispatchEvent(Object.assign(new Event("focusout"), { relatedTarget: target }));
    };
    const input = new InputManager();
    input.init(canvas as any);
    const crosses: string[] = [];
    let objectUnderPointer = false;
    const game: any = {
        inputManager: input, menuState: new MenuState(), menuEntrySwapperPlugin: new MenuEntrySwapperPlugin(),
        menuOpen: false, tooltips: true, menuOpenedFrame: -100, menuPinnedEntriesVersion: 0,
        npcEcs: {}, playerEcs: {}, settings: {}, camera: { containsScreenPoint: (x: number,y: number) => x >= 0 && y >= 0 },
        locTypeLoader: { load: () => ({ name: "Door", actions: ["Open"] }) },
        isPointOverWidget: () => false,
        closeMenu: () => { game.menuOpen = false; game.menuState.reset(); focusOn(canvas); },
    };
    const host: any = {
        osrsClient: game, stats: { frameCount: 100 }, app: { width: 800, height: 600, gl: { canvas } },
        cachedMenuEntries: [], cachedClientMenuEntries: [], cachedLocIds: new Set(), cachedObjIds: new Set(),
        cachedNpcIds: new Set(), cachedPlayerIds: new Set(),
        isMouseInUIRegion: () => false, computeTileAt: (x: number,y: number) => x >= 0 && y >= 0 ? {tileX:3200,tileY:3200,plane:0} : undefined,
        screenToRay: (x: number,y: number) => ({x,y}), getPlayerRawPlane: () => 0,
        sceneRaycaster: { raycast: () => objectUnderPointer ? [{interactType:1,interactId:1530,tileX:3200,tileY:3200}] : [] },
        updateInteractHighlightHoverTarget: () => {}, onInteractHighlightEntryInvoked: () => {},
        clearInteractHighlightHoverTarget: () => {}, clearInteractHighlightActiveTarget: () => {},
        toGLClickXY: () => ({sx:input.leftClickX,sy:input.leftClickY}),
        spawnClickCross: (_tile: unknown,_xy: unknown,color: string) => crosses.push(color),
        resolveLocInteractionTile: (_id: number,tile: unknown) => tile, isLocalPlayerAdjacentToLoc: () => false,
        getPlayerBasePlane: () => 0,
    };
    host.buildSimpleMenuEntries = (entries: any[], opts: any) => buildSimpleMenuEntries(host,entries,opts);
    host.performWorldEntryAction = (...args: any[]) => performWorldEntryAction(host,...args);
    ClientState.isItemSelected = 0; ClientState.isSpellSelected = false;
    for (const target of [false,true]) {
        objectUnderPointer = target;
        for (let n = 0; n < 8; n++) {
            surface.dispatchEvent(Object.assign(new Event("mousedown", {cancelable:true}), {button:0,clientX:100,clientY:100}));
            // The browser's default mousedown focus happens after the input listener.
            focusOn(surface);
            input.onFrameStart();
            assert.equal(input.clickMode3,ClickMode.LEFT);
            // A pointer can leave the canvas before the render frame. Its press
            // must still select the object, not Cancel or a stale hover target.
            if (n % 3 === 2) { input.mouseX = -1; input.mouseY = -1; }
            const before = crosses.length;
            checkInteractions(host);
            assert.equal(crosses.length,before + 1,`every ${target ? "action" : "walk"} press produces exactly one cross (click ${n + 1})`);
            assert.equal(crosses.at(-1),target ? "red" : "yellow");
            surface.dispatchEvent(Object.assign(new Event("mouseup"), {button:0,clientX:100,clientY:100}));
            input.onFrameEnd();
            // Exercise both adjacent-frame presses and frames without input.
            if (n % 2) { input.onFrameStart(); checkInteractions(host); input.onFrameEnd(); }
            host.stats.frameCount++;
        }
    }
    input.cleanUp();
} finally { Object.assign(globalThis,{window:previousWindow,document:previousDocument}); }
console.log("Repeated world presses retain yellow/red actions through internal focus changes and pointer exit");
