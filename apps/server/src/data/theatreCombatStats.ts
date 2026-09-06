import type { NpcCombatStats } from "./npcCombatStats";

/** Normal-mode, five-player baseline. Verified 2026-09-05 against OSRS Wiki
 * boss infoboxes and its maintained DPS dataset:
 * https://raw.githubusercontent.com/weirdgloop/osrs-dps-calc/main/cdn/json/monsters.json
 * Verzik uses phase ONE, not the much higher later-phase defence/HP.
 * Special attack damage and phase-specific behaviour belong to encounter scripts.
 */
export const THEATRE_COMBAT_STATS: Readonly<Record<number, NpcCombatStats>> = {
    8360: {
        name: "The Maiden of Sugadinti", combatLevel: 940, hitpoints: 3500,
        attackLevel: 350, strengthLevel: 350, defenceLevel: 200, magicLevel: 350, rangedLevel: 350,
        attackSpeed: 10, attackType: "magic", maxHit: 36, aggressive: true,
        attackBonus: 0, strengthBonus: 0, magicBonus: 300, rangedBonus: 0,
        defenceBonuses: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
        immunities: ["poison", "venom"], isBoss: true,
    },
    8359: {
        name: "Pestilent Bloat", combatLevel: 870, hitpoints: 2000,
        attackLevel: 250, strengthLevel: 340, defenceLevel: 100, magicLevel: 150, rangedLevel: 180,
        attackSpeed: 1, attackType: "ranged", maxHit: 20, aggressive: true,
        attackBonus: 150, strengthBonus: 82, magicBonus: 0, rangedBonus: 180,
        defenceBonuses: { stab: 40, slash: 20, crush: 40, magic: 600, ranged: 800 },
        species: ["undead"], immunities: ["poison", "venom"], isBoss: true,
    },
    8355: {
        name: "Nylocas Vasilias", combatLevel: 800, hitpoints: 2500,
        attackLevel: 400, strengthLevel: 350, defenceLevel: 50, magicLevel: 50, rangedLevel: 350,
        attackSpeed: 4, attackType: "melee", attackStyle: "stab", maxHit: 70, aggressive: true,
        attackBonus: 0, strengthBonus: 60, magicBonus: 600, rangedBonus: 0,
        defenceBonuses: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
        immunities: ["poison", "venom"], isBoss: true,
    },
    8388: {
        name: "Sotetseg", combatLevel: 995, hitpoints: 4000,
        attackLevel: 250, strengthLevel: 250, defenceLevel: 200, magicLevel: 250, rangedLevel: 250,
        attackSpeed: 5, attackType: "melee", attackStyle: "crush", maxHit: 45, aggressive: true,
        attackBonus: 0, strengthBonus: 48, magicBonus: -10, rangedBonus: -10,
        defenceBonuses: { stab: 70, slash: 70, crush: 70, magic: 30, ranged: 150 },
        immunities: ["poison", "venom"], isBoss: true,
    },
    8340: {
        name: "Xarpus", combatLevel: 960, hitpoints: 5000,
        attackLevel: 1, strengthLevel: 1, defenceLevel: 250, magicLevel: 220, rangedLevel: 100,
        attackSpeed: 4, attackType: "ranged", maxHit: 11, aggressive: true,
        attackBonus: 0, strengthBonus: 0, magicBonus: 0, rangedBonus: 0,
        defenceBonuses: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 160 },
        immunities: ["poison", "venom"], isBoss: true,
    },
    8370: {
        name: "Verzik Vitur", combatLevel: 1040, hitpoints: 2000,
        attackLevel: 400, strengthLevel: 400, defenceLevel: 20, magicLevel: 400, rangedLevel: 400,
        attackSpeed: 14, attackType: "magic", maxHit: 137, aggressive: true,
        attackBonus: 0, strengthBonus: 0, magicBonus: 80, rangedBonus: 80,
        defenceBonuses: { stab: 20, slash: 20, crush: 20, magic: 20, ranged: 20 },
        immunities: ["poison", "venom"], isBoss: true,
    },
};

/** Normal ToB never scales below a trio. Use the saved roster, not online count. */
export function theatreHitpoints(base: number, partySize: number): number {
    const scale = partySize >= 5 ? 1 : partySize === 4 ? 0.875 : 0.75;
    return Math.max(1, Math.floor(base * scale));
}
