import {
    Texture
} from "picogl";

import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function renderTransparentPlayerPass(host: WebGLOsrsRendererHost, 
        playerDataTextureIndex: number,
        playerDataTexture: Texture | undefined,
    ): void {

        const cullTile = host.getRenderCullTile();
        const renderDistanceTiles = Math.max(0, host.getFrameRenderDistanceTiles() | 0);
        const renderDistancePadTiles = 0;
        host.playerRenderer.renderTransparentPlayerPass(playerDataTextureIndex, playerDataTexture);
        // GFX pass (alpha)
        try {
            if (playerDataTexture) {
                for (let i = host.mapManager.visibleMapCount - 1; i >= 0; i--) {
                    const map = host.mapManager.visibleMaps[i];
                    if (
                        !host.isMapWithinRenderDistance(
                            map,
                            cullTile.x,
                            cullTile.y,
                            renderDistanceTiles,
                            renderDistancePadTiles,
                        )
                    ) {
                        continue;
                    }
                    const baseOffsetPlayer = map.playerDataTextureOffsets[playerDataTextureIndex];
                    // Alpha player phase should only render player-attached effects.
                    // NPC/world alpha effects are handled in renderTransparentNpcPass.
                    if (host.gfxRenderer && baseOffsetPlayer !== -1) {
                        // Reuse object to avoid per-call allocation
                        host.gfxRenderPassOffsets.player = baseOffsetPlayer;
                        host.gfxRenderPassOffsets.npc = undefined;
                        host.gfxRenderPassOffsets.world = undefined;
                        host.gfxRenderer.renderMapPass(
                            map,
                            playerDataTexture,
                            "alpha",
                            host.gfxRenderPassOffsets,
                        );
                    }
                }
            }
        } catch {}
        // Projectile pass (alpha)
        try {
            if (playerDataTexture) {
                for (let i = host.mapManager.visibleMapCount - 1; i >= 0; i--) {
                    const map = host.mapManager.visibleMaps[i];
                    if (
                        !host.isMapWithinRenderDistance(
                            map,
                            cullTile.x,
                            cullTile.y,
                            renderDistanceTiles,
                            renderDistancePadTiles,
                        )
                    ) {
                        continue;
                    }
                    if (map.projectileDataTextureOffsets) {
                        const baseOffsetProjectile = map.projectileDataTextureOffsets[0];
                        if (baseOffsetProjectile !== undefined && baseOffsetProjectile !== -1) {
                            host.projectileRenderer?.renderMapPass(
                                map,
                                baseOffsetProjectile,
                                playerDataTexture,
                                "alpha",
                            );
                        }
                    }
                }
            }
        } catch {}
    
}
