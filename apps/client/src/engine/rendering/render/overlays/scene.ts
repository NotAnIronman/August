
import { ClientState } from "@client/engine/game/ClientState";
import {
    getTileRenderFlagAt as lookupTileRenderFlagAt
} from "@client/engine/game/scene/TileRenderFlags";
import type { WebGLOsrsRenderer } from "@client/engine/rendering/WebGLOsrsRenderer";
import {
    RenderPhase,
    type OverlayUpdateArgs
} from "@client/engine/rendering/overlays/Overlay";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import type { TileMarkersPluginConfig } from "@client/features/plugins/tilemarkers/types";

export function ensureOverlayUpdateArgs(host: WebGLOsrsRendererHost, scenePass: boolean): OverlayUpdateArgs {

        const key = scenePass ? "cachedSceneOverlayUpdateArgs" : "cachedOverlayUpdateArgs";
        let args = host[key];
        if (!args) {
            args = {
                time: 0,
                delta: 0,
                resolution: { width: 0, height: 0 },
                state: {
                    hoverEnabled: false,
                    hoverTile: { x: 0, y: 0 },
                    playerLevel: 0,
                    playerRawLevel: 0,
                    destTile: undefined,
                    currentTile: undefined,
                    tileHighlights: undefined,
                    clientTickPhase: 0,
                    playerWorldX: undefined,
                    playerWorldZ: undefined,
                    actorServerTiles: undefined,
                },
                helpers: host.getOverlayHelpers(),
            };
            host[key] = args;
        }
        return args;
    
}

export function syncTileMarkerOverlayConfig(host: WebGLOsrsRendererHost, tileMarkersConfig: TileMarkersPluginConfig): void {

        if (!host.tileMarkerOverlay) {
            return;
        }
        host.tileMarkerOverlay.setDestinationColor(tileMarkersConfig.destinationTileColor);
        host.tileMarkerOverlay.setCurrentTileColor(tileMarkersConfig.currentTileColor);
    
}

export function populateTileMarkerOverlayState(host: WebGLOsrsRendererHost, 
        state: OverlayUpdateArgs["state"],
        tileMarkersConfig: TileMarkersPluginConfig,
        playerLevel: number,
        playerRawLevel: number,
    ): void {
        state.hoverEnabled = !!host.osrsClient.hoverOverlayEnabled;
        if (host.hoverTileX !== -1 && host.hoverTileY !== -1) {
            if (!state.hoverTile) {
                state.hoverTile = { x: 0, y: 0 };
            }
            state.hoverTile.x = host.hoverTileX | 0;
            state.hoverTile.y = host.hoverTileY | 0;
            const picked = host.osrsClient.hoveredTile;
            state.hoverTile.plane =
                picked &&
                (picked.tileX | 0) === state.hoverTile.x &&
                (picked.tileY | 0) === state.hoverTile.y
                    ? picked.plane
                    : undefined;
        } else {
            state.hoverTile = undefined;
        }

        state.playerLevel = playerLevel;
        state.playerRawLevel = playerRawLevel;
        state.destTile = undefined;
        state.currentTile = undefined;

        const destWorldX = ClientState.destinationWorldX | 0;
        const destWorldY = ClientState.destinationWorldY | 0;
        let activeDestX = destWorldX;
        let activeDestY = destWorldY;
        if (activeDestX === 0 && activeDestY === 0) {
            const destLocalX = ClientState.destinationX | 0;
            const destLocalY = ClientState.destinationY | 0;
            if (destLocalX !== 0 || destLocalY !== 0) {
                activeDestX = ClientState.localToWorldX(destLocalX) | 0;
                activeDestY = ClientState.localToWorldY(destLocalY) | 0;
            }
        }
        const hasActiveDestination = activeDestX !== 0 || activeDestY !== 0;
        const nativeTileHighlights = host.osrsClient.tileHighlightManager.getRenderEntries();
        const shouldOwnDestinationTile =
            tileMarkersConfig.enabled &&
            tileMarkersConfig.showDestinationTile &&
            hasActiveDestination;
        const destinationColor = tileMarkersConfig.destinationTileColor & 0xffffff;
        const defaultNativeDestinationColor = 0xa9a753;
        const visibleTileHighlights = shouldOwnDestinationTile
            ? nativeTileHighlights.filter((highlight) => {
                if ((highlight.slot | 0) === 4) {
                    return false;
                }
                const color = highlight.colorRgb & 0xffffff;
                return color !== destinationColor && color !== defaultNativeDestinationColor;
            })
            : nativeTileHighlights;
        state.tileHighlights = visibleTileHighlights.length > 0 ? visibleTileHighlights : undefined;

        if (!tileMarkersConfig.enabled) {
            return;
        }

        const nativeHasCurrentTile = visibleTileHighlights.some(
            (highlight) => (highlight.slot | 0) === 3,
        );
        if (tileMarkersConfig.showDestinationTile && hasActiveDestination) {
            if (!state.destTile) {
                state.destTile = { x: 0, y: 0 };
            }
            state.destTile.x = activeDestX;
            state.destTile.y = activeDestY;
        }

        if (!tileMarkersConfig.showCurrentTile || nativeHasCurrentTile) {
            return;
        }

        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        if (controlledServerId <= 0) {
            return;
        }

        const movementState = host.osrsClient.playerMovementSync?.getState?.(controlledServerId);
        if (!movementState) {
            return;
        }

        const ecsIndex = movementState.ecsIndex | 0;
        const isMoving = ecsIndex >= 0 && host.osrsClient.playerEcs.isMoving(ecsIndex);
        if (!isMoving) {
            return;
        }

        if (!state.currentTile) {
            state.currentTile = { x: 0, y: 0, plane: 0 };
        }
        state.currentTile.x = movementState.tileX | 0;
        state.currentTile.y = movementState.tileY | 0;
        state.currentTile.plane = host.getHeightSamplePlaneForTile(
            movementState.tileX | 0,
            movementState.tileY | 0,
            host.getPlayerRawPlane() | 0,
        );
    }

export function drawSceneTileOverlays(host: WebGLOsrsRendererHost, time: number, deltaTime: number): void {

        if (host.uiHidden || !host.overlayManager || !host.tileMarkerOverlay) {
            return;
        }

        const tileMarkersConfig = host.osrsClient.tileMarkersPlugin.getConfig();
        host.syncTileMarkerOverlayConfig(tileMarkersConfig);

        const playerLevel = host.getPlayerBasePlane() | 0;
        const playerRawLevel = host.getPlayerRawPlane() | 0;
        const args = host.ensureOverlayUpdateArgs(true);
        args.time = time;
        args.delta = deltaTime;
        args.resolution.width = host.app.width;
        args.resolution.height = host.app.height;
        host.populateTileMarkerOverlayState(
            args.state,
            tileMarkersConfig,
            playerLevel,
            playerRawLevel,
        );
        args.state.clientTickPhase = host.clientTickPhase;
        args.state.playerWorldX = undefined;
        args.state.playerWorldZ = undefined;
        args.state.actorServerTiles = undefined;
        args.state.hitsplats = undefined;
        args.state.healthBars = undefined;
        args.state.overheadTexts = undefined;
        args.state.overheadPrayers = undefined;
        args.state.groundItems = undefined;
        host.overlayManager.update(args);
        host.overlayManager.draw(RenderPhase.ToSceneFramebuffer);
    
}

export function getOverlayHelpers(host: WebGLOsrsRendererHost, ): NonNullable<WebGLOsrsRenderer["cachedOverlayHelpers"]> {

        if (!host.cachedOverlayHelpers) {
            host.cachedOverlayHelpers = {
                getTileHeightAtPlane: host.getTileHeightAtPlane.bind(host),
                getMinTileHeightInRadius: host.getMinTileHeightInRadius.bind(host),
                sampleHeightAtExactPlane: host.sampleHeightAtExactPlane.bind(host),
                getHeightSamplePlaneForTile: host.getHeightSamplePlaneForTile.bind(host),
                getEffectivePlaneForTile: host.getEffectivePlaneForTile.bind(host),
                getOccupancyPlaneForTile: host.getOccupancyPlaneForTile.bind(host),
                getTileRenderFlagAt: host.getTileRenderFlagAt.bind(host),
                isBridgeSurfaceTile: host.isBridgeSurfaceTile.bind(host),
                worldToScreen: host.worldToScreen.bind(host),
                getCollisionFlagAt: host.getCollisionFlagAt.bind(host),
            };
        }
        return host.cachedOverlayHelpers;
    
}

export function getTileRenderFlagAt(host: WebGLOsrsRendererHost, level: number, tileX: number, tileY: number): number {

        return lookupTileRenderFlagAt(host.mapManager, level, tileX, tileY);
    
}
