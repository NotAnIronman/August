import assert from "node:assert/strict";

let loadInstanceScene: (...args: any[]) => Promise<void>;
let doInstanceSceneBuild: (...args: any[]) => Promise<boolean>;
let markInstanceSceneCommitted: (...args: any[]) => void;
let failInstanceSceneCommit: (...args: any[]) => void;
let requestInstanceSceneSettingsRebuild: (...args: any[]) => void;
let scheduleInstanceLocRebuild: (...args: any[]) => void;
let onLocChange: (...args: any[]) => void;
let onLocDel: (...args: any[]) => void;
let isValidMapData: (...args: any[]) => boolean;
let setLoadNpcs: (...args: any[]) => void;
let setSmoothTerrain: (...args: any[]) => void;

function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) return;
        await Promise.resolve();
    }
    throw new Error("Timed out waiting for instance scene lifecycle transition");
}

function createHost(options: { pending?: boolean; active?: boolean } = {}) {
    const builds: Array<{
        args: unknown[];
        completion: ReturnType<typeof deferred<boolean>>;
    }> = [];
    let clearMapsCalls = 0;
    let rendererReadyNotifications = 0;
    const oldNeighbour = { mapX: 43, mapY: 83, id: "old-neighbour" };
    const residentTarget = { mapX: 44, mapY: 83, id: "resident-target" };
    const mapSquares = new Map<number, any>([
        [(43 << 8) | 83, oldNeighbour],
        [(44 << 8) | 83, residentTarget],
    ]);
    const active = options.active ?? true;
    const pending = options.pending ?? true;

    const host: any = {
        instanceActive: active,
        instanceSceneReady: active && !pending,
        instanceSceneGeneration: 7,
        instanceSceneBuildPending: pending,
        instanceScenePendingSettings: null,
        instanceSceneFallbackState: null,
        instanceTemplateChunks: active ? [[[1]]] : null,
        instanceRegionX: 44 * 8,
        instanceRegionY: 83 * 8,
        instanceLocRebuildPending: false,
        instanceLocRebuildTimer: null,
        smoothTerrain: false,
        loadNpcs: true,
        mapsToLoad: [] as any[],
        pendingStreamMapsByGeneration: new Map(),
        addedLocs: new Map(),
        osrsClient: {
            loadedCache: { info: { name: "test-cache" } },
            notifyRendererReady: () => {
                rendererReadyNotifications++;
            },
        },
        mapManager: {
            mapSquares,
            loadingMapIds: new Set<number>(),
            removeMap: (mapX: number, mapY: number) => {
                mapSquares.delete((mapX << 8) | mapY);
            },
            clearMaps: () => {
                clearMapsCalls++;
                mapSquares.clear();
            },
        },
        clearMaps: () => {
            clearMapsCalls++;
            mapSquares.clear();
        },
        doInstanceSceneBuild: (...args: unknown[]) => {
            const completion = deferred<boolean>();
            builds.push({ args, completion });
            return completion.promise;
        },
        scheduleInstanceLocRebuild: () => undefined,
    };
    host.requestInstanceSceneSettingsRebuild = (smoothTerrain: boolean, loadNpcs: boolean) =>
        requestInstanceSceneSettingsRebuild(host, smoothTerrain, loadNpcs);

    return {
        host,
        builds,
        mapSquares,
        oldNeighbour,
        residentTarget,
        clearMapsCalls: () => clearMapsCalls,
        rendererReadyNotifications: () => rendererReadyNotifications,
    };
}

function currentPayload(host: any): any {
    return {
        mapX: 44,
        mapY: 83,
        cacheName: "test-cache",
        loadNpcs: true,
        smoothTerrain: false,
        renderPosX: 44,
        renderPosY: 83,
        instanceSceneGeneration: host.instanceSceneGeneration,
        instanceSceneReplacesExistingMaps: true,
    };
}

function createWorkerBackedHost() {
    const state = createHost({ pending: false, active: false });
    const { host } = state;
    const workerBuilds: Array<ReturnType<typeof deferred<any>>> = [];
    const workerInputs: any[] = [];
    const queuedMaps: any[] = [];

    host.mapsToLoad = {
        clear: () => {
            queuedMaps.length = 0;
        },
        push: (mapData: any) => queuedMaps.push(mapData),
    };
    host.maxLevel = 3;
    host.hasMultiDraw = true;
    host.loadedTextureIds = new Set<number>();
    host.locOverrides = new Map();
    host.terrainOverrides = new Map();
    host.dataLoader = {};
    host.getInstanceExtraLocs = () => undefined;
    host.getControlledPlayerWorldViewId = () => 4000;
    host.isValidMapData = (mapData: any) => isValidMapData(host, mapData);
    host.osrsClient.workerPool = {
        queueLoad: (_loader: unknown, input: any) => {
            const build = deferred<any>();
            workerInputs.push({
                ...input,
                locOverrides:
                    input.locOverrides instanceof Map
                        ? new Map(
                              Array.from(input.locOverrides, ([key, value]: [unknown, any]) => [
                                  key,
                                  value && typeof value === "object" ? { ...value } : value,
                              ]),
                          )
                        : input.locOverrides,
                locSpawns:
                    input.locSpawns instanceof Map
                        ? new Map(
                              Array.from(input.locSpawns, ([key, value]: [unknown, any]) => [
                                  key,
                                  value && typeof value === "object" ? { ...value } : value,
                              ]),
                          )
                        : input.locSpawns,
            });
            workerBuilds.push(build);
            return build.promise;
        },
    };
    host.doInstanceSceneBuild = (...args: any[]) => doInstanceSceneBuild(host, ...args);

    return { ...state, workerBuilds, workerInputs, queuedMaps };
}

async function locChangesWaitForInitialCommitAndUseAFreshGeneration(): Promise<void> {
    const state = createWorkerBackedHost();
    const { host } = state;
    host.getInstanceExtraLocs = () =>
        host.addedLocs.size > 0
            ? Array.from(host.addedLocs.values(), (loc: any) => ({ ...loc }))
            : undefined;

    const initialLoad = loadInstanceScene(host, [[[1]]], 44 * 8, 83 * 8);
    await waitFor(() => state.workerBuilds.length === 1);
    const initialGeneration = host.instanceSceneGeneration;
    assert.equal(state.workerInputs[0].extraLocs, undefined);

    const addedLoc = { id: 11726, x: 2870, y: 5355, level: 2, shape: 10, rotation: 0 };
    host.addedLocs.set("2870,5355,2,10", addedLoc);
    scheduleInstanceLocRebuild(host);

    // The old implementation started a same-generation worker after 100ms.
    // Keep the initial worker unresolved past that boundary to exercise the
    // completion order that could otherwise restore its loc-less payload.
    await new Promise<void>((resolve) => setTimeout(resolve, 125));
    assert.equal(state.workerBuilds.length, 1, "loc rebuild must wait for the initial commit");
    assert.equal(host.instanceLocRebuildPending, true);

    const initialPayload = currentPayload(host);
    delete initialPayload.instanceSceneGeneration;
    delete initialPayload.instanceSceneReplacesExistingMaps;
    state.workerBuilds[0].resolve(initialPayload);
    await initialLoad;
    const queuedInitial = state.queuedMaps[0];
    assert(queuedInitial);
    markInstanceSceneCommitted(host, queuedInitial);

    assert.equal(state.workerBuilds.length, 2, "commit starts one coalesced loc rebuild");
    assert.equal(host.instanceSceneGeneration, initialGeneration + 1);
    assert.deepEqual(state.workerInputs[1].extraLocs, [addedLoc]);
    assert.equal(state.workerInputs[1].extraLocs[0] === addedLoc, false, "worker input is a snapshot");

    const locPayload = currentPayload(host);
    delete locPayload.instanceSceneGeneration;
    delete locPayload.instanceSceneReplacesExistingMaps;
    state.workerBuilds[1].resolve(locPayload);
    await waitFor(
        () => state.queuedMaps[0]?.instanceSceneGeneration === initialGeneration + 1,
    );
    assert.equal(state.queuedMaps.length, 1, "the loc payload supersedes the committed queue entry");
    markInstanceSceneCommitted(host, state.queuedMaps[0]);
    assert.equal(host.instanceSceneBuildPending, false);
    assert.equal(host.instanceSceneReady, true);
    assert.equal(host.instanceLocRebuildPending, false);
}

async function locChangeDuringPendingInstanceBuildIsCoalesced(): Promise<void> {
    const state = createWorkerBackedHost();
    const { host } = state;
    let normalLocReloads = 0;
    host.locSpawns = new Map();
    host.osrsClient.locTypeLoader = { load: () => undefined };
    host.scheduleLocReload = () => {
        normalLocReloads++;
    };
    host.scheduleInstanceLocRebuild = () => scheduleInstanceLocRebuild(host);

    const initialLoad = loadInstanceScene(host, [[[1]]], 44 * 8, 83 * 8);
    await waitFor(() => state.workerBuilds.length === 1);
    const initialGeneration = host.instanceSceneGeneration;

    onLocChange(host, 0, 101, { x: 2870, y: 5355 }, 2, {
        newRotation: 1,
        newShape: 10,
    });

    assert.deepEqual(host.locSpawns.get("2870,5355,2"), {
        id: 101,
        type: 10,
        rotation: 1,
    });
    assert.equal(host.instanceLocRebuildPending, true);
    assert.equal(state.workerBuilds.length, 1, "a loc change must not race the pending scene payload");
    assert.equal(normalLocReloads, 0, "an instance change must not load an overworld map square");

    const initialPayload = currentPayload(host);
    delete initialPayload.instanceSceneGeneration;
    delete initialPayload.instanceSceneReplacesExistingMaps;
    state.workerBuilds[0].resolve(initialPayload);
    await initialLoad;
    markInstanceSceneCommitted(host, state.queuedMaps[0]);

    assert.equal(state.workerBuilds.length, 2);
    assert.equal(host.instanceSceneGeneration, initialGeneration + 1);
    assert.deepEqual(state.workerInputs[0].locSpawns, new Map());
    assert.deepEqual(state.workerInputs[1].locSpawns, host.locSpawns);

    const changedPayload = currentPayload(host);
    delete changedPayload.instanceSceneGeneration;
    delete changedPayload.instanceSceneReplacesExistingMaps;
    state.workerBuilds[1].resolve(changedPayload);
    await waitFor(() => state.queuedMaps.length === 1);
    markInstanceSceneCommitted(host, state.queuedMaps[0]);
    assert.equal(host.instanceSceneBuildPending, false);
}

async function locDeleteAfterInstanceCommitStartsFreshTransaction(): Promise<void> {
    const state = createWorkerBackedHost();
    const { host } = state;
    const key = "2870,5355,2,10";
    let normalGeometryReloads = 0;
    host.instanceActive = true;
    host.instanceSceneReady = true;
    host.instanceTemplateChunks = [[[1]]];
    host.getInstanceExtraLocs = () =>
        host.addedLocs.size > 0
            ? Array.from(host.addedLocs.values(), (loc: any) => ({ ...loc }))
            : undefined;
    host.addedLocs.set(key, {
        locId: 11726,
        x: 2870,
        y: 5355,
        level: 2,
        shape: 10,
        rotation: 0,
    });
    host.getLocIdsAtTileAllLevels = () => [];
    host.scheduleLocGeometryUpdate = () => {
        normalGeometryReloads++;
    };
    host.scheduleInstanceLocRebuild = () => scheduleInstanceLocRebuild(host);
    const generationBeforeDelete = host.instanceSceneGeneration;

    onLocDel(host, { x: 2870, y: 5355 }, 2, 10, 0);

    assert.equal(host.addedLocs.has(key), false);
    assert.deepEqual(host.locOverrides.get("2870,5355,2,-1"), {
        newId: 0,
        matchType: 10,
    });
    assert.equal(host.instanceLocRebuildPending, true);
    assert.equal(normalGeometryReloads, 0, "an instance delete must not load overworld geometry");

    await new Promise<void>((resolve) => setTimeout(resolve, 125));
    assert.equal(state.workerBuilds.length, 1, "the committed scene starts one batched delete rebuild");
    assert.equal(host.instanceSceneGeneration, generationBeforeDelete + 1);
    assert.equal(state.workerInputs[0].extraLocs, undefined, "deleted loc is absent from the rebuild");
    assert.deepEqual(state.workerInputs[0].locOverrides.get("2870,5355,2,-1"), {
        newId: 0,
        matchType: 10,
    });
    assert.equal(host.instanceSceneBuildPending, true);
    assert.equal(host.instanceSceneReady, false);

    const deletePayload = currentPayload(host);
    delete deletePayload.instanceSceneGeneration;
    delete deletePayload.instanceSceneReplacesExistingMaps;
    state.workerBuilds[0].resolve(deletePayload);
    await waitFor(() => state.queuedMaps.length === 1);
    markInstanceSceneCommitted(host, state.queuedMaps[0]);
    assert.equal(host.instanceSceneBuildPending, false);
    assert.equal(host.instanceSceneReady, true);
    assert.equal(host.instanceLocRebuildPending, false);
}

function mapApplyFailureRestoresTheCommittedScene(): void {
    const state = createHost({ pending: true, active: true });
    const { host } = state;
    host.instanceSceneFallbackState = {
        active: true,
        ready: true,
        templateChunks: [[[1]]],
        regionX: 44 * 8,
        regionY: 83 * 8,
        smoothTerrain: false,
        loadNpcs: true,
    };
    const payload = currentPayload(host);
    host.mapManager.loadingMapIds.add((44 << 8) | 83);

    failInstanceSceneCommit(host, payload, new Error("synthetic GPU upload failure"));

    assert.equal(host.instanceSceneBuildPending, false);
    assert.equal(host.instanceSceneReady, true);
    assert.equal(host.instanceActive, true);
    assert.equal(host.mapManager.loadingMapIds.has((44 << 8) | 83), false);
    assert.equal(state.rendererReadyNotifications(), 1);
}

async function settingToggleDoesNotInvalidatePendingPayload(
    setting: "smoothTerrain" | "loadNpcs",
    phase: "worker" | "queued",
): Promise<void> {
    const state = createWorkerBackedHost();
    const { host } = state;
    const loadPromise = loadInstanceScene(host, [[[1]]], 44 * 8, 83 * 8);
    await waitFor(() => state.workerBuilds.length === 1);

    const workerPayload = currentPayload(host);
    delete workerPayload.instanceSceneGeneration;
    delete workerPayload.instanceSceneReplacesExistingMaps;

    if (phase === "queued") {
        state.workerBuilds[0].resolve(workerPayload);
        await loadPromise;
        assert.equal(state.queuedMaps.length, 1);
    }

    if (setting === "smoothTerrain") setSmoothTerrain(host, true);
    else setLoadNpcs(host, false);

    assert.equal(host.smoothTerrain, false, `${setting}/${phase}: build input must stay stable`);
    assert.equal(host.loadNpcs, true, `${setting}/${phase}: build input must stay stable`);
    assert.deepEqual(host.instanceScenePendingSettings, {
        smoothTerrain: setting === "smoothTerrain",
        loadNpcs: setting !== "loadNpcs",
    });
    assert.equal(state.clearMapsCalls(), 0, `${setting}/${phase}: resident scene was cleared`);
    assert.equal(state.mapSquares.size, 2, `${setting}/${phase}: resident scene was lost`);

    if (phase === "worker") {
        state.workerBuilds[0].resolve(workerPayload);
        await loadPromise;
    }
    const payload = state.queuedMaps[0];
    assert(payload, `${setting}/${phase}: worker payload was not queued`);
    assert.equal(payload.instanceSceneGeneration, host.instanceSceneGeneration);
    assert.equal(payload.instanceSceneReplacesExistingMaps, true);
    assert.equal(
        isValidMapData(host, payload),
        true,
        `${setting}/${phase}: current payload became invalid before commit`,
    );
    assert.equal(state.queuedMaps[0], payload);

    // Simulate worker completion for the first phase, then the render frame's
    // successful loadMap replacement for both phases.
    state.mapSquares.set((44 << 8) | 83, { mapX: 44, mapY: 83, id: "committed-instance" });
    markInstanceSceneCommitted(host, payload);

    assert.equal(state.clearMapsCalls(), 0, `${setting}/${phase}: commit used a destructive clear`);
    assert.equal(state.mapSquares.size, 1, `${setting}/${phase}: old neighbours were not pruned`);
    assert.equal(state.mapSquares.has((44 << 8) | 83), true);
    assert.equal(
        state.workerBuilds.length,
        2,
        `${setting}/${phase}: deferred setting was not rebuilt`,
    );
    assert.equal(host.instanceSceneBuildPending, true);
    assert.equal(host.instanceSceneReady, false);
    assert.equal(host.smoothTerrain, setting === "smoothTerrain");
    assert.equal(host.loadNpcs, setting !== "loadNpcs");
    assert.equal(state.rendererReadyNotifications(), 1);
}

async function failedSettingsBuildRestoresCommittedStateBeforeLatestRequest(): Promise<void> {
    const state = createHost({ pending: false, active: true });
    const { host, builds } = state;

    setSmoothTerrain(host, true);
    assert.equal(builds.length, 1);
    assert.equal(host.instanceSceneReady, false);
    setLoadNpcs(host, false);
    assert.deepEqual(host.instanceScenePendingSettings, {
        smoothTerrain: true,
        loadNpcs: false,
    });

    builds[0].completion.resolve(false);
    await waitFor(() => builds.length === 2);

    // The failed build restored the committed configuration first; only then
    // did the newest combined request begin from that stable fallback.
    assert.equal(host.smoothTerrain, true);
    assert.equal(host.loadNpcs, false);
    assert.equal(host.instanceSceneBuildPending, true);
    assert.equal(state.mapSquares.size, 2);
    assert.equal(state.clearMapsCalls(), 0);

    builds[1].completion.resolve(false);
    await waitFor(() => host.instanceSceneBuildPending === false);
    assert.equal(host.instanceActive, true);
    assert.equal(host.instanceSceneReady, true);
    assert.equal(host.smoothTerrain, false);
    assert.equal(host.loadNpcs, true);
    assert.equal(state.mapSquares.size, 2, "both failed builds must preserve the committed scene");
    assert.equal(state.clearMapsCalls(), 0);
}

async function overlappingRegionFailureRestoresTheCommittedFallback(): Promise<void> {
    const state = createHost({ pending: false, active: false });
    const { host, builds } = state;
    const originalMaps = Array.from(state.mapSquares.values());
    const firstTemplate = [[[11]]];
    const secondTemplate = [[[22]]];

    const first = loadInstanceScene(host, firstTemplate, 44 * 8, 83 * 8);
    const second = loadInstanceScene(host, secondTemplate, 45 * 8, 84 * 8);
    assert.equal(builds.length, 2);
    setLoadNpcs(host, false);
    assert.equal(host.loadNpcs, true, "setting remains deferred during the newer build");

    builds[1].completion.resolve(false);
    await second;
    assert.equal(host.instanceActive, false);
    assert.equal(host.instanceSceneReady, false);
    assert.equal(host.instanceTemplateChunks, null);
    assert.equal(host.instanceSceneBuildPending, false);
    assert.equal(host.loadNpcs, false, "deferred preference survives without clearing fallback");
    assert.deepEqual(Array.from(state.mapSquares.values()), originalMaps);

    builds[0].completion.resolve(false);
    await first;
    assert.equal(host.instanceActive, false, "stale failure must not restore an uncommitted request");
    assert.deepEqual(Array.from(state.mapSquares.values()), originalMaps);
    assert.equal(state.clearMapsCalls(), 0);
}

async function run(): Promise<void> {
    // WebGL modules depend on PicoGL's browser UMD global at import time.
    (globalThis as any).self = globalThis;
    ({
        loadInstanceScene,
        doInstanceSceneBuild,
        markInstanceSceneCommitted,
        failInstanceSceneCommit,
        requestInstanceSceneSettingsRebuild,
        scheduleInstanceLocRebuild,
    } = await import("../render/render/instance"));
    ({ onLocChange } = await import("../render/render/locs"));
    ({ onLocDel } = await import("../render/render/locs2"));
    ({ isValidMapData } = await import("../render/render/map"));
    ({ setLoadNpcs, setSmoothTerrain } = await import("../render/render/settings"));

    for (const setting of ["smoothTerrain", "loadNpcs"] as const) {
        for (const phase of ["worker", "queued"] as const) {
            await settingToggleDoesNotInvalidatePendingPayload(setting, phase);
        }
    }
    await failedSettingsBuildRestoresCommittedStateBeforeLatestRequest();
    await overlappingRegionFailureRestoresTheCommittedFallback();
    await locChangesWaitForInitialCommitAndUseAFreshGeneration();
    await locChangeDuringPendingInstanceBuildIsCoalesced();
    await locDeleteAfterInstanceCommitStartsFreshTransaction();
    mapApplyFailureRestoresTheCommittedScene();
}

void run()
    .then(() => {
        console.log("instance scene settings lifecycle tests passed");
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
