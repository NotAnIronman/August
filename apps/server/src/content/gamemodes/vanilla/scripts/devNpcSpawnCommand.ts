import type { CommandEvent, IScriptRegistry, ScriptServices } from "@server/game/scripts/types";
import type { PlayerState } from "@server/game/player";

const USAGE = "Usage: ::npc <npcTypeId> — spawns one non-respawning npc a tile in front of you.";

/** Best-effort cardinal offset from the player's current orientation (0=north, clockwise, standard RS convention). */
function tileInFrontOf(player: PlayerState): { x: number; y: number } {
    const bucket = Math.round(player.getOrientation() / 512) % 4;
    switch (bucket) {
        case 0: return { x: player.tileX, y: player.tileY + 1 }; // north
        case 1: return { x: player.tileX + 1, y: player.tileY }; // east
        case 2: return { x: player.tileX, y: player.tileY - 1 }; // south
        default: return { x: player.tileX - 1, y: player.tileY }; // west
    }
}

/**
 * ::npc <id> — quick single-spawn for testing bosses/monsters without
 * touching npc-spawns.json or waiting on a respawn timer. Uses the same
 * spawnNpc/spawnTransientNpc path quest instances and followers already
 * rely on (services.npc.spawnNpc -> NpcManager.spawnTransientNpc),
 * respawns:false so a kill just removes it for good.
 */
export function registerDevNpcSpawnCommand(registry: IScriptRegistry, _services: ScriptServices): void {
    registry.registerCommand(
        "npc",
        (event: CommandEvent) => {
            const { player, args, services } = event;
            const npcTypeId = Number(args[0]);
            if (!Number.isInteger(npcTypeId) || npcTypeId < 0) return USAGE;

            const tile = tileInFrontOf(player);
            const npc = services.npc.spawnNpc({
                id: npcTypeId,
                x: tile.x,
                y: tile.y,
                level: player.level,
                respawns: false,
            });

            if (!npc) return `Failed to spawn npc ${npcTypeId} — is that a valid npc id?`;
            return `Spawned npc ${npcTypeId} at (${tile.x}, ${tile.y}). It will not respawn once killed.`;
        },
        {
            permission: "developer",
            owner: "developer:npc-testing",
            summary: "Spawn a single non-respawning npc in front of you for testing, e.g. ::npc 50.",
        },
    );
}
