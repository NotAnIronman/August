import { ClickMode } from "@client/core/input/InputManager";
import type { UiGalleryClickController } from "./GalleryClickController";

/** Per-window, host-constrained resize; corner drags never transmit a game action. */
export function createPanelResizeController(groupId: number, handles: readonly number[], minWidth: number, minHeight: number): UiGalleryClickController {
    let drag: {x:number;y:number;width:number;height:number;left:boolean;top:boolean}|undefined;
    return {process(frame, wm) {
        const container = wm.getInterfaceParentContainerUid(groupId);
        const root = wm.getGroup(groupId)?.root;
        if (container === undefined || !root || wm.isEffectivelyHidden(container)) {drag=undefined;return;}
        const host = wm.getWidgetByUid(container);
        if (!host) return;
        const maxW = Math.max(1, host.width), maxH = Math.max(1, host.height);
        let width=Math.min(root.rawWidth??root.width,maxW), height=Math.min(root.rawHeight??root.height,maxH);
        if (frame.input.clickMode2 !== ClickMode.LEFT) drag=undefined;
        if (!drag && frame.input.clickMode3===ClickMode.LEFT) {
            const corner=handles.findIndex(id=>frame.hits.some(w=>w.uid===((groupId<<16)|id)));
            if(corner>=0) drag={x:frame.mx,y:frame.my,width,height,left:corner%2===0,top:corner<2};
        }
        if(drag) {
            width=Math.max(Math.min(minWidth,maxW),Math.min(maxW,drag.width+2*(frame.mx-drag.x)*(drag.left?-1:1)));
            height=Math.max(Math.min(minHeight,maxH),Math.min(maxH,drag.height+2*(frame.my-drag.y)*(drag.top?-1:1)));
            frame.input.clickMode3=ClickMode.NONE;
            frame.input.clickMode1=ClickMode.NONE;
        }
        if(root.rawWidth!==width || root.rawHeight!==height) {
            root.rawWidth=width;root.rawHeight=height;
            wm.invalidateWidget(root,"uikit-resize");
            wm.ensureLayout(root);
            wm.invalidateWidgetRender(root,"uikit-resize");frame.invalidateHoverCache();
        }
    }};
}
