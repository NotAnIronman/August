import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { IndexType } from "@august/osrs-engine/cache/IndexType";
import { SpriteLoader } from "@august/osrs-engine/sprite/SpriteLoader";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { buildMiningLocMap } from "@server/content/gamemodes/vanilla/skills/mining/miningData";
import { Model2DRenderer } from "@client/ui/runtime/model/Model2DRenderer";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";
import { tmpdir } from "node:os";
const data=loadCache(loadCacheList(loadCacheInfos()).latest),cache=CacheSystem.fromFiles("dat2",data.files);
const factory=getCacheLoaderFactory(data.info,cache),locs=factory.getLocTypeLoader(),wm=new WidgetManager(cache);
const map=buildMiningLocMap(locs).map,empty=locs.load(11393);
assert.equal(empty.name,'Empty wall');assert(empty.types?.includes(0));
for(const id of [11388,11389]) {assert.equal(map.get(id)?.depletedLocId,11393);assert.deepEqual(locs.load(id).types,[0]);}
wm.getGroup(595);wm.getGroup(868);
assert.equal(wm.getWidgetByUid((595<<16)|40)?.spriteId,2523);
for(const [child,sprite] of [[21,761],[22,1227],[27,1226]])assert.equal(wm.getWidgetByUid((868<<16)|child)?.spriteId,sprite);
assert.deepEqual(locs.load(32994).models,[[35414]]);assert.deepEqual(locs.load(51347).models,[[52413]]);
const modelRenderer=new Model2DRenderer(factory.getObjTypeLoader(),factory.getModelLoader(),factory.getTextureLoader());
// Software model projection uses only these canvas operations; capture the actual pixels.
(globalThis as any).document={createElement:()=>{const c:any={width:0,height:0};c.getContext=()=>({
    createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:(i:any)=>c.pixels=i.data});return c;}};
const width=420,height=205,pixels=Buffer.alloc(width*height*4);
for(let i=0;i<width*height;i++){pixels.set([65,59,48,255],i*4);}
const blit=(src:ArrayLike<number>,sw:number,sh:number,x:number,y:number,w:number,h:number)=>{
    for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
        const si=(Math.floor(dy*sh/h)*sw+Math.floor(dx*sw/w))*4,di=((y+dy)*width+x+dx)*4;
        if(src[si+3])for(let channel=0;channel<4;channel++)pixels[di+channel]=src[si+channel];
    }
};
for(const [index,id] of [6616,35414,52413].entries()){
    const result=modelRenderer.renderToCanvasExtents(id,{xan2d:320,yan2d:1768,zoom2d:1600,depthTest:true},112,112);
    assert(result,`chest model ${id} renders`);const c=result.canvas as any;
    assert(c.pixels.some((v:number,i:number)=>i%4===3&&v>0));
    const scale=Math.min(120/c.width,120/c.height);blit(c.pixels,c.width,c.height,index*140+10,10,Math.floor(c.width*scale),Math.floor(c.height*scale));
}
for(const [index,id] of [1227,1226,4552,761,1235,1361].entries()){
    const s=SpriteLoader.loadIntoIndexedSprite(cache.getIndex(IndexType.DAT2.sprites),id)!;assert(s);
    const rgba=new Uint8Array(s.subWidth*s.subHeight*4);
    s.pixels.forEach((p,i)=>{const color=s.palette[p];rgba.set([color>>16&255,color>>8&255,color&255,p?255:0],i*4);});
    blit(rgba,s.subWidth,s.subHeight,index*70+10,135,s.subWidth,s.subHeight);
}
// Optional developer preview, generated from cache pixels (not shipped assets).
if(process.env.LOOT_ASSET_PREVIEW){
    const crc=(b:Buffer)=>{let n=0xffffffff;for(const v of b){n^=v;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
    const chunk=(name:string,b:Buffer)=>{const t=Buffer.from(name),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(b.length);sum.writeUInt32BE(crc(Buffer.concat([t,b])));return Buffer.concat([len,t,b,sum]);};
    const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
    const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
    const path=join(tmpdir(),'august-loot-cache-assets.png');writeFileSync(path,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));console.log(path);
}
console.log('Cache-backed amethyst replacement, loot controls, resize grip and chest models passed');
