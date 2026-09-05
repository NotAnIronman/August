import assert from "node:assert/strict";
import { PlayerRaidState } from "@server/game/state/PlayerRaidState";
import { BankingManager } from "@server/content/gamemodes/vanilla/banking/BankingManager";
import { TradeManager } from "@server/game/trade/TradeManager";
import { GroundItemHandler } from "@server/network/managers/GroundItemHandler";
import { MovementService } from "@server/game/services/MovementService";
import { createLogoutHandler } from "@server/network/handlers/logoutHandler";

function protectedPlayer() {
    const state=new PlayerRaidState();
    state.set({version:1,raid:"theatre-of-blood",runId:"guard-test",completedRooms:2,
        access:"solo",roster:["tester"],status:"disconnected"});
    let accept=()=>{},count=0;
    const events:string[]=[];
    state.confirm=(action,cb)=>{events.push(`prompt:${action}`);accept=cb;};
    state.persist=()=>events.push("save");
    const retry=()=>{assert.equal(state.checkpoint,undefined);events.push("retry");count++;};
    return {p:{id:1,raidProgress:state,canLogout:()=>true} as any,state,events,retry,
        accept:()=>accept(),count:()=>count};
}
{
    const f=protectedPlayer();
    BankingManager.prototype.openBank.call({openBank:f.retry} as any,f.p);
    assert.deepEqual(f.events,["prompt:open a bank"]);f.accept();
    assert.deepEqual(f.events,["prompt:open a bank","save","retry"]);
}
{
    const f=protectedPlayer();
    TradeManager.prototype.requestTrade.call({requestTrade:f.retry,svc:{ticker:{currentTick:()=>10}}} as any,f.p,{} as any,1);
    assert.equal(f.count(),0);f.accept();assert.equal(f.count(),1);
}
{
    const f=protectedPlayer();
    GroundItemHandler.prototype.attemptTakeGroundItem.call({attemptTakeGroundItem:f.retry} as any,f.p,{x:1,y:1,level:0},995,1);
    assert.deepEqual(f.events,["prompt:pick up items"]);f.accept();assert.equal(f.count(),1);
}
{
    const f=protectedPlayer();
    GroundItemHandler.prototype.handleArrivedGroundItemInteraction.call({
        isTakeOption:()=>true,handleArrivedGroundItemInteraction:f.retry,
    } as any,f.p,{option:"take"} as any);
    assert.equal(f.count(),0);f.accept();assert.equal(f.count(),1,"scripted Take is guarded too");
}
{
    const f=protectedPlayer();
    MovementService.prototype.teleportPlayer.call({teleportPlayer:f.retry} as any,f.p,1,2,0);
    assert.equal(f.count(),0);f.accept();assert.equal(f.count(),1);
}
{
    const f=protectedPlayer();
    let messages=0;
    const result=MovementService.prototype.requestTeleportAction.call({requestTeleportAction:f.retry,
        services:{scriptRuntime:{getServices:()=>({messaging:{sendGameMessage:()=>messages++}})}}
    } as any,f.p,{x:1,y:2,level:0});
    assert.deepEqual(result,{ok:false,reason:"confirmation_required"});
    f.accept();assert.equal(f.count(),0,"lower-level teleport cannot replay without spell/item cost checks");
    assert.equal(messages,1);
}
{
    const f=protectedPlayer();
    const handler=createLogoutHandler({getPlayer:()=>f.p,completeLogout:f.retry} as any);
    handler({ws:{}} as any);assert.equal(f.count(),0);f.accept();assert.equal(f.count(),1);
}
console.log("Theatre bank/trade/ground/scripted-pickup/teleport/logout entry-point guards passed");
