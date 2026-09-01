import type { PlayerState } from "@server/game/player";
import { EquipmentSlot } from "@august/osrs-engine/config/player/Equipment";
import { INSTANCE_GRAVE_RECLAIM_LOC_ID } from "@server/game/death/InstanceGravePresentation";
import { AttackType } from "@server/game/combat/AttackType";
import { HITMARK_DAMAGE } from "@server/game/combat/HitEffects";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { faceAngleRs } from "@august/osrs-engine/geometry";
import { EncounterRegistry, registerEncounter } from "@server/game/encounters/EncounterRegistry";
import { NpcAttackDecision, NpcPreDeathDecision, type NpcAttackEvent, type IScriptRegistry, type ScriptServices } from "@server/game/scripts/types";
import type { NpcState } from "@server/game/npc";
import { openRewardDisplay } from "@server/content/gamemodes/vanilla/widgets/rewardDisplay";

const CHEST = 51346, CRATE = 51371, SAPLING = 51365, STOVE = 51362;
// 51368 is the cache's actionable "Fishing spot". Keep 51367 too because it
// was the original map reference and some placements use that variant.
const FISHING_SPOTS = [51367, 51368] as const;
const NET = 303, ROPE = 954, BUTTERFLY_NET = 10010, PESTLE = 233, VIAL = 227, GRUB = 29078, PASTE = 29079, BREAM = 29216, COOKED_BREAM = 29217;
const MOONLIGHT_MOTHS = [12771, 12772, 12773] as const;
const GLYPH_NPC_ID = 13015, BLUE_ICE_STORM_NPC_ID = 13027, BLOOD_JAGUAR_NPC_ID = 13021;
const STATUES = [51372, 51373, 51374] as const;
const CHEST_TILE = { x: 1513, y: 9578, level: 0 };
type Moon = "blood" | "eclipse" | "blue";
type Tile = { x: number; y: number; level: number };
const MOONS: Record<Moon, { id: number; entry: { x: number; y: number; level: number }; outside: { x: number; y: number; level: number }; grave: { x: number; y: number; level: number }; boss: { x: number; y: number; level: number }; sourceBaseX: number; sourceBaseY: number; destinationChunkX: number; destinationChunkY: number; next: Moon }> = {
    // Each chamber needs its own map slice. Copying all three into one 104x104
    // view cut off Blood/Eclipse and displaced their terrain vertically.
    blood: { id: 13011, entry: { x: 1396, y: 9632, level: 0 }, outside: { x: 1413, y: 9632, level: 0 }, grave: { x: 1414, y: 9632, level: 0 }, boss: { x: 1392, y: 9632, level: 0 }, sourceBaseX: 1368, sourceBaseY: 9608, destinationChunkX: 3, destinationChunkY: 3, next: "eclipse" },
    eclipse: { id: 13012, entry: { x: 1484, y: 9632, level: 0 }, outside: { x: 1466, y: 9632, level: 0 }, grave: { x: 1465, y: 9632, level: 0 }, boss: { x: 1488, y: 9632, level: 0 }, sourceBaseX: 1440, sourceBaseY: 9608, destinationChunkX: 1, destinationChunkY: 3, next: "blue" },
    blue: { id: 13013, entry: { x: 1440, y: 9676, level: 0 }, outside: { x: 1440, y: 9658, level: 0 }, grave: { x: 1440, y: 9657, level: 0 }, boss: { x: 1440, y: 9680, level: 0 }, sourceBaseX: 1408, sourceBaseY: 9640, destinationChunkX: 2, destinationChunkY: 2, next: "blood" },
};
type Run = { killed: Set<Moon>; active?: Moon; npcId?: number; instanceId: string };
const runs = new Map<number, Run>();

const MOON_IDLE_SEQUENCES: Record<Moon, number> = { blood: 10995, eclipse: 11016, blue: 10995 };
const MOON_MELEE_SEQUENCES: Record<Moon, number> = { blood: 11001, eclipse: 11022, blue: 10987 };
// Every arena starts at a distinct point in the same clockwise glyph ring.
// The three first positions are the exact offsets supplied during testing.
const GLYPH_OFFSETS: Record<Moon, ReadonlyArray<readonly [number, number]>> = {
    eclipse: [[-4, 1], [-2, 3], [1, 3], [3, 1], [3, -2], [1, -4], [-2, -4], [-4, -2]],
    blue: [[-2, -4], [-4, -2], [-4, 1], [-2, 3], [1, 3], [3, 1], [3, -2], [1, -4]],
    blood: [[3, -2], [1, -4], [-2, -4], [-4, -2], [-4, 1], [-2, 3], [1, 3], [3, 1]],
};
type GlyphState = { markerId?: number; offsets: ReadonlyArray<readonly [number, number]>; position: number; attacks: number; completedRotations: number; specialReady: boolean; offTicks: number; tickTaskActive: boolean; onGlyph?: boolean };
const glyphStates = new WeakMap<NpcState, GlyphState>();
type MoonSpecialState = { kind: Moon; owner: PlayerState; active: boolean; childIds: Set<number>; brazierTiles: Set<string>; waves: number };
const moonSpecials = new WeakMap<NpcState, MoonSpecialState>();
const specialChildOwners = new Map<number, NpcState>();
const BRAZIER = 52992;
const UNLIT_BRAZIER = 53048;
const UNLIT_BRAZIERS = [53048, 53049] as const;
const BLUE_BRAZIER_TILES = [{ x: 1427, y: 9680 }, { x: 1453, y: 9680 }] as const;

function glyphTile(npc: NpcState, state: GlyphState): Tile {
    const [dx, dy] = state.offsets[state.position % state.offsets.length]!;
    return { x: npc.spawnX + dx, y: npc.spawnY + dy, level: npc.level };
}

function isOnGlyph(player: PlayerState, npc: NpcState, state: GlyphState): boolean {
    const tile = glyphTile(npc, state);
    return player.worldViewId === npc.worldViewId && player.level === tile.level &&
        player.tileX >= tile.x && player.tileX <= tile.x + 1 &&
        player.tileY >= tile.y && player.tileY <= tile.y + 1;
}

function moveGlyph(npc: NpcState, player: PlayerState, services: ScriptServices, state: GlyphState): void {
    const tile = glyphTile(npc, state);
    const marker = state.markerId === undefined ? undefined : services.combat.getNpc(state.markerId);
    if (marker) {
        services.npc.teleportNpc(marker, tile);
        return;
    }
    const spawned = services.npc.spawnNpc({
        id: GLYPH_NPC_ID, x: tile.x, y: tile.y, level: tile.level, size: 2,
        worldViewId: npc.worldViewId, ownerPlayerId: player.id, wanderRadius: 0,
        isAggressive: false, isUnattackable: true, isImmovable: true, respawns: false,
    });
    if (spawned) state.markerId = spawned.id;
}

function tileKey(tile: { x: number; y: number; level: number }): string { return `${tile.x},${tile.y},${tile.level}`; }

function stopMoonSpecial(npc: NpcState, services: ScriptServices): void {
    const special = moonSpecials.get(npc);
    if (!special) return;
    special.active = false;
    for (const childId of special.childIds) {
        specialChildOwners.delete(childId);
        services.npc.removeNpc(childId);
    }
    special.childIds.clear();
    if (special.kind === "blue") {
        for (const tile of BLUE_BRAZIER_TILES) {
            services.location.replaceTemporaryLoc(
                { worldViewId: npc.worldViewId }, UNLIT_BRAZIER, BRAZIER, tile, npc.level,
            );
        }
    }
    npc.forcePlayerMaxHit = false;
    npc.isUnattackable = false;
}

function restartGlyphCycle(npc: NpcState, player: PlayerState, services: ScriptServices): void {
    const state = glyphStates.get(npc);
    if (!state) return;
    stopMoonSpecial(npc, services);
    // Specials resume from the glyph which triggered them rather than
    // snapping the cycle back to its first position.
    state.attacks = 0;
    state.offTicks = 0;
    moveGlyph(npc, player, services, state);
    setGlyphDamageMode(npc, state, isOnGlyph(player, npc, state));
}

function playerIsFacingNpc(player: PlayerState, npc: NpcState): boolean {
    const targetRotation = faceAngleRs(player.tileX, player.tileY, npc.tileX + 1, npc.tileY + 1) & 2047;
    let delta = ((player.rot & 2047) - targetRotation) & 2047;
    if (delta > 1024) delta = 2048 - delta;
    return delta <= 256;
}

function startBloodSpecial(npc: NpcState, player: PlayerState, services: ScriptServices, special: MoonSpecialState): void {
    npc.isUnattackable = true;
    for (const [dx, dy] of [[-4, 0], [4, 0]] as const) {
        const jaguar = services.npc.spawnNpc({
            id: BLOOD_JAGUAR_NPC_ID, x: npc.spawnX + dx, y: npc.spawnY + dy, level: npc.level,
            worldViewId: npc.worldViewId, ownerPlayerId: player.id, wanderRadius: 0,
            isAggressive: true, aggressionRadius: 2_147_483_647,
            combatLeashRadius: 2_147_483_647, respawns: false,
        });
        if (!jaguar) continue;
        special.childIds.add(jaguar.id);
        specialChildOwners.set(jaguar.id, npc);
        services.npc.engageCombat(jaguar, player);
    }
    services.messaging.sendGameMessage(player, "Blood jaguars leap from the shadows!");
}

function moonJaguarAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    const bloodMoon = specialChildOwners.get(event.npc.id);
    const special = bloodMoon ? moonSpecials.get(bloodMoon) : undefined;
    if (!bloodMoon || !special?.active || special.kind !== "blood") return;
    const damage = 1 + Math.floor(Math.random() * 8);
    const hit = event.services.combat.applyNpcDamageToPlayer(
        event.npc, event.target, HITMARK_DAMAGE, damage, event.tick,
    );
    // The Blood Moon restores precisely the damage that a jaguar actually
    // inflicted, including any prayer or damage reductions on the player.
    if (hit.amount > 0) bloodMoon.heal(hit.amount);
    return NpcAttackDecision.Prevent;
}

function startEclipseSpecial(npc: NpcState, player: PlayerState, services: ScriptServices, special: MoonSpecialState): void {
    // Eclipse remains targetable during this special: facing her at each
    // teleport grants a max-hit window instead of locking combat out.
    npc.isUnattackable = false;
    const state = glyphStates.get(npc);
    if (!state) return;
    services.movement.teleportPlayer(player, MOONS.eclipse.boss.x, MOONS.eclipse.boss.y, MOONS.eclipse.boss.level);
    let jumps = 0;
    const jump = (): void => {
        if (!special.active || npc.getHitpoints() <= 0 || player.worldViewId !== npc.worldViewId) return;
        const [dx, dy] = state.offsets[Math.floor(Math.random() * state.offsets.length)]!;
        services.npc.teleportNpc(npc, { x: npc.spawnX + dx, y: npc.spawnY + dy, level: npc.level });
        npc.forcePlayerMaxHit = false;
        services.scheduler.after(3, (tick) => {
            if (!special.active || player.worldViewId !== npc.worldViewId) return;
            if (playerIsFacingNpc(player, npc)) {
                npc.forcePlayerMaxHit = true;
            } else {
                services.npc.engageCombat(npc, player);
                services.npc.queueNpcSeq(npc, MOON_MELEE_SEQUENCES.eclipse);
                services.combat.applyNpcDamageToPlayer(npc, player, HITMARK_DAMAGE, 8 + Math.floor(Math.random() * 13), tick);
            }
            jumps += 1;
            if (jumps >= 5) {
                services.scheduler.after(3, () => {
                    if (!special.active) return;
                    services.movement.teleportPlayer(player, MOONS.eclipse.entry.x, MOONS.eclipse.entry.y, MOONS.eclipse.entry.level);
                    services.npc.teleportNpc(npc, MOONS.eclipse.boss);
                    restartGlyphCycle(npc, player, services);
                }, { kind: "npc", id: npc.id });
            } else {
                jump();
            }
        }, { kind: "npc", id: npc.id });
    };
    jump();
}

function spawnBlueStormWave(npc: NpcState, player: PlayerState, services: ScriptServices, special: MoonSpecialState): void {
    if (!special.active) return;
    // Five storms use the western lanes and five use the eastern lanes. Each
    // storm independently travels north-to-south or south-to-north.
    for (const lanes of [[1429, 1430, 1431, 1432, 1433, 1434, 1435], [1445, 1446, 1447, 1448, 1449, 1450, 1451]]) {
        const availableLanes = [...lanes];
        for (let index = 0; index < 5; index += 1) {
            const laneIndex = Math.floor(Math.random() * availableLanes.length);
            const laneX = availableLanes.splice(laneIndex, 1)[0]!;
            const directionY = Math.random() < 0.5 ? 1 : -1;
            const storm = services.npc.spawnNpc({
                id: BLUE_ICE_STORM_NPC_ID, x: laneX, y: directionY > 0 ? 9670 : 9690, level: npc.level,
                worldViewId: npc.worldViewId, ownerPlayerId: player.id, wanderRadius: 0,
                isUnattackable: true, isImmovable: true, respawns: false,
            });
            if (!storm) continue;
            special.childIds.add(storm.id);
            specialChildOwners.set(storm.id, npc);
            const advance = (): void => {
                if (!special.active || player.worldViewId !== npc.worldViewId) return;
                const nextY = storm.tileY + directionY;
                if (nextY <= 9670 || nextY >= 9690) {
                    special.childIds.delete(storm.id); specialChildOwners.delete(storm.id); services.npc.removeNpc(storm.id); return;
                }
                services.npc.teleportNpc(storm, { x: storm.tileX, y: nextY, level: storm.level });
                if (player.tileX === storm.tileX && player.tileY === storm.tileY && player.level === storm.level) {
                    player.energy.setRunEnergyPercent(0);
                    player.setRunToggle(false);
                    services.combat.applyNpcDamageToPlayer(npc, player, HITMARK_DAMAGE, 5 + Math.floor(Math.random() * 11), services.system.getCurrentTick());
                    special.childIds.delete(storm.id); specialChildOwners.delete(storm.id); services.npc.removeNpc(storm.id); return;
                }
                services.scheduler.after(1, advance, { kind: "npc", id: npc.id });
            };
            services.scheduler.after(1, advance, { kind: "npc", id: npc.id });
        }
    }
    special.waves += 1;
}

function startBlueSpecial(npc: NpcState, player: PlayerState, services: ScriptServices, special: MoonSpecialState): void {
    npc.isUnattackable = true;
    for (const tile of BLUE_BRAZIER_TILES) {
        services.location.replaceTemporaryLoc(
            { worldViewId: npc.worldViewId }, BRAZIER, UNLIT_BRAZIER, tile, npc.level,
        );
    }
    services.messaging.sendGameMessage(player, "The braziers go dark as an ice storm sweeps the chamber.");
    spawnBlueStormWave(npc, player, services, special);
    const healWhileUnlit = (tick: number): void => {
        if (!special.active) return;
        const unlitCount = Math.max(0, 2 - special.brazierTiles.size);
        if (unlitCount > 0) npc.heal(5 * unlitCount);
        services.scheduler.after(5, healWhileUnlit, { kind: "npc", id: npc.id });
    };
    services.scheduler.after(5, healWhileUnlit, { kind: "npc", id: npc.id });
    services.scheduler.after(75, () => {
        if (!special.active) return;
        services.messaging.sendGameMessage(player, "The Blue Moon's storm finally dissipates.");
        restartGlyphCycle(npc, player, services);
    }, { kind: "npc", id: npc.id });
}

function startMoonSpecial(npc: NpcState, player: PlayerState, services: ScriptServices, moon: Moon): void {
    const state = glyphStates.get(npc);
    if (!state) return;
    if (state.markerId !== undefined) services.npc.removeNpc(state.markerId);
    const special: MoonSpecialState = { kind: moon, owner: player, active: true, childIds: new Set(), brazierTiles: new Set(), waves: 0 };
    moonSpecials.set(npc, special);
    if (moon === "blood") startBloodSpecial(npc, player, services, special);
    if (moon === "eclipse") startEclipseSpecial(npc, player, services, special);
    if (moon === "blue") startBlueSpecial(npc, player, services, special);
}

function setGlyphDamageMode(npc: NpcState, state: GlyphState, onGlyph: boolean): void {
    if (state.onGlyph === onGlyph) return;
    state.onGlyph = onGlyph;
    // The glyph does not alter accuracy: it controls the damage result.
    // Standing anywhere on its 2x2 footprint deals full damage; away from it
    // every landed player hit is halved (e.g. 25 becomes 12).
    npc.incomingPlayerDamageMultiplier = onGlyph ? 1 : 0.5;
}

function beginGlyphCycle(npc: NpcState, player: PlayerState, services: ScriptServices, moon: Moon): void {
    const state: GlyphState = {
        offsets: GLYPH_OFFSETS[moon], position: 0, attacks: 0, completedRotations: 0, specialReady: false, offTicks: 0, tickTaskActive: true,
    };
    glyphStates.set(npc, state);
    moveGlyph(npc, player, services, state);
    setGlyphDamageMode(npc, state, isOnGlyph(player, npc, state));
    const pulse = (tick: number): void => {
        if (!state.tickTaskActive || npc.getHitpoints() <= 0 || player.worldViewId !== npc.worldViewId) return;
        if (moonSpecials.get(npc)?.active) {
            services.scheduler.after(1, pulse, { kind: "npc", id: npc.id });
            return;
        }
        const onGlyph = isOnGlyph(player, npc, state);
        setGlyphDamageMode(npc, state, onGlyph);
        if (onGlyph) state.offTicks = 0;
        else state.offTicks += 1;
        // Six complete ticks off the active glyph grants a grace period;
        // thereafter Eyatlalli's curse chips damage every other tick.
        if (state.offTicks >= 6 && (state.offTicks - 6) % 2 === 0) {
            services.combat.applyNpcDamageToPlayer(npc, player, HITMARK_DAMAGE, 1 + Math.floor(Math.random() * 3), tick);
        }
        services.scheduler.after(1, pulse, { kind: "npc", id: npc.id });
    };
    services.scheduler.after(1, pulse, { kind: "npc", id: npc.id });
}

function moonGlyphAttack(event: NpcAttackEvent): NpcAttackDecision | void {
    if (event.npc.ownerPlayerId !== event.target.id) return;
    const state = glyphStates.get(event.npc);
    if (!state) return;
    if (moonSpecials.get(event.npc)?.active) return NpcAttackDecision.Prevent;
    state.attacks += 1;
    if (state.attacks % 4 === 0) {
        state.position = (state.position + 1) % state.offsets.length;
        if (state.position % 4 === 0) {
            state.completedRotations += 1;
            state.specialReady = true;
        }
        state.offTicks = 0;
        setGlyphDamageMode(event.npc, state, false);
        moveGlyph(event.npc, event.target, event.services, state);
        if (state.specialReady) {
            const moon = (Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>).find(([, definition]) => definition.id === event.npc.typeId)?.[0];
            if (moon) startMoonSpecial(event.npc, event.target, event.services, moon);
            state.specialReady = false;
            return NpcAttackDecision.Prevent;
        }
    }
    const moon = (Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>).find(([, definition]) => definition.id === event.npc.typeId)?.[0];
    if (!moon) return;
    event.services.npc.queueNpcSeq(event.npc, MOON_MELEE_SEQUENCES[moon]);
    let missed = false;
    for (const [index, maxHit] of [4, 8, 20].entries()) {
        event.services.scheduler.after(index, (tick) => {
            if (event.npc.getHitpoints() <= 0 || event.target.worldViewId !== event.npc.worldViewId) return;
            // Once any strike misses, the remaining hits in this attack are
            // guaranteed misses; a later hit can never recover into damage.
            if (!missed && Math.random() >= 0.75) missed = true;
            const damage = missed ? 0 : 1 + Math.floor(Math.random() * maxHit);
            event.services.combat.applyNpcDamageToPlayer(event.npc, event.target, HITMARK_DAMAGE, damage, tick);
        }, { kind: "npc", id: event.npc.id });
    }
    return NpcAttackDecision.Prevent;
}

function registerEncounters(): void {
    for (const [key, moon] of Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>) {
        if (EncounterRegistry.shared.get(`moon-${key}`)) continue;
        registerEncounter({ id: `moon-${key}`, npcTypeIds: [moon.id], maxHealth: 500, bossHealthBar: { name: `${key[0].toUpperCase()}${key.slice(1)} Moon`, npcTypeId: moon.id }, movement: { wanderRadius: 0, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, combatLeashRadius: 60, retreatInteractionRange: 60 }, attacks: [{ id: "attack", type: AttackType.Melee, rangeTiles: 30, preferredDistance: 30, speedTicks: 4, maxHit: 20, animation: "attack" }] });
    }
    if (!EncounterRegistry.shared.get("moon-blood-jaguar")) {
        registerEncounter({
            id: "moon-blood-jaguar",
            npcTypeIds: [BLOOD_JAGUAR_NPC_ID],
            maxHealth: 35,
            movement: { wanderRadius: 0, aggressionRadius: 30 },
            attacks: [{ id: "bite", type: AttackType.Melee, rangeTiles: 1, speedTicks: 4, maxHit: 8 }],
        });
    }
}

function addOrDrop(player: PlayerState, services: ScriptServices, itemId: number, quantity: number): void {
    const added = player.items.addItem(itemId, quantity, { assureFullInsertion: false }).completed;
    if (added < quantity) services.groundItems.spawn(itemId, quantity - added, { x: player.tileX, y: player.tileY, level: player.level }, { ownerId: player.id, privateTicks: 100, worldViewId: player.worldViewId, isMonsterDrop: false });
}

function spawnMoon(player: PlayerState, services: ScriptServices, moon: Moon): void {
    const run = runs.get(player.id); if (!run || run.active || run.killed.has(moon)) return;
    const def = MOONS[moon];
    services.movement.teleportPlayer(player, def.entry.x, def.entry.y, def.entry.level);
    const npc = services.npc.spawnNpc({ id: def.id, x: def.boss.x, y: def.boss.y, level: 0, size: 3, idleSeqId: MOON_IDLE_SEQUENCES[moon], worldViewId: player.worldViewId, ownerPlayerId: player.id, wanderRadius: 0, attackSpeed: 4, isAggressive: false, aggressionRadius: 30, aggressionToleranceTicks: 2_147_483_647, respawns: false });
    if (!npc) { services.messaging.sendGameMessage(player, "The Moon fails to awaken. Please try again."); return; }
    run.active = moon; run.npcId = npc.id;
    beginGlyphCycle(npc, player, services, moon);
    // Give the player four full ticks to orient after entering the chamber.
    services.scheduler.after(4, () => {
        if (runs.get(player.id) !== run || run.npcId !== npc.id || player.worldViewId !== npc.worldViewId) return;
        services.npc.engageCombat(npc, player);
    }, { kind: "npc", id: npc.id });
}

function createRun(player: PlayerState, services: ScriptServices, first: Moon, access: "solo" | "party" = "solo"): void {
    if (services.instances.get(player.id)) { services.messaging.sendGameMessage(player, "You are already inside an instance."); return; }
    const existing = runs.get(player.id);
    // An escape interrupts an active Moon. Clear its transient actor before
    // rebuilding the room so a re-entry always creates a fresh boss.
    if (existing?.active) {
        if (existing.npcId !== undefined) services.npc.removeNpc(existing.npcId);
        existing.active = undefined;
        existing.npcId = undefined;
    }
    if (existing?.killed.size) {
        if (existing.killed.has(first)) { services.messaging.sendGameMessage(player, `You have already defeated the ${first} Moon this run.`); return; }
        resumeRun(player, services, first);
        return;
    }
    const def = MOONS[first];
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: def.sourceBaseX, sourceBaseY: def.sourceBaseY, widthChunks: 8, heightChunks: 8, sourcePlanes: [0], destinationChunkX: def.destinationChunkX, destinationChunkY: def.destinationChunkY }]);
    const room = services.instances.create(player, { definitionId: "moons-of-peril", access, maxPlayers: access === "solo" ? 1 : 5, joinInProgress: access === "party", templateChunks, destination: def.entry, exit: def.outside, grave: { locId: INSTANCE_GRAVE_RECLAIM_LOC_ID, tile: def.grave, level: 0 } });
    if (!room) { services.messaging.sendGameMessage(player, "The Moon chamber is unavailable right now."); return; }
    runs.set(player.id, { killed: new Set(), instanceId: room.id }); services.instances.markStarted(room.id); spawnMoon(player, services, first);
}

/** Rebuild a fresh room when an early chest choice sends a player back in. */
function resumeRun(player: PlayerState, services: ScriptServices, next: Moon): void {
    const run = runs.get(player.id);
    if (!run || services.instances.get(player.id)) return;
    const def = MOONS[next];
    const templateChunks = services.instances.buildTemplate([{ sourceBaseX: def.sourceBaseX, sourceBaseY: def.sourceBaseY, widthChunks: 8, heightChunks: 8, sourcePlanes: [0], destinationChunkX: def.destinationChunkX, destinationChunkY: def.destinationChunkY }]);
    const room = services.instances.create(player, { definitionId: "moons-of-peril", access: "solo", maxPlayers: 1, templateChunks, destination: def.entry, exit: def.outside, grave: { locId: INSTANCE_GRAVE_RECLAIM_LOC_ID, tile: def.grave, level: 0 } });
    if (!room) { services.messaging.sendGameMessage(player, "The Moon chamber is unavailable right now."); return; }
    run.instanceId = room.id;
    services.instances.markStarted(room.id);
    spawnMoon(player, services, next);
}

const MOON_EQUIPMENT: Record<Moon, readonly number[]> = {
    eclipse: [29000, 29004, 29007, 29010], blue: [28988, 29013, 29016, 29019], blood: [29022, 29025, 29028, 28997],
};
function appendReward(rewards: Array<{ itemId: number; quantity: number }>, itemId: number, quantity: number): void {
    const existing = rewards.find(reward => reward.itemId === itemId);
    if (existing) existing.quantity += quantity; else rewards.push({ itemId, quantity });
}
function noteBulkReward(services: ScriptServices, itemId: number, quantity: number): number {
    if (quantity <= 1) return itemId;
    const noteId = services.data.getItemDefinition(itemId)?.noteId ?? -1;
    const note = noteId > 0 ? services.data.getItemDefinition(noteId) : undefined;
    return note?.noted ? noteId : itemId;
}
function chooseMoonPiece(player: PlayerState, moon: Moon): number {
    const pieces = MOON_EQUIPMENT[moon];
    const missing = pieces.filter(itemId => !player.collectionLog.hasItem(itemId));
    const pool = missing.length ? missing : pieces;
    return pool[Math.floor(Math.random() * pool.length)]!;
}
function reward(player: PlayerState, services: ScriptServices): void {
    const run = runs.get(player.id); if (!run || run.killed.size === 0) { services.messaging.sendGameMessage(player, "This chest seems empty."); return; }
    const count = run.killed.size;
    const resources = [{ itemId: 28899, quantity: 60 + count * 20 }, { itemId: 1939, quantity: 400 + count * 150 }, { itemId: 571, quantity: 60 + count * 30 }, { itemId: 6034, quantity: 20 + count * 10 }, { itemId: 1761, quantity: 20 + count * 10 }, { itemId: 205, quantity: 30 + count * 10 }, { itemId: 209, quantity: 20 + count * 8 }, { itemId: 28991, quantity: 100 + count * 75 }];
    const rewards: Array<{ itemId: number; quantity: number }> = [];
    let uniqueAwarded = false;
    for (const moon of run.killed) {
        if (Math.random() < 1 / 56) { appendReward(rewards, chooseMoonPiece(player, moon), 1); uniqueAwarded = true; }
    }
    if (!uniqueAwarded) {
        const rolls = count === 1 ? 1 : count === 2 ? 3 : 6;
        for (let roll = 0; roll < rolls; roll += 1) { const resource = resources[Math.floor(Math.random() * resources.length)]!; appendReward(rewards, noteBulkReward(services, resource.itemId, resource.quantity), resource.quantity); }
    }
    for (const item of rewards) addOrDrop(player, services, item.itemId, item.quantity);
    services.inventory.snapshotInventoryImmediate(player); for (const item of rewards) services.collectionLog.trackCollectionLogItem(player, item.itemId);
    openRewardDisplay(player, services, "Lunar chest", rewards); services.messaging.sendGameMessage(player, `You search the Lunar chest after defeating ${count} Moon${count === 1 ? "" : "s"}.`); runs.delete(player.id);
}

function searchChest(player: PlayerState, services: ScriptServices): void {
    const run = runs.get(player.id);
    if (!run || run.killed.size === 0) return reward(player, services);
    if (run.killed.size === 3) return reward(player, services);
    services.dialog.openDialogOptions(player, { id: "lunar-chest-choice", title: "The Lunar chest awaits.", options: ["Loot chest", "Next boss", "Cancel"], modal: true, onSelect: choice => {
        if (choice === 0) reward(player, services);
        if (choice === 1) {
            const next = (Object.keys(MOONS) as Moon[]).find(moon => !run.killed.has(moon));
            if (next) services.movement.teleportPlayer(player, MOONS[next].outside.x, MOONS[next].outside.y, MOONS[next].outside.level);
        }
    } });
}

function giveIfMissing(player: PlayerState, services: ScriptServices, itemId: number, quantity = 1): void {
    if (!player.items.hasItem(itemId, 1)) addOrDrop(player, services, itemId, quantity);
}
function giveSupplySet(player: PlayerState, services: ScriptServices, choice: number): void {
    if (choice === 0) giveIfMissing(player, services, NET);
    if (choice === 1) { giveIfMissing(player, services, ROPE); giveIfMissing(player, services, BUTTERFLY_NET); }
    if (choice === 2) { giveIfMissing(player, services, PESTLE); giveIfMissing(player, services, VIAL, 2); }
    services.inventory.snapshotInventoryImmediate(player);
}
function takeSupplies(player: PlayerState, services: ScriptServices): void {
    services.dialog.openDialogOptions(player, { id: "moon-supplies", title: "Take supplies", options: ["Fishing supplies", "Hunting supplies", "Herblore supplies"], modal: true, onSelect: choice => {
        giveSupplySet(player, services, choice);
    } });
}

function skillLevel(player: PlayerState, skill: SkillId): number { return player.skillSystem.getSkill(skill).baseLevel; }

function sameTile(player: PlayerState, tile: { x: number; y: number; level: number }, worldViewId: number): boolean {
    return player.tileX === tile.x && player.tileY === tile.y && player.level === tile.level && player.worldViewId === worldViewId;
}

function startFishing(player: PlayerState, services: ScriptServices): void {
    if (!player.items.hasItem(NET, 1)) { services.messaging.sendGameMessage(player, "You need a small fishing net to fish here."); return; }
    const start = { x: player.tileX, y: player.tileY, level: player.level };
    const worldViewId = player.worldViewId;
    const catchBream = (): void => {
        if (!sameTile(player, start, worldViewId) || player.items.getFreeSlotCount() <= 0) return;
        services.animation.playPlayerSeq(player, 621);
        const doubleChance = Math.min(0.8, skillLevel(player, SkillId.Fishing) / 120);
        const quantity = player.items.getFreeSlotCount() >= 2 && Math.random() < doubleChance ? 2 : 1;
        addOrDrop(player, services, BREAM, quantity);
        services.inventory.snapshotInventoryImmediate(player);
        if (player.items.getFreeSlotCount() > 0) services.scheduler.after(3, catchBream, { kind: "player", id: player.id });
    };
    catchBream();
}

function startCookingBream(player: PlayerState, services: ScriptServices): void {
    const start = { x: player.tileX, y: player.tileY, level: player.level };
    const worldViewId = player.worldViewId;
    const cookNext = (): void => {
        if (!sameTile(player, start, worldViewId) || !player.items.hasItem(BREAM, 1)) return;
        const doubleChance = Math.min(0.8, skillLevel(player, SkillId.Fishing) / 120);
        const quantity = player.items.hasItem(BREAM, 2) && Math.random() < doubleChance ? 2 : 1;
        if (player.items.removeItem(BREAM, quantity, { assureFullRemoval: true }).completed !== quantity) return;
        services.animation.playPlayerSeq(player, 897);
        addOrDrop(player, services, COOKED_BREAM, quantity);
        services.inventory.snapshotInventoryImmediate(player);
        if (player.items.hasItem(BREAM, 1)) services.scheduler.after(3, cookNext, { kind: "player", id: player.id });
    };
    cookNext();
}
function drinkMoonlightPotion(player: PlayerState, services: ScriptServices, itemId: number): void {
    const doses = 29083 - itemId + 1;
    if (doses < 1 || doses > 4 || player.items.removeItem(itemId, 1, { assureFullRemoval: true }).completed !== 1) return;
    if (doses > 1) addOrDrop(player, services, itemId + 1, 1); else addOrDrop(player, services, VIAL, 1);
    for (const skill of [SkillId.Attack, SkillId.Strength, SkillId.Defence] as const) {
        const level = skillLevel(player, skill);
        const boost = Math.floor(level * 0.15) + 3;
        player.skillSystem.setSkillBoost(skill, level + boost);
    }
    const prayer = player.skillSystem.getSkill(SkillId.Prayer);
    const currentPrayer = Math.max(0, prayer.baseLevel + prayer.boost);
    player.skillSystem.setSkillBoost(SkillId.Prayer, Math.min(prayer.baseLevel, currentPrayer + Math.max(1, Math.floor(prayer.baseLevel * 0.25))));
    player.prayer.resetDrainAccumulator(); services.inventory.snapshotInventoryImmediate(player);
    services.messaging.sendGameMessage(player, `You drink some of your Moonlight potion. ${doses - 1 || "No"} dose${doses === 2 ? "" : "s"} remaining.`);
}

export function register(registry: IScriptRegistry, _services: ScriptServices): void {
    registerEncounters();
    STATUES.forEach((id, index) => {
        const handler = ({ player, services }: { player: PlayerState; services: ScriptServices }) => createRun(player, services, (["blood", "blue", "eclipse"] as Moon[])[index]!);
        registry.registerLocInteraction(id, handler, "start solo");
        registry.registerLocInteraction(id, handler);
    });
    for (const action of ["search", "claim", "open"]) registry.registerLocInteraction(CHEST, ({ player, services }) => searchChest(player, services), action);
    registry.registerLocInteraction(CHEST, ({ player, services }) => services.messaging.sendGameMessage(player, "Each defeated Moon has a 1 in 56 chance to award one of its set pieces. If no set piece is awarded, the chest rolls standard loot 1, 3, or 6 times for 1, 2, or 3 Moons respectively."), "examine");
    registry.registerLocInteraction(CHEST, ({ player, services }) => searchChest(player, services));
    registry.registerLocInteraction(CRATE, ({ player, services }) => takeSupplies(player, services), "take-from");
    for (const [choice, label] of ["fishing", "hunting", "herblore"].entries()) {
        const direct = ({ player, services }: { player: PlayerState; services: ScriptServices }) => giveSupplySet(player, services, choice);
        registry.registerLocInteraction(CRATE, direct, `take-from ${label}`);
        registry.registerLocInteraction(CRATE, direct, `take-from <col=00ffff>${label}`);
    }
    registry.registerLocInteraction(SAPLING, ({ player, services }) => { addOrDrop(player, services, GRUB, 2); services.inventory.snapshotInventoryImmediate(player); }, "collect-from");
    registry.registerLocInteraction(STOVE, ({ player, services }) => startCookingBream(player, services), "cook");
    registry.registerLocInteraction(STOVE, ({ player, services }) => startCookingBream(player, services));
    const fish = ({ player, services }: { player: PlayerState; services: ScriptServices }) => startFishing(player, services);
    for (const locId of FISHING_SPOTS) {
        for (const action of ["net", "fish", "small-net"]) registry.registerLocInteraction(locId, fish, action);
        registry.registerLocInteraction(locId, fish);
    }
    registry.registerItemOnItem(GRUB, PESTLE, ({ player, services }) => { if (player.items.removeItem(GRUB, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, PASTE, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnItem(PASTE, VIAL, ({ player, services }) => { if (player.items.removeItem(PASTE, 1, { assureFullRemoval: true }).completed && player.items.removeItem(VIAL, 1, { assureFullRemoval: true }).completed) { addOrDrop(player, services, 29080, 1); services.inventory.snapshotInventoryImmediate(player); } });
    registry.registerItemOnLoc(BREAM, STOVE, ({ player, services }) => startCookingBream(player, services));
    for (const potion of [29080, 29081, 29082, 29083]) registry.registerItemAction(potion, ({ player, services }) => drinkMoonlightPotion(player, services, potion), "drink");
    const relightBrazier = ({ player, services, tile, level, locId }: { player: PlayerState; services: ScriptServices; tile: { x: number; y: number }; level: number; locId: number }) => {
        const run = runs.get(player.id);
        const boss = run?.npcId === undefined ? undefined : services.combat.getNpc(run.npcId);
        const special = boss ? moonSpecials.get(boss) : undefined;
        if (!boss || !special?.active || special.kind !== "blue") {
            services.messaging.sendGameMessage(player, "The brazier burns steadily.");
            return;
        }
        const key = tileKey({ x: tile.x, y: tile.y, level });
        if (special.brazierTiles.has(key)) {
            services.messaging.sendGameMessage(player, "This brazier is already lit.");
            return;
        }
        special.brazierTiles.add(key);
        if (locId !== BRAZIER) {
            services.location.replaceTemporaryLoc({ worldViewId: player.worldViewId }, locId, BRAZIER, tile, level);
        }
        services.messaging.sendGameMessage(player, "You relight the brazier.");
        if (special.brazierTiles.size >= 2) {
            services.messaging.sendGameMessage(player, "The ice storm subsides.");
            services.scheduler.after(6, () => {
                if (special.active) restartGlyphCycle(boss, player, services);
            }, { kind: "npc", id: boss.id });
        }
    };
    for (const locId of [BRAZIER, ...UNLIT_BRAZIERS]) {
        for (const action of [undefined, "light", "investigate", "feed"]) {
            registry.registerLocInteraction(locId, relightBrazier, action);
        }
    }
    registry.registerNpcAttack(BLOOD_JAGUAR_NPC_ID, moonJaguarAttack);
    for (const mothId of MOONLIGHT_MOTHS) registry.registerNpcScript({ npcId: mothId, option: "catch", handler: ({ player, services }) => {
        if (services.equipment.getEquippedItem(player, EquipmentSlot.WEAPON) !== BUTTERFLY_NET) { services.messaging.sendGameMessage(player, "You need to wield a butterfly net to catch this moth."); return; }
        services.animation.playPlayerSeq(player, 660);
        const prayer = player.skillSystem.getSkill(SkillId.Prayer);
        const current = Math.max(0, prayer.baseLevel + prayer.boost);
        player.skillSystem.setSkillBoost(SkillId.Prayer, Math.min(prayer.baseLevel, current + 22));
        player.prayer.resetDrainAccumulator();
        services.messaging.sendGameMessage(player, "You catch the moonlight moth and feel your Prayer points restored.");
    } });
    const escape = ({ player, services }: { player: PlayerState; services: ScriptServices }) => { const run = runs.get(player.id); if (!run) return; const current = run.active ? MOONS[run.active] : undefined; if (run.npcId !== undefined) { const boss = services.combat.getNpc(run.npcId); if (boss) { stopMoonSpecial(boss, services); const glyph = glyphStates.get(boss); if (glyph?.markerId !== undefined) services.npc.removeNpc(glyph.markerId); } services.npc.removeNpc(run.npcId); } run.active = undefined; run.npcId = undefined; services.instances.leave(player, current?.outside ?? CHEST_TILE); services.messaging.sendGameMessage(player, "You escape the Moon chamber. Your progress remains with the Lunar chest."); };
    for (const escapeId of [53003, 53004]) { for (const action of ["quick-escape", "escape", "exit", "climb-up"]) registry.registerLocInteraction(escapeId, escape, action); registry.registerLocInteraction(escapeId, escape); }
    registry.registerNpcPreDeath(BLOOD_JAGUAR_NPC_ID, event => {
        const boss = specialChildOwners.get(event.npc.id);
        if (!boss) return NpcPreDeathDecision.Allow;
        const special = moonSpecials.get(boss);
        specialChildOwners.delete(event.npc.id);
        special?.childIds.delete(event.npc.id);
        if (special?.active && special.kind === "blood" && special.childIds.size === 0) {
            const player = event.killer ?? special.owner;
            if (player) {
                event.services.messaging.sendGameMessage(player, "The Blood Moon is vulnerable again.");
                restartGlyphCycle(boss, player, event.services);
            }
        }
        return NpcPreDeathDecision.Allow;
    });
    for (const [moon, def] of Object.entries(MOONS) as Array<[Moon, typeof MOONS[Moon]]>) {
        registry.registerNpcAttack(def.id, moonGlyphAttack);
        registry.registerNpcPreDeath(def.id, event => { const player = event.killer, run = player && runs.get(player.id); if (!player || !run || run.active !== moon || event.npc.ownerPlayerId !== player.id) return NpcPreDeathDecision.Allow; stopMoonSpecial(event.npc, event.services); const glyphState = glyphStates.get(event.npc); if (glyphState) { glyphState.tickTaskActive = false; if (glyphState.markerId !== undefined) event.services.npc.removeNpc(glyphState.markerId); } run.killed.add(moon); run.active = undefined; run.npcId = undefined; event.services.scheduler.after(7, () => { if (player.worldViewId !== event.npc.worldViewId) return; if (run.killed.size === 3) servicesAfter(event, player, CHEST_TILE); else { event.services.instances.leave(player, MOONS[def.next].outside); event.services.messaging.sendGameMessage(player, `${moon[0].toUpperCase()}${moon.slice(1)} Moon defeated. Choose another Moon statue to continue this run.`); } }, { kind: "player", id: player.id }); return NpcPreDeathDecision.Allow; });
    }
}
function servicesAfter(event: { services: ScriptServices }, player: PlayerState, tile: { x: number; y: number; level: number }): void { event.services.instances.leave(player, tile); event.services.messaging.sendGameMessage(player, "All three Moons have been defeated. You may now search the Lunar chest."); }
