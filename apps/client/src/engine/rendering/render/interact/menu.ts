import { clientDebugLog } from "@client/core/diagnostics/clientDiagnostics";

import { MenuTargetType,OsrsMenuEntry } from "@august/osrs-engine/MenuEntry";
import { getMapIndexFromTile } from "@august/osrs-engine/map/MapFileIndex";
import { ClientState } from "@client/engine/game/ClientState";
import { resolveWorldTileMap } from "@client/engine/game/scene/WorldTileMap";
import type { GroundItemOverlayEntry } from "@client/engine/game/data/ground/GroundItemStore";
import {
    resolveCollisionSamplePlaneForLocal,
    resolveCollisionSamplePlaneForWorldTile,
    resolveHeightSamplePlaneForLocal,
    resolveInteractionPlaneForLocal,
    resolveInteractionPlaneForWorldTile
} from "@client/engine/game/scene/PlaneResolver";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";
import { worldEntriesToSimple } from "@client/ui/runtime/menu/MenuBridge";
import type { MenuClickContext,SimpleMenuEntry } from "@client/ui/runtime/menu/MenuEngine";

export function performWorldEntryAction(host: WebGLOsrsRendererHost, 
        e: OsrsMenuEntry,
        orig: ((entry?: any, evt?: MouseEvent, ctx?: unknown) => void) | undefined,
        evt?: MouseEvent,
        tileForMenu?: { tileX: number; tileY: number; plane?: number },
        menuCtx?: MenuClickContext,
    ): void {

        const approxTile = host.osrsClient.menuTile ?? tileForMenu;
        const isLocEntry = e.targetType === MenuTargetType.LOC && typeof e.targetId === "number";
        const resolvedLocTile =
            approxTile && isLocEntry
                ? host.resolveLocInteractionTile((e.targetId as number) | 0, approxTile)
                : undefined;
        const effectiveTile = resolvedLocTile ?? approxTile;
        const shouldSkipClientWalk =
            isLocEntry && effectiveTile
                ? host.isLocalPlayerAdjacentToLoc((e.targetId as number) | 0, effectiveTile)
                : false;
        const optionLower = String(e.option || "").toLowerCase();
        const isWalk = optionLower === "walk here";
        host.onInteractHighlightEntryInvoked(
            {
                option: e.option,
                targetType: e.targetType,
                targetId: typeof e.targetId === "number" ? e.targetId | 0 : undefined,
                mapX: typeof e.mapX === "number" ? e.mapX | 0 : undefined,
                mapY: typeof e.mapY === "number" ? e.mapY | 0 : undefined,
            },
            effectiveTile,
        );
        try {
            const xy = host.toGLClickXY(evt);
            // Red cross for targeted actions; Yellow for walk
            host.spawnClickCross(effectiveTile as any, xy, isWalk ? "yellow" : "red");
        } catch {}

        const spellMeta = e.spellCast;
        clientDebugLog("[menu] Entry clicked:", {
            option: e.option,
            targetType: e.targetType,
            spellMeta,
            entry: e,
        });
        if (spellMeta) {
            try {
                const ctx: {
                    tile?: { tileX: number; tileY: number; plane?: number };
                    mapX?: number;
                    mapY?: number;
                    npcServerId?: number;
                    playerServerId?: number;
                } = { tile: effectiveTile };
                const metaMapX =
                    typeof spellMeta.mapX === "number"
                        ? spellMeta.mapX
                        : typeof e.mapX === "number"
                            ? e.mapX
                            : undefined;
                const metaMapY =
                    typeof spellMeta.mapY === "number"
                        ? spellMeta.mapY
                        : typeof e.mapY === "number"
                            ? e.mapY
                            : undefined;
                if (typeof metaMapX === "number") ctx.mapX = metaMapX;
                if (typeof metaMapY === "number") ctx.mapY = metaMapY;
                if (typeof spellMeta.npcServerId === "number")
                    ctx.npcServerId = spellMeta.npcServerId | 0;
                if (typeof spellMeta.playerServerId === "number")
                    ctx.playerServerId = spellMeta.playerServerId | 0;
                clientDebugLog("[menu] Calling castSpellFromMenu with ctx:", ctx);
                host.osrsClient.castSpellFromMenu(e, ctx);
            } catch (err) {
                console.warn?.("[menu] failed to cast spell", err);
            }
            return;
        }

        // Facing is server-authoritative via the face direction update mask.
        // Invoke original handler
        if (!menuCtx?.worldMenuStateDispatch) {
            try {
                orig?.(e as any, evt, menuCtx);
            } catch {}
        }
    
}

export function buildSimpleMenuEntries(host: WebGLOsrsRendererHost, 
        entries: OsrsMenuEntry[],
        opts: {
            shouldFreeze: boolean;
            toCssEvent: (gx?: number, gy?: number) => any;
        },
    ): SimpleMenuEntry[] {

        const client = host.osrsClient;
        if (
            opts.shouldFreeze &&
            client.menuFrozenSimpleEntries &&
            client.menuFrozenSimpleEntriesVersion === client.menuPinnedEntriesVersion
        ) {
            client.menuActiveSimpleEntries = client.menuFrozenSimpleEntries;
            return client.menuFrozenSimpleEntries;
        }
        const menuState = client.menuState;
        menuState.reset();
        const simple = worldEntriesToSimple(entries, {
            label: {
                includeExamineIds: !!host.osrsClient.debugId,
                localPlayerCombatLevel: ClientState.localPlayerCombatLevel | 0,
            },
            toCssEvent: opts.toCssEvent,
            menuState,
            registerWithState: true,
            resetMenuState: false,
            transformEntries: entries => client.menuEntrySwapperPlugin.apply(
                entries, client.inputManager.shiftDown === true,
                client.menuOpen || client.inputManager.pickX !== -1,
                client.inputManager.shiftDown === true || client.inputManager.controlDown === true,
            ),
        });
        client.menuActiveSimpleEntries = simple;
        if (opts.shouldFreeze) {
            client.menuFrozenSimpleEntries = simple;
            client.menuFrozenSimpleEntriesVersion = client.menuPinnedEntriesVersion;
        } else {
            client.menuFrozenSimpleEntries = undefined;
            client.menuFrozenSimpleEntriesVersion = 0;
        }
        return simple;
    
}

export function getApproxTileHeight(host: WebGLOsrsRendererHost, worldX: number, worldY: number, basePlane?: number): number {

        const resolvedBasePlane =
            basePlane ??
            (() => {
                const idx = host.osrsClient.playerEcs.getIndexForServerId(
                    host.osrsClient.controlledPlayerServerId,
                );
                return idx !== undefined ? host.osrsClient.playerEcs.getLevel(idx) : 0;
            })();

        const tileX = Math.floor(worldX);
        const tileY = Math.floor(worldY);
        const plane = host.getEffectivePlaneForTile(tileX, tileY, resolvedBasePlane);
        return host.sampleHeightAtExactPlane(worldX, worldY, plane);
    
}

export function getTileHeightAtPlane(host: WebGLOsrsRendererHost, worldX: number, worldY: number, plane: number): number {

        return host.sampleHeightAtExactPlane(worldX, worldY, plane);
    
}

export function getBridgedTileHeight(host: WebGLOsrsRendererHost, worldX: number, worldY: number, plane: number): number {

        const tileX = Math.floor(worldX);
        const tileY = Math.floor(worldY);
        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        const samplePlane =
            map && local ? resolveHeightSamplePlaneForLocal(map, plane, local.x, local.y) : plane;
        return host.sampleHeightAtExactPlane(worldX, worldY, samplePlane);
    
}

export function getMinTileHeightInRadius(host: WebGLOsrsRendererHost, 
        worldX: number,
        worldZ: number,
        plane: number,
        radius: number,
    ): number {

        if ((radius | 0) === 0) {
            return host.getBridgedTileHeight(worldX, worldZ, plane);
        }
        const fineX = Math.round(worldX * 128) | 0;
        const fineZ = Math.round(worldZ * 128) | 0;
        const half = (radius / 2) | 0;
        const minTileX = ((fineX - half) >> 7) + 1;
        const minTileZ = ((fineZ - half) >> 7) + 1;
        const maxTileX = (fineX + half) >> 7;
        const maxTileZ = (fineZ + half) >> 7;
        let min = Infinity;
        for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
            for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ++) {
                min = Math.min(min, host.getBridgedTileHeight(tileX, tileZ, plane));
            }
        }
        min = Math.min(min, host.getBridgedTileHeight(worldX, worldZ, plane));
        min = Math.min(
            min,
            host.getBridgedTileHeight((fineX - half) / 128, (fineZ - half) / 128, plane),
        );
        min = Math.min(
            min,
            host.getBridgedTileHeight((fineX - half) / 128, (fineZ + half) / 128, plane),
        );
        min = Math.min(
            min,
            host.getBridgedTileHeight((fineX + half) / 128, (fineZ - half) / 128, plane),
        );
        return Math.min(
            min,
            host.getBridgedTileHeight((fineX + half) / 128, (fineZ + half) / 128, plane),
        );
    
}

export function getNpcFootprintRadius(host: WebGLOsrsRendererHost, npcTypeId: number | undefined): number {

        if (npcTypeId == null || npcTypeId < 0) return 0;
        try {
            const npcType = host.osrsClient.npcTypeLoader?.load?.(npcTypeId | 0);
            return npcType ? npcType.footprintSize | 0 : 0;
        } catch {
            return 0;
        }
    
}

export function getPreferredMapForWorldTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number): WebGLMapSquare | undefined {

        const preferredWorldViewId = host.getControlledPlayerWorldViewId();
        if (preferredWorldViewId >= 0) {
            const preferredView =
                host.osrsClient.worldViewManager.getWorldView(preferredWorldViewId);
            if (preferredView?.containsTile(tileX | 0, tileY | 0)) {
                const overlayMap = host.osrsClient.worldViewManager.getOverlayMapSquare(
                    preferredWorldViewId,
                    host.mapManager,
                );
                if (overlayMap) {
                    return overlayMap;
                }
            }
        }
        return resolveWorldTileMap(host.mapManager, tileX, tileY);
    
}

export function getMapLocalTile(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        tileX: number,
        tileY: number,
    ): { x: number; y: number } | undefined {

        const mapTileSpan = map.getLocalTileSpan();
        const localX = (tileX | 0) - map.getRenderBaseTileX();
        const localY = (tileY | 0) - map.getRenderBaseTileY();
        if (localX < 0 || localY < 0 || localX >= mapTileSpan || localY >= mapTileSpan) {
            return undefined;
        }
        return { x: localX | 0, y: localY | 0 };
    
}

export function getGroundItemLayerHeightTiles(host: WebGLOsrsRendererHost, tileX: number, tileY: number, level: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (!map) return 0;
        const local = host.getMapLocalTile(map, tileX, tileY);
        if (!local) return 0;
        return Math.max(0, map.getItemLayerHeightAtLocal(level | 0, local.x, local.y)) / 128;
    
}

export function withGroundItemOverlayHeights(host: WebGLOsrsRendererHost, 
        entries: GroundItemOverlayEntry[],
    ): GroundItemOverlayEntry[] {

        if (entries.length === 0) return entries;
        let output: GroundItemOverlayEntry[] | undefined;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const heightOffsetTiles = host.getGroundItemLayerHeightTiles(
                entry.tileX | 0,
                entry.tileY | 0,
                entry.level | 0,
            );
            if (heightOffsetTiles <= 0) {
                if (output) output.push(entry);
                continue;
            }
            if (!output) {
                output = entries.slice(0, i);
            }
            output.push({ ...entry, heightOffsetTiles });
        }
        return output ?? entries;
    
}

export function getEffectivePlaneForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (map && map.interactionPlane >= 0) return map.interactionPlane;
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        if (!map || !local) {
            return resolveInteractionPlaneForWorldTile(host.mapManager, basePlane, tileX, tileY);
        }
        return resolveInteractionPlaneForLocal(map, basePlane, local.x, local.y);
    
}

export function getHeightSamplePlaneForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        if (map && map.interactionPlane >= 0) return map.interactionPlane;
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        if (!map || !local) {
            return basePlane | 0;
        }
        return resolveHeightSamplePlaneForLocal(map, basePlane, local.x, local.y);
    
}

export function getOccupancyPlaneForTile(host: WebGLOsrsRendererHost, tileX: number, tileY: number, basePlane: number): number {

        const map = host.getPreferredMapForWorldTile(tileX, tileY);
        const local = map ? host.getMapLocalTile(map, tileX, tileY) : undefined;
        if (!map || !local) {
            return resolveCollisionSamplePlaneForWorldTile(
                host.mapManager,
                basePlane,
                tileX,
                tileY,
            );
        }
        return resolveCollisionSamplePlaneForLocal(map, basePlane, local.x, local.y);
    
}
