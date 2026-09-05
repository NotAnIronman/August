import assert from "node:assert/strict";
import { loadDebugIds, saveDebugIds } from "@client/features/sidebar/developmentPreferences";
import { worldEntriesToSimple } from "@client/ui/runtime/menu/MenuBridge";
import { MenuTargetType } from "@august/osrs-engine/MenuEntry";

const previous = globalThis.window;
try {
    const data = new Map<string,string>();
    Object.assign(globalThis,{window:{localStorage:{getItem:(key: string)=>data.get(key) ?? null,setItem:(key: string,value: string)=>data.set(key,value)}}});
    assert.equal(loadDebugIds(),false);
    saveDebugIds(true);
    assert.equal(loadDebugIds(),true,"ID preference survives a new client load");
    for (const targetType of [MenuTargetType.LOC,MenuTargetType.NPC,MenuTargetType.OBJ]) {
        const entries = [{option:"Examine",targetType,targetId:1530,targetName:"Test object",targetLevel:-1}];
        const enabled = worldEntriesToSimple(entries,{label:{includeExamineIds:loadDebugIds()}});
        assert.match(enabled[0].target!,/1530/,"Examine shows the authored ID");
        assert.equal(enabled[0].targetId,1530,"presentation must not change the interaction target");
        const disabled = worldEntriesToSimple(entries,{label:{includeExamineIds:false}});
        assert(!disabled[0].target!.includes("1530"));
    }
    saveDebugIds(false); assert.equal(loadDebugIds(),false);
    Object.defineProperty(window,"localStorage",{get:()=>{throw new Error("storage disabled");}});
    assert.equal(loadDebugIds(),false);
    assert.doesNotThrow(()=>saveDebugIds(true));
} finally { Object.assign(globalThis,{window:previous}); }
console.log("Development IDs: saved preference, safe storage failure and Examine labels passed");
