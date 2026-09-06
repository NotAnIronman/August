import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { LocType } from "@august/osrs-engine/config/loctype/LocType";
import type { LocTypeLoader } from "@august/osrs-engine/config/loctype/LocTypeLoader";
/** Teammates' chest forms are visual only, on both client and server. */
export class TheatreLocTypeLoader implements LocTypeLoader {
    private readonly overrides=new Map<number,LocType>();
    constructor(private readonly base:LocTypeLoader,private readonly info:CacheInfo){}
    load(id:number):LocType {
        const source=this.base.load(id);
        if(this.info.game!=="oldschool" || (id!==32990 && id!==32991))return source;
        let clone=this.overrides.get(id);
        if(!clone){clone=Object.assign(new LocType(id,this.info),source);clone.actions=[...source.actions];
            clone.actions.forEach((action,slot)=>{if(action?.toLowerCase()==="open")delete clone!.actions[slot];});this.overrides.set(id,clone);}
        return clone;
    }
    getCount():number{return this.base.getCount();}
    clearCache():void{this.overrides.clear();this.base.clearCache();}
}
