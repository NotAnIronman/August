import assert from "node:assert/strict";
import { AttackType } from "@server/game/combat/AttackType";
import { MultiCombatSystem, multiCombatSystem } from "@server/game/combat/MultiCombatZones";
import { CombatAttackManager } from "@server/game/combat/engine/CombatAttackManager";
import { CombatAttributes } from "@server/game/combat/state/CombatAttributes";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { NpcState } from "@server/game/npc";
import { NpcManager } from "@server/game/npcManager";
import { PlayerState } from "@server/game/player";
import { FollowingHandler } from "@server/game/interactions/FollowingHandler";
import { PlayerInteractionSystem } from "@server/game/interactions/PlayerInteractionSystem";
import { FollowInteractionKind } from "@server/game/interactions/types";
import { MovementService } from "@server/game/services/MovementService";
import { createTestGamemode } from "./fixtures/createTestGamemode";

const mode = createTestGamemode("playtester-movement", "Playtester movement");
registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100,
    skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100,
    hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const player = new PlayerState(1, 3200, 3200, 0, mode);
const npc = (id: number, x = 3201, y = 3200) => new NpcState(id, 1, 1, -1, -1, 32,
    { x, y, level: 0 }, { maxHitpoints: 10, wanderRadius: 2, combatLeashRadius: 7 });
const first = npc(1), second = npc(2, 3200, 3201);
{
 const socket={};let cleared=0;
 const movement=new MovementService({players:{getSocketByPlayerId:()=>socket,clearAllInteractions:(s:unknown)=>{assert.equal(s,socket);cleared++;}}} as any);
 player.setCombatTarget(first);player.setInteraction("npc",first.id);player.pendingFaceTile={x:first.tileX,y:first.tileY};
 movement.clearPlayerTarget(player);
 assert.equal(cleared,1,"Eclipse clears the interaction system as well as actor facing");
 assert.equal(player.getInteractionTarget(),undefined);
 assert.equal(player.pendingFaceTile,undefined);
}
const traits = { type: AttackType.Melee, style: null, rangeTiles: 1, speedTicks: 4 };
const attacks = new CombatAttackManager();
assert(attacks.prepareAttack(first, player, traits, 100));
assert.equal(attacks.prepareAttack(second, player, traits, 100), null, "same-tick second attacker cannot launch");
assert(attacks.prepareAttack(player, first, traits, 100), "retaliating against the same opponent remains legal");
assert.equal(attacks.prepareAttack(second, player, traits, 101), null, "lock persists during hit delay");
assert(attacks.prepareAttack(second, player, traits, 116), "expired engagement releases the target");
for (const actor of [first, second, player]) multiCombatSystem.removeActor(actor);

const multi = new MultiCombatSystem();
const a = npc(3, 2875, 5355), b = npc(4, 2876, 5355), c = npc(5, 2875, 5356);
multi.recordEngagement(a, b, 10);
assert(multi.canAttack(c, b, 10).allowed, "multi allows simultaneous opponents");
const outsider = npc(6);
multi.recordEngagement(a, outsider, 10);
assert.equal(multi.canAttack(c, outsider, 10).allowed, false, "both actors must be inside multi");

const manager = new NpcManager({} as never, { canNpcStep: () => true } as never, {} as never, {} as never);
const enormousRadius = new NpcState(88,13021,1,-1,-1,32,{x:3201,y:3200,level:0},
    {maxHitpoints:10,combatLevel:100,isAggressive:true,aggressionRadius:2_147_483_647});
const started = performance.now();
assert((manager as any).checkNpcAggression(enormousRadius,100,()=>[{id:999,x:3200,y:3200,level:0,combatLevel:3,inCombat:false,
    aggressionState:{entryTick:100,aggressionExpired:false,tile1:{x:3200,y:3200},tile2:{x:3200,y:3200}}}]));
assert(performance.now()-started<1000,"malformed aggression radius must not scan billions of empty tiles");
const aggressive = (id: number, x = 3201, y = 3200) => new NpcState(id, 1, 1, -1, -1, 32,
    { x, y, level: 0 }, { maxHitpoints: 10, combatLevel: 100, isAggressive: true });
const nearby = (x = 3200, y = 3200) => [{ id: 90, x, y, level: 0, combatLevel: 3, inCombat: false,
    aggressionState: { entryTick: 100, aggressionExpired: false, tile1: { x, y }, tile2: { x, y } } }];
assert((manager as any).checkNpcAggression(aggressive(20), 100, () => nearby()));
assert.equal((manager as any).checkNpcAggression(aggressive(21), 100, () => nearby()), undefined,
    "same-tick aggression searches claim a single-combat player only once");
assert((manager as any).checkNpcAggression(aggressive(22, 2875, 5355), 100, () => nearby(2876, 5355)),
    "multi permits another aggressive target acquisition");
const escape = (target: NpcState) => (manager as any).queueOverlapEscape(target, () => [{
    id: target.getCombatTargetPlayerId() ?? 500, x: target.tileX, y: target.tileY, level: 0,
}]);
const roamer = npc(7);
roamer.teleport(roamer.spawnX + 2, roamer.spawnY, roamer.spawnLevel);
assert.equal(escape(roamer), false, "non-combat players cannot body-push wandering NPCs");
assert.equal(roamer.hasPath(), false);
const fighter = npc(8);
fighter.engageCombat(player.id, 0);
fighter.teleport(fighter.spawnX + 7, fighter.spawnY, fighter.spawnLevel);
assert.equal(escape(fighter), false, "first overlap tick leaves mutual melee routing in control");
assert(escape(fighter));
assert(fighter.getPathQueue().every(tile => !fighter.isTileOutsideCombatLeash(tile.x, tile.y)), "overlap escape obeys combat leash");
const pushedFighter = npc(99);
pushedFighter.engageCombat(player.id, 0);
pushedFighter.teleport(pushedFighter.spawnX + 2, pushedFighter.spawnY, pushedFighter.spawnLevel);
escape(pushedFighter); escape(pushedFighter);
assert.equal(pushedFighter.getPathQueue()[0]?.x, pushedFighter.tileX - 1,
    "equal-distance combat escape steps back toward home instead of chasing the player's eastward push");

const follower = new PlayerState(2, 3200, 3200, 0, mode);
const leader = new PlayerState(3, 3203, 3200, 0, mode);
leader.followX = 3202; leader.followZ = 3200;
const socket = {} as never;
const repository = {
    get: () => follower,
    getById: (id: number) => id === leader.id ? leader : id === follower.id ? follower : undefined,
    getSocketByPlayerId: () => undefined,
};
let blocked = false;
const pathService = {
    edgeHasWallBetween: () => blocked,
    findPathSteps: (request: any, opts: any) => {
        assert.equal(opts.routeStrategy.hasArrived(request.to.x - 1, request.to.y, 0), false, "follow uses exact destination");
        const steps = [];
        let { x, y } = request.from;
        while (x !== request.to.x || y !== request.to.y) {
            x += Math.sign(request.to.x - x); y += Math.sign(request.to.y - y);
            steps.push({ x, y });
        }
        return { ok: !blocked, steps, end: request.to };
    },
};
const states = new Map();
const follow = new FollowingHandler(repository as never, pathService as never, states, {});
assert.equal(follow.startFollowing(socket, follower.id, FollowInteractionKind.Follow).ok, false);
leader.worldViewId = 77;
assert.equal(follow.startFollowing(socket, leader.id, FollowInteractionKind.Follow).ok, false,
    "following cannot cross private world views");
leader.worldViewId = follower.worldViewId;
assert(follow.startFollowing(socket, leader.id, FollowInteractionKind.Follow).ok);
assert.deepEqual(follower.getInteractionTarget(),{type:"player",id:leader.id},"follow stores the target so later clearing emits an update");
follow.updateFollowing(1);
assert.deepEqual(follower.getPathQueue().at(-1), { x: 3202, y: 3200 }, "follower fills the extra one-tile gap");
blocked = true;
follower.x = leader.x; follower.y = leader.y;
follow.updateFollowing(2);
assert.equal(follower.hasPath(), false, "overlap cannot force a step through collision");

// An invalid NPC click need not have an entry in the interaction map.
const interactions = Object.create(PlayerInteractionSystem.prototype) as any;
interactions.players = { get: () => follower };
interactions.interactions = new Map();
interactions.pendingLocInteractions = new Map();
follower.setCombatTarget(first); follower.setInteraction("npc", first.id);
interactions.clearAllInteractions(socket);
assert.equal(follower.getInteractionTarget(), undefined);
assert.equal(follower.combatAttributes.get(CombatAttributes.COMBAT_TARGET), null);

follower.setCombatTarget(first); follower.setInteraction("npc", first.id);
follower.faceRot(512); follower.faceTile(3209, 3209);
let routed = false;
const movement = new MovementService({
    players: { get: () => follower, clearAllInteractions: () => interactions.clearAllInteractions(socket),
        routePlayer: () => { routed = true; return { ok: true }; } },
    interfaceManager: { closeInterruptibleInterfaces: () => {} },
    networkLayer: { withDirectSendBypass: (_context: string, send: () => void) => send(), sendWithGuard: () => {} },
} as never);
movement.routeOrRejectWalkCommand(socket, { to: { x: 3204, y: 3200 }, run: false }, 3, "test");
assert(routed);
assert.equal(follower.getInteractionTarget(), undefined);
assert.equal(follower.pendingFaceTile, undefined);
assert.equal(follower.combatAttributes.get(CombatAttributes.COMBAT_TARGET), null, "walking cancels facing-producing combat intent");
console.log("Playtester combat, NPC leash, follow and walk-facing regressions passed");
