import type { NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import { LockState } from "@server/game/model/LockState";
import { PredicateCondition, type QueueTask } from "@server/game/model/queue";
import type { IScriptRegistry, ScriptServices, LocInteractionEvent, NpcInteractionEvent } from "@server/game/scripts/types";
import type { QuestInstanceHandle } from "@server/world/InstancedAreaManager";
import { TheatreRuns } from "./TheatreRun";
import { THEATRE_ROOMS, theatreRoomGeometry } from "./rooms";
import { THEATRE_ARENAS, THEATRE_BARRIER_ID, VERZIK_WALK_DESTINATION, arenaGateDestination } from "./arenas";

interface ArenaState {
    instance: QuestInstanceHandle;
    index: number;
    boss: NpcState;
    phase: "waiting" | "started";
}

/** Private-room presentation and entry. Boss combat plugs in after this stage. */
export class TheatreArenaController {
    private readonly states = new Map<string,ArenaState>();
    private readonly crossing = new WeakMap<PlayerState,QueueTask<PlayerState>>();
    constructor(private readonly services: ScriptServices) {}

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

    private ensure(player: PlayerState): ArenaState | undefined {
        const context = this.context(player);
        if (!context) return;
        const old = this.states.get(context.instance.id);
        if (old && old.instance.worldViewId === context.instance.worldViewId &&
            old.instance.definitionId === context.instance.definitionId) return old;
        const spawn = THEATRE_ARENAS[context.room.id].boss;
        const boss = this.services.npc.spawnNpc({
            ...spawn, level:context.room.entrance.level, worldViewId:context.instance.worldViewId,
            // Visibility/cleanup belongs to the instance, not its first entrant.
            isAggressive:false,isUnattackable:true,isImmovable:true,wanderRadius:0,respawns:false,
        });
        if (!boss) return;
        boss.suppressDrops = true;
        let attached: boolean;
        try { attached = this.services.instances.attachNpc(context.instance.id,boss); }
        catch (error) { this.services.npc.removeNpc(boss.id); throw error; }
        if (!attached) {
            this.services.npc.removeNpc(boss.id);
            return;
        }
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
            this.services.combat.getNpc(state.boss.id) === state.boss;
    }

    private start(player: PlayerState, state: ArenaState): void {
        if (!this.live(player,state) || state.phase === "started") return;
        const room = THEATRE_ROOMS[state.index];
        if (state.instance.definitionId?.startsWith("theatre-of-blood:")) {
            const store = this.services.instances.theatreRuns;
            if (!store || !new TheatreRuns(this.services.instances,store).startRoom(state.instance.id,room.id)) return;
        } else this.services.instances.markStarted(state.instance.id);
        state.phase = "started";
        // Do not invent attacks, waves, completion or loot in a placement update.
        this.services.messaging.sendGameMessage(player,`${room.name} encounter started. Boss mechanics are not installed yet.`);
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
        this.start(event.player,state);
    }

    prune(): void {
        for (const [id,state] of this.states) {
            const live = this.services.instances.getById(id);
            if (!live || live.worldViewId !== state.instance.worldViewId) this.states.delete(id);
        }
    }
}

export function registerTheatreArenas(registry: IScriptRegistry, services: ScriptServices): TheatreArenaController {
    const controller = new TheatreArenaController(services);
    registry.registerLocInteraction(THEATRE_BARRIER_ID,event=>controller.pass(event),"pass");
    registry.registerLocInteraction(THEATRE_BARRIER_ID,event=>controller.pass(event));
    registry.registerNpcInteraction(THEATRE_ARENAS.verzik.boss.id,event=>controller.talk(event),"talk-to");
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
