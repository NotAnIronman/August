import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { registerPlayerLifecycleCleanup } from "@server/game/scripts/ScriptLifecycle";
import {
    clearPlayerConversationState,
    resetConversationRuntimeState,
} from "@server/content/gamemodes/vanilla/quests/dialogue";
import { registerQuestDefinition } from "@server/content/gamemodes/vanilla/quests/QuestRegistry";
import {
    VARP_QUEST_POINTS,
    completeAllQuests,
    registerQuestCompletedWidgetHandlers,
    setQuestStage,
} from "@server/content/gamemodes/vanilla/quests/QuestService";
import { blackKnightsFortressQuest } from "@server/content/gamemodes/vanilla/quests/definitions/black-knights-fortress";
import { biohazardQuest } from "@server/content/gamemodes/vanilla/quests/definitions/biohazard";
import { bigChompyBirdHuntingQuest } from "@server/content/gamemodes/vanilla/quests/definitions/big-chompy-bird-hunting";
import { clockTowerQuest } from "@server/content/gamemodes/vanilla/quests/definitions/clock-tower";
import { cooksAssistantQuest } from "@server/content/gamemodes/vanilla/quests/definitions/cooks-assistant";
import { deathPlateauQuest } from "@server/content/gamemodes/vanilla/quests/definitions/death-plateau";
import { demonSlayerQuest } from "@server/content/gamemodes/vanilla/quests/definitions/demon-slayer";
import { desertTreasureIQuest } from "@server/content/gamemodes/vanilla/quests/definitions/desert-treasure-i";
import { digSiteQuest } from "@server/content/gamemodes/vanilla/quests/definitions/dig-site";
import { doricsQuest } from "@server/content/gamemodes/vanilla/quests/definitions/dorics";
import { dragonSlayerIQuest } from "@server/content/gamemodes/vanilla/quests/definitions/dragon-slayer-i";
import { druidicRitualQuest } from "@server/content/gamemodes/vanilla/quests/definitions/druidic-ritual";
import { dwarfCannonQuest } from "@server/content/gamemodes/vanilla/quests/definitions/dwarf-cannon";
import { elementalWorkshopIQuest } from "@server/content/gamemodes/vanilla/quests/definitions/elemental-workshop-i";
import { ernestTheChickenQuest } from "@server/content/gamemodes/vanilla/quests/definitions/ernest-the-chicken";
import { familyCrestQuest } from "@server/content/gamemodes/vanilla/quests/definitions/family-crest";
import { fightArenaQuest } from "@server/content/gamemodes/vanilla/quests/definitions/fight-arena";
import { fishingContestQuest } from "@server/content/gamemodes/vanilla/quests/definitions/fishing-contest";
import { gertrudesCatQuest } from "@server/content/gamemodes/vanilla/quests/definitions/gertrudes-cat";
import { grandTreeQuest } from "@server/content/gamemodes/vanilla/quests/definitions/grand-tree";
import { goblinDiplomacyQuest } from "@server/content/gamemodes/vanilla/quests/definitions/goblin-diplomacy";
import { hazeelCultQuest } from "@server/content/gamemodes/vanilla/quests/definitions/hazeel-cult";
import { holyGrailQuest } from "@server/content/gamemodes/vanilla/quests/definitions/holy-grail";
import { heroesQuest } from "@server/content/gamemodes/vanilla/quests/definitions/heroes-quest";
import { impCatcherQuest } from "@server/content/gamemodes/vanilla/quests/definitions/imp-catcher";
import { junglePotionQuest } from "@server/content/gamemodes/vanilla/quests/definitions/jungle-potion";
import { knightsSwordQuest } from "@server/content/gamemodes/vanilla/quests/definitions/knights-sword";
import { lilyPadQuest } from "@server/content/gamemodes/vanilla/quests/definitions/lily-pad";
import { lostCityQuest } from "@server/content/gamemodes/vanilla/quests/definitions/lost-city";
import { merlinsCrystalQuest } from "@server/content/gamemodes/vanilla/quests/definitions/merlins-crystal";
import { monksFriendQuest } from "@server/content/gamemodes/vanilla/quests/definitions/monks-friend";
import { murderMysteryQuest } from "@server/content/gamemodes/vanilla/quests/definitions/murder-mystery";
import { natureSpiritQuest } from "@server/content/gamemodes/vanilla/quests/definitions/nature-spirit";
import { observatoryQuest } from "@server/content/gamemodes/vanilla/quests/definitions/observatory-quest";
import { piratesTreasureQuest } from "@server/content/gamemodes/vanilla/quests/definitions/pirates-treasure";
import { plagueCityQuest } from "@server/content/gamemodes/vanilla/quests/definitions/plague-city";
import { priestInPerilQuest } from "@server/content/gamemodes/vanilla/quests/definitions/priest-in-peril";
import { princeAliRescueQuest } from "@server/content/gamemodes/vanilla/quests/definitions/prince-ali-rescue";
import { preservationRemainderQuests } from "@server/content/gamemodes/vanilla/quests/definitions/preservation-remainder";
import { restlessGhostQuest } from "@server/content/gamemodes/vanilla/quests/definitions/restless-ghost";
import { romeoAndJulietQuest } from "@server/content/gamemodes/vanilla/quests/definitions/romeo-and-juliet";
import { runeMysteriesQuest } from "@server/content/gamemodes/vanilla/quests/definitions/rune-mysteries";
import { scorpionCatcherQuest } from "@server/content/gamemodes/vanilla/quests/definitions/scorpion-catcher";
import { seaSlugQuest } from "@server/content/gamemodes/vanilla/quests/definitions/sea-slug";
import { sheepHerderQuest } from "@server/content/gamemodes/vanilla/quests/definitions/sheep-herder";
import { sheepShearerQuest } from "@server/content/gamemodes/vanilla/quests/definitions/sheep-shearer";
import { shieldOfArravQuest } from "@server/content/gamemodes/vanilla/quests/definitions/shield-of-arrav";
import { templeOfIkovQuest } from "@server/content/gamemodes/vanilla/quests/definitions/temple-of-ikov";
import { touristTrapQuest } from "@server/content/gamemodes/vanilla/quests/definitions/tourist-trap";
import { trollStrongholdQuest } from "@server/content/gamemodes/vanilla/quests/definitions/troll-stronghold";
import { treeGnomeVillageQuest } from "@server/content/gamemodes/vanilla/quests/definitions/tree-gnome-village";
import { tribalTotemQuest } from "@server/content/gamemodes/vanilla/quests/definitions/tribal-totem";
import { vampyreSlayerQuest } from "@server/content/gamemodes/vanilla/quests/definitions/vampyre-slayer";
import { waterfallQuest } from "@server/content/gamemodes/vanilla/quests/definitions/waterfall-quest";
import { witchsHouseQuest } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-house";
import { witchsPotionQuest } from "@server/content/gamemodes/vanilla/quests/definitions/witchs-potion";
import type { QuestDefinition } from "@server/content/gamemodes/vanilla/quests/types";

const QUEST_DEFINITIONS: QuestDefinition[] = [
    blackKnightsFortressQuest,
    bigChompyBirdHuntingQuest,
    clockTowerQuest,
    cooksAssistantQuest,
    demonSlayerQuest,
    doricsQuest,
    dragonSlayerIQuest,
    druidicRitualQuest,
    dwarfCannonQuest,
    elementalWorkshopIQuest,
    ernestTheChickenQuest,
    familyCrestQuest,
    fightArenaQuest,
    fishingContestQuest,
    gertrudesCatQuest,
    grandTreeQuest,
    goblinDiplomacyQuest,
    hazeelCultQuest,
    holyGrailQuest,
    heroesQuest,
    impCatcherQuest,
    junglePotionQuest,
    knightsSwordQuest,
    lilyPadQuest,
    lostCityQuest,
    merlinsCrystalQuest,
    monksFriendQuest,
    murderMysteryQuest,
    piratesTreasureQuest,
    plagueCityQuest,
    biohazardQuest,
    princeAliRescueQuest,
    restlessGhostQuest,
    romeoAndJulietQuest,
    runeMysteriesQuest,
    scorpionCatcherQuest,
    seaSlugQuest,
    sheepHerderQuest,
    sheepShearerQuest,
    treeGnomeVillageQuest,
    tribalTotemQuest,
    witchsHouseQuest,
    witchsPotionQuest,
    vampyreSlayerQuest,
    deathPlateauQuest,
    digSiteQuest,
    templeOfIkovQuest,
    touristTrapQuest,
    trollStrongholdQuest,
    priestInPerilQuest,
    natureSpiritQuest,
    observatoryQuest,
    waterfallQuest,
    ...preservationRemainderQuests,
    desertTreasureIQuest,
    // Registered last so shared Varrock NPCs can delegate to the other quest handlers.
    shieldOfArravQuest,
];

/**
 * Register all implemented quests: their interaction handlers, the shared
 * quest-completed scroll widget, and the registry consulted by the quest
 * journal for stage-specific text.
 *
 * Must run after skill handlers so quest gates can wrap skill loc handlers
 * (e.g. Doric's anvils wrapping the generic smith action).
 */
export function registerQuestHandlers(registry: IScriptRegistry, services: ScriptServices): void {
    registerPlayerLifecycleCleanup(registry, services, {
        player: clearPlayerConversationState,
        reset: resetConversationRuntimeState,
    });
    registerQuestCompletedWidgetHandlers(registry, services);
    for (const quest of QUEST_DEFINITIONS) {
        registerQuestDefinition(quest);
        quest.register(registry, services);
    }

    // Dev command: reset all registered quests (and quest points) for testing
    registry.registerCommand("resetquests", ({ player }) => {
        for (const quest of QUEST_DEFINITIONS) {
            setQuestStage(player, quest, services, 0);
            if (quest.varpId !== undefined && quest.stageBits) {
                player.varps.setVarpValue(quest.varpId, 0);
                services.variables.sendVarp(player, quest.varpId, 0);
            }
        }
        player.varps.setVarpValue(VARP_QUEST_POINTS, 0);
        services.variables.sendVarp(player, VARP_QUEST_POINTS, 0);
        // Desert Treasure's secondary varp stores the lit-torch and placed-diamond masks.
        player.varps.setVarpValue(441, 0);
        services.variables.sendVarp(player, 441, 0);
        player.varps.setVarpValue(61, 0);
        services.variables.sendVarp(player, 61, 0);
        player.varps.setVarpValue(201, 0);
        services.variables.sendVarp(player, 201, 0);
        player.varps.setVarpValue(14, 0);
        services.variables.sendVarp(player, 14, 0);
        player.varps.setVarpValue(224, 0);
        services.variables.sendVarp(player, 224, 0);
        player.varps.setVarpValue(225, 0);
        services.variables.sendVarp(player, 225, 0);
        player.varps.setVarpValue(193, 0);
        services.variables.sendVarp(player, 193, 0);
        player.varps.setVarpValue(194, 0);
        services.variables.sendVarp(player, 194, 0);
        player.varps.setVarpValue(195, 0);
        services.variables.sendVarp(player, 195, 0);
        player.varps.setVarpValue(1, 0);
        services.variables.sendVarp(player, 1, 0);
        player.varps.setVarpValue(69, 0);
        services.variables.sendVarp(player, 69, 0);
        player.varps.setVarpValue(70, 0);
        services.variables.sendVarp(player, 70, 0);
        player.varps.setVarpValue(308, 0);
        services.variables.sendVarp(player, 308, 0);
        player.varps.setVarpValue(294, 0);
        services.variables.sendVarp(player, 294, 0);
        for (const id of [140, 151, 162, 177, 183, 184, 213, 321, 322, 323, 324, 325, 329, 330, 331, 336, 337, 338, 340, 341, 348]) {
            player.varps.setVarpValue(id, 0);
            services.variables.sendVarp(player, id, 0);
        }
        services.system.logger.info?.(
            `[quests] ::resetquests - Reset ${QUEST_DEFINITIONS.length} quest(s) for player ${player.id}`,
        );
        return `Reset ${QUEST_DEFINITIONS.length} quest(s) and quest points.`;
    }, {
        permission: "developer",
        owner: "content:vanilla:quests",
    });

    // Dev command: complete every implemented quest in one idempotent operation.
    registry.registerCommand("completequests", ({ player }) => {
        const questPoints = completeAllQuests(player, services, QUEST_DEFINITIONS);
        services.system.logger.info?.(
            `[quests] ::completequests - Completed ${QUEST_DEFINITIONS.length} quest(s) for player ${player.id}`,
        );
        return `Completed ${QUEST_DEFINITIONS.length} quest(s). Quest points: ${questPoints}.`;
    }, {
        permission: "developer",
        owner: "content:vanilla:quests",
    });

    services.system.logger.info?.(`[quests] Registered ${QUEST_DEFINITIONS.length} quest(s)`);
}

export {
    getQuestDefinition,
    getQuestDefinitionByKey,
    getQuestDefinitionByName,
    getRegisteredQuests,
    normalizeQuestKey,
} from "@server/content/gamemodes/vanilla/quests/QuestRegistry";
export type {
    QuestDefinition,
    QuestItemRequirement,
    QuestProgressRequirement,
    QuestRequirements,
    QuestRewards,
    QuestSkillRequirement,
    VarbitQuestDefinition,
    VarpQuestDefinition,
} from "@server/content/gamemodes/vanilla/quests/types";
