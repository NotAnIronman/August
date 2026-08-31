import type { WorldConfig } from "../../config";
import type { GamemodeDefinition } from "../gamemodes/GamemodeDefinition";
import type { PlayerState } from "../player";

export class World {
    readonly id: number;
    readonly name: string;
    readonly gamemode: GamemodeDefinition;

    readonly players = new Map<number, PlayerState>();

    constructor(config: WorldConfig, gamemode: GamemodeDefinition) {
        this.id = config.id;
        this.name = config.name;
        this.gamemode = gamemode;
    }

    addPlayer(player: PlayerState): void {
        if (this.players.has(player.id)) {
            throw new Error(
                `Player ${player.id} already exists in world ${this.id}`,
            );
        }

        this.players.set(player.id, player);
    }

    removePlayer(playerId: number): void {
        this.players.delete(playerId);
    }

    getPlayer(playerId: number): PlayerState | undefined {
        return this.players.get(playerId);
    }

    getPlayers(): PlayerState[] {
        return Array.from(this.players.values());
    }
}
