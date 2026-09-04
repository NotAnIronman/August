import type { PlayerState } from "@server/game/player";
import type { NpcState } from "@server/game/npc";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { VARP_COLLECTION_CATEGORY_COUNT } from "@server/game/collectionlog";
import { EncounterRegistry } from "@server/game/encounters/EncounterRegistry";

function recordBossKill(player: PlayerState, npc: NpcState, services: ScriptServices): void {
    const definition = EncounterRegistry.shared.findByNpcTypeId(npc.typeId)?.killcount;
    if (!definition) return;

    player.collectionLog.incrementCategoryStat(definition.collectionLogStructId);
    const killcount = player.collectionLog.getCategoryStat(definition.collectionLogStructId)?.count1 ?? 0;
    // The category-detail UI reads this varp on selection; sending it here
    // also immediately refreshes an already-open boss log.
    services.variables.queueVarp?.(player.id, VARP_COLLECTION_CATEGORY_COUNT, killcount);
    services.messaging.sendGameMessage(player, `${definition.name} killcount : ${killcount}`);
    const milestoneInterval = definition.milestoneInterval ?? 100;
    if (killcount > 0 && killcount % milestoneInterval === 0) {
        services.messaging.sendGameMessage(
            player,
            `Congratulations! You reached the ${killcount} kills Milestone!`,
        );
    }
}

export function register(registry: IScriptRegistry, services: ScriptServices): void {
    const unregister = services.combat.registerOnNpcKilled?.((killer, npc) =>
        recordBossKill(killer, npc, services),
    );
    if (unregister) registry.registerCleanup(unregister);
}
