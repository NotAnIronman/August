import {
    Texture
} from "picogl";

import { DrawRange,NULL_DRAW_RANGE } from "@client/engine/rendering/DrawRange";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import {
    DynamicNpcFrameGeometry
} from "@client/engine/rendering/npc/DynamicNpcAnimLoader";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function renderTransparentNpcPass(host: WebGLOsrsRendererHost, 
        npcDataTextureIndex: number,
        npcDataTexture: Texture | undefined,
    ): void {

        if (!npcDataTexture || !host.loadNpcs) {
            return;
        }
        const cullTile = host.getRenderCullTile();
        const renderDistanceTiles = Math.max(0, host.getFrameRenderDistanceTiles() | 0);
        const renderDistancePadTiles = 0;

        // Collect dynamic NPCs for second pass
        const dynamicNpcs: Array<{
            map: WebGLMapSquare;
            npcIndex: number;
            ecsId: number;
            npcTypeId: number;
            seqId: number;
            overlaySeqId: number;
            overlayFrameId: number;
            dataOffset: number;
            frameId: number;
            geometry: DynamicNpcFrameGeometry;
        }> = [];

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
            const npcCount = map.npcEntityIds?.length ?? 0;
            if (npcCount === 0) continue;

            const dataOffset = map.npcDataTextureOffsets[npcDataTextureIndex];
            if (dataOffset === -1) {
                continue;
            }

            const npcBatch = map.drawCallNpc;
            if (!npcBatch) continue;
            const { drawCall, drawRanges } = npcBatch;

            drawCall
                .uniform("u_npcDataOffset", dataOffset)
                .uniform("u_modelYOffset", host.getNpcModelYOffset())
                .uniform("u_worldEntityTransform", WebGLMapSquare.IDENTITY_MAT4)
                .texture("u_npcDataTexture", npcDataTexture);

            {
                const ecs = host.osrsClient.npcEcs;
                const ids: number[] = map.npcEntityIds as any;
                const weNpcIndices: number[] = [];

                for (let j = 0; j < npcCount; j++) {
                    const id = ids[j] | 0;
                    if (!host.shouldRenderNpcFromMap(map, id)) {
                        (drawCall as any).offsets[j] = 0;
                        (drawCall as any).numElements[j] = 0;
                        drawRanges[j] = NULL_DRAW_RANGE;
                        continue;
                    }

                    // Draw world-entity NPCs separately so their transparent faces
                    // receive the same deck height and transform as their opaque faces.
                    const npcWorldViewId = ecs.getWorldViewId(id);
                    const isWorldEntityNpc =
                        npcWorldViewId >= 0 &&
                        !!host.osrsClient.worldViewManager.getWorldView(npcWorldViewId);
                    if (isWorldEntityNpc) {
                        weNpcIndices.push(j);
                        (drawCall as any).offsets[j] = 0;
                        (drawCall as any).numElements[j] = 0;
                        drawRanges[j] = NULL_DRAW_RANGE;
                        continue;
                    }

                    const seqId = ecs.getSeqId(id) | 0;
                    const seqDelay = ecs.getSeqDelay?.(id) | 0;
                    const npcTypeId = (ecs.getNpcTypeId?.(id) ?? -1) | 0;
                    const { movementSeqId, idleSeqId, walkSeqId } =
                        host.resolveNpcMovementSequenceIds(ecs, id);
                    const actionActive = seqId >= 0 && seqDelay === 0;
                    const renderSeqId = actionActive ? seqId | 0 : movementSeqId | 0;
                    const overlaySeqId =
                        actionActive &&
                        host.shouldLayerNpcMovementSequence(
                            seqId | 0,
                            movementSeqId | 0,
                            idleSeqId | 0,
                        )
                            ? movementSeqId | 0
                            : -1;
                    const frameId = actionActive
                        ? ecs.getFrameIndex(id) | 0
                        : ecs.getMovementFrameIndex?.(id) | 0;
                    const overlayFrameId =
                        overlaySeqId >= 0 ? ecs.getMovementFrameIndex?.(id) | 0 : -1;
                    const hasStaticMovementAnim =
                        (movementSeqId | 0) === (idleSeqId | 0) ||
                        (movementSeqId | 0) === (walkSeqId | 0) ||
                        !!map.npcExtraAnims?.[j]?.[movementSeqId | 0];
                    const forceDynamic =
                        overlaySeqId >= 0 || (!actionActive && !hasStaticMovementAnim);
                    const dynamicMeta =
                        renderSeqId >= 0 && npcTypeId >= 0
                            ? host.ensureNpcDynamicSequenceMeta(
                                map,
                                j,
                                npcTypeId,
                                renderSeqId,
                                forceDynamic,
                            )
                            : undefined;

                    if (dynamicMeta) {
                        const geometry = host.dynamicNpcAnimLoader?.getFrameGeometry(
                            npcTypeId,
                            renderSeqId | 0,
                            frameId,
                            overlaySeqId | 0,
                            overlayFrameId | 0,
                        );
                        const hasDynamicGraphics =
                            !!geometry &&
                            ((geometry.opaqueVertices.length > 0 &&
                                geometry.opaqueIndices.length > 0) ||
                                (geometry.alphaVertices.length > 0 &&
                                    geometry.alphaIndices.length > 0));
                        if (geometry && hasDynamicGraphics) {
                            (drawCall as any).offsets[j] = 0;
                            (drawCall as any).numElements[j] = 0;
                            drawRanges[j] = NULL_DRAW_RANGE;
                            dynamicNpcs.push({
                                map,
                                npcIndex: j,
                                ecsId: id,
                                npcTypeId,
                                seqId: renderSeqId | 0,
                                overlaySeqId: overlaySeqId | 0,
                                overlayFrameId: overlayFrameId | 0,
                                dataOffset,
                                frameId,
                                geometry,
                            });
                            continue;
                        }
                    }

                    const anim = host._resolveNpcAnimation(map, j, ecs, id);
                    let frame: DrawRange = NULL_DRAW_RANGE;
                    if (anim.framesAlpha) {
                        frame =
                            anim.framesAlpha[
                                Math.max(0, Math.min((anim.framesAlpha.length - 1) | 0, frameId))
                                ];
                    }
                    (drawCall as any).offsets[j] = frame[0];
                    (drawCall as any).numElements[j] = frame[1];
                    drawRanges[j] = frame;
                }

                host.draw(drawCall, drawRanges);

                if (weNpcIndices.length > 0) {
                    const firstWeId = ids[weNpcIndices[0]] | 0;
                    const weEntityIdx = ecs.getWorldViewId(firstWeId);
                    const weTransform =
                        host.worldEntityAnimator?.getTransform(weEntityIdx) ??
                        WebGLMapSquare.IDENTITY_MAT4;
                    const weDeckH = host.getWorldEntityDeckHeight(0, 0);

                    drawCall
                        .uniform("u_modelYOffset", host.getNpcModelYOffset(weDeckH))
                        .uniform("u_worldEntityTransform", weTransform);

                    for (let j = 0; j < npcCount; j++) {
                        (drawCall as any).offsets[j] = 0;
                        (drawCall as any).numElements[j] = 0;
                        drawRanges[j] = NULL_DRAW_RANGE;
                    }
                    for (const wj of weNpcIndices) {
                        const wid = ids[wj] | 0;
                        const anim = host._resolveNpcAnimation(map, wj, ecs, wid);
                        const wFrameId =
                            ecs.getSeqId(wid) >= 0 && ecs.getSeqDelay?.(wid) === 0
                                ? ecs.getFrameIndex(wid) | 0
                                : ecs.getMovementFrameIndex?.(wid) | 0;
                        let frame: DrawRange = NULL_DRAW_RANGE;
                        if (anim.framesAlpha) {
                            frame =
                                anim.framesAlpha[
                                    Math.max(
                                        0,
                                        Math.min((anim.framesAlpha.length - 1) | 0, wFrameId),
                                    )
                                    ];
                        }
                        (drawCall as any).offsets[wj] = frame[0];
                        (drawCall as any).numElements[wj] = frame[1];
                        drawRanges[wj] = frame;
                    }
                    host.draw(drawCall, drawRanges);
                }
            }

            try {
                if (host.gfxRenderer) {
                    // Reuse object to avoid per-call allocation
                    host.gfxRenderPassOffsets.player = undefined;
                    host.gfxRenderPassOffsets.npc = dataOffset;
                    host.gfxRenderPassOffsets.world =
                        map.worldGfxDataTextureOffsets[npcDataTextureIndex];
                    host.gfxRenderer.renderMapPass(
                        map,
                        npcDataTexture,
                        "alpha",
                        host.gfxRenderPassOffsets,
                    );
                }
            } catch {}
        }

        for (const entry of host.unbatchedNpcRenderEntries) {
            if (
                !host.isMapWithinRenderDistance(
                    entry.map,
                    cullTile.x,
                    cullTile.y,
                    renderDistanceTiles,
                    renderDistancePadTiles,
                )
            ) {
                continue;
            }
            const geometry = host.resolveUnbatchedNpcGeometry(entry.ecsId);
            if (!geometry) continue;
            dynamicNpcs.push({
                map: entry.map,
                npcIndex: 0,
                ecsId: entry.ecsId,
                npcTypeId: geometry.npcTypeId,
                seqId: geometry.seqId,
                overlaySeqId: geometry.overlaySeqId ?? -1,
                overlayFrameId: geometry.overlayFrameId ?? -1,
                dataOffset: entry.dataOffset,
                frameId: geometry.frameId,
                geometry,
            });
        }

        if (dynamicNpcs.length > 0 && npcDataTexture) {
            for (const dyn of dynamicNpcs) {
                const indexCount = host.uploadDynamicNpcGeometry(dyn.geometry, true);
                if (indexCount <= 0 || !host.dynamicNpcDrawCall) {
                    continue;
                }

                const dynDrawCall = host.dynamicNpcDrawCall;
                dynDrawCall.texture("u_npcDataTexture", npcDataTexture);
                const npcDataOffset = dyn.dataOffset + dyn.npcIndex;

                dynDrawCall.uniform("u_npcDataOffset", npcDataOffset);
                dynDrawCall.uniform("u_mapPos", [dyn.map.renderPosX, dyn.map.renderPosY]);
                dynDrawCall.uniform("u_timeLoaded", dyn.map.timeLoaded);
                {
                    const dynWvId = host.osrsClient.npcEcs.getWorldViewId(dyn.ecsId);
                    if (
                        dynWvId >= 0 &&
                        host.osrsClient.worldViewManager.getWorldView(dynWvId)
                    ) {
                        const dynDeckH = host.getWorldEntityDeckHeight(0, 0);
                        dynDrawCall.uniform("u_modelYOffset", host.getNpcModelYOffset(dynDeckH));
                        dynDrawCall.uniform(
                            "u_worldEntityTransform",
                            host.worldEntityAnimator?.getTransform(dynWvId) ??
                            WebGLMapSquare.IDENTITY_MAT4,
                        );
                    } else {
                        dynDrawCall.uniform("u_modelYOffset", host.getNpcModelYOffset());
                        dynDrawCall.uniform("u_worldEntityTransform", WebGLMapSquare.IDENTITY_MAT4);
                    }
                }

                // Set height map texture from the map
                const heightMapTex = (dyn.map as any).heightMapTexture;
                if (heightMapTex) {
                    dynDrawCall.texture("u_heightMap", heightMapTex);
                    dynDrawCall.uniform("u_sceneBorderSize", (dyn.map as any).borderSize ?? 6);
                }
                const waterMaskTex = (dyn.map as any).waterMaskTexture;
                if (waterMaskTex) {
                    dynDrawCall.texture("u_waterMask", waterMaskTex);
                }

                host.dynamicNpcSingleDrawRange[0] = 0;
                host.dynamicNpcSingleDrawRange[1] = indexCount | 0;
                host.dynamicNpcSingleDrawRange[2] = 1;
                (dynDrawCall as any).offsets[0] = 0;
                (dynDrawCall as any).numElements[0] = indexCount | 0;
                host.draw(dynDrawCall, host.dynamicNpcSingleDrawRanges);
            }
        }
    
}
