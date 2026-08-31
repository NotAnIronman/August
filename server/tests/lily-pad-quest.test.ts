import assert from "node:assert/strict";

import { SkillId } from "../../client/rs/skill/skills";
import { VARP_QUEST_POINTS } from "../gamemodes/vanilla/quests/QuestService";
import { lilyPadQuest } from "../gamemodes/vanilla/quests/definitions/lilyPad";
import {
    ITEM,
    LOC,
    NPC,
    STAGE_COMPLETE,
    STAGE_DEFEAT_CUTHBERT,
    STAGE_REPORT_TO_MARCELLUS,
    STAGE_SPEAK_TO_BLUE_FROGS,
    VARBIT_CHILDREN_OF_THE_SUN_COMPLETE,
    VARBIT_LILY_PAD_QUEST,
} from "../gamemodes/vanilla/quests/definitions/lilyPad/constants";
import { ScriptRegistry } from "../src/game/scripts/ScriptRegistry";
import { NpcPreDeathDecision, type ScriptServices } from "../src/game/scripts/types";

assert.equal(lilyPadQuest.varbitId, VARBIT_LILY_PAD_QUEST);
assert.equal(lilyPadQuest.varpId, undefined);
assert.equal(lilyPadQuest.completionValue, STAGE_COMPLETE);
assert.deepEqual(lilyPadQuest.rewards.xp, [{ skillId: SkillId.Woodcutting, amount: 2_000, label: "Woodcutting" }]);

type Slot = { slot: number; itemId: number; quantity: number };
const registry = new ScriptRegistry();
const varps = new Map<number, number>([[VARP_QUEST_POINTS, 0]]);
const varbits = new Map<number, number>([
    [VARBIT_CHILDREN_OF_THE_SUN_COMPLETE, 2],
    [VARBIT_LILY_PAD_QUEST, 0],
]);
const slots: Slot[] = Array.from({ length: 28 }, (_, slot) => ({ slot, itemId: -1, quantity: 0 }));
const messages: string[] = [];
const xp = new Map<number, number>();
const activeNpcs: Array<{ id: number; typeId: number; ownerPlayerId?: number; tileX: number; tileY: number; level: number }> = [];
const player = {
    id: 926,
    name: "Lily Pad Tester",
    displayMode: 1,
    tileX: 1688,
    tileY: 2977,
    level: 0,
    worldViewId: -1,
    varps: {
        getVarpValue: (id: number) => varps.get(id) ?? 0,
        setVarpValue: (id: number, value: number) => varps.set(id, value),
        getVarbitValue: (id: number) => varbits.get(id) ?? 0,
        setVarbitValue: (id: number, value: number) => varbits.set(id, value),
    },
    gamemode: { getQuestListGroups: () => [] },
} as never;

function count(itemId: number): number {
    return slots
        .filter((entry) => entry.itemId === itemId)
        .reduce((total, entry) => total + entry.quantity, 0);
}

function add(itemId: number, quantity: number): { slot: number; added: number } {
    const slot = slots.find((entry) => entry.itemId <= 0 || entry.quantity <= 0);
    if (!slot) return { slot: -1, added: 0 };
    slot.itemId = itemId;
    slot.quantity = quantity;
    return { slot: slot.slot, added: quantity };
}

const services = {
    variables: {
        sendVarp: (_player: unknown, id: number, value: number) => varps.set(id, value),
        sendVarbit: (_player: unknown, id: number, value: number) => varbits.set(id, value),
    },
    messaging: { sendGameMessage: (_player: unknown, message: string) => messages.push(message) },
    inventory: {
        getInventoryItems: () => slots,
        addItemToInventory: (_player: unknown, itemId: number, quantity: number) => add(itemId, quantity),
        consumeItem: (_player: unknown, slot: number) => {
            const entry = slots[slot];
            if (!entry || entry.quantity <= 0) return false;
            entry.quantity--;
            if (entry.quantity === 0) {
                entry.itemId = -1;
            }
            return true;
        },
        snapshotInventory: () => undefined,
    },
    skills: {
        getSkill: () => ({ baseLevel: 15, boost: 0 }),
        addSkillXp: (_player: unknown, skillId: number, amount: number) =>
            xp.set(skillId, (xp.get(skillId) ?? 0) + amount),
    },
    data: { getObjType: () => ({ stackability: 0 }) },
    npc: {
        findNearbyNpc: (_player: unknown, typeId: number) =>
            activeNpcs.find((npc) => npc.typeId === typeId),
        spawnNpc: (config: { id: number; x: number; y: number; level: number; ownerPlayerId?: number }) => {
            const npc = {
                id: 50_000 + activeNpcs.length,
                typeId: config.id,
                ownerPlayerId: config.ownerPlayerId,
                tileX: config.x,
                tileY: config.y,
                level: config.level,
            };
            activeNpcs.push(npc);
            return npc;
        },
    },
    dialog: {
        getInterfaceService: () => ({ getCurrentChatboxModal: () => undefined }),
        openDialog: (_player: unknown, spec: { onContinue?: () => void }) => spec.onContinue?.(),
        openDialogOptions: (_player: unknown, spec: { onSelect?: (choice: number) => void }) =>
            spec.onSelect?.(0),
        closeDialog: () => undefined,
        openSubInterface: () => undefined,
        queueWidgetEvent: () => undefined,
    },
    viewport: { getMainmodalUid: () => 0 },
    sound: { sendJingle: () => undefined },
    system: { logger: { info: () => undefined, error: () => undefined } },
} as unknown as ScriptServices;

lilyPadQuest.register(registry, services);

function npc(id: number): void {
    const handler = registry.findNpcInteractionDirect(id, "talk-to");
    assert.ok(handler, `missing talk-to handler for npc ${id}`);
    handler({
        player,
        services,
        npc: { id, typeId: id, tileX: player.tileX, tileY: player.tileY, level: player.level },
        option: "talk-to",
    } as never);
}

function loc(id: number, action: string): void {
    const handler = registry.findLocInteraction(id, action);
    assert.ok(handler, `missing ${action} handler for loc ${id}`);
    handler({
        player,
        services,
        locId: id,
        action,
        tile: { x: player.tileX, y: player.tileY },
        level: player.level,
    } as never);
}

assert.match(lilyPadQuest.buildJournal(player, services)[0], /Marcellus/);
npc(NPC.marcellus[0]);
assert.equal(varbits.get(VARBIT_LILY_PAD_QUEST), STAGE_SPEAK_TO_BLUE_FROGS);
npc(NPC.blueFrogs[1]);
npc(NPC.marcellus[0]);
npc(NPC.blueFrogs[1]);
npc(NPC.orangeFrogs[1]);
loc(LOC.logsWithAxe, "take-axe");
assert.equal(count(ITEM.bronzeAxe), 1);
loc(LOC.orangeTree, "chop down");
loc(LOC.lilyPad, "sabotage");
npc(NPC.blueFrogs[1]);
npc(NPC.marcellus[0]);
npc(NPC.blueFrogs[1]);
loc(LOC.chest, "open");
assert.equal(count(ITEM.loveLetter), 1);
assert.equal(count(ITEM.plushy), 1);
loc(LOC.dungPlantEvidence, "plant-evidence");
assert.equal(varbits.get(VARBIT_LILY_PAD_QUEST), STAGE_DEFEAT_CUTHBERT);
assert.equal(count(ITEM.plushy), 0);
loc(LOC.dungInspect, "inspect");

const cuthbert = activeNpcs.find((entry) => entry.typeId === NPC.cuthbert);
assert.ok(cuthbert, "Cuthbert should spawn from the dung");
const death = registry.findNpcPreDeath(NPC.cuthbert);
assert.ok(death, "Cuthbert needs a pre-death handler");
assert.equal(
    death({ player, killer: player, services, npc: cuthbert, hit: {} } as never),
    NpcPreDeathDecision.Allow,
);
assert.equal(varbits.get(VARBIT_LILY_PAD_QUEST), STAGE_REPORT_TO_MARCELLUS);
npc(NPC.marcellus[0]);
npc(NPC.blueFrogs[1]);

assert.equal(varbits.get(VARBIT_LILY_PAD_QUEST), STAGE_COMPLETE);
assert.equal(varps.get(VARP_QUEST_POINTS), 1);
assert.equal(xp.get(SkillId.Woodcutting), 2_000);
assert.ok(messages.some((message) => message.includes("Cuthbert")));
assert.equal(lilyPadQuest.buildJournal(player, services).at(-1), "<col=ff0000>QUEST COMPLETE!</col>");

console.log("Lily Pad quest tests passed");
