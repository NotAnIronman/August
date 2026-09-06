import assert from "node:assert/strict";
import {processWidgetKeyboardInput} from "@client/engine/game/widgets/input/widgetKeyboardInput";
let delivered=0,counts=0;
const widget={uid:162<<16,onKey:[1]};
const vm={inputDialogType:1,inputDialogWidgetId:-1,inputDialogString:"hello",onInputDialogComplete:()=>counts++};
let pending:any=null;
const deps:any={getCs2Vm:()=>vm,getPendingInputDialogAction:()=>pending,getPendingTradeQuantityAction:()=>null,
 getItemSpawnerUi:()=>({handleSearchKeyEvents:()=>false}),getVarManager:()=>({setVarcString(){}}),
 getEnterToTypeChat:()=>({handleKeyEvent:()=>false,shouldBlockChatboxKeys:()=>false,isUnlocked:false}),
 executeScriptListener:()=>delivered++};
const frame:any={input:{keyEvents:[{keyTyped:84,keyPressed:0}],keyArray:[]},mx:0,my:0,allRoots:[widget],visibleMap:new Map(),getStaticChildren:()=>[]};
const manager:any={interfaceParents:new Map()};
processWidgetKeyboardInput(deps,frame,manager);
assert.equal(delivered,1,"Enter in a private-message prompt reaches its native CS2 listener");
assert.equal(counts,0,"message text is never parsed as a quantity");
pending={};vm.inputDialogString="12";
processWidgetKeyboardInput(deps,frame,manager);
assert.equal(counts,1,"bank/trade numeric dialogs retain their count handler");
assert.equal(delivered,1,"numeric Enter is not dispatched twice");
console.log("Native chat prompts and numeric dialog isolation passed");
