
import { NpcDrawPriority,NpcType } from "@august/osrs-engine/config/npctype/NpcType";
import { ClientState } from "@client/engine/game/ClientState";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function registerNpcSceneTileCandidatesByPriority(host: WebGLOsrsRendererHost, 
        drawPriority: NpcDrawPriority,
        priority: number,
        renderableNpcIds: Set<number>,
    ): void {
        // NPCs do not take part in the normal player-on-player winner
        // selection. A local observer should only suppress a 1x1 NPC that is
        // directly underneath *their own* player; remote observers see both
        // actors. Keep this exported no-op for the existing render call sites.
        void host;
        void drawPriority;
        void priority;
        void renderableNpcIds;
    
}

export function isPlayerSceneTileMarkerCandidate(host: WebGLOsrsRendererHost, pid: number): boolean {

        const pe = host.osrsClient.playerEcs;
        const px = pe.getX(pid) | 0;
        const py = pe.getY(pid) | 0;
        return (px & 127) === 64 && (py & 127) === 64;
    
}

export function isNpcSceneTileMarkerCandidate(host: WebGLOsrsRendererHost, ecsId: number): boolean {

        const npcEcs = host.osrsClient.npcEcs;
        if ((npcEcs.getSize(ecsId) | 0) !== 1) {
            return false;
        }

        const worldX = npcEcs.getWorldX(ecsId) | 0;
        const worldY = npcEcs.getWorldY(ecsId) | 0;
        return (worldX & 127) === 64 && (worldY & 127) === 64;
    
}

export function getEffectiveNpcType(host: WebGLOsrsRendererHost, npcTypeId: number): NpcType | undefined {

        if (npcTypeId < 0) {
            return undefined;
        }

        try {
            const base = host.osrsClient.npcTypeLoader.load(npcTypeId);
            if (!base) {
                return undefined;
            }
            if (!base.transforms) {
                return base;
            }
            return base.transform(host.osrsClient.varManager, host.osrsClient.npcTypeLoader);
        } catch {
            return undefined;
        }
    
}

export function getCombatTargetPlayerEcsIndex(host: WebGLOsrsRendererHost, ): number | undefined {

        const targetServerId = ClientState.combatTargetPlayerIndex | 0;
        if ((targetServerId | 0) < 0) {
            return undefined;
        }

        return host.osrsClient.playerEcs.getIndexForServerId(targetServerId | 0);
    
}

export function shouldRenderPlayerIndex(host: WebGLOsrsRendererHost, pid: number): boolean {

        const renderSelf = host.osrsClient.renderSelf !== false;
        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        const controlledPid =
            controlledServerId >= 0
                ? host.osrsClient.playerEcs.getIndexForServerId(controlledServerId)
                : undefined;
        if (!renderSelf && controlledPid !== undefined && (pid | 0) === (controlledPid | 0)) {
            return false;
        }
        if (host.osrsClient.playerEcs.getIsHidden(pid | 0)) {
            return false;
        }
        if (!host.isPlayerSceneTileMarkerCandidate(pid)) {
            return true;
        }

        host.ensureActorTileSelectionForFrame();
        const pe = host.osrsClient.playerEcs;
        const tileKey = host.getActorTileSelectionKey(
            (pe.getX(pid) >> 7) | 0,
            (pe.getY(pid) >> 7) | 0,
            pe.getLevel(pid) | 0,
        );
        const winner = host.frameWinningActorByTile.get(tileKey);
        return winner?.kind === "player" && (winner.id | 0) === (pid | 0);
    
}

export function shouldRenderNpcOwnershipFromMap(host: WebGLOsrsRendererHost, map: WebGLMapSquare, ecsId: number): boolean {

        const ecs = host.osrsClient.npcEcs;
        if (!ecs.isActive(ecsId) || !ecs.isLinked(ecsId)) return false;

        const worldViewId = ecs.getWorldViewId(ecsId) | 0;
        if (worldViewId >= 0) {
            const worldView = host.osrsClient.worldViewManager.getWorldView(worldViewId);
            if (!worldView) {
                // Private map instances use world-view IDs for server isolation,
                // but they render in the ordinary instance scene rather than a
                // sailing/world-entity overlay map.
                if (!host.instanceActive) return false;
            } else {
                if ((map.id | 0) === (worldView.overlayMapId | 0)) {
                    return true;
                }

                const overlayMap = host.mapManager.mapSquares.get(worldView.overlayMapId) as
                    | WebGLMapSquare
                    | undefined;
                if (overlayMap?.npcEntityIds?.indexOf(ecsId | 0) !== -1) {
                    for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
                        if (host.mapManager.visibleMaps[i] === overlayMap) {
                            return false;
                        }
                    }
                }
            }
        }

        const ownerMapX = ecs.getMapX(ecsId) | 0;
        const ownerMapY = ecs.getMapY(ecsId) | 0;
        if ((ownerMapX | 0) === (map.mapX | 0) && (ownerMapY | 0) === (map.mapY | 0)) {
            return true;
        }

        const ownerMap = host.mapManager.getMap(ownerMapX, ownerMapY) as WebGLMapSquare | undefined;
        if (!ownerMap?.npcEntityIds || ownerMap.npcEntityIds.indexOf(ecsId | 0) === -1) {
            return true;
        }

        for (let i = 0; i < host.mapManager.visibleMapCount; i++) {
            if (host.mapManager.visibleMaps[i] === ownerMap) {
                return false;
            }
        }

        return true;
    
}

export function shouldRenderNpcFromMap(host: WebGLOsrsRendererHost, map: WebGLMapSquare, ecsId: number): boolean {

        if (!host.shouldRenderNpcOwnershipFromMap(map, ecsId)) {
            return false;
        }
        if (!host.getEffectiveNpcType(host.osrsClient.npcEcs.getNpcTypeId(ecsId) | 0)) {
            return false;
        }
        if (!host.isNpcSceneTileMarkerCandidate(ecsId)) {
            return true;
        }

        const npcEcs = host.osrsClient.npcEcs;
        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        const controlledPid =
            controlledServerId >= 0
                ? host.osrsClient.playerEcs.getIndexForServerId(controlledServerId)
                : undefined;
        if (controlledPid === undefined || !host.isPlayerSceneTileMarkerCandidate(controlledPid)) {
            return true;
        }

        const players = host.osrsClient.playerEcs;
        return !(
            (players.getX(controlledPid) >> 7) === (npcEcs.getWorldX(ecsId) >> 7) &&
            (players.getY(controlledPid) >> 7) === (npcEcs.getWorldY(ecsId) >> 7) &&
            (players.getLevel(controlledPid) | 0) === (npcEcs.getLevel(ecsId) | 0)
        );
    
}
