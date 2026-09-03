
import { decodeInteractionIndex } from "@august/osrs-engine/interaction/InteractionIndex";
import { computeFacingRotation } from "@client/engine/game/movement/FacingRotation";
import {
    interpolateRotation
} from "@client/engine/game/movement/NpcClientTick";
import { AnimationFrames } from "@client/engine/rendering/AnimationFrames";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function _ecsUpdateNpcClient(host: WebGLOsrsRendererHost, map: WebGLMapSquare, clientTicksElapsed: number): void {

        const ids: number[] = map.npcEntityIds || ([] as any);
        if (ids.length === 0 || clientTicksElapsed <= 0) return;
        const ecs = host.osrsClient.npcEcs;
        const pe = host.osrsClient.playerEcs;

        for (let t = 0; t < clientTicksElapsed; t++) {
            for (let j = 0; j < ids.length; j++) {
                const id = ids[j] | 0;
                if (!ecs.isActive(id) || !ecs.isLinked(id)) continue;
                if (!host.shouldRenderNpcOwnershipFromMap(map, id)) continue;

                const walkingNow = ecs.shouldUseWalkAnim(id);
                const movementOrientation = walkingNow ? ecs.getCurrentStepRot(id) : undefined;
                ecs.setWalking(id, walkingNow);

                const npcWorldX = ecs.getWorldX(id) | 0;
                const npcWorldY = ecs.getWorldY(id) | 0;
                let desiredFacing: number | undefined;

                const npcInteractionIndex = ecs.getInteractionIndex?.(id);
                const npcInteraction =
                    typeof npcInteractionIndex === "number" && npcInteractionIndex >= 0
                        ? decodeInteractionIndex(npcInteractionIndex)
                        : null;
                if (npcInteraction) {
                    if (npcInteraction.type === "player") {
                        const targetIdx = pe.getIndexForServerId?.(npcInteraction.id | 0);
                        if (targetIdx != null) {
                            const px = pe.getX(targetIdx) | 0;
                            const py = pe.getY(targetIdx) | 0;
                            const dxFacing = (npcWorldX - px) | 0;
                            const dyFacing = (npcWorldY - py) | 0;
                            const facing = computeFacingRotation(dxFacing, dyFacing);
                            if (facing !== undefined) desiredFacing = facing;
                        }
                    } else if (npcInteraction.type === "npc") {
                        const targetEcs = ecs.getEcsIdForServer?.(npcInteraction.id | 0);
                        if (targetEcs != null && ecs.isLinked(targetEcs | 0)) {
                            const targetMapId = ecs.getMapId(targetEcs | 0) | 0;
                            const targetMapX = (targetMapId >> 8) & 0xff;
                            const targetMapY = targetMapId & 0xff;
                            const targetWorldX =
                                ((targetMapX << 13) + (ecs.getX(targetEcs | 0) | 0)) | 0;
                            const targetWorldY =
                                ((targetMapY << 13) + (ecs.getY(targetEcs | 0) | 0)) | 0;
                            const dxFacing = (npcWorldX - targetWorldX) | 0;
                            const dyFacing = (npcWorldY - targetWorldY) | 0;
                            const facing = computeFacingRotation(dxFacing, dyFacing);
                            if (facing !== undefined) desiredFacing = facing;
                        }
                    }
                }
                if (
                    desiredFacing === undefined &&
                    walkingNow &&
                    movementOrientation !== undefined
                ) {
                    desiredFacing = movementOrientation;
                }
                if (desiredFacing !== undefined) {
                    ecs.setTargetRot(id, desiredFacing);
                }

                // Rotate toward target orientation with rotation speed
                const rot = ecs.getRotation(id) | 0;
                const targetRot = ecs.getTargetRot(id) | 0;
                if (rot !== targetRot) {
                    const step = ecs.getRotationSpeed(id) | 0;
                    const newRot = interpolateRotation(rot, targetRot, step);
                    ecs.setRotation(id, newRot);
                }

                const seqId = ecs.getSeqId(id) | 0;
                const seqDelay = ecs.getSeqDelay?.(id) | 0;
                const extraAnimMap = map.npcExtraAnims?.[j];
                const extraLenMap = map.npcExtraFrameLengths?.[j];
                const { movementSeqId, idleSeqId, walkSeqId } = host.resolveNpcMovementSequenceIds(
                    ecs,
                    id,
                );
                const movementAnim =
                    (movementSeqId | 0) === (idleSeqId | 0)
                        ? (map.npcIdleFrames[j] as AnimationFrames | undefined)
                        : (movementSeqId | 0) === (walkSeqId | 0)
                            ? (((map.npcWalkFrames[j] ?? map.npcIdleFrames[j]) as AnimationFrames) ??
                                undefined)
                            : undefined;
                let movementLengths =
                    (movementSeqId | 0) === (idleSeqId | 0)
                        ? (map.npcIdleFrameLengths[j] as number[] | undefined)
                        : (movementSeqId | 0) === (walkSeqId | 0)
                            ? (((map.npcWalkFrameLengths[j] ??
                                map.npcIdleFrameLengths[j]) as number[]) ?? undefined)
                            : undefined;
                const currentMovementSeqId = ecs.getMovementSeqId?.(id) | 0;

                if ((movementSeqId | 0) !== (currentMovementSeqId | 0)) {
                    ecs.setMovementSeqId?.(id, movementSeqId | 0);
                    ecs.setMovementFrameIndex?.(id, 0);
                    ecs.setMovementAnimTick?.(id, 0);
                    ecs.setMovementLoopCount?.(id, 0);
                }

                let movementSeqType: any | undefined;
                if (movementSeqId >= 0) {
                    try {
                        movementSeqType = host.osrsClient.seqTypeLoader.load(movementSeqId | 0);
                    } catch {}
                }

                let movementFrameCount = Math.max(1, (movementAnim?.frames.length ?? 0) | 0);
                if (movementFrameCount <= 1 && movementSeqId >= 0) {
                    if (
                        !!movementSeqType?.isSkeletalSeq?.() ||
                        (movementSeqType?.skeletalId ?? -1) >= 0
                    ) {
                        movementFrameCount = Math.max(
                            1,
                            movementSeqType?.getSkeletalDuration?.() | 0,
                        );
                    } else if (Array.isArray(movementSeqType?.frameIds)) {
                        movementFrameCount = Math.max(1, movementSeqType.frameIds.length | 0);
                        if (!movementLengths) {
                            movementLengths = new Array<number>(movementFrameCount).fill(1);
                            for (let k = 0; k < movementFrameCount; k++) {
                                try {
                                    movementLengths[k] =
                                        movementSeqType.getFrameLength(
                                            host.osrsClient.seqFrameLoader,
                                            k | 0,
                                        ) | 0;
                                } catch {}
                            }
                        }
                    }
                }
                const movementStep = host.stepNpcSequenceTrack(
                    ecs.getMovementFrameIndex?.(id) | 0,
                    ecs.getMovementAnimTick?.(id) | 0,
                    ecs.getMovementLoopCount?.(id) | 0,
                    movementFrameCount | 0,
                    movementLengths,
                    movementSeqType,
                    false,
                );
                ecs.setMovementFrameIndex?.(id, movementStep.frameIndex | 0);
                ecs.setMovementAnimTick?.(id, movementStep.animTick | 0);
                ecs.setMovementLoopCount?.(id, movementStep.loopCount | 0);

                if (movementStep.frameAdvanced && movementSeqType?.frameSounds?.size) {
                    try {
                        host.osrsClient.handleSeqFrameSounds(
                            movementSeqType,
                            movementStep.frameIndex | 0,
                            {
                                position: {
                                    x: npcWorldX,
                                    y: npcWorldY,
                                    z: (ecs.getLevel(id) | 0) * 128,
                                },
                                isLocalPlayer: false,
                            },
                        );
                    } catch {}
                }

                if (seqId >= 0 && seqDelay === 0) {
                    let actionLengths = extraLenMap?.[seqId];
                    let actionFrameCount = 1;
                    let actionSeqType: any | undefined;
                    try {
                        actionSeqType = host.osrsClient.seqTypeLoader.load(seqId | 0);
                    } catch {}

                    const seqAnim = extraAnimMap?.[seqId];
                    if (seqAnim) {
                        actionFrameCount = Math.max(1, seqAnim.frames.length | 0);
                    } else if (
                        !!actionSeqType?.isSkeletalSeq?.() ||
                        (actionSeqType?.skeletalId ?? -1) >= 0
                    ) {
                        actionFrameCount = Math.max(1, actionSeqType?.getSkeletalDuration?.() | 0);
                    } else if (Array.isArray(actionSeqType?.frameIds)) {
                        actionFrameCount = Math.max(1, actionSeqType.frameIds.length | 0);
                        if (!actionLengths) {
                            actionLengths = new Array<number>(actionFrameCount).fill(1);
                            for (let k = 0; k < actionFrameCount; k++) {
                                try {
                                    actionLengths[k] =
                                        actionSeqType.getFrameLength(
                                            host.osrsClient.seqFrameLoader,
                                            k | 0,
                                        ) | 0;
                                } catch {}
                            }
                        }
                    }

                    const actionStep = host.stepNpcSequenceTrack(
                        ecs.getFrameIndex(id) | 0,
                        ecs.getAnimTick(id) | 0,
                        ecs.getLoopCount(id) | 0,
                        actionFrameCount | 0,
                        actionLengths,
                        actionSeqType,
                        true,
                    );

                    // Reference: updateActorAnimationState stops the sequence the
                    // moment it finishes (actor animation state reverts to none);
                    // corpse poses persist via the death seq's own frame lengths
                    // and the server despawning the NPC at the animation's end.
                    if (actionStep.cleared) {
                        ecs.clearSeq(id);
                    } else {
                        ecs.setFrameIndex(id, actionStep.frameIndex | 0);
                        ecs.setAnimTick(id, actionStep.animTick | 0);
                        ecs.setLoopCount(id, actionStep.loopCount | 0);
                    }

                    if (actionStep.frameAdvanced && actionSeqType?.frameSounds?.size) {
                        try {
                            host.osrsClient.handleSeqFrameSounds(
                                actionSeqType,
                                actionStep.frameIndex | 0,
                                {
                                    position: {
                                        x: npcWorldX,
                                        y: npcWorldY,
                                        z: (ecs.getLevel(id) | 0) * 128,
                                    },
                                    isLocalPlayer: false,
                                },
                            );
                        } catch {}
                    }
                }
            }
        }
    
}

export function _ecsUpdatePlayerServer(host: WebGLOsrsRendererHost, ): void {

        return;
    
}
