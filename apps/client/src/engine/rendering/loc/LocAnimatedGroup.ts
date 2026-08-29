import { AnimationFrames } from "@client/engine/rendering/AnimationFrames";
import { SceneLocEntity } from "@client/engine/rendering/loc/SceneLocEntity";

export type LocAnimatedGroup = {
    anim: AnimationFrames;
    locs: SceneLocEntity[];
};
