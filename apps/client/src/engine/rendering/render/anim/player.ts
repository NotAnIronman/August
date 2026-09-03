
import type { PlayerAnimKey } from "@client/engine/game/ecs/PlayerEcs";
import type { WebGLOsrsRendererHost } from "@client/engine/rendering/render/hostInterface";

export function _resolvePlayerSeqIdForMode(host: WebGLOsrsRendererHost, ): number {

        try {
            const ecsIndex = host.osrsClient.playerEcs.getIndexForServerId(
                host.osrsClient.controlledPlayerServerId,
            );
            if (ecsIndex === undefined) return -1;
            if (host.osrsClient.playerEcs.size() <= ecsIndex) return -1;
            if (host.playerIdleSeqId >= 0) {
                return host.playerIdleSeqId | 0;
            }

            const pe: any = host.osrsClient.playerEcs as any;
            const animSeq = (key: PlayerAnimKey): number => {
                const specific = pe.getAnimSeq?.(ecsIndex, key);
                if (typeof specific === "number" && specific >= 0) return specific | 0;
                const global = host.osrsClient.serverPlayerSeqs?.[key];
                return typeof global === "number" && global >= 0 ? global | 0 : -1;
            };
            const pick = (...candidates: Array<number | undefined>): number => {
                for (const c of candidates) {
                    if (typeof c === "number" && c >= 0) return c | 0;
                }
                return -1;
            };
            const rotBase = pe.getRotation?.(ecsIndex);
            const rotFallback = rotBase ?? pe.rotation?.[ecsIndex];
            const rot: number = ((rotFallback ?? 0) as number) | 0;

            const resolveFromAnimSet = (): number => {
                // Movement blocking is handled in `PlayerEcs` (). This resolver is mode-only.
                if (host.playerAnimMode === "idle") {
                    const desired =
                        (pe.getTargetRotation?.(ecsIndex) ?? pe.targetRot?.[ecsIndex] ?? rot) | 0;
                    const delta = (desired - rot) & 2047;
                    if (delta !== 0) {
                        const rotationCounter = (pe.getRotationCounter?.(ecsIndex) ?? 0) | 0;
                        const rotationSpeed = (pe.getRotationSpeed?.(ecsIndex) ?? 32) | 0;
                        // Turn anims play while the rotation is still in progress
                        // this tick; the counter only extends them past the final
                        // snap step (the di > 25 case). Falls back to the walk
                        // animation when no idle-rotate sequence exists.
                        const stillTurning =
                            delta >= rotationSpeed && delta <= 2048 - rotationSpeed;
                        if (rotationSpeed > 0 && (stillTurning || rotationCounter > 25)) {
                            const turnSeq = pick(
                                delta > 1024 ? animSeq("turnLeft") : animSeq("turnRight"),
                                animSeq("walk"),
                            );
                            if (turnSeq >= 0) return turnSeq;
                        }
                    }
                    const idleSeq = animSeq("idle");
                    if (idleSeq >= 0) return idleSeq;
                    return -1;
                }

                const cx: number = (pe.getX?.(ecsIndex) ?? 0) | 0;
                const cy: number = (pe.getY?.(ecsIndex) ?? 0) | 0;
                const tx: number = (pe.getTargetX?.(ecsIndex) ?? cx) | 0;
                const ty: number = (pe.getTargetY?.(ecsIndex) ?? cy) | 0;
                let moveOri = rot | 0;
                if (cx < tx) {
                    if (cy < ty) moveOri = 1280;
                    else if (cy > ty) moveOri = 1792;
                    else moveOri = 1536;
                } else if (cx > tx) {
                    if (cy < ty) moveOri = 768;
                    else if (cy > ty) moveOri = 256;
                    else moveOri = 512;
                } else if (cy < ty) moveOri = 1024;
                else if (cy > ty) moveOri = 0;
                let delta = (moveOri - rot) & 2047;
                if (delta > 1024) delta -= 2048;
                const margin = 64;
                const straight = delta >= -256 - margin && delta <= 256 + margin;
                const right = delta >= 256 + margin && delta < 768 - margin;
                const left = delta <= -256 - margin && delta > -768 + margin;

                if (host.playerAnimMode === "run") {
                    return pick(
                        straight ? pick(animSeq("run"), animSeq("walk")) : undefined,
                        right
                            ? pick(
                                animSeq("runRight"),
                                animSeq("run"),
                                animSeq("walkRight"),
                                animSeq("walk"),
                            )
                            : undefined,
                        left
                            ? pick(
                                animSeq("runLeft"),
                                animSeq("run"),
                                animSeq("walkLeft"),
                                animSeq("walk"),
                            )
                            : undefined,
                        !straight && !right && !left
                            ? pick(
                                animSeq("runBack"),
                                animSeq("run"),
                                animSeq("walkBack"),
                                animSeq("walk"),
                            )
                            : undefined,
                    );
                }

                // OSRS crawl animation selection (speed <= 2)
                // Reference: player-animation.md lines 387-398
                if (host.playerAnimMode === "crawl") {
                    return pick(
                        straight ? pick(animSeq("crawl"), animSeq("walk")) : undefined,
                        right
                            ? pick(
                                animSeq("crawlRight"),
                                animSeq("crawl"),
                                animSeq("walkRight"),
                                animSeq("walk"),
                            )
                            : undefined,
                        left
                            ? pick(
                                animSeq("crawlLeft"),
                                animSeq("crawl"),
                                animSeq("walkLeft"),
                                animSeq("walk"),
                            )
                            : undefined,
                        !straight && !right && !left
                            ? pick(
                                animSeq("crawlBack"),
                                animSeq("crawl"),
                                animSeq("walkBack"),
                                animSeq("walk"),
                            )
                            : undefined,
                    );
                }

                return pick(
                    straight ? pick(animSeq("walk"), animSeq("run")) : undefined,
                    right
                        ? pick(
                            animSeq("walkRight"),
                            animSeq("walk"),
                            animSeq("runRight"),
                            animSeq("run"),
                        )
                        : undefined,
                    left
                        ? pick(
                            animSeq("walkLeft"),
                            animSeq("walk"),
                            animSeq("runLeft"),
                            animSeq("run"),
                        )
                        : undefined,
                    !straight && !right && !left
                        ? pick(
                            animSeq("walkBack"),
                            animSeq("walk"),
                            animSeq("runBack"),
                            animSeq("run"),
                        )
                        : undefined,
                );
            };

            try {
                const seqFromAnim = resolveFromAnimSet();
                if (seqFromAnim >= 0) return seqFromAnim;
            } catch {}
            try {
                const seqs = host.osrsClient.serverPlayerSeqs;
                if (seqs) {
                    // If idle but rotating, use turn sequences if provided
                    if (host.playerAnimMode === "idle") {
                        try {
                            const pe: any = host.osrsClient.playerEcs as any;
                            const rot: number =
                                (pe.getRotation?.(ecsIndex) ?? pe.rotation?.[ecsIndex] ?? 0) | 0;
                            const desired: number =
                                (pe.getTargetRotation?.(ecsIndex) ??
                                    pe.targetRot?.[ecsIndex] ??
                                    rot) | 0;
                            let delta = (desired - rot) & 2047;
                            if (delta !== 0 && typeof seqs.turnLeft === "number") {
                                const isRight = delta < 1024 && delta > 0;
                                const isLeft = !isRight;
                                if (isLeft && typeof seqs.turnLeft === "number")
                                    return seqs.turnLeft | 0;
                                if (isRight && typeof seqs.turnRight === "number")
                                    return (seqs.turnRight ?? seqs.turnLeft)! | 0;
                            }
                        } catch {}
                        if (typeof seqs.idle === "number") return seqs.idle | 0;
                    }
                    // Moving: prefer directional sequences when provided
                    try {
                        const pe: any = host.osrsClient.playerEcs as any;
                        const rot: number =
                            (pe.getRotation?.(ecsIndex) ?? pe.rotation?.[ecsIndex] ?? 0) | 0;
                        // Compute movement orientation from current position toward target step
                        const cx: number = (pe.getX?.(ecsIndex) ?? 0) | 0;
                        const cy: number = (pe.getY?.(ecsIndex) ?? 0) | 0;
                        const tx: number = (pe.getTargetX?.(ecsIndex) ?? cx) | 0;
                        const ty: number = (pe.getTargetY?.(ecsIndex) ?? cy) | 0;
                        let moveOri = rot | 0;
                        if (cx < tx) {
                            if (cy < ty) moveOri = 1280;
                            else if (cy > ty) moveOri = 1792;
                            else moveOri = 1536;
                        } else if (cx > tx) {
                            if (cy < ty) moveOri = 768;
                            else if (cy > ty) moveOri = 256;
                            else moveOri = 512;
                        } else if (cy < ty) moveOri = 1024;
                        else if (cy > ty) moveOri = 0;
                        // Direction classification with small hysteresis to reduce flicker
                        let delta = (moveOri - rot) & 2047;
                        if (delta > 1024) delta -= 2048; // [-1024,1024]
                        const margin = 64; // hysteresis margin in RS angle units
                        const straight = delta >= -256 - margin && delta <= 256 + margin;
                        const right = delta >= 256 + margin && delta < 768 - margin;
                        const left = delta <= -256 - margin && delta > -768 + margin;
                        const useRun = host.playerAnimMode === "run";
                        if (useRun) {
                            if (straight && typeof seqs.run === "number") return seqs.run | 0;
                            if (right && typeof seqs.runRight === "number")
                                return seqs.runRight | 0;
                            if (left && typeof seqs.runLeft === "number") return seqs.runLeft | 0;
                            if (typeof seqs.runBack === "number") return seqs.runBack | 0;
                        } else {
                            if (straight && typeof seqs.walk === "number") return seqs.walk | 0;
                            if (right && typeof seqs.walkRight === "number")
                                return seqs.walkRight | 0;
                            if (left && typeof seqs.walkLeft === "number") return seqs.walkLeft | 0;
                            if (typeof seqs.walkBack === "number") return seqs.walkBack | 0;
                        }
                    } catch {}
                }
            } catch {}
            try {
                const npcTypeLoader = host.osrsClient.npcTypeLoader;
                let manId = -1;
                const ncount = npcTypeLoader.getCount();
                for (let id = 0; id < ncount; id++) {
                    const t: any = npcTypeLoader.load(id);
                    if (t && typeof t.name === "string" && t.name.toLowerCase() === "man") {
                        manId = id;
                        break;
                    }
                }
                if (manId !== -1) {
                    const manType: any = npcTypeLoader.load(manId);
                    // Prefer directional sequences based on rotation delta for NPC movement
                    try {
                        const pe: any = host.osrsClient.playerEcs as any;
                        const has0 = (pe.size?.() ?? (pe as any).size?.() ?? 0) > 0;
                        if (has0) {
                            const rot: number =
                                (pe.getRotation?.(ecsIndex) ?? pe.rotation?.[ecsIndex] ?? 0) | 0;
                            // Movement orientation from step target vs current rotation
                            const cx: number = (pe.getX?.(ecsIndex) ?? 0) | 0;
                            const cy: number = (pe.getY?.(ecsIndex) ?? 0) | 0;
                            const tx: number = (pe.getTargetX?.(ecsIndex) ?? cx) | 0;
                            const ty: number = (pe.getTargetY?.(ecsIndex) ?? cy) | 0;
                            let moveOri = rot | 0;
                            if (cx < tx) {
                                if (cy < ty) moveOri = 1280;
                                else if (cy > ty) moveOri = 1792;
                                else moveOri = 1536;
                            } else if (cx > tx) {
                                if (cy < ty) moveOri = 768;
                                else if (cy > ty) moveOri = 256;
                                else moveOri = 512;
                            } else if (cy < ty) moveOri = 1024;
                            else if (cy > ty) moveOri = 0;
                            let delta = (moveOri - rot) & 2047;
                            if (delta > 1024) delta -= 2048; // [-1024,1024]
                            const margin = 64;
                            const useRun = host.playerAnimMode === "run";
                            const straight = delta >= -256 - margin && delta <= 256 + margin;
                            const right = delta >= 256 + margin && delta < 768 - margin;
                            const left = delta <= -256 - margin && delta > -768 + margin;
                            if (straight) {
                                const seq = useRun ? manType.runSeqId : manType.walkSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            } else if (right) {
                                const seq = useRun ? manType.runRightSeqId : manType.walkRightSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            } else if (left) {
                                const seq = useRun ? manType.runLeftSeqId : manType.walkLeftSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            } else {
                                const seq = useRun ? manType.runBackSeqId : manType.walkBackSeqId;
                                if (typeof seq === "number" && seq >= 0) return seq | 0;
                            }
                            // If idle but turning in place, prefer turn sequences where possible
                            if (!useRun) {
                                const desiredIdle = ((pe.getTargetRotation?.(ecsIndex) ??
                                    pe.targetRot?.[ecsIndex] ??
                                    rot) | 0) as number;
                                const deltaRaw = (desiredIdle - rot) & 2047;
                                if (deltaRaw !== 0) {
                                    const turnSeq =
                                        deltaRaw > 1024
                                            ? manType.turnLeftSeqId
                                            : manType.turnRightSeqId;
                                    if (typeof turnSeq === "number" && turnSeq >= 0)
                                        return turnSeq | 0;
                                }
                            }
                        }
                    } catch {}
                    if (host.playerAnimMode === "run") {
                        const runSeq = (manType as any).runSeqId ?? -1;
                        if (runSeq !== -1) return runSeq | 0;
                    }
                    if (host.playerAnimMode !== "idle") {
                        const walkSeq =
                            (manType as any).walkSeqId ??
                            manType.getWalkSeqId?.(host.osrsClient.basTypeLoader);
                        if (typeof walkSeq === "number" && walkSeq !== -1) return walkSeq | 0;
                    }
                    const idleSeq = manType.getIdleSeqId(host.osrsClient.basTypeLoader);
                    if (idleSeq !== -1) return idleSeq | 0;
                }
            } catch {}
        } catch {}
        return -1;
    
}
