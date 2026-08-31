import type { PlayerState } from "@server/game/player";
import { NpcPreDeathDecision, type IScriptRegistry, type ScriptServices } from "@server/game/scripts/types";

/**
 * The Barrows run is deliberately player-owned rather than instance-owned.
 * The brothers themselves are temporary, owner-bound NPCs, so one player's
 * tomb search cannot complete another player's reward roll.
 */
const CRYPT_TILE = { x: 3551, y: 9691, level: 0 };
const EXIT_TILE = { x: 3565, y: 3307, level: 0 };
const FINAL_CHEST_ID = 20973;

type BrotherKey = "ahrim" | "dharok" | "guthan" | "karil" | "torag" | "verac";
type Brother = {
    key: BrotherKey;
    name: string;
    tombId: number;
    npcId: number;
    equipment: readonly number[];
};

const BROTHERS: readonly Brother[] = [
    { key: "dharok", name: "Dharok the Wretched", tombId: 20720, npcId: 1673, equipment: [4716, 4718, 4720, 4722] },
    { key: "guthan", name: "Guthan the Infested", tombId: 20722, npcId: 1674, equipment: [4724, 4726, 4728, 4730] },
    { key: "karil", name: "Karil the Tainted", tombId: 20771, npcId: 1675, equipment: [4732, 4734, 4736, 4738] },
    { key: "torag", name: "Torag the Corrupted", tombId: 20721, npcId: 1676, equipment: [4745, 4747, 4749, 4751] },
    { key: "verac", name: "Verac the Defiled", tombId: 20772, npcId: 1677, equipment: [4753, 4755, 4757, 4759] },
    { key: "ahrim", name: "Ahrim the Blighted", tombId: 20770, npcId: 1672, equipment: [4708, 4710, 4712, 4714] },
];

type BarrowsRun = {
    tunnelBrother: BrotherKey;
    killed: Set<BrotherKey>;
    activeNpcId?: number;
    activeBrother?: BrotherKey;
};

const runs = new Map<number, BarrowsRun>();

function random<T>(values: readonly T[]): T {
    return values[Math.floor(Math.random() * values.length)]!;
}

function runFor(player: PlayerState): BarrowsRun {
    let run = runs.get(player.id);
    if (!run) {
        run = { tunnelBrother: random(BROTHERS).key, killed: new Set() };
        runs.set(player.id, run);
    }
    return run;
}

function brotherFor(key: BrotherKey): Brother {
    return BROTHERS.find((brother) => brother.key === key)!;
}

function spawnBrother(player: PlayerState, services: ScriptServices, brother: Brother): void {
    const run = runFor(player);
    if (run.activeNpcId !== undefined && services.combat.getNpc(run.activeNpcId)) {
        services.messaging.sendGameMessage(player, "You are already fighting a Barrows brother.");
        return;
    }
    const offsets = [[2, 0], [-2, 0], [0, 2], [0, -2]] as const;
    const [xOffset, yOffset] = random(offsets);
    const npc = services.npc.spawnNpc({
        id: brother.npcId,
        name: brother.name,
        x: player.tileX + xOffset,
        y: player.tileY + yOffset,
        level: player.level,
        worldViewId: player.worldViewId,
        ownerPlayerId: player.id,
        wanderRadius: 0,
        isAggressive: true,
        lifetimeTicks: 2_000,
    });
    if (!npc) {
        services.messaging.sendGameMessage(player, "The brother fails to appear. Please try again.");
        return;
    }
    run.activeNpcId = npc.id;
    run.activeBrother = brother.key;
    npc.engageCombat(player.id, services.system.getCurrentTick(), { tileX: player.tileX, tileY: player.tileY });
}

function offerCryptEntry(player: PlayerState, services: ScriptServices): void {
    services.dialog.openDialogOptions(player, {
        id: "barrows-enter-crypt",
        title: "Enter the crypt?",
        options: ["Enter the crypt", "Stay here"],
        modal: true,
        onSelect: (choice) => {
            if (choice !== 0) return;
            services.movement.teleportPlayer(player, CRYPT_TILE.x, CRYPT_TILE.y, CRYPT_TILE.level);
        },
    });
}

function addOrDrop(player: PlayerState, services: ScriptServices, itemId: number, quantity: number): void {
    const added = player.items.addItem(itemId, quantity, { assureFullInsertion: false }).completed;
    if (added < quantity) {
        services.groundItems.spawn(itemId, quantity - added, { x: player.tileX, y: player.tileY, level: player.level }, {
            ownerId: player.id,
            privateTicks: 100,
            worldViewId: player.worldViewId,
            isMonsterDrop: true,
        });
    }
}

function nonUniqueReward(rolls: number): { itemId: number; quantity: number } {
    // The reward potential rises by two for each defeated brother. With no
    // crypt creatures in this first pass, this gives a stable, brother-based
    // baseline while preserving the authentic Barrows reward categories.
    const potential = Math.max(1, rolls * 2);
    const table = [
        { itemId: 995, minimum: 180 + potential * 4, maximum: 280 + potential * 8 },
        { itemId: 558, minimum: 35 + potential * 4, maximum: 55 + potential * 5 },
        { itemId: 562, minimum: 18 + potential * 2, maximum: 28 + potential * 3 },
        { itemId: 560, minimum: 12 + potential, maximum: 18 + potential * 2 },
        { itemId: 565, minimum: 7 + potential, maximum: 12 + potential },
        { itemId: 4740, minimum: 8 + potential, maximum: 14 + potential * 2 },
    ] as const;
    const reward = random(table);
    return { itemId: reward.itemId, quantity: reward.minimum + Math.floor(Math.random() * (reward.maximum - reward.minimum + 1)) };
}

function rewardChest(player: PlayerState, services: ScriptServices, run: BarrowsRun): void {
    const killedBrothers = BROTHERS.filter((brother) => run.killed.has(brother.key));
    const killedCount = killedBrothers.length;
    const rolls = 1 + killedCount;
    const uniqueChance = 1 / (450 - 58 * killedCount);
    const awarded = new Set<number>();

    for (let roll = 0; roll < rolls; roll += 1) {
        const eligible = killedBrothers.flatMap((brother) => brother.equipment).filter((itemId) => !awarded.has(itemId));
        if (eligible.length > 0 && Math.random() < uniqueChance) {
            const itemId = random(eligible);
            awarded.add(itemId);
            addOrDrop(player, services, itemId, 1);
        } else {
            const reward = nonUniqueReward(rolls);
            addOrDrop(player, services, reward.itemId, reward.quantity);
        }
    }
    services.inventory.snapshotInventoryImmediate(player);
    services.messaging.sendGameMessage(player, `You search the chest. ${killedCount} Barrows brother${killedCount === 1 ? "" : "s"} defeated.`);
}

function searchTomb(player: PlayerState, services: ScriptServices, brother: Brother): void {
    const run = runFor(player);
    if (run.killed.has(brother.key)) {
        services.messaging.sendGameMessage(player, "You have already defeated this brother during this run.");
        return;
    }
    if (run.tunnelBrother === brother.key) {
        offerCryptEntry(player, services);
        return;
    }
    spawnBrother(player, services, brother);
}

function searchChest(player: PlayerState, services: ScriptServices): void {
    const run = runFor(player);
    const tunnelBrother = brotherFor(run.tunnelBrother);
    if (!run.killed.has(tunnelBrother.key)) {
        spawnBrother(player, services, tunnelBrother);
        return;
    }
    rewardChest(player, services, run);
    runs.delete(player.id);
    services.movement.teleportPlayer(player, EXIT_TILE.x, EXIT_TILE.y, EXIT_TILE.level);
}

export function registerBarrowsHandlers(registry: IScriptRegistry, _services: ScriptServices): void {
    for (const brother of BROTHERS) {
        registry.registerLocInteraction(brother.tombId, ({ player, services }) => searchTomb(player, services, brother), "search");
        registry.registerNpcPreDeath(brother.npcId, (event) => {
            const player = event.killer;
            if (!player || event.npc.ownerPlayerId !== player.id) return NpcPreDeathDecision.Allow;
            const run = runs.get(player.id);
            if (!run || run.activeNpcId !== event.npc.id || run.activeBrother !== brother.key) return NpcPreDeathDecision.Allow;
            run.killed.add(brother.key);
            run.activeNpcId = undefined;
            run.activeBrother = undefined;
            event.services.messaging.sendGameMessage(player, `You have defeated ${brother.name}.`);
            return NpcPreDeathDecision.Allow;
        });
    }
    // Cache revisions label this chest differently, so accept both the normal
    // first action and the expected search wording.
    registry.registerLocInteraction(FINAL_CHEST_ID, ({ player, services }) => searchChest(player, services), "open");
    registry.registerLocInteraction(FINAL_CHEST_ID, ({ player, services }) => searchChest(player, services), "search");
    registry.registerLocInteraction(FINAL_CHEST_ID, ({ player, services }) => searchChest(player, services));
}
