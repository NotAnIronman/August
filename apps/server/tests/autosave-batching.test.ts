import assert from "node:assert/strict";

import type { PlayerState } from "@server/game/player";
import { TickFrameService } from "@server/game/services/TickFrameService";
import type { ServerServices } from "@server/game/ServerServices";

type TestPlayer = Pick<PlayerState, "id" | "name" | "__saveKey">;

function player(id: number): TestPlayer {
    return { id, name: `Player ${id}`, __saveKey: `player-${id}` };
}

async function main(): Promise<void> {
    const livePlayers = Array.from({ length: 35 }, (_, index) => player(index + 1));
    const currentById = new Map(livePlayers.map((entry) => [entry.id, entry]));
    const batchSizes: number[] = [];
    const savedKeys: string[] = [];
    let yields = 0;

    const services = {
        players: {
            forEach(callback: (_socket: never, value: PlayerState) => void) {
                for (const entry of livePlayers) callback(undefined as never, entry as PlayerState);
            },
            getPlayerById(id: number) {
                return currentById.get(id) as PlayerState | undefined;
            },
        },
        playerPersistence: {
            savePlayers(entries: Array<{ key: string; player: PlayerState }>) {
                batchSizes.push(entries.length);
                savedKeys.push(...entries.map((entry) => entry.key));
            },
        },
    } as unknown as ServerServices;

    const service = new TickFrameService(services, 100, {
        autosaveBatchSize: 10,
        yieldControl: async () => {
            yields++;
            // Simulate ID reuse during the first event-loop yield. The old session
            // in the pending autosave must never be written afterward.
            if (yields === 1) currentById.set(11, player(11));
        },
    });

    await service.runAutosave(500);

    assert.deepEqual(batchSizes, [10, 9, 10, 5]);
    assert.equal(yields, 3);
    assert.equal(savedKeys.length, 34);
    assert.equal(savedKeys.includes("player-11"), false);
    assert.deepEqual(savedKeys.slice(0, 3), ["player-1", "player-2", "player-3"]);

    const failingServices = {
        ...services,
        playerPersistence: {
            savePlayers() {
                throw new Error("disk unavailable");
            },
        },
    } as unknown as ServerServices;
    const failingService = new TickFrameService(failingServices, 100, {
        autosaveBatchSize: 10,
        yieldControl: async () => undefined,
    });

    await assert.rejects(
        () => failingService.runAutosave(501),
        /Autosave failed after 0\/35 player\(s\) at tick 501/,
    );

    const queuedPlayers = [player(1), player(2)];
    const queuedOrder: string[] = [];
    let releaseFirstYield: (() => void) | undefined;
    let yieldCalls = 0;
    const queuedServices = {
        players: {
            forEach(callback: (_socket: never, value: PlayerState) => void) {
                for (const entry of queuedPlayers) {
                    callback(undefined as never, entry as PlayerState);
                }
            },
            getPlayerById(id: number) {
                return queuedPlayers.find((entry) => entry.id === id) as PlayerState | undefined;
            },
        },
        playerPersistence: {
            savePlayers(entries: Array<{ key: string; player: PlayerState }>) {
                queuedOrder.push(...entries.map((entry) => entry.key));
            },
        },
    } as unknown as ServerServices;
    const queuedService = new TickFrameService(queuedServices, 100, {
        autosaveBatchSize: 1,
        yieldControl: () => {
            yieldCalls++;
            if (yieldCalls !== 1) return Promise.resolve();
            return new Promise<void>((resolve) => {
                releaseFirstYield = resolve;
            });
        },
    });

    const firstSave = queuedService.runAutosave(600);
    await Promise.resolve();
    await Promise.resolve();
    const finalFlush = queuedService.shutdownAndFlush(601);
    assert.deepEqual(queuedOrder, ["player-1"]);
    assert.ok(releaseFirstYield);
    releaseFirstYield();
    await Promise.all([firstSave, finalFlush]);
    assert.deepEqual(queuedOrder, ["player-1", "player-2", "player-1", "player-2"]);

    // Shutdown must cancel an autosave queued by maybeRunAutosave before its
    // setImmediate callback starts. Only the explicit final pass may write,
    // and later autosave requests must join that completed shutdown flush.
    const shutdownWrites: string[][] = [];
    const shutdownServices = {
        players: queuedServices.players,
        playerPersistence: {
            savePlayers(entries: Array<{ key: string; player: PlayerState }>) {
                shutdownWrites.push(entries.map((entry) => entry.key));
            },
        },
    } as unknown as ServerServices;
    const shutdownService = new TickFrameService(shutdownServices, 1, {
        autosaveBatchSize: 10,
    });
    shutdownService.maybeRunAutosave({ tick: 1 } as never);
    await shutdownService.shutdownAndFlush(2);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await shutdownService.runAutosave(3);
    assert.deepEqual(shutdownWrites, [["player-1", "player-2"]]);

    console.log("autosave batching regression tests passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
