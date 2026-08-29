/** Integer scanline fill operations used by the procedural texture rasterizer. */
export class RasterSpanFill {
    static fill(array: Int32Array, start: number, length: number, value: number) {
        array.fill(value, start, start + length);
    }
    static fillRange(array: Int32Array, start: number, end: number, value: number) {
        array.fill(value, start, end);
    }
}
