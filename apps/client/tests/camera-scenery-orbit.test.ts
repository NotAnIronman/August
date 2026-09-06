import assert from "node:assert/strict";
import { mat4, vec3 } from "gl-matrix";
import { Camera } from "@client/engine/rendering/camera/Camera";
import { updateCameraFollow } from "@client/engine/rendering/render/camera2";

function follow(pressure:number,raisedFloor=false) {
    const camera=new Camera(0,0,0,64,1024);
    const heights=new Int16Array(4*65*65);if(raisedFloor)heights.fill(100);
    const map={mapX:50,mapY:50,heightMapSize:65,borderSize:0,heightMapData:heights,getTileRenderFlag:()=>0};
    const host:any={osrsClient:{camera,playerEcs:{getX:()=>3210*128,getY:()=>3210*128,getLevel:()=>0},
            zoomWidth:320,zoomHeight:256,camFollowHeight:50},
        getControlledPlayerEcsIndex:()=>0,getControlledPlayerWorldViewId:()=>-1,
        playerPosUni:new Float32Array(2),followCamFocalInitialized:false,followCamFocalLastClientCycle:-1,
        cameraTerrainPitchPressure:pressure,cameraShakeEnabled:[],cameraShakeWaveAmplitude:[],
        getSceneViewportWidgetRect:()=>({width:1000,height:700}),app:{width:1000,height:700},
        followCamRot:mat4.create(),followCamForward:vec3.create(),followCamForwardAxis:vec3.fromValues(0,0,-1),
        mapManager:{getMap:()=>map},mapDataLoadedNotified:true,
        updateCameraTerrainPitchPressure(){this.cameraTerrainPitchPressure=98048;}};
    updateCameraFollow(host,1/50);
    return {camera,host};
}
const flat=follow(32768),wall=follow(98048),raised=follow(98048,true);
assert.deepEqual(Array.from(wall.camera.pos),Array.from(flat.camera.pos),"nearby raised scenery cannot increase orbit distance");
assert.equal(wall.camera.pitch,64,"user-selected pitch is retained");
assert.equal(wall.host.cameraTerrainPitchPressure,32768,"stale pressure is cleared, not slowly carried into raids");
assert.equal(raised.camera.getPosX(),flat.camera.getPosX());
assert.equal(raised.camera.getPosZ(),flat.camera.getPosZ());
assert(Math.abs(raised.camera.getPosY()-flat.camera.getPosY()+6.25)<0.00001,"actual floor height still follows the player");
console.log("Camera: stable orbit near scenery, no stale terrain pullback, unchanged manual pitch and true floor-height follow passed");
