import fs from "node:fs";
import { getCacheLoaderFactory } from "@august/osrs-engine/cache/loader/CacheLoaderFactory";
import { getCacheLoaderFactory as decoratedFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { initCacheEnv } from "@server/world/CacheEnv";
import { PICKLOCK_OPTION_AUDIT, PICKLOCK_CHESTS, PICKLOCK_DOORS, normalizePicklockOption } from "@server/content/gamemodes/vanilla/skills/thieving/picklockDefinitions";
import { serverVarPath, cacheGeneratedDataPath } from "@tools/lib/repository-paths";

// Read-only: pinned raw-cache evidence, not a cache exporter or content installer.
const env = initCacheEnv(serverVarPath("cache", "osrs"));
const factory = getCacheLoaderFactory(env.info, env.cacheSystem);
const locs = factory.getLocTypeLoader();
const decorated = decoratedFactory(env.info, env.cacheSystem).getLocTypeLoader();
const hasPick = (actions: readonly (string | null | undefined)[] | undefined) => actions?.some(a => normalizePicklockOption(a ?? undefined) === "picklock") ?? false;
const snapshot = JSON.parse(fs.readFileSync(cacheGeneratedDataPath("locs.json"), "utf8")) as {id:number;actions:(string|null)[]}[];
const snapshotIds = new Set(snapshot.filter(d => hasPick(d.actions)).map(d => d.id));
const direct: number[] = [], aliases: number[] = [];
for (let id=0; id<locs.getCount(); id++) {
    if(hasPick(locs.load(id).actions)) direct.push(id);
    else if(hasPick(decorated.load(id).actions)) aliases.push(id);
}
const directSet = new Set(direct);
const parents: {id:number;children:number[];varbit:number;varp:number}[] = [];
for(let id=0;id<locs.getCount();id++) {
    const loc=locs.load(id);
    const children=loc.transforms?.filter(child => directSet.has(child));
    if(children?.length) parents.push({id,children:[...new Set(children)],varbit:loc.transformVarbit,varp:loc.transformVarp});
}
const dispositions = direct.map(id => ({ id, name:locs.load(id).name,
    category: /chest/i.test(locs.load(id).name) ? "chest" : /door|gate/i.test(locs.load(id).name) ? "door" : "other",
    status: id===5490 ? "HAM implemented" : PICKLOCK_CHESTS.some(d=>d.locId===id) ? "reviewed chest" : PICKLOCK_DOORS.some(d=>d.locId===id && d.routes?.length) ? "reviewed door routes" : PICKLOCK_DOORS.some(d=>d.locId===id) ? "requirements only; physical route missing" : "no object implementation",
    gap:PICKLOCK_OPTION_AUDIT.find(g=>g.ids.includes(id))?.gap ?? "missing audit definition" }));
console.log(JSON.stringify({census:{rawCount:direct.length,rawIds:direct,decoratedOnlyIds:aliases,
    missingFromSnapshot:direct.filter(id=>!snapshotIds.has(id)),snapshotOnly:[...snapshotIds].filter(id=>!directSet.has(id)),
    morphParents:parents,dispositions}}));
const wanted = new Set([...direct, ...parents.map(p=>p.id), ...Array.from({length: 24}, (_, i) => 11719 + i)]);
const inspect = (id: number) => {
    const loc = locs.load(id);
    return {id, name: loc.name, actions: loc.actions, models: loc.models, types: loc.types,
        sizeX: loc.sizeX, sizeY: loc.sizeY, transforms: loc.transforms, seqId: loc.seqId,
        clipType: loc.clipType, offsetX: loc.offsetX, offsetY: loc.offsetY, offsetHeight: loc.offsetHeight};
};
console.log(JSON.stringify({cache:env.info, definitions:[...wanted].filter(id => id >=11735 && id<=11742).map(inspect)}));
const refs = [11719,11720,11727,5501].map(id => locs.load(id));
for(let id=0;id<locs.getCount();id++) {
    const loc = locs.load(id);
    if ((loc.models?.flat().includes(1226)) || (loc.actions?.some(a => a?.toLowerCase() === "close") && refs.some(r => JSON.stringify(r.models) === JSON.stringify(loc.models))))
        console.log(JSON.stringify({matchingDoor:inspect(id)}));
}
const maps = factory.getMapFileLoader();
let decoded = 0, unavailable = 0;
const placementsById = new Map<number, number>();
for(let mx=0;mx<256;mx++) for(let my=0;my<256;my++) {
    if(env.mapFileIndex.getLocArchiveId(mx,my) < 0) continue;
    const data=maps.getLocData(mx,my,env.xteas);
    if(!data) {unavailable++;continue;}
    try {
    const found: number[] = [];
    const b=new ByteBuffer(data);let id=-1,delta=0;
    while(b.remaining>0 && (delta=b.readSmart3())!==0) {
        id+=delta;let pos=0,pd=0;
        while(b.remaining>0 && (pd=b.readUnsignedSmart())!==0) {
            pos+=pd-1;const attrs=b.readUnsignedByte();
            if(wanted.has(id)) found.push(id);
            if(wanted.has(id) && (id>=11719 && id<=11728 || id>=11735 && id<=11742 || id===5501)) console.log(JSON.stringify({placement:{id,x:mx*64+((pos>>6)&63),y:my*64+(pos&63),level:(pos>>12)&3,type:attrs>>2,rotation:attrs&3}}));
        }
    }
    decoded++;
    for(const id of found) placementsById.set(id,(placementsById.get(id)??0)+1);
    } catch { unavailable++; console.log(JSON.stringify({decodeFailure:{mx,my}})); }
}
console.log(JSON.stringify({decoded,unavailable,placementCounts:[...wanted].map(id=>({id,count:placementsById.get(id)??0})),
    caveat:"Zero static placements does not mean unused: morph children and dynamic activity spawns exist. Unavailable map regions are not claimed covered."}));
