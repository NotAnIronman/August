import type { ProjectileManager } from "@client/engine/rendering/projectiles/ProjectileManager";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function clearControlledPlayerAppearanceCache(host: WebGLOsrsRendererHost): void {
    try {
        const controlledId = host.osrsClient.controlledPlayerServerId | 0;
        if (controlledId < 0) return;
        const players = host.osrsClient.playerEcs;
        const index = players.getIndexForServerId(controlledId);
        if (index === undefined) return;
        const appearance = players.getAppearance(index);
        if (!appearance) return;
        const equipKey =
            appearance.getEquipKey?.() ??
            (Array.isArray(appearance.equip) ? appearance.equip.slice(0, 14).join(",") : "");
        const key =
            appearance.getCacheKey?.() ??
            `${appearance.getHash?.().toString() ?? "0"}|${equipKey}`;
        host.playerRenderer.cleanupAppearanceCache(key);
        players.cleanupAppearanceCache(key);
    } catch {}
}

export function getProjectileManager(
    host: WebGLOsrsRendererHost,
): ProjectileManager | undefined {
    return host.projectileManager;
}
