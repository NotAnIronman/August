import type { NpcCombatStats } from "./npcCombatStats";
// First combat forms only; phase-specific profiles belong to the mechanics pass.
// https://oldschool.runescape.wiki/w/Dawn
// https://oldschool.runescape.wiki/w/Dusk
// https://oldschool.runescape.wiki/w/Shellbane_gryphon
export const GUARDIANS_GRYPHON_COMBAT_STATS: Readonly<Record<number, NpcCombatStats>> = {
    7852: { name: "Dawn", combatLevel: 228, hitpoints: 450, attackLevel: 140,
        strengthLevel: 140, defenceLevel: 100, magicLevel: 100, rangedLevel: 140,
        attackSpeed: 6, attackType: "ranged", maxHit: 15, aggressive: true,
        defenceBonuses: { stab: 0, slash: 0, crush: 0, magic: 80, ranged: 0 },
        immunities: ["poison", "venom"], species: ["golem"], isBoss: true },
    7882: { name: "Dusk", combatLevel: 248, hitpoints: 450, attackLevel: 200,
        strengthLevel: 140, defenceLevel: 100, magicLevel: 140, rangedLevel: 140,
        attackSpeed: 6, attackType: "melee", attackStyle: "slash", maxHit: 15, aggressive: true,
        defenceBonuses: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
        immunities: ["poison", "venom"], species: ["golem"], isBoss: true },
    14860: { name: "Shellbane gryphon", combatLevel: 235, hitpoints: 400, attackLevel: 160,
        strengthLevel: 210, defenceLevel: 120, magicLevel: 100, rangedLevel: 150,
        attackSpeed: 5, attackType: "melee", maxHit: 22, aggressive: true, rangedBonus: 20,
        defenceBonuses: { stab: 10, slash: 20, crush: 40, magic: 100, ranged: 60 },
        immunities: ["poison", "venom"], isBoss: true },
};
