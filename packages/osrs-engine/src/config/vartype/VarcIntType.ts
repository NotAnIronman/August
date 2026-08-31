import { ByteBuffer } from "@august/osrs-engine/io/ByteBuffer";
import { Type } from "@august/osrs-engine/config/Type";

export class VarcIntType extends Type {
    persist: boolean = false;

    override decodeOpcode(opcode: number, _buffer: ByteBuffer): void {
        if (opcode === 2) {
            this.persist = true;
        }
    }
}
