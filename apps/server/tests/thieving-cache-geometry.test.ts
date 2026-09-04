import assert from "node:assert/strict";

import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { PICKLOCK_DOORS } from "@server/content/gamemodes/vanilla/skills/thieving/picklockDefinitions";
import { PathService } from "@server/pathfinding/PathService";
import { serverVarPath } from "@server/paths";
import { initCacheEnv } from "@server/world/CacheEnv";
import { CollisionOverlayStore } from "@server/world/CollisionOverlayStore";
import { DoorCollisionService } from "@server/world/DoorCollisionService";
import { DoorStateManager } from "@server/world/DoorStateManager";
import { MapCollisionService } from "@server/world/MapCollisionService";

// Opt-in raw-cache regression: never substitute precomputed collision or download data.
const env = initCacheEnv(serverVarPath("cache", "osrs"), "osrs-237_2026-03-25");
const factory = getCacheLoaderFactory(env.info, env.cacheSystem);
const locs = factory.getLocTypeLoader();
const mapFiles = factory.getMapFileLoader();
const maps = new MapCollisionService(env, false, { usePrecomputed: false });
const paths = new PathService(maps, 32);
const routes = PICKLOCK_DOORS.flatMap((door) =>
    (door.routes ?? []).map((route) => ({ locId: door.locId, ...route })),
);
assert.ok(routes.length >= 10, "retain coverage of the ten reviewed door placements");

type Placement = { id: number; x: number; y: number; level: number; type: number; rotation: number };
const squares = new Map<string, Placement[]>();
function placementsAt(x: number, y: number): Placement[] {
    const mx = Math.floor(x / 64), my = Math.floor(y / 64), key = `${mx},${my}`;
    const cached = squares.get(key);
    if (cached) return cached;
    const data = mapFiles.getLocData(mx, my, env.xteas);
    assert.ok(data, `raw loc archive ${key} must be available`);
    const buffer = new ByteBuffer(data);
    const placements: Placement[] = [];
    let id = -1, delta = 0;
    while ((delta = buffer.readSmart3()) !== 0) {
        id += delta;
        let position = 0, positionDelta = 0;
        while ((positionDelta = buffer.readUnsignedSmart()) !== 0) {
            position += positionDelta - 1;
            const attributes = buffer.readUnsignedByte();
            placements.push({
                id, x: mx * 64 + ((position >> 6) & 63), y: my * 64 + (position & 63),
                level: (position >> 12) & 3, type: attributes >> 2, rotation: attributes & 3,
            });
        }
    }
    squares.set(key, placements);
    return placements;
}

const visualFields = [
    "models", "types", "sizeX", "sizeY", "isRotated", "modelSizeX", "modelSizeY",
    "modelSizeHeight", "offsetX", "offsetY", "offsetHeight", "seqId", "transforms",
    "recolorFrom", "recolorTo", "retextureFrom", "retextureTo",
] as const;

for (const route of routes) {
    const { locId, tile, level, rotation, openedId } = route;
    const label = `${locId}@${tile.x},${tile.y},${level}`;
    assert.ok(placementsAt(tile.x, tile.y).some((p) =>
        p.id === locId && p.x === tile.x && p.y === tile.y && p.level === level &&
        p.type === 0 && p.rotation === rotation,
    ), `${label}: registered shape/rotation must match the raw map`);
    const closedLoc = locs.load(locId), openedLoc = locs.load(openedId);
    assert.deepEqual([closedLoc.sizeX, closedLoc.sizeY], [1, 1], `${label}: single-tile wall`);
    for (const field of visualFields) {
        assert.deepEqual(openedLoc[field], closedLoc[field], `${label}: matching visual ${field}`);
    }

    // Each placement owns its pair: several closed IDs intentionally share an opened ID.
    const overlays = new CollisionOverlayStore();
    paths.setCollisionOverlays(overlays);
    const manager = new DoorStateManager(locs, undefined, new DoorCollisionService(overlays));
    const singleDef = { closed: locId, opened: openedId };
    const [dx, dy] = [[-1, 0], [0, 1], [1, 0], [0, -1]][rotation];
    const a = { ...tile, plane: level };
    const b = { x: tile.x + dx, y: tile.y + dy, plane: level };
    const directions = [[a, b], [b, a]] as const;
    for (const side of route.sides) {
        assert.ok(directions.some(([from, to]) =>
            side.from.x === from.x && side.from.y === from.y &&
            side.to.x === to.x && side.to.y === to.y,
        ), `${label}: content side must cross this cardinal edge`);
    }
    const assertCrossing = (expected: boolean, phase: string) => {
        for (const [from, to] of directions) {
            assert.equal(paths.canActorStep(from, to, 1), expected, `${label}: ${phase} ${from.x},${from.y}`);
        }
    };
    try {
        assertCrossing(false, "closed");
        const opened = manager.toggleExplicitSingleDoor({
            ...tile, level, currentId: locId, rotation, locType: 0, singleDef,
        });
        assert.ok(opened?.success, `${label}: open succeeds`);
        assert.equal(opened.newLocId, openedId, `${label}: opened ID`);
        assert.deepEqual(opened.newTile, { x: b.x, y: b.y }, `${label}: CW tile shift`);
        assert.equal(opened.newRotation, (rotation + 1) & 3, `${label}: CW rotation`);
        assertCrossing(true, "opened");
        // Geometry is bidirectional even when content policy forbids entering (HAM jail).
        for (const [from, to] of directions) {
            const destination = { x: to.x, y: to.y };
            const path = paths.findPathSteps({ from, to: destination, size: 1 });
            assert.equal(path.ok, true, `${label}: open path succeeds`);
            assert.equal(path.clamped, false, `${label}: path is not partial`);
            assert.deepEqual(path.steps, [destination], `${label}: exactly one cardinal step`);
            assert.deepEqual(path.end, destination, `${label}: exact arrival`);
        }
        const closed = manager.toggleExplicitSingleDoor({
            ...opened.newTile!, level, currentId: opened.newLocId!, rotation: opened.newRotation,
            locType: 0, singleDef,
        });
        assert.ok(closed?.success, `${label}: close succeeds`);
        assert.equal(closed.newLocId, locId, `${label}: restore original ID, not a shared-ID alias`);
        assert.deepEqual(closed.newTile, tile, `${label}: restore original tile`);
        assert.equal(closed.newRotation, rotation, `${label}: restore original rotation`);
        assertCrossing(false, "restored");
    } finally {
        manager.dispose();
    }
}
console.log(`Thieving cache geometry: ${routes.length} placements passed bidirectional open/step/close checks.`);
