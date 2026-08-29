import { SeqFrame } from "@august/osrs-engine/model/seq/SeqFrame";

export class SeqFrameMap {
    constructor(readonly frames: SeqFrame[]) {}

    hasAlphaTransform(frame: number) {
        return this.frames[frame].hasAlphaTransform;
    }
}
