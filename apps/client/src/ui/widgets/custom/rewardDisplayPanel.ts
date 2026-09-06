import { REWARD_DISPLAY_PANEL_GROUP_ID as GROUP } from "@august/protocol/ui/widgets/custom/journalPanel.cs2";
import { FONT_PLAIN_12 } from "@august/protocol/ui/fonts";
import type { WidgetNode } from "@client/ui/widgets/WidgetNode";
import { buildUiPanel } from "@client/ui/widgets/uikit/PanelBuilder";
import { createPanelResizeController } from "@client/ui/widgets/uikit/ResizeController";
import { registerUiPanel } from "@client/ui/widgets/uikit/registry";

export const REWARD_DISPLAY_SLOT_BASE=1000;
const HANDLES=[860,861,862,863];
const uid=(id:number)=>(GROUP<<16)|id;
export function rewardGridMetrics(width:number,height:number) {
    return {cellW:Math.floor((width-32)/4),cellH:Math.floor((height-150)/4)};
}

/** Rewards keep native 36:32 artwork. Space grows, never the item sprite. */
export function buildRewardPanel() {
    const built=buildUiPanel(GROUP,{width:480,height:334,content:{rowKind:"text",rowHeight:18,scrollbarWidth:0}});
    const root=built.root!;
    const add=(id:number,props:Partial<WidgetNode>)=>{
        const w:WidgetNode={...root,uid:uid(id),id:uid(id),fileId:id,parentUid:root.uid,
            type:3,rawX:0,rawY:0,rawWidth:0,rawHeight:0,width:0,height:0,
            xPositionMode:0,yPositionMode:0,noClickThrough:false,...props};
        built.widgets.set(w.uid,w);return w;
    };
    add(850,{type:5,rawX:16,rawY:38,rawWidth:36,rawHeight:32,spriteId:1041});
    add(851,{type:4,rawX:56,rawY:38,rawWidth:390,rawHeight:32,fontId:FONT_PLAIN_12,
        text:"Rewards",textColor:0xffd981,yTextAlignment:1});
    for(let slot=0;slot<16;slot++) {
        add(1000+slot*2,{filled:true,color:0x30291f,rawWidth:96,rawHeight:42});
        add(1001+slot*2,{type:5,rawWidth:36,rawHeight:32,itemId:-1,itemQuantity:0,itemQuantityMode:2,
            noClickThrough:true,actions:["Claim to inventory","Claim to bank"],flags:6});
    }
    for(const id of [848,849])add(id,{rawY:38,yPositionMode:2,rawWidth:194,rawHeight:28,
        filled:true,color:0x493c29,cacheUiAsset:"cache.sprite.293.0",cacheUiAssetHover:"cache.sprite.294.0"});
    // 907 is the native inventory-tab bag; 1041 is the bank's deposit icon.
    for(const [id,label,sprite] of [[852,"Deposit to inventory",907],[854,"Deposit to bank",1041]] as const) {
        add(id,{type:4,rawWidth:194,rawHeight:28,rawY:38,yPositionMode:2,fontId:FONT_PLAIN_12,
            text:label,textColor:0xffd981,xTextAlignment:1,yTextAlignment:1,actions:[label],flags:2,noClickThrough:true});
        add(id+1,{type:5,rawWidth:22,rawHeight:22,rawY:35,yPositionMode:2,spriteId:sprite});
    }
    HANDLES.forEach((id,i)=>add(id,{type:4,rawWidth:14,rawHeight:14,rawX:2,rawY:2,
        xPositionMode:i%2===0?0:2,yPositionMode:i<2?0:2,text:i<2?"+":"//",
        fontId:FONT_PLAIN_12,textColor:0xa99b7d,noClickThrough:true}));
    return built;
}

registerUiPanel({groupId:GROUP,build:buildRewardPanel,
    galleryClickController:createPanelResizeController(GROUP,HANDLES,340,300),
    onProcess:wm=>{
        if(wm.getInterfaceParentContainerUid(GROUP)===undefined)return;
        const root=wm.getGroup(GROUP)?.root;if(!root)return;
        const {cellW,cellH}=rewardGridMetrics(root.width,root.height);
        const position=(id:number,x:number,y?:number,w?:number,h?:number)=>{
            const node=wm.getWidgetByUid(uid(id));if(!node)return;
            if(node.rawX===x&&(y===undefined||node.rawY===y)&&(w===undefined||node.rawWidth===w)&&(h===undefined||node.rawHeight===h))return;
            node.rawX=x;if(y!==undefined)node.rawY=y;if(w!==undefined)node.rawWidth=w;if(h!==undefined)node.rawHeight=h;
            wm.invalidateWidget(node,"reward-layout");
            wm.ensureLayout(node);wm.invalidateWidgetRender(node,"reward-layout");
        };
        for(let i=0;i<16;i++){
            const item=wm.getWidgetByUid(uid(1001+i*2));
            if(item){const canClaim=!wm.getWidgetByUid(uid(852))?.hidden && (item.itemId??-1)>0;
                item.flags=canClaim?6:0;item.actions=canClaim?["Claim to inventory","Claim to bank"]:undefined;}
            const x=16+(i%4)*cellW,y=76+Math.floor(i/4)*cellH;
            position(1000+i*2,x,y,cellW-6,cellH-4);
            position(1001+i*2,x+Math.floor((cellW-42)/2),y+Math.floor((cellH-36)/2));
        }
        const half=Math.floor((root.width-32)/2);
        position(851,56,undefined,root.width-76);
        position(848,16,undefined,half-4);position(849,16+half,undefined,half-4);
        position(852,44,undefined,half-32);position(853,18);
        position(854,44+half,undefined,half-32);position(855,18+half);
    },
});
