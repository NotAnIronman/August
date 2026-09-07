import assert from "node:assert/strict";
import { PlayerState } from "@server/game/player";
import { createTestGamemode } from "./fixtures/createTestGamemode";
import { awardSupplies, supplyAccount } from "@server/content/modules/theatre-of-blood/TheatreSupplies";
import { recordTheatreDeath, storeTheatreWipe } from "@server/content/modules/theatre-of-blood/TheatreDeaths";
import { payGraveFee } from "@server/game/death/payGraveFee";
import { sanitizeTheatreRun, type TheatreRunRecord } from "@server/content/modules/theatre-of-blood/TheatreRun";
import { registerSkillConfiguration } from "@server/game/combat/SkillConfigurationProvider";
import { PlayerDeathService } from "@server/game/death/PlayerDeathService";
registerSkillConfiguration({ computeCombatLevel: () => 3, skillRestoreIntervalTicks: 100, skillBoostDecayIntervalTicks: 100, hitpointRegenIntervalTicks: 100, hitpointOverhealDecayIntervalTicks: 100, preserveDecayMultiplier: 1.5 });
const mode = createTestGamemode("theatre-death-test", "Theatre death test");
const player = (id: number) => { const p = new PlayerState(id, 3290, 4245, 0, mode); p.name = `p${id}`; p.__saveKey = p.name; p.items.setItemDefResolver(() => ({ stackable: true })); return p; };
function run(): TheatreRunRecord { return { version: 1, id: "test", roster: ["p1", "p2"], access: "party", roomIndex: 1, completedRooms: 1, started: true }; }
for (const deaths of [0, 1, 2]) {
    const p = player(1), r = run();
    r.deaths = Array.from({ length: 6 }, (_, i) => i < deaths ? [p.name] : []);
    assert(awardSupplies(r, p, 1));
    assert(!awardSupplies(r, p, 1));
    assert.equal(supplyAccount(r, p).points, deaths === 0 ? 13 : deaths === 1 ? 6 : 0);
    assert.deepEqual(supplyAccount(r, p).onions, deaths === 2 ? [1] : []);
    assert(awardSupplies(r, p, 3));
    assert.equal(supplyAccount(r, p).points, (deaths === 0 ? 13 : deaths === 1 ? 6 : 0) + 13);
    assert(sanitizeTheatreRun(r), "points/deaths survive sanitization");
}
{
    const p = player(1), q = player(2), r = run();
    recordTheatreDeath(r, p);
    assert(!r.wiped);
    assert(p.raidProgress.spectating);
    recordTheatreDeath(r, q);
    assert(r.wiped);
    p.raidProgress.set({ version: 1, raid: "theatre-of-blood", runId: r.id, roster: r.roster, access: "party", status: "active", completedRooms: 1 });
    p.items.addItem(995, 100000);
    p.items.addItem(385, 5);
    p.setEquipmentSlot(3, 4151);
    const store = { load: () => structuredClone(r), save: () => { } };
    assert.throws(() => storeTheatreWipe(p, store, () => { throw Error("disk full"); }));
    assert(p.items.hasItem(995, 100000));
    assert.equal(p.exportEquipmentSnapshot()[0].itemId, 4151);
    assert(!p.instanceGrave.hasItems());
    assert(storeTheatreWipe(p, store, () => { }));
    assert(!p.raidProgress.checkpoint);
    assert.equal(p.exportEquipmentSnapshot().length, 0);
    assert.equal(p.instanceGrave.getReclaimCost(), 100000);
    assert.equal(p.instanceGrave.getLocation()?.locId, 32656);
    assert(!storeTheatreWipe(p, store, () => { }), "wipe cannot confiscate twice");
    assert(payGraveFee(p, 100000, true));
    assert.equal(p.instanceGrave.getReclaimCost(), 0);
    assert(!p.instanceGrave.serialize()?.items?.some(i => i.itemId === 995));
    assert(p.instanceGrave.serialize()?.items?.some(i => i.itemId === 4151));
}
for (const sources of [[100000, 0, 0], [0, 100000, 0], [0, 0, 100000], [25000, 25000, 50000], [20000, 20000, 20000]]) {
    const p = player(1);
    p.items.addItem(995, sources[0]);
    p.items.bank = [{ itemId: 995, quantity: sources[1], tab: 2 }];
    p.instanceGrave.store([{ itemId: 995, quantity: sources[2] }, { itemId: 385, quantity: 1 }], 100000);
    const before = JSON.stringify([p.items.inventory, p.items.bank, p.instanceGrave.serialize()]);
    const enough = sources.reduce((a, b) => a + b, 0) >= 100000;
    assert.equal(payGraveFee(p, 100000, true), enough);
    if (!enough)
        assert.equal(JSON.stringify([p.items.inventory, p.items.bank, p.instanceGrave.serialize()]), before, "insufficient fee mutates nothing");
    else
        assert.equal(p.instanceGrave.getReclaimCost(), 0);
}
console.log("Theatre: supply awards/carry/onions, durable wipe rollback and inventory/bank/grave fees passed");
{
    const p = player(1), q = player(2), players = [p, q];
    let saved = run(), tick = 0, disposed = 0;
    for (const a of players) {
        a.worldViewId = 4000;
        a.items.addItem(995, 100000);
        a.items.addItem(385, 5);
        a.raidProgress.set({ version: 1, raid: "theatre-of-blood", runId: saved.id, roster: saved.roster, access: "party", status: "active", completedRooms: 1 });
    }
    const services: any = { ticker: { currentTick: () => tick }, playerPersistence: { theatreRuns: { load: () => structuredClone(saved), save: (r: any) => { saved = structuredClone(r); } }, saveSnapshot: () => { } },
        instancedAreaManager: { get: (id: number) => players.find(a => a.id === id)?.worldViewId === 4000 ? { id: "i", definitionId: "theatre-of-blood:test:1" } : undefined,
            leave: (a: PlayerState, t: any) => { a.worldViewId = -1; a.teleport(t.x, t.y, t.level); return true; }, dispose: () => { disposed++; return true; } },
        players: { getSocketByPlayerId: () => undefined, forEachIncludingOrphaned: (fn: any) => players.forEach(a => fn(null, a)) },
        appearanceService: { refreshAppearanceKits: () => { } }, playerAppearanceManager: { queueAppearanceSnapshot: () => { } },
        locationService: { replaceTemporaryLoc: () => { } }, messagingService: { queueChatMessage: () => { } },
        movementService: { teleportPlayer: (a: PlayerState, x: number, y: number, l: number) => a.teleport(x, y, l) } };
    const death = new PlayerDeathService(services);
    (death as any).restorePlayerState = (a: PlayerState) => a.skillSystem.setHitpointsCurrent(10);
    p.skillSystem.setHitpointsCurrent(0);
    assert(death.startPlayerDeath(p));
    for (let i = 0; i < 7; i++) {
        tick++;
        death.tick();
    }
    assert.equal(p.worldViewId, 4000, "individual death keeps the original instance");
    assert.deepEqual([p.tileX, p.tileY], [3322, 4447]);
    assert(p.items.hasItem(995, 100000));
    assert(p.raidProgress.spectating);
    assert(p.raidProgress.checkpoint);
    assert(!p.canAttack());
    q.skillSystem.setHitpointsCurrent(0);
    assert(death.startPlayerDeath(q));
    for (let i = 0; i < 7; i++) {
        tick++;
        death.tick();
    }
    assert(saved.wiped);
    assert.equal(disposed, 0, "death never destroys teammates' live room prematurely");
    for (const a of players) {
        assert.equal(a.worldViewId, -1);
        assert.deepEqual([a.tileX, a.tileY], [3677, 3219]);
        assert(!a.items.hasItem(995, 1));
        assert.equal(a.instanceGrave.getReclaimCost(), 100000);
        assert(!a.raidProgress.checkpoint);
    }
    console.log("Theatre real death sequence: spectator respawn, team wipe, per-player storage and outside exit passed");
}
