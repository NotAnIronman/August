import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices, LocInteractionHandler } from "@server/game/scripts/types";
import { TheatreRuns } from "./TheatreRun";
import { TheatreSupplies } from "./TheatreSupplies";
import { reclaimInstanceGrave } from "@server/content/modules/bandos-instance";
import { registerTheatreArenas } from "./TheatreArenaController";
import { THEATRE_ENTRANCE_ID, THEATRE_OUTSIDE, THEATRE_ROOMS, theatreRoomGeometry } from "./rooms";

/** Shared facade for future encounter modules. No client action can complete a room. */
export function theatreRuns(services: ScriptServices): TheatreRuns | undefined {
    const store = services.instances.theatreRuns;
    return store ? new TheatreRuns(services.instances,store) : undefined;
}
function outside(player: PlayerState, services: ScriptServices): boolean {
    return !services.instances.get(player.id) && player.worldViewId === -1 && player.level === 0 &&
        Math.max(Math.abs(player.tileX-THEATRE_OUTSIDE.x),Math.abs(player.tileY-THEATRE_OUTSIDE.y)) <= 5;
}
function message(player: PlayerState, services: ScriptServices, text: string): void {
    services.messaging.sendGameMessage(player,text);
}
function preview(player: PlayerState, services: ScriptServices, index: number): void {
    if (!services.system.isDeveloper?.(player) || player.raidProgress.checkpoint) return;
    const g = theatreRoomGeometry(index);
    services.instances.create(player, {definitionId:`theatre-preview:${index}`,access:"solo",
        sceneBase:g.sceneBase,templateChunks:services.instances.buildTemplate([g.copy]),
        destination:g.room.entrance,exit:THEATRE_OUTSIDE});
    message(player,services,`${g.room.name} development preview: combat targets and arena entry; no checkpoint or completion rewards.`);
}
function entry(player: PlayerState, services: ScriptServices): void {
    if (!outside(player,services)) return;
    const runs = theatreRuns(services);
    if (!runs) { message(player,services,"The Theatre's progress storage is unavailable."); return; }
    const checkpoint = player.raidProgress.checkpoint;
    if (checkpoint) {
        services.dialog.openDialogOptions(player,{id:"theatre-resume",title:"Return to the Theatre?",
            options:["Continue disconnected raid","Discard progress","Cancel"],modal:true,onSelect:choice=>{
                if (!outside(player,services) || player.raidProgress.checkpoint?.runId !== checkpoint.runId) return;
                if (choice === 0 && !runs.resume(player)) message(player,services,"That raid cannot be continued. It may already be complete.");
                if (choice === 1) player.raidProgress.guard("leave",()=>entry(player,services));
            }});
        return;
    }
    const developer = services.system.isDeveloper?.(player) === true;
    services.dialog.openDialogOptions(player,{id:"theatre-entry",title:"Theatre of Blood",
        options:["Enter solo","Create party (up to 5)","Join party",...(developer ? ["Preview rooms (development)"] : []),"Cancel"],
        modal:true,onSelect:choice=>{
            if (!outside(player,services) || player.raidProgress.checkpoint) return;
            if (choice === 0 || choice === 1) {
                if (!runs.create(player,choice === 0 ? "solo" : "party")) message(player,services,"The Theatre could not be opened.");
                else message(player,services,"Pass the arena barrier to begin. Bosses can take damage; their attack mechanics are not installed yet.");
            } else if (choice === 2) {
                const rooms = services.instances.listJoinable().filter(room=>{
                    if (!room.definitionId?.startsWith("theatre-of-blood:")) return false;
                    const run = services.instances.theatreRuns?.load(room.definitionId.split(":")[1]);
                    return run?.access === "party" && !run.started && run.completedRooms === 0 && run.roster.length < 5;
                }).slice(0,4);
                if (!rooms.length) { message(player,services,"There are no waiting Theatre parties."); return; }
                services.dialog.openDialogOptions(player,{id:"theatre-join",title:"Join a waiting party",
                    options:[...rooms.map(room=>`${room.ownerName}'s party (${room.memberPlayerIds.length}/5)`),"Cancel"],modal:true,
                    onSelect:selection=>{
                        const room = rooms[selection];
                        if (room && outside(player,services) && !runs.join(player,room.id)) message(player,services,"That party is no longer available.");
                    }});
            } else if (choice === 3 && developer) previewMenu(player,services,0);
        }});
}
function previewMenu(player: PlayerState, services: ScriptServices, page: number): void {
    if (!services.system.isDeveloper?.(player)) return;
    const start = page * 3;
    services.dialog.openDialogOptions(player,{id:"theatre-preview",title:"Preview a room (no rewards)",
        options:[...THEATRE_ROOMS.slice(start,start+3).map(r=>r.name),page === 0 ? "More rooms" : "Previous rooms","Cancel"],modal:true,
        onSelect:choice=>{
            if (!outside(player,services)) return;
            if (choice >= 0 && choice < 3) preview(player,services,start+choice);
            else if (choice === 3) previewMenu(player,services,1-page);
        }});
}
export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerTheatreArenas(registry,_services);
    new TheatreSupplies(_services).register(registry);
    registry.registerLocInteraction(32656,reclaimInstanceGrave,"claim");
    registry.registerLocInteraction(32656,reclaimInstanceGrave);
    const registerObject = (id: number, handler: LocInteractionHandler): void => {
        registry.registerLocInteraction(id,handler);
        // The registry's default key is not a wildcard for named cache options.
        for (const action of new Set(_services.data.getLocDefinition(id)?.actions ?? [])) {
            if (typeof action === "string" && action.trim() && action.toLowerCase() !== "examine")
                registry.registerLocInteraction(id,handler,action);
        }
    };
    registerObject(THEATRE_ENTRANCE_ID,({player,services})=>entry(player,services));
    for (const locId of new Set(THEATRE_ROOMS.map(room=>room.exitId))) {
        registerObject(locId,({player,services,level})=>{
            const room = services.instances.get(player.id);
            if (!room) return;
            if (room.definitionId?.startsWith("theatre-preview:")) {
                services.instances.leave(player,THEATRE_OUTSIDE);
                return;
            }
            const runs = theatreRuns(services);
            const run = runs?.current(player);
            if (!run || THEATRE_ROOMS[run.roomIndex].exitId !== locId ||
                THEATRE_ROOMS[run.roomIndex].entrance.level !== level) return;
            if (run.completedRooms > run.roomIndex) { runs!.advance(player); return; }
            services.dialog.openDialogOptions(player,{id:"theatre-room-exit",title:"This room is not complete.",
                options:["Stay in the Theatre","Leave and discard progress"],modal:true,onSelect:choice=>{
                    if (choice !== 1 || runs!.current(player)?.id !== run.id) return;
                    player.raidProgress.guard("leave",()=>services.instances.leave(player,THEATRE_OUTSIDE));
                }});
        });
    }
}
