import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { LockState } from "@server/game/model/LockState";
import { PredicateCondition, type QueueTask } from "@server/game/model/queue";
import type { IScriptRegistry, ScriptServices, LocInteractionEvent, NpcInteractionEvent } from "@server/game/scripts/types";
import type { QuestInstanceHandle } from "@server/world/InstancedAreaManager";
import { TheatreRuns } from "./TheatreRun";
import { THEATRE_COMBAT_STATS, theatreHitpoints } from "@server/data/theatreCombatStats";
import { THEATRE_ROOMS, theatreRoomGeometry } from "./rooms";
import { TheatreVaultController } from "./TheatreVaultController";
import { THEATRE_ARENAS, THEATRE_BARRIER_ID, VERZIK_WALK_DESTINATION, arenaGateDestination,
    VERZIK_COMBAT_ID, THEATRE_SKELETON_ID, THEATRE_SKELETON_TILE, DAWNBRINGER_ID } from "./arenas";

interface ArenaState {
    instance: QuestInstanceHandle;
    index: number;
    boss: NpcState;
    phase: "waiting" | "started" | "complete";
}

/** Private-room presentation and entry. Boss combat plugs in after this stage. */
export class TheatreArenaController {
    private readonly states = new Map<string,ArenaState>();
    private readonly crossing = new WeakMap<PlayerState,QueueTask<PlayerState>>();
    private readonly conversations = new WeakMap<PlayerState,object>();
    private readonly pendingCompletions=new Set<string>();
    readonly vault:TheatreVaultController;
    constructor(private readonly services: ScriptServices) {
        this.vault=new TheatreVaultController(services,p=>{
            const context=this.context(p),state=context && this.states.get(context.instance.id);
            return !!context?.instance.definitionId?.startsWith("theatre-preview:") && context.index===5 && state?.phase==="complete";
        });
    }

    private isCrossing(player: PlayerState): boolean {
        return this.crossing.get(player)?.completed() === false;
    }

    private context(player: PlayerState) {
        const instance = this.services.instances.get(player.id);
        if (!instance || instance.worldViewId !== player.worldViewId || !instance.memberPlayerIds.includes(player.id)) return;
        const parts = instance.definitionId?.split(":");
        if (!parts || !["theatre-of-blood","theatre-preview"].includes(parts[0])) return;
        const index = Number(parts[parts.length-1]);
        const room = THEATRE_ROOMS[index];
        if (!Number.isInteger(index) || !room || player.level !== room.entrance.level) return;
        if (parts[0] === "theatre-of-blood") {
            const store = this.services.instances.theatreRuns;
            const current = store && new TheatreRuns(this.services.instances,store).current(player);
            if (!current || current.roomIndex !== index || current.instanceId !== instance.id) return;
        } else if (!this.services.system.isDeveloper?.(player)) return;
        return {instance,index,room};
    }

    private scaleBoss(player: PlayerState, boss: NpcState): void {
        const stats = THEATRE_COMBAT_STATS[boss.typeId];
        if (!stats) return; // Verzik's conversational form has no combat profile.
        const store = this.services.instances.theatreRuns;
        const run = store && new TheatreRuns(this.services.instances,store).current(player);
        boss.configureHitpoints(theatreHitpoints(stats.hitpoints,run?.roster.length ?? 1));
    }

    private spawnBoss(player: PlayerState, typeId: number): NpcState | undefined {
        const context = this.context(player);
        if (!context) return;
        const spawn = THEATRE_ARENAS[context.room.id].boss;
        const boss = this.services.npc.spawnNpc({
            ...spawn, id:typeId, level:context.room.entrance.level, worldViewId:context.instance.worldViewId,
            // Visibility/cleanup belongs to the instance, not its first entrant.
            isAggressive:false,isUnattackable:true,isImmovable:true,wanderRadius:0,respawns:false,
            immunities:{poison:true,venom:true},
        });
        if (!boss) return;
        boss.suppressDrops = true;
        let attached: boolean;
        try {
            this.scaleBoss(player,boss);
            attached = this.services.instances.attachNpc(context.instance.id,boss);
        }
        catch (error) { this.services.npc.removeNpc(boss.id); throw error; }
        if (!attached) {
            this.services.npc.removeNpc(boss.id);
            return;
        }
        return boss;
    }

    private ensure(player: PlayerState): ArenaState | undefined {
        const context = this.context(player);
        if (!context) return;
        const old = this.states.get(context.instance.id);
        if (old && old.instance.worldViewId === context.instance.worldViewId &&
            old.instance.definitionId === context.instance.definitionId) return old;
        const store=this.services.instances.theatreRuns;
        const run=store && new TheatreRuns(this.services.instances,store).current(player);
        if(run && run.completedRooms>run.roomIndex) {
            if(context.index===5)this.vault.unlock(context.instance.id);
            return; // Never resurrect a completed boss after a module reload.
        }
        const boss = this.spawnBoss(player,THEATRE_ARENAS[context.room.id].boss.id);
        if (!boss) return;
        const state: ArenaState = {instance:context.instance,index:context.index,boss,phase:"waiting"};
        this.states.set(context.instance.id,state);
        return state;
    }

    private live(player: PlayerState, state: ArenaState): boolean {
        const context = this.context(player);
        return context?.instance.id === state.instance.id &&
            context.instance.worldViewId === state.instance.worldViewId &&
            context.instance.definitionId === state.instance.definitionId &&
            state.boss.worldViewId === context.instance.worldViewId &&
            (state.phase==="complete" || this.services.combat.getNpc(state.boss.id) === state.boss);
    }

    private start(player: PlayerState, state: ArenaState): void {
        if (!this.live(player,state) || state.phase !== "waiting") return;
        const room = THEATRE_ROOMS[state.index];
        // Use the cache's attackable throne form, keeping the conversation form
        // intact if spawning or the durable start fails.
        const replacement = room.id === "verzik" ? this.spawnBoss(player,VERZIK_COMBAT_ID) : undefined;
        if (room.id === "verzik" && !replacement) {
            this.services.messaging.sendGameMessage(player,"Verzik could not start. Please try talking to her again.");
            return;
        }
        let started = false;
        try {
            if (state.instance.definitionId?.startsWith("theatre-of-blood:")) {
                const store = this.services.instances.theatreRuns;
                started = !!store && new TheatreRuns(this.services.instances,store).startRoom(state.instance.id,room.id);
            } else { this.services.instances.markStarted(state.instance.id); started = true; }
        } finally {
            if (!started && replacement) this.services.npc.removeNpc(replacement.id);
        }
        if (!started) return;
        if (replacement) {
            this.services.npc.removeNpc(state.boss.id);
            state.boss = replacement;
        }
        // Freeze scaling at start using the durable roster, including disconnected
        // members. A late reconnect must never heal or resize an active boss.
        this.scaleBoss(player,state.boss);
        state.boss.setUnattackable(false);
        state.phase = "started";
        this.services.messaging.sendGameMessage(player,`${room.name} encounter started. Combat targets are ready; boss mechanics are not installed yet.`);
    }

    private walk(player: PlayerState, state: ArenaState, destination: {x:number;y:number}, onArrival?:()=>void): void {
        if (this.isCrossing(player) || !player.canInteract()) return;
        const services = this.services;
        const start = {x:player.tileX,y:player.tileY};
        const controller = this;
        try {
            const task = services.sequence.run(player,function* () {
                if (!controller.live(player,state) || player.tileX !== start.x || player.tileY !== start.y) return;
                const duration = Math.max(Math.abs(destination.x-start.x),Math.abs(destination.y-start.y));
                const tick = services.system.getCurrentTick();
                player.raidProgress.internally(()=>services.movement.teleportPlayer(player,destination.x,destination.y,player.level));
                services.movement.queueForcedMovement(player,{startTile:start,endTile:destination,startTick:tick,endTick:tick+duration});
                player.clearPendingSeqs();
                services.animation.playPlayerSeq(player,819);
                // Queue tasks also cycle on their invocation tick. Use the clock so
                // entry and unlocking cannot run one tick before the visual arrives.
                yield new PredicateCondition(()=>services.system.getCurrentTick() >= tick+duration);
                if (controller.live(player,state) && player.tileX === destination.x && player.tileY === destination.y) onArrival?.();
            },{lock:LockState.FULL,onCleanup:()=>{
                this.crossing.delete(player);
                player.stopAnimation();
            }});
            this.crossing.set(player,task);
        } catch (error) { this.crossing.delete(player); throw error; }
    }

    enter(player: PlayerState, expectedIndex: number): void {
        if (this.context(player)?.index !== expectedIndex) return;
        const state = this.ensure(player);
        if (!state) return;
        const room = THEATRE_ROOMS[state.index];
        if (room.id === "verzik" && player.tileX === room.entrance.x && player.tileY === room.entrance.y) {
            // Entry and reconnect use the same exact walk across the blocked foyer.
            // Arrival does NOT start Verzik; her Talk-to action does.
            this.walk(player,state,VERZIK_WALK_DESTINATION);
        }
    }

    pass(event: LocInteractionEvent): void {
        const {player,tile} = event;
        if (event.locId !== THEATRE_BARRIER_ID || (event.action && event.action.toLowerCase() !== "pass") ||
            !player.canInteract() || this.isCrossing(player)) return;
        const context = this.context(player);
        if (!context || event.level !== context.room.entrance.level) return;
        for (const gate of THEATRE_ARENAS[context.room.id].gates) {
            const crossing = arenaGateDestination(gate,tile,{x:player.tileX,y:player.tileY});
            if (!crossing) continue;
            const store = this.services.instances.theatreRuns;
            const run = store && new TheatreRuns(this.services.instances,store).current(player);
            const completed = !!run && run.completedRooms > run.roomIndex;
            const preview = context.instance.definitionId?.startsWith("theatre-preview:") === true;
            if (!completed && !preview && (!gate.entry || !crossing.entering)) {
                this.services.messaging.sendGameMessage(player,"Complete this room before passing back out of the arena.");
                return;
            }
            const state = this.ensure(player);
            if (!state) { this.services.messaging.sendGameMessage(player,"The boss could not be spawned. Please try again."); return; }
            this.walk(player,state,crossing.destination,()=>{if (!completed && gate.entry && crossing.entering) this.start(player,state);});
            return;
        }
    }

    talk(event: NpcInteractionEvent): void {
        const context = this.context(event.player);
        if (!context || context.room.id !== "verzik" || !event.player.canInteract() || this.isCrossing(event.player)) return;
        const state = this.states.get(context.instance.id);
        if (!state || state.boss !== event.npc || event.npc.worldViewId !== event.player.worldViewId ||
            Math.max(Math.abs(event.player.tileX-event.npc.tileX),Math.abs(event.player.tileY-event.npc.tileY)) > 2) return;
        if (state.phase !== "waiting") return;
        const player = event.player, token = {};
        this.conversations.set(player,token);
        const valid = () => this.conversations.get(player) === token && state.phase === "waiting" &&
            this.live(player,state) && !this.isCrossing(player) &&
            Math.max(Math.abs(player.tileX-state.boss.tileX),Math.abs(player.tileY-state.boss.tileY)) <= 2;
        // Short authored setup dialogue; full encounter dialogue/cutscenes can
        // extend this without bypassing the explicit readiness confirmation.
        this.services.dialog.openDialog(player,{id:"theatre-verzik-greeting",kind:"npc",npcId:event.npc.typeId,
            npcName:"Verzik Vitur",lines:["You have survived my Theatre. Now you face its mistress.",
                "Is your party ready to begin?"],clickToContinue:true,
            onContinue:()=>{
                if (!valid()) return;
                this.services.dialog.openDialogOptions(player,{id:"theatre-verzik-ready",title:"Begin the fight?",
                    options:["Yes, let's begin.","Not yet."],modal:true,onSelect:choice=>{
                        if (!valid()) return;
                        this.conversations.delete(player);
                        if (choice === 0) this.start(player,state);
                    }});
            }});
    }

    search(event: LocInteractionEvent): void {
        const {player,tile} = event;
        const context = this.context(player), skeleton = THEATRE_SKELETON_TILE;
        if (!context || context.room.id !== "xarpus" || !player.canInteract() ||
            event.locId !== THEATRE_SKELETON_ID || event.level !== skeleton.level ||
            (event.action && event.action.toLowerCase() !== "search") ||
            tile.x !== skeleton.x || tile.y < skeleton.y || tile.y > skeleton.y+1 ||
            Math.abs(player.tileX-skeleton.x)>1 || player.tileY<skeleton.y-1 || player.tileY>skeleton.y+2) return;
        if (this.services.inventory.collectCarriedItemIds(player).includes(DAWNBRINGER_ID)) {
            this.services.messaging.sendGameMessage(player,"You are already carrying Dawnbringer."); return;
        }
        const result = this.services.inventory.addItemToInventory(player,DAWNBRINGER_ID,1);
        this.services.messaging.sendGameMessage(player,result.added === 1
            ? "You search the skeleton and find Dawnbringer." : "You need a free inventory slot to take Dawnbringer.");
    }

    owns(npc: NpcState): boolean {
        return [...this.states.values()].some(state=>state.boss===npc &&
            this.services.instances.getById(state.instance.id)?.worldViewId===npc.worldViewId);
    }

    /** Current prep targets are single-stage. Future phase controllers must call
     * this only for their terminal death, never for intermediate transformations. */
    killed(killer:PlayerState,npc:NpcState):void {
        const context=this.context(killer),state=context && this.states.get(context.instance.id);
        if(!context || !state || state.boss!==npc || state.phase!=="started" || npc.getHitpoints()>0 ||
            npc.worldViewId!==context.instance.worldViewId)return;
        this.pendingCompletions.add(context.instance.id);
        if(context.instance.definitionId?.startsWith("theatre-of-blood:")) {
            const store=this.services.instances.theatreRuns;
            if(!store)return;
            const runs=new TheatreRuns(this.services.instances,store);
            // A player-checkpoint save may fail after the room completion itself
            // committed. Retrying must reveal that result, not roll loot twice.
            if(runs.current(killer)?.completedRooms!==context.index+1 &&
                !runs.completeRoom(context.instance.id,context.room.id))return;
        }
        state.phase="complete";
        this.pendingCompletions.delete(context.instance.id);
        if(context.index===5)this.vault.unlock(context.instance.id);
        for(const member of this.services.instances.getMemberPlayers(context.instance.id))
            this.services.messaging.sendGameMessage(member,context.index===5?"Verzik is defeated! Climb the stairs beneath her throne to claim your reward.":`${context.room.name} defeated. The next room is now available.`);
    }

    prune(): void {
        for (const [id,state] of this.states) {
            const live = this.services.instances.getById(id);
            if (!live || live.worldViewId !== state.instance.worldViewId) {this.states.delete(id);this.pendingCompletions.delete(id);}
        }
        // A transient save failure must not strand a party with a dead boss and
        // no usable exit. Retry the same authoritative death, without rerolling.
        if(this.services.system.getCurrentTick()%5===0)for(const id of this.pendingCompletions) {
            const state=this.states.get(id),member=this.services.instances.getMemberPlayers(id).find(p=>this.context(p));
            if(!state || !member)continue;
            try{this.killed(member,state.boss);}catch(error){this.services.system.logger?.warn("Theatre completion save retry failed",error);}
        }
    }
}

export function registerTheatreArenas(registry: IScriptRegistry, services: ScriptServices): TheatreArenaController {
    const controller = new TheatreArenaController(services);
    controller.vault.register(registry);
    const unregister=services.combat.registerOnNpcKilled?.((killer,npc)=>controller.killed(killer,npc));
    if(unregister)registry.registerCleanup(unregister);
    registry.registerLocInteraction(THEATRE_BARRIER_ID,event=>controller.pass(event),"pass");
    registry.registerLocInteraction(THEATRE_BARRIER_ID,event=>controller.pass(event));
    registry.registerNpcInteraction(THEATRE_ARENAS.verzik.boss.id,event=>controller.talk(event),"talk-to");
    registry.registerLocInteraction(THEATRE_SKELETON_ID,event=>controller.search(event),"search");
    registry.registerLocInteraction(THEATRE_SKELETON_ID,event=>controller.search(event));
    for (const id of [...Object.values(THEATRE_ARENAS).map(arena=>arena.boss.id),VERZIK_COMBAT_ID]) {
        // Generic retaliation would invent attacks (especially Bloat/Xarpus).
        // Incoming hits work normally; authored attacks arrive with mechanics.
        registry.registerNpcAttack(id,({npc})=>controller.owns(npc)?"prevent":undefined);
    }
    THEATRE_ROOMS.forEach((room,index)=>{
        const {bounds} = theatreRoomGeometry(index);
        registry.registerZone({id:`theatre-room:${room.id}`,...bounds,levels:[room.entrance.level]}, {
            enter:({player})=>controller.enter(player,index),
            step:({player})=>controller.enter(player,index),
        });
    });
    registry.registerTickHandler(()=>controller.prune());
    return controller;
}
