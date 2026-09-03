
import { NpcEcs } from "@client/engine/game/ecs/NpcEcs";
import { AnimationFrames } from "@client/engine/rendering/AnimationFrames";
import { WebGLMapSquare } from "@client/engine/rendering/WebGLMapSquare";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function _resolveNpcAnimation(host: WebGLOsrsRendererHost, 
        map: WebGLMapSquare,
        npcIndex: number,
        ecs: NpcEcs,
        ecsId: number,
    ): AnimationFrames {

        const extraAnimMap = map.npcExtraAnims?.[npcIndex];
        const seqId = ecs.getSeqId(ecsId) | 0;
        const seqDelay = ecs.getSeqDelay?.(ecsId) | 0;
        if (seqId >= 0 && seqDelay === 0) {
            const extraAnim = extraAnimMap?.[seqId];
            if (extraAnim) {
                return extraAnim;
            }
        }
        const movementSeqId = host.resolveNpcMovementSequenceIds(ecs, ecsId).movementSeqId | 0;
        if (movementSeqId >= 0) {
            const extraMovementAnim = extraAnimMap?.[movementSeqId];
            if (extraMovementAnim) {
                return extraMovementAnim;
            }
        }
        const useWalk = ecs.isWalking(ecsId);
        return ((useWalk ? map.npcWalkFrames[npcIndex] : undefined) ??
            map.npcIdleFrames[npcIndex]) as AnimationFrames;
    
}

const NPC_IDLE_SEQUENCE_OVERRIDES: ReadonlyMap<number, number> = new Map([
    [13011, 10995], // Blood Moon
    [13012, 11016], // Eclipse Moon
    [13013, 10995], // Blue Moon
]);

export function resolveNpcMovementSequenceIds(host: WebGLOsrsRendererHost, 
        ecs: NpcEcs,
        ecsId: number,
    ): { movementSeqId: number; idleSeqId: number; walkSeqId: number } {

        let movementSeqId = -1;
        let idleSeqId = -1;
        let walkSeqId = -1;
        const npcTypeId = ecs.getNpcTypeId?.(ecsId);
        if (typeof npcTypeId !== "number" || npcTypeId < 0) {
            return { movementSeqId, idleSeqId, walkSeqId };
        }

        try {
            const npcType = host.osrsClient.npcTypeLoader.load(npcTypeId | 0);
            if (!npcType) {
                return { movementSeqId, idleSeqId, walkSeqId };
            }

            const movementSet = npcType.getMovementSeqSet(host.osrsClient.basTypeLoader);
            // Moon encounter idle overrides are server-side today; use the
            // matching presentation override until that field is carried by
            // NPC synchronization.
            idleSeqId = NPC_IDLE_SEQUENCE_OVERRIDES.get(npcTypeId | 0) ?? (movementSet.idle | 0);
            walkSeqId = movementSet.walk | 0;
            const pathLength = ecs.getPathLengthLike?.(ecsId) | 0;
            if (pathLength <= 0) {
                movementSeqId = idleSeqId;
                // Turn-in-place: while still rotating toward the target
                // orientation, play the idle-rotate sequence (walk fallback).
                const rot = ecs.getRotation(ecsId) | 0;
                const targetRot = ecs.getTargetRot(ecsId) | 0;
                const delta = (targetRot - rot) & 2047;
                if (delta !== 0) {
                    const rotSpeed = ecs.getRotationSpeed(ecsId) | 0;
                    const stillTurning =
                        rotSpeed > 0 && delta >= rotSpeed && delta <= 2048 - rotSpeed;
                    if (stillTurning) {
                        const turnSeq =
                            delta > 1024 ? movementSet.turnLeft | 0 : movementSet.turnRight | 0;
                        const resolved = turnSeq >= 0 ? turnSeq : walkSeqId;
                        if (resolved >= 0) movementSeqId = resolved;
                    }
                }
                return { movementSeqId, idleSeqId, walkSeqId };
            }

            const movementOrientation = ecs.getCurrentStepRot(ecsId);
            if (movementOrientation === undefined) {
                movementSeqId = walkSeqId >= 0 ? walkSeqId : idleSeqId;
                return { movementSeqId, idleSeqId, walkSeqId };
            }

            let yaw = ((movementOrientation | 0) - (ecs.getRotation(ecsId) | 0)) & 2047;
            if (yaw > 1024) yaw -= 2048;

            let nextSeq = movementSet.walkBack | 0;
            if (yaw >= -256 && yaw <= 256) nextSeq = movementSet.walk | 0;
            else if (yaw >= 256 && yaw < 768) nextSeq = movementSet.walkRight | 0;
            else if (yaw >= -768 && yaw <= -256) nextSeq = movementSet.walkLeft | 0;
            if (nextSeq === -1) {
                nextSeq = movementSet.walk | 0;
            }

            let speed = 4;
            if (!!npcType.isClipped) {
                if (
                    (movementOrientation | 0) !== (ecs.getRotation(ecsId) | 0) &&
                    (ecs.getInteractionIndex?.(ecsId) | 0) < 0 &&
                    (ecs.getRotationSpeed(ecsId) | 0) !== 0
                ) {
                    speed = 2;
                }
                if (pathLength > 2) speed = 6;
                if (pathLength > 3) speed = 8;
                if ((ecs.getMovementDelayCounter?.(ecsId) | 0) > 0 && pathLength > 1) {
                    speed = 8;
                }
            } else {
                if (pathLength > 1) speed = 6;
                if (pathLength > 2) speed = 8;
                if ((ecs.getMovementDelayCounter?.(ecsId) | 0) > 0 && pathLength > 1) {
                    speed = 8;
                }
            }

            const rawTraversal = ecs.getCurrentStepSpeed(ecsId) | 0;
            if (rawTraversal >= 8) speed <<= 1;
            else if (rawTraversal <= 2) speed >>= 1;

            if (speed >= 8) {
                if (nextSeq === (movementSet.walk | 0) && (movementSet.run | 0) !== -1) {
                    nextSeq = movementSet.run | 0;
                } else if (
                    nextSeq === (movementSet.walkBack | 0) &&
                    (movementSet.runBack | 0) !== -1
                ) {
                    nextSeq = movementSet.runBack | 0;
                } else if (
                    nextSeq === (movementSet.walkLeft | 0) &&
                    (movementSet.runLeft | 0) !== -1
                ) {
                    nextSeq = movementSet.runLeft | 0;
                } else if (
                    nextSeq === (movementSet.walkRight | 0) &&
                    (movementSet.runRight | 0) !== -1
                ) {
                    nextSeq = movementSet.runRight | 0;
                }
            } else if (speed <= 2) {
                if (nextSeq === (movementSet.walk | 0) && (movementSet.crawl | 0) !== -1) {
                    nextSeq = movementSet.crawl | 0;
                } else if (
                    nextSeq === (movementSet.walkBack | 0) &&
                    (movementSet.crawlBack | 0) !== -1
                ) {
                    nextSeq = movementSet.crawlBack | 0;
                } else if (
                    nextSeq === (movementSet.walkLeft | 0) &&
                    (movementSet.crawlLeft | 0) !== -1
                ) {
                    nextSeq = movementSet.crawlLeft | 0;
                } else if (
                    nextSeq === (movementSet.walkRight | 0) &&
                    (movementSet.crawlRight | 0) !== -1
                ) {
                    nextSeq = movementSet.crawlRight | 0;
                }
            }

            movementSeqId = nextSeq | 0;
            if (movementSeqId < 0) {
                movementSeqId = walkSeqId >= 0 ? walkSeqId : idleSeqId;
            }
        } catch {}

        return { movementSeqId, idleSeqId, walkSeqId };
    
}

export function shouldLayerNpcMovementSequence(host: WebGLOsrsRendererHost, 
        actionSeqId: number,
        movementSeqId: number,
        idleSeqId: number,
    ): boolean {

        if (
            (actionSeqId | 0) < 0 ||
            (movementSeqId | 0) < 0 ||
            (movementSeqId | 0) === (idleSeqId | 0)
        ) {
            return false;
        }

        try {
            const seqType = host.osrsClient.seqTypeLoader.load(actionSeqId | 0) as any;
            if (seqType?.isSkeletalSeq?.()) {
                return Array.isArray(seqType.skeletalMasks);
            }
            return Array.isArray(seqType?.masks) && seqType.masks.length > 0;
        } catch {
            return false;
        }
    
}
