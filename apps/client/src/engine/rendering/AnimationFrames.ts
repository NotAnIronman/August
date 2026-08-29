import { DrawRange } from "@client/engine/rendering/DrawRange";

export type AnimationFrames = {
    frames: DrawRange[];
    framesAlpha: DrawRange[] | undefined;
};
