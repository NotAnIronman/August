import type { WorldConfig } from "../../config";
import { createGamemode } from "../gamemodes/GamemodeRegistry";
import { World } from "./World";

export class WorldManager {
    private readonly worlds = new Map<number, World>();

    constructor(configs: WorldConfig[]) {
        for (const config of configs) {
            if (this.worlds.has(config.id)) {
                throw new Error(`Duplicate world ID: ${config.id}`);
            }

            const gamemode = createGamemode(config.gamemode);

            const world = new World(config, gamemode);

            this.worlds.set(world.id, world);
        }
    }

    getWorld(id: number): World | undefined {
        return this.worlds.get(id);
    }

    getWorlds(): World[] {
        return Array.from(this.worlds.values());
    }
}
