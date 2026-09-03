
import { RS_TO_RADIANS } from "@august/osrs-engine/MathConstants";
import { LocModelType } from "@august/osrs-engine/config/loctype/LocModelType";
import { sampleBridgeHeightForWorldTile } from "@client/engine/game/scene/BridgeHeightSampler";
import {
    BridgePlaneStrategy
} from "@client/engine/game/scene/PlaneResolver";
import { LocHighlightTarget,NpcHighlightTarget,RENDER_CONSTANTS } from "@client/engine/rendering/render/constants";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function buildLocModelHighlightTriangles(host: WebGLOsrsRendererHost, 
        target: LocHighlightTarget,
    ): ReadonlyArray<readonly [number, number, number]> | undefined {

        const locModelLoader = host.getInteractLocModelLoader();
        if (!locModelLoader) return undefined;

        let locType = host.osrsClient.locTypeLoader.load(target.locId | 0);
        if (!locType) return undefined;
        let sizeX = Math.max(1, Number(locType.sizeX ?? 1));
        let sizeY = Math.max(1, Number(locType.sizeY ?? 1));
        if (locType.transforms) {
            const transformed = locType.transform(
                host.osrsClient.varManager,
                host.osrsClient.locTypeLoader,
            );
            if (transformed) {
                locType = transformed;
            }
        }

        const rawType =
            typeof target.locModelType === "number" ? (target.locModelType | 0) & 0x3f : undefined;
        const rawRotation =
            typeof target.locRotation === "number" ? (target.locRotation | 0) & 0x3 : undefined;
        if (rawType === undefined || rawRotation === undefined) {
            return undefined;
        }

        let modelType = rawType;
        let modelRotation = rawRotation;
        if (modelType === LocModelType.NORMAL_DIAGIONAL) {
            modelType = LocModelType.NORMAL;
            modelRotation = (rawRotation + 4) & 0x7;
        }

        // Find the current animation frame from the map's animated loc list.
        // LocAnimated x/y are in RS sub-tile units (localTile * 128 + 64).
        let seqId = locType.seqId ?? -1;
        let seqFrame = 0;
        const locMap = host.getPreferredMapForWorldTile(target.tileX, target.tileY);
        if (locMap) {
            const localTile = host.getMapLocalTile(locMap, target.tileX, target.tileY);
            if (localTile) {
                const rsX = (localTile.x * 128 + 64) | 0;
                const rsY = (localTile.y * 128 + 64) | 0;
                for (const anim of locMap.locsAnimated) {
                    if (
                        anim.id === (target.locId | 0) &&
                        anim.x === rsX &&
                        anim.y === rsY &&
                        anim.level === (target.plane | 0)
                    ) {
                        seqId = anim.seqType?.id ?? seqId;
                        seqFrame = anim.frame | 0;
                        break;
                    }
                }
            }
        }
        let model = locModelLoader.getModelAnimated(
            locType,
            modelType as LocModelType,
            modelRotation,
            seqId,
            seqFrame,
        );

        // Invisible interaction volumes (all faces fully transparent) use a
        // visual proxy loc at the same tile for the highlight outline.
        if (model && host.hasNoVisibleFaces(model)) {
            const proxy = host.findVisualProxyModel(
                locModelLoader,
                target,
                modelType,
                modelRotation,
            );
            if (proxy) {
                model = proxy;
                target.overworldProxy = true;
            }
        }

        if (!model || !model.verticesX || !model.verticesY || !model.verticesZ) {
            return undefined;
        }

        if (rawRotation === 1 || rawRotation === 3) {
            const tmp = sizeX;
            sizeX = sizeY;
            sizeY = tmp;
        }
        const entityX = (target.tileX << 7) + (sizeX << 6);
        const entityZ = (target.tileY << 7) + (sizeY << 6);
        // For world entity overlay locs, sample overworld height (plane 0) — the GPU
        // renders at the overlay's source plane height which sits at sea level, not a
        // full UNITS_LEVEL_HEIGHT below.
        const heightMap = host.getPreferredMapForWorldTile(target.tileX, target.tileY);
        const isOverlay = !target.overworldProxy && heightMap && heightMap.interactionPlane >= 0;
        const heightPlane = isOverlay ? 0 : target.plane | 0;
        let baseY = sampleBridgeHeightForWorldTile(
            host.mapManager,
            entityX / 128.0,
            entityZ / 128.0,
            heightPlane,
            BridgePlaneStrategy.RENDER,
        ).height;
        if (isOverlay) {
            baseY += host.getWorldEntityDeckHeight(0, 0) / 128.0;
        }
        return host.buildModelTrianglePoints(model, (i) => ({
            x: (entityX + model.verticesX[i]) / 128.0,
            y: baseY + model.verticesY[i] / 128.0,
            z: (entityZ + model.verticesZ[i]) / 128.0,
        }));
    
}

export function buildNpcModelHighlightTriangles(host: WebGLOsrsRendererHost, 
        target: NpcHighlightTarget,
    ): ReadonlyArray<readonly [number, number, number]> | undefined {

        const npcEcs = host.osrsClient.npcEcs;
        const ecsId = target.ecsId | 0;
        if (!npcEcs.isActive(ecsId) || !npcEcs.isLinked(ecsId)) return undefined;
        if ((npcEcs.getServerId(ecsId) | 0) !== (target.serverId | 0)) return undefined;

        const npcModelLoader = host.getInteractNpcModelLoader();
        if (!npcModelLoader) return undefined;

        const npcTypeId = npcEcs.getNpcTypeId(ecsId) | 0;
        const npcType = host.osrsClient.npcTypeLoader.load(npcTypeId);
        if (!npcType) return undefined;

        const actionSeqId = npcEcs.getSeqId(ecsId) | 0;
        const actionDelay = npcEcs.getSeqDelay?.(ecsId) | 0;
        const { movementSeqId, idleSeqId } = host.resolveNpcMovementSequenceIds(npcEcs, ecsId);
        const actionActive = actionSeqId >= 0 && actionDelay === 0;
        const seqId = actionActive ? actionSeqId : movementSeqId;
        const frame = Math.max(
            0,
            actionActive
                ? npcEcs.getFrameIndex(ecsId) | 0
                : npcEcs.getMovementFrameIndex?.(ecsId) | 0,
        );
        const movementFrame = Math.max(0, npcEcs.getMovementFrameIndex?.(ecsId) | 0);
        const overlaySeqId =
            actionActive &&
            host.shouldLayerNpcMovementSequence(actionSeqId | 0, movementSeqId | 0, idleSeqId | 0)
                ? movementSeqId | 0
                : -1;

        let model =
            seqId >= 0
                ? npcModelLoader.getModel(
                    npcType,
                    seqId | 0,
                    frame | 0,
                    overlaySeqId | 0,
                    (overlaySeqId >= 0 ? movementFrame : -1) | 0,
                )
                : undefined;
        if (!model) {
            model = npcModelLoader.getModel(npcType, -1, -1);
        }
        if (!model || !model.verticesX || !model.verticesY || !model.verticesZ) {
            return undefined;
        }
        const modelForTriangles = model;

        const mapId = npcEcs.getMapId(ecsId) | 0;
        const mapX = (mapId >> 8) & 0xff;
        const mapY = mapId & 0xff;
        const centerSceneX = (mapX << 13) + (npcEcs.getX(ecsId) | 0);
        const centerSceneZ = (mapY << 13) + (npcEcs.getY(ecsId) | 0);
        const plane = npcEcs.getLevel(ecsId) | 0;
        target.plane = plane;
        // Match NPC rendering height: bridge-aware sampling, ground clearance,
        // and deck height for world entities.
        let baseY = sampleBridgeHeightForWorldTile(
            host.mapManager,
            centerSceneX / 128.0,
            centerSceneZ / 128.0,
            plane | 0,
            BridgePlaneStrategy.RENDER,
        ).height;
        baseY += RENDER_CONSTANTS.ACTOR_GROUND_CLEARANCE_MODEL_UNITS / 128.0;
        const wvId = npcEcs.getWorldViewId?.(ecsId) ?? -1;
        if (wvId >= 0 && host.osrsClient.worldViewManager.getWorldView(wvId)) {
            const deckH = host.getWorldEntityDeckHeight(0, 0);
            baseY += deckH / 128.0;
        }
        const angle = (npcEcs.getRotation(ecsId) | 0) * RS_TO_RADIANS;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return host.buildModelTrianglePoints(modelForTriangles, (i) => {
            const vx = modelForTriangles.verticesX[i] | 0;
            const vz = modelForTriangles.verticesZ[i] | 0;
            // Match npc.vert.glsl exactly:
            // vec4(vertex.pos, 1.0) * rotationY(angle)
            const rx = vx * cos + vz * sin;
            const rz = -vx * sin + vz * cos;
            return {
                x: (centerSceneX + rx) / 128.0,
                y: baseY + modelForTriangles.verticesY[i] / 128.0,
                z: (centerSceneZ + rz) / 128.0,
            };
        });
    
}
