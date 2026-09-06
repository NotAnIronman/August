import { randomUUID } from "node:crypto";
import type { PlayerState } from "@server/game/player";
import type { InstanceFacade } from "@server/game/scripts/serviceInterfaces";
import { THEATRE_OUTSIDE, THEATRE_ROOMS, theatreRoomGeometry, type TheatreRoomId } from "./rooms";
import { rollTheatreRewards, validTheatreRewards, type TheatreChestReward } from "./rewards";
import { VAULT_COPY, VAULT_ENTRANCE, VAULT_SCENE_BASE, vaultDefinition } from "./vault";

export interface TheatreRunRecord {
    version: 1;
    id: string;
    access: "solo" | "party";
    roster: string[];
    roomIndex: number;
    completedRooms: number;
    started: boolean;
    instanceId?: string;
    vaultInstanceId?: string;
    rewards?: TheatreChestReward[];
}
export interface TheatreRunStore {
    load(id: string): TheatreRunRecord | undefined;
    save(run: TheatreRunRecord): void;
    /** Atomically saves the claim flag AND the receiving player's inventory/log/pet queue. */
    claim?(run: TheatreRunRecord, player: PlayerState, expected?: import("./rewards").TheatreChestReward): void;
}
export function sanitizeTheatreRun(value: unknown): TheatreRunRecord | undefined {
    const r = value as TheatreRunRecord | undefined;
    if (!r || r.version !== 1 || typeof r.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(r.id) ||
        !["solo","party"].includes(r.access) || !Array.isArray(r.roster) || r.roster.length < 1 || r.roster.length > 5 ||
        r.roster.some(n => typeof n !== "string" || !n || n.length > 64) ||
        new Set(r.roster).size !== r.roster.length || typeof r.started !== "boolean" ||
        !Number.isInteger(r.roomIndex) || r.roomIndex < 0 || r.roomIndex > 5 ||
        !Number.isInteger(r.completedRooms) || r.completedRooms < r.roomIndex || r.completedRooms > r.roomIndex + 1 ||
        (r.instanceId !== undefined && (typeof r.instanceId !== "string" || r.instanceId.length > 80)) ||
        (r.vaultInstanceId !== undefined && (r.completedRooms!==6 || typeof r.vaultInstanceId!=="string" || r.vaultInstanceId.length>80)) ||
        (r.rewards !== undefined && (r.completedRooms!==6 || !validTheatreRewards(r.rewards,r.roster.length)))) return;
    return {version:1,id:r.id,access:r.access,roster:[...r.roster],roomIndex:r.roomIndex,
        completedRooms:r.completedRooms,started:r.started,instanceId:r.instanceId,
        ...(r.vaultInstanceId!==undefined?{vaultInstanceId:r.vaultInstanceId}:{}),
        ...(r.rewards?{rewards:structuredClone(r.rewards)}:{})};
}
const account = (p: PlayerState) => (p.__saveKey || p.name).trim().toLowerCase();
const definition = (run: TheatreRunRecord) => `theatre-of-blood:${run.id}:${run.roomIndex}`;

/** Durable party progress is independent of transient instance/player IDs.
 * Encounter modules alone call startRoom/completeRoom; exits never award kills.
 */
export class TheatreRuns {
    constructor(private readonly instances: InstanceFacade, private readonly store: TheatreRunStore) {}

    private suspend(players: readonly PlayerState[]): void {
        // An interrupted transfer must not strand part of a party in an old
        // instance whose authoritative record already points to the new room.
        for (const player of players) {
            player.raidProgress.disconnected();
            player.raidProgress.internally(() => this.instances.leave(player,THEATRE_OUTSIDE));
            try { player.raidProgress.persist?.(); } catch { /* keep the prior durable checkpoint */ }
        }
    }

    private savePlayer(player: PlayerState, run: TheatreRunRecord): void {
        player.raidProgress.set({version:1,raid:"theatre-of-blood",runId:run.id,
            completedRooms:Math.min(5,run.completedRooms),access:run.access,roster:[...run.roster],status:"active"});
        player.raidProgress.persist?.();
    }
    private live(run: TheatreRunRecord) {
        const room = run.instanceId ? this.instances.getById(run.instanceId) : undefined;
        // IDs recycle on server restart; a matching ID alone is not authority.
        return room?.definitionId === definition(run) ? room : undefined;
    }
    private createRoom(player: PlayerState, run: TheatreRunRecord) {
        const g = theatreRoomGeometry(run.roomIndex);
        return player.raidProgress.internally(() => this.instances.create(player, {
            definitionId:definition(run),access:run.access,maxPlayers:run.access === "solo" ? 1 : 5,
            joinInProgress:true,sceneBase:g.sceneBase,templateChunks:this.instances.buildTemplate([g.copy]),
            destination:g.room.entrance,exit:THEATRE_OUTSIDE,
        }));
    }
    create(player: PlayerState, access: "solo" | "party"): boolean {
        if (this.instances.get(player.id) || player.raidProgress.checkpoint) return false;
        const run: TheatreRunRecord = {version:1,id:randomUUID(),access,roster:[account(player)],
            roomIndex:0,completedRooms:0,started:false};
        // Fail before moving a player if durable storage is unavailable.
        this.store.save(run);
        const room = this.createRoom(player,run);
        if (!room) return false;
        try {
            run.instanceId = room.id;
            this.store.save(run);
            this.savePlayer(player,run);
        } catch (error) { this.suspend([player]); throw error; }
        return true;
    }
    join(player: PlayerState, instanceId: string): boolean {
        if (this.instances.get(player.id) || player.raidProgress.checkpoint) return false;
        const room = this.instances.getById(instanceId);
        const id = room?.definitionId?.split(":")[1];
        const run = id ? this.store.load(id) : undefined;
        if (!run || this.live(run)?.id !== instanceId || run.access !== "party" ||
            run.started || run.completedRooms !== 0 || run.roomIndex !== 0 ||
            run.roster.length >= 5 || run.roster.includes(account(player))) return false;
        // The checkpoint is persisted after joining. Treat this as an internal
        // raid transfer so ordinary teleport cleanup cannot detach the new member.
        if (!player.raidProgress.internally(() => this.instances.join(player,instanceId))) return false;
        try {
            run.roster.push(account(player));
            this.store.save(run);
            for (const member of this.instances.getMemberPlayers(instanceId)) this.savePlayer(member,run);
        } catch (error) { this.suspend([player]); throw error; }
        return true;
    }
    resume(player: PlayerState): boolean {
        const checkpoint = player.raidProgress.checkpoint;
        if (!checkpoint || checkpoint.status !== "disconnected" || this.instances.get(player.id)) return false;
        const run = this.store.load(checkpoint.runId);
        if (!run || !run.roster.includes(account(player)) || run.access !== checkpoint.access) return false;
        if (run.completedRooms===6) return this.transferToVault(player,run);
        try {
            const live = this.live(run);
            if (live) {
                if (!player.raidProgress.internally(() => this.instances.join(player,live.id))) return false;
            } else {
                // The unfinished fight resets, but completed rooms remain completed.
                run.roomIndex = run.completedRooms;
                run.started = true; // reconnect never opens a run to new recruits
                const room = this.createRoom(player,run);
                if (!room) return false;
                run.instanceId = room.id;
                this.store.save(run);
            }
            this.savePlayer(player,run);
        } catch (error) { this.suspend([player]); throw error; }
        return true;
    }
    current(player: PlayerState): TheatreRunRecord | undefined {
        const checkpoint = player.raidProgress.checkpoint;
        if (!checkpoint || checkpoint.status !== "active") return;
        const run = this.store.load(checkpoint.runId);
        const room = run && this.live(run);
        if (run && run.roster.includes(account(player)) && room?.memberPlayerIds.includes(player.id)) return run;
    }
    vaultCurrent(player:PlayerState):TheatreRunRecord|undefined {
        const c=player.raidProgress.checkpoint, instance=this.instances.get(player.id);
        if(!c || c.status!=="active" || !instance || instance.worldViewId!==player.worldViewId)return;
        const run=this.store.load(c.runId);
        if(run?.completedRooms===6 && run.roster.includes(account(player)) && instance.id===run.vaultInstanceId &&
            instance.definitionId===vaultDefinition(run.id) && instance.memberPlayerIds.includes(player.id))return run;
    }
    private transferToVault(player:PlayerState,run:TheatreRunRecord):boolean {
        // Upgrade an already-completed pre-vault record once, before transferring.
        if(!run.rewards){run.rewards=rollTheatreRewards(run.roster.length);this.store.save(run);}
        const existing=run.vaultInstanceId?this.instances.getById(run.vaultInstanceId):undefined;
        try {
            if(existing?.definitionId===vaultDefinition(run.id)) {
                if(!player.raidProgress.internally(()=>this.instances.join(player,existing.id)))return false;
            } else {
                const vault=player.raidProgress.internally(()=>this.instances.create(player,{
                    definitionId:vaultDefinition(run.id),access:run.access,maxPlayers:run.roster.length,joinInProgress:true,
                    sceneBase:VAULT_SCENE_BASE,templateChunks:this.instances.buildTemplate([VAULT_COPY]),
                    destination:VAULT_ENTRANCE,exit:THEATRE_OUTSIDE,
                }));
                if(!vault)return false;
                run.vaultInstanceId=vault.id;this.store.save(run);
            }
            this.savePlayer(player,run);
        } catch(error){this.suspend([player]);throw error;}
        return true;
    }
    enterVault(player:PlayerState):boolean {
        const run=this.current(player);
        return !!run && run.completedRooms===6 && this.transferToVault(player,run);
    }
    leaveVault(player:PlayerState):boolean {
        if(!this.vaultCurrent(player))return false;
        const checkpoint=player.raidProgress.checkpoint!;
        player.raidProgress.clear();
        try{player.raidProgress.persist?.();}catch(error){player.raidProgress.set(checkpoint);throw error;}
        this.instances.leave(player,THEATRE_OUTSIDE);return true;
    }
    startRoom(instanceId: string, roomId: TheatreRoomId): boolean {
        const room = this.instances.getById(instanceId);
        const id = room?.definitionId?.split(":")[1];
        const run = id ? this.store.load(id) : undefined;
        if (!run || this.live(run)?.id !== instanceId || THEATRE_ROOMS[run.roomIndex].id !== roomId ||
            run.completedRooms !== run.roomIndex) return false;
        run.started = true;
        this.store.save(run);
        this.instances.markStarted(instanceId);
        return true;
    }
    completeRoom(instanceId: string, roomId: TheatreRoomId): boolean {
        const room = this.instances.getById(instanceId);
        const id = room?.definitionId?.split(":")[1];
        const run = id ? this.store.load(id) : undefined;
        if (!run || !run.started || this.live(run)?.id !== instanceId ||
            THEATRE_ROOMS[run.roomIndex].id !== roomId || run.completedRooms !== run.roomIndex) return false;
        run.completedRooms++;
        if(run.completedRooms===6)run.rewards=rollTheatreRewards(run.roster.length);
        this.store.save(run);
        for (const player of this.instances.getMemberPlayers(instanceId)) {
            if (player.raidProgress.checkpoint?.runId === run.id) this.savePlayer(player,run);
        }
        return true;
    }
    advance(player: PlayerState): boolean {
        const run = this.current(player);
        if (!run || run.completedRooms !== run.roomIndex + 1) return false;
        const members = this.instances.getMemberPlayers(run.instanceId!).filter(p => this.current(p)?.id === run.id);
        if (run.completedRooms === 6) {
            return this.enterVault(player);
        }
        const next = {...run,roomIndex:run.completedRooms,started:false};
        const room = this.createRoom(player,next);
        if (!room) return false;
        try {
            next.instanceId = room.id;
            this.store.save(next);
            for (const member of members) {
                if (member.id === player.id) continue;
                const joined = member.raidProgress.internally(() => this.instances.join(member,room.id));
                if (!joined) throw new Error("Theatre party transition failed");
            }
            for (const member of members) this.savePlayer(member,next);
        } catch (error) { this.suspend(members); throw error; }
        return true;
    }
}
