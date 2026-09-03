
import { LocModelLoader } from "@august/osrs-engine/config/loctype/LocModelLoader";
import { LocModelType } from "@august/osrs-engine/config/loctype/LocModelType";
import { NpcModelLoader } from "@august/osrs-engine/config/npctype/NpcModelLoader";
import { decodeInteractionIndex } from "@august/osrs-engine/interaction/InteractionIndex";
import { Model } from "@august/osrs-engine/model/Model";
import {
    getCurrentTick
} from "@client/core/network/ServerConnection";
import { ClientState } from "@client/engine/game/ClientState";
import {
    InteractHighlightDrawTarget
} from "@client/engine/rendering/overlays/InteractHighlightOverlay";
import { InteractHighlightTarget,LocHighlightTarget } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function getInteractHighlightDrawTargets(host: WebGLOsrsRendererHost, ): ReadonlyArray<InteractHighlightDrawTarget> {

        const out = host.interactHighlightDrawTargets;
        out.length = 0;

        const config = host.osrsClient.interactHighlightPlugin.getConfig();
        if (!config.enabled) return out;

        host.syncInteractHighlightActiveTargetFromLocalInteraction();
        host.maybeExpireInteractHighlightTarget();

        const getWeTransform = (target: InteractHighlightTarget): Float32Array | undefined => {
            if (target.kind === "npc") {
                const wvId = host.osrsClient.npcEcs.getWorldViewId?.(target.ecsId) ?? -1;
                if (wvId >= 0) return host.worldEntityAnimator?.getTransform(wvId);
            }
            if (target.kind === "loc" && !target.overworldProxy) {
                const map = host.getPreferredMapForWorldTile(target.tileX, target.tileY);
                if (map && host.mapManager.worldEntityMapIds.has(map.id)) {
                    const weIdx = host.getWorldEntityIndexForMapId(map.id);
                    if (weIdx !== undefined) return host.worldEntityAnimator?.getTransform(weIdx);
                }
            }
            return undefined;
        };

        if (config.showInteract && host.interactHighlightActiveTarget) {
            const trianglePoints = host.buildHighlightTrianglePoints(
                host.interactHighlightActiveTarget,
            );
            if (trianglePoints && trianglePoints.length >= 3) {
                out.push({
                    trianglePoints,
                    color: config.interactColor,
                    alpha: 0.45,
                    worldEntityTransform: getWeTransform(host.interactHighlightActiveTarget),
                });
            }
        }

        if (config.showHover && host.interactHighlightHoverTarget) {
            const showingActive =
                config.showInteract &&
                host.isSameInteractHighlightTarget(
                    host.interactHighlightHoverTarget,
                    host.interactHighlightActiveTarget,
                );
            if (!showingActive) {
                const trianglePoints = host.buildHighlightTrianglePoints(
                    host.interactHighlightHoverTarget,
                );
                if (trianglePoints && trianglePoints.length >= 3) {
                    out.push({
                        trianglePoints,
                        color: config.hoverColor,
                        alpha: 0.45,
                        worldEntityTransform: getWeTransform(host.interactHighlightHoverTarget),
                    });
                }
            }
        }

        return out;
    
}

export function syncInteractHighlightActiveTargetFromLocalInteraction(host: WebGLOsrsRendererHost, ): void {

        const interactionTarget = host.resolveInteractHighlightTargetFromLocalInteraction();
        if (interactionTarget) {
            if (
                !host.isSameInteractHighlightTarget(
                    interactionTarget,
                    host.interactHighlightActiveTarget,
                )
            ) {
                host.interactHighlightActiveTarget = interactionTarget;
            }
            host.interactHighlightClickTick = -1;
            host.interactHighlightActiveFromInteraction = true;
            return;
        }

        if (host.interactHighlightActiveFromInteraction) {
            host.clearInteractHighlightActiveTarget();
        }
    
}

export function resolveInteractHighlightTargetFromLocalInteraction(host: WebGLOsrsRendererHost, ):
        | InteractHighlightTarget
        | undefined {

        const controlledServerId = host.osrsClient.controlledPlayerServerId | 0;
        if (controlledServerId < 0) return undefined;

        const playerEcs = host.osrsClient.playerEcs;
        const controlledEcsId = playerEcs.getIndexForServerId(controlledServerId);
        if (controlledEcsId === undefined) return undefined;

        const interactionIndex = playerEcs.getInteractionIndex(controlledEcsId) | 0;
        if (interactionIndex < 0) return undefined;

        const decoded = decodeInteractionIndex(interactionIndex);
        if (!decoded) return undefined;
        if (decoded.type !== "npc") return undefined;

        return host.resolveNpcHighlightTargetFromServerId(decoded.id | 0);
    
}

export function maybeExpireInteractHighlightTarget(host: WebGLOsrsRendererHost, ): void {

        if (!host.interactHighlightActiveTarget) return;
        if (host.interactHighlightActiveTarget.kind === "loc") {
            if (!host.isLocHighlightTargetStillPresent(host.interactHighlightActiveTarget)) {
                host.clearInteractHighlightActiveTarget();
                return;
            }
        }
        if (host.interactHighlightActiveFromInteraction) return;
        const clickTick = host.interactHighlightClickTick | 0;
        if (clickTick < 0) return;
        if (!host.hasActiveDestinationMarker() && (getCurrentTick() | 0) > clickTick) {
            host.clearInteractHighlightActiveTarget();
        }
    
}

export function isLocHighlightTargetStillPresent(host: WebGLOsrsRendererHost, target: LocHighlightTarget): boolean {

        // Clear highlight if the player changed planes (e.g. climbing stairs)
        if ((host.getPlayerBasePlane() | 0) !== (target.plane | 0)) {
            return false;
        }
        const typeRot = host.resolveLocTypeRotAtTile(
            target.locId | 0,
            target.tileX | 0,
            target.tileY | 0,
            target.plane | 0,
        );
        if (typeof typeRot !== "number") {
            return false;
        }
        target.locModelType = (typeRot & 0x3f) | 0;
        target.locRotation = ((typeRot >> 6) & 0x3) | 0;
        return true;
    
}

export function hasActiveDestinationMarker(host: WebGLOsrsRendererHost, ): boolean {

        return (ClientState.destinationX | 0) !== 0 || (ClientState.destinationY | 0) !== 0;
    
}

export function isSameInteractHighlightTarget(host: WebGLOsrsRendererHost, 
        a: InteractHighlightTarget | undefined,
        b: InteractHighlightTarget | undefined,
    ): boolean {

        if (!a || !b) return false;
        if (a.kind !== b.kind) return false;
        if (a.kind === "loc" && b.kind === "loc") {
            return (
                (a.locId | 0) === (b.locId | 0) &&
                (a.tileX | 0) === (b.tileX | 0) &&
                (a.tileY | 0) === (b.tileY | 0) &&
                (a.plane | 0) === (b.plane | 0)
            );
        }
        if (a.kind === "npc" && b.kind === "npc") {
            return (a.serverId | 0) === (b.serverId | 0);
        }
        return false;
    
}

export function buildHighlightTrianglePoints(host: WebGLOsrsRendererHost, 
        target: InteractHighlightTarget,
    ): ReadonlyArray<readonly [number, number, number]> | undefined {

        if (target.kind === "loc") {
            return host.buildLocModelHighlightTriangles(target);
        }
        return host.buildNpcModelHighlightTriangles(target);
    
}

export function getInteractLocModelLoader(host: WebGLOsrsRendererHost, ): LocModelLoader | undefined {

        if (host.interactLocModelLoader) {
            return host.interactLocModelLoader;
        }
        const textureLoader = host.osrsClient.textureLoader;
        const modelLoader = host.osrsClient.modelLoader;
        const locTypeLoader = host.osrsClient.locTypeLoader;
        const seqTypeLoader = host.osrsClient.seqTypeLoader;
        const seqFrameLoader = host.osrsClient.seqFrameLoader;
        if (!textureLoader || !modelLoader || !locTypeLoader || !seqTypeLoader || !seqFrameLoader) {
            return undefined;
        }
        host.interactLocModelLoader = new LocModelLoader(
            locTypeLoader,
            modelLoader,
            textureLoader,
            seqTypeLoader,
            seqFrameLoader,
            host.osrsClient.skeletalSeqLoader,
        );
        return host.interactLocModelLoader;
    
}

export function getInteractNpcModelLoader(host: WebGLOsrsRendererHost, ): NpcModelLoader | undefined {

        if (host.interactNpcModelLoader) {
            return host.interactNpcModelLoader;
        }
        const textureLoader = host.osrsClient.textureLoader;
        const modelLoader = host.osrsClient.modelLoader;
        const npcTypeLoader = host.osrsClient.npcTypeLoader;
        const seqTypeLoader = host.osrsClient.seqTypeLoader;
        const seqFrameLoader = host.osrsClient.seqFrameLoader;
        if (!textureLoader || !modelLoader || !npcTypeLoader || !seqTypeLoader || !seqFrameLoader) {
            return undefined;
        }
        host.interactNpcModelLoader = new NpcModelLoader(
            npcTypeLoader,
            modelLoader,
            textureLoader,
            seqTypeLoader,
            seqFrameLoader,
            host.osrsClient.skeletalSeqLoader,
            host.osrsClient.varManager,
        );
        return host.interactNpcModelLoader;
    
}

export function hasNoVisibleFaces(host: WebGLOsrsRendererHost, model: Model): boolean {

        if (!model.faceAlphas) return false;
        for (let i = 0; i < model.faceAlphas.length; i++) {
            if ((model.faceAlphas[i] & 0xff) < 254) return false;
        }
        return true;
    
}

export function findVisualProxyModel(host: WebGLOsrsRendererHost, 
        locModelLoader: LocModelLoader,
        target: LocHighlightTarget,
        modelType: number,
        modelRotation: number,
    ): Model | undefined {

        for (let mi = 0; mi < host.mapManager.visibleMapCount; mi++) {
            const map = host.mapManager.visibleMaps[mi];
            if (!map) continue;
            const local = host.getMapLocalTile(map, target.tileX, target.tileY);
            if (!local) continue;
            const rsX = (local.x * 128 + 64) | 0;
            const rsY = (local.y * 128 + 64) | 0;
            for (const anim of map.locsAnimated) {
                if (anim.id === (target.locId | 0)) continue;
                if (anim.x !== rsX || anim.y !== rsY) continue;
                const proxyType = host.osrsClient.locTypeLoader.load(anim.id);
                if (!proxyType) continue;
                const proxyModel =
                    locModelLoader.getModelAnimated(
                        proxyType,
                        LocModelType.NORMAL,
                        anim.rotation ?? 0,
                        anim.seqType?.id ?? -1,
                        anim.frame | 0,
                    ) ??
                    locModelLoader.getModelAnimated(
                        proxyType,
                        modelType as LocModelType,
                        modelRotation,
                        anim.seqType?.id ?? -1,
                        anim.frame | 0,
                    );
                if (proxyModel && !host.hasNoVisibleFaces(proxyModel)) {
                    return proxyModel;
                }
            }
        }
        return undefined;
    
}
