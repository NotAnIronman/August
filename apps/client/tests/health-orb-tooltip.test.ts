import assert from "node:assert/strict";
import { updateHealthOrbTooltip, getHealthOrbTooltipSnapshot, clearHealthOrbTooltip } from "@client/features/health-orb/HealthOrbTooltip";
import { HEALTH_ORB_CURE_WIDGETS, HEALTH_ORB_TIMER_VARPS } from "@august/protocol/ui/healthOrb";

const values = new Map([[102,1_000_012],[HEALTH_ORB_TIMER_VARPS.elapsed,54],
    [HEALTH_ORB_TIMER_VARPS.nextHit,8],[HEALTH_ORB_TIMER_VARPS.remaining,-1]]);
const vars = {getVarp:(id:number)=>values.get(id) ?? 0} as never;
const canvas = {width:800,height:600,getBoundingClientRect:()=>({left:10,top:20,width:400,height:300})} as HTMLCanvasElement;
updateHealthOrbTooltip([{uid:HEALTH_ORB_CURE_WIDGETS[0]}],200,100,vars,canvas);
assert.deepEqual(getHealthOrbTooltipSnapshot(),{x:110,y:70,text:"Venomed for 54s\nNext hit: 12 damage in 8s\nLasts until cured"});
values.set(102,12); values.set(HEALTH_ORB_TIMER_VARPS.remaining,1060);
updateHealthOrbTooltip([{uid:HEALTH_ORB_CURE_WIDGETS[1]}],200,100,vars,canvas);
assert.match(getHealthOrbTooltipSnapshot()!.text,/Poisoned for 54s/);
assert.match(getHealthOrbTooltipSnapshot()!.text,/Wears off in 1060s/);
clearHealthOrbTooltip();
assert.equal(getHealthOrbTooltipSnapshot(),null,"layout reset removes stale tooltip");
updateHealthOrbTooltip([],200,100,vars,canvas);
assert.equal(getHealthOrbTooltipSnapshot(),null,"unrelated widgets must not show health tooltip");
values.set(102,0);
updateHealthOrbTooltip([{uid:HEALTH_ORB_CURE_WIDGETS[0]}],200,100,vars,canvas);
assert.equal(getHealthOrbTooltipSnapshot(),null,"cured status removes tooltip");
console.log("Health orb tooltip: poison/venom timing, CSS coordinates and reset passed");
