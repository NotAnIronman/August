import assert from "node:assert/strict";

import {
    BOSS_HEALTH_BAR_GROUP_ID,
    BOSS_HEALTH_BAR_SEGMENT_COUNT,
    BossHealthBarComponent,
    bossHealthBarUid,
} from "../../client/common/ui/bossHealthBar";
import "../../client/widgets/custom/bossHealthBar";
import { getRegisteredUiPanel } from "../../client/widgets/uikit/registry";

const group = getRegisteredUiPanel(BOSS_HEALTH_BAR_GROUP_ID);
assert.ok(group?.root);
assert.equal(group.root.uid, bossHealthBarUid(BossHealthBarComponent.Root));
assert.equal(group.widgets.get(bossHealthBarUid(BossHealthBarComponent.Name))?.type, 4);
assert.equal(group.widgets.get(bossHealthBarUid(BossHealthBarComponent.Empty))?.color, 0x8b0000);
for (let index = 0; index < BOSS_HEALTH_BAR_SEGMENT_COUNT; index++) {
    assert.equal(
        group.widgets.get(bossHealthBarUid(BossHealthBarComponent.SegmentStart + index))?.color,
        0x00c817,
    );
}

console.log("boss health bar tests passed");
