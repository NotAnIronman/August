import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices, LocInteractionEvent } from "@server/game/scripts/types";
import type { TemporaryLocChange } from "@server/game/services/LocationService";
import { getRuneDay } from "@server/game/time/RuneDay";
import { isCollectionLogItem } from "@server/game/collectionlog";
import { TheatreRuns } from "./TheatreRun";
import { ELITE_CLUE, THEATRE_PET } from "./rewards";
import { THEATRE_OUTSIDE } from "./rooms";
import { VAULT_CHESTS, VAULT_COPY, VAULT_CRYSTAL, VAULT_CRYSTAL_TILE, VAULT_ENTRANCE,
    VAULT_SCENE_BASE, VAULT_STAIRS, VERZIK_STAIRS_TILE, chestId } from "./vault";

const account=(p:PlayerState)=>(p.__saveKey||p.name).trim().toLowerCase();
export const THEATRE_LOG_STRUCT=506;
export class TheatreVaultController {
    private readonly changes=new Map<string,{instanceId:string;change:TemporaryLocChange}>();
    private readonly previewOpened=new Set<string>();
    constructor(private readonly services:ScriptServices,private readonly completedPreview:(p:PlayerState)=>boolean){}
    private runs(){const store=this.services.instances.theatreRuns;return store?new TheatreRuns(this.services.instances,store):undefined;}
    private message(p:PlayerState,text:string){this.services.messaging.sendGameMessage(p,text);}
    private preview(p:PlayerState):boolean {
        const instance=this.services.instances.get(p.id);
        return !!instance?.definitionId?.startsWith("theatre-vault-preview:") && instance.worldViewId===p.worldViewId &&
            instance.memberPlayerIds.includes(p.id) && !!this.services.system.isDeveloper?.(p);
    }
    private put(instanceId:string,id:number,tile:{x:number;y:number},rotation:number,ownerPlayerId?:number):void {
        const instance=this.services.instances.getById(instanceId);if(!instance)return;
        const key=`${instanceId}:${instance.worldViewId}:${ownerPlayerId??"*"}:${tile.x}:${tile.y}`;
        if(this.changes.get(key)?.change.newId===id)return;
        const change=this.services.location.replaceTemporaryLoc({worldViewId:instance.worldViewId,ownerPlayerId},0,id,tile,0,
            {oldShape:10,newShape:10,newRotation:rotation});
        this.changes.set(key,{instanceId,change});
    }
    unlock(instanceId:string):void {this.put(instanceId,VAULT_STAIRS,VERZIK_STAIRS_TILE,0);}
    sync(player:PlayerState):void {
        const instance=this.services.instances.get(player.id);
        if(!instance || player.level!==0)return;
        const run=this.runs()?.vaultCurrent(player),preview=this.preview(player);
        if(!run && !preview)return;
        const rewards=run?.rewards??[{unique:false,claimed:this.previewOpened.has(instance.id)}];
        rewards.forEach((reward,index)=>{
            const tile=VAULT_CHESTS[index];
            this.put(instance.id,chestId(false,reward.unique,reward.claimed),tile,tile.rotation);
            for(const member of this.services.instances.getMemberPlayers(instance.id)) {
                if(preview || run?.roster[index]===account(member))
                    this.put(instance.id,chestId(true,reward.unique,reward.claimed),tile,tile.rotation,member.id);
            }
        });
    }
    stairs(event:LocInteractionEvent):void {
        const {player,tile}=event,t=VERZIK_STAIRS_TILE;
        if(event.locId!==VAULT_STAIRS || event.level!==0 || player.level!==0 || !player.canInteract() ||
            (event.action && event.action.toLowerCase()!=="climb") || tile.x!==t.x || tile.y!==t.y ||
            !this.services.location.isAdjacentToLoc(player,VAULT_STAIRS,tile,0))return;
        const instance=this.services.instances.get(player.id);
        if(!instance || instance.worldViewId!==player.worldViewId ||
            !this.services.location.hasTemporaryLocVisibleToPlayer(player,VAULT_STAIRS,tile,0))return;
        if(this.completedPreview(player)) {
            this.services.instances.create(player,{definitionId:`theatre-vault-preview:${instance.id}`,access:"solo",
                sceneBase:VAULT_SCENE_BASE,templateChunks:this.services.instances.buildTemplate([VAULT_COPY]),
                destination:VAULT_ENTRANCE,exit:THEATRE_OUTSIDE});
            this.message(player,"Development vault: chest visuals can be tested, but previews award no loot.");
        } else if(!this.runs()?.enterVault(player)){this.message(player,"Complete Verzik before entering the vault.");return;}
        this.sync(player);
    }
    open(event:LocInteractionEvent):void {
        const {player,tile}=event;
        if(!player.canInteract() || event.level!==0 || player.level!==0 ||
            ![32992,32993,32994,41746].includes(event.locId) ||
            (event.action && !["open","search"].includes(event.action.toLowerCase())))return;
        const instance=this.services.instances.get(player.id);if(!instance)return;
        const run=this.runs()?.vaultCurrent(player),preview=this.preview(player);
        const index=preview?0:run?.roster.indexOf(account(player))??-1;
        const expected=VAULT_CHESTS[index];
        if(!expected || tile.x!==expected.x || tile.y!==expected.y ||
            !this.services.location.isAdjacentToLoc(player,event.locId,tile,0) ||
            !this.services.location.hasTemporaryLocVisibleToPlayer(player,event.locId,tile,0))return;
        if(preview){this.previewOpened.add(instance.id);this.sync(player);this.message(player,"Preview chest opened. No rewards are granted in development previews.");return;}
        const reward=run?.rewards?.[index];
        if(!run || !reward)return;
        if(reward.claimed){this.message(player,"You have already claimed this chest.");return;}
        const store=this.services.instances.theatreRuns;
        if(!store?.claim){this.message(player,"Reward storage is unavailable. Your chest has been kept safe.");return;}
        const inventory=player.items.getInventoryEntries().map(i=>({...i}));
        const log=player.collectionLog.serialize(),pending=[...player.followers.getPendingRewards()],first=player.followers.getFirstPetDrops();
        let inventoryFull=false;
        try {
            for(const item of reward.items) {
                // The game's ordinary elite clue restriction also applies here.
                if(item.itemId===ELITE_CLUE && this.services.inventory.findOwnedItemLocation(player,ELITE_CLUE))continue;
                if(player.items.addItem(item.itemId,item.quantity).completed!==item.quantity){inventoryFull=true;throw new Error("inventory full");}
                const obj=this.services.data.getObjType(item.itemId);
                const logId=obj && obj.noteTemplate>=0?obj.note:item.itemId;
                if(isCollectionLogItem(logId)){player.collectionLog.addItem(logId,item.quantity);player.collectionLog.recordItemUnlock(logId,getRuneDay());}
            }
            player.collectionLog.incrementCategoryStat(THEATRE_LOG_STRUCT);
            if(reward.pet) {
                if(!player.collectionLog.hasItem(THEATRE_PET))player.followers.recordFirstPetDrop(THEATRE_PET,{
                    bossNpcTypeId:8374,bossName:"Theatre of Blood",killcount:player.collectionLog.getCategoryStat(THEATRE_LOG_STRUCT)!.count1});
                // The normal pet-delivery tick summons it, or falls back to inventory/bank.
                // Queue + claim + inventory are committed together, before any summon.
                player.followers.deferReward(THEATRE_PET,1);
                player.collectionLog.addItem(THEATRE_PET);player.collectionLog.recordItemUnlock(THEATRE_PET,getRuneDay());
            }
            reward.claimed=true;
            store.claim(run,player);
        } catch(error) {
            player.items.inventory=inventory;player.items.inventoryDirty=true;
            player.collectionLog.deserialize(log);player.followers.setPendingRewards(pending);player.followers.setFirstPetDrops(first);
            reward.claimed=false;
            this.services.inventory.snapshotInventory(player);
            this.message(player,inventoryFull?"Make enough inventory space for the entire reward, then open your chest again.":"Your reward could not be saved. Nothing was claimed; please try again.");
            if(!inventoryFull)this.services.system.logger.error("Theatre reward claim failed",error);
            return;
        }
        this.services.inventory.snapshotInventory(player);
        this.services.collectionLog.sendCollectionLogSnapshot(player);
        this.sync(player);
        this.message(player,"You claim your Theatre of Blood reward.");
        if(reward.pet)this.message(player,`Lil' zik joins your collection at ${player.collectionLog.getCategoryStat(THEATRE_LOG_STRUCT)!.count1} Theatre completions!`);
    }
    exit(event:LocInteractionEvent):void {
        const {player,tile}=event,t=VAULT_CRYSTAL_TILE;
        if(event.locId!==VAULT_CRYSTAL || event.level!==0 || player.level!==0 || !player.canInteract() ||
            (event.action && event.action.toLowerCase()!=="use") || tile.x!==t.x || tile.y!==t.y ||
            !this.services.location.isAdjacentToLoc(player,VAULT_CRYSTAL,tile,0))return;
        if(this.preview(player)){this.services.instances.leave(player,THEATRE_OUTSIDE);return;}
        const runs=this.runs(),run=runs?.vaultCurrent(player);if(!run)return;
        if(!run.rewards?.[run.roster.indexOf(account(player))]?.claimed) {
            // The existing single-use progress-loss confirmation clears and
            // saves the checkpoint before allowing an unclaimed reward to be left.
            player.raidProgress.guard("leave",()=>this.services.instances.leave(player,THEATRE_OUTSIDE));return;
        }
        runs!.leaveVault(player);
    }
    prune(all=false):void {
        for(const [key,{instanceId,change}] of this.changes) {
            const instance=this.services.instances.getById(instanceId);
            if(!all && instance?.worldViewId===change.scope.worldViewId &&
                (change.scope.ownerPlayerId===undefined || instance.memberPlayerIds.includes(change.scope.ownerPlayerId)))continue;
            this.services.location.clearTemporaryLoc(change.scope,change.oldId,change.tile,change.level,change.oldShape);
            this.changes.delete(key);this.previewOpened.delete(instanceId);
        }
    }
    register(registry:IScriptRegistry):void {
        for(const [id,action,handler] of [
            [VAULT_STAIRS,"climb",(e:LocInteractionEvent)=>this.stairs(e)],
            [VAULT_CRYSTAL,"use",(e:LocInteractionEvent)=>this.exit(e)],
            ...[32992,32993,32994,41746].map(id=>[id,id===32992||id===32993?"open":"search",(e:LocInteractionEvent)=>this.open(e)] as const),
        ] as const){registry.registerLocInteraction(id,handler,action);registry.registerLocInteraction(id,handler);}
        registry.registerZone({id:"theatre-vault",minX:3216,maxX:3255,minY:4296,maxY:4343,levels:[0]},
            {enter:({player})=>this.sync(player),step:({player})=>this.sync(player)});
        registry.registerTickHandler(()=>this.prune());registry.registerCleanup(()=>this.prune(true));
    }
}
