import { createDefaultAmmoDataProvider } from "@server/game/combat/AmmoSystem";
import type { NpcLootConfig } from "@server/game/combat/DamageTracker";
import { getWeaponDataProvider } from "@server/game/combat/WeaponDataProvider";
import { BaseGamemode } from "@server/game/gamemodes/BaseGamemode";
import type {
    GamemodeDefinition,
    GamemodeInitContext,
    GamemodeServerServices,
    GamemodeUiBridge,
    GamemodeUiController,
} from "@server/game/gamemodes/GamemodeDefinition";
import type { PlayerState } from "@server/game/player";
import { grantStarterLoadout } from "@server/content/gamemodes/vanilla/data/starterLoadout";
import {
    getProviderRegistry,
    resetProviderRegistry,
} from "@server/game/providers/ProviderRegistry";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { encodeMessage, type BankServerUpdate } from "@server/network/messages";
import { VanillaUiController } from "@server/content/gamemodes/vanilla/VanillaUiController";
import { BankingManager, registerBankInterfaceHooks, registerBankingHandlers } from "@server/content/gamemodes/vanilla/banking";
import type { BankingProviderServices } from "@server/content/gamemodes/vanilla/banking/BankingProvider";
import { registerBossCombatEncounters } from "@server/content/gamemodes/vanilla/combat/BossCombatScript";
import { createCombatStyleSequenceProvider } from "@server/content/gamemodes/vanilla/combat/CombatStyleSequences";
import { createEquipmentBonusProvider } from "@server/content/gamemodes/vanilla/combat/EquipmentBonuses";
import { createInstantUtilitySpecialProvider } from "@server/content/gamemodes/vanilla/combat/InstantUtilitySpecialCatalog";
import { createSkillConfiguration } from "@server/content/gamemodes/vanilla/combat/SkillConfiguration";
import { createFallbackSpecialAttackProvider } from "@server/content/gamemodes/vanilla/combat/FallbackSpecialAttackCatalog";
import { createSpecialAttackVisualProvider } from "@server/content/gamemodes/vanilla/combat/SpecialAttackVisualCatalog";
import { createSpellXpProvider } from "@server/content/gamemodes/vanilla/combat/SpellXpData";
import { registerVanillaGroundItemSpawns } from "@server/content/gamemodes/vanilla/data/groundItemSpawns";
import { DEFAULT_LOGIN_VARBITS } from "@server/content/gamemodes/vanilla/data/loginVarbits";
import { DEFAULT_LOGIN_VARPS } from "@server/content/gamemodes/vanilla/data/loginVarps";
import { NPC_LOOT_CONFIGS } from "@server/content/gamemodes/vanilla/data/lootDistribution";
import { SCURRIUS_DROP_TABLE } from "@server/content/gamemodes/vanilla/data/scurriusDrops";
import { createProjectileParamsProvider } from "@server/content/gamemodes/vanilla/data/projectileParams";
import { createRuneDataProvider } from "@server/content/gamemodes/vanilla/data/runes";
import { createSpellDataProvider } from "@server/content/gamemodes/vanilla/data/spells";
import { createWeaponDataProvider } from "@server/content/gamemodes/vanilla/data/weapons";
import { registerEquipmentStatsInterfaceHooks } from "@server/content/gamemodes/vanilla/equipment/EquipmentStatsInterfaceHooks";
import { registerEquipmentHandlers } from "@server/content/gamemodes/vanilla/equipment/equipment";
import { registerEquipmentWidgetHandlers } from "@server/content/gamemodes/vanilla/equipment/equipmentWidgets";
import { computeTargetBonusPercentages } from "@server/content/gamemodes/vanilla/equipment/targetBonuses";
import { registerSmithingBarModalHandler } from "@server/content/gamemodes/vanilla/modals/smithingBarModalHandler";
import { registerWidgetCloseHandlers } from "@server/content/gamemodes/vanilla/modals/widgetCloseHandlers";
import { registerWidgetOpenHandlers } from "@server/content/gamemodes/vanilla/modals/widgetOpenHandlers";
import { registerNpcDialogueHandlers } from "@server/content/gamemodes/vanilla/npcs";
import {
    getQuestDefinition,
    getQuestDefinitionByKey,
    normalizeQuestKey,
    registerQuestHandlers,
} from "@server/content/gamemodes/vanilla/quests";
import { VANILLA_QUEST_LIST_GROUPS } from "@server/content/gamemodes/vanilla/questCatalog";
import { getQuestStage, isQuestComplete, setQuestStage } from "@server/content/gamemodes/vanilla/quests/QuestService";
import { canReceiveQuestDrop } from "@server/content/gamemodes/vanilla/quests/questDropEligibility";
import { registerVanillaCommandHandlers } from "@server/content/gamemodes/vanilla/scripts/commands";
import { registerAlKharidBorderHandlers } from "@server/content/gamemodes/vanilla/scripts/content/alKharidBorder";
import { registerDraynorAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/draynor";
import { registerFaladorAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/falador";
import { registerLumbridgeAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/lumbridge";
import { registerPortSarimAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/port-sarim";
import { registerTaverleyAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/taverley";
import { registerVarrockAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/varrock";
import { registerWildernessAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/wilderness";
import { registerWizardTowerAreaHandlers } from "@server/content/gamemodes/vanilla/scripts/content/areas/wizard-tower";
import { registerBobHandlers } from "@server/content/gamemodes/vanilla/scripts/content/bob";
import { registerBarrowsHandlers } from "@server/content/gamemodes/vanilla/scripts/content/barrows";
import { registerClimbingHandlers } from "@server/content/gamemodes/vanilla/scripts/content/climbing";
import { registerDefaultTalkHandlers } from "@server/content/gamemodes/vanilla/scripts/content/defaultTalk";
import { registerDevObjectTransitions } from "@server/content/gamemodes/vanilla/scripts/content/devObjectTransitions";
import { registerDigHandlers } from "@server/content/gamemodes/vanilla/scripts/content/dig";
import { registerDemoInteractionHandlers } from "@server/content/gamemodes/vanilla/scripts/content/demoInteractions";
import { registerDoorHandlers } from "@server/content/gamemodes/vanilla/scripts/content/doors";
import { registerKeyDoorHandlers } from "@server/content/gamemodes/vanilla/scripts/content/key-doors";
import { registerPohPoolHandlers } from "@server/content/gamemodes/vanilla/scripts/content/pohPools";
import { registerRomeoHandlers } from "@server/content/gamemodes/vanilla/scripts/content/romeo";
import { registerBoatTravelHandlers } from "@server/content/gamemodes/vanilla/scripts/content/travel/boats";
import { registerWildernessAccessHandlers } from "@server/content/gamemodes/vanilla/scripts/content/wildernessAccess";
import { registerFollowerItemHandlers } from "@server/content/gamemodes/vanilla/scripts/items/followers";
import {
    CLUE_SCROLL_LIMIT,
    countCluesForTier,
    getClueScrollDefinitionForDirectItem,
    registerClueScrollBoxHandlers,
} from "@server/content/gamemodes/vanilla/scripts/items/clueScrollBoxes";
import { registerPacksHandlers } from "@server/content/gamemodes/vanilla/scripts/items/packs";
import { registerDrakansMedallionHandlers } from "@server/content/gamemodes/vanilla/scripts/items/drakansMedallion";
import { registerToxicBlowpipeHandlers } from "@server/content/gamemodes/vanilla/scripts/items/toxicBlowpipe";
import { registerWebweaverBowHandlers } from "@server/content/gamemodes/vanilla/scripts/items/webweaverBow";
import { handleDismiss, handleResumePauseButton, registerLevelUpHandlers } from "@server/content/gamemodes/vanilla/scripts/levelup";
import { registerShopInterfaceHooks } from "@server/content/gamemodes/vanilla/shops";
import { ShopService } from "@server/content/gamemodes/vanilla/shops/ShopService";
import { registerShopInteractionHandlers } from "@server/content/gamemodes/vanilla/shops/shopInteractions";
import { registerShopWidgetHandlers } from "@server/content/gamemodes/vanilla/shops/shopWidgets";
import { registerZaffHandlers } from "@server/content/gamemodes/vanilla/shops/zaff";
import { register as registerSkillHandlers } from "@server/content/gamemodes/vanilla/skills";
import { handleSailingPlayerRestore } from "@server/content/gamemodes/vanilla/skills/sailing";
import { registerAccountSummaryWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/accountSummaryWidgets";
import { registerCollectionLogWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/collectionLogWidgets";
import { registerCombatWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/combatWidgets";
import { registerDiaryJournalWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/diaryJournalWidgets";
import { achievementTaskTracker } from "@server/content/gamemodes/vanilla/diary-tasks/AchievementTaskTracker";
import { slayerTaskTracker } from "@server/content/gamemodes/vanilla/slayer";
import { registerDevUIKitMenu } from "@server/content/gamemodes/vanilla/widgets/devUIKitMenu";
import { registerDevDialogueEditor } from "@server/content/gamemodes/vanilla/widgets/devDialogueEditor";
import { registerTransportObjectEditor } from "@server/content/gamemodes/vanilla/widgets/transportObjectEditor";
import { registerEmoteWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/emoteWidgets";
import { registerMinimapWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/minimapWidgets";
import { registerNpcDropTableWidgetHandlers, type NpcDropViewer } from "@server/content/gamemodes/vanilla/widgets/npcDropTableWidgets";
import { registerMusicWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/musicWidgets";
import { registerPrayerWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/prayerWidgets";
import { registerQuestJournalWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/questJournalWidgets";
import { registerSettingsWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/settingsWidgets";
import { registerSkillGuideWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/skillGuideWidgets";
import { registerSpellbookWidgetHandlers } from "@server/content/gamemodes/vanilla/widgets/spellbookWidgets";

export class VanillaGamemode extends BaseGamemode {
    override readonly id: string = "vanilla";
    override readonly name: string = "Vanilla";

    private bankingManager: BankingManager | undefined;
    private shopService: ShopService | undefined;
    private serverServices: GamemodeServerServices | undefined;
    private scriptServices: ScriptServices | undefined;
    private npcDropViewer: NpcDropViewer | undefined;

    private static readonly FROZEN_KEY_PIECE_VARIANTS = new Map<number, readonly number[]>([
        [26358, [26358, 26359]],
        [26359, [26358, 26359]],
        [26360, [26360, 26361]],
        [26361, [26360, 26361]],
        [26362, [26362, 26363]],
        [26363, [26362, 26363]],
        [26364, [26364, 26365]],
        [26365, [26364, 26365]],
    ]);

    override canReceiveDrop(
        _npcTypeId: number,
        itemId: number,
        player: PlayerState | undefined,
    ): boolean {
        if (!canReceiveQuestDrop(itemId, player)) return false;
        const clue = getClueScrollDefinitionForDirectItem(itemId);
        if (clue) {
            if (!player) return false;
            const services = this.scriptServices;
            if (!services) return false;
            if (countCluesForTier(player, clue.tier, services) >= CLUE_SCROLL_LIMIT) {
                services.messaging.sendGameMessage(
                    player,
                    "<col=ff0000>You have a feeling you would have received a clue scroll.</col>",
                );
                return false;
            }
            return true;
        }

        const variants = VanillaGamemode.FROZEN_KEY_PIECE_VARIANTS.get(itemId);
        if (!variants) return true;
        if (!player) return false;

        const ownsPiece = variants.some(
            (variantId) =>
                player.items.hasItem(variantId) ||
                player.bank
                    .getBankEntries()
                    .some((entry) => entry.itemId === variantId && entry.quantity > 0),
        );
        if (ownsPiece) return false;

        // Frozen Door is not authored in every gamemode revision. Once its
        // quest definition is registered, this automatically observes the
        // canonical completion stage instead of duplicating a varbit here.
        const frozenDoor = getQuestDefinition("The Frozen Door");
        return !frozenDoor || !isQuestComplete(player, frozenDoor);
    }

    override transformDropItemId(
        _npcTypeId: number,
        itemId: number,
        _player: PlayerState | undefined,
    ): number {
        return getClueScrollDefinitionForDirectItem(itemId)?.boxItemId ?? itemId;
    }

    getLootDistributionConfig(npcTypeId: number): NpcLootConfig | undefined {
        return NPC_LOOT_CONFIGS.get(npcTypeId);
    }

    getDropTable(npcTypeId: number) {
        return npcTypeId === 7222 ? SCURRIUS_DROP_TABLE : undefined;
    }

    getLoginVarbits(_player: PlayerState): Array<[number, number]> {
        return DEFAULT_LOGIN_VARBITS;
    }

    getLoginVarps(_player: PlayerState): Array<[number, number]> {
        return DEFAULT_LOGIN_VARPS;
    }

    onNpcExamine(player: PlayerState, npcTypeId: number): boolean {
        return this.npcDropViewer?.open(player, npcTypeId) === true;
    }

    override initializePlayer(player: PlayerState): void {
        // Player IDs are reused by the networking layer. Keep a new session
        // from inheriting an old session's in-memory tracker entries before
        // its own persisted diary state is loaded.
        achievementTaskTracker.resetPlayer(player.id);
        slayerTaskTracker.resetPlayer(player.id);
    }

    override serializePlayerState(player: PlayerState): Record<string, unknown> | undefined {
        const achievementDiary = achievementTaskTracker.serializePlayerState(player.id);
        const slayer = slayerTaskTracker.serializePlayerState(player.id);
        return achievementDiary || slayer ? { achievementDiary, slayer } : undefined;
    }

    override deserializePlayerState(player: PlayerState, data: Record<string, unknown>): void {
        achievementTaskTracker.deserializePlayerState(player.id, data.achievementDiary);
        slayerTaskTracker.deserializePlayerState(player.id, data.slayer);
    }

    onPlayerRestore(player: PlayerState): void {
        const services = this.scriptServices;
        if (!services) return;

        handleSailingPlayerRestore(player, services);
    }

    onPostDesignComplete(player: PlayerState): void {
        grantStarterLoadout(player);
    }

    getGamemodeServices(): Record<string, unknown> {
        return {
            banking: this.bankingManager,
            weaponDataProvider: getWeaponDataProvider(),
        };
    }

    override createUiController(bridge: GamemodeUiBridge): GamemodeUiController {
        return new VanillaUiController(bridge, (player) => this.getQuestListGroups(player));
    }

    override getQuestListGroups(_player: PlayerState) {
        return VANILLA_QUEST_LIST_GROUPS;
    }

    private registerProviders(): void {
        const registry = getProviderRegistry();
        registry.spellXp = createSpellXpProvider();
        registry.specialAttackVisual = createSpecialAttackVisualProvider();
        registry.instantUtilitySpecial = createInstantUtilitySpecialProvider();
        registry.weaponData = createWeaponDataProvider();
        registry.fallbackSpecialAttack = createFallbackSpecialAttackProvider();
        registry.combatStyleSequence = createCombatStyleSequenceProvider();
        registry.skillConfiguration = createSkillConfiguration();
        registry.equipmentBonus = createEquipmentBonusProvider();
        registry.projectileParams = createProjectileParamsProvider();
        registry.spellData = createSpellDataProvider();
        registry.runeData = createRuneDataProvider();
        registry.ammoData = createDefaultAmmoDataProvider();
    }

    contributeScriptServices(services: ScriptServices): void {
        this.scriptServices = services;
        const ss = this.serverServices;

        // Banking services
        const bm = this.bankingManager;
        if (bm) {
            services.banking = {
                openBank: (player, opts) => bm.openBank(player, opts),
                depositInventoryToBank: (player, tab) => bm.depositInventory(player, tab),
                depositEquipmentToBank: (player, tab) => bm.depositEquipment(player, tab),
                depositEquipmentSlotToBank: (player, slot, tab) =>
                    bm.depositEquipmentSlot(player, slot, tab),
                removeEquipmentSlot: (player, slot) => bm.removeEquipmentSlot(player, slot),
                depositInventoryItemToBank: (player, slot, quantity, opts) => {
                    const slotIndex = Math.trunc(slot);
                    const amount = Math.trunc(quantity);
                    const itemIdHintRaw = opts?.itemIdHint;
                    const tabRaw = opts?.tab;
                    return bm.depositItem(
                        player,
                        slotIndex,
                        amount,
                        itemIdHintRaw !== undefined && Number.isFinite(itemIdHintRaw)
                            ? Math.trunc(itemIdHintRaw)
                            : undefined,
                        tabRaw !== undefined && Number.isFinite(tabRaw)
                            ? Math.trunc(tabRaw)
                            : undefined,
                    );
                },
                withdrawFromBankSlot: (player, slot, quantity, opts) =>
                    bm.withdraw(player, slot, quantity, { overrideNoted: opts?.noted }),
                getBankEntryAtClientSlot: (player, clientSlot) =>
                    bm.getBankEntryAtClientSlot(player, clientSlot),
                moveBankSlot: (player, from, to, opts) => bm.moveBankSlot(player, from, to, opts),
                handleIfButtonD: (player, payload) => bm.handleIfButtonD(player, payload),
                queueBankSnapshot: (player) => bm.queueBankSnapshot(player),
                sendBankTabVarbits: (player) => bm.sendBankTabVarbits(player),
                setCurrentTab: (player, tabIndex) => bm.setCurrentTab(player, tabIndex),
                setTabDisplayMode: (player, mode) => bm.setTabDisplayMode(player, mode),
                collapseTab: (player, tabIndex) => bm.collapseTab(player, tabIndex),
                releasePlaceholder: (player, slot, itemIdHint) =>
                    bm.releasePlaceholder(player, slot, itemIdHint),
                releasePlaceholders: (player, tabIndex) => bm.releasePlaceholders(player, tabIndex),
                addItemToBank: (player, itemId, qty) => bm.addItemToBank(player, itemId, qty),
            };
        }

        // Shop services
        if (this.shopService) {
            services.shopping = this.shopService.createScriptServices();
        }

        // Quest-stage access for engine-level consumers (the dialogue tree
        // runner/editor) that can't import this gamemode's QuestService
        // directly — see QuestStageFacade in serviceInterfaces.ts.
        services.quests = {
            getStage: (player, questKey) => {
                const quest = getQuestDefinitionByKey(normalizeQuestKey(questKey));
                return quest ? getQuestStage(player, quest) : undefined;
            },
            setStage: (player, questKey, value) => {
                const quest = getQuestDefinitionByKey(normalizeQuestKey(questKey));
                if (quest) setQuestStage(player, quest, services, value);
            },
            hasQuest: (questKey) => getQuestDefinitionByKey(normalizeQuestKey(questKey)) !== undefined,
        };

        // Equipment target-specific bonuses
        services.equipment.computeTargetBonusPercentages = (player) =>
            computeTargetBonusPercentages(player, services.equipment.getEquipArray(player));

        // Widget lifecycle handlers
        registerWidgetCloseHandlers(services, {
            closeModal: (player) => ss?.getInterfaceService()?.closeModal(player),
        });
        registerWidgetOpenHandlers(services);

        // Smithing bar modal handler
        registerSmithingBarModalHandler(services, {
            closeModal: (player) => ss?.getInterfaceService()?.closeModal(player),
        });
    }

    override registerHandlers(registry: IScriptRegistry, services: ScriptServices): void {
        // Banking, equipment, shops
        registerBankingHandlers(registry, services);
        registerEquipmentHandlers(registry, services);
        registerEquipmentWidgetHandlers(registry, services);
        registerShopInteractionHandlers(registry, services);
        registerShopWidgetHandlers(registry, services);
        registerZaffHandlers(registry, services);
        registerVanillaCommandHandlers(registry, services);
        registerDevUIKitMenu(registry, services);
        registerDevDialogueEditor(registry, services);
        registerTransportObjectEditor(registry, services);
        registerDevObjectTransitions(registry, services);
        registerDigHandlers(registry, services);

        // Content
        registerBossCombatEncounters(registry);
        registerBarrowsHandlers(registry, services);
        registerClimbingHandlers(registry, services);
        // Key doors before generic door open/close so locked locs win.
        registerKeyDoorHandlers(registry);
        registerDoorHandlers(registry, services);
        registerBoatTravelHandlers(registry);
        // Specific Talk-to scripts before the global fallback.
        registerNpcDialogueHandlers(registry, services);
        registerLumbridgeAreaHandlers(registry);
        registerWizardTowerAreaHandlers(registry);
        registerFaladorAreaHandlers(registry);
        registerVarrockAreaHandlers(registry);
        registerPortSarimAreaHandlers(registry);
        registerDraynorAreaHandlers(registry);
        registerTaverleyAreaHandlers(registry);
        registerWildernessAreaHandlers(registry);
        registerDefaultTalkHandlers(registry, services);
        registerPohPoolHandlers(registry, services);
        registerWildernessAccessHandlers(registry, services);
        registerAlKharidBorderHandlers(registry, services);
        registerBobHandlers(registry, services);
        registerRomeoHandlers(registry, services);
        registerDemoInteractionHandlers(registry, services);

        // Items
        registerClueScrollBoxHandlers(registry, services);
        registerFollowerItemHandlers(registry, services);
        registerPacksHandlers(registry, services);
        registerDrakansMedallionHandlers(registry);
        registerToxicBlowpipeHandlers(registry, services);
        registerWebweaverBowHandlers(registry, services);

        // Widgets
        registerCombatWidgetHandlers(registry, services);
        registerMinimapWidgetHandlers(registry, services);
        registerPrayerWidgetHandlers(registry, services);
        registerMusicWidgetHandlers(registry, services);
        registerEmoteWidgetHandlers(registry, services);
        registerSpellbookWidgetHandlers(registry, services);
        registerSkillGuideWidgetHandlers(registry, services);
        registerSettingsWidgetHandlers(registry, services);
        registerQuestJournalWidgetHandlers(registry, services);
        registerDiaryJournalWidgetHandlers(registry, services);
        registerAccountSummaryWidgetHandlers(registry, services);
        registerCollectionLogWidgetHandlers(registry, services);
        this.npcDropViewer = registerNpcDropTableWidgetHandlers(registry, services);

        // Skills
        registerSkillHandlers(registry, services);

        // Quests (after skills so quest gates can wrap skill loc handlers)
        registerQuestHandlers(registry, services);

        // Level-up display (event-driven from SkillService)
        if (services.system.eventBus) {
            registerLevelUpHandlers(registry, services, services.system.eventBus);
        }
    }

    override initialize(context: GamemodeInitContext): void {
        const ss = context.serverServices;
        this.serverServices = ss;

        this.registerProviders();

        // === Banking ===
        const bankingServices: BankingProviderServices = {
            ...ss,
            queueBankSnapshot: (playerId, payload) =>
                ss.queueGamemodeSnapshot("bank", playerId, payload),
            sendBankSnapshot: (playerId, payload) =>
                ss.queueGamemodeSnapshot("bank", playerId, payload),
        };

        this.bankingManager = new BankingManager(bankingServices);

        const bm = this.bankingManager;
        ss.registerSnapshotEncoder(
            "bank",
            (_playerId, payload) => ({
                message: encodeMessage({ type: "bank", payload: payload as BankServerUpdate }),
                context: "bank_snapshot",
            }),
            (playerId, _payload) => {
                const player = ss.getPlayer(playerId);
                if (player) {
                    player.bank.setBankClientSlotMapping(bm.buildBankSlotMapping(player));
                }
            },
        );

        // === Shops ===
        this.shopService = new ShopService({ serverServices: ss });

        // === Static ground item spawns ===
        registerVanillaGroundItemSpawns(ss);

        // === Interface hooks ===
        const interfaceService = ss.getInterfaceService();
        if (interfaceService) {
            registerBankInterfaceHooks(interfaceService);
            registerEquipmentStatsInterfaceHooks(interfaceService);
            registerShopInterfaceHooks(interfaceService);
        }
    }

    onResumePauseButton(player: PlayerState, widgetId: number, childIndex: number): boolean {
        if (!this.scriptServices) return false;
        return handleResumePauseButton(this.scriptServices, player, widgetId, childIndex);
    }

    onPlayerDisconnect(playerId: number): void {
        if (this.scriptServices) {
            handleDismiss(this.scriptServices, playerId);
        }
    }

    override dispose(): void {
        resetProviderRegistry();

        this.bankingManager = undefined;
        this.shopService = undefined;
        this.serverServices = undefined;
        this.scriptServices = undefined;
    }
}

export function createGamemode(): GamemodeDefinition {
    return new VanillaGamemode();
}
