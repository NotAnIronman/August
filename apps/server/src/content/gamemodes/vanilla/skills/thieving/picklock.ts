import type { ActionExecutionResult } from "@server/game/actions/types";
import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, LocInteractionEvent, ScriptServices } from "@server/game/scripts/types";
import { applyInventoryTransform } from "@server/game/skilling/InventoryTransform";
import { checkSkillingRequirements, getSkillLevel } from "@server/game/skilling/Requirements";
import { ResourceNodeTracker, buildTileKey } from "@server/game/skilling/ResourceNodeTracker";
import { defineSkillAction, repeatSkillAction, requestSkillAction } from "@server/game/skilling/SkillAction";
import { getThievingSuccessChance } from "@server/game/skilling/ThievingPolicy";
import type { DoorToggleResult } from "@server/world/DoorDefinitions";
import {
    HAM_TRAPDOOR, LOCKPICK_ITEM_ID, PICKLOCK_CHESTS, PICKLOCK_DOORS,
    PICKLOCK_OPTIONS, THIEVING_SKILL_ID,
    normalizePicklockOption, type PicklockDoorDefinition, type PicklockTile,
} from "@server/content/gamemodes/vanilla/skills/thieving/picklockDefinitions";

const START = defineSkillAction("picklock", { delayTicks: 0, cooldownTicks: 0 });
const BEGIN = defineSkillAction("picklock", { delayTicks: 1 });
const RETRY = defineSkillAction("picklock", { delayTicks: 5 });
const TRAP = defineSkillAction("picklock-trap", { delayTicks: 0, cooldownTicks: 1 });
const ODDS = { minimumChance: 0.5, maximumChance: 0.95 }; // Provisional HAM-era tuning.
const sameTile = (a: PicklockTile, b: PicklockTile) => a.x === b.x && a.y === b.y;
const playerTile = (p: PlayerState): PicklockTile => ({ x: p.tileX, y: p.tileY });
const message = (e: LocInteractionEvent, text: string) => e.services.messaging.sendGameMessage(e.player, text);

interface PicklockActionData {
    locId: number;
    tile: PicklockTile;
    level: number;
    worldViewId: number;
    origin: PicklockTile;
    action: string;
    started: boolean;
}

/** Wall orientation identifies a crossed edge, never an inside/free side. */
export function getPicklockDoorDestination(
    tile: PicklockTile, rotation: number, from: PicklockTile,
): PicklockTile | undefined {
    const offset = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }][rotation];
    if (!offset) return undefined;
    const other = { x: tile.x + offset.x, y: tile.y + offset.y };
    if (sameTile(from, tile)) return other;
    if (sameTile(from, other)) return { ...tile };
    return undefined;
}

export function getPicklockDoorSide(
    def: PicklockDoorDefinition, tile: PicklockTile, level: number, from: PicklockTile,
): { policy: "pick" | "free" | "blocked"; to?: PicklockTile } {
    const route = def.routes?.find((r) => r.level === level && sameTile(r.tile, tile));
    if (route) return route.sides.find((side) => sameTile(side.from, from)) ?? { policy: "blocked" };
    return { policy: def.sidePolicy === "needs-verified-route" ? "blocked" : "pick" };
}

function emitDoor(e: LocInteractionEvent, oldId: number, tile: PicklockTile, result: DoorToggleResult): void {
    const emit = e.services.location.emitLocChange;
    emit(oldId, result.newLocId!, tile, e.level, {
        oldTile: tile, newTile: result.newTile ?? tile,
        oldRotation: result.oldRotation, newRotation: result.newRotation,
    });
    const p = result.partnerResult;
    if (p) emit(p.oldLocId, p.newLocId, p.oldTile, e.level, {
        oldTile: p.oldTile, newTile: p.newTile, oldRotation: p.oldRotation, newRotation: p.newRotation,
    });
    e.services.sound.playAreaSound({ soundId: result.soundId, tile, level: e.level, radius: 5 });
}

function validTarget(e: LocInteractionEvent, data?: PicklockActionData): boolean {
    const { player, services, tile, level, locId } = e;
    if (player.level !== level || !player.canInteract() || player.skillSystem.getHitpointsCurrent() <= 0) return false;
    if (data && (player.worldViewId !== data.worldViewId || !sameTile(playerTile(player), data.origin))) return false;
    if (!services.location.isAdjacentToLoc(player, locId, tile, level)) return false;
    const definition = services.data.getLocDefinition(locId);
    if (!definition) return false;
    const visibleId = services.location.resolveLocTransformId(player, definition);
    if (visibleId === undefined) return false;
    const visible = services.data.getLocDefinition(visibleId);
    const expected = normalizePicklockOption(e.action);
    return !!visible?.actions?.some((action) => normalizePicklockOption(action ?? undefined) === expected);
}

interface DoorPassage {
    event: LocInteractionEvent;
    opened: DoorToggleResult;
    destination: PicklockTile;
    origin: PicklockTile;
    xp: number;
    worldViewId: number;
    singleDef?: { closed: number; opened: number };
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    const chests = new Map(PICKLOCK_CHESTS.map((d) => [d.locId, d]));
    const doors = new Map(PICKLOCK_DOORS.map((d) => [d.locId, d]));
    const depleted = new ResourceNodeTracker<{ event: LocInteractionEvent; worldViewId: number }>();
    const passages = new ResourceNodeTracker<DoorPassage>();
    const passageKeys = new Set<string>();
    const keyFor = (e: LocInteractionEvent) => `${e.player.worldViewId}:${e.locId}:${buildTileKey(e.tile, e.level)}`;
    const isHam = (id: number) => id === HAM_TRAPDOOR.locId || id === HAM_TRAPDOOR.closedId;

    function closePassage(p: DoorPassage, tick: number): boolean {
        const { event: e, opened } = p;
        const tile = opened.newTile ?? e.tile;
        const manager = services.location.doorManager;
        if (!manager?.resolveDoorInteractionTile(tile.x, tile.y, e.level, opened.newLocId!)) return false;
        const params = { x: tile.x, y: tile.y, level: e.level,
            currentId: opened.newLocId!, rotation: opened.newRotation, action: "close", currentTick: tick };
        const result = p.singleDef ? manager.toggleExplicitSingleDoor({ ...params, singleDef: p.singleDef }) : manager.toggleDoor(params);
        if (!result?.success || result.newLocId !== e.locId) return false;
        emitDoor(e, opened.newLocId!, tile, result);
        return true;
    }

    function restoreChest({ event: e, worldViewId }: { event: LocInteractionEvent; worldViewId: number }): void {
        services.location.clearTemporaryLoc({ worldViewId }, e.locId, e.tile, e.level, 10);
    }
    registry.registerTickHandler(({ tick }) => {
        depleted.processExpired(tick, ({ data }) => restoreChest(data));
        for (const key of passageKeys) {
            const node = passages.get(key);
            if (!node) { passageKeys.delete(key); continue; }
            const p = node.data;
            const player = p.event.player;
            const stillHere = player.level === p.event.level && player.worldViewId === p.worldViewId;
            const alive = player.skillSystem.getHitpointsCurrent() > 0 && player.canInteract();
            const arrived = stillHere && alive && sameTile(playerTile(player), p.destination);
            const next = player.peekNextStep();
            const following = stillHere && alive && sameTile(playerTile(player), p.origin)
                && !!next && sameTile(next, p.destination);
            if (arrived || !following || tick >= node.expiryTick) {
                passages.remove(key);
                passageKeys.delete(key);
                const closed = closePassage(p, tick);
                if (arrived && closed && p.xp > 0) services.skills.addSkillXp(player, THIEVING_SKILL_ID, p.xp);
                if (!arrived && following) player.clearPath();
            }
        }
    });
    registry.registerCleanup(() => {
        passages.drain(({ data }) => {
            closePassage(data, services.system.getCurrentTick());
            const next = data.event.player.peekNextStep();
            if (next && sameTile(next, data.destination)) data.event.player.clearPath();
        });
        passageKeys.clear();
        depleted.drain(({ data }) => restoreChest(data));
    });

    function traverse(e: LocInteractionEvent, def: PicklockDoorDefinition, xp: number): boolean {
        const manager = services.location.doorManager;
        const path = services.movement.getPathService();
        const side = getPicklockDoorSide(def, e.tile, e.level, playerTile(e.player));
        // Door engine broadcasts/collision are global; instances need a scoped engine first.
        if (!manager || !path || side.policy === "blocked" || e.player.worldViewId !== -1) return false;
        const key = keyFor(e);
        if (passages.has(key)) return false;
        const physical = def.routes?.find(r => r.level === e.level && sameTile(r.tile, e.tile));
        const singleDef = physical ? { closed: e.locId, opened: physical.openedId } : undefined;
        const params = { x: e.tile.x, y: e.tile.y, level: e.level,
            currentId: e.locId, action: "open", currentTick: e.tick };
        const opened = singleDef ? manager.toggleExplicitSingleDoor({ ...params, singleDef, rotation: physical!.rotation, locType: 0 }) : manager.toggleDoor(params);
        if (!opened?.success || opened.newLocId === undefined) return false;
        const origin = playerTile(e.player);
        const destination = opened.oldRotation === undefined ? undefined
            : getPicklockDoorDestination(e.tile, opened.oldRotation, origin);
        const passage: DoorPassage = { event: e, opened, origin, destination: destination ?? origin,
            xp, worldViewId: e.player.worldViewId, singleDef };
        let committed = false;
        try {
        emitDoor(e, e.locId, e.tile, opened);
        // Require one exact cardinal step over the actual edge; never teleport or
        // accept an approximate path/detour around the locked building.
        const route = destination && (!side.to || sameTile(side.to, destination))
            ? path.findPathSteps({ from: { ...origin, plane: e.level }, to: destination,
                size: 1, worldViewId: e.player.worldViewId }, { maxSteps: 1 }) : undefined;
        if (!destination || !route?.ok || route.clamped || route.steps?.length !== 1
            || !sameTile(route.steps[0], destination)
            || !path.canActorStep({ ...origin, plane: e.level }, destination, 1, e.player.worldViewId)) {
            return false;
        }
        passages.add(key, e.tile, e.level, e.tick + 8, passage);
        passageKeys.add(key);
        e.player.setPath(route.steps, false);
        committed = true;
        return true;
        } finally {
            if (!committed) {
                passages.remove(key);
                passageKeys.delete(key);
                closePassage(passage, e.tick);
            }
        }
    }

    registry.registerActionHandler(START.kind, (ctx): ActionExecutionResult => {
        const data = ctx.data as PicklockActionData;
        const e: LocInteractionEvent = { ...data, player: ctx.player, tick: ctx.tick, services: ctx.services };
        const done: ActionExecutionResult = { ok: true, effects: [] };
        if (!validTarget(e, data)) return done;
        const chest = chests.get(data.locId);
        const door = doors.get(data.locId);
        const ham = isHam(data.locId);
        if (!chest && !door && !ham) return done;
        // Closed child IDs can still arrive in stale packets after the parent
        // transformed. Validate authoritative HAM state even for that child.
        if (ham && ctx.player.varps.getVarbitValue(HAM_TRAPDOOR.varbitId) !== 0) return done;
        if (chest && depleted.has(keyFor(e))) { message(e, "The chest is empty."); return done; }
        if (door && getPicklockDoorSide(door, data.tile, data.level, playerTile(ctx.player)).policy === "blocked") {
            message(e, "You cannot pick this lock from here."); return done;
        }
        if (door && getPicklockDoorSide(door, data.tile, data.level, playerTile(ctx.player)).policy === "free") {
            if (!traverse(e, door, 0)) message(e, "You cannot open a passage through this door.");
            return done; // Both menu options bypass skill/tools/rolls and grant no XP on a free side.
        }
        const required = chest?.level ?? door?.level ?? HAM_TRAPDOOR.level;
        const failure = checkSkillingRequirements(ctx.services, ctx.player, {
            levels: [{ skillId: THIEVING_SKILL_ID, level: required, source: "effective" }],
            tools: door?.lockpick ? [{ itemIds: [LOCKPICK_ITEM_ID], source: "inventory" }] : [],
        });
        if (failure) {
            message(e, failure.kind === "level" ? `You need a Thieving level of ${required} to pick this lock.` : "You need a lockpick to pick this lock.");
            return done;
        }
        if (!data.started) {
            message(e, ham ? "You attempt to pick the lock on the trap door." : "You attempt to pick the lock.");
            ctx.services.sound.sendSound(ctx.player, 2402);
            repeatSkillAction(ctx.services, ctx.player, BEGIN, { ...data, started: true }, ctx.tick);
            return { ...done, cooldownTicks: 1 };
        }
        // Trap searches use fixed rewards and no speculative random failure.
        const chance = getThievingSuccessChance(
            getSkillLevel(ctx.services, ctx.player, THIEVING_SKILL_ID), required, ODDS);
        const success = !!chest || Math.random() < Math.min(ODDS.maximumChance, chance);
        if (!success) {
            services.animation.playPlayerSeq(ctx.player, 537);
            services.sound.sendSound(ctx.player, 2402);
            repeatSkillAction(ctx.services, ctx.player, RETRY, data, ctx.tick);
            return { ...done, cooldownTicks: 5 };
        }
        if (chest) {
            const placement = chest.placements.find(p => p.level === e.level && sameTile(p, e.tile));
            if (!placement || e.player.worldViewId !== -1) { message(e, "This chest is not available here."); return done; }
            const reward = applyInventoryTransform(ctx.services.inventory, ctx.player, { inputs: [], outputs: chest.loot });
            if (!reward.ok) { message(e, "You don't have room for the contents of the chest."); return done; }
            // Synchronous commit: second player/click observes depletion before XP.
            depleted.add(keyFor(e), data.tile, data.level, ctx.tick + chest.respawnTicks, { event: e, worldViewId: e.player.worldViewId });
            ctx.services.location.replaceTemporaryLoc({ worldViewId: e.player.worldViewId }, chest.locId, chest.openedId, data.tile, data.level,
                { oldShape: 10, newShape: 10, oldRotation: placement.rotation, newRotation: placement.rotation });
            services.skills.addSkillXp(ctx.player, THIEVING_SKILL_ID, chest.xp);
            services.inventory.snapshotInventory(ctx.player);
            message(e, "You disarm the trap and take the contents of the chest.");
        } else if (door) {
            if (!traverse(e, door, door.xp)) { message(e, "You cannot open a passage through this door."); return done; }
        } else {
            ctx.player.varps.setVarbitValue(HAM_TRAPDOOR.varbitId, 1);
            services.variables.sendVarbit(ctx.player, HAM_TRAPDOOR.varbitId, 1);
            services.location.sendLocChangeToPlayer(ctx.player, HAM_TRAPDOOR.locId, HAM_TRAPDOOR.locId, data.tile, data.level);
            services.skills.addSkillXp(ctx.player, THIEVING_SKILL_ID, HAM_TRAPDOOR.xp);
            message(e, "You pick the lock on the trapdoor.");
        }
        services.animation.playPlayerSeq(ctx.player, 536);
        services.sound.sendSound(ctx.player, 2402);
        return done;
    });

    function start(e: LocInteractionEvent): void {
        if (!validTarget(e)) return;
        const data: PicklockActionData = { locId: e.locId, tile: { ...e.tile }, level: e.level,
            origin: playerTile(e.player), worldViewId: e.player.worldViewId,
            action: e.action ?? "pick-lock", started: false };
        if (!requestSkillAction(e.services, e.player, START, data, e.tick)) message(e, "You're too busy to do that right now.");
    }

    // Specific quest handlers take precedence over this non-rewarding fallback.
    for (const action of PICKLOCK_OPTIONS) registry.registerLocAction(action, (e) => message(e, "You cannot pick this lock yet."));
    for (const door of PICKLOCK_DOORS) {
        const id = door.locId;
        for (const option of PICKLOCK_OPTIONS) registry.registerLocInteraction(id, start, option);
        registry.registerLocInteraction(id, (e) => {
            if (!validTarget(e)) return;
            if (door && getPicklockDoorSide(door, e.tile, e.level, playerTile(e.player)).policy === "free") {
                if (!traverse(e, door, 0)) message(e, "You cannot open a passage through this door.");
            } else message(e, "It is locked.");
        }, "open");
    }
    registry.registerActionHandler(TRAP.kind, (ctx): ActionExecutionResult => {
        const data = ctx.data as PicklockActionData;
        const e: LocInteractionEvent = { ...data, player: ctx.player, tick: ctx.tick, services: ctx.services };
        const chest = chests.get(e.locId);
        if (!chest || !validTarget(e, data) || depleted.has(keyFor(e)) || e.player.worldViewId !== -1
            || !chest.placements.some(p => p.level === e.level && sameTile(p, e.tile))) return {ok:true,effects:[]};
        // Nature chest formula verified; other fixed-bundle chests use this
        // explicitly provisional damage policy until their formula is sourced.
        const hit = ctx.services.combat.applyPlayerHitsplat(ctx.player, 16, Math.floor(ctx.player.skillSystem.getHitpointsCurrent() * 0.12) + 3, ctx.tick);
        message(e, "You trigger a trap! Try searching for traps first.");
        return {ok:true,effects:[{type:"hitsplat",playerId:ctx.player.id,targetType:"player",targetId:ctx.player.id,
            damage:hit.amount,style:hit.style,hpCurrent:hit.hpCurrent,hpMax:hit.hpMax,tick:ctx.tick}]};
    });
    for (const def of PICKLOCK_CHESTS) {
        for (const option of ["search for traps", ...PICKLOCK_OPTIONS]) registry.registerLocInteraction(def.locId, start, option);
        registry.registerLocInteraction(def.locId, (e) => {
            if (!validTarget(e)) return;
            if (depleted.has(keyFor(e))) { message(e, "The chest is empty."); return; }
            requestSkillAction(e.services, e.player, TRAP, {locId:e.locId,tile:e.tile,level:e.level,
                worldViewId:e.player.worldViewId,origin:playerTile(e.player),action:e.action,started:false}, e.tick);
        }, "open");
    }
    for (const id of [HAM_TRAPDOOR.locId, HAM_TRAPDOOR.closedId]) {
        for (const option of PICKLOCK_OPTIONS) registry.registerLocInteraction(id, start, option);
        registry.registerLocInteraction(id, (e) => { if (validTarget(e)) message(e, "The trapdoor is locked."); }, "open");
    }
    for (const id of [HAM_TRAPDOOR.locId, HAM_TRAPDOOR.openId]) {
        const reset = (e: LocInteractionEvent) => {
            e.player.varps.setVarbitValue(HAM_TRAPDOOR.varbitId, 0);
            e.services.variables.sendVarbit(e.player, HAM_TRAPDOOR.varbitId, 0);
            e.services.location.sendLocChangeToPlayer(e.player, HAM_TRAPDOOR.locId, HAM_TRAPDOOR.locId, e.tile, e.level);
        };
        registry.registerLocInteraction(id, (e) => {
            if (validTarget(e) && e.player.varps.getVarbitValue(HAM_TRAPDOOR.varbitId) === 1) reset(e);
        }, "close");
        registry.registerLocInteraction(id, (e) => {
            if (!validTarget(e) || e.player.varps.getVarbitValue(HAM_TRAPDOOR.varbitId) !== 1) return;
            message(e, "You climb down through the trapdoor...");
            reset(e);
            const dest = HAM_TRAPDOOR.destination;
            e.services.movement.teleportPlayer(e.player, dest.x, dest.y, dest.level);
            e.services.sound.sendSound(e.player, 91);
            message(e, "... and enter a dimly lit cavern area.");
        }, "climb-down");
    }
}
