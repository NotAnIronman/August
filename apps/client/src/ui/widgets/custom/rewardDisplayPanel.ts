import { REWARD_DISPLAY_PANEL_GROUP_ID as GROUP } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import type { WidgetNode } from "@client/ui/widgets/WidgetNode";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { createPanelResizeController } from "@client/ui/widgets/uikit/ResizeController";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";

export const REWARD_DISPLAY_SLOT_BASE = 1000;
const HANDLES = [860,861,862,863];
const uid = (id:number) => (GROUP << 16) | id;
// Resizing changes the window, not the native item size or inter-item spacing.
export function rewardGridMetrics(_width:number,_height:number) { return {cellW:42,cellH:40}; }

export function buildRewardPanel() {
    const built = buildUiPanel(GROUP,{width:350,height:285,content:{rowKind:"text",rowHeight:18,scrollbarWidth:0}});
    const root = built.root!;
    const add = (id:number,props:Partial<WidgetNode>) => {
        const w:WidgetNode = {...root,uid:uid(id),id:uid(id),fileId:id,parentUid:root.uid,
            type:3,rawX:0,rawY:0,rawWidth:0,rawHeight:0,width:0,height:0,
            widthMode:0,heightMode:0,xPositionMode:0,yPositionMode:0,noClickThrough:false,...props};
        built.widgets.set(w.uid,w);return w;
    };
    // Real cache chest models, bottom-left and aspect-fitted, never stretched.
    for (const [id,model] of [[850,6616],[856,35414],[857,52413]])
        add(id,{type:6,modelType:1,modelId:model,modelZoom:1600,modelAngleX:320,modelAngleY:1768,
            rawX:14,rawY:20,yPositionMode:2,rawWidth:112,rawHeight:112,containModel:true,
            hidden:id!==850,isHidden:id!==850});
    for (let slot=0;slot<16;slot++) {
        add(1001+slot*2,{type:5,rawX:138+(slot%4)*42,rawY:46+Math.floor(slot/4)*40,
            rawWidth:36,rawHeight:32,itemId:-1,itemQuantity:0,itemQuantityMode:2,
            noClickThrough:true,actions:["Claim to inventory","Claim to bank"],flags:6});
    }
    // Native loot controls: stone buttons and inventory/bank arrows (interface 868).
    for (const [background,button,icon,x,label,sprite] of [
        [848,852,853,138,"Collect to inventory",1226],
        [849,854,855,184,"Collect to bank",1227],
        [846,858,859,230,"Destroy remaining loot",1235],
    ] as const) {
        add(background,{type:5,spriteId:761,rawX:x,rawY:18,yPositionMode:2,rawWidth:40,rawHeight:40});
        add(button,{type:3,filled:false,opacity:255,rawX:x,rawY:18,yPositionMode:2,rawWidth:40,rawHeight:40,
            actions:[label],flags:2,noClickThrough:true});
        add(icon,{type:5,spriteId:sprite,rawX:x+5,rawY:27,yPositionMode:2,rawWidth:29,rawHeight:22});
    }
    HANDLES.forEach((id,i) => add(id,{type:5,spriteId:4552,spriteAngle:16384,rawWidth:26,rawHeight:26,rawX:0,rawY:0,
        xPositionMode:i%2===0?0:2,yPositionMode:i<2?0:2,noClickThrough:true}));
    return built;
}

registerUiPanel({groupId:GROUP,build:buildRewardPanel,
    galleryClickController:createPanelResizeController(GROUP,HANDLES,320,260),
    onProcess:wm => {
        if(wm.getInterfaceParentContainerUid(GROUP)===undefined)return;
        for(let i=0;i<16;i++) {
            const item=wm.getWidgetByUid(uid(1001+i*2));
            if(!item)continue;
            const canClaim=!wm.getWidgetByUid(uid(852))?.hidden && (item.itemId??-1)>0;
            const flags=canClaim?6:0;
            if(item.flags!==flags) {
                item.flags=flags;item.actions=canClaim?["Claim to inventory","Claim to bank"]:undefined;
                wm.invalidateWidget(item,"reward-claim-actions");
            }
        }
    },
});
