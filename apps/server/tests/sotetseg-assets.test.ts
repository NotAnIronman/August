import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { getCacheLoaderFactory } from "@august/custom-content/items/cacheLoaderDecorator";
import { THEATRE_MAZE_MARKER } from "@august/custom-content/locs/TheatreSpotAnimTypeLoader";
import { loadCache, loadCacheList, loadCacheInfos } from "@tools/cache/client/load-util";
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { Model } from "@august/osrs-engine/model/Model";
import { SceneBuilder, LocLoadType } from "@august/osrs-engine/scene/SceneBuilder";
import { getIdFromTag } from "@august/osrs-engine/scene/entity/EntityTag";
import { theatreRoomGeometry } from "@server/content/modules/theatre-of-blood/rooms";
import { buildInstanceTemplate } from "@server/world/InstancedAreaManager";
import { SUPPLY_TILES } from "@server/content/modules/theatre-of-blood/TheatreSupplies";
import { PathService } from "@server/pathfinding/PathService";
import { SailingWorldView } from "@server/game/sailing/SailingWorldView";
import { generateSotetsegPath } from "@server/content/modules/theatre-of-blood/SotetsegEncounter";
import { EncounterRandom } from "@server/game/encounters/EncounterRandom";
const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const f = getCacheLoaderFactory(data.info, CacheSystem.fromFiles("dat2", data.files));
const locs = f.getLocTypeLoader(), models = new LocModelLoader(locs, f.getModelLoader(), f.getTextureLoader(), f.getSeqTypeLoader(), f.getSeqFrameLoader(), f.getSkeletalSeqLoader());
const builder = new SceneBuilder(data.info, f.getMapFileLoader(), f.getUnderlayTypeLoader(), f.getOverlayTypeLoader(), locs, models, data.xteas);
for (const supply of SUPPLY_TILES) {
    const g = theatreRoomGeometry(supply.room), scene = builder.buildInstanceScene(buildInstanceTemplate([g.copy]), g.sceneBase.x, g.sceneBase.y, 104, 104, false, LocLoadType.MODELS);
    const x = supply.x - g.sceneBase.x, y = supply.y - g.sceneBase.y;
    const level = scene.tiles[0][x][y]?.originalLevel ?? 0;
    builder.addDynamicLocs(scene, [{ x, y, level: 0, id: 32758, shape: 10, rotation: 0 }], LocLoadType.MODELS);
    const chest = scene.tiles[0][x][y].locs.find(l => getIdFromTag(l.tag) === 32758)!;
    assert(chest?.entity instanceof Model, "supply chest has a renderable model, not an unlit placeholder");
    const h = scene.tileHeights[level];
    const expected = (h[x][y] + h[x + 1][y] + h[x][y + 1] + h[x + 1][y + 1]) >> 2;
    assert.equal(chest.height, expected, `supply chest ${supply.room} rests on the linked floor`);
    console.log("Supply chest floor", supply.room, level, expected);
}
const g = theatreRoomGeometry(3), build = () => builder.buildInstanceScene(buildInstanceTemplate([g.copy]), g.sceneBase.x, g.sceneBase.y, 104, 104, false, LocLoadType.MODELS);
const normal = build();
for (let x = 3273; x <= 3286; x++)
    for (let y = 4310; y <= 4324; y++)
        assert.equal(getIdFromTag(normal.tiles[0][x - g.sceneBase.x][y - g.sceneBase.y].floorDecoration!.tag), 33034);
const maze = generateSotetsegPath(new EncounterRandom(991));
for (const t of maze)
    builder.setLocOverride(t.x - g.sceneBase.x, t.y - g.sceneBase.y, 0, 33034, 33036);
const privateScene = build();
for (const t of maze)
    assert.equal(getIdFromTag(privateScene.tiles[0][t.x - g.sceneBase.x][t.y - g.sceneBase.y].floorDecoration!.tag), 33036, "private override reaches copied instance terrain");
builder.clearLocOverrides();
const restored = build();
assert.equal(getIdFromTag(restored.tiles[0][maze[0].x - g.sceneBase.x][maze[0].y - g.sceneBase.y].floorDecoration!.tag), 33034);
const path = new PathService({ getMapSquare: () => undefined } as any);
path.registerWorldViewCollision(4000, new SailingWorldView(4000, g.sceneBase.x, g.sceneBase.y, 104, 104, normal.collisionMaps));
for (let i = 1; i < maze.length; i++)
    assert(path.canNpcStep({ ...maze[i - 1], plane: 0 }, maze[i], 1, 4000), "maze follows genuinely walkable native tiles");
for (const id of [1603, 1604, 1605, 1606, 1607, 1608, THEATRE_MAZE_MARKER])
    assert(f.getModelLoader().getModel(f.getSpotAnimTypeLoader().load(id).modelId));
assert.equal(f.getSpotAnimTypeLoader().load(THEATRE_MAZE_MARKER).modelId, locs.load(33036).models[0][0]);
assert(f.getNpcTypeLoader().load(8389).modelIds.length);
const light=f.getSpotAnimTypeLoader().load(353); // LEGENDS_LIGHTBEAM, not the smoke-puff or powder-item graphic.
assert(f.getModelLoader().getModel(light.modelId));
console.log("Native supply chest rendering/height, maze tiles, private overrides, path collision and effects passed");
