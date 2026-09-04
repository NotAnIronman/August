import assert from "node:assert/strict";
import { canReceiveQuestDrop } from "@server/content/gamemodes/vanilla/quests/questDropEligibility";
import { DropRollService } from "@server/game/drops/DropRollService";
import { resolveDropTable } from "@server/game/drops/dropTableResolver";

for (const item of [300,7824,7836]) {
    assert.equal(canReceiveQuestDrop(item, undefined), false);
    assert.equal(canReceiveQuestDrop(item, {} as never), false, "quest-managed/unimplemented quest rewards cannot leak into normal drops");
}
assert.equal(canReceiveQuestDrop(526, undefined), true, "ordinary bones remain available");
for (const category of ["always", "weighted", "independent"] as const) {
    const entry = {itemId:11941,quantity:1,rarity:"1/1",condition:{wildernessOnly:false}};
    const table = resolveDropTable({
        npcIds:[2854],
        ...(category === "always" ? {always:[entry]} : {pools:[{kind:category,entries:[entry]}]}),
    } as never)!;
    const roller = new DropRollService({get:()=>table} as never);
    for (const [x,y,expected] of [[3200,3200,0],[3200,3700,1],[3200,10200,1]] as const) {
        const drops = roller.roll({npcTypeId:2854,npcName:"Rat",tile:{x,y,level:0},isWilderness:false,recipients:[{ownerId:1,dropRateMultiplier:1}]});
        assert.equal(drops.length,expected,`${category}: mandatory Wilderness restriction survives legacy table conditions`);
    }
}
console.log("Quest-only and mandatory Wilderness drop restrictions passed");
