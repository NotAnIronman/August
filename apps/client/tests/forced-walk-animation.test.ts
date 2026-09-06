import assert from "node:assert/strict";
import type { SeqTypeLoader } from "@august/osrs-engine/config/seqtype/SeqTypeLoader";
import type { SeqFrameLoader } from "@august/osrs-engine/model/seq/SeqFrameLoader";
import { PlayerEcs } from "@client/engine/game/ecs/PlayerEcs";
import { PlayerAnimController } from "@client/engine/game/PlayerAnimController";

// Cache-237 walk 819: eight six-cycle frames, frameStep=-1 (not an action loop).
const loader={load:(id:number)=>({id,frameIds:[1,2,3,4,5,6,7,8],frameStep:-1,maxLoops:99,
    forcedPriority:5,replyMode:2,priority:0,precedenceAnimating:0,
    isSkeletalSeq:()=>false,getFrameLength:()=>6,frameLengths:[6,6,6,6,6,6,6,6]})} as unknown as SeqTypeLoader;
function fixture(seq=819,forced=true){
    const ecs=new PlayerEcs(),index=ecs.allocatePlayer(1);
    ecs.setSeqTypeLoader(loader);ecs.teleport(index,10,16,0);
    const animations=new PlayerAnimController(ecs,loader,{} as SeqFrameLoader);
    animations.handleServerSequence(1,seq);
    if(forced)ecs.startForcedMovement(index,1,181,1344,1344,1344,2112,1024);
    return {ecs,index,animations,step:()=>{ecs.updateClient(1);animations.tick(1);}};
}
{
    const f=fixture();let previous=0;
    for(let cycle=1;cycle<=181;cycle++){
        f.step();
        assert.equal(f.animations.getSequenceState(1)?.seqId,819,`gait remains active at cycle ${cycle}`);
        const y=f.ecs.getY(f.index);
        if(cycle>1)assert(y>previous,"walking position advances each cycle, not only at frame boundaries");
        previous=y;
    }
    assert.equal(f.ecs.getY(f.index),2112,"the full six-tile move reaches its destination");
    f.animations.handleServerSequence(1,-1);assert.equal(f.animations.getSequenceState(1),undefined);
}
for(const [sequence,forced] of [[819,false],[1234,true]] as const){
    const f=fixture(sequence,forced);
    for(let cycle=0;cycle<60;cycle++)f.step();
    assert.equal(f.animations.getSequenceState(1),undefined,"ordinary actions/knockback must not become infinite loops");
}
{
    const f=fixture();
    for(let cycle=0;cycle<250;cycle++)f.step();
    assert.equal(f.animations.getSequenceState(1),undefined,"walk still ends if its server clear packet is delayed");
}
console.log("Forced walking loops the full six-tile move smoothly; normal actions and knockback remain one-shot");
