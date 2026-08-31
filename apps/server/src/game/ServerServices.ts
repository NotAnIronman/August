/**
 * Shared service context passed to all services.
 *
 * Every service receives a reference to this object and accesses
 * dependencies directly (e.g. `this.services.equipmentService.ensureEquipArray(p)`).
 *
 * Fields are optional (`?`) when populated after initial construction
 * or conditionally created. Services that always exist from startup are required.
 *
 * No service reads from this object at construction time — only at call time
 * (during tick processing), so populating fields incrementally with
 * `{} as ServerServices` is safe.
 */
// ── Cache / shared types ────────────────────────────────────────────────────
// ── Network types ───────────────────────────────────────────────────────────
import type { WebSocket } from "ws";

import type { Huffman } from "@august/osrs-engine/chat/Huffman";
import type { BasType } from "@august/osrs-engine/config/bastype/BasType";
import type { DbRepository } from "@august/osrs-engine/config/db/DbRepository";
import type { IdkType } from "@august/osrs-engine/config/idktype/IdkType";
import type { LocTypeLoader } from "@august/osrs-engine/config/loctype/LocTypeLoader";
import type { NpcTypeLoader } from "@august/osrs-engine/config/npctype/NpcTypeLoader";
import type { ObjTypeLoader } from "@august/osrs-engine/config/objtype/ObjTypeLoader";
// ── Audio ───────────────────────────────────────────────────────────────────
import type { MusicCatalogService } from "@server/audio/MusicCatalogService";
import type { MusicRegionService } from "@server/audio/MusicRegionService";
import type { MusicUnlockService } from "@server/audio/MusicUnlockService";
import type { NpcSoundLookup } from "@server/audio/NpcSoundLookup";
import type { AuthenticationService } from "@server/network/AuthenticationService";
import type { BroadcastService } from "@server/network/BroadcastService";
import type { LoginHandshakeService } from "@server/network/LoginHandshakeService";
import type { MessageRouter } from "@server/network/MessageRouter";
import type { NpcSyncSession } from "@server/network/NpcSyncSession";
import type { PlayerNetworkLayer } from "@server/network/PlayerNetworkLayer";
import type { PlayerSyncSession } from "@server/network/PlayerSyncSession";
// ── Network ─────────────────────────────────────────────────────────────────
import type { AccountSummaryTracker } from "@server/network/accountSummary";
import type {
    ActorSyncBroadcaster,
    ChatBroadcaster,
    CombatBroadcaster,
    InventoryBroadcaster,
    MiscBroadcaster,
    SkillBroadcaster,
    VarBroadcaster,
    WidgetBroadcaster,
} from "@server/network/broadcast";
import type { NpcPacketEncoder, PlayerPacketEncoder } from "@server/network/encoding";
import type { WorldEntityInfoEncoder } from "@server/network/encoding/WorldEntityInfoEncoder";
import type {
    Cs2ModalManager,
    GroundItemHandler,
    NpcSyncManager,
    PlayerAppearanceManager,
    SoundManager,
} from "@server/network/managers";
import type { ReportGameTimeTracker } from "@server/network/reportGameTime";
// ── Pathfinding ─────────────────────────────────────────────────────────────
import type { PathService } from "@server/pathfinding/PathService";
// ── Widgets ─────────────────────────────────────────────────────────────────
import type { InterfaceService } from "@server/widgets/InterfaceService";
import type { WidgetAction } from "@server/widgets/WidgetManager";
// ── World ───────────────────────────────────────────────────────────────────
import type { CacheEnv } from "@server/world/CacheEnv";
import type { DoorStateManager } from "@server/world/DoorStateManager";
import type { DynamicLocStateStore } from "@server/world/DynamicLocStateStore";
import type { InstancedAreaManager } from "@server/world/InstancedAreaManager";
import type { MapCollisionService } from "@server/world/MapCollisionService";
// ── Game – actions ──────────────────────────────────────────────────────────
import type { ActionScheduler } from "@server/game/actions/ActionScheduler";
import type { CombatActionHandler } from "@server/game/actions/handlers/CombatActionHandler";
import type { EffectDispatcher } from "@server/game/actions/handlers/EffectDispatcher";
import type { InventoryActionHandler } from "@server/game/actions/handlers/InventoryActionHandler";
import type { SpellActionHandler } from "@server/game/actions/handlers/SpellActionHandler";
import type { WidgetDialogHandler } from "@server/game/actions/handlers/WidgetDialogHandler";
// ── Game – combat ───────────────────────────────────────────────────────────
import type { CombatCategoryData } from "@server/game/combat/CombatCategoryData";
import type { EncounterManager } from "@server/game/encounters/EncounterManager";
// ── Game – death ────────────────────────────────────────────────────────────
import type { PlayerDeathService } from "@server/game/death/PlayerDeathService";
// ── Game – events ───────────────────────────────────────────────────────────
import type { GameEventBus } from "@server/game/events/GameEventBus";
// ── Game – followers ────────────────────────────────────────────────────────
import type { FollowerCombatManager } from "@server/game/followers/FollowerCombatManager";
import type { FollowerManager } from "@server/game/followers/FollowerManager";
// ── Game – gamemodes ────────────────────────────────────────────────────────
import type { GamemodeDefinition, GamemodeUiController } from "@server/game/gamemodes/GamemodeDefinition";
// ── Game – items ────────────────────────────────────────────────────────────
import type { GroundItemManager } from "@server/game/items/GroundItemManager";
// ── Game – core ─────────────────────────────────────────────────────────────
import type { NpcManager } from "@server/game/npcManager";
import type { PlayerManager, PlayerState } from "@server/game/player";
import type { PrayerSystem } from "@server/game/prayer/PrayerSystem";
import type { SailingInstanceManager } from "@server/game/sailing/SailingInstanceManager";
import type { ScriptRegistry, ScriptRuntime } from "@server/game/scripts";
// ── Game – services ─────────────────────────────────────────────────────────
import type { ActionDispatchService } from "@server/game/services/ActionDispatchService";
import type { AppearanceService } from "@server/game/services/AppearanceService";
import type { ClientInputService } from "@server/game/services/ClientInputService";
import type { CollectionLogService } from "@server/game/services/CollectionLogService";
import type { CombatDataService } from "@server/game/services/CombatDataService";
import type { CombatEffectService } from "@server/game/services/CombatEffectService";
import type { DataLoaderService } from "@server/game/services/DataLoaderService";
import type { EquipmentService } from "@server/game/services/EquipmentService";
import type { EquipmentStatsUiService } from "@server/game/services/EquipmentStatsUiService";
import type { FriendsChatService } from "@server/game/services/FriendsChatService";
import type { InterfaceManager } from "@server/game/services/InterfaceManager";
import type { InventoryMessageService } from "@server/game/services/InventoryMessageService";
import type { InventoryService } from "@server/game/services/InventoryService";
import type { LocationService } from "@server/game/services/LocationService";
import type { MessagingService } from "@server/game/services/MessagingService";
import type { MovementService } from "@server/game/services/MovementService";
import type { PlayerCombatService } from "@server/game/services/PlayerCombatService";
import type { ProjectileTimingService } from "@server/game/services/ProjectileTimingService";
import type { SkillService } from "@server/game/services/SkillService";
import type { SoundService } from "@server/game/services/SoundService";
import type { SpellCastingService } from "@server/game/services/SpellCastingService";
import type { TickFrameService } from "@server/game/services/TickFrameService";
import type { TickPhaseService } from "@server/game/services/TickPhaseService";
import type { VariableService } from "@server/game/services/VariableService";
import type { VarpSyncService } from "@server/game/services/VarpSyncService";
import type { WorldEntityService } from "@server/game/services/WorldEntityService";
// ── Game – state ────────────────────────────────────────────────────────────
import type { PersistenceProvider } from "@server/game/state/PersistenceProvider";
// ── Game – systems ──────────────────────────────────────────────────────────
import type {
    BroadcastScheduler,
    EquipmentHandler,
    GatheringSystemManager,
    MovementSystem,
    PlayerAnimSet,
    ProjectileSystem,
    ScriptScheduler,
    StatusEffectSystem,
} from "@server/game/systems";
import type { TickFrame, TickPhaseOrchestrator } from "@server/game/tick";
// ── Game – tick ─────────────────────────────────────────────────────────────
import type { GameTicker } from "@server/game/ticker";
// ── Game – trade ────────────────────────────────────────────────────────────
import type { TradeManager } from "@server/game/trade/TradeManager";

// ─────────────────────────────────────────────────────────────────────────────

export interface ServerServices {
    // ── Config & infrastructure ──────────────────────────────────────────
    readonly ticker: GameTicker;
    readonly tickMs: number;
    readonly gamemode: GamemodeDefinition;
    gamemodeUi: GamemodeUiController;
    readonly pathService?: PathService;
    readonly mapService?: MapCollisionService;
    readonly eventBus: GameEventBus;
    activeFrame?: TickFrame;
    maintenanceMode?: boolean;

    // ── Cache / data loaders ─────────────────────────────────────────────
    cacheEnv: CacheEnv;
    npcTypeLoader?: NpcTypeLoader;
    locTypeLoader?: LocTypeLoader;
    objTypeLoader?: ObjTypeLoader;
    huffman?: Huffman;
    dbRepository?: DbRepository;
    healthBarDefLoader?: { load(defId: number): { width?: number } | undefined };
    basTypeLoader?: { load(id: number): BasType | undefined };
    idkTypeLoader?: { load(id: number): IdkType | undefined };

    // ── Core state managers ──────────────────────────────────────────────
    players?: PlayerManager;
    npcManager?: NpcManager;
    encounterManager?: EncounterManager;
    readonly playerPersistence: PersistenceProvider;

    // ── Game services ────────────────────────────────────────────────────
    readonly dataLoaderService: DataLoaderService;
    readonly variableService: VariableService;
    readonly messagingService: MessagingService;
    readonly friendsChatService: FriendsChatService;
    readonly skillService: SkillService;
    readonly inventoryService: InventoryService;
    readonly equipmentService: EquipmentService;
    readonly appearanceService: AppearanceService;
    readonly combatDataService: CombatDataService;
    readonly locationService: LocationService;
    readonly interfaceManager: InterfaceManager;
    readonly collectionLogService: CollectionLogService;
    readonly worldEntityService: WorldEntityService;
    readonly soundService: SoundService;
    readonly movementService: MovementService;
    playerCombatService?: PlayerCombatService;
    readonly combatEffectService: CombatEffectService;
    readonly varpSyncService: VarpSyncService;
    readonly equipmentStatsUiService: EquipmentStatsUiService;
    readonly tickPhaseService: TickPhaseService;
    readonly tickFrameService: TickFrameService;
    readonly clientInputService: ClientInputService;
    readonly actionDispatchService: ActionDispatchService;
    spellCastingService?: SpellCastingService;
    projectileTimingService?: ProjectileTimingService;
    inventoryMessageService?: InventoryMessageService;

    // ── Combat data ──────────────────────────────────────────────────────
    combatCategoryData?: CombatCategoryData;

    // ── Audio ────────────────────────────────────────────────────────────
    npcSoundLookup?: NpcSoundLookup;
    musicCatalogService?: MusicCatalogService;
    musicUnlockService?: MusicUnlockService;
    musicRegionService?: MusicRegionService;

    // ── Systems ──────────────────────────────────────────────────────────
    readonly actionScheduler: ActionScheduler;
    readonly broadcastScheduler: BroadcastScheduler;
    readonly scriptRuntime: ScriptRuntime;
    readonly scriptRegistry: ScriptRegistry;
    readonly scriptScheduler: ScriptScheduler;
    readonly statusEffects: StatusEffectSystem;
    readonly prayerSystem: PrayerSystem;
    readonly groundItems: GroundItemManager;
    readonly gatheringSystem: GatheringSystemManager;
    readonly equipmentHandler: EquipmentHandler;
    projectileSystem?: ProjectileSystem;
    movementSystem?: MovementSystem;
    tradeManager?: TradeManager;
    followerManager?: FollowerManager;
    followerCombatManager?: FollowerCombatManager;
    interfaceService?: InterfaceService;
    sailingInstanceManager?: SailingInstanceManager;
    instancedAreaManager?: InstancedAreaManager;
    doorManager?: DoorStateManager;
    tickOrchestrator?: TickPhaseOrchestrator;

    // ── Action handlers ──────────────────────────────────────────────────
    combatActionHandler?: CombatActionHandler;
    spellActionHandler?: SpellActionHandler;
    inventoryActionHandler?: InventoryActionHandler;
    effectDispatcher?: EffectDispatcher;
    widgetDialogHandler?: WidgetDialogHandler;
    dialogueOverrideStore?: import("@server/game/dialogue/DialogueOverrideStore").DialogueOverrideStore;
    playerDeathService?: PlayerDeathService;

    // ── Network layer ────────────────────────────────────────────────────
    readonly networkLayer: PlayerNetworkLayer;
    readonly authService: AuthenticationService;
    readonly broadcastService: BroadcastService;
    readonly loginHandshakeService: LoginHandshakeService;
    messageRouter?: MessageRouter;

    // ── Broadcasters ─────────────────────────────────────────────────────
    readonly chatBroadcaster: ChatBroadcaster;
    readonly actorSyncBroadcaster: ActorSyncBroadcaster;
    readonly skillBroadcaster: SkillBroadcaster;
    readonly varBroadcaster: VarBroadcaster;
    readonly inventoryBroadcaster: InventoryBroadcaster;
    readonly widgetBroadcaster: WidgetBroadcaster;
    readonly combatBroadcaster: CombatBroadcaster;
    readonly miscBroadcaster: MiscBroadcaster;

    // ── Encoders ─────────────────────────────────────────────────────────
    readonly worldEntityInfoEncoder: WorldEntityInfoEncoder;
    playerPacketEncoder?: PlayerPacketEncoder;
    npcPacketEncoder?: NpcPacketEncoder;

    // ── Network managers ─────────────────────────────────────────────────
    playerAppearanceManager?: PlayerAppearanceManager;
    soundManager?: SoundManager;
    groundItemHandler?: GroundItemHandler;
    cs2ModalManager?: Cs2ModalManager;
    npcSyncManager?: NpcSyncManager;

    // ── Trackers ─────────────────────────────────────────────────────────
    readonly accountSummary: AccountSummaryTracker;
    readonly reportGameTime: ReportGameTimeTracker;

    // ── Animation defaults ───────────────────────────────────────────────
    defaultPlayerAnim: PlayerAnimSet;
    defaultPlayerAnimMale?: PlayerAnimSet;
    defaultPlayerAnimFemale?: PlayerAnimSet;

    // ── State collections (owned by wsServer, exposed for service access) ─
    readonly dynamicLocState: DynamicLocStateStore;
    readonly playerSyncSessions: Map<WebSocket, PlayerSyncSession>;
    readonly npcSyncSessions: Map<WebSocket, NpcSyncSession>;
    readonly playerDynamicLocSceneKeys: Map<number, string>;
    readonly pendingNpcPackets: Map<
        number,
        {
            snapshots: import("@server/network/managers/NpcSyncManager").NpcViewSnapshot[];
            updates: import("@server/network/managers/NpcSyncManager").NpcUpdatePayload[];
            despawns: number[];
        }
    >;
    readonly playerGroundSerial: Map<number, number>;
    readonly playerGroundChunk: Map<number, number>;
    readonly pendingDirectSends: Map<
        WebSocket,
        Array<{ message: string | Uint8Array; context: string }>
    >;
    pendingDebugRequests?: Map<number, WebSocket>;
    readonly wssClients: Set<WebSocket>;
    pendingNpcUpdates: import("@server/game/npc").NpcUpdateDelta[];
    readonly gamemodeTickCallbacks: Array<(tick: number) => void>;
    enableBinaryNpcSync: boolean;

    // ── Coordination methods ─────────────────────────────────────────────
    queueWidgetEvent(playerId: number, action: WidgetAction): void;
    queueCombatState(player: PlayerState): void;
}
