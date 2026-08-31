import type { PlayerState } from "@server/game/player";
import { SkillId } from "@august/osrs-engine/skill/skills";
import { CollisionFlag } from "@august/game-model/collision/CollisionFlag";
import { NpcAttackDecision, NpcPreDeathDecision, type IScriptRegistry, type NpcAttackEvent, type ScriptServices } from "@server/game/scripts/types";
import { openRewardDisplay } from "@server/content/gamemodes/vanilla/widgets/rewardDisplay";

/**
 * The Barrows run is deliberately player-owned rather than instance-owned.
 * The brothers themselves are temporary, owner-bound NPCs, so one player's
 * tomb search cannot complete another player's reward roll.
 */
const CRYPT_TILE = { x: 3551, y: 9691, level: 0 };
const EXIT_TILE = { x: 3565, y: 3307, level: 0 };
const FINAL_CHEST_ID = 20973;
const BARROWS_CHEST_COLLECTION_LOG_STRUCT_ID = 477;

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

function findSafeSpawnTile(player: PlayerState, services: ScriptServices): { x: number; y: number } | undefined {
    const pathService = services.movement.getPathService();
    const offsets = [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -2], [1, -2], [-2, -1], [2, -1], [-2, 1], [2, 1], [-1, 2], [1, 2]] as const;
    for (const [xOffset, yOffset] of offsets) {
        const x = player.tileX + xOffset;
        const y = player.tileY + yOffset;
        // A blocked tile is invariably scenery/wall geometry; never use it
        // for a summoned brother, even if an NPC can technically overlap it.
        const collision = pathService?.getCollisionFlagAt(x, y, player.level, player.worldViewId);
        if (collision !== undefined && (collision & (CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED)) !== 0) continue;
        const route = pathService?.findPathSteps(
            {
                from: { x: player.tileX, y: player.tileY, plane: player.level },
                to: { x, y },
                size: 1,
                worldViewId: player.worldViewId,
            },
            { maxSteps: 4 },
        );
        if (route && (!route.ok || route.end?.x !== x || route.end?.y !== y)) continue;
        return { x, y };
    }
    return undefined;
}

function spawnBrother(player: PlayerState, services: ScriptServices, brother: Brother): void {
    const run = runFor(player);
    if (run.activeNpcId !== undefined && services.combat.getNpc(run.activeNpcId)) {
        services.messaging.sendGameMessage(player, "You are already fighting a Barrows brother.");
        return;
    }
    const spawnTile = findSafeSpawnTile(player, services);
    if (!spawnTile) {
        services.messaging.sendGameMessage(player, "There is not enough space for the brother to appear here.");
        return;
    }
    const npc = services.npc.spawnNpc({
        id: brother.npcId,
        name: brother.name,
        x: spawnTile.x,
        y: spawnTile.y,
        level: player.level,
        worldViewId: player.worldViewId,
        ownerPlayerId: player.id,
        wanderRadius: 0,
        isAggressive: true,
        respawns: false,
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
    const rewards: Array<{ itemId: number; quantity: number }> = [];

    for (let roll = 0; roll < rolls; roll += 1) {
        const allEligible = killedBrothers.flatMap((brother) => brother.equipment).filter((itemId) => !awarded.has(itemId));
        // Prefer collection-log gaps; once every eligible piece is unlocked,
        // the regular Barrows duplicate behaviour resumes.
        const missingEligible = allEligible.filter((itemId) => !player.collectionLog.hasItem(itemId));
        const eligible = missingEligible.length > 0 ? missingEligible : allEligible;
        if (eligible.length > 0 && Math.random() < uniqueChance) {
            const itemId = random(eligible);
            awarded.add(itemId);
            addOrDrop(player, services, itemId, 1);
            rewards.push({ itemId, quantity: 1 });
        } else {
            const reward = nonUniqueReward(rolls);
            addOrDrop(player, services, reward.itemId, reward.quantity);
            const existing = rewards.find((entry) => entry.itemId === reward.itemId);
            if (existing) existing.quantity += reward.quantity;
            else rewards.push(reward);
        }
    }
    services.inventory.snapshotInventoryImmediate(player);
    for (const reward of rewards) services.collectionLog.trackCollectionLogItem(player, reward.itemId);
    player.collectionLog.incrementCategoryStat(BARROWS_CHEST_COLLECTION_LOG_STRUCT_ID);
    services.collectionLog.sendCollectionLogSnapshot(player);
    openRewardDisplay(player, services, "Barrows chest", rewards);
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

function finishChest(player: PlayerState, services: ScriptServices, run: BarrowsRun): void {
    rewardChest(player, services, run);
    runs.delete(player.id);
    services.movement.teleportPlayer(player, EXIT_TILE.x, EXIT_TILE.y, EXIT_TILE.level);
}

function searchChest(player: PlayerState, services: ScriptServices): void {
    const run = runFor(player);
    const tunnelBrother = brotherFor(run.tunnelBrother);
    if (!run.killed.has(tunnelBrother.key)) {
        spawnBrother(player, services, tunnelBrother);
        return;
    }
    if (run.killed.size >= BROTHERS.length) {
        finishChest(player, services, run);
        return;
    }
    services.dialog.openDialogOptions(player, {
        id: "barrows-chest-choice",
        title: "The chest awaits.",
        options: ["Loot the chest", "Summon another brother", "Leave the chest"],
        modal: true,
        onSelect: (choice) => {
            if (choice === 0) {
                finishChest(player, services, run);
                return;
            }
            if (choice === 1) {
                const remaining = BROTHERS.filter((brother) => !run.killed.has(brother.key));
                const candidate = remaining.filter((brother) => brother.key !== run.tunnelBrother);
                spawnBrother(player, services, random(candidate.length > 0 ? candidate : remaining));
            }
        },
    });
}

function scheduleSuccessfulHitEffect(
    event: NpcAttackEvent,
    effect: (damage: number) => void,
): void {
    const hpBefore = event.target.skillSystem.getHitpointsCurrent();
    event.services.scheduler.after(2, () => {
        const damage = Math.max(0, hpBefore - event.target.skillSystem.getHitpointsCurrent());
        if (damage > 0) effect(damage);
    }, { kind: "player", id: event.target.id });
}

/** Barrows' armour effects apply on one in four successful attacks. */
function barrowsSpecialAttack(event: NpcAttackEvent, brother: Brother): NpcAttackDecision | void {
    if (event.npc.ownerPlayerId !== event.target.id || Math.random() >= 0.25) return;
    switch (brother.key) {
        case "ahrim":
            scheduleSuccessfulHitEffect(event, () => {
                const strength = event.target.skillSystem.getSkill(SkillId.Strength);
                const current = Math.max(0, Math.floor(strength.baseLevel + strength.boost));
                event.target.skillSystem.setSkillBoost(SkillId.Strength, Math.max(0, current - 5));
                event.services.messaging.sendGameMessage(event.target, "Ahrim's magic weakens your strength.");
            });
            return;
        case "guthan":
            scheduleSuccessfulHitEffect(event, (damage) => {
                event.npc.heal(damage);
            });
            return;
        case "karil":
            scheduleSuccessfulHitEffect(event, () => {
                const agility = event.target.skillSystem.getSkill(SkillId.Agility);
                const current = Math.max(0, Math.floor(agility.baseLevel + agility.boost));
                event.target.skillSystem.setSkillBoost(SkillId.Agility, Math.max(0, current - Math.floor(current * 0.2)));
                event.services.messaging.sendGameMessage(event.target, "Karil's attack drains your agility.");
            });
            return;
        case "torag":
            scheduleSuccessfulHitEffect(event, () => {
                event.target.energy.adjustRunEnergyPercent(-20);
                event.services.messaging.sendGameMessage(event.target, "Torag's attack drains your run energy.");
            });
            return;
        case "verac":
            // Verac's special ignores armour and Protect from Melee. This is
            // deliberately resolved as a direct hit; normal attacks retain
            // the canonical accuracy and prayer calculation.
            event.services.npc.queueNpcSeq(event.npc, 2062);
            event.services.scheduler.after(1, () => {
                if (event.npc.getHitpoints() <= 0) return;
                event.services.combat.applyNpcDamageToPlayer(event.npc, event.target, 0, Math.floor(Math.random() * 26), event.tick + 1);
            }, { kind: "player", id: event.target.id });
            return NpcAttackDecision.Prevent;
        default:
            return;
    }
}

function dharokAttack(event: NpcAttackEvent): NpcAttackDecision {
    if (event.npc.ownerPlayerId !== event.target.id) return NpcAttackDecision.Allow;
    const missingHp = event.npc.getMaxHitpoints() - event.npc.getHitpoints();
    const maxHit = Math.min(57, Math.floor(29 * (1 + missingHp / event.npc.getMaxHitpoints())));
    event.services.npc.queueNpcSeq(event.npc, 2067);
    event.services.scheduler.after(1, () => {
        if (event.npc.getHitpoints() <= 0) return;
        const protectedFromMelee = event.target.prayer.activePrayers.has("protect_from_melee");
        event.services.combat.applyNpcDamageToPlayer(event.npc, event.target, 0, protectedFromMelee ? 0 : Math.floor(Math.random() * (maxHit + 1)), event.tick + 1);
    }, { kind: "player", id: event.target.id });
    return NpcAttackDecision.Prevent;
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
        if (brother.key === "dharok") registry.registerNpcAttack(brother.npcId, dharokAttack);
        else registry.registerNpcAttack(brother.npcId, (event) => barrowsSpecialAttack(event, brother));
    }
    // Cache revisions label this chest differently, so accept both the normal
    // first action and the expected search wording.
    registry.registerLocInteraction(FINAL_CHEST_ID, ({ player, services }) => searchChest(player, services), "open");
    registry.registerLocInteraction(FINAL_CHEST_ID, ({ player, services }) => searchChest(player, services), "search");
    registry.registerLocInteraction(FINAL_CHEST_ID, ({ player, services }) => searchChest(player, services));
}
