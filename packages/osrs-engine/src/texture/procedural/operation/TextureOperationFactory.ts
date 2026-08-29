import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { ArithmeticOperation } from "@august/osrs-engine/texture/procedural/operation/ArithmeticOperation";
import { BinaryOperation } from "@august/osrs-engine/texture/procedural/operation/BinaryOperation";
import { BlurOperation } from "@august/osrs-engine/texture/procedural/operation/BlurOperation";
import { BricksOperation } from "@august/osrs-engine/texture/procedural/operation/BricksOperation";
import { BrightnessOperation } from "@august/osrs-engine/texture/procedural/operation/BrightnessOperation";
import { ClampOperation } from "@august/osrs-engine/texture/procedural/operation/ClampOperation";
import { ColorEdgeDetectorOperation } from "@august/osrs-engine/texture/procedural/operation/ColorEdgeDetectorOperation";
import { ColourStripOperation } from "@august/osrs-engine/texture/procedural/operation/ColourStripOperation";
import { ConstantColourOperation } from "@august/osrs-engine/texture/procedural/operation/ConstantColourOperation";
import { ConstantMonochromeOperation } from "@august/osrs-engine/texture/procedural/operation/ConstantMonochromeOperation";
import { CurveOperation } from "@august/osrs-engine/texture/procedural/operation/CurveOperation";
import { DiagonalGradientOperation } from "@august/osrs-engine/texture/procedural/operation/DiagonalGradientOperation";
import { EmbossOperation } from "@august/osrs-engine/texture/procedural/operation/EmbossOperation";
import { GradientOperation } from "@august/osrs-engine/texture/procedural/operation/GradientOperation";
import { GrayScaleOperation } from "@august/osrs-engine/texture/procedural/operation/GrayScaleOperation";
import { HerringboneOperation } from "@august/osrs-engine/texture/procedural/operation/HerringboneOperation";
import { HorizontalGradientOperation } from "@august/osrs-engine/texture/procedural/operation/HorizontalGradientOperation";
import { HslOperation } from "@august/osrs-engine/texture/procedural/operation/HslOperation";
import { InvertOperation } from "@august/osrs-engine/texture/procedural/operation/InvertOperation";
import { IrregularBricksOperation } from "@august/osrs-engine/texture/procedural/operation/IrregularBricksOperation";
import { KaleidoscopeOperation } from "@august/osrs-engine/texture/procedural/operation/KaleidoscopeOperation";
import { LineNoiseOperation } from "@august/osrs-engine/texture/procedural/operation/LineNoiseOperation";
import { MandelbrotOperation } from "@august/osrs-engine/texture/procedural/operation/MandelbrotOperation";
import { MirrorOperation } from "@august/osrs-engine/texture/procedural/operation/MirrorOperation";
import { MixerOperation } from "@august/osrs-engine/texture/procedural/operation/MixerOperation";
import { MonochromeEdgeDetectorOperation } from "@august/osrs-engine/texture/procedural/operation/MonochromeEdgeDetectorOperation";
import { Operation37 } from "@august/osrs-engine/texture/procedural/operation/Operation37";
import { PerlinNoiseOperation } from "@august/osrs-engine/texture/procedural/operation/PerlinNoiseOperation";
import { PseudoRandomNoiseOperation } from "@august/osrs-engine/texture/procedural/operation/PseudoRandomNoiseOperation";
import { RangeOperation } from "@august/osrs-engine/texture/procedural/operation/RangeOperation";
import { RasterizerOperation } from "@august/osrs-engine/texture/procedural/operation/RasterizerOperation";
import { SpriteSourceOperation } from "@august/osrs-engine/texture/procedural/operation/SpriteSourceOperation";
import { SquareWaveformOperation } from "@august/osrs-engine/texture/procedural/operation/SquareWaveformOperation";
import { TextureOperation } from "@august/osrs-engine/texture/procedural/operation/TextureOperation";
import { TextureSourceOperation } from "@august/osrs-engine/texture/procedural/operation/TextureSourceOperation";
import { TilingOperation } from "@august/osrs-engine/texture/procedural/operation/TilingOperation";
import { TilingSpriteOperation } from "@august/osrs-engine/texture/procedural/operation/TilingSpriteOperation";
import { TrigWarpOperation } from "@august/osrs-engine/texture/procedural/operation/TrigWarpOperation";
import { VerticalGradientOperation } from "@august/osrs-engine/texture/procedural/operation/VerticalGradientOperation";
import { VoronoiNoiseOperation } from "@august/osrs-engine/texture/procedural/operation/VoronoiNoiseOperation";
import { WeaveOperation } from "@august/osrs-engine/texture/procedural/operation/WeaveOperation";

export class TextureOperationFactory {
    static instantiate(id: number): TextureOperation {
        switch (id) {
            case 0:
                return new ConstantMonochromeOperation();
            case 1:
                return new ConstantColourOperation();
            case 2:
                return new HorizontalGradientOperation();
            case 3:
                return new VerticalGradientOperation();
            case 4:
                return new BricksOperation();
            case 5:
                return new BlurOperation();
            case 6:
                return new ClampOperation();
            case 7:
                return new ArithmeticOperation();
            case 8:
                return new CurveOperation();
            case 9:
                return new MirrorOperation();
            case 10:
                return new GradientOperation();
            case 11:
                return new ColourStripOperation();
            case 12:
                return new DiagonalGradientOperation();
            case 13:
                return new PseudoRandomNoiseOperation();
            case 14:
                return new WeaveOperation();
            case 15:
                return new VoronoiNoiseOperation();
            case 16:
                return new HerringboneOperation();
            case 17:
                return new HslOperation();
            case 18:
                return new TilingSpriteOperation();
            case 19:
                return new TrigWarpOperation();
            case 20:
                return new TilingOperation();
            case 21:
                return new MixerOperation();
            case 22:
                return new InvertOperation();
            case 23:
                return new KaleidoscopeOperation();
            case 24:
                return new GrayScaleOperation();
            case 25:
                return new BrightnessOperation();
            case 26:
                return new BinaryOperation();
            case 27:
                return new SquareWaveformOperation();
            case 28:
                return new IrregularBricksOperation();
            case 29:
                return new RasterizerOperation();
            case 30:
                return new RangeOperation();
            case 31:
                return new MandelbrotOperation();
            case 32:
                return new EmbossOperation();
            case 33:
                return new ColorEdgeDetectorOperation();
            case 34:
                return new PerlinNoiseOperation();
            case 35:
                return new MonochromeEdgeDetectorOperation();
            case 36:
                return new TextureSourceOperation();
            case 37:
                return new Operation37();
            case 38:
                return new LineNoiseOperation();
            case 39:
                return new SpriteSourceOperation();
            default:
                throw new Error("Unknown texture operation: " + id);
        }
    }

    static create(buffer: ByteBuffer): TextureOperation {
        // some index
        const id = buffer.readUnsignedByte();
        const type = buffer.readUnsignedByte();
        // console.log("type", type, id);
        const operation = TextureOperationFactory.instantiate(type);
        operation.id = id;
        operation.cacheSize = buffer.readUnsignedByte();
        const fieldCount = buffer.readUnsignedByte();
        for (let i = 0; i < fieldCount; i++) {
            const field = buffer.readUnsignedByte();
            operation.decode(field, buffer);
        }
        operation.init();
        return operation;
    }
}
