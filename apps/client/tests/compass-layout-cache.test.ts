import assert from "node:assert/strict";
import { CacheSystem } from "@august/osrs-engine/cache/CacheSystem";
import { loadCache, loadCacheInfos, loadCacheList } from "@tools/cache/client/load-util";
import { WidgetManager } from "@client/ui/widgets/WidgetManager";

const data = loadCache(loadCacheList(loadCacheInfos()).latest);
const manager = new WidgetManager(CacheSystem.fromFiles("dat2", data.files));
manager.resize(1000, 700);
manager.setRootInterface(161);
const originalCompass = manager.compassWidget;
const originalMinimap = manager.minimapWidget;
assert(originalCompass);
for (const groupId of [164, 548, 601, 160]) manager.getGroup(groupId);
assert.equal(manager.compassWidget, originalCompass, "inactive layout preloading cannot steal the compass");
assert.equal(manager.minimapWidget, originalMinimap, "inactive layout preloading cannot steal the minimap");

let compassRedraws = 0;
const invalidate = manager.invalidateWidgetRender.bind(manager);
manager.invalidateWidgetRender = (widget, source) => {
    if (source === "compass") compassRedraws++;
    invalidate(widget, source);
};
for (const groupId of [161, 164, 548, 601, 161, 548, 164, 601]) {
    manager.setRootInterface(groupId);
    const widgets = [...manager.getGroup(groupId)!.widgetsByUid.values()];
    const compass = widgets.find(w => w.contentType === 1339)!;
    assert(compass, `cache layout ${groupId} must contain a compass`);
    assert.equal(manager.compassWidget, compass, "cached activation restores the active compass");
    assert.equal(manager.minimapWidget, widgets.find(w => w.contentType === 1338));
    assert.equal(manager.viewportWidget, widgets.find(w => w.contentType === 1337));
    const clickHandler = compass.onOp;
    for (const yaw of [0, 256, 512, 768, 1024, 1536, 2048, -512]) {
        const expected = ((-yaw | 0) * 32) & 0xffff;
        const changed = (compass.spriteAngle ?? 0) !== expected;
        const before = compassRedraws;
        manager.updateCompassAngle(yaw);
        assert.equal(compass.spriteAngle ?? 0, expected);
        assert.equal(compassRedraws - before, changed ? 1 : 0);
        manager.updateCompassAngle(yaw);
        assert.equal(compassRedraws - before, changed ? 1 : 0, "stationary camera does not redraw");
    }
    assert.equal(compass.onOp, clickHandler, "rotation does not replace the native click handler");
}
console.log("Compass rotation survives cached fixed/classic/modern/mobile layouts and inactive preloads");
