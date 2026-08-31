import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { ParamsMap, Type } from "@august/osrs-engine/config/Type";

export class StructType extends Type {
    params!: ParamsMap;

    override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
        if (opcode === 249) {
            this.params = Type.readParamsMap(buffer, this.params);
        }
    }
}
