import assert from "node:assert/strict";
import { buildRewardPanel, rewardGridMetrics } from "@client/ui/widgets/custom/rewardDisplayPanel";
import { createPanelResizeController } from "@client/ui/widgets/uikit/ResizeController";
import { groundItemEditControls, clickGroundItemEdit } from "@client/features/plugins/grounditems/GroundItemEditControls";
const panel=buildRewardPanel(),root=panel.root!,group=root.groupId;
assert.equal(root.widthMode,0);assert.equal(root.rawWidth,480);assert.equal(root.rawHeight,334);
for(const height of [300,310,334]){
 const {cellH}=rewardGridMetrics(340,height);
 assert(cellH-4>=32,"native icon fits its cell at minimum supported height");
 assert(76+4*cellH<=height-66,"last reward row stays above claim buttons");
}
for(let i=0;i<16;i++){
 const icon=panel.widgets.get((group<<16)|(1001+i*2))!;
 assert.equal(icon.rawWidth,36);assert.equal(icon.rawHeight,32);
 assert.equal(icon.flags,6);
}
const host={width:512,height:334};let invalidations=0;
const wm:any={getInterfaceParentContainerUid:()=>1,getGroup:()=>({root}),isEffectivelyHidden:()=>false,
 getWidgetByUid:()=>host,invalidateWidget:()=>invalidations++,ensureLayout:()=>{},invalidateWidgetRender:()=>{}};
const frame:any={input:{clickMode2:1,clickMode3:1,clickMode1:1},mx:400,my:300,hits:[{uid:(group<<16)|863}],invalidateHoverCache:()=>{}};
const resize=createPanelResizeController(group,[860,861,862,863],340,300);
resize.process(frame,wm,{} as any);frame.mx=360;frame.my=280;
resize.process(frame,wm,{} as any);
assert.equal(root.rawWidth,400);assert.equal(root.rawHeight,300);assert(invalidations>0);
assert.equal(frame.input.clickMode3,0,"drag consumes world click");
frame.mx=900;frame.my=900;resize.process(frame,wm,{} as any);
assert.equal(root.rawWidth,512);assert.equal(root.rawHeight,334);
frame.input.clickMode2=0;resize.process(frame,wm,{} as any);
assert.equal(buildRewardPanel().root?.rawWidth,480,"new panel does not inherit another modal's dimensions");
const edits:any[]=[];groundItemEditControls.apply=(...args)=>edits.push(args);
groundItemEditControls.hits=[{x:10,y:20,width:20,height:16,name:"Coins",list:"hide"}];
assert(!clickGroundItemEdit(0,0));assert(clickGroundItemEdit(15,25));
assert.deepEqual(edits,[["Coins","hide"]]);groundItemEditControls.hits=[];
assert(!clickGroundItemEdit(15,25),"cleared overlays cannot consume stale clicks");
console.log("Reward sizing, native icon aspect, drag ownership and ground-item edit hits passed");
