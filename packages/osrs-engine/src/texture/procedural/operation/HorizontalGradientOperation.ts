import { TextureGenerator } from "@august/osrs-engine/texture/procedural/TextureGenerator";
import { TextureOperation } from "@august/osrs-engine/texture/procedural/operation/TextureOperation";

export class HorizontalGradientOperation extends TextureOperation {
    constructor() {
        super(0, true);
    }

    override getMonochromeOutput(textureGenerator: TextureGenerator, line: number): Int32Array {
        return textureGenerator.horizontalGradient;
    }
}
