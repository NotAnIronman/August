import { Type } from "@august/osrs-engine/config/Type";

export interface FloorType extends Type {
    hue: number;
    saturation: number;
    lightness: number;

    isOverlay: boolean;

    getHueBlend(): number;

    getHueMultiplier(): number;
}
