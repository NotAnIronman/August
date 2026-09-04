
import { getMapPlaneId } from "@august/osrs-engine/map/MapFileIndex";
import { Scene } from "@august/osrs-engine/scene/Scene";
import { SdMapData } from "@client/engine/rendering/loader/SdMapData";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function getWidgetsGLCanvas(host: WebGLOsrsRendererHost, ): HTMLCanvasElement | undefined {

        return host.widgetsOverlay?.getGLCanvas();
    
}

export function clearMinimapIconsForMap(host: WebGLOsrsRendererHost, mapX: number, mapY: number): void {

        for (let level = 0; level < Scene.MAX_LEVELS; level++) {
            host.minimapIcons.delete(getMapPlaneId(mapX | 0, mapY | 0, level));
        }
    
}

export function registerMinimapData(host: WebGLOsrsRendererHost, mapData: SdMapData): void {

        const mapX = mapData.mapX | 0;
        const mapY = mapData.mapY | 0;
        for (let level = 0; level < Scene.MAX_LEVELS; level++) {
            const blob = mapData.minimapBlobs?.[level];
            if (blob) {
                const url = URL.createObjectURL(blob);
                if (typeof host.osrsClient.setMinimapImageUrl === "function") {
                    host.osrsClient.setMinimapImageUrl(mapX, mapY, url, level);
                } else {
                    const key = getMapPlaneId(mapX, mapY, level);
                    host.osrsClient.minimapImageUrls.set(key, url);
                }
            }

            const key = getMapPlaneId(mapX, mapY, level);
            const icons = mapData.minimapIcons?.[level] ?? [];
            if (icons.length > 0) {
                host.minimapIcons.set(key, icons);
            } else {
                host.minimapIcons.delete(key);
            }
        }
    
}
