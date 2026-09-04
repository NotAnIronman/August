import assert from "node:assert/strict";

import { TRANSMIT_VARPS, VARPS_TAB_KEYBINDINGS } from "@august/game-model/state/vars";
import { PlayerVarpState } from "@server/game/state/PlayerVarpState";
import { mergePlayerPersistentVars } from "@server/game/state/PlayerPersistence";
import { VarpSyncService } from "@server/game/services/VarpSyncService";
import { decodeServerPacket } from "@client/core/network/packet/ServerBinaryDecoder";

for (const values of [[-123456789, 654321, 12345], [0, 0, 0]]) {
    const firstDevice = new PlayerVarpState();
    VARPS_TAB_KEYBINDINGS.forEach((id, index) => {
        assert(TRANSMIT_VARPS.has(id), `client must transmit keybinding varp ${id}`);
        firstDevice.setVarpValue(id, values[index]);
    });
    const secondDevice = new PlayerVarpState();
    secondDevice.deserialize(mergePlayerPersistentVars(undefined, JSON.parse(JSON.stringify(firstDevice.serialize()))));
    VARPS_TAB_KEYBINDINGS.forEach((id, index) => {
        assert(secondDevice.hasVarpValue(id), "cleared settings must not become missing defaults");
        assert.equal(secondDevice.getVarpValue(id), values[index]);
    });
    const sent: any[] = [];
    const sync = new VarpSyncService({
        networkLayer: {
            withDirectSendBypass: (_context: string, fn: () => unknown) => fn(),
            sendWithGuard: (_socket: unknown, packet: Uint8Array) => sent.push(decodeServerPacket(packet)),
        },
    } as any);
    sync.sendSavedTransmitVarps({} as any, {
        varps: secondDevice, combat: { autoRetaliate: true },
        energy: { wantsToRun: () => false }, gamemode: {}, getCombatTarget: () => undefined,
    } as any);
    VARPS_TAB_KEYBINDINGS.forEach((id, index) => {
        assert(sent.some(packet => packet?.type === "varp" && packet.payload.varpId === id && packet.payload.value === values[index]),
            `login must transmit saved varp ${id}, including explicit zero values`);
    });
}
console.log("character tab keybindings round-trip passed");
