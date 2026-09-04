import assert from "node:assert/strict";
import { MapManager } from "@client/engine/game/MapManager";
import { queueLoadMap } from "@client/engine/rendering/render/streaming2";

async function main(): Promise<void> {
    let now = 1_000;
    const originalNow = Date.now;
    Date.now = () => now;
    try {
        let calls = 0;
        let pending = Promise.resolve();
        let queued = 0;
        let succeed = false;
        const batches: unknown[][] = [];
        const mapId = (50 << 8) | 50;
        const host: any = {
            osrsClient: { loadedCache: {}, workerPool: { queueLoad: async () => {
                calls++;
                if (!succeed) throw new Error("synthetic map worker failure");
                return { mapX: 50, mapY: 50 };
            } } },
            applyGamemodeWorldLocs() {}, instanceActive: false,
            pendingLocUpdates: new Set(), pendingLocGeometryUpdates: new Set(),
            pendingDoorLocUpdates: new Set(), getExtraLocsForMap: () => [], maxLevel: 0,
            queuedLocReloadBatchByMap: new Map(),
            isValidMapData: () => true,
            queueStreamMapData: () => { queued++; },
            resolveLocReloadBatchMap: (...args: unknown[]) => batches.push(args),
        };
        const manager = new MapManager(2, (x, y, g) => { pending = queueLoadMap(host, x, y, g); });
        host.mapManager = manager;
        manager.loadMap(50, 50);
        await pending;
        assert.equal(manager.loadingMapIds.has(mapId), false, "a rejected request must release its loading slot");
        assert.equal(manager.invalidMapIds.has(mapId), false, "transient errors must not permanently invalidate maps");
        manager.loadMap(50, 50);
        assert.equal(calls, 1, "render frames must not cause a hot retry loop");
        now += 1_000;
        manager.loadMap(50, 50);
        await pending;
        assert.equal(calls, 2);
        now += 1_000;
        manager.loadMap(50, 50);
        assert.equal(calls, 2, "successive failures must back off exponentially");
        now += 1_000;
        succeed = true;
        manager.loadMap(50, 50);
        await pending;
        assert.equal(queued, 1, "recovered workers must be able to supply terrain");
        manager.addMap(50, 50, { mapX: 50, mapY: 50, canRender: () => true, delete() {} });
        assert.equal(manager.loadingMapIds.has(mapId), false);

        const staleFailure = manager.createLoadFailureHandler(50, 50);
        manager.clearMaps();
        manager.loadMap(50, 50);
        staleFailure(new Error("old scene"));
        assert.equal(manager.loadingMapIds.has(mapId), true, "old scene failures must not cancel replacement loads");
        await pending;

        succeed = false;
        await queueLoadMap(host, 50, 50, undefined, 7);
        assert.deepEqual(batches, [[7, mapId, undefined]], "failed reload batches must settle");

        manager.clearMaps();
        host.osrsClient.loadedCache = undefined;
        manager.loadMap(50, 50);
        await pending;
        assert.equal(manager.loadingMapIds.has(mapId), false, "cache-not-ready requests must release their slot");
        host.osrsClient.loadedCache = {};
        host.instanceActive = true;
        manager.loadMap(50, 50);
        await pending;
        assert.equal(manager.loadingMapIds.has(mapId), false, "instance-suppressed streaming must be able to resume");
        host.instanceActive = false;
        host.isValidMapData = () => false;
        succeed = true;
        manager.loadMap(50, 50);
        await pending;
        const callsBeforeRetry = calls;
        manager.loadMap(50, 50);
        assert.equal(calls, callsBeforeRetry, "invalid terrain must also use retry backoff");
        console.log("map load failure and recovery regression tests passed");
    } finally {
        Date.now = originalNow;
    }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
