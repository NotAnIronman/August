import {
    INSTANCE_CHUNK_COUNT,
    INSTANCE_SIZE,
    createEmptyTemplateChunks,
    packTemplateChunk,
} from "../../../client/common/instance/InstanceTypes";
import type { ServerServices } from "../game/ServerServices";
import type { NpcSpawnConfig } from "../game/npc";
import type { PlayerState } from "../game/player";
import type { TemporaryLocChange } from "../game/services/LocationService";
import { SailingWorldView } from "../game/sailing/SailingWorldView";

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
    templateChunks: number[][][];
    destination: { x: number; y: number; level: number };
    npcs?: readonly QuestInstanceNpc[];
    locs?: readonly QuestInstanceLoc[];
    exit?: { x: number; y: number; level: number };
    /** Stable content identifier, such as "graardor-room". */
    definitionId?: string;
    /** Solo is the backwards-compatible default. Party instances accept joins. */
    access?: "solo" | "party";
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
    readonly memberPlayerIds: Set<number>;
    readonly memberNames: Map<number, string>;
    readonly npcRuntimeIds: Set<number>;
    readonly locs: TemporaryLocChange[];
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

    constructor(private readonly services: ServerServices) {}

    create(player: PlayerState, spec: QuestInstanceSpec): QuestInstanceHandle | undefined {
        this.dispose(player);
        const mapService = this.services.mapService;
        const pathService = this.services.pathService;
        const npcManager = this.services.npcManager;
        if (!mapService || !pathService || !npcManager) return undefined;

        const worldViewId = this.allocateWorldViewId();
        const baseX = ((Math.trunc(spec.destination.x) >> 3) - 6) * 8;
        const baseY = ((Math.trunc(spec.destination.y) >> 3) - 6) * 8;
        const collisionMaps = mapService.buildInstanceCollision(
            spec.templateChunks,
            0,
            0,
            INSTANCE_SIZE,
            INSTANCE_SIZE,
        );
        if (!collisionMaps) return undefined;

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
            memberPlayerIds: new Set([player.id]),
            memberNames: new Map([[player.id, player.name || `Player ${player.id}`]]),
            npcRuntimeIds: new Set(),
            locs: [],
            started: false,
        };
        this.instancesById.set(runtime.id, runtime);
        this.instanceIdByPlayer.set(player.id, runtime.id);
        player.worldViewId = worldViewId;
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
        player.instanceNpcIds.clear();
        for (const npcId of runtime.npcRuntimeIds) player.instanceNpcIds.add(npcId);
        this.services.movementService.teleportToInstance(
            player,
            runtime.destination.x,
            runtime.destination.y,
            runtime.destination.level,
            runtime.templateChunks,
        );
        return this.toHandle(runtime);
    }

    dispose(
        player: PlayerState,
        destination?: { x: number; y: number; level: number },
    ): boolean {
        const runtime = this.getRuntimeForPlayer(player.id);
        if (!runtime) return false;

        this.services.scriptScheduler.cancelOwner({ kind: "player", id: player.id });
        player.instanceNpcIds.clear();
        player.worldViewId = -1;
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

    private getRuntimeForPlayer(playerId: number): InstanceRuntime | undefined {
        const instanceId = this.instanceIdByPlayer.get(Math.trunc(playerId));
        return instanceId ? this.instancesById.get(instanceId) : undefined;
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
