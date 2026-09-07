import type { PlayerState } from "@server/game/player";
import type { IScriptRegistry, ScriptServices, LocInteractionEvent } from "@server/game/scripts/types";
import type { TheatreRunRecord } from "./TheatreRun";
import { TheatreRuns, awardTheatreSupplies } from "./TheatreRun";
import { raidAccount } from "./MaidenEncounter";
export const SUPPLY_CHEST = 32758;
export const SUPPLY_TILES = [{ room: 1, x: 3269, y: 4449 }, { room: 3, x: 3281, y: 4293 }] as const;
export const THEATRE_SUPPLIES = [
    { id: 12625, name: "Stamina potion(4)", cost: 1 }, { id: 2434, name: "Prayer potion(4)", cost: 2 },
    { id: 6685, name: "Saradomin brew(4)", cost: 3 }, { id: 3024, name: "Super restore(4)", cost: 3 },
    { id: 7058, name: "Mushroom potato", cost: 1 }, { id: 385, name: "Shark", cost: 1 },
    { id: 397, name: "Sea turtle", cost: 2 }, { id: 391, name: "Manta ray", cost: 2 },
] as const;
export function supplyAccount(run: TheatreRunRecord, p: PlayerState) {
    run.supplies ??= run.roster.map(() => ({ points: 0, awarded: [], onions: [] }));
    return run.supplies[run.roster.indexOf(raidAccount(p))];
}
export function awardSupplies(run: TheatreRunRecord, p: PlayerState, room: number): boolean {
    return awardTheatreSupplies(run, raidAccount(p), room);
}
export class TheatreSupplies {
    private spawned = new Map<string, {
        worldViewId: number;
        tile: {
            x: number;
            y: number;
        };
    }>();
    constructor(private readonly services: ScriptServices) { }
    sync(player: PlayerState): void {
        const instance = this.services.instances.get(player.id);
        if (!instance || instance.worldViewId !== player.worldViewId || !/^(theatre-of-blood|theatre-preview):/.test(instance.definitionId??""))
            return;
        const tile = SUPPLY_TILES.find(t => t.room === Number(instance.definitionId!.split(":").at(-1)));
        if (!tile || this.spawned.get(instance.id)?.worldViewId === instance.worldViewId)
            return;
        this.services.location.replaceTemporaryLoc({ worldViewId: instance.worldViewId }, 0, SUPPLY_CHEST, tile, 0, { newShape: 10, newRotation: 0 });
        this.spawned.set(instance.id, { worldViewId: instance.worldViewId, tile });
    }
    private context(event: LocInteractionEvent) {
        const { player, tile } = event, store = this.services.instances.theatreRuns;
        if (!store?.commit || !player.canInteract() || player.level !== 0 || event.level !== 0 || event.locId !== SUPPLY_CHEST)
            return;
        const run = new TheatreRuns(this.services.instances, store).current(player);
        if (!run || !SUPPLY_TILES.some(t => t.room === run.roomIndex && t.x === tile.x && t.y === tile.y) ||
            !this.services.location.isAdjacentToLoc(player, SUPPLY_CHEST, tile, 0) ||
            !this.services.location.hasTemporaryLocVisibleToPlayer(player, SUPPLY_CHEST, tile, 0))
            return;
        if (run.completedRooms <= run.roomIndex) {
            this.services.messaging.sendGameMessage(player, "Defeat this room's boss before taking supplies.");
            return;
        }
        return { run, store };
    }
    open(event: LocInteractionEvent, page = 0): void {
        const ctx = this.context(event);
        if (!ctx)
            return;
        const { run, store } = ctx, p = event.player, s = supplyAccount(run, p);
        if (awardSupplies(run, p, run.roomIndex))
            store.save(run);
        if (s.onions.includes(run.roomIndex)) {
            const before = p.items.getInventoryEntries().map(i => ({ ...i }));
            if (p.items.addItem(1957, 1, { assureFullInsertion: true }).completed !== 1) {
                this.services.messaging.sendGameMessage(p, "Make a little room for your onion.");
                return;
            }
            s.onions = s.onions.filter(i => i !== run.roomIndex);
            // Preserve the onion-only restriction after delivery, using the death record.
            try {
                store.commit!(run, [p]);
            }
            catch (error) {
                p.items.inventory = before;
                p.items.inventoryDirty = true;
                throw error;
            }
            this.services.inventory.snapshotInventory(p);
            this.services.messaging.sendGameMessage(p, "The vampyres offer you an onion for your performance.");
            return;
        }
        if ([run.roomIndex - 1, run.roomIndex].every(i => run.deaths?.[i]?.includes(raidAccount(p)))) {
            this.services.messaging.sendGameMessage(p, "The vampyres have already given you your onion.");
            return;
        }
        const stock = THEATRE_SUPPLIES.slice(page * 3, page * 3 + 3);
        this.services.dialog.openDialogOptions(p, { id: "theatre-supplies", title: `Supplies — ${s.points} points`, modal: true,
            options: [...stock.map(i => `${i.name} (${i.cost} point${i.cost === 1 ? "" : "s"})`), "More supplies", "Close"], onSelect: choice => {
                if (choice === stock.length) {
                    this.open(event, (page + 1) % 3);
                    return;
                }
                const item = stock[choice];
                if (!item)
                    return;
                const fresh = this.context(event);
                if (!fresh || fresh.run.id !== run.id)
                    return;
                const state = supplyAccount(fresh.run, p);
                if (state.points < item.cost) {
                    this.services.messaging.sendGameMessage(p, "You don't have enough supply points.");
                    this.open(event, page);
                    return;
                }
                const before = p.items.getInventoryEntries().map(i => ({ ...i }));
                if (p.items.addItem(item.id, 1, { assureFullInsertion: true }).completed !== 1) {
                    this.services.messaging.sendGameMessage(p, "Make room in your inventory for that supply.");
                    return;
                }
                state.points -= item.cost;
                try {
                    fresh.store.commit!(fresh.run, [p]);
                }
                catch (error) {
                    p.items.inventory = before;
                    p.items.inventoryDirty = true;
                    throw error;
                }
                this.services.inventory.snapshotInventory(p);
                this.open(event, page);
            } });
    }
    register(registry: IScriptRegistry): void {
        for (const action of [undefined, "open"])
            registry.registerLocInteraction(SUPPLY_CHEST, e => this.open(e), action);
        for (const tile of SUPPLY_TILES)
            registry.registerZone({ id: `theatre-supplies-${tile.room}`, minX: tile.x - 60, maxX: tile.x + 60, minY: tile.y - 40, maxY: tile.y + 40, levels: [0] }, { enter: ({ player }) => this.sync(player), step: ({ player }) => this.sync(player) });
        const prune = (all = false) => {
            for (const [id, s] of this.spawned) {
                if (!all && this.services.instances.getById(id)?.worldViewId === s.worldViewId)
                    continue;
                this.services.location.clearTemporaryLoc({ worldViewId: s.worldViewId }, 0, s.tile, 0);
                this.spawned.delete(id);
            }
        };
        registry.registerTickHandler(() => prune());
        registry.registerCleanup(() => prune(true));
    }
}
