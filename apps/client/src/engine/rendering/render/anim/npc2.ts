import {
    PicoGL
} from "picogl";

import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import {
    DynamicNpcFrameGeometry,
    DynamicNpcSequenceMeta
} from "@client/engine/rendering/npc/DynamicNpcAnimLoader";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function stepNpcSequenceTrack(host: WebGLOsrsRendererHost, 
        frameIndex: number,
        animTick: number,
        loopCount: number,
        frameCount: number,
        lengths: number[] | undefined,
        seqType: any,
        clearOnFinish: boolean,
    ): {
        frameIndex: number;
        animTick: number;
        loopCount: number;
        frameAdvanced: boolean;
        cleared: boolean;
    } {

        let fi = Math.max(0, frameIndex | 0);
        let tick = Math.max(0, animTick | 0);
        let loops = Math.max(0, loopCount | 0);
        const safeFrameCount = Math.max(1, frameCount | 0);
        let frameAdvanced = false;
        let cleared = false;

        if (fi >= safeFrameCount) {
            fi = 0;
        }

        if (!seqType) {
            const currLen = ((lengths ? lengths[fi] : 0) ?? 0) | 0;
            tick = (tick + 1) | 0;
            if (tick > currLen) {
                tick = 1;
                fi++;
                frameAdvanced = true;
            }
            if (fi >= safeFrameCount) {
                if (clearOnFinish) {
                    cleared = true;
                } else {
                    fi = 0;
                    tick = 0;
                    loops = 0;
                }
            }
            return { frameIndex: fi, animTick: tick, loopCount: loops, frameAdvanced, cleared };
        }

        if (!!seqType?.isSkeletalSeq?.() || (seqType?.skeletalId ?? -1) >= 0) {
            const frameStep = (seqType.frameStep ?? -1) | 0;
            const maxLoops = (seqType.maxLoops ?? 0) | 0;

            fi++;
            tick = 0;
            frameAdvanced = true;

            if (fi >= safeFrameCount) {
                if (frameStep > 0) {
                    fi -= frameStep;
                    if (clearOnFinish) {
                        loops++;
                        cleared = loops >= maxLoops || fi < 0 || fi >= safeFrameCount;
                    } else {
                        const looping = !!seqType.looping;
                        if (looping) loops++;
                        if (fi < 0 || fi >= safeFrameCount || (looping && loops >= maxLoops)) {
                            fi = 0;
                            tick = 0;
                            loops = 0;
                        }
                    }
                } else if (clearOnFinish) {
                    cleared = true;
                } else {
                    fi = 0;
                    tick = 0;
                    loops = 0;
                }
            }

            return { frameIndex: fi, animTick: tick, loopCount: loops, frameAdvanced, cleared };
        }

        const frameStep = (seqType.frameStep ?? -1) | 0;
        const maxLoops = (seqType.maxLoops ?? 0) | 0;
        tick = (tick + 1) | 0;
        const safeFrameIndex = lengths ? Math.min(fi, Math.max(0, lengths.length - 1)) : fi;
        const currLen = ((lengths ? lengths[safeFrameIndex] : 0) ?? 0) | 0;
        if (tick > currLen) {
            tick = 1;
            fi++;
            frameAdvanced = true;
        }

        if (fi >= safeFrameCount) {
            if (frameStep > 0) {
                fi -= frameStep;
                if (clearOnFinish) {
                    loops++;
                    cleared = loops >= maxLoops || fi < 0 || fi >= safeFrameCount;
                } else {
                    const looping = !!seqType.looping;
                    if (looping) loops++;
                    if (fi < 0 || fi >= safeFrameCount || (looping && loops >= maxLoops)) {
                        fi = 0;
                        tick = 0;
                        loops = 0;
                    }
                }
            } else if (clearOnFinish) {
                cleared = true;
            } else {
                fi = 0;
                tick = 0;
                loops = 0;
            }
        }

        return { frameIndex: fi, animTick: tick, loopCount: loops, frameAdvanced, cleared };
    
}

export function ensureNpcDynamicSequenceMeta(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        npcIndex: number,
        npcTypeId: number,
        seqId: number,
        forceDynamic: boolean = false,
    ): DynamicNpcSequenceMeta | undefined {

        const extraAnims = map.npcExtraAnims?.[npcIndex];
        if (!forceDynamic && extraAnims?.[seqId]) {
            return undefined;
        }

        if (!host.dynamicNpcAnimLoader?.isReady()) {
            return undefined;
        }

        const meta = host.dynamicNpcAnimLoader.getSequenceMeta(npcTypeId, seqId);
        if (!meta) {
            return undefined;
        }

        if (!map.npcExtraFrameLengths) {
            map.npcExtraFrameLengths = [];
        }
        const extraLengths = map.npcExtraFrameLengths[npcIndex] ?? {};
        extraLengths[seqId] = meta.frameLengths;
        map.npcExtraFrameLengths[npcIndex] = extraLengths;

        return meta;
    
}

export function uploadDynamicNpcGeometry(host: WebGLOsrsRendererHost, 
        geometry: DynamicNpcFrameGeometry,
        transparent: boolean,
    ): number {

        if (!host.npcProgram) return 0;

        const vertices = transparent ? geometry.alphaVertices : geometry.opaqueVertices;
        const indices = transparent ? geometry.alphaIndices : geometry.opaqueIndices;
        if (!vertices || !indices || vertices.length === 0 || indices.length === 0) return 0;

        const uploadKey = `${geometry.key}:${transparent ? "alpha" : "opaque"}`;

        const needsRecreate =
            !host.dynamicNpcInterleavedBuffer ||
            vertices.length > (host.dynamicNpcBufferVertexSize ?? 0) ||
            indices.length > (host.dynamicNpcBufferIndexSize ?? 0);

        if (needsRecreate) {
            if (host.dynamicNpcInterleavedBuffer) {
                host.dynamicNpcInterleavedBuffer.delete();
                host.dynamicNpcIndexBuffer?.delete();
                host.dynamicNpcVertexArray?.delete();
                host.dynamicNpcDrawCall = undefined;
            }

            host.dynamicNpcInterleavedBuffer = host.app.createInterleavedBuffer(12, vertices);
            host.dynamicNpcIndexBuffer = host.app.createIndexBuffer(PicoGL.UNSIGNED_INT, indices);
            host.dynamicNpcBufferVertexSize = vertices.length;
            host.dynamicNpcBufferIndexSize = indices.length;
            host.dynamicNpcUploadedGeometryKey = undefined;

            host.dynamicNpcVertexArray = host.app
                .createVertexArray()
                .vertexAttributeBuffer(0, host.dynamicNpcInterleavedBuffer, {
                    type: PicoGL.UNSIGNED_INT,
                    size: 3,
                    stride: 12,
                    integer: true as any,
                })
                .indexBuffer(host.dynamicNpcIndexBuffer);

            if (host.dynamicNpcVertexArray && host.sceneUniformBuffer) {
                host.dynamicNpcDrawCall = host.configureDrawCall(
                    host.app
                        .createDrawCall(host.npcProgram, host.dynamicNpcVertexArray)
                        .uniformBlock("SceneUniforms", host.sceneUniformBuffer)
                        .drawRanges(host.dynamicNpcSingleDrawRange),
                );
                if (host.textureArray) {
                    host.dynamicNpcDrawCall.texture("u_textures", host.textureArray);
                }
                if (host.textureMaterials) {
                    host.dynamicNpcDrawCall.texture("u_textureMaterials", host.textureMaterials);
                }
                if (host.waterTextures) {
                    host.dynamicNpcDrawCall.texture("u_waterTextures", host.waterTextures);
                }
            }
        }

        if (host.dynamicNpcUploadedGeometryKey !== uploadKey) {
            (host.dynamicNpcInterleavedBuffer as any).data(vertices);
            (host.dynamicNpcIndexBuffer as any).data(indices);
            host.dynamicNpcUploadedGeometryKey = uploadKey;
        }

        return indices.length;
    
}

export function resolveUnbatchedNpcGeometry(
        host: WebGLOsrsRendererHost,
        ecsId: number,
    ): DynamicNpcFrameGeometry | undefined {

        const loader = host.dynamicNpcAnimLoader;
        if (!loader?.isReady()) return undefined;

        const ecs = host.osrsClient.npcEcs;
        const npcTypeId = ecs.getNpcTypeId(ecsId) | 0;
        const actionSeqId = ecs.getSeqId(ecsId) | 0;
        const actionActive = actionSeqId >= 0 && (ecs.getSeqDelay?.(ecsId) | 0) === 0;
        const { movementSeqId, idleSeqId } = host.resolveNpcMovementSequenceIds(ecs, ecsId);
        const renderSeqId = actionActive ? actionSeqId : movementSeqId | 0;
        const overlaySeqId =
            actionActive &&
            host.shouldLayerNpcMovementSequence(
                actionSeqId,
                movementSeqId | 0,
                idleSeqId | 0,
            )
                ? movementSeqId | 0
                : -1;
        const frameId = actionActive
            ? ecs.getFrameIndex(ecsId) | 0
            : ecs.getMovementFrameIndex?.(ecsId) | 0;
        const overlayFrameId =
            overlaySeqId >= 0 ? ecs.getMovementFrameIndex?.(ecsId) | 0 : -1;

        let geometry: DynamicNpcFrameGeometry | undefined;
        try {
            if (renderSeqId >= 0) {
                geometry = loader.getFrameGeometry(
                    npcTypeId,
                    renderSeqId,
                    frameId,
                    overlaySeqId,
                    overlayFrameId,
                );
            }
            const hasGraphics =
                !!geometry &&
                ((geometry.opaqueVertices.length > 0 && geometry.opaqueIndices.length > 0) ||
                    (geometry.alphaVertices.length > 0 && geometry.alphaIndices.length > 0));
            if (!hasGraphics) geometry = loader.getBaseGeometry(npcTypeId);
        } catch {
            try {
                geometry = loader.getBaseGeometry(npcTypeId);
            } catch {
                geometry = undefined;
            }
        }
        return geometry;

}
