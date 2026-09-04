import type { ObjTypeLoader } from "@august/osrs-engine/config/objtype/ObjTypeLoader";
import type { VarManager } from "@august/osrs-engine/config/vartype/VarManager";
import type { Cs2Vm, ScriptEvent } from "@client/engine/cs2/Cs2Vm";
import type { Inventory } from "@august/osrs-engine/inventory/Inventory";
import type { WidgetManager } from "@client/ui/widgets/WidgetManager";
import type { GameRenderer } from "@client/engine/rendering/core/GameRenderer";
import type { InputManager } from "@client/core/input/InputManager";
import type { TransmitCycles } from "@client/engine/game/TransmitCycles";
import type { EnterToTypeChat } from "@client/features/chat/EnterToTypeChat";
import type { WorldMapController } from "@client/engine/game/world-map/WorldMapController";
import type { PlayerDesignController } from "@client/engine/game/widgets/PlayerDesignController";
import type { SpellSelectionController } from "@client/engine/game/widgets/SpellSelectionController";
import type { WidgetInteractionController } from "@client/engine/game/widgets/WidgetInteractionController";
import type { ItemSpawnerUi } from "@client/features/item-spawner/index";
import type { WidgetActionEvent } from "@client/engine/game/widgets/widgetActionPayload";
import type { PreparedClientSettingAction } from "@client/engine/game/widgets/WidgetActionRouter";

export type WidgetInputState = {
    hoveredWidgetUids: Set<number>;
    hoveredWidgetsByUid: Map<number, any>;
    if1ScrollbarDragging: boolean;
    if1AlternativeScrollbarWidth: number;
    lastHoverHitX: number;
    lastHoverHitY: number;
    cachedHoverHits: any[] | null;
    lastHoverListenerCycle: number;
};

export type WidgetInputFrame = {
    input: InputManager;
    mx: number;
    my: number;
    allRoots: any[];
    visibleMap: Map<number, boolean>;
    hits: any[];
    getStaticChildren: (uid: number) => any[];
    getInterfaceParentRoots: (containerUid: number) => any[];
    isInputCaptureWidget: (uid: number) => boolean;
    getWidgetFlags: (w: any) => number;
    collectFromAllRoots: (px: number, py: number) => any[];
    invalidateHoverCache: () => void;
};

export type WidgetInputControllerDeps = {
    getInputManager: () => InputManager;
    getWidgetManager: () => WidgetManager;
    getWidgetInteraction: () => WidgetInteractionController;
    getTransmitCycles: () => TransmitCycles;
    getRenderer: () => GameRenderer | undefined;
    getCs2Vm: () => Cs2Vm;
    getVarManager: () => VarManager;
    getWorldMap: () => WorldMapController;
    getItemSpawnerUi: () => ItemSpawnerUi;
    getEnterToTypeChat: () => EnterToTypeChat;
    getPlayerDesign: () => PlayerDesignController;
    getObjTypeLoader: () => ObjTypeLoader | undefined;
    getInventory: () => Inventory;
    getSettings: () => { shiftClickEnabled: boolean };
    getMinimapZoomEnabled: () => boolean;
    getMenuOpen: () => boolean;
    getMenuJustClosed: () => boolean;
    setMenuJustClosed: (value: boolean) => void;
    applyMinimapWheelZoom: (deltaY: number) => void;
    executeScriptListener: (
        widget: any,
        listener: any[],
        eventContext?: Partial<ScriptEvent>,
    ) => void;
    handleWidgetAction: (event: WidgetActionEvent) => void;
    prepareClientSettingAction: (
        event: WidgetActionEvent,
    ) => PreparedClientSettingAction | undefined;
    handleTradeWidgetAction: (
        widget: any,
        event: { option?: string; slot?: number; itemId?: number },
        groupId: number,
        childId: number,
    ) => boolean;
    handleInventorySlotMove: (
        fromSlot: number,
        toSlot: number,
        localPredictionApplied: boolean,
        previousSnapshotSignature: string,
    ) => void;
    buildWidgetActionPayload: (
        event: Parameters<
            import("@client/engine/game/widgets/WidgetActionRouter").WidgetActionRouter["buildWidgetActionPayload"]
        >[0],
    ) => import("@client/core/network/ServerConnection").WidgetActionClientPayload | null;
    resolveTransmitFlagWidget: (
        eventWidget: any,
        payload: import("@client/core/network/ServerConnection").WidgetActionClientPayload,
    ) => any;
    getSpellSelection: () => SpellSelectionController;
    getPendingInputDialogAction: () => { payload: any; option: string } | null;
    setPendingInputDialogAction: (action: { payload: any; option: string } | null) => void;
    getPendingTradeQuantityAction: () => {
        action: "offer" | "remove";
        slot: number;
        itemId: number;
        maximum: number;
    } | null;
    setPendingTradeQuantityAction: (
        action: {
            action: "offer" | "remove";
            slot: number;
            itemId: number;
            maximum: number;
        } | null,
    ) => void;
};

export function createWidgetInputState(): WidgetInputState {
    return {
        hoveredWidgetUids: new Set(),
        hoveredWidgetsByUid: new Map(),
        if1ScrollbarDragging: false,
        if1AlternativeScrollbarWidth: 0,
        lastHoverHitX: -1,
        lastHoverHitY: -1,
        cachedHoverHits: null,
        lastHoverListenerCycle: -1,
    };
}
