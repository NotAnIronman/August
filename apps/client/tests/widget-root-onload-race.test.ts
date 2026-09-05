import assert from "node:assert/strict";

import { WidgetManager } from "@client/ui/widgets/WidgetManager";
import { WidgetLoader } from "@client/ui/widgets/WidgetLoader";
import { GroupMissingError } from "@august/osrs-engine/cache/js5/GroupMissingError";

const root: any = {
    uid: 900 << 16,
    id: 900 << 16,
    groupId: 900,
    fileId: 0,
    childIndex: -1,
    parentUid: -1,
    isIf3: true,
    type: 0,
    rawX: 0,
    rawY: 0,
    rawWidth: 0,
    rawHeight: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    widthMode: 1,
    heightMode: 1,
    xPositionMode: 0,
    yPositionMode: 0,
    hidden: false,
    scrollX: 0,
    scrollY: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    onLoad: [123],
    onSubChange: [789],
};
const subRoot = {
    ...root,
    uid: 901 << 16,
    id: 901 << 16,
    groupId: 901,
    onLoad: [456],
    onSubChange: undefined,
};
const loader = {
    loadWidgetGroup: (groupId: number) => {
        const group = groupId === 900 ? root : subRoot;
        return { root: group, widgets: new Map([[group.uid, group]]) };
    },
    getAvailableGroups: () => [900, 901],
    clearCache: () => undefined,
};
const manager = new WidgetManager({} as never, loader as never);
let rootLoads = 0;
manager.onLoadListener = (scriptId) => {
    if (scriptId === 123) rootLoads++;
};
let subChanges = 0;
manager.onSubChangeListener = () => subChanges++;

manager.setRootInterface(900);
manager.openSubInterface(root.uid, 901);
assert.equal(rootLoads, 0);

manager.resize(800, 600);
assert.equal(rootLoads, 1);
assert.equal(root.width, 800);
assert.equal(root.height, 600);
assert.equal(manager.getSubInterface(root.uid)?.group, 901);
assert.equal(subChanges, 2);

manager.resize(801, 600);
assert.equal(rootLoads, 1);

console.log("Widget root onLoad race test passed");

let ready = false;
const streaming = new WidgetManager({} as never, { ...loader,
    loadWidgetGroup: (id: number) => ready ? loader.loadWidgetGroup(id) : undefined,
} as never);
let streamingLoads = 0;
streaming.onLoadListener = () => streamingLoads++;
streaming.resize(800, 600);
streaming.setRootInterface(900);
streaming.openSubInterface(root.uid, 901);
streaming.resize(801, 600); // resizing during streaming must not lose pending onLoad
assert.equal(streaming.getSubInterface(root.uid), undefined);
ready = true;
streaming.retryPendingInterfaces();
assert.equal(streaming.getSubInterface(root.uid)?.group, 901, "cold-cache mounts recover without a reload");
assert.equal(streamingLoads, 2, "root and sub onLoad both run after assets arrive");
streaming.retryPendingInterfaces();
assert.equal(streamingLoads, 2, "successful mounts are not replayed every frame");

let fileReady = false;
const cacheLoader = Object.assign(Object.create(WidgetLoader.prototype), {
    loadedWidgets: new Map(),
    interfacesIndex: { getFileIds: () => [0, 1], getFile: (_group: number, file: number) => {
        if (file === 1 && !fileReady) throw new GroupMissingError(3, 900, 0, 1);
        return { data: new Uint8Array([file]) };
    } },
    decodeWidget: (uid: number) => ({ ...root, uid }),
}) as WidgetLoader;
assert.equal(cacheLoader.loadWidgetGroup(900), undefined, "do not cache partially downloaded root definitions");
fileReady = true;
assert.equal(cacheLoader.loadWidgetGroup(900)?.widgets.size, 2);
