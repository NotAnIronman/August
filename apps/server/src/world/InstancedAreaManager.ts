import {
    INSTANCE_CHUNK_COUNT,
    INSTANCE_SIZE,
    createEmptyTemplateChunks,
    packTemplateChunk,
} from "@august/game-model/world/instance/InstanceTypes";
import type { ServerServices } from "@server/game/ServerServices";
import { multiCombatSystem } from "@server/game/combat/MultiCombatZones";
import {
    InstanceBossHealthBarLifecycle,
    deriveBossHealthBarMarkers,
    type BossHealthBarSnapshot,
    type InstanceBossHealthBarLifecyclePort,
} from "@server/game/encounters/BossHealthBar";
import type { BossHealthBarMarker } from "@august/protocol/ui/bossHealthBar";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";
import type { EncounterDefinition } from "@server/game/encounters/EncounterTypes";
import type { NpcSpawnConfig, NpcState } from "@server/game/npc";
import type { PlayerState } from "@server/game/player";
import type { InstanceGraveLocation } from "@server/game/state/PlayerInstanceGraveState";
import type { TemporaryLocChange } from "@server/game/services/LocationService";
import { SailingWorldView } from "@server/game/sailing/SailingWorldView";

export interface InstanceAreaCopy {
    sourceBaseX: number;
    sourceBaseY: number;
    widthChunks: number;
    heightChunks: number;
    sourcePlanes?: readonly number[];
    destinationChunkX?: number;
    destinationChunkY?: number;
    rotation?: number;
}

export interface QuestInstanceNpc extends Omit<NpcSpawnConfig, "x" | "y" | "worldViewId" | "ownerPlayerId"> {
    offsetX: number;
    offsetY: number;
}

export interface QuestInstanceLoc {
    id: number;
    offsetX: number;
    offsetY: number;
    level: number;
    shape: number;
    rotation: number;
}

export interface QuestInstanceSpec {
    /** Optional chunk-aligned world origin for rooms not centred on their entry. */
    sceneBase?: { x: number; y: number };
    templateChunks: number[][][];
    destination: { x: number; y: number; level: number };
    npcs?: readonly QuestInstanceNpc[];
    locs?: readonly QuestInstanceLoc[];
    exit?: { x: number; y: number; level: number };
    /** Persistent reclaim point for deaths which occur in this instance. */
    grave?: InstanceGraveLocation;
    /** Stable content identifier, such as "graardor-room". */
    definitionId?: string;
    /** Solo is the backwards-compatible default. Party instances accept joins. */
    access?: "solo" | "party";
    /** Combat rules are independent of whether other players may join. */
    multiCombat?: boolean;
    maxPlayers?: number;
    /** Whether players may join after the encounter has started. */
    joinInProgress?: boolean;
}

export interface QuestInstanceHandle {
    readonly id: string;
    readonly playerId: number;
    readonly ownerPlayerId: number;
    readonly ownerName: string;
    readonly definitionId?: string;
    readonly access: "solo" | "party";
    readonly maxPlayers: number;
    readonly joinInProgress: boolean;
    readonly started: boolean;
    readonly memberPlayerIds: readonly number[];
    readonly worldViewId: number;
    readonly baseX: number;
    readonly baseY: number;
    readonly exit?: { x: number; y: number; level: number };
    readonly grave?: InstanceGraveLocation;
}

interface InstanceRuntime {
    readonly id: string;
    readonly definitionId?: string;
    ownerPlayerId: number;
    ownerName: string;
    readonly access: "solo" | "party";
    readonly maxPlayers: number;
    readonly joinInProgress: boolean;
    readonly worldViewId: number;
    readonly baseX: number;
    readonly baseY: number;
    readonly destination: { x: number; y: number; level: number };
    readonly templateChunks: number[][][];
    readonly exit?: { x: number; y: number; level: number };
    readonly grave?: InstanceGraveLocation;
    readonly memberPlayerIds: Set<number>;
    readonly memberNames: Map<number, string>;
    readonly npcRuntimeIds: Set<number>;
    readonly locs: TemporaryLocChange[];
    bossHealthBar?: {
        readonly definition: EncounterDefinition;
        readonly displayNpcTypeId: number;
        readonly name: string;
        readonly markers: readonly BossHealthBarMarker[];
        lastMaximum: number;
    };
    started: boolean;
}

export function buildInstanceTemplate(copies: readonly InstanceAreaCopy[]): number[][][] {
    const templates = createEmptyTemplateChunks();
    for (const copy of copies) {
        const sourceChunkX = Math.floor(copy.sourceBaseX / 8);
        const sourceChunkY = Math.floor(copy.sourceBaseY / 8);
        const destinationChunkX = Math.trunc(copy.destinationChunkX ?? 6);
        const destinationChunkY = Math.trunc(copy.destinationChunkY ?? 6);
        const planes = copy.sourcePlanes ?? [0, 1, 2, 3];
        for (const plane of planes) {
            const targetPlane = Math.max(0, Math.min(3, Math.trunc(plane)));
            for (let x = 0; x < Math.max(1, Math.trunc(copy.widthChunks)); x++) {
                for (let y = 0; y < Math.max(1, Math.trunc(copy.heightChunks)); y++) {
                    const targetX = destinationChunkX + x;
                    const targetY = destinationChunkY + y;
                    if (
                        targetX < 0 ||
                        targetY < 0 ||
                        targetX >= INSTANCE_CHUNK_COUNT ||
                        targetY >= INSTANCE_CHUNK_COUNT
                    ) {
                        continue;
                    }
                    templates[targetPlane][targetX][targetY] = packTemplateChunk(
                        targetPlane,
                        sourceChunkX + x,
                        sourceChunkY + y,
                        copy.rotation ?? 0,
                    );
                }
            }
        }
    }
    return templates;
}

export class InstancedAreaManager {
    private nextWorldViewId = 4000;
    private nextInstanceId = 1;
    private readonly instancesById = new Map<string, InstanceRuntime>();
    private readonly instanceIdByPlayer = new Map<number, string>();
    private readonly bossHealthBars: InstanceBossHealthBarLifecyclePort;

    constructor(
        private readonly services: ServerServices,
        bossHealthBars?: InstanceBossHealthBarLifecyclePort,
    ) {
        this.bossHealthBars =
            bossHealthBars ??
            new InstanceBossHealthBarLifecycle(
                () => this.services.scriptRuntime?.getServices(),
            );
    }

    create(player: PlayerState, spec: QuestInstanceSpec): QuestInstanceHandle | undefined {
        if (player.raidProgress?.guard("teleport", () => {
            this.services.scriptRuntime.getServices().messaging.sendGameMessage(player,
                "Theatre progress cleared. Select the entrance again to continue.");
        })) return undefined;
        const mapService = this.services.mapService;
        const pathService = this.services.pathService;
        const npcManager = this.services.npcManager;
        if (!mapService || !pathService || !npcManager) return undefined;

        const worldViewId = this.allocateWorldViewId();
        const baseX = spec.sceneBase?.x ?? ((Math.trunc(spec.destination.x) >> 3) - 6) * 8;
        const baseY = spec.sceneBase?.y ?? ((Math.trunc(spec.destination.y) >> 3) - 6) * 8;
        if (!Number.isInteger(baseX) || !Number.isInteger(baseY) || baseX % 8 || baseY % 8 ||
            spec.destination.x < baseX || spec.destination.x >= baseX + INSTANCE_SIZE ||
            spec.destination.y < baseY || spec.destination.y >= baseY + INSTANCE_SIZE) return undefined;
        const collisionMaps = mapService.buildInstanceCollision(
            spec.templateChunks,
            0,
            0,
            INSTANCE_SIZE,
            INSTANCE_SIZE,
        );
        if (!collisionMaps) return undefined;

        this.dispose(player);

        const view = new SailingWorldView(
            worldViewId,
            baseX,
            baseY,
            INSTANCE_SIZE,
            INSTANCE_SIZE,
            collisionMaps,
        );
        pathService.registerWorldViewCollision(worldViewId, view);

        const access = spec.access ?? "solo";
        const requestedMaxPlayers = Math.trunc(spec.maxPlayers ?? 5);
        const maxPlayers =
            access === "solo"
                ? 1
                : Number.isFinite(requestedMaxPlayers)
                  ? Math.max(1, requestedMaxPlayers)
                  : 5;
        const runtime: InstanceRuntime = {
            id: `instance-${this.nextInstanceId++}`,
            definitionId: spec.definitionId,
            ownerPlayerId: player.id,
            ownerName: player.name || `Player ${player.id}`,
            access,
            maxPlayers,
            joinInProgress: spec.joinInProgress ?? true,
            worldViewId,
            baseX,
            baseY,
            destination: { ...spec.destination },
            templateChunks: spec.templateChunks,
            exit: spec.exit,
            grave: spec.grave ? { ...spec.grave, tile: { ...spec.grave.tile } } : undefined,
            memberPlayerIds: new Set([player.id]),
            memberNames: new Map([[player.id, player.name || `Player ${player.id}`]]),
            npcRuntimeIds: new Set(),
            locs: [],
            started: false,
        };
        this.instancesById.set(runtime.id, runtime);
        multiCombatSystem.setPartyWorldView(worldViewId, access === "party" || spec.multiCombat === true);
        this.instanceIdByPlayer.set(player.id, runtime.id);
        player.worldViewId = worldViewId;
        if (player.raidProgress && spec.definitionId?.startsWith("theatre-of-blood:"))
            player.raidProgress.recoveryLocation = spec.exit;
        this.services.movementService.teleportToInstance(
            player,
            spec.destination.x,
            spec.destination.y,
            spec.destination.level,
            spec.templateChunks,
        );

        for (const spawn of spec.npcs ?? []) {
            const npc = npcManager.spawnTransientNpc({
                ...spawn,
                x: baseX + Math.trunc(spawn.offsetX),
                y: baseY + Math.trunc(spawn.offsetY),
                worldViewId,
                ownerPlayerId: access === "solo" ? player.id : undefined,
                // Instanced encounters are deliberate fights, not ambient
                // overworld NPCs. They never become tolerant after ten minutes.
                aggressionToleranceTicks: spawn.aggressionToleranceTicks ?? 2_147_483_647,
            });
            if (npc) {
                runtime.npcRuntimeIds.add(npc.id);
                player.instanceNpcIds.add(npc.id);
                this.captureBossHealthBar(runtime, spawn.id, () => npc.getMaxHitpoints());
            }
        }

        const locs: TemporaryLocChange[] = [];
        for (const loc of spec.locs ?? []) {
            locs.push(
                this.services.locationService.replaceTemporaryLoc(
                    { worldViewId },
                    0,
                    loc.id,
                    { x: baseX + Math.trunc(loc.offsetX), y: baseY + Math.trunc(loc.offsetY) },
                    loc.level,
                    { newShape: loc.shape, newRotation: loc.rotation },
                ),
            );
        }
        runtime.locs.push(...locs);
        runtime.started = access === "solo";
        this.enterBossHealthBar(player, runtime);
        return this.toHandle(runtime);
    }

    get(playerId: number): QuestInstanceHandle | undefined {
        const runtime = this.getRuntimeForPlayer(playerId);
        return runtime ? this.toHandle(runtime) : undefined;
    }

    getById(instanceId: string): QuestInstanceHandle | undefined {
        const runtime = this.instancesById.get(instanceId);
        return runtime ? this.toHandle(runtime) : undefined;
    }

    /** Resolve the current live members for instance-scoped encounter effects. */
    getMemberPlayers(instanceId: string): readonly PlayerState[] {
        const runtime = this.instancesById.get(instanceId);
        if (!runtime) return Object.freeze([]);
        const players = [...runtime.memberPlayerIds]
            .map((playerId) => this.services.players?.getById(playerId))
            .filter((player): player is PlayerState => player !== undefined);
        return Object.freeze(players);
    }

    /**
     * Attaches an NPC spawned after instance creation to that instance's
     * visibility, cleanup, and boss-HUD lifecycle.
     */
    attachNpc(instanceId: string, npc: NpcState): boolean {
        const runtime = this.instancesById.get(instanceId);
        const liveNpc = this.services.npcManager?.getById(npc.id);
        if (!runtime || liveNpc !== npc || npc.worldViewId !== runtime.worldViewId) return false;

        runtime.npcRuntimeIds.add(npc.id);
        for (const player of this.getMemberPlayers(instanceId)) {
            player.instanceNpcIds.add(npc.id);
        }

        const bossHealthBarChanged = this.captureBossHealthBar(
            runtime,
            npc.typeId,
            () => npc.getMaxHitpoints(),
        );
        if (bossHealthBarChanged) {
            for (const player of this.getMemberPlayers(instanceId)) {
                this.enterBossHealthBar(player, runtime);
            }
        }
        return true;
    }

    /** Reattaches an NPC whose stable runtime id has returned from a queued respawn. */
    attachNpcByWorldView(npc: NpcState): boolean {
        const runtime = [...this.instancesById.values()].find(
            (candidate) => candidate.worldViewId === npc.worldViewId,
        );
        return runtime ? this.attachNpc(runtime.id, npc) : false;
    }

    /** Releases a physically removed NPC before its runtime id can be recycled. */
    detachNpc(npcRuntimeId: number): boolean {
        const normalizedId = Math.trunc(npcRuntimeId);
        let detached = false;
        for (const runtime of this.instancesById.values()) {
            if (!runtime.npcRuntimeIds.delete(normalizedId)) continue;
            detached = true;
            for (const player of this.getMemberPlayers(runtime.id)) {
                player.instanceNpcIds.delete(normalizedId);
            }
        }
        return detached;
    }

    listJoinable(definitionId?: string): readonly QuestInstanceHandle[] {
        const matches: QuestInstanceHandle[] = [];
        for (const runtime of this.instancesById.values()) {
            if (runtime.access !== "party") continue;
            if (definitionId !== undefined && runtime.definitionId !== definitionId) continue;
            if (runtime.memberPlayerIds.size >= runtime.maxPlayers) continue;
            if (runtime.started && !runtime.joinInProgress) continue;
            matches.push(this.toHandle(runtime));
        }
        return Object.freeze(matches);
    }

    markStarted(instanceId: string): boolean {
        const runtime = this.instancesById.get(instanceId);
        if (!runtime) return false;
        runtime.started = true;
        return true;
    }

    join(player: PlayerState, instanceId: string): QuestInstanceHandle | undefined {
        if (player.raidProgress?.guard("teleport", () => {
            this.services.scriptRuntime.getServices().messaging.sendGameMessage(player,
                "Theatre progress cleared. Select the party again to continue.");
        })) return undefined;
        const runtime = this.instancesById.get(instanceId);
        if (!runtime || runtime.access !== "party") return undefined;
        if (runtime.memberPlayerIds.size >= runtime.maxPlayers) return undefined;
        if (runtime.started && !runtime.joinInProgress) return undefined;

        const current = this.getRuntimeForPlayer(player.id);
        if (current?.id === runtime.id) return this.toHandle(runtime);
        if (current) this.dispose(player);

        runtime.memberPlayerIds.add(player.id);
        runtime.memberNames.set(player.id, player.name || `Player ${player.id}`);
        this.instanceIdByPlayer.set(player.id, runtime.id);
        player.worldViewId = runtime.worldViewId;
        if (player.raidProgress && runtime.definitionId?.startsWith("theatre-of-blood:"))
            player.raidProgress.recoveryLocation = runtime.exit;
        player.instanceNpcIds.clear();
        for (const npcId of runtime.npcRuntimeIds) player.instanceNpcIds.add(npcId);
        this.services.movementService.teleportToInstance(
            player,
            runtime.destination.x,
            runtime.destination.y,
            runtime.destination.level,
            runtime.templateChunks,
        );
        this.enterBossHealthBar(player, runtime);
        return this.toHandle(runtime);
    }

    dispose(
        player: PlayerState,
        destination?: { x: number; y: number; level: number },
    ): boolean {
        const runtime = this.getRuntimeForPlayer(player.id);
        if (!runtime) return false;

        if (player.raidProgress?.guard("leave", () => this.dispose(player,destination))) return false;

        this.bossHealthBars.leave(player);
        this.services.scriptScheduler.cancelOwner({ kind: "player", id: player.id });
        player.instanceNpcIds.clear();
        player.worldViewId = -1;
        if (player.raidProgress) player.raidProgress.recoveryLocation = undefined;
        runtime.memberPlayerIds.delete(player.id);
        runtime.memberNames.delete(player.id);
        this.instanceIdByPlayer.delete(player.id);

        if (runtime.ownerPlayerId === player.id && runtime.memberPlayerIds.size > 0) {
            runtime.ownerPlayerId = runtime.memberPlayerIds.values().next().value as number;
            runtime.ownerName =
                runtime.memberNames.get(runtime.ownerPlayerId) ??
                `Player ${runtime.ownerPlayerId}`;
        }

        if (runtime.memberPlayerIds.size === 0) this.destroyRuntime(runtime);

        const exit = destination ?? runtime.exit;
        if (exit) {
            this.services.movementService.teleportPlayer(
                player,
                exit.x,
                exit.y,
                exit.level,
                true,
            );
        }
        return true;
    }

    leave(
        player: PlayerState,
        destination?: { x: number; y: number; level: number },
    ): boolean {
        return this.dispose(player, destination);
    }

    /** Sends a changed authoritative boss-HUD snapshot to every member. */
    syncBossHealthBars(): void {
        this.bossHealthBars.sync();
    }

    private getRuntimeForPlayer(playerId: number): InstanceRuntime | undefined {
        const instanceId = this.instanceIdByPlayer.get(Math.trunc(playerId));
        return instanceId ? this.instancesById.get(instanceId) : undefined;
    }

    private captureBossHealthBar(
        runtime: InstanceRuntime,
        npcTypeId: number,
        getMaximum: () => number,
    ): boolean {
        const definition = EncounterRegistry.shared.findByNpcTypeId(npcTypeId);
        const metadata = definition?.bossHealthBar;
        if (!definition || !metadata) return false;
        const maximum = Math.max(1, Math.trunc(getMaximum() || definition.maxHealth || 1));
        const current = runtime.bossHealthBar;
        if (current?.definition === definition) return false;
        if (current) {
            const currentBossIsLive = [...runtime.npcRuntimeIds].some((npcId) => {
                const npc = this.services.npcManager?.getById(npcId);
                return npc !== undefined &&
                    npc.getHitpoints() > 0 &&
                    current.definition.npcTypeIds.includes(npc.typeId);
            });
            if (currentBossIsLive) return false;
        }
        runtime.bossHealthBar = {
            definition,
            displayNpcTypeId: metadata.npcTypeId ?? definition.npcTypeIds[0] ?? npcTypeId,
            name: metadata.name,
            markers: deriveBossHealthBarMarkers(definition),
            lastMaximum: maximum,
        };
        return true;
    }

    private enterBossHealthBar(player: PlayerState, runtime: InstanceRuntime): void {
        if (!runtime.bossHealthBar) return;
        this.bossHealthBars.enter(player, () => this.resolveBossHealthBarSnapshot(runtime));
    }

    private resolveBossHealthBarSnapshot(
        runtime: InstanceRuntime,
    ): BossHealthBarSnapshot | undefined {
        const healthBar = runtime.bossHealthBar;
        if (!healthBar) return undefined;
        const matchingBosses = [...runtime.npcRuntimeIds]
            .map((npcId) => this.services.npcManager?.getById(npcId))
            .filter(
                (npc): npc is NpcState =>
                    npc !== undefined &&
                    healthBar.definition.npcTypeIds.includes(npc.typeId),
            );
        const boss = matchingBosses.find((npc) => npc.getHitpoints() > 0) ?? matchingBosses[0];
        // Simultaneously spawned bosses (e.g. Dusk and Dawn) are already
        // attached when the first boss dies. There is no later attach event
        // to switch the HUD, unlike sequential Theatre rooms.
        if (!boss || boss.getHitpoints() <= 0) {
            for (const npcId of runtime.npcRuntimeIds) {
                const next = this.services.npcManager?.getById(npcId);
                if (!next || next.getHitpoints() <= 0) continue;
                if (this.captureBossHealthBar(runtime, next.typeId, () => next.getMaxHitpoints())) {
                    return this.resolveBossHealthBarSnapshot(runtime);
                }
            }
        }
        if (boss) {
            healthBar.lastMaximum = Math.max(1, boss.getMaxHitpoints());
        }
        return {
            npcTypeId: healthBar.displayNpcTypeId,
            name: healthBar.name,
            current: Math.max(0, boss?.getHitpoints() ?? 0),
            maximum: healthBar.lastMaximum,
            markers: healthBar.markers,
        };
    }

    private toHandle(runtime: InstanceRuntime): QuestInstanceHandle {
        return Object.freeze({
            id: runtime.id,
            playerId: runtime.ownerPlayerId,
            ownerPlayerId: runtime.ownerPlayerId,
            ownerName: runtime.ownerName,
            definitionId: runtime.definitionId,
            access: runtime.access,
            maxPlayers: runtime.maxPlayers,
            joinInProgress: runtime.joinInProgress,
            started: runtime.started,
            memberPlayerIds: Object.freeze([...runtime.memberPlayerIds]),
            worldViewId: runtime.worldViewId,
            baseX: runtime.baseX,
            baseY: runtime.baseY,
            exit: runtime.exit,
            grave: runtime.grave ? { ...runtime.grave, tile: { ...runtime.grave.tile } } : undefined,
        });
    }

    private destroyRuntime(runtime: InstanceRuntime): void {
        for (const loc of runtime.locs) {
            this.services.locationService.clearTemporaryLoc(
                loc.scope,
                loc.oldId,
                loc.tile,
                loc.level,
                loc.oldShape,
            );
        }
        this.services.scriptScheduler.cancelOwner({ kind: "instance", id: runtime.id });
        for (const npcId of runtime.npcRuntimeIds) this.services.npcManager?.removeNpc(npcId);
        this.services.groundItems.removeByWorldView(runtime.worldViewId);
        this.services.pathService?.removeWorldViewCollision(runtime.worldViewId);
        multiCombatSystem.setPartyWorldView(runtime.worldViewId, false);
        this.instancesById.delete(runtime.id);
    }

    private allocateWorldViewId(): number {
        for (let attempts = 0; attempts < 60_000; attempts++) {
            const candidate = this.nextWorldViewId++;
            if (this.nextWorldViewId > 65_000) this.nextWorldViewId = 4000;
            if ([...this.instancesById.values()].some((runtime) => runtime.worldViewId === candidate)) {
                continue;
            }
            return candidate;
        }
        throw new Error("Quest instance world-view id space exhausted");
    }
}
