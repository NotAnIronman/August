import assert from "node:assert/strict";
import {VertexBuffer} from "@client/engine/rendering/buffer/VertexBuffer";
async function main() {
Object.assign(globalThis,{self:globalThis});
const {initTextures}=await import("@client/engine/rendering/render/textures/setup");
const ids=[0,40,59,60];
const host:any={osrsClient:{textureLoader:{getTextureIds:()=>ids,isSd:()=>true}},textureIdIndexMap:new Map(),textureFrameCounts:new Map(),initTextureArray(){},initMaterialsTexture(){}};
initTextures(host);
for(const id of [40,59]){
 const packed=new VertexBuffer(1);
 packed.addVertex(0,0,0,127,255,0,0,host.textureIdIndexMap.get(id));
 const v1=packed.view.getUint32(4,true),v2=packed.view.getUint32(8,true);
 const hsl=(v1>>>15)&0xffff;
 const shaderLayer=((hsl>>>7)|(((v2>>>5)&1)<<9))+1;
 assert.equal(shaderLayer,ids.indexOf(id)+1,"dynamic cape must sample the same uploaded layer as map models");
}
console.log("Dynamic fire/infernal texture layer packing passed");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
