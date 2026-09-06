
import type { ClientGroundItemStack } from "@client/engine/game/data/ground/GroundItemStore";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import { getGroundItemMapId } from "@client/engine/rendering/ground/GroundItemMapKey";
import { buildGroundItemGeometry } from "@client/engine/rendering/ground/GroundItemMeshBuilder";
import { RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function updateGroundItemMeshes(host: WebGLOsrsRendererHost, stacks: ClientGroundItemStack[]): boolean {

        let modelsPending = false;
        const grouped = new Map<number, ClientGroundItemStack[]>();
        for (const stack of stacks) {
            const tileX = stack.tile.x | 0;
            const tileY = stack.tile.y | 0;

            // Check if this ground item falls within a WorldView overlay
            let mapId: number;
            const preferredMap = host.getPreferredMapForWorldTile(tileX, tileY);
            const wv = host.osrsClient.worldViewManager.findWorldViewAt(tileX, tileY);
            if (preferredMap) {
                // Private instances use a chunk-aligned 104-tile mesh, not the
                // drop's ordinary 64-tile map square and its terrain heights.
                mapId = (preferredMap.mapX << 8) + preferredMap.mapY;
            } else if (wv && !wv.isTopLevel()) {
                mapId = wv.overlayMapId;
            } else {
                const mapX = tileX >> 6;
                const mapY = tileY >> 6;
                if (mapX < 0 || mapY < 0) continue;
                mapId = getGroundItemMapId(tileX, tileY);
            }

            const clone: ClientGroundItemStack = {
                ...stack,
                itemId: stack.itemId | 0,
                quantity: Math.max(1, stack.quantity | 0),
                tile: { x: tileX, y: tileY, level: stack.tile.level | 0 },
            };
            const list = grouped.get(mapId);
            if (list) list.push(clone);
            else grouped.set(mapId, [clone]);
        }

        const allKeys = new Set<number>([...host.groundItemStacks.keys(), ...grouped.keys()]);
        for (const key of allKeys) {
            const next = grouped.get(key) ?? [];
            const hashNext = next.length > 0 ? host.hashGroundStacks(next) : "";
            const prevHash = host.groundItemStackHashes.get(key) ?? "";
            if (hashNext !== prevHash) {
                if (next.length > 0) {
                    host.groundItemStacks.set(key, next);
                    host.groundItemStackHashes.set(key, hashNext);
                } else {
                    host.groundItemStacks.delete(key);
                    host.groundItemStackHashes.delete(key);
                }

                // Preserve overlay IDs instead of masking off their high bits.
                const map = host.mapManager.mapSquares.get(key) as WebGLMapSquare | undefined;
                if (map) {
                    if (host.rebuildGroundItemsForMap(map, next)) {
                        // Sparse JS5 models arrive later; leave this map dirty so the next server tick retries it.
                        host.groundItemStackHashes.delete(key);
                        modelsPending = true;
                    }
                }
            }
        }
        return modelsPending;
}

export function hashGroundStacks(host: WebGLOsrsRendererHost, stacks: ClientGroundItemStack[]): string {

        return stacks
            .slice()
            .sort(
                (a, b) =>
                    a.tile.x - b.tile.x ||
                    a.tile.y - b.tile.y ||
                    a.tile.level - b.tile.level ||
                    a.itemId - b.itemId ||
                    a.quantity - b.quantity ||
                    (a.id | 0) - (b.id | 0),
            )
            .map(
                (stack) =>
                    `${stack.tile.x},${stack.tile.y},${stack.tile.level},${stack.itemId},${stack.quantity},${stack.id}`,
            )
            .join("|");
    
}

export function rebuildGroundItemsForMap(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        stacks: ClientGroundItemStack[] | undefined,
    ): boolean {

        const hasStacks = !!stacks?.length;
        if (!host.mainProgram || !host.mainAlphaProgram) return hasStacks;
        if (
            !host.textureArray ||
            !host.textureMaterials ||
            !host.waterTextures ||
            !host.sceneUniformBuffer
        )
            return hasStacks;
        const objModelLoader = host.osrsClient.objModelLoader;
        const textureLoader = host.osrsClient.textureLoader;
        if (!objModelLoader || !textureLoader) return hasStacks;

        const missesBefore = objModelLoader.modelLoader?.missCount ?? 0;
        const data = buildGroundItemGeometry(
            map,
            stacks && stacks.length > 0 ? stacks : undefined,
            objModelLoader,
            textureLoader,
            host.textureIdIndexMap,
        );

        if (!data) {
            map.clearGroundItemGeometry();
            return (objModelLoader.modelLoader?.missCount ?? 0) > missesBefore;
        }

        const textureUpdates = new Map<number, Int32Array>();
        for (const texId of data.usedTextureIds) {
            if (host.loadedTextureIds.has(texId)) continue;
            try {
                const pixels = textureLoader.getPixelsArgb(texId, RENDER_CONSTANTS.TEXTURE_SIZE, true, 1.0);
                textureUpdates.set(texId, pixels);
                host.loadedTextureIds.add(texId);
            } catch (err) {
                console.warn("[ground] failed to load texture", texId, err);
            }
        }
        if (textureUpdates.size > 0) {
            host.updateTextureArray(textureUpdates);
        }

        map.updateGroundItemGeometry(
            host.app,
            host.mainProgram,
            host.mainAlphaProgram,
            host.textureArray,
            host.textureMaterials,
            host.waterTextures,
            host.sceneUniformBuffer,
            data,
        );
        return false;
    
}
