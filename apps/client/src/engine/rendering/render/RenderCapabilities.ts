
import { clamp } from "@august/game-model/math/MathUtil";
import {
    isTouchDevice,
    isWebGL2Supported
} from "@client/core/platform/device/DeviceUtil";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function isSupported(): boolean {
    return isWebGL2Supported;
}

export function resolveEffectiveLodThresholdTiles(
    host: WebGLOsrsRendererHost,
    frameId: number,
): number {
    const renderDistance = host.getFrameRenderDistanceTiles() | 0;
    const base = clamp(host.osrsClient.lodDistance | 0, 0, Math.max(0, renderDistance));
    if ((host.effectiveLodThresholdFrame | 0) === (frameId | 0)) {
        return host.effectiveLodThresholdTiles | 0;
    }
    const profile = host.syncBrowserQualityProfile();
    const target = isTouchDevice
        ? Math.min(base, Math.max(0, Math.min(renderDistance, profile.lodThresholdCap | 0)))
        : base;
    host.effectiveLodThresholdTiles = Math.max(0, target | 0);
    host.effectiveLodThresholdFrame = frameId | 0;
    return host.effectiveLodThresholdTiles | 0;
}
