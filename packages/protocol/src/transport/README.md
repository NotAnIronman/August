# Transport registries

August carries two independent client-to-server binary streams. Their IDs and length tables
are deliberately separate even though both begin with a one-byte opcode.

| Stream | Registry | Codec owners | Purpose |
| --- | --- | --- | --- |
| OSRS action packets | `OsrsClientPacketId` / `OSRS_CLIENT_PACKET_LENGTHS` | client `PacketWriter`, server `PacketHandler` | Native-style movement, interaction, and interface action payloads (IDs 1-105) |
| August messages | `ClientMessageId` / `CLIENT_MESSAGE_LENGTHS` | client `ClientBinaryEncoder`, server `ClientBinaryDecoder` | Project-specific high-level messages that replaced JSON (IDs 180-255) |
| August messages | `ServerMessageId` / `SERVER_MESSAGE_LENGTHS` | server `ServerBinaryEncoder`, client `ServerBinaryDecoder` | Project-specific server responses and state updates |

The owning codec selects the registry. Do not import an unqualified `ClientPacketId`, combine
the length tables, or route a decoded payload merely because another stream has the same
numeric value. Numeric IDs and the length sentinel meanings are wire contracts: non-negative
values are fixed lengths, `-1` uses a one-byte length prefix, and `-2` uses a two-byte prefix.
