import type { PlayerState } from "@server/game/player";
import type { NpcState } from "@server/game/npc";
import type { IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import { VARP_COLLECTION_CATEGORY_COUNT } from "@server/game/collectionlog";

type BossKillcountDefinition = Readonly<{
    name: string;
    collectionLogStructId: number;
}>;

/** One registry for boss-facing killcount behavior as GWD grows. */
const BOSS_KILLCOUNTS: ReadonlyMap<number, BossKillcountDefinition> = new Map([
    [2215, { name: "General Graardor", collectionLogStructId: 487 }],
    [3129, { name: "K'ril Tsutsaroth", collectionLogStructId: 494 }],
]);

function recordBossKill(player: PlayerState, npc: NpcState, services: ScriptServices): void {
    const definition = BOSS_KILLCOUNTS.get(npc.typeId);
    if (!definition) return;

    player.collectionLog.incrementCategoryStat(definition.collectionLogStructId);
    const killcount = player.collectionLog.getCategoryStat(definition.collectionLogStructId)?.count1 ?? 0;
    // The category-detail UI reads this varp on selection; sending it here
    // also immediately refreshes an already-open boss log.
    services.variables.queueVarp?.(player.id, VARP_COLLECTION_CATEGORY_COUNT, killcount);
    services.messaging.sendGameMessage(player, `${definition.name} killcount : ${killcount}`);
    if (killcount > 0 && killcount % 100 === 0) {
        services.messaging.sendGameMessage(
            player,
            `Congratulations! You reached the ${killcount} kills Milestone!`,
        );
    }
}

export function register(_registry: IScriptRegistry, services: ScriptServices): void {
    services.combat.registerOnNpcKilled?.((killer, npc) => recordBossKill(killer, npc, services));
}
