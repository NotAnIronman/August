import assert from "node:assert/strict";
import { drawChooseOptionMenu } from "@client/ui/widgets/gl/widgets-gl/menu/ChooseOptionMenu";
import { shouldSkipWidgetPointerInput } from "@client/engine/game/widgets/input/widgetClickGuard";
(globalThis as any).document={createElement:()=>({getContext:()=>({measureText:(s:string)=>({width:s.length*6})})})};
let releases=0,cancelled=0,consumed=0;
const client:any={menuOpen:false,menuJustClosed:false,inputManager:{mouseX:700,mouseY:500,clickMode3:0},
    releaseContextMenuWidgetInput:()=>releases++,closeWorldMenu:()=>client.menuOpen=false};
const canvas:any={width:800,height:600,clientWidth:800,clientHeight:600,__osrsClient:client,
    __ui:{},__clicks:{unregister(){},cancelActiveClick:()=>cancelled++},__inputBridge:{consumeClick:()=>consumed++}};
const renderer:any={canvas,width:800,height:600};
const deps:any={getRenderer:()=>renderer,getMenuOpen:()=>client.menuOpen,getMenuJustClosed:()=>client.menuJustClosed,
    setMenuJustClosed:(v:boolean)=>client.menuJustClosed=v};
for(let i=0;i<3;i++){
    canvas.__ui.menu={open:true,source:"widgets",x:100,y:100,entries:[{option:"Claim to bank"}]};
    assert(shouldSkipWidgetPointerInput(deps));
    drawChooseOptionMenu(renderer,{fontLoader:(()=>undefined) as any,requestRender(){}});
    assert.equal(canvas.__ui.menu,undefined,"moving outside dismisses the loot menu");
    assert.equal(canvas.__ui.__menuRt,undefined);
    assert(shouldSkipWidgetPointerInput(deps),"one dismissal frame is consumed");
    assert(!shouldSkipWidgetPointerInput(deps),"the next right click can reach widgets");
}
assert.equal(releases,3);assert.equal(cancelled,3);assert.equal(consumed,3);
console.log("Repeated loot-menu hover dismissal releases widget and pointer ownership");
