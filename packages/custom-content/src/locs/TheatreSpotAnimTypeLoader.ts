import type { CacheInfo } from "@august/osrs-engine/cache/CacheInfo";
import { SpotAnimType } from "@august/osrs-engine/config/spotanimtype/SpotAnimType";
import type { SpotAnimTypeLoader } from "@august/osrs-engine/config/spotanimtype/SpotAnimTypeLoader";
/** Reserved August effect: the native red maze tile as a short-lived graphic.
 * Updating a runner marker must not rebuild the entire 104x104 room each tick. */
export const THEATRE_MAZE_MARKER = 60000;
export class TheatreSpotAnimTypeLoader implements SpotAnimTypeLoader {
    private marker: SpotAnimType;
    constructor(private readonly base: SpotAnimTypeLoader, info: CacheInfo) {
        this.marker = new SpotAnimType(THEATRE_MAZE_MARKER, info);
        this.marker.modelId = 35627;
        this.marker.ambient = 64;
    }
    load(id: number): SpotAnimType { return id === THEATRE_MAZE_MARKER ? this.marker : this.base.load(id); }
    getCount(): number { return Math.max(this.base.getCount(), THEATRE_MAZE_MARKER + 1); }
    clearCache(): void { this.base.clearCache(); }
}
